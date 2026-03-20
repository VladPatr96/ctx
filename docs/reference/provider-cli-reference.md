# Provider CLI Reference — ctx plugin

Quick reference for invoking AI CLI providers from ctx scripts and agents.
Source: official docs fetched 2026-03-20.

---

## Claude Code CLI

**Docs:** https://code.claude.com/docs/en/cli-reference

### Headless (non-interactive)

```bash
claude -p "prompt"                           # one-shot, exit after response
claude -p "prompt" --output-format text       # plain text output (default)
claude -p "prompt" --output-format json       # JSON output
claude -p "prompt" --output-format stream-json # streaming JSON events
cat file | claude -p "analyze this"           # pipe stdin
```

### Key flags

| Flag | Purpose |
|------|---------|
| `-p, --print` | Non-interactive mode (SDK mode) |
| `--model <name>` | Model: `sonnet`, `opus`, or full ID like `claude-sonnet-4-6` |
| `--output-format` | `text` / `json` / `stream-json` |
| `--dangerously-skip-permissions` | Skip all permission prompts |
| `--allowedTools` | Tools that auto-approve: `"Bash(git *)" "Read"` |
| `--disallowedTools` | Remove tools from context |
| `--max-turns N` | Limit agentic turns (print mode) |
| `--max-budget-usd N` | Spending cap (print mode) |
| `-c, --continue` | Continue most recent conversation |
| `-r, --resume <id>` | Resume specific session |
| `--append-system-prompt` | Add text to system prompt |
| `--system-prompt` | Replace entire system prompt |
| `--mcp-config <file>` | Load MCP servers from JSON |
| `--json-schema '{...}'` | Structured output validation |
| `--fallback-model <name>` | Fallback on overload (print mode) |
| `--effort` | `low` / `medium` / `high` / `max` |
| `-n, --name` | Session display name |
| `-w, --worktree` | Isolated git worktree |
| `--agent <name>` | Use specific subagent |
| `--tools "Bash,Edit,Read"` | Restrict available tools |
| `--permission-mode` | `plan` / `acceptEdits` / etc. |
| `--add-dir <path>` | Additional working directories |
| `--chrome` | Enable Chrome browser integration |
| `--verbose` | Full turn-by-turn output |
| `--debug "api,mcp"` | Debug with category filter |

### Config files

- `CLAUDE.md` — project instructions (auto-loaded)
- `~/.claude/settings.json` — user settings
- `.claude/settings.json` — project settings
- `.claude-plugin/plugin.json` — plugin manifest

---

## Gemini CLI

**Docs:** https://geminicli.com/docs/

### Headless (non-interactive)

```bash
gemini "prompt"                    # positional prompt → non-interactive
gemini -m gemini-2.5-pro "prompt"  # with model selection
gemini --output-format json "prompt"
gemini --yolo "prompt"             # auto-approve all tools
```

### Key flags

| Flag | Purpose |
|------|---------|
| `<prompt>` | Positional argument for non-interactive mode |
| `-i, --prompt-interactive` | Start interactive session with initial prompt |
| `-m, --model <name>` | Model: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3-pro-preview`, etc. |
| `--output-format` | `text` / `json` / `stream-json` |
| `--yolo` | Auto-approve all tool calls (enables sandbox) |
| `--approval-mode` | `default` / `auto_edit` / `yolo` / `plan` |
| `-s, --sandbox` | Enable sandboxing (Docker/Seatbelt/custom) |
| `--allowed-tools` | Tools bypassing confirmation |
| `-r, --resume [id]` | Resume session (`latest` / index / UUID) |
| `-e, --extensions` | Specify extensions (`none` to disable) |
| `--include-directories` | Additional workspace dirs (max 5) |
| `-d, --debug` | Verbose debug output |
| `--screen-reader` | Accessibility mode |

### Slash commands (interactive)

| Command | Purpose |
|---------|---------|
| `/model set <name>` | Change model |
| `/memory add <text>` | Add to context |
| `/memory refresh` | Reload GEMINI.md files |
| `/tools [desc]` | List available tools |
| `/extensions` | Manage extensions |
| `/mcp` | Configure MCP servers |
| `/skills` | Manage skills |
| `/plan` | Enter Plan Mode |
| `/agents list` | Manage subagents |
| `/compress` | Summarize chat context |
| `/restore [id]` | Revert files to pre-tool state |
| `@<path>` | Inject file/directory contents |
| `!<command>` | Execute shell command |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | API key |
| `GEMINI_MODEL` | Default model |
| `GEMINI_SANDBOX` | `true`/`false`/`docker`/`podman`/custom |
| `GEMINI_SYSTEM_MD` | Path to custom system prompt |
| `GEMINI_CLI_HOME` | Config root directory |

### Config files

- `GEMINI.md` — project instructions (hierarchical, like CLAUDE.md)
- `~/.gemini/settings.json` — user settings
- `.gemini/settings.json` — project settings
- `.gemini/commands/*.toml` — custom commands
- `.gemini/system.md` — custom system prompt

### MCP config (in settings.json)

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["server.js"],
      "env": {},
      "trust": true
    }
  }
}
```

---

## OpenCode CLI

**Docs:** https://opencode.ai/docs/

### Headless (non-interactive)

```bash
opencode run "prompt"                    # one-shot execution
opencode run "prompt" --model provider/model  # with model
opencode run "prompt" --format json      # JSON output
opencode run -f file.txt "analyze"       # attach files
opencode serve                           # headless API server
```

### Key flags

| Flag | Purpose |
|------|---------|
| `run <message>` | Non-interactive execution |
| `-m, --model` | Model as `provider/model` |
| `--format` | `default` / `json` |
| `-f, --file` | Attach file(s) |
| `-c, --continue` | Resume last session |
| `-s, --session` | Continue specific session |
| `--fork` | Branch session |
| `--agent` | Select agent |
| `--share` | Share the session |
| `--title` | Custom session title |
| `--attach <url>` | Connect to remote server |
| `--port` | Server port |
| `--print-logs` | Output logs to stderr |
| `--log-level` | `DEBUG`/`INFO`/`WARN`/`ERROR` |

### Subcommands

| Command | Purpose |
|---------|---------|
| `opencode run` | Non-interactive prompt |
| `opencode serve` | Headless API server |
| `opencode web` | Server with web UI |
| `opencode attach` | Connect TUI to backend |
| `opencode agent create` | Create custom agent |
| `opencode agent list` | List agents |
| `opencode mcp add` | Add MCP server |
| `opencode mcp list` | List MCP servers |
| `opencode models [provider]` | List available models |
| `opencode session list` | List sessions |
| `opencode stats` | Usage statistics |
| `opencode github install` | GitHub Actions setup |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `OPENCODE_CONFIG` | Config file path |
| `OPENCODE_CONFIG_CONTENT` | Inline JSON config |
| `OPENCODE_PERMISSION` | Inline JSON permissions |
| `OPENCODE_SERVER_PASSWORD` | HTTP basic auth |
| `OPENCODE_AUTO_SHARE` | Auto-share sessions |
| `OPENCODE_DISABLE_AUTOUPDATE` | Skip updates |
| `OPENCODE_ENABLE_EXA` | Enable web search |

### Config files

- `.opencode/config.json` — project config
- `~/.local/share/opencode/auth.json` — API keys
- `AGENTS.md` — agent instructions

---

## Codex CLI (OpenAI)

**Docs:** https://developers.openai.com/codex

### Headless (non-interactive)

```bash
codex exec "prompt"                    # one-shot, non-interactive
codex exec --ephemeral "prompt"        # no session persistence
codex exec --json "prompt"             # JSON event output
codex exec -o result.txt "prompt"      # write result to file
echo "prompt" | codex exec -           # pipe from stdin
codex exec --skip-git-repo-check "prompt"  # run outside git repo
```

### Key flags (global)

| Flag | Purpose |
|------|---------|
| `-m, --model` | Model: `gpt-5-codex`, etc. |
| `-a, --ask-for-approval` | `untrusted` / `on-request` / `never` |
| `--full-auto` | Low-friction: on-request approvals + workspace-write sandbox |
| `--yolo` | Skip approvals AND sandbox (dangerous) |
| `-s, --sandbox` | `read-only` / `workspace-write` / `danger-full-access` |
| `-i, --image` | Attach image(s) |
| `-p, --profile` | Load config profile |
| `-C, --cd` | Set working directory |
| `--add-dir` | Grant additional dir write access |
| `-c, --config key=value` | Override config |
| `--oss` | Use local Ollama provider |
| `--search` | Enable web search |

### exec-specific flags

| Flag | Purpose |
|------|---------|
| `--ephemeral` | Don't persist session files |
| `--json` | Newline-delimited JSON events |
| `-o, --output-last-message` | Write final message to file |
| `--output-schema` | JSON Schema for validating output |
| `--skip-git-repo-check` | Allow outside git repos |
| `--color` | `always` / `never` / `auto` |

### Subcommands

| Command | Purpose |
|---------|---------|
| `codex exec` / `codex e` | Non-interactive execution |
| `codex resume` | Continue session |
| `codex fork` | Fork session into new thread |
| `codex mcp add` | Register MCP server |
| `codex mcp list` | List MCP servers |
| `codex sandbox -- CMD` | Run command in sandbox |
| `codex features list` | Show feature flags |
| `codex cloud exec` | Submit cloud task |
| `codex apply TASK_ID` | Apply cloud task diff |
| `codex login` | Auth (OAuth/API key) |

### Config files

- `~/.codex/config.toml` — user config (profiles support)
- `AGENTS.md` — project instructions
- `.codex/skills/` — custom skills directory

### MCP config

```bash
codex mcp add my-server -- node server.js
codex mcp add my-http --url https://server.example.com
codex mcp list
```

---

## Cross-Provider Comparison

| Feature | Claude Code | Gemini CLI | OpenCode | Codex CLI |
|---------|-------------|------------|----------|-----------|
| **Headless flag** | `-p "prompt"` | `"prompt"` (positional) | `run "prompt"` | `exec "prompt"` |
| **Model flag** | `--model` | `-m` | `-m provider/model` | `-m` |
| **Output format** | `--output-format` | `--output-format` | `--format` | `--json` |
| **Auto-approve** | `--dangerously-skip-permissions` | `--yolo` | N/A | `--full-auto` / `--yolo` |
| **Sandbox** | N/A | `-s` / `--sandbox` | N/A | `-s` / `--sandbox` |
| **Resume** | `-c` / `-r <id>` | `-r [id]` | `-c` / `-s <id>` | `resume [id]` |
| **Pipe stdin** | `cat f \| claude -p` | N/A | `-f file` | `codex exec -` |
| **MCP** | `--mcp-config` | `mcpServers` in settings | `mcp add` | `codex mcp add` |
| **Instructions** | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md` | `AGENTS.md` |
| **Skills dir** | `.claude/skills/` | `skills/` | `agents/` | `.codex/skills/` |
| **Project config** | `.claude/settings.json` | `.gemini/settings.json` | `.opencode/config.json` | `~/.codex/config.toml` |
