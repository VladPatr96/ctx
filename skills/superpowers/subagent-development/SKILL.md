# Subagent Development

Protocol for delegating subtasks to parallel subagents. MUST be followed when a task can be decomposed into independent blocks.

## Protocol

1. **Decompose the task** into independent blocks:
   - Each block must be self-contained (no shared mutable state)
   - Each block must have clear input and expected output
   - Minimize inter-block dependencies

2. **Select agent type** for each block:
   - Match the block's nature to the appropriate agent role
   - Consider: implementer, tester, researcher, documenter
   - If no existing agent fits, define a custom agent spec

3. **Launch in parallel** via Task tool:
   - Provide each subagent with: task description, relevant context, expected output format
   - Include file paths and constraints
   - Set clear boundaries (what the subagent should NOT touch)

4. **Collect results**:
   - Wait for all subagents to complete
   - Gather outputs from each

5. **Verify integrity**:
   - Check that outputs do not conflict (e.g., same file modified by two agents)
   - Verify all blocks produced expected output
   - Resolve any merge conflicts or inconsistencies
   - Assemble the final result

## Decomposition Rules

- A block is independent if it can be developed and tested without other blocks
- If two blocks must modify the same file, they are NOT independent — merge them
- Prefer more smaller blocks over fewer large blocks
- Each block should take roughly equal effort

## Output Format

```
## Task Decomposition

### Block 1: [name]
- **Agent:** [type]
- **Input:** [what it receives]
- **Output:** [what it produces]
- **Files:** [scope]
- **Status:** pending/running/done

### Block 2: [name]
...

## Integrity Check
- Conflicts: [none / list]
- Missing outputs: [none / list]
- Final status: [complete / issues found]
```
