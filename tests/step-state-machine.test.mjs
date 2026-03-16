import test from 'node:test';
import assert from 'node:assert/strict';
import { createStepRecord, transitionStep } from '../src/runtime/step-state-machine.js';

test('step state machine supports retryable failure lifecycle', () => {
  let step = createStepRecord({
    stepId: 'merge:agent-a',
    stepType: 'merge_agent',
    maxAttempts: 2,
    metadata: { agentId: 'agent-a' },
  });

  step = transitionStep(step, 'start');
  step = transitionStep(step, 'fail', {
    failureKind: 'retryable',
    error: 'merge conflict',
  });
  step = transitionStep(step, 'retry');
  step = transitionStep(step, 'start');
  step = transitionStep(step, 'complete');

  assert.equal(step.status, 'completed');
  assert.equal(step.attempt, 2);
  assert.equal(step.failureKind, null);
  assert.equal(step.transitions.length, 5);
});

test('step state machine blocks retry after fatal failure', () => {
  let step = createStepRecord({
    stepId: 'verify_integration',
    stepType: 'verification',
  });

  step = transitionStep(step, 'start');
  step = transitionStep(step, 'fail', {
    failureKind: 'fatal',
    error: 'tests failed',
  });

  assert.throws(() => transitionStep(step, 'retry'), /Only retryable failures can transition via retry/);
});

test('step state machine supports suspend and resume', () => {
  let step = createStepRecord({
    stepId: 'merge:agent-b',
    stepType: 'merge_agent',
  });

  step = transitionStep(step, 'start');
  step = transitionStep(step, 'suspend', { note: 'waiting for conflict resolution' });
  step = transitionStep(step, 'resume');
  step = transitionStep(step, 'complete');

  assert.equal(step.status, 'completed');
  assert.ok(step.transitions.some(t => t.event === 'suspend'));
  assert.ok(step.transitions.some(t => t.event === 'resume'));
});

test('step state machine rejects invalid transitions', () => {
  const step = createStepRecord({
    stepId: 'execute_agents',
    stepType: 'agent_execution',
  });

  assert.throws(() => transitionStep(step, 'complete'), /Invalid transition: pending -> complete/);
});
