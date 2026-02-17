---
name: ctx
description: >
  Unified pipeline for Codex CLI. Full cycle: DETECT, CONTEXT, TASK, BRAINSTORM, PLAN, EXECUTE, DONE.
  No MCP — all state via file Read/Write operations on .data/pipeline.json.
---

# /ctx — Unified Pipeline (Codex CLI)

Single entry point for all CTX operations. Codex version uses file operations instead of MCP tools.

## Commands

```
/ctx                       -> Auto-start pipeline (DETECT + CONTEXT)
/ctx task <description>    -> Define task (-> TASK)
/ctx brainstorm            -> Discuss with lead provider (-> BRAINSTORM)
/ctx plan                  -> Generate plan, get approval (-> PLAN)
/ctx execute               -> Delegate to agents (-> EXECUTE)
/ctx save                  -> Save session
/ctx status                -> Current stage + state
/ctx search <query>        -> Search knowledge base
/ctx consilium <topic>     -> Multi-provider council
```

---

## Pipeline State Machine

```
DETECT -> CONTEXT -> TASK -> BRAINSTORM -> PLAN -> EXECUTE -> DONE
```

State is stored in `.data/pipeline.json`. Since Codex has no MCP, use file operations:

### Reading pipeline state

Read the file `.data/pipeline.json` and parse its JSON content.

### Writing pipeline state

1. Read `.data/pipeline.json`
2. Parse JSON
3. Modify the needed fields
4. Write the full JSON back to `.data/pipeline.json`

### Logging actions

Append a JSON line to `.data/log.jsonl`:
```json
{"ts":"2026-02-17T12:00:00Z","action":"stage_change","from":"detect","to":"context"}
```

---

## /ctx (no arguments) — Auto-start

### DETECT

1. Check if `.data/index.json` exists:
   - Exists: existing project, `isNew = false`
   - Missing: new project, `isNew = true`
2. Read `.data/pipeline.json` (create if missing with default structure):
```json
{
  "stage": "detect",
  "lead": "codex",
  "task": null,
  "context": {},
  "brainstorm": {},
  "plan": {}
}
```
3. Set stage to "detect" with `isNew` flag, write back.

### CONTEXT

1. Run indexing manually:
```bash
ls package.json go.mod requirements.txt Cargo.toml pom.xml 2>/dev/null
find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -name node_modules -not -name .git | head -50
git status --short 2>/dev/null
git log -5 --oneline 2>/dev/null
```

2. Load context from GitHub Issues:
```bash
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
gh issue list -L 20 --json number,title,labels,state 2>/dev/null
gh search issues "label:lesson" --owner VladPatr96 --limit 10 --json title,body,repository
gh search issues "label:lesson label:project:$PROJECT_NAME" --owner VladPatr96 --limit 5 --json title,body
gh issue list -l blocker --state open --json number,title,body 2>/dev/null
gh issue list -l wip --state open --json number,title,body 2>/dev/null
```

3. Update pipeline.json: set stage to "context", merge context data. Write back.

4. Create session log file `.sessions/YYYY-MM-DD-HHmm.md`:
```markdown
# Session YYYY-MM-DD HH:mm
**Project:** [project name]
**Branch:** [current git branch]
**Lead:** codex
**Goals:** [ask user or detect from context]

## Project Map
## Context Loaded
## Actions
## Errors & Solutions
## Decisions
## Files Modified
## Tasks
## Summary
```

5. Show summary and suggest defining a task:
```
Pipeline started: DETECT -> CONTEXT
Project: [name] ([stack])
Lead: codex
Open issues: N
Lessons found: N

Define your task with: /ctx task <description>
Or choose from open issues above.
```

---

## /ctx task <description>

1. Read `.data/pipeline.json`
2. Set `task` field to the description
3. Set `stage` to "task"
4. Write back to `.data/pipeline.json`
5. Append to `.data/log.jsonl`: `{"ts":"...","action":"task_set","task":"<description>"}`
6. Show:
```
Task set: <description>
Next: /ctx brainstorm — discuss approach
      /ctx plan — skip to planning
```

---

## /ctx brainstorm

Discussion with lead provider about the approach.

### If lead = codex (default)

Read the agent file `agents/researcher.md` and follow its instructions:
- Use the task from pipeline.json
- Use the project context from pipeline.json
- Produce analysis and suggestions

### If lead = other provider

Call via bash (one-shot), passing full context in prompt:

**Gemini:**
```bash
gemini -p "Context: [project map + task]
Task: [task description]
Respond with your analysis and suggestions." -o text 2>&1 | head -200
```

**OpenCode:**
```bash
opencode run "Context: [project map + task]
Task: [task description]
Respond with your analysis and suggestions." 2>&1 | head -200
```

**Claude:**
```bash
claude -p "Context: [project map + task]
Task: [task description]
Respond with your analysis and suggestions." 2>&1 | head -200
```

**Limit:** after 5 rounds of brainstorm, produce automatic summary.

After brainstorm:
1. Read `.data/pipeline.json`
2. Set `brainstorm.summary` to the summary
3. Set `stage` to "brainstorm"
4. Write back
5. Append to log.jsonl
6. Show:
```
Brainstorm complete. Summary: [brief summary]
Next: /ctx plan — generate implementation plan
```

---

## /ctx plan

1. Read agent file `agents/architect.md`
2. Follow architect instructions with context: task, brainstorm summary, project map
3. Generate 2-3 plan variants with trade-offs
4. Show variants to user, ask which to select
5. Read `.data/pipeline.json`, set:
   - `plan.selected` = chosen variant number
   - `plan.variants` = all variants
   - `plan.agents` = list of agents needed
   - `stage` = "plan"
6. Write back to `.data/pipeline.json`
7. Append to log.jsonl
8. Show:
```
Plan ready. Selected: Variant N
Agents assigned: [list]
Next: /ctx execute — start implementation
```

---

## /ctx execute

1. Read `.data/pipeline.json`, get the approved plan from `plan.selected`
2. For each subtask in the plan, read the appropriate agent file:
   - Code -> `agents/implementer.md`
   - Tests -> `agents/tester.md`
   - Docs -> `agents/documenter.md`
3. Execute subtasks following agent instructions
4. After all subtasks, read `agents/reviewer.md` and perform code review
5. If review has issues — iterate
6. Update pipeline.json: set stage to "execute", then "done" when complete
7. Append all actions to log.jsonl

---

## /ctx save

### 1. Fill Summary in session log

Read the session log from `.sessions/`, fill in the Summary section.

### 2. Save to GitHub Issues

**In project repo:**
```bash
gh issue create \
  --title "Session: $(date +%Y-%m-%d) — brief description" \
  --label "session,provider:codex" \
  --body "[session summary]"
```

**In central repo:**
```bash
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
gh issue create -R VladPatr96/my_claude_code \
  --title "Session: $PROJECT_NAME $(date +%Y-%m-%d) — brief description" \
  --label "session,project:$PROJECT_NAME" \
  --body "[key lessons and decisions]"
```

### 3. Update WIP issues — close completed, create new for unfinished work

---

## /ctx status

Read `.data/pipeline.json` and show:
```
Pipeline: [current stage]
Lead: [provider]
Task: [task description or "not set"]
Brainstorm: [summary or "not started"]
Plan: [selected variant or "not ready"]
Agents: [list from agents/ directory]
```

---

## /ctx consilium <topic>

Multi-provider council. 4 providers analyze the task independently.

### Prepare

Read `.data/pipeline.json` for project context. Build a prompt template:
```
Project: [name] ([stack])
Structure: [key directories]
Task: [user's question]

Provide your proposal. Include:
1. Approach (what to do)
2. Rationale (why this way)
3. Risks (what can go wrong)
4. Alternatives (what else considered)
```

### Dispatch (parallel via bash)

Run all 4 providers in parallel:

```bash
# Claude
claude -p "<prompt>" 2>&1 | head -200
```

```bash
# Gemini
gemini -p "<prompt>" -o text 2>&1 | head -200
```

```bash
# OpenCode
opencode run "<prompt>" 2>&1 | head -200
```

```bash
# Codex (self, use internal reasoning)
# Since we ARE Codex, analyze the task directly
```

**Important:**
- Launch all external providers in parallel
- Each provider does NOT see others' answers
- Timeout: 60 seconds per provider
- Skip unresponsive providers

### Synthesize

Collect all responses and analyze:
1. **Consensus** — what providers agree on
2. **Differences** — where they diverge and why
3. **Unique insights** — what only one provider noticed
4. **Conflicts** — directly opposing recommendations

### Decide + Log

Make final decision and save:
```bash
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
gh issue create -R VladPatr96/my_claude_code \
  --title "Consilium: [brief topic]" \
  --label "consilium,project:$PROJECT_NAME" \
  --body "[decision from synthesis]"
```

---

## /ctx search <query>

Search the cross-project knowledge base:

```bash
gh search issues "$ARGUMENTS" --owner VladPatr96 --label lesson --json number,title,body,repository --limit 15
gh search issues "$ARGUMENTS" --owner VladPatr96 --label solution --json number,title,body,repository --limit 10
gh search issues "$ARGUMENTS" --owner VladPatr96 --label session --json number,title,body,repository --limit 10
gh search issues "$ARGUMENTS" --owner VladPatr96 --label consilium --json number,title,body,repository --limit 5
```

Show results and suggest how to adapt for current project.

---

## During work

### Logging actions

After each significant action, append to `.data/log.jsonl`:
```json
{"ts":"<ISO timestamp>","action":"<what>","file":"<path>","result":"<outcome>"}
```

### On discovering and fixing a bug

1. Append error to `.data/log.jsonl`:
```json
{"ts":"<ISO timestamp>","type":"error","error":"<description>","solution":"<how fixed>","prevention":"<how to prevent>"}
```
2. Create GitHub Issue with `lesson` label:
```bash
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
gh issue create -R VladPatr96/my_claude_code \
  --title "Lesson: brief description" \
  --label "lesson,project:$PROJECT_NAME" \
  --body "[error + solution + prevention]"
```

---

## Rules

1. **Thin dispatcher** — this skill only routes, all logic lives in agent files
2. **Pipeline state** — always in `.data/pipeline.json`, read before modify, write after
3. **Consilium isolation** — providers do not see each other's answers until synthesis
4. **Lessons** — every bug fix becomes a GitHub Issue with `lesson` label
5. `.sessions/` is in `.gitignore` — logs are private
6. No duplicates — if a lesson is already in MEMORY.md, do not create an issue
