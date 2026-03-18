# ctx — Ваш AI-совет директоров

> Универсальный плагин для AI CLI систем (Claude Code, Gemini CLI, OpenCode, Codex CLI).
> Мульти-провайдерная оркестрация с анонимной deliberation, trust scoring и claim graphs.

[![GitHub](https://img.shields.io/github/v/tag/VladPatr96/ctx?label=version)](https://github.com/VladPatr96/ctx)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Быстрый старт (60 секунд)

```bash
# В любом git-проекте:
npx -y github:VladPatr96/ctx

# Начать сессию
/ctx

# Запустить consilium — мульти-перспективный анализ
/ctx-consilium "Стоит ли использовать микросервисы для этого проекта?"
```

## Что такое ctx?

- **Consilium (CBDP)** — Несколько AI-провайдеров анонимно дискутируют по вашему вопросу, извлекают claims, оценивают trust и синтезируют консенсус. Как если бы Steve Jobs, John Carmack и Andrej Karpathy анализировали вашу архитектуру — независимо, анонимно, со структурированным синтезом.
- **Кросс-проектная база знаний** — Каждая сессия сохраняет уроки, решения и паттерны. SQLite FTS5 поиск по всем проектам. Никогда не решайте одну и ту же проблему дважды.
- **Адаптивный мульти-провайдерный роутинг** — Умный роутер выбирает лучшего AI-провайдера для каждого типа задачи, обучаясь на прошлых результатах.

## Consilium: Killer Feature

```
Вы → "Стоит ли использовать монорепо?"

  R1: Три провайдера отвечают независимо (анонимизированы как A/B/C)
  R2: Структурированные дебаты — stance, accepts, challenges, new claims
  R3: Извлечение claims → trust scoring → детекция консенсуса
  →  Финальный синтез с claim graph + trust matrix

Результат за ~30 секунд.
```

Работает с 1 провайдером (advisor mode) или несколькими (Claude, Gemini, Codex, OpenCode).

## Установка

```bash
npx -y github:VladPatr96/ctx
```

Установщик автоматически определит все доступные AI CLI провайдеры и настроит ctx для каждого из них.

### Требования

- Node.js 20+
- [GitHub CLI](https://cli.github.com/) (`gh`) — авторизованный
- Хотя бы один AI-провайдер: [Claude Code](https://claude.com/claude-code), Gemini CLI, OpenCode или Codex CLI

## Команды

| Команда | Описание |
|---------|----------|
| `/ctx` | Начать сессию: индексация проекта, загрузка уроков, создание лога |
| `/ctx save` | Завершить сессию: сохранение в GitHub Issues + базу знаний |
| `/ctx-search <запрос>` | Поиск решений по всем проектам (FTS5 + GitHub Issues) |
| `/ctx-consilium <тема>` | Мульти-раундовая анонимная дискуссия по протоколу CBDP |
| `/ctx-delegate <задача>` | Умная маршрутизация задач с адаптивным скорингом |

Хуки авто-сохранения (PreCompress + Stop) автоматически сохраняют контекст сессии.

## Конфигурация

`ctx init` генерирует `ctx.config.json`:

```json
{
  "githubOwner": "ваш-github-пользователь",
  "centralRepo": "ваш-github-пользователь/ctx",
  "kbRepo": "ваш-github-пользователь/ctx-knowledge",
  "locale": "ru",
  "dashboardPort": 7331
}
```

Цепочка резолвинга: `ctx.config.json` → `~/.config/ctx/config.json` → переменные окружения.

### Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `GITHUB_OWNER` | авто-детект | GitHub username для хранения issues |
| `CTX_CENTRAL_REPO` | `$GITHUB_OWNER/ctx` | Центральный репо знаний |
| `CTX_DATA_DIR` | `.data` | Директория данных |
| `CTX_LOCALE` | `ru` | Язык промптов (`en` или `ru`) |
| `CTX_ADAPTIVE_ROUTING` | включён | `0` для отключения |
| `CTX_STORAGE` | `json` | Бэкенд хранения (`json` или `sqlite`) |
| `CTX_DASHBOARD_PORT` | `7331` | Порт дашборда |

## Настройка провайдеров

### Claude Code

Работает из коробки — `ctx init` генерирует `.mcp.json`.

### Gemini CLI

Добавить в `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ctx-hub": {
      "command": "node",
      "args": ["/путь/к/ctx-plugin/scripts/ctx-mcp-hub.js"]
    }
  }
}
```

### OpenCode / Codex CLI

Настройка через `node scripts/ctx-setup.js <провайдер>`.

<details>
<summary><h2>Архитектура</h2></summary>

### Pipeline — конечный автомат

Все провайдеры разделяют единое состояние (`.data/pipeline.json`):

```
DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE
```

Любой провайдер может читать/продвигать pipeline. Ведущий провайдер отслеживается и переключается в runtime.

### Маршрутизация провайдеров

Умный роутер выбирает лучшего провайдера для каждого типа задачи:

| Тип задачи | Провайдер по умолчанию |
|-----------|----------------------|
| Code review, sandbox exec, рефакторинг | Codex |
| Анализ кодовой базы, документация | Gemini |
| Планирование, архитектура, workflow | Claude |
| JSON/structured output | OpenCode |

**Адаптивный роутинг** смешивает статические веса с данными оценки:

```
finalScore = (1 - α - ε) * staticScore + α * evalScore + ε * exploreBonus
```

### Протокол Consilium (CBDP)

1. **R1** — каждый провайдер отвечает независимо (анонимизирован как Participant A/B/C)
2. **R2+** — структурированные ответы: `stance`, `accepts`, `challenges`, `trust_scores`, `new_claims`
3. **Извлечение claims** — claims извлекаются между раундами, отслеживаются как граф
4. **Авто-стоп** — останавливается, если 0 contested claims
5. **Умный синтез** — финальный провайдер синтезирует по claim graph + trust matrix
6. **Feedback loop** — trust-derived confidence и winner записываются для адаптивного роутинга

### База знаний

- **SQLite FTS5** — локальный полнотекстовый поиск с upsert-дедупликацией
- **GitHub Issues** — удалённое хранилище с метками (`session`, `lesson`, `consilium`)
- **Синхронизация** — двунаправленный pull/push между SQLite и GitHub

### MCP Hub Tools (51 встроенный)

| Домен | Кол-во | Инструменты |
|-------|--------|-------------|
| Session | 4 | `ctx_log_action`, `ctx_log_error`, `ctx_get_session`, `ctx_get_tasks` |
| Knowledge | 8 | `ctx_get_project_map`, `ctx_search_solutions`, `ctx_get_project_context`, `ctx_save_lesson`, `ctx_kb_link`, `ctx_kb_stats`, `ctx_kb_bootstrap`, `ctx_kb_sync` |
| Consilium | 9 | `ctx_share_result`, `ctx_read_results`, `ctx_delegate_task`, `ctx_inner_consilium`, `ctx_consilium_presets`, `ctx_consilium_multi_round`, `ctx_advisor_consilium`, `ctx_agent_consilium`, `ctx_adversarial_review` |
| Pipeline | 3 | `ctx_get_pipeline`, `ctx_set_stage`, `ctx_update_pipeline` |
| Agents | 2 | `ctx_list_agents`, `ctx_create_agent` |
| Evaluation | 7 | `ctx_eval_start`, `ctx_eval_provider`, `ctx_eval_complete`, `ctx_eval_ci_update`, `ctx_eval_report`, `ctx_routing_health`, `ctx_cache_stats` |
| Orchestrator | 10 | `ctx_worktree_create/remove/list/status/merge`, `ctx_agent_execute/run_parallel/status`, `ctx_dev_pipeline_run/status` |
| Reactions | 5 | `ctx_react_ci_failed`, `ctx_react_changes_requested`, `ctx_react_poll/status/reset` |
| Routing | 3 | `ctx_routing_config`, `ctx_routing_explain`, `ctx_routing_override` |

Плюс skill-generated инструменты из `scripts/skills/skill-loader.js`.

### Структура проекта

```
src/                            # Модульная библиотека (16 доменов)
  core/                         # MCP Hub, CLI, конфиг, cache, storage
  providers/                    # Claude, Gemini, OpenCode, Codex + router
  consilium/                    # Движок CBDP: advisors, claims, раунды
  contracts/                    # 10 Zod-схем по доменам
  orchestrator/                 # Agent runner, dev pipeline, worktrees
  knowledge/                    # SQLite FTS5 база знаний
  evaluation/                   # Адаптивный роутинг + anomaly detection
  cost-tracking/                # Budget alerts, pricing, optimization
  dashboard/                    # HTTP + SSE сервер
  runtime/                      # State machines (task + step)
  setup/                        # Wizard, provider detection/probe
  tools/                        # 51 MCP tool handler по доменам

scripts/                        # Entry points и CLI утилиты
bin/                            # Platform-specific скрипты (sh, ps1, cmd)
skills/                         # 16 скиллов (SKILL.md — универсальный формат)
agents/                         # Определения AI-агентов
ctx-app/                        # Десктоп-приложение (Electron + React)
tests/                          # 64 теста (419 pass, 95% rate)
```

</details>

## Тестирование

```bash
npm test                                    # Полный набор
node --test tests/consilium-rounds.test.mjs # Consilium + feedback loop
node --test tests/adaptive-weight.test.mjs  # Адаптивный роутинг
```

## Лицензия

[MIT](LICENSE)
