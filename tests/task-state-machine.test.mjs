import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskRecord, transitionTask } from '../src/runtime/task-state-machine.js';

test('task state machine supports retryable failure lifecycle', () => {
  let task = createTaskRecord({
    taskId: 'pipeline-main',
    taskType: 'development_pipeline',
    maxAttempts: 2,
    metadata: { totalAgents: 2 },
  });

  task = transitionTask(task, 'start');
  task = transitionTask(task, 'fail', {
    failureKind: 'retryable',
    error: 'temporary infra failure',
  });
  task = transitionTask(task, 'retry');
  task = transitionTask(task, 'start');
  task = transitionTask(task, 'complete');

  assert.equal(task.status, 'completed');
  assert.equal(task.attempt, 2);
  assert.equal(task.failureKind, null);
  assert.equal(task.transitions.length, 5);
});

test('task state machine supports suspend and resume', () => {
  let task = createTaskRecord({
    taskId: 'pipeline-review',
    taskType: 'development_pipeline',
  });

  task = transitionTask(task, 'start');
  task = transitionTask(task, 'suspend', { note: 'waiting for manual review' });
  task = transitionTask(task, 'resume');
  task = transitionTask(task, 'complete');

  assert.equal(task.status, 'completed');
  assert.ok(task.transitions.some((transition) => transition.event === 'suspend'));
  assert.ok(task.transitions.some((transition) => transition.event === 'resume'));
});

test('task state machine supports cancellation from running state', () => {
  let task = createTaskRecord({
    taskId: 'pipeline-cancel',
    taskType: 'development_pipeline',
  });

  task = transitionTask(task, 'start');
  task = transitionTask(task, 'cancel', { note: 'cancelled by operator' });

  assert.equal(task.status, 'cancelled');
  assert.equal(task.transitions.at(-1).event, 'cancel');
});

test('task state machine rejects invalid transitions', () => {
  const task = createTaskRecord({
    taskId: 'pipeline-invalid',
    taskType: 'development_pipeline',
  });

  assert.throws(() => transitionTask(task, 'complete'), /Invalid transition: pending -> complete/);
});
