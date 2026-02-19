---
name: ctx-search
description: >
  Search solutions in cross-project knowledge base.
  Uses local SQLite KB (FTS5) first, then gh CLI as fallback.
  Finds lessons, error solutions, and architectural decisions from all projects.
  Use when facing a problem — it may have been solved before.
  No MCP required — uses kb-verify.js CLI or gh CLI.
---

# /ctx-search — Knowledge Base Search (Codex CLI)

Search past solutions across all projects. Uses local KB first, gh CLI as fallback.

## Usage

`/ctx-search <query>` — search by problem description

## Workflow

### 1. Search local Knowledge Base (FTS5)

```bash
node "${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}/scripts/knowledge/kb-verify.js" search "$ARGUMENTS"
```

### 2. If KB unavailable or empty — fallback to gh CLI

```bash
gh search issues "$ARGUMENTS" --owner VladPatr96 --label lesson --json number,title,body,repository --limit 15
gh search issues "$ARGUMENTS" --owner VladPatr96 --label solution --json number,title,body,repository --limit 10
```

### 5. Show results

For each found solution, show:

```
Found N solutions:

1. [project-name] Lesson: problem description
   Solution: brief solution description
   Issue: #NNN

2. [project-name] Session: what was done
   Key point: description
   Issue: #NNN
```

### 6. Adapt

If a solution is found, suggest how to adapt it for the current project:
- What from the solution applies directly
- What needs to change
- What dependencies/context differ

### 7. If nothing found

Inform the user and suggest:
- Refine the query
- Search with different keywords
- Solve the problem and save the lesson via `/ctx save`
