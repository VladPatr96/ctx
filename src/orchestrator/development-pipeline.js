/**
 * Development Pipeline — orchestrator for parallel agent execution,
 * sequential merge with tests, and conflict resolution.
 *
 * 7 phases: INIT → EXECUTE → SORT → MERGE → VERIFY → FINALIZE → CLEANUP
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runParallel } from './agent-runner.js';
import { mergeWorktree, removeWorktree, getWorktree, getPluginRoot } from './worktree-manager.js';
import { runTests } from './run-tests.js';
import { resolveConflicts } from './conflict-resolver.js';
import { runCommand } from '../core/utils/shell.js';
import { readJsonFile, writeJsonAtomic, withLockSync } from '../core/utils/state-io.js';
import { createStepRecord, transitionStep } from '../runtime/step-state-machine.js';
import { createTaskRecord, transitionTask } from '../runtime/task-state-machine.js';
import { withPipelineArtifactBundle } from '../contracts/runtime-schemas.js';
import { resolveBaseBranch } from './base-branch.js';

const PIPELINES_DIR = '.data/pipelines';
const PIPELINES_LOCK = '.data/.pipelines.lock';

// ─── State persistence ───

function pipelinesDir() {
  return join(getPluginRoot(), PIPELINES_DIR);
}

function pipelinePath(id) {
  return join(pipelinesDir(), `${id}.json`);
}

function lockPath() {
  return join(getPluginRoot(), PIPELINES_LOCK);
}

function saveState(id, state) {
  withLockSync(lockPath(), () => writeJsonAtomic(pipelinePath(id), state));
}

function loadState(id) {
  return readJsonFile(pipelinePath(id), null);
}

// ─── Helpers ───

function generateId() {
  return `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emit(onProgress, event) {
  if (typeof onProgress === 'function') {
    try { onProgress(event); } catch { /* ignore callback errors */ }
  }
}

async function gitInRepo(args, cwd) {
  return runCommand('git', args, { cwd, shell: false });
}

/**
 * Compute changed file set for a worktree agent relative to base.
 */
async function getChangedFiles(agentId, cwd) {
  const wt = await getWorktree(agentId);
  const result = await runCommand('git', ['diff', '--stat', '--name-only', `${wt.baseBranch}...HEAD`], { cwd: wt.path });
  if (!result.success) return [];
  return result.stdout.trim().split('\n').filter(Boolean);
}

/**
 * Risk-aware sorting: least overlap first, then by priority.
 */
function sortByRisk(agentFiles, specs) {
  const priorityMap = {};
  for (const s of specs) priorityMap[s.agentId] = s.priority ?? 99;

  const entries = Object.entries(agentFiles);
  const merged = new Set();

  // Sort: fewest overlapping files with already-merged set, then by priority
  const sorted = [];
  const remaining = [...entries];

  while (remaining.length > 0) {
    // Score each by overlap with merged set
    remaining.sort((a, b) => {
      const overlapA = a[1].filter(f => merged.has(f)).length;
      const overlapB = b[1].filter(f => merged.has(f)).length;
      if (overlapA !== overlapB) return overlapA - overlapB;
      return (priorityMap[a[0]] ?? 99) - (priorityMap[b[0]] ?? 99);
    });

    const [agentId, files] = remaining.shift();
    sorted.push(agentId);
    for (const f of files) merged.add(f);
  }

  return sorted;
}

// ─── Pipeline factory ───

/**
 * Create a development pipeline instance with optional dependency injection.
 * @param {object} [deps] — override dependencies for testing
 * @returns {{ run: Function, getStatus: Function }}
 */
export function createDevelopmentPipeline(deps = {}) {
  const {
    runParallelFn = runParallel,
    mergeWorktreeFn = mergeWorktree,
    removeWorktreeFn = removeWorktree,
    runTestsFn = runTests,
    resolveConflictsFn = resolveConflicts,
    gitFn = gitInRepo,
    getChangedFilesFn = getChangedFiles,
  } = deps;

  async function run(specs, opts = {}) {
    const {
      baseBranch,
      testCommand,
      testTimeout = 120_000,
      stopOnTestFail = false,
      conflictResolution = true,
      conflictProvider = 'claude',
      conflictRetries = 2,
      onProgress,
      invokeFn,
    } = opts;

    const cwd = getPluginRoot();
    const resolvedBaseBranch = await resolveBaseBranch(baseBranch, {
      cwd,
      runCommandFn: async (_command, args, commandOptions = {}) =>
        gitFn(args, commandOptions.cwd || cwd),
    });
    const pipelineId = generateId();
    const integrationBranch = `int/${pipelineId}`;
    const startedAt = new Date().toISOString();

    const report = {
      pipelineId,
      status: 'running',
      startedAt,
      completedAt: null,
      durationMs: 0,
      integrationBranch,
      task: createTaskRecord({
        taskId: pipelineId,
        taskType: 'development_pipeline',
        metadata: {
          baseBranch: resolvedBaseBranch,
          integrationBranch,
          totalAgents: specs.length,
        },
      }),
      phases: { execute: null, merges: [], verify: null },
      steps: {
        execute_agents: createStepRecord({
          stepId: 'execute_agents',
          stepType: 'agent_execution',
          metadata: { totalAgents: specs.length },
        }),
        sort_merges: createStepRecord({
          stepId: 'sort_merges',
          stepType: 'merge_sort',
          metadata: {},
        }),
        verify_integration: createStepRecord({
          stepId: 'verify_integration',
          stepType: 'verification',
          metadata: {},
        }),
        finalize_integration: createStepRecord({
          stepId: 'finalize_integration',
          stepType: 'finalization',
          metadata: {},
        }),
      },
      agents: {},
      summary: { total: specs.length, executed: 0, merged: 0, skipped: 0, failed: 0, testsPassed: false },
    };

    const finish = (status) => {
      if (report.task.status === 'pending') {
        report.task = transitionTask(report.task, 'start', { note: 'Development pipeline started' });
      }

      if (status === 'success') {
        if (report.task.status === 'running' || report.task.status === 'suspended') {
          report.task = transitionTask(report.task, 'complete', { note: 'Development pipeline completed' });
        }
      } else if (report.task.status === 'running' || report.task.status === 'suspended') {
        report.task = transitionTask(report.task, 'fail', {
          failureKind: 'fatal',
          error: report.error || `Pipeline finished with status ${status}`,
        });
      }

      report.status = status;
      report.completedAt = new Date().toISOString();
      report.durationMs = Date.now() - new Date(startedAt).getTime();
      saveState(pipelineId, report);
      return withPipelineArtifactBundle(report, { reportPath: pipelinePath(pipelineId) });
    };

    const step = (stepId, event, data = {}) => {
      report.steps[stepId] = transitionStep(report.steps[stepId], event, data);
      saveState(pipelineId, report);
      return report.steps[stepId];
    };

    const task = (event, data = {}) => {
      report.task = transitionTask(report.task, event, data);
      saveState(pipelineId, report);
      return report.task;
    };

    const ensureStep = (stepId, stepType, metadata = {}, maxAttempts = 1) => {
      if (!report.steps[stepId]) {
        report.steps[stepId] = createStepRecord({ stepId, stepType, metadata, maxAttempts });
      }
      return report.steps[stepId];
    };

    try {
      saveState(pipelineId, report);
      task('start', { note: 'Development pipeline started' });

      // ─── Phase 1: INIT ───
      emit(onProgress, { phase: 'INIT', pipelineId, integrationBranch });

      await gitFn(['checkout', resolvedBaseBranch], cwd);
      const branchResult = await gitFn(['checkout', '-b', integrationBranch], cwd);
      if (!branchResult.success) {
        report.error = `Failed to create integration branch: ${branchResult.error || branchResult.stderr}`;
        return finish('failed');
      }

      // ─── Phase 2: EXECUTE ───
      emit(onProgress, { phase: 'EXECUTE', total: specs.length });
      step('execute_agents', 'start', { note: 'Agent execution started' });

      const execResult = await runParallelFn(specs, {
        baseBranch: integrationBranch,
        cleanup: false,
        invokeFn,
      });

      report.phases.execute = {
        status: execResult.status,
        durationMs: execResult.durationMs,
        summary: execResult.summary,
      };

      for (const r of execResult.results) {
        report.agents[r.agentId] = { execution: { status: r.status, durationMs: r.durationMs } };
      }

      const successAgents = execResult.results
        .filter(r => r.status === 'completed' || r.status === 'success')
        .map(r => r.agentId);
      report.summary.executed = successAgents.length;

      if (successAgents.length === 0) {
        step('execute_agents', 'fail', {
          failureKind: 'fatal',
          error: 'No agents completed successfully',
        });
        report.error = 'No agents completed successfully';
        return finish('failed');
      }
      step('execute_agents', 'complete', { note: `${successAgents.length} agents completed successfully` });

      emit(onProgress, { phase: 'EXECUTE_DONE', executed: successAgents.length, total: specs.length });

      // ─── Phase 3: SORT ───
      emit(onProgress, { phase: 'SORT' });
      step('sort_merges', 'start', { note: 'Computing merge order' });

      const agentFiles = {};
      for (const agentId of successAgents) {
        agentFiles[agentId] = await getChangedFilesFn(agentId, cwd);
      }

      const mergeOrder = sortByRisk(agentFiles, specs);
      step('sort_merges', 'complete', { note: `Merge order computed for ${mergeOrder.length} agents` });

      // ─── Phase 4: MERGE ───
      emit(onProgress, { phase: 'MERGE', order: mergeOrder });

      // Ensure we're on integration branch
      await gitFn(['checkout', integrationBranch], cwd);

      for (const agentId of mergeOrder) {
        const agentReport = report.agents[agentId] || {};
        const mergeStepId = `merge:${agentId}`;
        ensureStep(mergeStepId, 'merge_agent', { agentId }, conflictResolution ? conflictRetries + 1 : 1);
        emit(onProgress, { phase: 'MERGE_AGENT', agentId });
        step(mergeStepId, 'start', { note: `Merging ${agentId}` });

        const mergeResult = await mergeWorktreeFn(agentId, { message: `pipeline: merge ${agentId}` });
        agentReport.merge = { success: mergeResult.success, conflicts: mergeResult.conflicts, mergedCommits: mergeResult.mergedCommits };

        if (!mergeResult.success && mergeResult.conflicts) {
          step(mergeStepId, 'suspend', { note: 'Merge conflicts detected' });
          // Attempt AI conflict resolution
          if (conflictResolution) {
            emit(onProgress, { phase: 'CONFLICT_RESOLVE', agentId });
            const crResult = await resolveConflictsFn({
              cwd,
              provider: conflictProvider,
              retries: conflictRetries,
              invokeFn,
            });
            agentReport.conflictResolution = crResult;

            if (crResult.success) {
              step(mergeStepId, 'resume', { note: 'Conflicts resolved, merge resumed' });
              mergeResult.success = true;
              mergeResult.conflicts = false;
              agentReport.merge.success = true;
              agentReport.merge.conflicts = false;
            } else {
              step(mergeStepId, 'fail', {
                failureKind: 'retryable',
                error: crResult.error || 'Conflict resolution failed',
              });
            }
          } else {
            step(mergeStepId, 'fail', {
              failureKind: 'retryable',
              error: 'Merge conflicts detected',
            });
          }
        }

        if (mergeResult.success) {
          // Run tests after merge
          const testResult = await runTestsFn(testCommand, { cwd, timeout: testTimeout });
          agentReport.tests = testResult;

          if (!testResult.success && !testResult.skipped) {
            emit(onProgress, { phase: 'TEST_FAIL', agentId });

            // Revert the merge
            await gitFn(['revert', 'HEAD', '--no-edit'], cwd);
            agentReport.merge.reverted = true;
            report.summary.skipped++;
            step(mergeStepId, 'fail', {
              failureKind: 'fatal',
              error: 'Post-merge tests failed',
            });

            if (stopOnTestFail) {
              report.error = `Tests failed after merging ${agentId}, pipeline stopped`;
              await cleanupWorktrees(mergeOrder, removeWorktreeFn);
              return finish('failed');
            }
          } else {
            report.summary.merged++;
            step(mergeStepId, 'complete', { note: 'Merged and validated' });
          }
        } else {
          report.summary.skipped++;
          if (report.steps[mergeStepId].status === 'running') {
            step(mergeStepId, 'fail', {
              failureKind: 'fatal',
              error: mergeResult.error || 'Merge failed',
            });
          }
          emit(onProgress, { phase: 'MERGE_SKIP', agentId });
          // Abort any in-progress merge
          await gitFn(['merge', '--abort'], cwd).catch(() => {});
        }

        report.agents[agentId] = agentReport;
        report.phases.merges.push({ agentId, ...agentReport.merge });

        // Remove worktree after merge/skip
        await removeWorktreeFn(agentId, { force: true }).catch(() => {});
      }

      // ─── Phase 5: VERIFY ───
      emit(onProgress, { phase: 'VERIFY' });
      step('verify_integration', 'start', { note: 'Running integration verification' });

      const verifyResult = await runTestsFn(testCommand, { cwd, timeout: testTimeout });
      report.phases.verify = verifyResult;
      report.summary.testsPassed = verifyResult.success || verifyResult.skipped;

      if (!verifyResult.success && !verifyResult.skipped) {
        step('verify_integration', 'fail', {
          failureKind: 'fatal',
          error: 'Integration tests failed',
        });
        report.error = 'Integration tests failed';
        return finish('failed');
      }
      step('verify_integration', 'complete', { note: 'Integration verification passed' });

      // ─── Phase 6: FINALIZE ───
      emit(onProgress, { phase: 'FINALIZE' });
      step('finalize_integration', 'start', { note: 'Finalizing integration branch' });

      await gitFn(['checkout', resolvedBaseBranch], cwd);
      const ffResult = await gitFn(['merge', '--ff-only', integrationBranch], cwd);

      if (!ffResult.success) {
        step('finalize_integration', 'fail', {
          failureKind: 'fatal',
          error: `Fast-forward merge failed: ${ffResult.error || ffResult.stderr}`,
        });
        report.error = `Fast-forward merge failed: ${ffResult.error || ffResult.stderr}`;
        return finish('failed');
      }
      step('finalize_integration', 'complete', { note: 'Base branch updated' });

      // ─── Phase 7: CLEANUP ───
      emit(onProgress, { phase: 'CLEANUP' });

      await gitFn(['branch', '-d', integrationBranch], cwd).catch(() => {});

      return finish('success');

    } catch (err) {
      report.error = err.message;
      return finish('error');
    }
  }

  function getStatus(pipelineId) {
    if (pipelineId) {
      return withPipelineArtifactBundle(loadState(pipelineId), { reportPath: pipelinePath(pipelineId) });
    }

    // List all pipelines
    try {
      const dir = pipelinesDir();
      const files = readdirSync(dir).filter(f => f.endsWith('.json'));
      return files
        .map((fileName) => {
          const reportPath = join(dir, fileName);
          return withPipelineArtifactBundle(readJsonFile(reportPath, null), { reportPath });
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  return { run, getStatus };
}

async function cleanupWorktrees(agentIds, removeWorktreeFn) {
  for (const id of agentIds) {
    await removeWorktreeFn(id, { force: true }).catch(() => {});
  }
}

// ─── Convenience wrapper ───

/**
 * Run a development pipeline (convenience function).
 * @param {Array<{agentId: string, task: string, provider: string, priority?: number}>} specs
 * @param {object} opts
 * @returns {Promise<object>} PipelineReport
 */
export async function runDevelopmentPipeline(specs, opts = {}) {
  const pipeline = createDevelopmentPipeline(opts.deps);
  return pipeline.run(specs, opts);
}
