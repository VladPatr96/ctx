# Brainstorming

Structured ideation protocol. MUST be executed before generating solutions or plan variants.

## Protocol

1. **Reframe the problem** — reformulate the problem statement in 3 different ways:
   - User's perspective (what they want to achieve)
   - Technical perspective (what the system must do)
   - Constraint perspective (what limits the solution space)

2. **List constraints** — enumerate what CANNOT be changed:
   - Existing APIs and contracts
   - Infrastructure limitations
   - Backward compatibility requirements
   - Time/resource constraints

3. **Generate approaches** — produce a minimum of 3 distinct approaches:
   - Each approach MUST differ in fundamental strategy, not just details
   - Include at least one unconventional/creative option

4. **Describe each approach**:
   - **Name**: short memorable label
   - **Essence**: one sentence describing the core idea
   - **Trade-off**: what you gain vs what you lose

5. **Score each approach** (1-5 scale):
   | Approach | Feasibility | Risk | Value |
   |----------|-------------|------|-------|
   | ...      | 1-5         | 1-5  | 1-5   |

6. **Select the best approach** — choose one and justify:
   - Why this approach wins over others
   - What risks remain and how to mitigate them

## Output Format

```
## Problem Reframing
1. [user perspective]
2. [technical perspective]
3. [constraint perspective]

## Constraints
- [constraint 1]
- [constraint 2]

## Approaches

### 1. [Name]
**Essence:** [one sentence]
**Trade-off:** [gain] vs [loss]

### 2. [Name]
...

### 3. [Name]
...

## Scoring
| Approach | Feasibility | Risk | Value |
|----------|-------------|------|-------|
| ...      | ...         | ...  | ...   |

## Decision
**Selected:** [name]
**Justification:** [why]
**Remaining risks:** [list]
```
