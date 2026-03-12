# CTX CLI and MCP Reference Surface

This document is the canonical entrypoint reference for CTX integrations.

## Source of Truth

- CLI command surface is derived from `scripts/ctx-cli.js` built-ins plus enabled skill commands
- MCP tool surface is derived from the same runtime registrations used by `scripts/ctx-mcp-hub.js`
- Exact current snapshot lives in `docs/reference/interface-surface.json`

Refresh the snapshot with:

```bash
node scripts/docs/interface-reference.js --write docs/reference/interface-surface.json
```

## CLI Surface

- Built-in commands cover pipeline reads/writes and logging
- Skill commands are discovered from the enabled skills registry at runtime
- Interactive help remains available through `node scripts/ctx-cli.js --help`

## MCP Surface

- Built-in MCP tools are registered through `scripts/mcp/register-ctx-tools.js`
- Skill MCP tools are registered through `scripts/skills/skill-loader.js`
- The generated snapshot records exact tool names, descriptions, and whether each tool is built-in or skill-provided

## Current Baseline

- CLI built-ins are stable and intentionally small
- Skill-derived CLI and MCP surfaces can grow as enabled skills change
- The JSON snapshot should be treated as the exact current list; this markdown page explains where it comes from and how to refresh it
