# ADR: SQLite-First As The Phase 0-1 Migration Target

Status: Accepted
Date: 2026-03-10

## Decision

For Phase 0-1 migration work, CTX treats SQLite as the canonical operational storage target.

Current runtime behavior is intentionally different:

- `CTX_STORAGE` still defaults to `json` in the shipping code
- JSON remains the compatibility and fallback path until the cutover is implemented explicitly

## Why

- Phase 0 work needs one storage direction for contracts, artifacts, and dashboard/state boundaries
- SQLite is already present in the repository and covered by tests
- Pulling PostgreSQL/Redis into the same wave would expand scope without improving the current single-user runtime

## What This Does Not Mean

- It does not change today's runtime default from `json` to `sqlite`
- It does not remove JSON storage
- It does not skip failover/shadow-read compatibility work

## Operational Rule

Until a dedicated cutover task lands:

- architecture and migration planning assume SQLite-first
- runtime docs must still describe the real default as `json`
- new storage-facing work should target the storage boundary, not raw `.data/*.json` coupling

## Consequences

- roadmap and workflow docs can use `SQLite-first` without conflicting with the current README/runtime defaults
- dashboard/storage/runtime work should be evaluated against the canonical storage boundary
- changing the actual default remains a separate, test-backed implementation step
