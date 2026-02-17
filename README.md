# CTX Plugin

Multi-provider context management plugin for [Claude Code](https://claude.com/claude-code).

Session logging, cross-project knowledge base, deep file indexing, and multi-provider consilium (Claude Code, Gemini CLI, OpenCode, Codex CLI).

## What it does

- `/ctx` — starts a session: indexes the project, loads lessons from past sessions, creates a session log
- `/ctx save` — ends a session: saves summary to GitHub Issues (project repo + central knowledge base)
- `/ctx-search <query>` — searches solutions across all projects via GitHub Issues
- `/ctx-consilium <task>` — 4 AI providers independently analyze a task, main agent synthesizes the decision
- **Auto-save hooks** — PreCompact and Stop hooks automatically save session context before it's lost
- **MCP Hub** — 8 tools accessible by Claude Code, Gemini CLI, and OpenCode for cross-provider communication

## Structure

```
.claude-plugin/plugin.json     # Plugin manifest
skills/
  ctx/SKILL.md                 # /ctx — session + indexing + lessons
  ctx-search/SKILL.md          # /ctx-search — knowledge base search
  ctx-consilium/SKILL.md       # /ctx-consilium — multi-provider council
agents/
  session-logger.md            # Session logging agent
  provider-delegate.md         # External provider delegation agent
hooks/hooks.json               # PreCompact + Stop auto-save
scripts/
  ctx-mcp-hub.js               # MCP Hub server (8 tools)
  ctx-indexer.js               # Deep project indexer
  ctx-session-save.js          # Hybrid GitHub Issues save
  cc-analytics.py              # Usage analytics report
  statusline.sh / .ps1         # Custom statusline
commands/                      # 9 slash commands (agent-teams, gh-issues, etc.)
.mcp.json                      # MCP server configuration
```

## Installation

### As Claude Code plugin

```bash
claude plugin install /path/to/claude_ctx
```

Or for local development:

```bash
claude --plugin-dir /path/to/claude_ctx
```

### Dependencies

```bash
cd claude_ctx
npm install
```

### GitHub labels (first time)

```bash
gh label create session --color 0E8A16 -R YourUser/your-repo
gh label create lesson --color D93F0B -R YourUser/your-repo
gh label create consilium --color 5319E7 -R YourUser/your-repo
gh label create "provider:claude-code" --color 1D76DB -R YourUser/your-repo
```

## MCP Hub tools

The MCP Hub server exposes 8 tools available to any MCP-compatible client:

| Tool | Description |
|------|-------------|
| `ctx_get_project_map` | Full project map: stack, structure, i18n, git, patterns |
| `ctx_search_solutions` | Search solutions in GitHub Issues across all projects |
| `ctx_log_action` | Log an action to the current session |
| `ctx_log_error` | Log an error and its solution |
| `ctx_get_session` | Get current session state (actions, errors, tasks) |
| `ctx_share_result` | Publish a result for other agents (used in consilium) |
| `ctx_read_results` | Read results from other agents |
| `ctx_get_tasks` | Get session task list |

## Cross-provider setup

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ctx-hub": {
      "command": "node",
      "args": ["/absolute/path/to/claude_ctx/scripts/ctx-mcp-hub.js"]
    }
  }
}
```

### OpenCode

Add to `opencode.jsonc`:

```json
{
  "mcp": {
    "ctx-hub": {
      "command": "node",
      "args": ["/absolute/path/to/claude_ctx/scripts/ctx-mcp-hub.js"]
    }
  }
}
```

### Codex CLI

Codex CLI does not support MCP. It participates in consilium via bash invocation.

## How consilium works

1. **PREPARE** — task + project context sent to all 4 providers
2. **DISPATCH** — each provider analyzes independently (doesn't see others' responses)
3. **SYNTHESIZE** — main agent (Opus) collects all proposals
4. **DECIDE** — final decision with reasoning ("why X, not Y")
5. **LOG** — saved to GitHub Issues with `consilium` label

## Knowledge base

Sessions and lessons are stored as GitHub Issues with labels:

- `session` — session logs (what was done, files changed, tasks)
- `lesson` — errors and solutions (searchable across projects)
- `consilium` — multi-provider decisions
- `project:<name>` — project filter

Hybrid storage: session logs go to the project repo, lessons go to the central repo for cross-project search.

## Requirements

- [Claude Code](https://claude.com/claude-code) v1.0.33+
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated
- Node.js 20+
- Gemini CLI / OpenCode / Codex CLI — for multi-provider features (optional)
