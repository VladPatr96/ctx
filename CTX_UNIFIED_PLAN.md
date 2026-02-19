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
