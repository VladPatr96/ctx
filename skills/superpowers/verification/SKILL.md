# Verification

Post-implementation verification protocol. MUST be executed before declaring work complete.

## Protocol

1. **Run tests**:
   - Execute the project's test suite
   - Note pass/fail counts
   - If tests fail, report failures with details

2. **Verify file completeness**:
   - Check that ALL files listed in the plan were created or modified
   - Check that no planned files are missing
   - Verify file contents match expected structure

3. **Check for unintended changes**:
   - Review git diff for unexpected modifications
   - Ensure no files outside the plan scope were changed
   - Look for debug code, console.log, TODO comments left behind

4. **Git diff review**:
   - Run `git diff` and `git status`
   - Verify staged changes match the plan
   - Check for untracked files that should be included

5. **Produce verdict**:
   - **ready**: all checks pass, work is complete
   - **not-ready**: list what needs to be fixed

## Output Format

```
## Verification Report

### Tests
- **Total:** N | **Passed:** N | **Failed:** N
- Failed tests: [list or "none"]

### File Completeness
- **Planned files:** [count]
- **Created/modified:** [count]
- **Missing:** [list or "none"]

### Unintended Changes
- [list or "none found"]

### Git Status
- **Modified:** [files]
- **Untracked:** [files]
- **Clean:** yes/no

### Verdict: ready / not-ready
**Issues to resolve:** [list or "none"]
```
