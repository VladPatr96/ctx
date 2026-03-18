# CTX Dashboard and Desktop Reference Surface

This document is the canonical reference entrypoint for the dashboard HTTP surface and the Electron desktop shell.

## Source of Truth

- Dashboard HTTP endpoints are defined in `scripts/contracts/dashboard-surface.js`
- Desktop shell navigation, connection behavior, and summary payload shape are defined in `scripts/contracts/shell-schemas.js`
- Exact current snapshot lives in `docs/reference/dashboard/dashboard-desktop-surface.json`

Refresh the snapshot with:

```bash
node scripts/docs/dashboard-reference.js --write docs/reference/dashboard/dashboard-desktop-surface.json
```

## Dashboard HTTP Surface

- The JSON artifact records every canonical GET and POST endpoint, auth policy, params, response shape, and bound desktop client method
- `GET` endpoints accept dashboard Bearer auth and the `?token=` query token for dashboard/browser usage
- `POST` endpoints require Bearer auth
- `/health` is the only public liveness endpoint in the current canonical surface

## Desktop Shell Surface

- The desktop shell is Electron + React + Vite
- Tabs, shortcuts, and reconnect/stale-recovery budgets are contract-backed and exported into the snapshot
- Terminal command execution is canonical through Electron IPC (`ctxApi.getTerminalAllowlist`, `ctxApi.runTerminalCommand`)
- The markdown page explains the surface; the JSON artifact is the exact machine-readable baseline
