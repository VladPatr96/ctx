---
name: ctx-search
description: >
  Search solutions in cross-project knowledge base (GitHub Issues) via gh CLI.
  Finds lessons, error solutions, and architectural decisions from all projects.
  Use when facing a problem — it may have been solved before.
  No MCP required — pure bash with gh CLI.
---

# /ctx-search — Knowledge Base Search (Codex CLI)

Search past solutions across all projects. No MCP — uses gh CLI directly.

## Usage

`/ctx-search <query>` — search by problem description

## Workflow

### 1. Search lessons

```bash
gh search issues "$ARGUMENTS" --owner VladPatr96 --label lesson --json number,title,body,repository --limit 15
```

### 2. Search solutions

```bash
gh search issues "$ARGUMENTS" --owner VladPatr96 --label solution --json number,title,body,repository --limit 10
```

### 3. Search sessions

```bash
gh search issues "$ARGUMENTS" --owner VladPatr96 --label session --json number,title,body,repository --limit 10
```

### 4. Search consilium decisions

```bash
gh search issues "$ARGUMENTS" --owner VladPatr96 --label consilium --json number,title,body,repository --limit 5
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
