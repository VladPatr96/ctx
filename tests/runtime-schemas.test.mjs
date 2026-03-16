import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ArtifactBundleSchema,
  RoutingDecisionSchema,
  StepRecordSchema,
  TaskRecordSchema,
  createPipelineArtifactBundle,
  createExecutionArtifactBundle,
  createRoutingDecisionLogRecord,
  parseStepRecord,
  parseTaskRecord,
} from '../src/contracts/runtime-schemas.js';

async function loadRouterWithEnv(dataDir) {
  const id = Date.now() + Math.random();
  process.env.CTX_DATA_DIR = dataDir;
  process.env.CTX_ADAPTIVE_ROUTING = '0';
  return import(`../scripts/providers/router.js?v=${id}`);
}

test('RoutingDecisionSchema accepts canonical runtime decision', () => {
  const result = RoutingDecisionSchema.parse({
    provider: 'claude',
    strength: 'planning',
    reason: 'Best provider for planning',
    confidence: 0.9,
  });

  assert.equal(result.provider, 'claude');
  assert.equal(result.strength, 'planning');
});

test('RoutingDecisionSchema rejects invalid confidence', () => {
  assert.throws(() => RoutingDecisionSchema.parse({
    provider: 'claude',
    strength: 'planning',
    reason: 'invalid',
    confidence: 1.5,
  }), /Number must be less than or equal to 1/);
});

test('createRoutingDecisionLogRecord normalizes routing telemetry', () => {
  const record = createRoutingDecisionLogRecord({
    task: 'x'.repeat(200),
    taskType: 'planning',
    selectedProvider: 'claude',
    runnerUp: 'gemini',
    finalScore: 0.9,
    runnerUpScore: 0.7,
    staticComponent: 0.5,
    evalComponent: 0.3,
    feedbackComponent: 0.05,
    exploreComponent: 0.1,
    alpha: 0.2,
    staticBest: 'gemini',
    routingMode: 'adaptive',
  });

  assert.equal(record.task_snippet.length, 120);
  assert.ok(Math.abs(record.delta - 0.2) < 1e-10);
  assert.equal(record.is_diverged, 1);
  assert.equal(record.feedback_component, 0.05);
});

test('ArtifactBundleSchema accepts execution artifact bundle', () => {
  const bundle = createExecutionArtifactBundle({
    agentId: 'architect',
    provider: 'claude',
    status: 'completed',
    response: 'Done',
    branchName: 'agent/architect',
    worktreePath: '/tmp/worktree',
    startedAt: new Date('2026-03-10T10:00:00.000Z').toISOString(),
    completedAt: new Date('2026-03-10T10:00:01.000Z').toISOString(),
    durationMs: 1000,
  });

  assert.equal(bundle.status, 'completed');
  assert.equal(bundle.artifacts.length, 3);
});

test('ArtifactBundleSchema rejects empty artifact records', () => {
  assert.throws(() => ArtifactBundleSchema.parse({
    version: 1,
    status: 'completed',
    summary: 'bad bundle',
    artifacts: [
      { kind: 'file', label: 'empty-artifact' },
    ],
    metadata: {},
    timings: {},
  }), /Artifact record requires path, content, or metadata/);
});

test('StepRecordSchema accepts canonical step record', () => {
  const record = parseStepRecord({
    stepId: 'merge:agent-a',
    stepType: 'merge_agent',
    status: 'running',
    attempt: 1,
    maxAttempts: 2,
    createdAt: new Date('2026-03-10T10:00:00.000Z').toISOString(),
    startedAt: new Date('2026-03-10T10:00:01.000Z').toISOString(),
    failureKind: null,
    lastError: null,
    metadata: { agentId: 'agent-a' },
    transitions: [],
  });

  assert.equal(record.stepId, 'merge:agent-a');
  assert.equal(record.stepType, 'merge_agent');
});

test('TaskRecordSchema accepts canonical task record', () => {
  const record = parseTaskRecord({
    taskId: 'pipeline-main',
    taskType: 'development_pipeline',
    status: 'pending',
    attempt: 0,
    maxAttempts: 1,
    createdAt: new Date('2026-03-10T10:00:00.000Z').toISOString(),
    failureKind: null,
    lastError: null,
    metadata: { totalAgents: 2 },
    transitions: [],
  });

  assert.equal(record.taskId, 'pipeline-main');
  assert.equal(record.taskType, 'development_pipeline');
});

test('StepRecordSchema rejects invalid runtime record id', () => {
  assert.throws(() => StepRecordSchema.parse({
    stepId: '../bad',
    stepType: 'merge_agent',
    status: 'pending',
    attempt: 0,
    maxAttempts: 1,
    createdAt: new Date('2026-03-10T10:00:00.000Z').toISOString(),
    failureKind: null,
    lastError: null,
    metadata: {},
    transitions: [],
  }), /Invalid runtime record id/);
});

test('TaskRecordSchema rejects invalid status', () => {
  assert.throws(() => TaskRecordSchema.parse({
    taskId: 'pipeline-main',
    taskType: 'development_pipeline',
    status: 'timeout',
    attempt: 0,
    maxAttempts: 1,
    createdAt: new Date('2026-03-10T10:00:00.000Z').toISOString(),
    failureKind: null,
    lastError: null,
    metadata: {},
    transitions: [],
  }), /Invalid enum value/);
});

test('createPipelineArtifactBundle normalizes pipeline report traceability', () => {
  const bundle = createPipelineArtifactBundle({
    pipelineId: 'pipeline-123',
    status: 'success',
    integrationBranch: 'int/pipeline-123',
    task: { status: 'completed' },
    summary: { executed: 2, merged: 2, testsPassed: true },
    startedAt: new Date('2026-03-10T10:00:00.000Z').toISOString(),
    completedAt: new Date('2026-03-10T10:00:03.000Z').toISOString(),
    durationMs: 3000,
    phases: {
      verify: { output: 'all good' },
    },
  }, {
    reportPath: '/tmp/pipelines/pipeline-123.json',
  });

  assert.equal(bundle.status, 'completed');
  assert.ok(bundle.artifacts.some((artifact) => artifact.label === 'pipeline-report'));
  assert.ok(bundle.artifacts.some((artifact) => artifact.label === 'integration-branch'));
  assert.ok(bundle.artifacts.some((artifact) => artifact.label === 'verification-output'));
});

test('route returns a decision that satisfies RoutingDecisionSchema', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-contract-router-'));
  const originalDataDir = process.env.CTX_DATA_DIR;
  const originalAdaptive = process.env.CTX_ADAPTIVE_ROUTING;

  try {
    const { route } = await loadRouterWithEnv(dataDir);
    const decision = route('спланируй архитектуру и workflow');

    assert.equal(decision.provider, 'claude');
    assert.equal(decision.mode, 'cli');
    assert.doesNotThrow(() => RoutingDecisionSchema.parse(decision));
  } finally {
    if (originalDataDir === undefined) delete process.env.CTX_DATA_DIR;
    else process.env.CTX_DATA_DIR = originalDataDir;
    if (originalAdaptive === undefined) delete process.env.CTX_ADAPTIVE_ROUTING;
    else process.env.CTX_ADAPTIVE_ROUTING = originalAdaptive;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
