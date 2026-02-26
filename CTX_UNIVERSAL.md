# CTX — Универсальный Pipeline для всех провайдеров

CTX теперь работает **одинаково** на всех AI провайдерах: **Claude Code, Codex CLI, Gemini CLI, OpenCode**

✨ **Одна команда `/ctx` везде — один и тот же функционал**

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Universal CTX Layer                       │
│              Автоматический выбор режима                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Claude Code → MCP tools (ctx_get_pipeline, etc.)          │
│  Codex CLI  → CLI wrapper (scripts/ctx-cli.js)              │
│  Gemini CLI → CLI wrapper (scripts/ctx-cli.js)              │
│  OpenCode   → CLI wrapper (scripts/ctx-cli.js)              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Storage (.data/pipeline.json)              │
│        Общее состояние для всех провайдеров                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Установка

### Claude Code ✅ (MCP native)

Настройка в `.mcp.json` уже готова.

**Команда:** `/ctx`

### Codex CLI ✅ (CLI wrapper)

```bash
# Скопировать универсальный skill
cp skills/ctx-universal-full/SKILL.md .codex/skills/ctx/SKILL.md

# Или использовать setup script
node scripts/ctx-setup.js codex
```

**Команда:** `/ctx`

### Gemini CLI 📋 (CLI wrapper)

```bash
# Скопировать универсальный skill
cp skills/ctx-universal-full/SKILL.md ~/.config/gemini-cli/skills/ctx/SKILL.md

# Или использовать setup script
node scripts/ctx-setup.js gemini
```

**Команда:** `gemini /ctx`

### OpenCode 📋 (CLI wrapper)

```bash
# Скопировать универсальный skill в директорию OpenCode skills
cp skills/ctx-universal-full/SKILL.md [OpenCode skills]/ctx/SKILL.md

# Или использовать setup script
node scripts/ctx-setup.js opencode
```

**Команда:** `/ctx`

---

## Универсальный Setup Script

```bash
# Установить для всех провайдеров
node scripts/ctx-setup.js all

# Для конкретного провайдера
node scripts/ctx-setup.js claude   # Claude Code
node scripts/ctx-setup.js codex    # Codex CLI
node scripts/ctx-setup.js gemini   # Gemini CLI
node scripts/ctx-setup.js opencode # OpenCode
```

---

## Команды (одинаковые везде)

| Команда | Описание |
|---------|----------|
| `/ctx start` | Авто-старт pipeline (DETECT + CONTEXT) |
| `/ctx task <desc>` | Определить задачу |
| `/ctx brainstorm` | Обсудить подход |
| `/ctx plan` | Создать план |
| `/ctx execute` | Выполнить |
| `/ctx save` | Сохранить сессию |
| `/ctx status` | Статус pipeline |
| `/ctx lead <p>` | Сменить ведущего (claude/gemini/opencode/codex) |
| `/ctx agents` | Список агентов |
| `/ctx search <q>` | Поиск в базе знаний |
| `/ctx consilium <t>` | Мульти-провайдерный совет |
| `/ctx delegate <t>` | Умный роутинг задачи |

---

## API (автоматический выбор)

### Получить состояние

**Claude Code (MCP):**
```
ctx_get_pipeline()
```

**Все остальные (CLI):**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" get_pipeline
```

### Установить стадию

**Claude Code (MCP):**
```
ctx_set_stage("context", { lead: "gemini" })
```

**Все остальные (CLI):**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" set_stage --stage context --data '{"lead":"gemini"}'
```

### Обновить pipeline

**Claude Code (MCP):**
```
ctx_update_pipeline({ task: "Build API" })
```

**Все остальные (CLI):**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-cli.js" update_pipeline --patch '{"task":"Build API"}'
```

---

## CLI Wrapper API

`scripts/ctx-cli.js` — используется всеми провайдерами без MCP

```bash
# Получить состояние
node scripts/ctx-cli.js get_pipeline

# Установить стадию
node scripts/ctx-cli.js set_stage --stage <name> [--data <json>]

# Обновить поля
node scripts/ctx-cli.js update_pipeline --patch <json>

# Логировать действие
node scripts/ctx-cli.js log_action --entry <json>

# Логировать ошибку
node scripts/ctx-cli.js log_error --entry <json>
```

---

## Общие данные

Все провайдеры работают с **одним состоянием** в `.data/pipeline.json`:

```json
{
  "stage": "detect",
  "lead": "claude",
  "task": null,
  "context": {},
  "brainstorm": {},
  "plan": {}
}
```

**Важно:** Можно переключаться между провайдерами — состояние сохраняется!

---

## Тестирование

```bash
# Тест CLI wrapper (для всех кроме Claude)
node scripts/ctx-test.js
```

Все тесты проходят ✅

---

## Сравнение: MCP vs CLI Wrapper

| Feature | Claude (MCP) | Codex/Gemini/OpenCode (CLI) |
|---------|--------------|-----------------------------|
| Функционал | **Полный** | **Полный** (то же самое!) |
| API | MCP tools | CLI wrapper |
| Perf | Быстрее | Медленнее (subprocess) |
| Установка | .mcp.json | Copy skill file |

**Важно:** Функционал **полностью идентичен**!

---

## Quick Start

### Claude Code
```
/ctx start
```

### Codex CLI
```
/ctx start
```

### Gemini CLI
```bash
gemini /ctx start
```

### OpenCode
```
/ctx start
```

**Одна и та же команда везде!** ✨

---

## Troubleshooting

### Node.js не найден
Установите Node.js: https://nodejs.org/

### CLI wrapper не работает
```bash
node scripts/ctx-cli.js --help
node scripts/ctx-test.js
```

### MCP tools недоступны в Claude Code
Проверьте `.mcp.json` и перезапустите Claude Code

---

## Структура файлов

```
my_claude_code/
├── .data/
│   ├── pipeline.json        # Общее состояние
│   └── log.jsonl            # Лог действий
├── scripts/
│   ├── ctx-mcp-hub.js       # MCP сервер (Claude)
│   ├── ctx-cli.js           # CLI wrapper (остальные)
│   ├── ctx-setup.js         # Setup script
│   ├── ctx-test.js          # Test script
│   └── tools/               # Domain logic (общая)
├── skills/
│   └── ctx-universal-full/  # Универсальный skill
│       └── SKILL.md         # Работает везде!
├── .mcp.json                # MCP config (Claude)
└── CTX_UNIVERSAL.md         # Эта документация
```

---

## Сравнение провайдеров

| Провайдер | Режим | Установка | Команда |
|-----------|-------|-----------|---------|
| Claude Code | MCP | Из коробки | `/ctx` |
| Codex CLI | CLI | `node ctx-setup.js codex` | `/ctx` |
| Gemini CLI | CLI | `node ctx-setup.js gemini` | `gemini /ctx` |
| OpenCode | CLI | `node ctx-setup.js opencode` | `/ctx` |

**Один и тот же функционал, одна и та же команда!** ✨

---

## Contributing

Для добавления нового провайдера:

1. Реализуйте CLI wrapper или MCP server
2. Используйте `scripts/ctx-cli.js` как fallback
3. Скопируйте `skills/ctx-universal-full/SKILL.md`
4. Добавьте провайдер в `STAGES` и `PROVIDERS`
5. Обновите документацию
