# Writing Plans

Structured planning protocol. MUST be executed before presenting an implementation plan.

## Protocol

1. **Define scope**:
   - **In scope**: what WILL be done
   - **Out of scope**: what will NOT be done (and why)

2. **Break into phases** (1-5 phases):
   - Each phase is a logical unit of work
   - Phases should be deliverable independently when possible

3. **Detail each phase**:
   - Files to create/modify
   - Dependencies (what must exist before this phase starts)
   - Done criteria (how to verify the phase is complete)

4. **Determine execution order**:
   - What can run in parallel
   - What must be sequential
   - Critical path identification

5. **Identify risks and mitigations**:
   - For each risk: likelihood, impact, mitigation strategy

6. **Output as markdown table**

## Output Format

```
## Scope
**In scope:** [list]
**Out of scope:** [list]

## Phases

| # | Phase | Files | Dependencies | Done Criteria |
|---|-------|-------|--------------|---------------|
| 1 | ...   | ...   | none         | ...           |
| 2 | ...   | ...   | Phase 1      | ...           |

## Execution Order
- **Parallel:** Phase 1, Phase 2
- **Sequential:** Phase 3 (after 1+2)
- **Critical path:** Phase 1 -> Phase 3 -> Phase 5

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ...  | low/med/high | low/med/high | ... |
```
