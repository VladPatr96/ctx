# My Claude Code Config

Personal configuration, skills, and scripts for [Claude Code](https://claude.com/claude-code).

## Structure

```
commands/           # Custom slash commands (global ~/.claude/commands/)
  agent-teams.md    # Multi-agent collaboration
  api-digest.md     # API data digest generator
  cc-analytics.md   # Usage analytics report
  claude-md-writer.md # CLAUDE.md best practices
  gh-issues.md      # GitHub Issues CLI workflow
  git-workflow-manager.md # Conventional commits & releases
  opencode-config.md # OpenCode CLI configuration
  readme-generator.md # README generator
  windows-fixer.md  # Windows memory diagnostics

skills/             # Project-level skills (.claude/skills/)
  ctx.md            # /ctx — session workflow system

scripts/            # Helper scripts
  cc-analytics.py   # Analytics HTML report generator
  statusline.sh     # Custom statusline (bash)
  statusline.ps1    # Custom statusline (PowerShell, with usage limits)

settings.json       # Global settings (reference)
settings.local.json # Permission settings (reference)
```

## Installation

### Commands (global)

Copy to `~/.claude/commands/`:

```bash
cp commands/*.md ~/.claude/commands/
```

### Skills (per-project)

Copy to project's `.claude/skills/`:

```bash
cp skills/ctx.md /path/to/project/.claude/skills/
```

### Statusline

```bash
cp scripts/statusline.sh ~/.claude/
# or for PowerShell:
cp scripts/statusline.ps1 ~/.claude/
```

Then in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"~/.claude/statusline.sh\""
  }
}
```

## Requirements

- [Claude Code](https://claude.com/claude-code)
- [GitHub CLI](https://cli.github.com/) (`gh`) — for gh-issues, ctx
- Python 3 — for cc-analytics
- jq — for statusline
