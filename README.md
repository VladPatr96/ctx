# ctx — Complex Task eXecution

**Complex Task eXecution (ctx)** is a multi-provider context management plugin for [Claude Code](https://claude.com/claude-code), [Gemini CLI](https://github.com/google-gemini/gemini-cli), [OpenCode](https://github.com/opencode-ai/opencode), and [Codex CLI](https://github.com/openai/codex).

Session logging, cross-project knowledge base (SQLite FTS5), deep file indexing, adaptive routing, and multi-round anonymous consilium with CBDP (Claim-Based Deliberation Protocol).

## What it does

- `/ctx` — starts a session: indexes the project, loads lessons from past sessions, creates a session log
- `/ctx save` — ends a session: saves summary to GitHub Issues (project repo + central knowledge base)
- `/ctx-search <query>` — searches solutions across all projects via knowledge base (FTS5 + GitHub Issues)
- `/ctx-consilium <topic>` — multi-round anonymous consilium: providers debate in R1..R4, structured responses, claim extraction, trust scoring, smart synthesis
- `/ctx-delegate <task>` — smart task routing with adaptive scoring based on provider history
- **Auto-save hooks** — PreCompress and Stop hooks automatically save session context before it's lost
- **MCP Hub** — 29 tools accessible by any MCP-compatible client

## Architecture

### Pipeline state machine

All providers share unified state (`.data/pipeline.json`):

```
DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE
```

Any provider can read/advance the pipeline. Lead provider is tracked and switchable at runtime.

### Provider routing

Smart router selects the best provider for each task type:

| Task type | Default provider |
|-----------|-----------------|
| Code review, sandbox exec, refactoring | Codex |
| Codebase analysis, documentation, translation | Gemini |
| Planning, architecture, workflow | Claude |
| JSON/structured output, multi-model | OpenCode |

**Adaptive routing** (enabled by default) blends static weights with evaluation data:

```
finalScore = (1 - α - ε) * staticScore + α * evalScore + ε * exploreBonus
```

Where `α` grows with the number of recorded samples and `evalScore` is derived from win rate, confidence, and latency of past consilium runs. Set `CTX_ADAPTIVE_ROUTING=0` to disable.

### Consilium (CBDP)

Multi-round anonymous deliberation protocol:

1. **R1** — each provider answers independently (anonymized as Participant A/B/C)
2. **R2+** — structured responses with `stance`, `accepts`, `challenges`, `trust_scores`, `new_claims`
3. **Claim extraction** — claims extracted between rounds, tracked as a graph
4. **Auto-stop** — stops early if 0 contested claims remain
5. **Smart synthesis** — final provider synthesizes using claim graph + trust matrix
6. **Feedback loop** — provider responses, trust-derived confidence, and winner recorded to eval store for future adaptive routing

### Knowledge base

Hybrid storage with GitHub Issues as source of truth:

- **SQLite FTS5** — local full-text search with upsert deduplication
- **GitHub Issues** — remote storage with labels (`session`, `lesson`, `consilium`, `project:<name>`)
- **Sync** — bidirectional pull/push between SQLite and GitHub
- **Central repo** — cross-project lessons go to `VladPatr96/ctx-knowledge`

## Structure

```
scripts/
  ctx-mcp-hub.js               # MCP Hub server (29 tools)
  ctx-cli.js                    # CLI wrapper for non-MCP providers
  ctx-setup.js                  # Provider setup script
  ctx-indexer.js                # Deep project indexer
  ctx-session-save.js           # Session persistence (hooks)
  dashboard-backend.js          # Web API (SSE, auth, rate limiting)
  providers/
    index.js                    # Provider registry + health checks
    router.js                   # Smart task routing + adaptive scoring
    claude.js / gemini.js /     # Provider implementations
    codex.js / opencode.js
  tools/
    session.js                  # 4 tools: log_action, log_error, get_session, get_tasks
    knowledge.js                # 7 tools: project_map, search, context, save, stats, bootstrap, sync
    consilium.js                # 6 tools: share, read, delegate, inner, presets, multi_round, agent
    pipeline.js                 # 3 tools: get_pipeline, set_stage, update_pipeline
    agents.js                   # 2 tools: list_agents, create_agent
    evaluation.js               # 6 tools: eval_start/provider/complete/ci_update/report, routing_health
  evaluation/
    eval-store.js               # SQLite store for consilium runs + provider metrics
    adaptive-weight.js          # Scoring formula: evalScore, adaptiveScore, rankCandidates
    routing-logger.js           # Async buffer for routing decision logs
  consilium/
    round-orchestrator.js       # Multi-round execution engine
    prompts.js                  # R1, follow-up, structured, synthesis prompts
    claim-extractor.js          # Claim extraction between rounds
    claim-graph.js              # Claim graph: consensus, contested, unique
  knowledge/
    knowledge-store.js          # SQLite FTS5 knowledge base
  storage/                      # Storage adapters (SQLite + JSON fallback)
  utils/                        # State I/O, shell utilities

skills/
  ctx/SKILL.md                  # /ctx — session + indexing + lessons
  ctx-search/SKILL.md           # /ctx-search — knowledge base search
  ctx-consilium/SKILL.md        # /ctx-consilium — multi-provider council
  ctx-delegate/SKILL.md         # /ctx-delegate — smart task delegation
  ctx-universal-full/SKILL.md   # Universal skill (all providers)
  ctx-gemini/SKILL.md           # Gemini-specific skill
  ctx-opencode/SKILL.md         # OpenCode-specific skill

agents/                         # AI agent role definitions
  architect.md                  # System design
  implementer.md                # Code writing
  reviewer.md                   # Code review
  tester.md                     # Test coverage
  researcher.md                 # Exploration
  documenter.md                 # Documentation
  pipeline-controller.md        # Orchestration
  session-logger.md             # Session management

ctx-app/                        # Desktop app (Electron + React + Vite)
tests/                          # 173 unit tests (13 test files)
hooks/hooks.json                # PreCompress + Stop auto-save
commands/                       # Slash commands
consilium.presets.json          # Preset configurations (debate-full, debate-fast, debate-claims)
```

## MCP Hub tools

29 tools grouped by domain:

| Domain | Tools |
|--------|-------|
| **Session** (4) | `ctx_log_action`, `ctx_log_error`, `ctx_get_session`, `ctx_get_tasks` |
| **Knowledge** (7) | `ctx_get_project_map`, `ctx_search_solutions`, `ctx_get_project_context`, `ctx_save_lesson`, `ctx_kb_stats`, `ctx_kb_bootstrap`, `ctx_kb_sync` |
| **Consilium** (7) | `ctx_share_result`, `ctx_read_results`, `ctx_delegate_task`, `ctx_inner_consilium`, `ctx_consilium_presets`, `ctx_consilium_multi_round`, `ctx_agent_consilium` |
| **Pipeline** (3) | `ctx_get_pipeline`, `ctx_set_stage`, `ctx_update_pipeline` |
| **Agents** (2) | `ctx_list_agents`, `ctx_create_agent` |
| **Evaluation** (6) | `ctx_eval_start`, `ctx_eval_provider`, `ctx_eval_complete`, `ctx_eval_ci_update`, `ctx_eval_report`, `ctx_routing_health` |

## Installation

### Dependencies

```bash
npm install
```

### Automated setup (all providers)

```bash
node scripts/ctx-setup.js all
```

Or individually: `node scripts/ctx-setup.js codex|gemini|opencode`

### Update only installed providers

```bash
npm run update:providers
```

This command updates Claude/Codex/Gemini/OpenCode only if they are detected on the machine.
Missing providers are skipped automatically.

### Provider limits statusline (CLI)

One-line status for provider usage limits/auth state, designed for a separate terminal window.

```bash
npm run statusline:providers
```

Live mode (updates every 15 seconds):

```bash
npm run statusline:providers:watch
```

### GitHub labels (first time)

```bash
gh label create session --color 0E8A16 -R YourUser/your-repo
gh label create lesson --color D93F0B -R YourUser/your-repo
gh label create consilium --color 5319E7 -R YourUser/your-repo
```

## Cross-provider setup

### Claude Code

Works out of the box — `.mcp.json` is pre-configured.

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ctx-hub": {
      "command": "node",
      "args": ["/absolute/path/to/ctx-plugin/scripts/ctx-mcp-hub.js"]
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
      "args": ["/absolute/path/to/ctx-plugin/scripts/ctx-mcp-hub.js"]
    }
  }
}
```

### Codex CLI

Codex CLI does not support MCP. It participates in consilium via bash invocation and uses the CLI wrapper (`scripts/ctx-cli.js`).

## Dashboard API

Backend: `scripts/dashboard-backend.js`

| Endpoint | Description |
|----------|-------------|
| `GET /api/state` | Current pipeline state |
| `GET /api/kb/search?q=...&limit=10&project=...` | Knowledge base search |
| `GET /api/kb/context/:project?limit=5` | Project context snapshot |
| `GET /api/kb/stats` | KB statistics |
| `POST /api/kb/save` | Save lesson to KB |
| `POST /api/kb/sync` | Pull/push KB sync |
| `GET /events` | SSE stream (retry + Last-Event-Id replay) |
| `GET /storage-health` | Storage health + policy state |

Auth: `Authorization: Bearer <token>` or `?token=<token>`. Token is generated on startup and saved in `.data/.dashboard-token`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CTX_ADAPTIVE_ROUTING` | enabled | Set to `0` to disable adaptive routing |
| `CTX_STORAGE` | `sqlite` | Storage backend: `sqlite` or `json` |
| `CTX_SQLITE_FALLBACK_JSON` | `0` | Enable JSON fallback on SQLite failures |
| `CTX_SQLITE_AUTO_ROLLBACK` | `0` | Enable auto rollback policy |
| `CTX_DATA_DIR` | `.data` | Data directory path |

## Testing

```bash
npm test                                    # All 173 tests
node --test tests/consilium-rounds.test.mjs # Consilium + feedback loop
node --test tests/adaptive-weight.test.mjs  # Adaptive routing scoring
```

## Requirements

- Node.js 20+
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated
- [Claude Code](https://claude.com/claude-code) v1.0.33+ (for MCP integration)
- Gemini CLI / OpenCode / Codex CLI — optional, for multi-provider features

## Versioning and Releases

### Versioning Strategy

This project follows **Semantic Versioning** (SemVer):

- **Major** (`x.0.0`) — Breaking changes, incompatible API changes
- **Minor** (`0.x.0`) — New features, backward-compatible additions
- **Patch** (`0.0.x`) — Bug fixes, backward-compatible fixes

**Version Sources:**
- `package.json` — Source of truth for current version
- Git tags — Each release is tagged as `vX.Y.Z`

### CHANGELOG

All notable changes are documented in [CHANGELOG.md](./CHANGELOG.md):

- **Added** — New features
- **Changed** — Changes to existing functionality
- **Deprecated** — Soon-to-be removed features
- **Removed** — Removed features
- **Fixed** — Bug fixes
- **Security** — Security updates

### Release Process

1. **Update version** in `package.json`:
   ```bash
   npm version major|minor|patch
   ```

2. **Update CHANGELOG.md** with release notes for the new version

3. **Commit and tag**:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: release vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```

4. **Automated publishing** — GitHub Actions publishes to npm automatically on tag push

### Check Current Version

```bash
node -p "require('./package.json').version"
```

## npm publish on push

Repository includes GitHub Actions workflow that publishes package to npm on each push to `master`/`main` if:
- `NPM_TOKEN` secret is configured
- `package.json` version is not published yet
