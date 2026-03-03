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
import { runTests } from './test-runner.js';
import { resolveConflicts } from './conflict-resolver.js';
import { runCommand } from '../utils/shell.js';
import { readJsonFile, writeJsonAtomic, withLockSync } from '../utils/state-io.js';

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
    getWorktreeFn = getWorktree,
    runTestsFn = runTests,
    resolveConflictsFn = resolveConflicts,
    gitFn = gitInRepo,
  } = deps;

  async function run(specs, opts = {}) {
    const {
      baseBranch = 'master',
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
      phases: { execute: null, merges: [], verify: null },
      agents: {},
      summary: { total: specs.length, executed: 0, merged: 0, skipped: 0, failed: 0, testsPassed: false },
    };

    const finish = (status) => {
      report.status = status;
      report.completedAt = new Date().toISOString();
      report.durationMs = Date.now() - new Date(startedAt).getTime();
      saveState(pipelineId, report);
      return report;
    };

    try {
      saveState(pipelineId, report);

      // ─── Phase 1: INIT ───
      emit(onProgress, { phase: 'INIT', pipelineId, integrationBranch });

      await gitFn(['checkout', baseBranch], cwd);
      const branchResult = await gitFn(['checkout', '-b', integrationBranch], cwd);
      if (!branchResult.success) {
        report.error = `Failed to create integration branch: ${branchResult.error || branchResult.stderr}`;
        return finish('failed');
      }

      // ─── Phase 2: EXECUTE ───
      emit(onProgress, { phase: 'EXECUTE', total: specs.length });

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

      const successAgents = execResult.results.filter(r => r.status === 'success').map(r => r.agentId);
      report.summary.executed = successAgents.length;

      if (successAgents.length === 0) {
        report.error = 'No agents completed successfully';
        return finish('failed');
      }

      emit(onProgress, { phase: 'EXECUTE_DONE', executed: successAgents.length, total: specs.length });

      // ─── Phase 3: SORT ───
      emit(onProgress, { phase: 'SORT' });

      const agentFiles = {};
      for (const agentId of successAgents) {
        agentFiles[agentId] = await getChangedFiles(agentId, cwd);
      }

      const mergeOrder = sortByRisk(agentFiles, specs);

      // ─── Phase 4: MERGE ───
      emit(onProgress, { phase: 'MERGE', order: mergeOrder });

      // Ensure we're on integration branch
      await gitFn(['checkout', integrationBranch], cwd);

      for (const agentId of mergeOrder) {
        const agentReport = report.agents[agentId] || {};
        emit(onProgress, { phase: 'MERGE_AGENT', agentId });

        const mergeResult = await mergeWorktreeFn(agentId, { message: `pipeline: merge ${agentId}` });
        agentReport.merge = { success: mergeResult.success, conflicts: mergeResult.conflicts, mergedCommits: mergeResult.mergedCommits };

        if (!mergeResult.success && mergeResult.conflicts) {
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
              mergeResult.success = true;
              mergeResult.conflicts = false;
              agentReport.merge.success = true;
              agentReport.merge.conflicts = false;
            }
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

            if (stopOnTestFail) {
              report.error = `Tests failed after merging ${agentId}, pipeline stopped`;
              await cleanupWorktrees(mergeOrder, removeWorktreeFn);
              return finish('failed');
            }
          } else {
            report.summary.merged++;
          }
        } else {
          report.summary.skipped++;
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

      const verifyResult = await runTestsFn(testCommand, { cwd, timeout: testTimeout });
      report.phases.verify = verifyResult;
      report.summary.testsPassed = verifyResult.success || verifyResult.skipped;

      if (!verifyResult.success && !verifyResult.skipped) {
        report.error = 'Integration tests failed';
        return finish('failed');
      }

      // ─── Phase 6: FINALIZE ───
      emit(onProgress, { phase: 'FINALIZE' });

      await gitFn(['checkout', baseBranch], cwd);
      const ffResult = await gitFn(['merge', '--ff-only', integrationBranch], cwd);

      if (!ffResult.success) {
        report.error = `Fast-forward merge failed: ${ffResult.error || ffResult.stderr}`;
        return finish('failed');
      }

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
    if (pipelineId) return loadState(pipelineId);

    // List all pipelines
    try {
      const dir = pipelinesDir();
      const files = readdirSync(dir).filter(f => f.endsWith('.json'));
      return files.map(f => readJsonFile(join(dir, f), null)).filter(Boolean);
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
