# Test-Driven Development

TDD red-green-refactor protocol. MUST be followed when writing new functionality.

## Protocol

For each unit of functionality, repeat this cycle:

1. **RED — Write the test FIRST**:
   - Write a test that describes the expected behavior
   - The test MUST fail (because the code does not exist yet)
   - Run the test to confirm it fails
   - If the test passes without new code, the test is wrong — rewrite it

2. **GREEN — Write minimal code**:
   - Write the MINIMUM code required to make the test pass
   - Do not add extra features, optimizations, or edge case handling
   - Run the test to confirm it passes
   - If it still fails, fix the code (not the test)

3. **REFACTOR — Clean up**:
   - Improve code structure without changing behavior
   - Remove duplication
   - Improve naming
   - Run ALL tests to confirm nothing broke

4. **REPEAT** — move to the next unit of functionality

## TDD Rules

- NEVER write production code without a failing test first
- NEVER write more code than needed to pass the current test
- NEVER skip the refactor step
- Tests must be deterministic (no random, no time-dependent)
- Each test should test ONE thing
- Test names should describe the expected behavior

## Output Format

```
## TDD Cycle Log

### Cycle 1: [feature/behavior]
- **RED:** wrote test `[test name]` — FAILS as expected
- **GREEN:** implemented `[function/module]` — test PASSES
- **REFACTOR:** [what was improved]

### Cycle 2: [feature/behavior]
...

## Final Test Results
- **Total:** N | **Passed:** N | **Failed:** N
```
