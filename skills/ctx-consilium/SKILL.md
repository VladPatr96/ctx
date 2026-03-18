---
name: ctx-consilium
description: >
  Мульти-провайдерный консилиум: Claude Code, Gemini CLI, OpenCode и Codex CLI
  анализируют задачу независимо друг от друга. Главный агент (Opus) синтезирует
  решения и принимает окончательное решение. Используй для сложных архитектурных
  вопросов или когда нужно второе/третье мнение.
  ALIAS: эквивалент `/ctx consilium <тема>`. Оба варианта работают одинаково.
---

# /ctx-consilium — Multi-Provider Decision Council

Консилиум из 4 AI провайдеров для принятия сложных решений.

## Использование

```
/ctx-consilium <описание задачи/вопроса>
/ctx-consilium <тема> --providers claude,gemini
/ctx-consilium <тема> --agents architect,researcher,reviewer
/ctx-consilium <тема> --preset fast
/ctx-consilium <тема> --rounds 3
/ctx-consilium <тема> --preset debate-full
```

### Флаги
- `--providers p1,p2` — выбрать конкретных провайдеров
- `--models claude=opus-4.6,gemini=gemini-2.5-pro` — выбрать модель для каждого провайдера
- `--agents a1,a2` — внутренний агентный консилиум
- `--advisors a1,a2` — Board of Advisors (персоны экспертов)
- `--preset <name>` — пресет из `consilium.presets.json`
- `--rounds N` — многораундовый режим (N = 1..4, по умолчанию 1 = однораундовый)
- (без флагов) → интерактивный выбор через AskUserQuestion

## Паттерн: Независимые мнения

Каждый участник (провайдер или агент) анализирует задачу **изолированно** — не видит ответы других.
Это даёт разнообразие подходов и снижает confirmation bias.

---

## Workflow

### Шаг 1: PREPARE

Подготовь контекст для каждого провайдера:

1. Получи карту проекта (запусти `node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-indexer.js"` если нет `.data/index.json`)
2. Сформулируй задачу чётко и однозначно
3. Подготовь общий контекст: стек, структура, ограничения
4. **Evaluation:** вызови `ctx_eval_start({ project, topic, mode, providers })` — сохрани `run_id`

Создай промпт-шаблон:
```
Проект: [имя] ([стек])
Структура: [ключевые директории]
Задача: [формулировка от пользователя]

Дай своё предложение по решению этой задачи. Включи:
1. Подход (что делать)
2. Обоснование (почему именно так)
3. Риски (что может пойти не так)
4. Альтернативы (что ещё рассматривал)
```

### Шаг 2: DISPATCH (параллельно)

Запусти **4 агента параллельно**, каждый в изоляции:

**Claude Code** (через Task tool, model: sonnet):
```
Используй Task tool с subagent_type: "general-purpose" и model: "sonnet"
Передай промпт-шаблон с контекстом
```

**Gemini CLI** (через bash):
```bash
gemini -p "<промпт-шаблон>" -o text 2>&1 | head -200
```

**OpenCode** (через bash):
```bash
opencode run "<промпт-шаблон>" 2>&1 | head -200
```

**Codex CLI** (через bash):
```bash
codex exec --ephemeral --skip-git-repo-check "<промпт-шаблон>" 2>&1 | head -200
```

**ВАЖНО:**
- Все 4 запроса запускай **параллельно** (несколько Tool calls в одном сообщении)
- Каждый провайдер НЕ ВИДИТ ответы других
- Таймаут: 60 секунд на провайдера
- Если провайдер не отвечает — пропусти его
- **Evaluation:** после каждого ответа вызови `ctx_eval_provider(run_id, { provider, model, status, response_ms, confidence, key_idea })`. Для timeout/error — укажи `status: "timeout"/"error"` и `error_message`

### Режим: Agent Consilium (--agents)

Вместо внешних провайдеров — запусти внутренних агентов параллельно через Task tool.

1. Вызови `ctx_agent_consilium(topic, agents, projectContext)` для получения промптов
2. Запусти каждого агента через Task tool (subagent_type: "general-purpose")
3. Каждый отвечает С ПОЗИЦИИ СВОЕЙ РОЛИ:
   - **architect** → архитектура, масштабируемость, API контракты
   - **researcher** → паттерны, прецеденты, альтернативы
   - **reviewer** → риски, качество, edge cases
   - **tester** → тестируемость, покрытие
   - **implementer** → сложность, практичность

### Режим: Board of Advisors (--advisors)

Вместо разных провайдеров — параллельные субагенты с персонами экспертов. Каждый анализирует задачу через уникальную "линзу".

1. Вызови `ctx_advisor_consilium(topic, advisors?, preset?, projectContext?)` MCP tool
2. Инструмент сам запустит 4-6 субагентов параллельно и синтезирует результаты

**Доступные советники (18):**

| ID | Персона | Линза |
|----|---------|-------|
| jobs | Steve Jobs | Минимализм, фокус, UX |
| victor | Bret Victor | Immediacy, обратная связь |
| tufte | Edward Tufte | Визуализация данных |
| norman | Don Norman | Юзабилити, ментальные модели |
| karpathy | Andrej Karpathy | Простота, прагматизм |
| carmack | John Carmack | Производительность, тех. долг |
| lutke | Tobi Lütke | Developer experience, масштаб |
| isenberg | Greg Isenberg | Community, виральность |
| collison | Patrick Collison | API-first, платформа |
| tinkov | Олег Тиньков | Unit-экономика, скорость |
| cto | CTO | Архитектура, стек, риски |
| cmo | CMO | Маркетинг, позиционирование |
| contrarian | Contrarian | Devil's advocate, worst case |
| user | End User | Реальный UX нетехнического юзера |
| premortem | Pre-Mortem Analyst | Риски: Tigers / Paper Tigers / Elephants |
| lean | Lean Canvas Strategist | Бизнес-гипотезы, problem-solution fit |
| discovery | Discovery Lead (Torres) | Opportunity Solution Tree, outcome-first |
| northstar | North Star Strategist | North Star Metric, input metrics |

**Пресеты:**
- `advisor-product` — Jobs, Victor, Norman, User
- `advisor-architecture` — Karpathy, Carmack, Lütke, CTO
- `advisor-growth` — Isenberg, Collison, Тиньков, CMO
- `advisor-full` — Jobs, Karpathy, Contrarian, CMO, User
- `advisor-stress` — Contrarian, Тиньков, Carmack, User
- `advisor-pm` — Pre-Mortem, Lean, Discovery, North Star
- `advisor-risk` — Pre-Mortem + Contrarian
- `advisor-launch` — Pre-Mortem, North Star, Lean, User

**Примеры:**
```
/ctx-consilium оценить UX нового дашборда --advisors jobs,victor,norman,user
/ctx-consilium стоит ли переписывать на Rust --preset advisor-architecture
/ctx-consilium идея SaaS для фрилансеров --preset advisor-full
/ctx-consilium оценить риски запуска нового API --preset advisor-risk
/ctx-consilium ревью PRD нового продукта --preset advisor-pm
/ctx-consilium готовы ли мы к релизу v2.0 --preset advisor-launch
```

**Когда использовать Advisors vs Providers:**
- **Providers** (Claude/Gemini/Codex) → разные модели, технические вопросы, code review
- **Advisors** (персоны) → продуктовые развилки, стратегия, оценка идей

### Режим: Adversarial Review (--preset review-*)

Кросс-ролевой code review с авто-масштабированием по размеру изменений. Вдохновлён [poteto/noodle adversarial-review](https://skills.sh/poteto/noodle/adversarial-review).

1. Вызови `ctx_adversarial_review({ target?, preset?, agents?, crossProvider? })`
2. Инструмент автоматически:
   - Получает diff из git (staged → HEAD → custom target)
   - Определяет scope по размеру: <50 строк → skeptic, 50-200 → +architect, 200+ → +minimalist
   - Запускает ревьюеров параллельно (опционально на разных провайдерах)
   - Синтезирует вердикт: **PASS** / **PASS_WITH_CONCERNS** / **CONTESTED** / **REJECT**

**Роли ревьюеров:**

| Роль | Фокус | Когда включается |
|------|-------|-----------------|
| **Skeptic** | Баги, edge cases, security, сломанные допущения | Всегда (>=1 строки) |
| **Architect** | Структура, API контракты, масштабируемость | Medium+ (>=50 строк) |
| **Minimalist** | Лишний код, over-engineering, дублирование | Large (>=200 строк) |

**Пресеты:**
- `review-adversarial` — полный review (skeptic + architect + minimalist)
- `review-quick` — быстрый (только skeptic)
- `review-cross` — кросс-провайдерный (Claude vs Codex)

**Примеры:**
```
/ctx-consilium ревью последнего коммита --preset review-adversarial
/ctx-consilium ревью staged changes --preset review-cross
/ctx-consilium ревью feature/auth..main --preset review-quick
```

**Вердикты:**
- **PASS** — нет существенных проблем
- **PASS_WITH_CONCERNS** — замечания есть, но не критичные
- **CONTESTED** — ревьюеры не согласны (кто-то reject, кто-то pass)
- **REJECT** — консенсус: есть критичные проблемы

### Интерактивный выбор (без флагов)

При запуске без флагов — ОБЯЗАТЕЛЬНО выполни интерактивный выбор.

**Шаг 1: Загрузи данные о провайдерах.**
Вызови MCP tool `ctx_consilium_setup()`. Он вернёт:
- Список доступных провайдеров и их статус
- Модели для каждого провайдера с тирами (flagship/balanced/fast)
- Текущие дефолты из ctx.config.json

**Шаг 2: Выбор режима.**
Покажи пользователю меню (через AskUserQuestion или текстовое меню):
```
Режим консилиума для: "<тема>"
[A] Все провайдеры — Claude + Gemini + Codex + OpenCode
[B] Быстрый — Claude + Gemini
[C] Агенты — architect + researcher + reviewer
[D] Board of Advisors — экспертные персоны (Jobs, Karpathy и др.)
[E] Adversarial Review — skeptic + architect + minimalist
[F] Выбрать вручную
```

**Шаг 3: Выбор провайдеров** (если режим A, B, F).
Покажи только доступные провайдеры (available=true из ctx_consilium_setup).
Для режима F — дай выбрать конкретных. Для A/B — подтверди список.

**Шаг 4: Выбор модели для КАЖДОГО провайдера.**
Для каждого выбранного провайдера покажи его модели отдельным вопросом:
```
Модель для Claude? (текущая: opus-4.6)
  [1] opus-4.6      — flagship
  [2] sonnet-4.6    — balanced
  [3] haiku-4.5     — fast

Модель для Gemini? (текущая: gemini-2.5-pro)
  [1] gemini-3.1-pro-preview  — flagship
  [2] gemini-2.5-pro          — balanced
  [3] gemini-2.5-flash        — fast

Модель для OpenCode? (текущая: zai-coding-plan/glm-5)
  [1] opencode-go/glm-5        — GLM-5 (Go)
  [2] opencode-go/kimi-k2.5    — Kimi K2.5 (Go)
  [3] opencode-go/minimax-m2.5 — MiniMax M2.5 (Go)
  [4] zai-coding-plan/glm-5    — GLM-5 (ZAI)
```
Используй данные из `ctx_consilium_setup` для построения списков.
Текущая модель из configuredModel — подсвечена как дефолт.

**Шаг 5: Запуск.**
Передай выбранных провайдеров и модели в `ctx_consilium_multi_round`:
```json
{
  "topic": "<тема>",
  "providers": ["claude", "gemini", "opencode"],
  "models": {
    "claude": "opus-4.6",
    "gemini": "gemini-3.1-pro-preview",
    "opencode": "opencode-go/kimi-k2.5"
  },
  "rounds": 2
}
```

### Терминальный режим (режим по умолчанию для провайдеров)

При выборе режимов A/B/F (провайдеры) — используй `ctx_consilium_run` для запуска
каждого провайдера в отдельном терминальном окне.

**Вызов:**
```json
ctx_consilium_run({
  "topic": "<тема>",
  "providers": ["claude", "gemini", "codex", "opencode"],
  "models": {
    "claude": "opus-4.6",
    "gemini": "gemini-3.1-pro-preview",
    "codex": "gpt-5.4",
    "opencode": "opencode-go/glm-5"
  },
  "projectContext": "<контекст проекта>",
  "createWorktrees": false
})
```

**Что происходит:**
1. Создаётся директория `.data/consilium/<run-id>/` с файлами:
   - `prompt-<provider>.md` — промпт для каждого провайдера
   - `<provider>-<model>.md` — файл для ответа
   - `<provider>-<model>.log` — лог выполнения
   - `meta.json` — метаданные (тема, провайдеры, модели, статусы)
   - `synthesis.md` — шаблон итогового решения
2. Каждый провайдер запускается в **отдельном терминальном сплите** (tmux/wt/wezterm)
3. Режимы: Claude `--dangerously-skip-permissions`, Gemini `--yolo`, Codex `--full-auto`
4. Опционально: `createWorktrees: true` создаёт git-ветку `consilium/<agentId>` для каждого

**После ответов:**
1. Прочитай файлы ответов из `runDir`
2. Заполни `synthesis.md` синтезом
3. Сохрани в базу знаний: `ctx_save_lesson({ title, content, category: 'consilium' })`

### Многораундовый режим (--rounds N)

При N > 1 используется MCP tool `ctx_consilium_multi_round`:

1. **Вызов**: `ctx_consilium_multi_round({ topic, providers, rounds: N, projectContext })`
2. **Автоматика**: Инструмент сам выполнит все раунды:
   - R1: каждый провайдер отвечает свободным текстом (параллельно)
   - R2..N: каждый видит АНОНИМНЫЕ ответы других (`Participant A/B/C/D`)
   - R2+: провайдеры отвечают структурированным JSON с оценками
3. **Результат**: Полная история раундов с эволюцией позиций
4. **Синтез**: Используй результат для шагов SYNTHESIZE → DECIDE → LOG

**Правила многораундового режима:**
- Анонимные алиасы (`Participant A/B/C/D`) — перемешиваются, маппинг приватный
- Нет промежуточного синтеза Opus между раундами
- Ошибка провайдера в раунде N не блокирует остальных
- Финальный синтез учитывает эволюцию позиций через все раунды
- Пресеты `debate-full` (3 раунда) и `debate-fast` (2 раунда) — готовые конфигурации

### Шаг 3: SYNTHESIZE

Собери все ответы и проанализируй:

1. **Общее** — в чём провайдеры согласны?
2. **Различия** — где расходятся и почему?
3. **Уникальное** — что увидел только один провайдер?
4. **Конфликты** — прямо противоположные рекомендации

**Для многораундового режима** дополнительно:
5. **Эволюция позиций** — как менялись стратегии от раунда к раунду?
6. **Конвергенция** — в чём участники сошлись после дискуссии?
7. **Устойчивые аргументы** — какие тезисы выдержали критику?

### Шаг 4: DECIDE

Прими окончательное решение:

```
## 🏛️ Решение консилиума

### Задача
[формулировка]

### Предложения провайдеров

| Провайдер | Модель | Подход | Ключевая идея |
|-----------|--------|--------|---------------|
| Claude    | opus-4.6 | ...  | ...           |
| Gemini    | gemini-2.5-pro | ... | ...      |
| OpenCode  | glm-5  | ...    | ...           |
| Codex     | o3     | ...    | ...           |

### Консенсус
[в чём все согласны]

### Итоговое решение
[что делаем и почему]

### Обоснование
[почему выбран именно этот подход, а не альтернативы]

### План действий
1. [шаг 1]
2. [шаг 2]
3. [шаг 3]
```

### Шаг 5: LOG

1. Сохрани решение в GitHub:

```bash
gh issue create -R {{GITHUB_OWNER}}/{{CTX_CENTRAL_REPO}} \
  --title "Consilium: [краткое описание задачи]" \
  --label "consilium,project:$PROJECT_NAME" \
  --body "[тело решения из шага 4]"
```

2. **Evaluation:** вызови `ctx_eval_complete(run_id, { proposed_by, consensus: 1/0, decision_summary, github_issue_url, rounds })` — записать итог консилиума. Если известен CI статус — вызови `ctx_eval_ci_update(run_id, "passed"/"failed")`

---

## Правила

1. **Изоляция** — провайдеры НЕ ДОЛЖНЫ видеть ответы друг друга до синтеза
2. **Честность** — если провайдер дал плохой ответ, отметь это
3. **Не подгоняй** — итоговое решение может отличаться от всех предложений
4. **Прагматизм** — если все 4 согласны, не усложняй. Если 3 из 4 — следуй большинству с оговорками
5. **Логируй** — каждый consilium сохраняется для будущего анализа
