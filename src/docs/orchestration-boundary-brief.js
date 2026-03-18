import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOrchestrationBoundaryBrief } from '../contracts/artifact-schemas.js';

export function buildOrchestrationBoundaryBrief({
  now = new Date().toISOString(),
} = {}) {
  return createOrchestrationBoundaryBrief({
    generatedAt: now,
    title: 'Orchestration Boundary and Programmable Pipeline Model',
    thesis: 'CTX should separate runtime-safe orchestration primitives from deferred branching, batch, and pipeline-builder product ideas so advanced orchestration stays a research track until the execution model is stable.',
    concernMap: [
      {
        id: 'decomposition',
        title: 'Task decomposition',
        summary: 'Breaking one request into nested tasks is a valid future capability, but today it must remain an explicit orchestration plan artifact rather than an autonomous runtime graph expander.',
        currentPosition: 'Keep decomposition as a memoized planning concept; do not let the runtime spawn arbitrary child pipelines yet.',
        coreBoundary: [
          'Task and step state machines can expose parent-child references without committing to recursive execution.',
          'Artifact bundles can record planned decomposition outputs as traceable metadata.',
        ],
        deferredProductSurface: [
          'A future planner can suggest decomposed work packages.',
          'A future UI can visualize nested execution trees and approvals.',
        ],
        risks: [
          'Implicit recursion would destabilize retry, suspend, and resume semantics.',
          'Unbounded child pipeline spawning would blur operator intent and auditability.',
        ],
      },
      {
        id: 'branching',
        title: 'Branching and parallel paths',
        summary: 'Branching is useful for alternate implementation paths or provider comparisons, but it should remain a governed operator action instead of a default runtime behavior.',
        currentPosition: 'Treat branching as an optional orchestration policy to design later, not as a current runtime default.',
        coreBoundary: [
          'Worktree and execution records can carry branch labels and branch ancestry.',
          'Runtime contracts can preserve deterministic state transitions for one active path at a time.',
        ],
        deferredProductSurface: [
          'A future shell can let operators compare alternative branches or runs.',
          'A future consilium layer can recommend when a branch should be forked for evaluation.',
        ],
        risks: [
          'Parallel mutation paths would increase merge and reconciliation complexity before runtime contracts are mature.',
          'Branch orchestration without explicit policy would produce hard-to-debug state drift.',
        ],
      },
      {
        id: 'batch_execution',
        title: 'Batch execution',
        summary: 'Batch mode belongs to a later orchestration layer that schedules multiple prepared jobs, not to the current single-task execution loop.',
        currentPosition: 'Allow batch-shaped metadata and queue research, but keep runtime execution centered on one tracked task.',
        coreBoundary: [
          'Runtime can expose queue-friendly task envelopes and normalized task status records.',
          'Provider telemetry can support capacity planning and recovery heuristics for future batching.',
        ],
        deferredProductSurface: [
          'A future operator surface can submit and monitor batched jobs.',
          'A future scheduler can enforce rate, cost, and provider policy across many prepared tasks.',
        ],
        risks: [
          'Batch dispatch before explicit queue semantics would hide failures and overload providers.',
          'Mixing interactive and batch behavior now would weaken operator-facing execution guarantees.',
        ],
      },
      {
        id: 'programmable_pipeline_builder',
        title: 'Programmable pipeline builder',
        summary: 'A programmable pipeline model can become a strong product surface, but only after the runtime contracts are stable enough to host declared steps, policies, and artifacts safely.',
        currentPosition: 'Design the model now, but defer any visual builder or public DSL commitment until the runtime boundary is proven.',
        coreBoundary: [
          'Canonical step/task contracts, execution policies, and artifact manifests are the required substrate.',
          'Runtime should accept declarative metadata only when validation and recovery semantics are already explicit.',
        ],
        deferredProductSurface: [
          'A future builder can edit reusable pipeline templates or DAG-like flows.',
          'A future SDK can expose programmable orchestration recipes for advanced users.',
        ],
        risks: [
          'Shipping a builder before stable contracts would freeze the wrong abstractions.',
          'A premature DSL or visual editor would create long-lived compatibility debt.',
        ],
      },
    ],
    executionBoundary: {
      coreRuntimeResponsibilities: [
        'Keep execution centered on canonical task and step state machines, artifact bundles, and provider lifecycle contracts.',
        'Expose explicit metadata for parent-child relationships, branch labels, and queue-friendly task envelopes without auto-activating those behaviors.',
        'Preserve deterministic operator control, recovery hooks, and traceability for every runtime transition.',
      ],
      deferredProductSurfaces: [
        'Visual branching and replay tools for comparing alternate execution paths.',
        'Batch scheduling, queue management, and cross-provider workload orchestration.',
        'Programmable pipeline templates, DSL work, or a visual pipeline builder.',
      ],
      preconditions: [
        'Runtime contracts and recovery semantics must remain stable across task, step, and provider lifecycles.',
        'Storage and documentation surfaces must expose orchestration artifacts without reading hidden state.',
        'Operator controls must stay explicit so advanced orchestration does not bypass auditability.',
      ],
    },
    rolloutGuards: [
      'Do not add automatic recursive task spawning to the current runtime.',
      'Do not make branching or batch execution a default behavior before explicit policy and recovery rules exist.',
      'Do not commit to a public DSL or visual builder before the runtime contract layer is stable.',
      'Keep advanced orchestration ideas in research unless a later ADR promotes one slice into the product plan.',
    ],
    nonGoals: [
      'Promising advanced orchestration as part of the current build commitment.',
      'Treating batch execution as a drop-in extension of the current interactive task loop.',
      'Locking the project into a public orchestration DSL before contract stability exists.',
      'Moving product-surface ambitions ahead of runtime traceability and operator control.',
    ],
  });
}

export function writeOrchestrationBoundaryBrief({
  outputPath = 'docs/research/orchestration-programmable-pipeline-boundary.json',
  now,
} = {}) {
  const artifact = buildOrchestrationBoundaryBrief({ now });
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const writeIndex = args.indexOf('--write');
  const outputPath = writeIndex >= 0 && args[writeIndex + 1]
    ? args[writeIndex + 1]
    : null;
  const artifact = outputPath
    ? writeOrchestrationBoundaryBrief({ outputPath })
    : buildOrchestrationBoundaryBrief();
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}
