# Session And Decision History Exports

This is the canonical documentation export surface for CTX session history and durable decisions.

Machine-readable artifact:

- `docs/reference/project-memory/session-decision-history.json`

Regenerate it with:

```bash
node scripts/docs/project-history.js --write docs/reference/project-memory/session-decision-history.json
```

## Sources

- local session logs in `.sessions/*.md`
- ADR-style decision records in `docs/ADR_*.md`

## What This Export Is For

- documentation snapshots for contributors and operators
- quick review of recent session coverage and durable decisions
- deterministic repo-local artifacts that can be diffed and tested

## What This Export Is Not For

- live operational memory
- active prioritization or status tracking
- replacing GitHub Issues / GitHub Project comments

Use the layers this way:

- GitHub Issues / Project: live work memory and checkpoints
- `.sessions/*.md`: raw private session records
- `docs/reference/project-memory/session-decision-history.json`: testable documentation export
- `docs/ADR_*.md`: durable architecture decisions

