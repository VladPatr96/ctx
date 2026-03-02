---
name: ctx
description: >
  Универсальный CTX skill для всех провайдеров (Claude Code, Codex CLI, Gemini CLI, OpenCode).
  Автоматически определяет режим: MCP (Claude) или CLI wrapper (остальные).
  Полный функционал на всех провайдерах.
---

# /ctx — Универсальный CTX Pipeline

Единая точка входа для CTX на всех AI провайдерах.

## Режимы работы

**Автоматическое определение:**
- Если доступен MCP tool `ctx_get_pipeline` → **MCP mode** (Claude Code)
- Иначе → **CLI wrapper mode** (Codex, Gemini, OpenCode)

---

## Команды (одинаковые везде)

```
/ctx start           — Авто-старт pipeline (DETECT + CONTEXT)
/ctx task <описание> — Определить задачу (→ TASK)
/ctx brainstorm      — Диалог с ведущим агентом (→ BRAINSTORM)
/ctx plan            — Генерация плана, одобрение (→ PLAN)
/ctx execute         — Делегирование агентам (→ EXECUTE)
/ctx save            — Сохранение сессии
/ctx status          — Текущая стадия + состояние
/ctx lead <провайдер> — Сменить ведущего (claude/gemini/opencode/cодex)
/ctx agents          — Список агентов
/ctx search <запрос> — Поиск по базе знаний
/ctx consilium <тема> — Мульти-провайдерный совет
/ctx delegate <задача> — Умный роутинг задачи к провайдеру
```

---

## API (автоматический выбор)

### Получить состояние pipeline

**MCP mode:**
```
ctx_get_pipeline()
```

**CLI wrapper mode:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline
```

**Результат:** JSON с полями `stage`, `lead`, `task`, `context`, `brainstorm`, `plan`

---

### Установить стадию

**MCP mode:**
```
ctx_set_stage("context", { lead: "gemini", isNew: true })
```

**CLI wrapper mode:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" set_stage --stage context --data '{"lead":"gemini","isNew":true}'
```

---

### Обновить поля pipeline

**MCP mode:**
```
ctx_update_pipeline({ task: "Build API", lead: "gemini" })
```

**CLI wrapper mode:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" update_pipeline --patch '{"task":"Build API","lead":"gemini"}'
```

---

### Логировать действие

**MCP mode:**
```
ctx_log_action({ action: "code_written", file: "src/api.js" })
```

**CLI wrapper mode:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" log_action --entry '{"action":"code_written","file":"src/api.js"}'
```

---

### Логировать ошибку

**MCP mode:**
```
ctx_log_error({ error: "TypeError", solution: "Add null check", prevention: "Use optional chaining" })
```

**CLI wrapper mode:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" log_error --entry '{"error":"TypeError","solution":"Add null check","prevention":"Use optional chaining"}'
```

---

## Pattern: Универсальная операция

При выполнении любой операции:

1. **Определи режим:** проверь доступен ли `ctx_get_pipeline`
2. **Выбери метод:** MCP tool или CLI wrapper
3. **Выполни:** используй соответствующий метод
4. **Обработай результат:** парсь JSON ответ

### Пример универсального кода

```javascript
// 1. Получить состояние
if (typeof ctx_get_pipeline === 'function') {
  // MCP mode
  const result = ctx_get_pipeline();
  pipeline = JSON.parse(result.content[0].text);
} else {
  // CLI wrapper mode
  const output = bash('node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline');
  pipeline = JSON.parse(output.stdout);
}

// 2. Используй pipeline.stage, pipeline.lead, pipeline.task
```

---

## Pipeline State Machine

```
DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE
```

Состояние хранится в `.data/pipeline.json` (одинаково для всех провайдеров).

---

## /ctx start — Авто-старт

### DETECT

1. Проверь `.data/index.json`:
   - Есть → `isNew = false`
   - Нет → `isNew = true`

2. Установи pipeline:
   ```javascript
   // MCP или CLI wrapper (автоматически)
   setStage("detect", { isNew: isNewValue });
   ```

### CONTEXT

1. Запусти индексацию:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-indexer.js"
   ```

   Если недоступен — вручную:
   ```bash
   ls package.json go.mod requirements.txt Cargo.toml pom.xml 2>/dev/null
   find . -maxdepth 3 -type d -not -path '*/node_modules/*' | head -50
   git status --short 2>/dev/null
   git log -5 --oneline 2>/dev/null
   ```

2. Обнови контекст и перейди на стадию `context`
3. Создай session log в `.sessions/YYYY-MM-DD-HHmm.md`
4. Покажи результат:
   ```
   Pipeline: DETECT → CONTEXT
   Проект: [имя] ([стек])
   Lead: [provider]
   ```

---

## /ctx task <description>

```javascript
// MCP или CLI wrapper (автоматически)
updatePipeline({ task: "<description>" });
setStage("task");
logAction({ action: "task_set", task: "<description>" });
```

Покажи:
```
Task set: <description>
Next: /ctx brainstorm — обсудить подход
      /ctx plan — перейти к планированию
```

---

## /ctx status

Получи и покажи текущее состояние:
```javascript
const pipeline = getPipeline();

show(`
Pipeline: ${pipeline.stage}
Lead: ${pipeline.lead}
Task: ${pipeline.task || "not set"}
Brainstorm: ${pipeline.brainstorm?.summary || "not started"}
Plan: ${pipeline.plan?.selected ? `Variant ${pipeline.plan.selected}` : "not ready"}
`);
```

---

## /ctx lead <provider>

Сменить ведущего провайдера:

```javascript
updatePipeline({ lead: "<provider>" });
```

Доступные: `claude`, `gemini`, `opencode`, `codex`

---

## /ctx brainstorm

Обсуждение с ведущим агентом.

1. Прочитай `agents/researcher.md`
2. Выполни инструкции с контекстом: `pipeline.task`, `pipeline.context`
3. Обнови `pipeline.brainstorm.summary`
4. Перейди на стадию `brainstorm`
5. Покажи сводку и предложи `/ctx plan`

---

## /ctx plan

1. Прочитай `agents/architect.md`
2. Сгенерируй 2-3 варианта плана
3. Получи одобрение от пользователя
4. Обнови `pipeline.plan`
5. Перейди на стадию `plan`
6. Покажи выбран план и предложи `/ctx execute`

---

## /ctx execute

1. Получи план из `pipeline.plan.selected`
2. Для каждого подзадача прочитай соответствующий агент:
   - Код → `agents/implementer.md`
   - Тесты → `agents/tester.md`
   - Доки → `agents/documenter.md`
3. Выполни подзадачи
4. После всех подзадач выполни code review (`agents/reviewer.md`)
5. Перейди на стадию `execute`, затем `done`
6. Логируй все действия

---

## /ctx save

1. Прочитай session log из `.sessions/`
2. Заполни раздел Summary
3. Создай GitHub Issue:
   ```bash
   gh issue create \
     --title "Session: $(date +%Y-%m-%d) — <краткое описание>" \
     --label "session,provider:<current>" \
     --body "[сводка сессии]"
   ```
4. Обнови WIP issues

---

## /ctx search <query>

Поиск в базе знаний:

**MCP mode:**
```
ctx_search_solutions("<query>")
```

**CLI wrapper mode:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" search "<query>"
```

Покажи результаты и как применить к текущему проекту.

---

## /ctx consilium <topic>

Мульти-провайдерный консилиум (требует MCP или CLI wrapper).

1. Подготовь промпт с контекстом проекта
2. Запусти 4 провайдера параллельно:
   - Claude (через Task tool)
   - Gemini (через bash)
   - OpenCode (через bash)
   - Codex (внутренняя логика)
3. Синтезируй результаты
4. Создай GitHub Issue с решением

---

## /ctx delegate <task>

Умный роутинг задачи к провайдеру.

**MCP mode:**
```
ctx_delegate_task({ task: "<task>", projectContext: {...} })
```

**CLI wrapper mode:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" delegate --task "<task>" --context '...'
```

Провайдер выберет подходящего агента и вернёт результат.

---

## Правила

1. **Автоматический режим** — определи MCP или CLI, не спрашивай
2. **Один API** — одна и та же логика, один и тот же функционал
3. **JSON везде** — все результаты в JSON, парсь их
4. **Логирование** — все действия логируй через `log_action`
5. **Уроки** — баги → GitHub Issues с `lesson` label
6. **Общее состояние** — `.data/pipeline.json` общий для всех провайдеров

---

## Установка

### Claude Code
- MCP настроен в `.mcp.json`
- Работает из коробки

### Codex CLI
- Скопируй `skills/ctx/SKILL.md` в `.codex/skills/ctx/`
- Работает через CLI wrapper

### Gemini CLI
- Скопируй `skills/ctx/SKILL.md` в `~/.config/gemini-cli/skills/ctx/`
- Работает через CLI wrapper

### OpenCode
- Скопируй `skills/ctx/SKILL.md` в `[OpenCode skills]/ctx/`
- Работает через CLI wrapper

---

## Поддерживаемые провайдеры

| Провайдер    | Режим            | Команда |
|--------------|------------------|---------|
| Claude Code  | MCP native       | `/ctx`  |
| Codex CLI    | CLI wrapper      | `/ctx`  |
| Gemini CLI   | CLI wrapper      | `/ctx`  |
| OpenCode     | CLI wrapper      | `/ctx`  |

**Один и тот же функционал везде!** ✨
