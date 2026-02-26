---
name: ctx-gemini
description: >
  CTX skill для Gemini CLI. Использует CLI wrapper scripts/ctx-cli.js.
  Работает как унифицированный pipeline для Gemini.
---

# /ctx-gemini — CTX для Gemini CLI

CTX pipeline для Gemini CLI. Работает через CLI wrapper.

## Установка

1. Скопировать `skills/ctx-gemini/` в директорию Gemini CLI skills
2. Убедиться что Node.js установлен (для CLI wrapper)
3. Команда `/ctx-gemini` для запуска

---

## Команды

```
/ctx-gemini start    — Запустить pipeline
/ctx-gemini task <desc>  — Установить задачу
/ctx-gemini status   — Статус pipeline
```

---

## Workflow

### /ctx-gemini start

1. Вызвать `ctx-cli.js get_pipeline`
2. Собрать контекст проекта (индексация)
3. Вызвать `ctx-cli.js set_stage --stage context`
4. Создать session log в `.sessions/`
5. Показать статус

### /ctx-gemini task <description>

1. Вызвать `ctx-cli.js update_pipeline --patch '{"task":"<description>"}'`
2. Вызвать `ctx-cli.js set_stage --stage task`
3. Вызвать `ctx-cli.js log_action --entry '{"action":"task_set"}'`
4. Предложить следующий шаг: `/ctx-gemini brainstorm`

### /ctx-gemini status

1. Вызвать `ctx-cli.js get_pipeline`
2. Парсь JSON результат
3. Показать состояние pipeline

---

## Базовые операции

Все операции выполняются через CLI wrapper:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" <command> [args]
```

Команды:
- `get_pipeline` — получить состояние
- `set_stage --stage <name>` — установить стадию
- `update_pipeline --patch <json>` — обновить поля
- `log_action --entry <json>` — логировать действие
- `log_error --entry <json>` — логировать ошибку

---

## Pattern: Чтение JSON из CLI

```bash
# Получить JSON
RESULT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline)

# Парсь JSON и используй значения
# Например: RESULT.stage, RESULT.task, RESULT.lead
```

---

## Примеры

```bash
# Получить текущий pipeline
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline

# Установить задачу
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" update_pipeline --patch '{"task":"Add authentication"}'

# Перейти на следующую стадию
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" set_stage --stage brainstorm

# Логировать код
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" log_action --entry '{"action":"code_written","file":"src/auth.js"}'
```

---

## Особенности Gemini CLI

- CLI команды выполняются через bash
- Результаты в stdout — нужно парсить JSON
- Используй `${CLAUDE_PLUGIN_ROOT}` для путей к скриптам
- Логируй все действия для трекинга
