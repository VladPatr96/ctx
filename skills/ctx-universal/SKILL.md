---
name: ctx-universal
description: >
  Универсальный CTX skill для провайдеров без MCP (Gemini CLI, OpenCode, Codex CLI).
  Использует CLI wrapper scripts/ctx-cli.js для вызова CTX tools.
---

# /ctx-universal — CTX для всех провайдеров

Универсальный интерфейс для работы с CTX pipeline через CLI.

## Команды

```
/ctx start           — Запустить pipeline (DETECT + CONTEXT)
/ctx task <desc>     — Установить задачу
/ctx status         — Показать статус
```

---

## Работа с pipeline через CLI wrapper

### Получить состояние pipeline

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline
```

### Установить стадию

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" set_stage --stage context
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" set_stage --stage context --data '{"lead":"gemini"}'
```

### Обновить pipeline

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" update_pipeline --patch '{"lead":"gemini","task":"Build API"}'
```

### Логирование действий

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" log_action --entry '{"action":"code_written","file":"src/api.js"}'
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" log_error --entry '{"error":"TypeError","solution":"Add null check","prevention":"Use optional chaining"}'
```

---

## /ctx start — Запуск pipeline

1. **DETECT:** Проверить `.data/index.json`
   ```bash
   test -f ".data/index.json" && echo "existing" || echo "new"
   ```

2. Получить текущее состояние:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline
   ```

3. Установить стадию "context" с флагом isNew:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" set_stage --stage context --data '{"isNew":true}'
   ```

4. Собрать контекст проекта (индексация):
   ```bash
   ls package.json go.mod requirements.txt Cargo.toml pom.xml 2>/dev/null
   find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.git/*' | head -50
   git status --short 2>/dev/null
   git log -5 --oneline 2>/dev/null
   ```

5. Создать session log:
   ```bash
   mkdir -p .sessions
   date +"%Y-%m-%d %H:%M"
   ```

6. Показать результат:
   ```
   Pipeline запущен: DETECT → CONTEXT
   Проект: [имя] ([стек])
   Lead: [provider]
   ```

---

## /ctx task <description>

1. Установить задачу:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" update_pipeline --patch '{"task":"<description>"}'
   ```

2. Перейти на стадию "task":
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" set_stage --stage task
   ```

3. Логировать действие:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" log_action --entry '{"action":"task_set","task":"<description>"}'
   ```

---

## /ctx status

Получить и показать текущее состояние:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline
```

Формат вывода:
```
Pipeline: [стадия]
Lead: [провайдер]
Task: [задача или "not set"]
Brainstorm: [сводка или "not started"]
Plan: [вариант или "not ready"]
```

---

## Pattern: Чтение результата CLI

Когда запускаешь CLI команду, всегда читай её stdout:

1. Получи JSON:
   ```bash
   RESULT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline)
   ```

2. Парсь JSON:
   ```json
   {
     "stage": "context",
     "lead": "gemini",
     "task": "Build REST API",
     ...
   }
   ```

3. Используй значения в логике

---

## Pattern: Обновление pipeline

Всегда читай → модифицируй → пиши:

1. Прочитай состояние:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline
   ```

2. Построй patch для нужных полей:
   ```json
   {
     "task": "New task description",
     "context": { "issues": [...] }
   }
   ```

3. Обнови:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" update_pipeline --patch '...'
   ```

---

## Правила

1. **CLI wrapper** — всегда вызывай `scripts/ctx-cli.js`, не работай с файлами напрямую
2. **JSON формат** — все результаты в JSON, парсь их перед использованием
3. **Path handling** — используй `${CLAUDE_PLUGIN_ROOT}` для путей
4. **Error handling** — проверяй exit codes CLI команд
5. **Log everything** — логируй все значимые действия через `log_action`
