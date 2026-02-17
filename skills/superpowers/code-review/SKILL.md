# Code Review

Structured code review protocol. MUST be executed before approving or rejecting changes.

## Protocol

1. **Read the plan** — understand what SHOULD have been implemented:
   - Expected files and changes
   - Acceptance criteria
   - Scope boundaries

2. **Read the diff** — understand what WAS implemented:
   - All modified files
   - Added/removed/changed lines
   - New dependencies introduced

3. **Run the checklist**:
   - **Security**: injection, XSS, secrets in code, unsafe eval, path traversal
   - **Code style**: naming conventions, consistent patterns, no dead code
   - **Edge cases**: null/undefined handling, empty arrays, boundary values
   - **Error handling**: try/catch where needed, meaningful error messages
   - **Tests**: new code has corresponding tests, existing tests still pass
   - **Scope**: no changes outside the plan scope

4. **Prioritize issues**:
   - **Critical**: security vulnerabilities, data loss risks, breaking changes -- MUST fix
   - **Important**: bugs, missing error handling, logic errors -- SHOULD fix
   - **Suggestion**: style improvements, refactoring opportunities -- NICE to fix

5. **Produce verdict**

## Output Format

```
## Review Summary
**Status:** approved / needs-changes / blocked
**Files reviewed:** [count]
**Issues found:** [count by priority]

### Critical
- [file:line] [description] — [suggested fix]

### Important
- [file:line] [description] — [suggested fix]

### Suggestions
- [file:line] [description]

### Approved Parts
- [list of well-implemented aspects]

### Plan Compliance
- [x] All planned files modified
- [x] No unplanned changes
- [x] Acceptance criteria met
```
