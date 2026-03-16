<!-- Source: CTX_UNIVERSAL.md -->

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


<!-- Source: CTX_PROVIDER_TESTING.md -->

# 🧪 Тестирование скиллов на всех провайдерах

**Дата:** 2026-03-03  
**Версия:** 1.0

---

## 🎯 Быстрый тест

```bash
# Запустить полный тест всех провайдеров
./scripts/test-all-providers.sh
```

---

## 📋 Ручное тестирование по провайдерам

### 1. Claude Code (MCP Mode)

**Автоматически через MCP tools:**

```javascript
// В Claude Code сессии
await ctx_security_scan({ scope: 'all' });
await ctx_debug({ error: "TypeError..." });
await ctx_test_coverage({ target: 90 });
// ... все 38 MCP tools
```

**Проверка:**
```bash
# Проверить MCP Hub запущен
ps aux | grep ctx-mcp-hub

# Проверить логи MCP Hub
# (вывод в stderr/stdout Claude Code)
```

---

### 2. Codex CLI (CLI Mode)

**Запуск скиллов:**
```bash
# Все команды через ctx-cli.js
node scripts/ctx-cli.js security-scan --scope all
node scripts/ctx-cli.js debug --error "TypeError"
node scripts/ctx-cli.js test-coverage --target 90
node scripts/ctx-cli.js api-design --format openapi
node scripts/ctx-cli.js generate-docs --type all
node scripts/ctx-cli.js refactor --directory src
node scripts/ctx-cli.js dockerize --runtime node
node scripts/ctx-cli.js ci-cd --platform github
node scripts/ctx-cli.js provider-health --provider all
node scripts/ctx-cli.js consilium-opt --strategy auto-stop
```

**Проверка Git Hooks:**
```bash
# Тест pre-commit hook
echo "test" > test.txt
git add test.txt
git commit -m "test"
# → Должен запуститься security-scan

# Тест pre-push hook
git push origin test-branch
# → Должен запуститься test-coverage
```

---

### 3. Gemini CLI (CLI Mode)

**Setup (если не настроен):**
```bash
# Копировать skill
cp skills/ctx-universal-full/SKILL.md ~/.config/gemini-cli/skills/ctx/SKILL.md

# Или использовать setup script
node scripts/ctx-setup.js gemini
```

**Запуск скиллов:**
```bash
# Те же команды что и для Codex
node scripts/ctx-cli.js security-scan --scope all
node scripts/ctx-cli.js test-coverage --target 90
# ... все 38 команд
```

**Проверка:**
```bash
# Запустить Gemini CLI
gemini

# В сессии Gemini:
/ctx security-scan
/ctx debug --error "TypeError"
# ... все команды
```

---

### 4. OpenCode (CLI Mode)

**Setup (если не настроен):**
```bash
# Копировать skill
cp skills/ctx-universal-full/SKILL.md [OpenCode skills]/ctx/SKILL.md

# Или использовать setup script
node scripts/ctx-setup.js opencode
```

**Запуск скиллов:**
```bash
# Те же команды
node scripts/ctx-cli.js security-scan --scope all
node scripts/ctx-cli.js test-coverage --target 90
# ... все 38 команд
```

**Проверка:**
```bash
# Запустить OpenCode
opencode

# В сессии OpenCode:
/ctx security-scan
/ctx debug --error "TypeError"
# ... все команды
```

---

## 🧪 Тестирование автоматизации

### 1. Git Hooks (все провайдеры)

**Тест pre-commit:**
```bash
# Создать тестовый файл с уязвимостью
echo "password = 'hardcoded123'" > test-vuln.js
git add test-vuln.js

# Попробовать закоммитить
git commit -m "test"
# → Должен запуститься security-scan
# → Если critical issues → коммит заблокирован
```

**Тест pre-push:**
```bash
# Создать ветку
git checkout -b test-coverage

# Сделать изменения
echo "// test" >> test.txt
git add test.txt
git commit -m "test"

# Попробовать запушить
git push origin test-coverage
# → Должен запуститься test-coverage
# → Если coverage < 80% → предупреждение
```

---

### 2. GitHub Actions (все провайдеры)

**Тест workflow:**
```bash
# Запушить в ветку
git push origin test-branch

# Проверить GitHub Actions
gh run list --limit 5

# Посмотреть детали
gh run view

# Должны запуститься все 10 jobs:
# - security
# - error-analysis
# - coverage
# - api-design
# - documentation
# - refactoring
# - docker
# - deploy
# - provider-health
# - consilium-opt
```

---

### 3. Pipeline Triggers (все провайдеры)

**Тест триггеров:**
```bash
# Тест стадии detect
node scripts/ctx-pipeline-triggers-full.js detect
# → security-scan (quick)
# → error-debugger (quick)

# Тест стадии execute
node scripts/ctx-pipeline-triggers-full.js execute
# → security-scan
# → test-coverage
# → error-debugger
# → dockerize
# → ci-cd

# Тест стадии done
node scripts/ctx-pipeline-triggers-full.js done
# → coverage-mutate
# → generate-docs
# → refactor
# → docker-optimize
# → cicd-deploy
# → provider-metrics
# → consilium-smart-synthesis
```

---

### 4. Scheduled Jobs (все провайдеры)

**Тест планировщика:**
```bash
# Проверить конфиг
node scripts/ctx-auto-run.js config

# Включить daily security
node scripts/ctx-auto-run.js enable dailySecurity

# Запустить разовый тест
node scripts/ctx-auto-run.js run security-scanner security-scan

# Запустить планировщик (в фоне)
nohup node scripts/ctx-auto-run.js start > scheduler.log 2>&1 &

# Проверить логи
tail -f scheduler.log
```

---

## 📊 Таблица тестирования

| Функция | Claude Code | Codex CLI | Gemini CLI | OpenCode |
|---------|-------------|-----------|------------|----------|
| **MCP Tools** | ✅ Native | ❌ | ❌ | ❌ |
| **CLI Commands** | ✅ Fallback | ✅ Primary | ✅ Primary | ✅ Primary |
| **Git Hooks** | ✅ | ✅ | ✅ | ✅ |
| **GitHub Actions** | ✅ | ✅ | ✅ | ✅ |
| **Pipeline Triggers** | ✅ | ✅ | ✅ | ✅ |
| **Scheduled Jobs** | ✅ | ✅ | ✅ | ✅ |
| **Skill Registry** | ✅ | ✅ | ✅ | ✅ |

---

## 🚀 Быстрые тесты

### Тест всех 38 команд

```bash
# Создать тестовый скрипт
cat > test-all-commands.sh << 'TEST'
#!/bin/bash
commands=(
  "security-scan"
  "security-report"
  "security-ignore"
  "debug"
  "error-analyze"
  "error-similar"
  "error-fix"
  "test-coverage"
  "coverage-analyze"
  "coverage-generate"
  "coverage-mutate"
  "api-design"
  "api-generate-spec"
  "api-validate"
  "api-generate-sdk"
  "generate-docs"
  "docs-readme"
  "docs-api"
  "docs-changelog"
  "refactor"
  "refactor-analyze"
  "refactor-suggest"
  "refactor-apply"
  "dockerize"
  "docker-generate"
  "docker-compose"
  "docker-optimize"
  "ci-cd"
  "cicd-generate"
  "cicd-deploy"
  "cicd-rollback"
  "provider-health"
  "provider-metrics"
  "provider-alerts"
  "provider-optimize"
  "consilium-opt"
  "consilium-early-stop"
  "consilium-trust-scores"
)

for cmd in "${commands[@]}"; do
  echo -n "Testing $cmd... "
  if node scripts/ctx-cli.js $cmd > /dev/null 2>&1; then
    echo "✓"
  else
    echo "✗"
  fi
done
TEST

chmod +x test-all-commands.sh
./test-all-commands.sh
```

---

## ✅ Чеклист проверки

- [ ] **Claude Code:** MCP tools работают
- [ ] **Codex CLI:** CLI commands работают
- [ ] **Gemini CLI:** CLI commands работают
- [ ] **OpenCode:** CLI commands работают
- [ ] **Git Hooks:** pre-commit блокирует
- [ ] **Git Hooks:** pre-push проверяет
- [ ] **GitHub Actions:** workflow запускается
- [ ] **Pipeline Triggers:** триггеры срабатывают
- [ ] **Scheduled Jobs:** планировщик работает
- [ ] **Skill Registry:** 10 скиллов зарегистрировано

---

**Создано:** AI Assistant (OpenCode)  
**Дата:** 2026-03-03


<!-- Source: OPENCODE_AUTO_SETUP.md -->

# OpenCode Auto-Setup — CTX Skill Auto-Update

Автоматическая установка и обновление CTX skill для OpenCode при запуске программы.

## 🚀 Быстрая установка

```bash
# Автоопределение директории OpenCode skills
node scripts/opencode-auto-setup.js

# Указать путь вручную
node scripts/opencode-auto-setup.js "C:\\Users\\user\\.opencode\\skills"
```

## 📋 Что делает этот скрипт

1. **Находит** директорию OpenCode skills
2. **Копирует** универсальный CTX skill (`skills/ctx-universal-full/SKILL.md`)
3. **Создаёт** скрипт автообновления (`update-ctx-skill.js`)
4. **Создаёт** startup скрипт для запуска (`update-ctx-skill.bat`/`.sh`)

## 🔧 Интеграция в OpenCode

### Вариант 1: Startup скрипт (Windows)

Создайте ярлык для OpenCode с такими параметрами:

```
Цель: cmd.exe /c "C:\Users\user\.opencode\skills\update-ctx-skill.bat && opencode"
Рабочая папка: C:\Users\user\.opencode
```

### Вариант 2: PowerShell скрипт

Создайте файл `launch-opencode.ps1`:

```powershell
# Update CTX skill
& "C:\Users\user\.opencode\skills\update-ctx-skill.bat"

# Launch OpenCode
Start-Process opencode
```

### Вариант 3: Shell скрипт (macOS/Linux)

Создайте файл `launch-opencode.sh`:

```bash
#!/bin/bash
# Update CTX skill
~/.opencode/skills/update-ctx-skill.sh

# Launch OpenCode
opencode
```

Сделайте файл исполняемым:
```bash
chmod +x launch-opencode.sh
```

## 📁 Структура после установки

```
~/.opencode/skills/
├── ctx/
│   └── SKILL.md                      ← Универсальный CTX skill
├── update-ctx-skill.js               ← Скрипт автообновления
├── update-ctx-skill.bat              ← Windows startup скрипт
└── update-ctx-skill.sh               ← Unix startup скрипт
```

## 🔄 Обновление вручную

В любой момент можно обновить CTX skill:

```bash
# Windows
C:\Users\user\.opencode\skills\update-ctx-skill.bat

# macOS/Linux
~/.opencode/skills/update-ctx-skill.sh
```

Или напрямую:
```bash
node ~/.opencode/skills/update-ctx-skill.js
```

## 💻 Использование в OpenCode

После установки:

```
/ctx start           — Запустить pipeline
/ctx task <описание> — Определить задачу
/ctx brainstorm      — Обсудить подход
/ctx plan            — Создать план
/ctx execute         — Выполнить план
/ctx save            — Сохранить сессию
/ctx status          — Показать статус
/ctx lead <provider> — Сменить ведущего
```

## 🎯 Преимущества автообновления

- ✅ **Всегда актуальный skill** — автоматически обновляется при запуске
- ✅ **Никаких ручных копирований** — всё происходит автоматически
- ✅ **Лёгкое обновление** — один скрипт для всех изменений
- ✅ **Безопасность** — создаются бэкапы при обновлении
- ✅ **Кроссплатформенность** — Windows, macOS, Linux

## 🔍 Поиск директории OpenCode

Скрипт автоматически ищет OpenCode skills в следующих местах:

**Windows:**
- `%APPDATA%\OpenCode\skills`
- `%LOCALAPPDATA%\OpenCode\skills`
- `%USERPROFILE%\.opencode\skills`
- `C:\Program Files\OpenCode\skills`
- `C:\Program Files (x86)\OpenCode\skills`

**macOS/Linux:**
- `~/.opencode/skills`
- `~/.config/opencode/skills`
- `/usr/local/share/opencode/skills`
- `/opt/opencode/skills`

Если директория не найдена, укажите путь вручную.

## 🛠️ Устранение проблем

### OpenCode skills не найден

Укажите путь вручную:
```bash
node scripts/opencode-auto-setup.js "C:\\path\\to\\opencode\\skills"
```

### Ошибка при копировании

Убедитесь, что:
- У вас есть права на запись в директорию OpenCode skills
- Директория существует
- Исходный файл `skills/ctx-universal-full/SKILL.md` существует

### Skill не обновляется

Проверьте:
- Версию исходного файла
- Дату последнего изменения в `~/.opencode/skills/ctx/SKILL.md`

## 📚 Документация

- **CTX_QUICKSTART.md** — Быстрый старт
- **CTX_UNIVERSAL.md** — Полная документация
- **CTX_README.md** — Обзор функционала

## 🔗 Связанные скрипты

- `scripts/ctx-setup.js` — Установка для всех провайдеров
- `scripts/final-test.js` — Комплексные тесты
- `scripts/ctx-cli.js` — CLI wrapper

---

**Установите один раз и забудьте о ручном обновлении!** 🚀


<!-- Source: OPENCODE_STATUS.md -->

# OpenCode Auto-Update — Final Status

## ✅ Создано и протестировано

### 📦 Новые файлы

1. **`scripts/opencode-auto-setup.js`** — Основной скрипт автоустановки
   - Автоопределение директории OpenCode skills
   - Копирование универсального CTX skill
   - Создание скриптов автообновления
   - Инструкция по интеграции

2. **`scripts/test-opencode-setup.js`** — Тестовый скрипт
   - Все тесты проходят ✅

3. **`OPENCODE_AUTO_SETUP.md`** — Документация

4. **Обновлен `scripts/ctx-setup.js`** — Интеграция с OpenCode

### 🧪 Результаты тестов

```
🧪 OpenCode Auto-Setup — Test

============================================================
  TEST 1: Create test skills directory
✓ Test directory created

============================================================
  TEST 2: Run auto-setup with test directory
✓ Auto-setup completed successfully

============================================================
  TEST 3: Verify files created
✓ Created: ctx/SKILL.md
✓ Created: update-ctx-skill.js
✓ Created: update-ctx-skill.bat (Windows) / .sh (Unix)

============================================================
  TEST 4: Verify skill content
✓ Skill content verified

============================================================
  TEST 5: Test auto-update script
✓ Auto-update script works
✓ Detects when already up to date

============================================================
  TEST 6: Cleanup
✓ Test directory removed

✅ All tests passed!
```

## 🚀 Использование

### Вариант 1: Через ctx-setup (рекомендуется)

```bash
# Автоматическая установка
node scripts/ctx-setup.js opencode
```

### Вариант 2: Прямой запуск

```bash
# Автоопределение директории
node scripts/opencode-auto-setup.js

# Указать путь вручную
node scripts/opencode-auto-setup.js "C:\\Users\\user\\.opencode\\skills"
```

## 📁 Что создаётся после установки

```
~/.opencode/skills/
├── ctx/
│   └── SKILL.md                      ← Универсальный CTX skill
├── update-ctx-skill.js               ← Скрипт автообновления
├── update-ctx-skill.bat              ← Windows startup скрипт
└── update-ctx-skill.sh               ← Unix startup скрипт
```

## 🔧 Интеграция в OpenCode

### Windows

Создайте ярлык для OpenCode:
```
Цель: cmd.exe /c "C:\Users\user\.opencode\skills\update-ctx-skill.bat && opencode"
Рабочая папка: C:\Users\user\.opencode
```

Или используйте PowerShell:
```powershell
& "C:\Users\user\.opencode\skills\update-ctx-skill.bat"
Start-Process opencode
```

### macOS/Linux

Создайте файл `launch-opencode.sh`:
```bash
#!/bin/bash
~/.opencode/skills/update-ctx-skill.sh
opencode
```

Сделайте файл исполняемым:
```bash
chmod +x launch-opencode.sh
```

## ✨ Преимущества

- ✅ **Автоопределение директории** — ищет OpenCode skills автоматически
- ✅ **Универсальный skill** — тот же функционал, что у других провайдеров
- ✅ **Автообновление** — создаёт скрипты для обновления при запуске
- ✅ **Безопасность** — создаются бэкапы при обновлении
- ✅ **Кроссплатформенность** — Windows, macOS, Linux
- ✅ **Простота** — одна команда для установки и обновления

## 📝 Обновление вручную

В любой момент можно обновить CTX skill:

```bash
# Windows
C:\Users\user\.opencode\skills\update-ctx-skill.bat

# macOS/Linux
~/.opencode/skills/update-ctx-skill.sh

# Или напрямую
node ~/.opencode/skills/update-ctx-skill.js
```

## 🎯 Как это работает

```
┌─────────────────────────────────────────────────────────────┐
│ 1. opencode-auto-setup.js                                │
│    • Находит ~/.opencode/skills/                        │
│    • Копирует ctx-universal-full/SKILL.md              │
│    • Создаёт update-ctx-skill.js                       │
│    • Создаёт startup скрипт (bat/sh)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. При запуске OpenCode                                  │
│    • Запускается update-ctx-skill.js                     │
│    • Проверяет версию skills/ctx-universal-full/SKILL.md  │
│    • Обновляет если изменилось                            │
│    • Создаёт бэкап                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. В OpenCode                                            │
│    • /ctx start                                          │
│    • /ctx task "Build API"                                │
│    • Полный функционал CTX!                              │
└─────────────────────────────────────────────────────────────┘
```

## 📚 Документация

- **OPENCODE_AUTO_SETUP.md** — Полная документация по автоустановке
- **CTX_QUICKSTART.md** — Быстрый старт CTX
- **CTX_UNIVERSAL.md** — Универсальная документация
- **CTX_README.md** — Обзор CTX

## 🔗 Связанные скрипты

- `scripts/ctx-setup.js` — Установка для всех провайдеров
- `scripts/final-test.js` — Комплексные тесты
- `scripts/test-opencode-setup.js` — Тесты OpenCode автоустановки

---

**Установите один раз и забудьте о ручном обновлении!** 🚀

Команда для установки:
```bash
node scripts/ctx-setup.js opencode
```
