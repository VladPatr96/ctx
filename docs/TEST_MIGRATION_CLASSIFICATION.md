# Test Migration Classification

Status: Accepted baseline for Phase 0
Date: 2026-03-10

This document classifies the current CTX test surface into the three buckets required by the v1.1 migration plan:

- `port`: keep the test intent and move it with minimal change into the new runtime
- `rewrite`: keep the behavior under test, but rebuild the harness around canonical contracts/runtime boundaries
- `delete`: remove the current entrypoint from the default suite after its useful coverage is re-homed elsewhere

## Port

These tests are mostly deterministic, contract-heavy, or algorithmic. They should move forward with minimal semantic change.

- `tests/adaptive-weight.test.mjs`
- `tests/cache-store.test.mjs`
- `tests/consilium-rounds.test.mjs`
- `tests/dashboard-state-store.test.mjs`
- `tests/failover-store.test.mjs`
- `tests/kb-reporter.test.mjs`
- `tests/knowledge-store.test.mjs`
- `tests/model-discovery.test.mjs`
- `tests/path-validation.test.mjs`
- `tests/pipeline-schema.test.mjs`
- `tests/provider-limits-statusline.test.mjs`
- `tests/provider-modes.test.mjs`
- `tests/routing-logger.test.mjs`
- `tests/routing.test.mjs`
- `tests/runtime-schemas.test.mjs`
- `tests/security.test.mjs`
- `tests/shadow-write.test.mjs`
- `tests/shell-utils.test.mjs`
- `tests/step-state-machine.test.mjs`
- `tests/storage-adapter.test.mjs`
- `tests/terminal-allowlist.test.mjs`
- `scripts/testing/test-kb-bridge.mjs`
- `scripts/testing/test-state.mjs`

Target action:

- keep these tests close to the modules they verify
- preserve assertions first, then only adapt imports/fixtures/contracts
- use them as the primary safety net while the new runtime shell is changing

## Rewrite

These tests verify important behavior, but their current harness is tied to HTTP shells, git/worktree state, CLI interaction, or legacy runtime wiring.

- `tests/dashboard-router.test.mjs`
- `tests/development-pipeline.test.mjs`
- `tests/executor.test.mjs`
- `tests/reactor.test.mjs`
- `tests/worktree-manager.test.mjs`
- `scripts/test-cost-tracking-e2e.js`
- `scripts/test-opencode-setup.js`
- `scripts/testing/test-wizard-e2e.mjs`

Target action:

- keep the behavior under test, but rebuild the harness around canonical APIs and hermetic fixtures
- avoid direct dependence on dirty worktrees, real user config, or repo-local mutable state
- convert script-style smoke tests into explicit integration suites where possible

## Delete

These entrypoints should not remain in the default `npm test` surface in migration-safe form.

- `scripts/orchestrator/run-tests.js`
  Runtime helper module. It must stay callable from orchestrator code, but not be treated as a standalone default-suite test file.
- `skills/test-coverage-booster/index.js`
  Explicit skill entrypoint. It should be validated through targeted skill contract checks, not by accidental default-suite discovery.

Target action:

- remove accidental discovery from the default test surface
- keep any useful assertions only after they are re-homed into explicit unit/integration coverage
- do not carry these files forward as-is into the migration-safe suite

## Working Rule

Until the migration finishes:

- `port` is the default choice for deterministic module-level tests
- `rewrite` is mandatory for shell/runtime/E2E coverage
- `delete` means remove the current entrypoint, not the behavior itself
