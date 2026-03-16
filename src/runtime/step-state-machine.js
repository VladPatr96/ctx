import { StepRecordSchema } from '../contracts/runtime-schemas.js';

const STEP_TRANSITIONS = {
  pending: ['start', 'suspend', 'skip'],
  running: ['complete', 'fail', 'suspend'],
  failed: ['retry'],
  suspended: ['resume', 'fail', 'skip'],
  completed: [],
  skipped: [],
};

export function createStepRecord({ stepId, stepType, maxAttempts = 1, metadata = {} }) {
  return StepRecordSchema.parse({
    stepId,
    stepType,
    status: 'pending',
    attempt: 0,
    maxAttempts,
    createdAt: new Date().toISOString(),
    failureKind: null,
    lastError: null,
    metadata,
    transitions: [],
  });
}

export function transitionStep(step, event, opts = {}) {
  const current = StepRecordSchema.parse(step);
  const allowed = STEP_TRANSITIONS[current.status] || [];
  if (!allowed.includes(event)) {
    throw new Error(`Invalid transition: ${current.status} -> ${event}`);
  }

  if (event === 'retry') {
    if (current.failureKind !== 'retryable') {
      throw new Error('Only retryable failures can transition via retry');
    }
    if (current.attempt >= current.maxAttempts) {
      throw new Error(`Retry limit reached for step "${current.stepId}"`);
    }
  }

  if (event === 'fail' && !opts.failureKind) {
    throw new Error('failureKind is required for fail transitions');
  }

  const at = opts.at || new Date().toISOString();
  const nextStatus = getNextStatus(event);
  const next = {
    ...current,
    status: nextStatus,
    failureKind: event === 'fail' ? opts.failureKind : event === 'retry' ? null : current.failureKind,
    lastError: event === 'fail' ? opts.error || null : event === 'retry' ? null : current.lastError,
    transitions: current.transitions.concat({
      event,
      from: current.status,
      to: nextStatus,
      at,
      note: opts.note,
      error: opts.error,
      failureKind: opts.failureKind,
    }),
  };

  if (event === 'start') {
    next.attempt = current.attempt + 1;
    next.startedAt = at;
    next.suspendedAt = undefined;
    next.completedAt = undefined;
  }

  if (event === 'resume') {
    next.suspendedAt = undefined;
    if (!next.startedAt) next.startedAt = at;
  }

  if (event === 'suspend') {
    next.suspendedAt = at;
  }

  if (event === 'complete' || event === 'skip' || event === 'fail') {
    next.completedAt = at;
    if (event !== 'fail') next.suspendedAt = undefined;
  }

  if (event === 'retry') {
    next.completedAt = undefined;
    next.suspendedAt = undefined;
  }

  return StepRecordSchema.parse(next);
}

function getNextStatus(event) {
  switch (event) {
    case 'start':
    case 'resume':
      return 'running';
    case 'complete':
      return 'completed';
    case 'fail':
      return 'failed';
    case 'retry':
      return 'pending';
    case 'suspend':
      return 'suspended';
    case 'skip':
      return 'skipped';
    default:
      throw new Error(`Unsupported event: ${event}`);
  }
}
