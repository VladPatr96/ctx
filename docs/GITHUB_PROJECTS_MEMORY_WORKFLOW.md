# GitHub Projects Memory Workflow for CTX

Этот документ фиксирует, как вести CTX по модели из статьи про GitHub Projects как external memory для AI-агента.

Он дополняет:

- PRD v1.1: `ctx_v_1_1_architecture_delta.md`
- product backlog: `.auto-claude/all_project_specs.md`
- issue templates: `.github/ISSUE_TEMPLATE/*`

## 1. Canon

Роли документов разделяются так:

- `PRD v1.1` — архитектурные решения и migration direction
- `all_project_specs.md` — продуктовый backlog и горизонт фич
- `GitHub Project` — оперативная доска исполнения
- `GitHub Issues` — долговременная память по инициативам, решениям и checkpoint-сессиям

Правило:

- backlog не исполняется напрямую из markdown
- любой реальный work item должен жить в issue
- любая сессия должна оставлять checkpoint в issue comments

## 2. What we optimize for now

Проект уже имеет сильный прототип. Поэтому приоритет не в создании новой фиче-карты, а в стабилизации ядра.

### Phase 0 — Core Rewrite

1. Contract layer
2. SQLite-first storage boundary
   Это migration target для Phase 0-1; текущий runtime default остается `json`, пока нет отдельного cutover issue.
3. Task/step runtime state machine
4. Provider mode abstraction (`api` / `cli` / `agent`)
5. Port algorithmic cores
6. Minimal API / CLI entrypoint

### Phase 1 — Stabilize Existing Product

1. Dashboard на стабильном source of truth
2. Wizard в зеленом состоянии
3. Error/offline/degraded UX states
4. Hermetic tests

### Phase 2 — Product Intelligence

1. Provider analytics
2. Cost insights
3. Routing feedback loop
4. Docs/reference
5. Claim graph polish

## 3. GitHub Project structure

Нужен один GitHub Project уровня продукта.

### Status columns

- `Backlog`
- `Todo`
- `In Progress`
- `Blocked`
- `Done`

### Recommended custom fields

- `Stream`: `Core`, `Product`, `Quality`, `Research`
- `Phase`: `0`, `1`, `2`, `3+`
- `Priority`: `High`, `Medium`, `Low`
- `Effort`: `S`, `M`, `L`, `XL`
- `Type`: `Epic`, `Task`, `Bug`, `Decision`, `Checkpoint`
- `Source`: `PRD`, `Backlog`, `Code`, `Incident`
- `Area`: `Providers`, `Routing`, `CBDP`, `Storage`, `Dashboard`, `Wizard`, `Docs`, `Knowledge`
- `Status Reason`: `waiting_on_decision`, `waiting_on_review`, `blocked_by_core`, `blocked_by_runtime`
- `Agent Owner`: `human`, `codex`, `claude`, `gemini`, `opencode`

## 4. Issue types

### Epic

Большая инициатива с долгоживущим контекстом.

### Task

Конкретная исполнимая работа.

### Decision

ADR-level выбор, который должен быть зафиксирован отдельно.

### Checkpoint

Точка восстановления между сессиями. Обычно это comment в основном issue, но при необходимости можно использовать отдельный checkpoint issue.

## 5. Issue templates

В репозитории уже подготовлены шаблоны:

- `.github/ISSUE_TEMPLATE/01-epic.md`
- `.github/ISSUE_TEMPLATE/02-task.md`
- `.github/ISSUE_TEMPLATE/03-decision.md`
- `.github/ISSUE_TEMPLATE/04-checkpoint.md`

Этого достаточно, чтобы вести работу по единой форме и не терять контекст между сессиями.

## 6. Initial issue set

Начальный набор должен быть компактным.

### Decisions

1. `decision: accept SQLite-first ADR for phase 0-1 as canonical`
2. `decision: dashboard reads storage adapter, not raw JSON files`
3. `decision: classify current tests into port / rewrite / delete groups`

### Epics

1. `epic: core contract and schema foundation`
2. `epic: core state machine runtime and execution policy`
3. `epic: core provider mode abstraction and lifecycle hooks`
4. `epic: core sqlite-first storage and traceable artifacts`
5. `epic: product surfaces on top of stable core`
6. `epic: migration-safe test system`

Current baseline for test migration:

- `docs/TEST_MIGRATION_CLASSIFICATION.md`

### First tasks

1. `task: define ArtifactBundleSchema and RoutingDecisionSchema`
2. `task: introduce step-level runtime state machine`
3. `task: formalize provider modes api/cli/agent`
4. `task: remove dashboard dependency on raw .data JSON files`
5. `task: fix wizard E2E and make tests hermetic`
6. `task: align README with actual architecture and tool count`

## 7. Session memory rule

Каждая рабочая сессия должна завершаться checkpoint-записью.

Формат:

```md
Checkpoint YYYY-MM-DD

- Done:
- Found:
- Changed files:
- Risks:
- Next:
```

Это обязательное правило, если мы хотим, чтобы GitHub Issues действительно работали как external memory.

## 8. Bootstrap after GitHub auth

Сейчас `gh` в локальной среде не авторизован, поэтому remote-объекты не созданы.

После авторизации выполнить:

```bash
gh auth login
gh auth refresh -s project
gh auth status
```

Дальше:

```bash
gh project create --owner VladPatr96 --title "CTX v1.1 Roadmap"
```

После этого:

1. создать поля project
2. открыть initial issue set
3. привязать issues к project
4. вести всю дальнейшую работу только через project + issues

## 9. Working rule

Порядок работы всегда один и тот же:

1. взять issue из `Todo`
2. уточнить scope в issue body
3. выполнить работу в коде
4. оставить checkpoint comment
5. перевести issue в следующий status

Project — это оперативная доска.
Issue — это долговременная память.
Comments — это recoverable session log.
