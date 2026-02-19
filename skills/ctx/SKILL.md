---
name: ctx
description: >
  Unified pipeline для управления проектом: от индексации до выполнения.
  Одна команда — полный цикл: DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE.
  Поддерживает реверсивную оркестрацию (любой AI провайдер как ведущий),
  агентов-сотрудников и мини-консилиумы внутри провайдера.
---

# /ctx — Unified Pipeline

Единая точка входа для всех операций CTX.

## Команды

```
/ctx                       → Авто-старт pipeline (DETECT + CONTEXT)
/ctx task <описание>       → Определить задачу (→ TASK)
/ctx brainstorm            → Диалог с ведущим агентом (→ BRAINSTORM)
/ctx plan                  → Генерация плана, одобрение (→ PLAN)
/ctx execute               → Делегирование агентам (→ EXECUTE)
/ctx save                  → Сохранение сессии
/ctx status                → Текущая стадия + состояние
/ctx lead <провайдер>      → Сменить ведущего (claude/gemini/opencode/codex)
/ctx agents                → Список агентов
/ctx search <запрос>       → Поиск по базе знаний
/ctx consilium <тема>      → Мульти-провайдерный совет
/ctx delegate <задача>     → Умный роутинг задачи к провайдеру
```

---

## Pipeline State Machine

```
DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE
```

Состояние хранится в `.data/pipeline.json`. Используй MCP tools:
- `ctx_get_pipeline()` — текущее состояние
- `ctx_set_stage(stage, data?)` — переход
- `ctx_update_pipeline(patch)` — обновить поля

---

## /ctx (без аргументов) — Авто-старт

### DETECT

1. Проверь наличие `.data/index.json`:
   - Есть → проект существующий, `isNew = false`
   - Нет → новый проект, `isNew = true`
2. Установи pipeline через `ctx_set_stage("detect", { isNew: ... })`

### CONTEXT

1. Запусти индексацию:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-indexer.js"
```

Если скрипт недоступен, выполни вручную:
```bash
ls package.json go.mod requirements.txt Cargo.toml pom.xml 2>/dev/null
find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -name node_modules -not -name .git | head -50
git status --short 2>/dev/null
git log -5 --oneline 2>/dev/null
```

2. Загрузи контекст из Knowledge Base:
```
ctx_get_project_context(project: PROJECT_NAME, limit: 5)
```
Если KB пуста или недоступна — fallback на gh CLI:
```bash
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
gh issue list -L 20 --json number,title,labels,state 2>/dev/null
gh search issues "label:lesson label:project:$PROJECT_NAME" --owner VladPatr96 --limit 5 --json title,body
gh issue list -l blocker --state open --json number,title,body 2>/dev/null
gh issue list -l wip --state open --json number,title,body 2>/dev/null
```

3. Обнови pipeline: `ctx_set_stage("context", { context: { index, issues, history } })`

4. Создай файл лога сессии `.sessions/YYYY-MM-DD-HHmm.md`:
```markdown
# Session YYYY-MM-DD HH:mm
**Project:** [имя проекта]
**Branch:** [текущая ветка git]
**Lead:** [текущий lead провайдер]
**Goals:** [спросить у пользователя или определить из контекста]

## Project Map
## Context Loaded
## Actions
## Errors & Solutions
## Decisions
## Files Modified
## Tasks
## Summary
```

5. Покажи сводку и предложи определить задачу:
```
Pipeline started: DETECT → CONTEXT
Project: [имя] ([стек])
Lead: [провайдер]
Open issues: N
Lessons found: N

Define your task with: /ctx task <описание>
Or choose from open issues above.
```

---

## /ctx task <описание>

1. Запиши задачу: `ctx_update_pipeline({ task: "<описание>" })`
2. Перейди на стадию TASK: `ctx_set_stage("task")`
3. Покажи подтверждение и предложи brainstorm:
```
Task set: <описание>
Next: /ctx brainstorm — discuss with lead provider
      /ctx plan — skip to planning
```

---

## /ctx brainstorm [флаги]

Диалог с ведущим провайдером (lead) или несколькими агентами.

### Флаги
- `--agents architect,researcher,reviewer` — мульти-агентный brainstorm
- (без флагов) → диалог с lead провайдером

### Режим: Lead Provider (дефолт)

#### Если lead = claude (дефолт)

Используй Task tool с subagent_type "general-purpose":
- Передай контекст: задачу, карту проекта, релевантные уроки
- Загрузи агента `researcher.md` как промпт для субагента
- Результат запиши в pipeline: `ctx_update_pipeline({ brainstorm: { messages, summary } })`

#### Если lead != claude (gemini, codex)

Вызови через bash (one-shot), передав всю историю в промпте:
```bash
gemini -p "Context: [project map + task + previous messages]
Task: [задача]
Respond with your analysis and suggestions." -o text
```

### Режим: Multi-Agent Brainstorm (--agents)

Запусти несколько агентов **параллельно** через Task tool. Каждый анализирует задачу со своей позиции:
- Используй `ctx_agent_consilium(topic, agents, projectContext)` для промптов
- Собери ответы и синтезируй

**Лимит:** после 5 ходов brainstorm — автоматическая суммаризация через Task tool.

После завершения brainstorm:
```
Brainstorm complete. Summary: [краткое резюме]
Next: /ctx plan — generate implementation plan
```

Перейди: `ctx_set_stage("brainstorm", { brainstorm: { summary } })`

---

## /ctx plan

1. Загрузи агента `architect.md`
2. Используй Task tool с subagent_type "general-purpose":
   - Передай: задачу, brainstorm summary, контекст проекта
   - Запроси 2-3 варианта плана с trade-offs
3. Покажи пользователю варианты через AskUserQuestion
4. Запиши выбранный план: `ctx_update_pipeline({ plan: { selected: N, variants, agents } })`
5. Перейди: `ctx_set_stage("plan")`

```
Plan ready. Selected: Variant N
Agents assigned: [список]
Next: /ctx execute — start implementation
```

---

## /ctx execute

1. Прочитай утверждённый план из pipeline
2. Определи агентов для каждой подзадачи:
   - Код → `implementer.md`
   - Тесты → `tester.md`
   - Документация → `documenter.md`
   - При необходимости создай кастомных через `ctx_create_agent`
3. Запусти агентов через Task tool (параллельно где возможно)
4. После выполнения запусти `reviewer.md` для code review
5. При замечаниях — итерация
6. Перейди: `ctx_set_stage("execute")`, затем `ctx_set_stage("done")` по завершении

---

## /ctx save

### 1. Заполнить Summary в логе сессии

### 2. Сохранить в Knowledge Base (локально, <5ms)
```
ctx_save_lesson(project: PROJECT_NAME, category: "session-summary", title: "Session summary", body: "[сводка]")
ctx_kb_sync(action: "push")
```

### 3. Сохранить в GitHub Issues (гибридная запись)

**В репозитории проекта:**
```bash
gh issue create \
  --title "Session: $(date +%Y-%m-%d) — краткое описание" \
  --label "session,provider:claude-code" \
  --body "[сводка сессии]"
```

**В центральный репо:**
```bash
gh issue create -R VladPatr96/my_claude_code \
  --title "Session: $PROJECT_NAME $(date +%Y-%m-%d) — краткое описание" \
  --label "session,project:$PROJECT_NAME" \
  --body "[ключевые уроки и решения]"
```

### 4. Обновить WIP issues — закрыть завершённые, создать новые для незавершённого

---

## /ctx status

Покажи текущее состояние pipeline:
```
Pipeline: [текущая стадия]
Lead: [провайдер]
Task: [описание задачи или "not set"]
Brainstorm: [summary или "not started"]
Plan: [selected variant или "not ready"]
Agents: [N base + M generated]
```

Данные бери из `ctx_get_pipeline()`.

---

## /ctx lead <провайдер>

1. Проверь health провайдера через `ctx_delegate_task` с пустой задачей или bash:
```bash
<provider> --version
```
2. Обнови pipeline: `ctx_update_pipeline({ lead: "<провайдер>" })`
3. Подтверди:
```
Lead changed: [old] → [new]
Brainstorm and planning will now use [new] as primary.
```

---

## /ctx agents

Вызови `ctx_list_agents()` и покажи:
```
Agents (N base + M generated):

Base:
  architect     — Декомпозиция, API контракты     [PLAN]
  implementer   — Написание кода                  [EXECUTE]
  reviewer      — Code review                     [EXECUTE]
  tester        — Тесты, покрытие                 [EXECUTE]
  researcher    — Исследование, PoC               [BRAINSTORM]
  documenter    — README, API docs                [EXECUTE]
  pipeline-ctrl — Управление pipeline             [internal]

Generated:
  [список или "none"]
```

---

## /ctx search <запрос>

Поиск по кросс-проектной базе знаний (FTS5):

```
ctx_search_solutions(query: "$ARGUMENTS", limit: 10)
```

Если результаты пусты и `CTX_KB_GH_FALLBACK=1`, автоматически используется gh CLI fallback.

Покажи результаты и предложи адаптацию для текущего проекта.

---

## /ctx consilium <тема> [флаги]

Мульти-провайдерный или агентный консилиум.

### Флаги
- `--providers claude,gemini` — выбрать конкретных провайдеров
- `--agents architect,researcher,reviewer` — внутренний агентный консилиум
- `--preset <name>` — использовать пресет из `consilium.presets.json`
- `--inner <provider>` — мини-консилиум с разными моделями одного провайдера
- (без флагов) → интерактивный выбор через AskUserQuestion

### Интерактивный выбор (без флагов)

Вызови AskUserQuestion:
```
Выберите режим консилиума:
[A] Все провайдеры (full)
[B] Быстрый — Claude + Gemini (fast)
[C] Code review — Codex + Claude (code-only)
[D] Агенты — architect + researcher + reviewer (agents-core)
[E] Выбрать вручную
```

### Пресеты

Загрузи через `ctx_consilium_presets()`. Встроенные пресеты:
- `full` — все провайдеры (claude, gemini, codex)
- `fast` — claude + gemini
- `code-only` — codex + claude
- `agents-core` — architect + researcher + reviewer
- `agents-full` — все агенты

### Режим: Provider Consilium (--providers)

Подготовь промпт-шаблон и запусти выбранных провайдеров **параллельно**:
- **Claude** → Task tool, subagent_type: "general-purpose", model: "sonnet"
- **Gemini** → `gemini -p "<промпт>" -o text`
- **Codex** → `codex exec --ephemeral --skip-git-repo-check "<промпт>"`

### Режим: Agent Consilium (--agents)

Запусти выбранных агентов через Task tool **параллельно**. Используй `ctx_agent_consilium(topic, agents, projectContext)` для получения промптов.

Каждый агент анализирует тему **со своей позиции**:
- **architect** → архитектура, масштабируемость
- **researcher** → паттерны, прецеденты, альтернативы
- **reviewer** → риски, качество, edge cases
- **tester** → тестируемость, покрытие
- **implementer** → сложность реализации, практичность

### Synthesize
1. **Общее** — в чём согласны
2. **Различия** — где расходятся и почему
3. **Уникальное** — что увидел только один
4. **Конфликты** — противоположные рекомендации

### Decide + Log
Прими решение и сохрани:
```bash
gh issue create -R VladPatr96/my_claude_code \
  --title "Consilium: [тема]" \
  --label "consilium,project:$PROJECT_NAME" \
  --body "[решение]"
```

---

## /ctx delegate <задача>

Умное делегирование. Авто-роутинг по типу задачи.

### Флаги
- `--provider <name>` — явный выбор
- `--multi` — параллельно нескольким

### Workflow
1. **ROUTE**: определи провайдера через роутер
2. **CONFIRM**: спроси подтверждение (AskUserQuestion)
3. **DISPATCH**: вызови провайдера
4. **RESULT**: покажи ответ
5. **LOG**: запиши через `ctx_log_action`

---

## В процессе работы

### Логирование действий
После каждого значимого действия: `ctx_log_action({ action, file, result })`

### При обнаружении и решении бага
1. `ctx_log_error({ error, solution, prevention })`
2. Создай GitHub Issue с меткой `lesson`:
```bash
gh issue create -R VladPatr96/my_claude_code \
  --title "Lesson: краткое описание" \
  --label "lesson,project:$PROJECT_NAME" \
  --body "[ошибка + решение + предотвращение]"
```

---

## Правила

1. **Тонкий диспетчер** — SKILL.md только маршрутизирует, вся логика в субагентах
2. **Pipeline state** — все данные в `.data/pipeline.json` через MCP tools
3. **Изоляция consilium** — провайдеры не видят ответов друг друга до синтеза
4. **Уроки** — каждая ошибка → GitHub Issue с `lesson` label
5. `.sessions/` в `.gitignore` — логи приватны
6. Не дублируй — если урок уже в MEMORY.md, не создавай issue
