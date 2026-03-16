<!-- Source: CTX_UNIFIED_PLAN.md -->

# CTX Unified App — Master Plan v2 (Web-first)

Стратегия: Web-first. Преобразовать существующий dashboard в полноценное React-приложение, затем обернуть в Electron для Desktop. Один стек, один backend, ноль дублирования.

---

## 1. Концепция (Vision)

Единая среда AI-оркестрации. Два runtime из одной кодовой базы:

- **Web (primary)**: полноценное SPA — управление pipeline, KB поиск, логи, агенты, consilium.
- **Desktop (secondary, позже)**: то же SPA внутри Electron + терминал, доступ к FS и процессам.

Ключевые принципы:
- **Web-first**: браузер — основная среда разработки и итераций.
- **Один backend**: `ctx-mcp-hub.js` + HTTP adapter — без дублирования бизнес-логики.
- **Эволюция, не переписывание**: dashboard-backend.js уже имеет SSE, auth, watchers, actions — переиспользуем.

---

## 2. Что уже работает (Baseline)

Перед тем как строить новое, фиксируем существующее:

| Компонент | Статус | Файлы |
|---|---|---|
| MCP Hub (19 tools) | Работает | `ctx-mcp-hub.js`, `tools/*.js` |
| Knowledge Base (FTS5) | Работает | `scripts/knowledge/*.js` |
| KB Git-sync | Работает | `kb-sync.js` → `VladPatr96/ctx-knowledge` |
| Dashboard backend | Работает | `dashboard-backend.js` — SSE, auth, watchers, rate limit |
| Dashboard actions | Работает | `dashboard-actions.js` — Zod-валидация, storage mutators |
| Dashboard frontend | Работает | `dashboard-frontend.js` — monolith HTML с 6 табами |
| Pipeline state machine | Работает | `tools/pipeline.js`, `storage/*.js` |
| 4 провайдера | Работает | `providers/*.js` + router |
| Session save hooks | Работает | `ctx-session-save.js` → KB + GitHub Issues |
| Тесты | 14/14 pass | `tests/*.test.mjs` |

**Вывод**: backend и данные готовы. Нужно только заменить monolith HTML на React SPA.

---

## 3. Архитектура (Web-first, Single Stack)

### 3.1 Стек

| Слой | Технология | Обоснование |
|---|---|---|
| UI Framework | React 19 + Vite 6 | Быстрый HMR, один стек для Web и Electron |
| Styling | Tailwind CSS 4 + shadcn/ui | Уже в плане, готовые компоненты |
| State | Zustand | Легковесный, без boilerplate |
| Realtime | SSE (уже работает) | `dashboard-backend.js` — менять не нужно |
| Charts/Graphs | React Flow (pipeline), Recharts (телеметрия) | По мере необходимости |
| TypeScript | strict mode | Типы для API контракта |
| Desktop (позже) | Electron 34 | `electron-vite`, тот же SPA |

### 3.2 Структура проекта

```
ctx-app/                        ← новая директория в корне
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx                    ← entry point
    App.tsx                     ← router + layout
    api/
      client.ts                ← fetch wrapper для /api/*
      types.ts                 ← Zod schemas (shared с backend)
      hooks.ts                 ← useQuery-подобные хуки с SSE
    components/
      layout/
        Sidebar.tsx            ← навигация (из текущего dashboard)
        Header.tsx             ← project info + pipeline badge
      pipeline/
        PipelineBar.tsx        ← визуальная полоса стадий
        StageCard.tsx          ← детали текущей стадии
      knowledge/
        KBSearch.tsx           ← поиск по KB (FTS5)
        KBStats.tsx            ← статистика KB
        EntryCard.tsx          ← карточка записи KB
      log/
        LogStream.tsx          ← SSE-лента событий
        LogFilter.tsx          ← фильтры по action/level
      agents/
        AgentList.tsx          ← список агентов + роли
        AgentCard.tsx          ← детали агента
      consilium/
        ConsiliumPanel.tsx     ← результаты consilium
        PresetSelector.tsx     ← выбор пресета
      session/
        SessionProgress.tsx    ← actions/errors timeline
        TaskForm.tsx           ← ввод задачи
    pages/
      Dashboard.tsx            ← главная (pipeline + log + quick actions)
      Knowledge.tsx            ← KB search + stats + entries
      Agents.tsx               ← агенты + consilium
      Settings.tsx             ← провайдеры, capabilities, config
```

### 3.3 Backend = существующий dashboard-backend.js

НЕ создаём новый backend. Существующий `dashboard-backend.js` уже предоставляет:

```
GET  /                          ← сейчас HTML, заменим на SPA
GET  /api/state                 ← полный snapshot (pipeline, log, agents, ...)
GET  /events                    ← SSE stream (full, patch, reload events)
POST /api/pipeline/stage        ← setStage(stage)
POST /api/pipeline/task         ← setTask(task)
POST /api/pipeline/full         ← full task setup
POST /api/agents/:id            ← agent details
```

**Добавить** (минимально, в `dashboard-backend.js`):

```
GET  /api/kb/search?q=...&limit=N    ← proxy to knowledgeStore.searchEntries()
GET  /api/kb/context/:project        ← proxy to knowledgeStore.getContextForProject()
GET  /api/kb/stats                   ← proxy to knowledgeStore.getStats()
POST /api/kb/save                    ← proxy to knowledgeStore.saveEntry()
POST /api/kb/sync                    ← proxy to kbSync.pull/push()
```

Интеграция: `dashboard-backend.js` импортирует `createKnowledgeStore()` так же, как `ctx-mcp-hub.js`.

---

## 4. Unified API Contract v1

### 4.1 Методы

| Метод | HTTP | Описание |
|---|---|---|
| `pipeline.getState` | `GET /api/state` | Полный snapshot |
| `pipeline.setStage` | `POST /api/pipeline/stage` | Переход стадии |
| `pipeline.setTask` | `POST /api/pipeline/task` | Установка задачи |
| `pipeline.setFull` | `POST /api/pipeline/full` | Полная настройка (task + lead + agents) |
| `log.stream` | `GET /events` (SSE) | Live-лента событий |
| `kb.search` | `GET /api/kb/search` | FTS5 поиск по KB |
| `kb.context` | `GET /api/kb/context/:project` | Контекст проекта |
| `kb.stats` | `GET /api/kb/stats` | Статистика KB |
| `kb.save` | `POST /api/kb/save` | Сохранить запись |
| `kb.sync` | `POST /api/kb/sync` | Pull/push KB repo |
| `agents.list` | `GET /api/state` → `.agents` | Список агентов |
| `agents.details` | `POST /api/agents/:id` | Детали агента |
| `storage.health` | `GET /api/state` → `.storageHealth` | Здоровье storage |

### 4.2 Zod Schemas (shared)

```typescript
// ctx-app/src/api/types.ts — импортируются и backend, и frontend
export const PipelineSchema = z.object({
  stage: z.enum(['detect','context','task','brainstorm','plan','execute','done']),
  lead: z.enum(['claude','gemini','opencode','codex']),
  task: z.string().nullable(),
  updatedAt: z.string()
});

export const KBSearchParams = z.object({
  q: z.string().min(1).max(300),
  limit: z.number().int().min(1).max(50).default(10),
  project: z.string().optional()
});

export const KBEntry = z.object({
  project: z.string(),
  category: z.enum(['solution','decision','pattern','error','session-summary']),
  title: z.string(),
  body: z.string(),
  tags: z.string().optional()
});
```

### 4.3 Transport Adapters (для будущего Desktop)

```typescript
// ctx-app/src/api/client.ts
interface ApiClient {
  getState(): Promise<AppState>;
  setStage(stage: string): Promise<void>;
  setTask(task: string): Promise<void>;
  searchKB(query: string, opts?): Promise<KBEntry[]>;
  // ...
}

// Web: HttpApiClient → fetch(/api/*)
// Desktop (позже): IpcApiClient → ipcRenderer.invoke()
// Оба реализуют один интерфейс
```

---

## 5. Source of Truth и данные

### 5.1 Data Sources

| Source | Тип | Описание |
|---|---|---|
| `.data/pipeline.json` | Файл (JSON) | Состояние pipeline |
| `.data/log.jsonl` | Файл (append-only) | Лог событий |
| `.data/index.json` | Файл (JSON) | Карта проекта (от ctx-indexer) |
| `.data/session.json` | Файл (JSON) | Текущая сессия (actions, errors) |
| `~/.config/ctx/knowledge/knowledge.sqlite` | SQLite (FTS5) | Knowledge Base — кросс-проектная |
| `~/.config/ctx/knowledge/.git` | Git repo | Синхронизация KB между устройствами |

### 5.2 Правила

- Zustand хранит только UI state и кэш — не источник правды.
- Любое изменение pipeline проходит через `dashboard-actions.js` → storage → `.data/`.
- KB-изменения проходят через `knowledgeStore` API.
- SSE broadcast уведомляет UI об изменениях в реальном времени.

---

## 6. Дорожная Карта (Web-first Roadmap)

### Фаза 0 (3-4 дня): Foundation

- [ ] Создать `ctx-app/` с Vite + React + TypeScript + Tailwind
- [ ] Настроить proxy в `vite.config.ts` → `localhost:7331` (существующий dashboard)
- [ ] Создать `api/client.ts` + `api/types.ts` (Zod schemas)
- [ ] Создать SSE hook (`useEventStream`) для real-time обновлений
- [ ] Базовый Layout: Sidebar + Header (портировать стили из `dashboard-frontend.js`)

**DoD:**
- `npm run dev` открывает SPA, подключённое к dashboard-backend через proxy.
- SSE stream работает, UI обновляется в реальном времени.
- Sidebar навигация между страницами.

### Фаза 1 (1 неделя): Core Pages

- [ ] Dashboard page: PipelineBar + LogStream + SessionProgress
- [ ] Knowledge page: KBSearch + KBStats + EntryCard
- [ ] Добавить KB HTTP endpoints в `dashboard-backend.js`
- [ ] Портировать task form (setTask, setStage)

**DoD:**
- Pipeline state отображается и обновляется в реальном времени.
- KB поиск работает через UI (FTS5 → HTTP → React).
- `task → plan → execute → done` E2E сценарий через UI.
- SSE reconnect < 5s.

### Фаза 2 (1 неделя): Agents & Consilium

- [ ] Agents page: AgentList + AgentCard + роли/стадии
- [ ] ConsiliumPanel: результаты consilium, preset selector
- [ ] LogFilter: фильтры по action type, поиск по тексту
- [ ] Hotkeys для core-операций (Ctrl+K → search KB, Ctrl+T → new task)
- [ ] Dark/Light theme toggle (CSS vars уже есть в dashboard)

**DoD:**
- Все 6 табов текущего dashboard воспроизведены в React.
- Hotkeys работают.
- Legacy dashboard-frontend.js можно отключить.

### Фаза 3 (1 неделя): Advanced & Polish

- [ ] React Flow: pipeline graph (стадии как ноды, агенты как подноды)
- [ ] Телеметрия: latency/success charts (Recharts)
- [ ] Settings page: provider capabilities, KB config
- [ ] PWA manifest + offline fallback (для работы без сети)
- [ ] Production build: `vite build` → static files served dashboard-backend

**DoD:**
- Pipeline graph поддерживает 3 состояния ноды (pending/running/done).
- Settings page показывает KB stats + provider health.
- Production build работает через `node ctx-dashboard.js` (вместо отдельного dev server).

### Фаза 4 (по необходимости): Desktop Shell

- [ ] Добавить `electron/` в `ctx-app/` с `electron-vite`
- [ ] Preload bridge: IpcApiClient реализует тот же ApiClient interface
- [ ] Terminal tab: xterm.js + node-pty через IPC
- [ ] Auto-update: electron-updater с canary channel
- [ ] Code review: Monaco diff viewer

**DoD:**
- Desktop показывает тот же UI что Web.
- Терминал работает только через allowlisted команды.
- IPC и HTTP API возвращают идентичные response (contract tests).

---

## 7. Стратегия Провайдеров (Capability-first)

Не зависеть от конкретных моделей:

```jsonc
// providers/capabilities.json
{
  "claude": {
    "capabilities": ["planning", "coding", "review", "tool_use", "long_context"],
    "models": { "default": "claude-sonnet-4-6", "strong": "claude-opus-4-6" }
  },
  "gemini": {
    "capabilities": ["long_context", "coding", "review"],
    "models": { "default": "gemini-2.5-pro" }
  },
  "codex": {
    "capabilities": ["coding", "review"],
    "models": { "default": "o4-mini" }
  },
  "opencode": {
    "capabilities": ["coding", "tool_use"],
    "models": { "default": "configurable" }
  }
}
```

- UI показывает capabilities, не имена моделей.
- `providers/router.js` маршрутизирует задачи по capabilities.
- Модели обновляются как конфиг, не как код.

---

## 8. Security Baseline

С первой фазы:

- Auth token для POST `/api/*` (уже реализован в `dashboard-backend.js`).
- Origin check: только localhost (уже реализован).
- Rate limiting: 30 req/min per IP (уже реализован).
- Path traversal защита для agent details (уже реализован).
- CSP headers для SPA.
- Секреты/токены не попадают в UI/SSE без redaction.
- Desktop (Фаза 4): `contextIsolation: true`, `sandbox: true`, IPC allowlist.

---

## 9. Testing Strategy

| Уровень | Что тестируем | Инструмент |
|---|---|---|
| Unit | KB store, storage adapters, Zod schemas | `node:test` (есть 14 тестов) |
| API | KB HTTP endpoints, pipeline mutations | Supertest или fetch-based |
| SSE | Reconnect, event delivery, keepalive | Integration test |
| Contract | HTTP response parity (Web vs будущий IPC) | Zod parse на обоих транспортах |
| E2E | Core flows через UI | Playwright (позже) |

Quality gates:
- `lint + typecheck + unit` — обязательны для merge.
- `contract tests` — обязательны для изменений API.
- E2E smoke — перед релизом.

---

## 10. Риски и Митигации

| Риск | Митигация |
|---|---|
| Scope creep в React UI | Фаза 1 = только Pipeline + KB + Log. Всё остальное — позже. |
| Дрейф backend API | Zod schemas shared между `dashboard-backend.js` и `ctx-app/src/api/`. |
| Legacy dashboard зависимости | Плавная миграция: React SPA подключается к тому же backend, legacy HTML удаляется в конце Фазы 2. |
| Offline без KB данных | SQLite KB работает offline. PWA fallback для статики. Git sync при возврате online. |
| Electron добавляет complexity | Desktop отложен на Фазу 4. Web покрывает 90% use cases. |

---

## 11. Приоритетные Следующие Шаги (первая неделя)

1. `npm create vite@latest ctx-app -- --template react-ts` + Tailwind + shadcn/ui.
2. Proxy в `vite.config.ts` → `http://127.0.0.1:7331`.
3. `api/client.ts` — fetch wrapper с auth token.
4. `useEventStream()` — SSE hook с auto-reconnect.
5. Layout + PipelineBar + LogStream — первый рабочий экран.
6. KB HTTP endpoints в `dashboard-backend.js`.
7. KBSearch component — поиск через UI.

---

## 12. Env переменные

| Переменная | Default | Описание |
|---|---|---|
| `CTX_DATA_DIR` | `.data` | Директория данных |
| `CTX_STORAGE` | `json` | Режим storage (json/sqlite) |
| `CTX_KB_PATH` | `~/.config/ctx/knowledge/knowledge.sqlite` | Путь к KB |
| `CTX_KB_REPO` | `VladPatr96/ctx-knowledge` | GitHub repo для KB sync |
| `CTX_KB_DISABLED` | `0` | Отключить KB |
| `CTX_KB_GH_FALLBACK` | `0` | gh CLI fallback при пустых результатах |
| `CTX_KB_AUTO_SYNC` | `1` | Auto git pull/push KB |
| `GITHUB_OWNER` | `VladPatr96` | Owner для gh CLI поиска |


<!-- Source: ctx-web-app-plan.md -->

# CTX Web Application (Path B) — Полный Детальный План

---

## 📋 Executive Summary

**Цель**: Преобразовать существующий dashboard в современное web-приложение на React/Next.js SPA с расширенными функциями управления мультипровайдерным AI-развитием.

**Технический Stack**: Next.js 14 + React 18 + TypeScript + Tailwind CSS + shadcn/ui + Recharts + D3 + Zustand + SWR

**Тimeline**: 8 недель (2 месяца)
**Team Size**: 1-2 разработчика

---

## 🏗️ Project Structure

```
ctx-web/
├── app/                           # Next.js App Router
│   ├── layout.tsx                  # Root layout + providers
│   ├── page.tsx                    # Dashboard home
│   ├── providers/
│   │   ├── page.tsx               # Provider comparison dashboard
│   │   ├── [id]/
│   │   │   └── page.tsx           # Provider details page
│   │   └── components/
│   │       ├── ProviderCard.tsx
│   │       ├── ProviderComparison.tsx
│   │       ├── ProviderHealthChart.tsx
│   │       ├── ProviderCostChart.tsx
│   │       └── ProviderStrengthsGrid.tsx
│   ├── orchestration/
│   │   ├── page.tsx               # Task builder & workflow runner
│   │   └── components/
│   │       ├── TaskBuilder.tsx     # Drag-and-drop stage builder
│   │       ├── WorkflowRunner.tsx   # Real-time workflow execution
│   │       ├── TaskGraph.tsx       # D3 DAG visualization
│   │       └── WorkflowResults.tsx # Results display
│   ├── telemetry/
│   │   ├── page.tsx               # Metrics dashboard
│   │   └── components/
│   │       ├── MetricsOverview.tsx
│   │       ├── LatencyChart.tsx
│   │       ├── SuccessRateChart.tsx
│   │       ├── CostChart.tsx
│   │       ├── ProviderHeatmap.tsx
│   │       └── TimeRangeSelector.tsx
│   ├── pipeline/
│   │   ├── page.tsx               # Pipeline management (legacy tabs)
│   │   └── components/
│   │       ├── PipelineStrip.tsx
│   │       ├── TaskInput.tsx
│   │       ├── AgentsGrid.tsx
│   │       ├── ProjectMap.tsx
│   │       └── TaskHistory.tsx
│   ├── console/
│   │   ├── page.tsx               # Log viewer
│   │   └── components/
│   │       ├── LogTimeline.tsx
│   │       ├── LogFilters.tsx
│   │       ├── LogSearch.tsx
│   │       ├── ProgressTimeline.tsx
│   │       └── ErrorList.tsx
│   ├── brainstorm/
│   │   ├── page.tsx               # Brainstorm & plans
│   │   └── components/
│   │       ├── BrainstormSummary.tsx
│   │       ├── PlanVariants.tsx
│   │       ├── PlanCard.tsx
│   │       ├── ConsiliumSynthesis.tsx
│   │       └── PlanSelector.tsx
│   ├── agents/
│   │   ├── page.tsx               # Agent management
│   │   └── components/
│   │       ├── AgentsGrid.tsx
│   │       ├── AgentCard.tsx
│   │       ├── AgentDetailsModal.tsx
│   │       ├── SkillRegistry.tsx
│   │       └── AgentActivationToggle.tsx
│   ├── consilium/
│   │   ├── page.tsx               # Consilium presets & results
│   │   └── components/
│   │       ├── PresetList.tsx
│   │       ├── PresetActivateButton.tsx
│   │       ├── ResultsByProvider.tsx
│   │       ├── ConfidenceBars.tsx
│   │       ├── ProviderFilters.tsx
│   │       └── ConsiliumResultsTimeline.tsx
│   ├── settings/
│   │   ├── page.tsx               # Settings page
│   │   └── components/
│   │       ├── ModelSelectors.tsx
│   │       ├── ThemeSelector.tsx
│   │       ├── StateInspector.tsx
│   │       ├── ApiSettings.tsx
│   │       └── Preferences.tsx
│   └── api/                      # Next.js API routes (proxy to backend)
│       ├── providers/
│       │   ├── route.ts           # GET /api/providers (status, metrics)
│       │   ├── compare/route.ts   # GET /api/providers/compare
│       │   ├── health/route.ts     # GET /api/providers/health
│       │   └── metrics/route.ts   # GET /api/providers/metrics
│       ├── orchestration/
│       │   ├── route.ts           # POST /api/orchestration/run
│       │   ├── validate/route.ts   # POST /api/orchestration/validate
│       │   └── cancel/route.ts    # POST /api/orchestration/cancel
│       ├── telemetry/
│       │   ├── route.ts           # GET /api/telemetry/summary
│       │   ├── history/route.ts   # GET /api/telemetry/history
│       │   └── export/route.ts   # GET /api/telemetry/export
│       └── pipeline/             # Legacy proxy routes
│           ├── stage/route.ts
│           ├── task/route.ts
│           └── ...
├── components/
│   ├── ui/                       # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── tabs.tsx
│   │   ├── table.tsx
│   │   ├── badge.tsx
│   │   ├── avatar.tsx
│   │   ├── select.tsx
│   │   ├── checkbox.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── toast.tsx
│   │   ├── tooltip.tsx
│   │   ├── progress.tsx
│   │   ├── separator.tsx
│   │   └── switch.tsx
│   ├── layout/
│   │   ├── AppSidebar.tsx         # Main navigation sidebar
│   │   ├── AppHeader.tsx          # Top header with status
│   │   ├── AppLayout.tsx          # Main layout wrapper
│   │   ├── ThemeToggle.tsx        # Dark/light theme toggle
│   │   ├── StatusIndicator.tsx    # SSE connection status
│   │   └── NotificationBadges.tsx # Tab badges
│   ├── providers/
│   │   ├── ProviderIcon.tsx
│   │   ├── ProviderChip.tsx
│   │   ├── ProviderStatusBadge.tsx
│   │   ├── CircuitBreakerIndicator.tsx
│   │   └── ProviderMetricsSummary.tsx
│   ├── pipeline/
│   │   ├── StageBadge.tsx
│   │   ├── TaskModal.tsx          # Create/edit task modal
│   │   ├── LeadSelector.tsx
│   │   ├── PresetSelector.tsx
│   │   ├── AgentSelector.tsx
│   │   ├── SkillSelector.tsx
│   │   └── ModelSelector.tsx
│   ├── logs/
│   │   ├── LogEntry.tsx
│   │   ├── LogFilterBar.tsx
│   │   ├── LogSearchInput.tsx
│   │   └── ProgressStep.tsx
│   └── charts/
│       ├── LineChart.tsx          # Recharts wrapper
│       ├── BarChart.tsx
│       ├── AreaChart.tsx
│       ├── PieChart.tsx
│       └── Heatmap.tsx
├── lib/
│   ├── api/                       # API client
│   │   ├── client.ts              # Axios/fetch wrapper
│   │   ├── providers.ts           # Provider API calls
│   │   ├── pipeline.ts            # Pipeline API calls
│   │   ├── orchestration.ts       # Orchestration API calls
│   │   ├── telemetry.ts           # Telemetry API calls
│   │   └── sse.ts                # SSE client
│   ├── hooks/                     # Custom React hooks
│   │   ├── useProviders.ts        # Provider state & operations
│   │   ├── usePipeline.ts         # Pipeline state
│   │   ├── useOrchestration.ts    # Orchestration workflows
│   │   ├── useTelemetry.ts        # Telemetry data
│   │   ├── useSSE.ts             # SSE connection
│   │   ├── useLocalStorage.ts     # LocalStorage persistence
│   │   ├── useDebounce.ts        # Debounce utility
│   │   └── useKeyboardShortcuts.ts
│   ├── stores/                    # Zustand stores
│   │   ├── providerStore.ts       # Provider state
│   │   ├── pipelineStore.ts       # Pipeline state
│   │   ├── orchestrationStore.ts  # Orchestration state
│   │   ├── telemetryStore.ts      # Telemetry state
│   │   └── uiStore.ts            # UI state (theme, modals, notifications)
│   ├── types/
│   │   ├── provider.ts
│   │   ├── pipeline.ts
│   │   ├── orchestration.ts
│   │   ├── telemetry.ts
│   │   └── api.ts
│   ├── utils/
│   │   ├── format.ts             # Formatters (date, number, etc.)
│   │   ├── validation.ts         # Zod schemas
│   │   ├── constants.ts          # Constants
│   │   └── helpers.ts            # Helper functions
│   └── backend/                   # Backend integration layer
│       ├── index.ts               # Backend client (to existing server)
│       ├── types.ts               # Backend API types
│       └── proxy.ts              # Next.js API route proxy
├── public/
│   ├── favicon.ico
│   ├── logo.svg
│   └── icons/
├── styles/
│   └── globals.css               # Tailwind directives + custom styles
├── middleware.ts                 # Next.js middleware (auth, etc.)
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 🎨 Tech Stack

### Frontend Framework
- **Next.js 14** - React framework with App Router, Server Components, API routes
- **React 18** - UI library
- **TypeScript 5** - Type safety

### UI Components & Styling
- **Tailwind CSS 3.4** - Utility-first CSS
- **shadcn/ui** - Pre-built accessible components (Radix UI + Tailwind)
- **Recharts 2.12** - Chart library for metrics
- **D3.js 7.9** - Task graph visualization
- **Lucide React** - Icon library

### State Management
- **Zustand 4.5** - Lightweight state management
- **SWR 2.2** - Data fetching and caching
- **React Query (alternative)** - If needed for complex caching

### Real-time Updates
- **EventSource API** - Native SSE support (or `@microsoft/fetch-event-source` for polyfill)

### Forms & Validation
- **React Hook Form 7** - Form handling
- **Zod 3.24** - Schema validation

### Utilities
- **date-fns** - Date formatting
- **clsx & tailwind-merge** - Class name utilities
- **nanoid** - Unique ID generation

### Development
- **ESLint** - Linting
- **Prettier** - Code formatting
- **TypeScript ESLint** - TypeScript linting

---

## 🏛️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   React Components                      │   │
│  │  ┌─────────┬─────────┬─────────┬─────────┬────────┐ │   │
│  │  │Provider │Orchest-│Telem-  │Pipeline │Consilium│ │   │
│  │  │Dashboard│ration  │etry    │Mgmt     │Mgmt     │ │   │
│  │  └─────────┴─────────┴─────────┴─────────┴────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Zustand Stores                      │   │
│  │  providerStore | pipelineStore | orchestrationStore   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Custom Hooks                         │   │
│  │  useProviders | usePipeline | useOrchestration       │   │
│  │  useTelemetry | useSSE | useLocalStorage            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    API Layer                           │   │
│  │  lib/api/client.ts | lib/api/providers.ts            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                  │
└────────────────────────────┼──────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Next.js API   │  │   SSE Client  │  │ Next.js API   │
│   Routes      │  │ (EventSource) │  │   Routes      │
│  (Proxy)      │  │               │  │  (Proxy)      │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                    │                    │
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Existing Backend Server                       │
│  (dashboard-backend.js + dashboard-actions.js + providers/)     │
├─────────────────────────────────────────────────────────────────┤
│  • HTTP Server with SSE                                       │
│  • File-based storage (.data/)                                  │
│  • Provider registry & circuit breaker                          │
│  • Action mutators (setStage, setTask, etc.)                  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   File System Storage                          │
│  .data/pipeline.json, .data/log.jsonl, agents/*.md, etc.      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Interaction                          │
│  (Click, Drag, Type, Keyboard Shortcut)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   React Event Handler                         │
│  onClick, onChange, onSubmit, onKeyPress                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Zustand Store Action                        │
│  providerStore.setMetrics(), pipelineStore.setTask(), etc.    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API Client Call                             │
│  lib/api/providers.updateMetrics()                            │
│  → fetch('/api/providers/metrics', { method: 'POST' })       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Next.js API Route                          │
│  app/api/providers/metrics/route.ts                          │
│  → Backend action: actions.updateProviderMetrics()             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend Server                              │
│  File watcher triggers → refreshAllData() → broadcast()      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SSE Event                                  │
│  EventSource('/events') receives 'full' or partial events      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   useSSE Hook                                │
│  Event handlers update Zustand stores                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   React Re-render                            │
│  Components re-render when store state changes                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database & Storage

### Current Storage (File-Based)
```
.data/
├── pipeline.json          # Pipeline state
├── index.json           # Project index
├── session.json         # Session data
├── log.jsonl           # Append-only log
├── results.json         # Consilium results
├── provider-health.json # Circuit breaker state
├── provider-metrics.json # NEW: Historical metrics
└── provider-telemetry.jsonl # NEW: Append-only telemetry log
```

### New Storage Files (for Web App)

```javascript
// .data/provider-metrics.json
{
  "claude": {
    "latency": [145, 152, 148, ...],
    "successRate": 0.95,
    "totalRequests": 1250,
    "failedRequests": 62,
    "cost": 2.50,
    "avgTokens": 1250,
    "lastUpdated": "2026-02-19T10:00:00Z"
  },
  "gemini": { ... },
  "opencode": { ... },
  "codex": { ... }
}

// .data/provider-telemetry.jsonl (NEW)
{"ts":"2026-02-19T10:00:00Z","provider":"claude","latency":145,"success":true,"tokens":1250,"cost":0.0025}
{"ts":"2026-02-19T10:00:15Z","provider":"gemini","latency":98,"success":true,"tokens":980,"cost":0.0019}
...

// .data/workflow-executions.json (NEW)
{
  "workflows": [
    {
      "id": "wf_abc123",
      "task": "Add user authentication",
      "stages": [
        { "id": "planning", "provider": "claude", "status": "completed", "result": {...} },
        { "id": "coding", "provider": "opencode", "status": "in_progress" }
      ],
      "startedAt": "2026-02-19T09:00:00Z",
      "updatedAt": "2026-02-19T10:30:00Z"
    }
  ]
}
```

---

## 📊 Component Architecture

### Component Tree (Simplified)

```
AppLayout
├── AppSidebar
│   ├── NavItem (Providers)
│   ├── NavItem (Orchestration)
│   ├── NavItem (Telemetry)
│   ├── NavItem (Pipeline)
│   ├── NavItem (Console)
│   ├── NavItem (Brainstorm)
│   ├── NavItem (Agents)
│   ├── NavItem (Consilium)
│   └── NavItem (Settings)
├── AppHeader
│   ├── Logo
│   ├── StatusIndicator (SSE connection)
│   ├── ThemeToggle
│   └── UserMenu (if applicable)
└── MainContent
    ├── ProvidersPage
    │   ├── ProviderCard × 4
    │   ├── ProviderComparison
    │   └── ProviderHeatmap
    ├── OrchestrationPage
    │   ├── TaskBuilder
    │   ├── WorkflowRunner
    │   └── TaskGraph
    ├── TelemetryPage
    │   ├── MetricsOverview
    │   ├── LatencyChart
    │   ├── SuccessRateChart
    │   └── CostChart
    ├── PipelinePage (legacy tabs)
    │   ├── PipelineStrip
    │   ├── TaskInput
    │   ├── AgentsGrid
    │   └── ProjectMap
    ├── ConsolePage
    │   ├── LogTimeline
    │   ├── LogFilters
    │   └── ProgressTimeline
    ├── BrainstormPage
    │   ├── BrainstormSummary
    │   ├── PlanVariants
    │   └── ConsiliumSynthesis
    ├── AgentsPage
    │   ├── AgentsGrid
    │   └── SkillRegistry
    ├── ConsiliumPage
    │   ├── PresetList
    │   └── ResultsByProvider
    └── SettingsPage
        ├── ModelSelectors
        ├── ThemeSelector
        └── StateInspector
```

---

## 🔌 API Endpoints

### Legacy Proxy Endpoints (Next.js → Existing Backend)

```typescript
// app/api/pipeline/stage/route.ts
POST /api/pipeline/stage
Body: { stage: 'detect' | 'context' | ... }
Response: { ok: true }

// app/api/pipeline/task/route.ts
POST /api/pipeline/task
Body: TASK_FULL_SCHEMA
Response: { ok: true }

// app/api/pipeline/lead/route.ts
POST /api/pipeline/lead
Body: { lead: 'claude' | 'gemini' | 'opencode' | 'codex' }
Response: { ok: true }

// app/api/pipeline/reset/route.ts
POST /api/pipeline/reset
Response: { ok: true }

// app/api/pipeline/plan/route.ts
POST /api/pipeline/plan
Body: { selected: number }
Response: { ok: true }

// app/api/log/clear/route.ts
POST /api/log/clear
Response: { ok: true }

// app/api/agent/details/route.ts
POST /api/agent/details
Body: { id: string }
Response: { content: string }

// app/api/consilium/activate/route.ts
POST /api/consilium/activate
Body: { preset: string }
Response: { ok: true }
```

### New Provider Endpoints (Next.js → Existing Backend + New Logic)

```typescript
// app/api/providers/route.ts
GET /api/providers
Response: {
  providers: {
    claude: {
      name: 'claude',
      transport: 'native',
      capabilities: ['mcp', 'skills', 'hooks', 'agents'],
      circuitOpen: false,
      health: { available: true, lastCheck: string },
      metrics: {
        latency: { avg: 145, p50: 140, p95: 180, p99: 200 },
        successRate: 0.95,
        totalRequests: 1250,
        failedRequests: 62,
        cost: 2.50,
        avgTokens: 1250,
        lastUpdated: string
      }
    },
    gemini: { ... },
    opencode: { ... },
    codex: { ... }
  }
}

// app/api/providers/compare/route.ts
GET /api/providers/compare?providers=claude,gemini&metric=latency
Response: {
  comparison: {
    claude: { latency: 145, successRate: 0.95, cost: 0.002/1k },
    gemini: { latency: 98, successRate: 0.98, cost: 0.001/1k }
  },
  winner: 'gemini',
  reason: 'Lower latency and higher success rate'
}

// app/api/providers/health/route.ts
GET /api/providers/health
Response: {
  claude: { available: true, circuitOpen: false },
  gemini: { available: true, circuitOpen: false },
  opencode: { available: false, circuitOpen: true, reason: '3 consecutive failures' },
  codex: { available: true, circuitOpen: false }
}

// app/api/providers/route/route.ts
POST /api/providers/route
Body: { task: string, opts?: { multi?: boolean } }
Response: {
  routing: 'auto' | 'explicit' | 'multi' | 'fallback_default',
  provider: 'claude',
  strength: 'planning',
  reason: 'Task contains planning keywords',
  confidence: 0.9
}

// app/api/providers/metrics/route.ts
GET /api/providers/metrics?provider=claude&from=2026-02-01&to=2026-02-19
Response: {
  provider: 'claude',
  metrics: {
    latency: [
      { ts: '2026-02-19T09:00:00Z', value: 145 },
      { ts: '2026-02-19T09:05:00Z', value: 152 },
      ...
    ],
    successRate: [
      { ts: '2026-02-19T09:00:00Z', value: 0.95 },
      ...
    ],
    cost: [
      { ts: '2026-02-19T09:00:00Z', value: 0.0025 },
      ...
    ]
  }
}
```

### New Orchestration Endpoints

```typescript
// app/api/orchestration/validate/route.ts
POST /api/orchestration/validate
Body: {
  stages: [
    { id: 'planning', providers: ['claude'] },
    { id: 'coding', providers: ['opencode', 'codex'] },
    { id: 'testing', providers: ['codex'] },
    { id: 'review', providers: ['gemini', 'claude'] }
  ]
}
Response: {
  valid: true,
  errors: [],
  warnings: [],
  estimatedDuration: '2-3 hours'
}

// app/api/orchestration/run/route.ts
POST /api/orchestration/run
Body: {
  taskId: string,
  description: string,
  stages: [
    { id: 'planning', providers: ['claude'] },
    ...
  ],
  options?: {
    parallel?: boolean,
    timeout?: number,
    retryPolicy?: 'none' | 'immediate' | 'exponential'
  }
}
Response: {
  workflowId: 'wf_abc123',
  status: 'started',
  currentStage: 'planning',
  currentProvider: 'claude'
}

// app/api/orchestration/status/route.ts
GET /api/orchestration/status?workflowId=wf_abc123
Response: {
  workflowId: 'wf_abc123',
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled',
  currentStage: 'coding',
  stages: [
    { id: 'planning', provider: 'claude', status: 'completed', result: {...}, duration: 300000 },
    { id: 'coding', provider: 'opencode', status: 'in_progress', startedAt: '...', ... }
  ],
  startedAt: '...',
  updatedAt: '...',
  estimatedCompletion: '...'
}

// app/api/orchestration/cancel/route.ts
POST /api/orchestration/cancel
Body: { workflowId: string }
Response: { ok: true }
```

### New Telemetry Endpoints

```typescript
// app/api/telemetry/summary/route.ts
GET /api/telemetry/summary
Response: {
  providers: {
    claude: {
      totalRequests: 1250,
      successRate: 0.95,
      avgLatency: 145,
      totalCost: 2.50,
      topErrors: ['timeout', 'rate_limit']
    },
    ...
  },
  period: { start: '2026-02-01', end: '2026-02-19' }
}

// app/api/telemetry/history/route.ts
GET /api/telemetry/history?provider=claude&metric=latency
Response: {
  data: [
    { ts: '2026-02-19T09:00:00Z', value: 145 },
    { ts: '2026-02-19T09:05:00Z', value: 152 },
    ...
  ],
  aggregation: 'avg',
  interval: '5m'
}

// app/api/telemetry/export/route.ts
GET /api/telemetry/export?format=csv
Response: CSV file download
```

---

## 🧠 State Management (Zustand)

### Provider Store

```typescript
// lib/stores/providerStore.ts
import { create } from 'zustand';
import { Provider, ProviderMetrics, ProviderHealth } from '@/lib/types';

interface ProviderState {
  providers: {
    [key: string]: Provider & {
      health: ProviderHealth;
      metrics: ProviderMetrics;
    }
  };
  selectedProvider: string | null;
  comparisonProviders: string[];
  isLoading: boolean;

  // Actions
  setProviders: (providers: ProviderState['providers']) => void;
  updateProvider: (name: string, data: Partial<ProviderState['providers'][string]>) => void;
  selectProvider: (name: string | null) => void;
  toggleComparisonProvider: (name: string) => void;
  refreshProviders: () => Promise<void>;
  routeTask: (task: string, opts?: RouteOptions) => Promise<RouteResult>;
  setLead: (name: string) => Promise<void>;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: {},
  selectedProvider: null,
  comparisonProviders: [],
  isLoading: false,

  setProviders: (providers) => set({ providers }),

  updateProvider: (name, data) => set((state) => ({
    providers: {
      ...state.providers,
      [name]: { ...state.providers[name], ...data }
    }
  })),

  selectProvider: (name) => set({ selectedProvider: name }),

  toggleComparisonProvider: (name) => set((state) => ({
    comparisonProviders: state.comparisonProviders.includes(name)
      ? state.comparisonProviders.filter(p => p !== name)
      : [...state.comparisonProviders, name]
  })),

  refreshProviders: async () => {
    set({ isLoading: true });
    const data = await fetch('/api/providers').then(r => r.json());
    set({ providers: data.providers, isLoading: false });
  },

  routeTask: async (task, opts) => {
    const data = await fetch('/api/providers/route', {
      method: 'POST',
      body: JSON.stringify({ task, ...opts })
    }).then(r => r.json());
    return data;
  },

  setLead: async (name) => {
    await fetch('/api/pipeline/lead', {
      method: 'POST',
      body: JSON.stringify({ lead: name })
    }).then(r => r.json());
  }
}));
```

### Pipeline Store

```typescript
// lib/stores/pipelineStore.ts
import { create } from 'zustand';
import { Pipeline, Stage, Task } from '@/lib/types';

interface PipelineState {
  pipeline: Pipeline;
  isLoading: boolean;

  // Actions
  setPipeline: (pipeline: Pipeline) => void;
  setStage: (stage: Stage) => Promise<void>;
  setTask: (task: string) => Promise<void>;
  setTaskFull: (task: Task) => Promise<void>;
  resetPipeline: () => Promise<void>;
  setPlanSelected: (variantId: number) => Promise<void>;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  pipeline: { stage: 'detect', lead: 'claude', task: null },
  isLoading: false,

  setPipeline: (pipeline) => set({ pipeline }),

  setStage: async (stage) => {
    await fetch('/api/pipeline/stage', {
      method: 'POST',
      body: JSON.stringify({ stage })
    }).then(r => r.json());
  },

  setTask: async (task) => {
    await fetch('/api/pipeline/task', {
      method: 'POST',
      body: JSON.stringify({ task })
    }).then(r => r.json());
  },

  setTaskFull: async (task) => {
    await fetch('/api/pipeline/task', {
      method: 'POST',
      body: JSON.stringify(task)
    }).then(r => r.json());
  },

  resetPipeline: async () => {
    await fetch('/api/pipeline/reset', {
      method: 'POST',
      body: JSON.stringify({})
    }).then(r => r.json());
  },

  setPlanSelected: async (variantId) => {
    await fetch('/api/pipeline/plan', {
      method: 'POST',
      body: JSON.stringify({ selected: variantId })
    }).then(r => r.json());
  }
}));
```

### Orchestration Store

```typescript
// lib/stores/orchestrationStore.ts
import { create } from 'zustand';
import { Workflow, WorkflowStage, WorkflowStatus } from '@/lib/types';

interface OrchestrationState {
  workflows: Workflow[];
  activeWorkflow: Workflow | null;
  isRunning: boolean;

  // Actions
  setWorkflows: (workflows: Workflow[]) => void;
  setActiveWorkflow: (workflow: Workflow | null) => void;
  createWorkflow: (workflow: Omit<Workflow, 'id' | 'createdAt'>) => Promise<string>;
  startWorkflow: (workflowId: string) => Promise<void>;
  cancelWorkflow: (workflowId: string) => Promise<void>;
  updateWorkflowStatus: (workflowId: string, status: Partial<Workflow>) => void;
  addStageResult: (workflowId: string, stageId: string, result: any) => void;
}

export const useOrchestrationStore = create<OrchestrationState>((set, get) => ({
  workflows: [],
  activeWorkflow: null,
  isRunning: false,

  setWorkflows: (workflows) => set({ workflows }),

  setActiveWorkflow: (workflow) => set({ activeWorkflow: workflow }),

  createWorkflow: async (workflow) => {
    const id = nanoid();
    const newWorkflow: Workflow = {
      id,
      createdAt: new Date().toISOString(),
      status: 'pending',
      ...workflow
    };
    set((state) => ({ workflows: [...state.workflows, newWorkflow] }));

    await fetch('/api/orchestration/create', {
      method: 'POST',
      body: JSON.stringify(newWorkflow)
    }).then(r => r.json());

    return id;
  },

  startWorkflow: async (workflowId) => {
    set({ isRunning: true });
    await fetch('/api/orchestration/run', {
      method: 'POST',
      body: JSON.stringify({ workflowId })
    }).then(r => r.json());
  },

  cancelWorkflow: async (workflowId) => {
    await fetch('/api/orchestration/cancel', {
      method: 'POST',
      body: JSON.stringify({ workflowId })
    }).then(r => r.json());
    set({ isRunning: false, activeWorkflow: null });
  },

  updateWorkflowStatus: (workflowId, status) => {
    set((state) => ({
      workflows: state.workflows.map(w =>
        w.id === workflowId ? { ...w, ...status } : w
      ),
      activeWorkflow: state.activeWorkflow?.id === workflowId
        ? { ...state.activeWorkflow, ...status }
        : state.activeWorkflow
    }));
  },

  addStageResult: (workflowId, stageId, result) => {
    set((state) => ({
      workflows: state.workflows.map(w =>
        w.id === workflowId
          ? {
              ...w,
              stages: w.stages.map(s =>
                s.id === stageId ? { ...s, status: 'completed', result } : s
              )
            }
          : w
      )
    }));
  }
}));
```

### Telemetry Store

```typescript
// lib/stores/telemetryStore.ts
import { create } from 'zustand';
import { TelemetryData, TelemetryFilters } from '@/lib/types';

interface TelemetryState {
  data: {
    [provider: string]: TelemetryData;
  };
  filters: TelemetryFilters;
  isLoading: boolean;

  // Actions
  setData: (data: TelemetryState['data']) => void;
  setFilters: (filters: Partial<TelemetryFilters>) => void;
  refreshTelemetry: () => Promise<void>;
  exportTelemetry: (format: 'csv' | 'json') => Promise<Blob>;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  data: {},
  filters: { providers: ['all'], metrics: ['latency', 'successRate'], timeRange: '7d' },
  isLoading: false,

  setData: (data) => set({ data }),

  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),

  refreshTelemetry: async () => {
    set({ isLoading: true });
    const data = await fetch('/api/telemetry/summary').then(r => r.json());
    set({ data, isLoading: false });
  },

  exportTelemetry: async (format) => {
    const blob = await fetch(`/api/telemetry/export?format=${format}`).then(r => r.blob());
    return blob;
  }
}));
```

### UI Store

```typescript
// lib/stores/uiStore.ts
import { create } from 'zustand';

interface UIState {
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  activeTab: string;
  modals: {
    taskModal: boolean;
    agentModal: boolean;
    settingsModal: boolean;
  };
  notifications: Notification[];

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  toggleSidebar: () => void;
  setActiveTab: (tab: string) => void;
  openModal: (modal: keyof UIState['modals']) => void;
  closeModal: (modal: keyof UIState['modals']) => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  sidebarCollapsed: false,
  activeTab: 'providers',
  modals: { taskModal: false, agentModal: false, settingsModal: false },
  notifications: [],

  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    localStorage.setItem('activeTab', tab);
  },

  openModal: (modal) => set((state) => ({
    modals: { ...state.modals, [modal]: true }
  })),

  closeModal: (modal) => set((state) => ({
    modals: { ...state.modals, [modal]: false }
  })),

  addNotification: (notification) => set((state) => ({
    notifications: [...state.notifications, { id: nanoid(), ...notification }]
  })),

  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  }))
}));
```

---

## 🎯 Key Components (Detailed)

### 1. ProviderCard Component

```typescript
// app/providers/components/ProviderCard.tsx
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/lib/stores/providerStore';
import { Provider } from '@/lib/types';

interface ProviderCardProps {
  provider: Provider;
  onDragStart?: (provider: string) => void;
  onCompareToggle?: (provider: string) => void;
  isSelectedForComparison?: boolean;
}

export function ProviderCard({ provider, onDragStart, onCompareToggle, isSelectedForComparison }: ProviderCardProps) {
  const { health, metrics } = provider;
  const { selectProvider, setLead } = useProviderStore();
  const isSelected = useProviderStore(state => state.selectedProvider === provider.name);

  return (
    <Card
      className={`provider-card ${health.circuitOpen ? 'offline' : 'online'}`}
      draggable={!!onDragStart}
      onDragStart={() => onDragStart?.(provider.name)}
    >
      <CardHeader>
        <div className="provider-header">
          <ProviderIcon name={provider.name} />
          <div className="provider-info">
            <h3 className="provider-name">{provider.name}</h3>
            <div className="provider-meta">
              <Badge variant={health.circuitOpen ? 'destructive' : 'default'}>
                {health.circuitOpen ? '⚠️ Circuit Open' : '● Live'}
              </Badge>
              <Badge variant="secondary">{provider.transport}</Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="provider-metrics">
          <Metric label="Latency" value={`${metrics.latency.avg}ms`} />
          <Metric label="P95" value={`${metrics.latency.p95}ms`} />
          <Metric label="Success Rate" value={`${(metrics.successRate * 100).toFixed(1)}%`} />
          <Metric label="Cost" value={`$${metrics.cost.toFixed(2)}`} />
          <Metric label="Requests" value={metrics.totalRequests.toLocaleString()} />
        </div>

        <div className="provider-strengths">
          {provider.strengths.map(strength => (
            <Badge key={strength} variant="outline">{strength}</Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="provider-footer">
        <Button
          variant={isSelected ? 'default' : 'outline'}
          onClick={() => selectProvider(isSelected ? null : provider.name)}
        >
          {isSelected ? 'View Details' : 'Select'}
        </Button>
        <Button variant="ghost" onClick={() => setLead(provider.name)}>
          Set as Lead
        </Button>
        <Button
          variant={isSelectedForComparison ? 'default' : 'outline'}
          onClick={() => onCompareToggle?.(provider.name)}
        >
          {isSelectedForComparison ? '✓' : 'Compare'}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
```

### 2. TaskBuilder Component

```typescript
// app/orchestration/components/TaskBuilder.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrchestrationStore } from '@/lib/stores/orchestrationStore';
import { useProviderStore } from '@/lib/stores/providerStore';
import { WorkflowStage, Provider } from '@/lib/types';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STAGE_TEMPLATES = [
  { id: 'planning', label: '📐 Planning', defaultProviders: ['claude'] },
  { id: 'coding', label: '💻 Coding', defaultProviders: ['opencode', 'codex'] },
  { id: 'testing', label: '🧪 Testing', defaultProviders: ['codex'] },
  { id: 'review', label: '👀 Review', defaultProviders: ['gemini', 'claude'] }
];

export function TaskBuilder() {
  const { createWorkflow, startWorkflow, activeWorkflow, isRunning } = useOrchestrationStore();
  const { providers } = useProviderStore();
  const [stages, setStages] = useState<WorkflowStage[]>(STAGE_TEMPLATES.map(t => ({
    id: t.id,
    label: t.label,
    providers: t.defaultProviders
  })));
  const [taskDescription, setTaskDescription] = useState('');

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStages(items => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleStartWorkflow = async () => {
    const workflowId = await createWorkflow({
      task: taskDescription,
      stages,
      status: 'pending'
    });
    await startWorkflow(workflowId);
  };

  return (
    <div className="task-builder">
      <Card>
        <CardHeader>
          <CardTitle>Task Orchestration Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="task-input-section">
            <label htmlFor="task-description">Task Description</label>
            <textarea
              id="task-description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe your task..."
              rows={3}
            />
          </div>

          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={stages} strategy={verticalListSortingStrategy}>
              <div className="workflow-stages">
                {stages.map(stage => (
                  <StageDropZone
                    key={stage.id}
                    stage={stage}
                    providers={providers}
                    onProvidersChange={(newProviders) => {
                      setStages(stages.map(s =>
                        s.id === stage.id ? { ...s, providers: newProviders } : s
                      ));
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="workflow-actions">
            <Button onClick={handleStartWorkflow} disabled={!taskDescription || isRunning}>
              {isRunning ? 'Running...' : '▶ Run Workflow'}
            </Button>
            {activeWorkflow && (
              <Button variant="destructive" onClick={() => cancelWorkflow(activeWorkflow.id)}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StageDropZone({ stage, providers, onProvidersChange }: StageDropZoneProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="stage-drop-zone">
      <h3 className="stage-label">{stage.label}</h3>
      <div className="provider-pool">
        {providers.map(provider => (
          <ProviderChip
            key={provider.name}
            provider={provider}
            active={stage.providers.includes(provider.name)}
            onToggle={() => {
              if (stage.providers.includes(provider.name)) {
                onProvidersChange(stage.providers.filter(p => p !== provider.name));
              } else {
                onProvidersChange([...stage.providers, provider.name]);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### 3. MetricsOverview Component

```typescript
// app/telemetry/components/MetricsOverview.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTelemetryStore } from '@/lib/stores/telemetryStore';
import { Provider } from '@/lib/types';

export function MetricsOverview() {
  const { data, filters, setFilters } = useTelemetryStore();
  const providers = Object.values(data);

  const chartData = useMemo(() => {
    if (providers.length === 0) return [];

    // Combine latency data from all providers
    const timePoints = new Set<string>();
    providers.forEach(p => {
      p.latency.forEach(entry => timePoints.add(entry.ts));
    });

    return Array.from(timePoints).sort().map(ts => {
      const point: any = { ts: new Date(ts).toLocaleTimeString() };
      providers.forEach(p => {
        const entry = p.latency.find(l => l.ts === ts);
        point[p.name] = entry ? entry.value : null;
      });
      return point;
    });
  }, [data]);

  const colors = {
    claude: '#5b8af5',
    gemini: '#9b8afb',
    opencode: '#4de2c5',
    codex: '#f5a623'
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latency Overview</CardTitle>
        <TimeRangeSelector
          value={filters.timeRange}
          onChange={(range) => setFilters({ timeRange: range })}
        />
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <XAxis dataKey="ts" />
            <YAxis />
            <Tooltip />
            <Legend />
            {providers.map(provider => (
              <Line
                key={provider.name}
                type="monotone"
                dataKey={provider.name}
                stroke={colors[provider.name as keyof typeof colors]}
                name={provider.name}
                connectNulls={false}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

---

## 📋 Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

#### Week 1: Project Setup & Core Infrastructure

**Day 1-2: Project Initialization**
- [ ] Initialize Next.js 14 project with TypeScript
  ```bash
  npx create-next-app@latest ctx-web --typescript --tailwind --app --src-dir
  ```
- [ ] Install dependencies
  ```bash
  npm install zustand swr recharts d3 @radix-ui/react-dialog @radix-ui/react-tabs
  npm install lucide-react date-fns clsx tailwind-merge nanoid react-hook-form zod
  ```
- [ ] Setup shadcn/ui
  ```bash
  npx shadcn-ui@latest init
  ```
- [ ] Configure Tailwind CSS
  - Custom colors (matching existing dashboard theme)
  - Dark/light mode support
- [ ] Setup ESLint + Prettier
- [ ] Configure TypeScript paths (aliases)

**Day 3-4: Core Layout Components**
- [ ] Create `AppLayout` component
  - Sidebar navigation
  - Header with status indicator
  - Main content area
- [ ] Create `AppSidebar` component
  - Navigation items with icons
  - Active state highlighting
  - Collapse/expand functionality
- [ ] Create `AppHeader` component
  - Logo
  - SSE status indicator
  - Theme toggle
- [ ] Create `ThemeToggle` component
  - Dark/light mode switch
  - localStorage persistence

**Day 5: Routing & Pages Skeleton**
- [ ] Create route structure
  - `/providers`
  - `/orchestration`
  - `/telemetry`
  - `/pipeline` (legacy tabs as sub-routes)
  - `/console`
  - `/brainstorm`
  - `/agents`
  - `/consilium`
  - `/settings`
- [ ] Create placeholder pages for all routes

#### Week 2: Backend Integration & State Management

**Day 1-2: API Client & Backend Proxy**
- [ ] Create `lib/api/client.ts`
  - Fetch wrapper with error handling
  - Bearer token authentication
  - Request/response interceptors
- [ ] Create `lib/backend/index.ts`
  - Backend client to existing server
  - SSE client (`useSSE` hook)
- [ ] Create Next.js API proxy routes
  - Legacy routes (pipeline, task, lead, etc.)
  - Provider routes (new endpoints)
- [ ] Test backend integration

**Day 3-4: Zustand Stores**
- [ ] Create `providerStore.ts`
- [ ] Create `pipelineStore.ts`
- [ ] Create `orchestrationStore.ts`
- [ ] Create `telemetryStore.ts`
- [ ] Create `uiStore.ts`
- [ ] Create `useLocalStorage.ts` hook
- [ ] Create `useDebounce.ts` hook

**Day 5: SSE Integration**
- [ ] Create `useSSE` hook
  - EventSource connection
  - Auto-reconnect logic
  - Event handlers (full, partial)
  - Store integration
- [ ] Test SSE with existing backend

---

### Phase 2: Provider Dashboard (Weeks 3-4)

#### Week 3: Provider Components

**Day 1-2: Provider Card & Metrics**
- [ ] Create `ProviderCard` component
  - Provider icon, name, status
  - Metrics display (latency, success rate, cost)
  - Circuit breaker indicator
  - Strengths badges
  - Actions (select, set lead, compare)
- [ ] Create `ProviderComparison` component
  - Side-by-side comparison
  - Metric deltas
  - Winner recommendation
- [ ] Create `ProviderHealthChart` component
  - Recharts line chart for latency
  - Success rate over time

**Day 3-4: Provider Pages**
- [ ] Create `/providers` page
  - Provider cards grid
  - Comparison section (if providers selected)
  - Overall stats summary
- [ ] Create `/providers/[id]` page
  - Detailed provider info
  - Historical metrics charts
  - Recent requests log
  - Strengths & capabilities

**Day 5: Provider API Integration**
- [ ] Create `lib/api/providers.ts`
- [ ] Create `/api/providers` Next.js route
- [ ] Create `/api/providers/compare` Next.js route
- [ ] Create `/api/providers/health` Next.js route
- [ ] Create `/api/providers/metrics` Next.js route

#### Week 4: Provider Telemetry

**Day 1-2: Telemetry Components**
- [ ] Create `LatencyChart` component
  - Multi-provider line chart
  - Time range selector
  - P50/P95/P99 indicators
- [ ] Create `SuccessRateChart` component
  - Stacked area chart
  - Error rate overlay
- [ ] Create `CostChart` component
  - Cumulative cost over time
  - Cost per 1K tokens breakdown

**Day 3-4: Telemetry Dashboard**
- [ ] Create `/telemetry` page
  - Metrics overview (cards)
  - Charts grid
  - Export functionality (CSV/JSON)
- [ ] Create `TimeRangeSelector` component
- [ ] Create `MetricsOverview` component

**Day 5: Telemetry Backend**
- [ ] Create `lib/api/telemetry.ts`
- [ ] Create `/api/telemetry/summary` Next.js route
- [ ] Create `/api/telemetry/history` Next.js route
- [ ] Create `/api/telemetry/export` Next.js route
- [ ] Create `.data/provider-metrics.json` structure
- [ ] Create `.data/provider-telemetry.jsonl` structure

---

### Phase 3: Orchestration (Weeks 5-6)

#### Week 5: Task Builder

**Day 1-2: Task Builder Components**
- [ ] Install DnD Kit
  ```bash
  npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
  ```
- [ ] Create `TaskBuilder` component
  - Stage templates (planning, coding, testing, review)
  - Drag-and-drop reordering
  - Task description input
- [ ] Create `StageDropZone` component
  - Provider pool with chips
  - Provider selection/deselection
  - Stage-specific configuration
- [ ] Create `ProviderChip` component (draggable)

**Day 3-4: Workflow Runner**
- [ ] Create `WorkflowRunner` component
  - Real-time status updates
  - Stage progress visualization
  - Current provider highlight
  - Results display per stage
- [ ] Create `TaskGraph` component (D3.js)
  - DAG visualization of workflow
  - Node styling (pending, in-progress, completed, failed)
  - Edge arrows
- [ ] Create `WorkflowResults` component
  - Results summary
  - Stage-by-stage breakdown
  - Download/export results

**Day 5: Orchestration Pages**
- [ ] Create `/orchestration` page
  - Task builder + workflow runner tabs
  - Active workflow status
  - Workflow history

#### Week 6: Orchestration Backend & D3 Integration

**Day 1-2: Orchestration API**
- [ ] Create `lib/api/orchestration.ts`
- [ ] Create `/api/orchestration/validate` Next.js route
- [ ] Create `/api/orchestration/run` Next.js route
- [ ] Create `/api/orchestration/status` Next.js route
- [ ] Create `/api/orchestration/cancel` Next.js route

**Day 3-4: D3 Task Graph**
- [ ] Implement D3.js DAG rendering
  - Force-directed layout
  - Node styling (stage status colors)
  - Edge rendering with arrows
  - Interactive (click to view details)
- [ ] Add zoom/pan controls

**Day 5: Workflow Storage**
- [ ] Create `.data/workflow-executions.json` structure
- [ ] Implement workflow persistence
- [ ] Implement workflow history retrieval

---

### Phase 4: Legacy Tab Pages (Week 7)

**Day 1: Pipeline Page**
- [ ] Create `/pipeline` page (legacy tabs)
- [ ] Create `PipelineStrip` component
- [ ] Create `TaskInput` component
- [ ] Create `AgentsGrid` component
- [ ] Create `ProjectMap` component
- [ ] Create `TaskHistory` component

**Day 2: Console Page**
- [ ] Create `/console` page
- [ ] Create `LogTimeline` component
- [ ] Create `LogFilters` component
- [ ] Create `LogSearch` component
- [ ] Create `ProgressTimeline` component
- [ ] Create `ErrorList` component

**Day 3: Brainstorm Page**
- [ ] Create `/brainstorm` page
- [ ] Create `BrainstormSummary` component
- [ ] Create `PlanVariants` component
- [ ] Create `PlanCard` component
- [ ] Create `ConsiliumSynthesis` component
- [ ] Create `PlanSelector` component

**Day 4: Agents Page**
- [ ] Create `/agents` page
- [ ] Create `AgentsGrid` component
- [ ] Create `AgentCard` component
- [ ] Create `AgentDetailsModal` component
- [ ] Create `SkillRegistry` component
- [ ] Create `AgentActivationToggle` component

**Day 5: Consilium Page**
- [ ] Create `/consilium` page
- [ ] Create `PresetList` component
- [ ] Create `PresetActivateButton` component
- [ ] Create `ResultsByProvider` component
- [ ] Create `ConfidenceBars` component
- [ ] Create `ProviderFilters` component

---

### Phase 5: Settings & Polish (Week 8)

**Day 1-2: Settings Page**
- [ ] Create `/settings` page
- [ ] Create `ModelSelectors` component
- [ ] Create `ThemeSelector` component
- [ ] Create `StateInspector` component
- [ ] Create `ApiSettings` component
- [ ] Create `Preferences` component

**Day 3: Keyboard Shortcuts**
- [ ] Create `useKeyboardShortcuts` hook
- [ ] Implement shortcuts:
  - `1`-`6` - Switch to pages
  - `t` - Focus task input
  - `n` - New task modal
  - `/` - Focus search
  - `r` - Refresh
  - `?` - Help overlay
  - `Esc` - Close modal
- [ ] Create help overlay component

**Day 4: Notifications & Toasts**
- [ ] Create toast system (shadcn/ui)
- [ ] Implement notification badges in sidebar
- [ ] Add toasts for actions (success/error)

**Day 5: Testing & Bug Fixes**
- [ ] Manual testing of all pages
- [ ] Fix bugs found during testing
- [ ] Performance optimization
- [ ] Accessibility audit

---

## 🧪 Testing Strategy

### Unit Testing (Vitest)

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Test Structure:**
```
tests/
├── components/
│   ├── providers/
│   │   ├── ProviderCard.test.tsx
│   │   └── ProviderComparison.test.tsx
│   ├── orchestration/
│   │   ├── TaskBuilder.test.tsx
│   │   └── WorkflowRunner.test.tsx
│   └── telemetry/
│       └── MetricsOverview.test.tsx
├── hooks/
│   ├── useProviders.test.ts
│   ├── usePipeline.test.ts
│   └── useSSE.test.ts
├── stores/
│   ├── providerStore.test.ts
│   └── pipelineStore.test.ts
└── api/
    ├── providers.test.ts
    └── orchestration.test.ts
```

**Example Test:**
```typescript
// tests/components/providers/ProviderCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderCard } from '@/app/providers/components/ProviderCard';

describe('ProviderCard', () => {
  const mockProvider = {
    name: 'claude',
    transport: 'native',
    capabilities: ['mcp', 'skills'],
    strengths: ['orchestration', 'planning'],
    health: { available: true, circuitOpen: false },
    metrics: {
      latency: { avg: 145, p95: 180 },
      successRate: 0.95,
      totalRequests: 1250,
      cost: 2.50
    }
  };

  it('renders provider name and status', () => {
    render(<ProviderCard provider={mockProvider} />);
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByText('● Live')).toBeInTheDocument();
  });

  it('displays metrics', () => {
    render(<ProviderCard provider={mockProvider} />);
    expect(screen.getByText('145ms')).toBeInTheDocument();
    expect(screen.getByText('95.0%')).toBeInTheDocument();
    expect(screen.getByText('$2.50')).toBeInTheDocument();
  });
});
```

### E2E Testing (Playwright)

```bash
npm install -D @playwright/test
```

**Test Structure:**
```
e2e/
├── providers.spec.ts
├── orchestration.spec.ts
├── telemetry.spec.ts
└── pipeline.spec.ts
```

**Example Test:**
```typescript
// e2e/providers.spec.ts
import { test, expect } from '@playwright/test';

test('provider dashboard loads and displays metrics', async ({ page }) => {
  await page.goto('/providers');

  // Check provider cards are rendered
  await expect(page.locator('.provider-card')).toHaveCount(4);

  // Check metrics are displayed
  await expect(page.locator('text=/\\d+ms/')).toBeVisible();
  await expect(page.locator('text=/\\d+\\.\\d+%/')).toBeVisible();

  // Click on provider to view details
  await page.locator('.provider-card').first().click();
  await expect(page).toHaveURL(/\/providers\/claude/);
});
```

---

## 🚀 Deployment

### Development

```bash
# Start development server
npm run dev
# Runs on http://localhost:3000

# Start existing backend server (separate terminal)
cd ..
node scripts/dashboard-backend.js
# Runs on http://localhost:8080
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Deployment Options

**Option 1: Vercel (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Option 2: Docker**
```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**Option 3: Self-Hosted (Node.js)**
```bash
# Build
npm run build

# Start with PM2
npm install -g pm2
pm2 start npm --name "ctx-web" -- start

# Or use systemd
sudo cp ctx-web.service /etc/systemd/system/
sudo systemctl enable ctx-web
sudo systemctl start ctx-web
```

---

## 📦 Package.json

```json
{
  "name": "ctx-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",
    "test:e2e": "playwright test",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0",
    "swr": "^2.2.0",
    "recharts": "^2.12.0",
    "d3": "^7.9.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-switch": "^1.0.3",
    "lucide-react": "^0.330.0",
    "date-fns": "^3.3.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "nanoid": "^5.0.4",
    "react-hook-form": "^7.50.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/d3": "^7.4.3",
    "typescript": "^5.3.0",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.2.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "prettier": "^3.2.0",
    "prettier-plugin-tailwindcss": "^0.5.11",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@vitejs/plugin-react": "^4.2.0",
    "vitest": "^1.2.0",
    "@testing-library/react": "^14.2.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "@playwright/test": "^1.41.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2"
  }
}
```

---

## ⚙️ Configuration Files

### next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: '/api/legacy/:path*',
        destination: 'http://localhost:8080/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
```

### tailwind.config.ts

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

---

## 📝 Summary

Этот план предоставляет полный путь для создания современного web-приложения на Next.js для управления мультипровайдерной AI-разработкой.

**Ключевые этапы:**
1. **Фаза 1 (2 недели)**: Фундамент — настройка проекта, интеграция с backend, state management
2. **Фаза 2 (2 недели)**: Provider Dashboard — карточки провайдеров, сравнение, телеметрия
3. **Фаза 3 (2 недели)**: Orchestration — Task Builder, Workflow Runner, D3 графы
4. **Фаза 4 (1 неделя)**: Legacy Tab Pages — миграция существующего функционала
5. **Фаза 5 (1 неделя)**: Settings & Polish — горячие клавиши, уведомления, тестирование

**Общая оценка:** 8 недель
