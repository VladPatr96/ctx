# Executing Plans

Step-by-step plan execution protocol. MUST be followed when implementing an approved plan.

## Protocol

1. **Read the plan** — load the full approved plan from pipeline state:
   - Identify all phases and steps
   - Understand the execution order
   - Note the done criteria for each step

2. **Check dependencies** for the current step:
   - Verify all prerequisite steps are completed
   - Verify required files/modules exist
   - If dependencies are not met, STOP and report the blocker

3. **Execute the step**:
   - Implement exactly what the plan specifies
   - Do not add anything beyond the plan scope
   - Follow existing code patterns in the project

4. **Verify done criteria**:
   - Check the step's completion criteria from the plan
   - Run relevant tests if specified
   - Confirm the output matches expectations

5. **Log the result**:
   - Record what was done via ctx_log_action
   - Note any deviations from the plan
   - Record any issues encountered

6. **Move to next step**:
   - Update progress tracking
   - Check if the next step's dependencies are now met
   - Repeat from step 2

## Execution Rules

- NEVER skip steps — execute in the order specified by the plan
- NEVER add features not in the plan
- If a step fails, log the error and report — do not attempt workarounds without approval
- If the plan is ambiguous, ask for clarification rather than guessing

## Output Format

```
## Execution Progress

### Step 1: [name] -- DONE
- Files modified: [list]
- Result: [description]
- Issues: none

### Step 2: [name] -- IN PROGRESS
- Dependencies: [met/unmet]
- Status: [description]

### Step 3: [name] -- PENDING
- Blocked by: Step 2
```
