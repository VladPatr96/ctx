# Provider Setup And Migration Guide

This is the canonical setup and switching surface for CTX providers.

Machine-readable compatibility data lives in:

- `docs/setup/providers/provider-compatibility.json`

Regenerate it with:

```bash
node scripts/docs/provider-migration.js --write docs/setup/providers/provider-compatibility.json
```

## Shared Rule

All providers keep the same CTX state in `.data/pipeline.json` and `.data/log.jsonl`.
Switching providers changes the host integration and setup flow, not the project memory model.

## Provider Matrix

| Provider | Primary host interface | Preferred entrypoint | Setup command | Configuration surface |
|---|---|---|---|---|
| Claude Code | MCP native | `/ctx` | `node scripts/ctx-setup.js claude` | `.mcp.json` with `ctx-hub` |
| Codex CLI | CLI wrapper | `/ctx` | `node scripts/ctx-setup.js codex` | `.codex/skills/ctx/SKILL.md` or repo fallback |
| Gemini CLI | CLI wrapper | `gemini /ctx` | `node scripts/ctx-setup.js gemini` | `~/.config/gemini-cli/skills/ctx-gemini/SKILL.md` |
| OpenCode | CLI wrapper | `/ctx` | `node scripts/ctx-setup.js opencode` | OpenCode skills dir plus auto-update scripts |

## Migration Paths

### Claude Code -> Codex / Gemini / OpenCode

- Keep `.data/` intact; no state export is required.
- Install the target provider integration with `node scripts/ctx-setup.js <provider>`.
- Use the provider-specific host entrypoint after setup.

### Codex / Gemini / OpenCode -> Claude Code

- Keep `.data/` intact; the runtime state is shared.
- Ensure `.mcp.json` exposes `ctx-hub`.
- Move the primary operator flow from copied skills to the MCP-native `/ctx` entrypoint.

### Between CLI-wrapper Providers

- Keep `.data/` intact.
- Replace only the host-specific skill/configuration location.
- Re-run the target setup command so the expected skill/update files are installed in the correct location.

## Provider-Specific Notes

### Claude Code

- Primary host integration is MCP-native.
- Internal provider execution still uses the current CLI-oriented runtime adapter, which is tracked separately in the compatibility artifact.

### Codex CLI

- Default user path is the CLI wrapper.
- If the host exposes `ctx-hub`, Codex can prefer MCP tools and keep CLI/file modes as fallback.

### Gemini CLI

- Uses copied skill files under the Gemini config directory.
- There is no MCP-native host path today.

### OpenCode

- Uses CLI wrapper integration plus generated `update-ctx-skill` scripts.
- The OpenCode-specific auto-update flow remains source material in `OPENCODE_AUTO_SETUP.md`; this guide is the canonical surface.
