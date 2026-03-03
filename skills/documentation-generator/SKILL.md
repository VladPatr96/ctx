---
name: documentation-generator
description: >
  Автоматическая генерация документации: README, API docs, 
  архитектурные диаграммы, changelog из кода и JSDoc комментариев.
---

# /ctx generate-docs — Генератор документации

Автоматическое создание и обновление документации проекта.

## Команды

```
/ctx generate-docs --type readme|api|all
/ctx docs-readme --template minimal|full
/ctx docs-api --format markdown|html
/ctx docs-changelog --version 1.0.0
```

## Как работает

```
┌─────────────────────────────────────────┐
│  1. CODE ANALYSIS                        │
│     ├─ Parse JSDoc/TSDoc                 │
│     ├─ Extract function signatures       │
│     ├─ Detect patterns (MVC, hooks)      │
│     └─ Identify entry points             │
├─────────────────────────────────────────┤
│  2. STRUCTURE DETECTION                  │
│     ├─ Installation (package.json)       │
│     ├─ Usage examples                    │
│     ├─ Configuration (.env, config)      │
│     └─ API reference (routes, exports)   │
├─────────────────────────────────────────┤
│  3. GENERATION                           │
│     ├─ README.md                         │
│     ├─ docs/API.md                       │
│     ├─ docs/ARCHITECTURE.md              │
│     └─ docs/CONTRIBUTING.md              │
└─────────────────────────────────────────┘
```

## Примеры использования

### Генерация README

```bash
/ctx generate-docs --type readme
```

Результат:
```markdown
# My Project

Multi-provider context management plugin.

## Installation

\`\`\`bash
npm install my-project
\`\`\`

## Quick Start

\`\`\`javascript
import { Client } from 'my-project';

const client = new Client();
await client.start();
\`\`\`

## API Reference

- `Client.start()` — Start the client
- `Client.stop()` — Stop the client

## License

MIT
```

### Генерация API документации

```bash
/ctx docs-api --format markdown
```

Результат:
```markdown
# API Reference

## Client

### Methods

#### `start(): Promise<void>`

Start the client connection.

**Returns:** `Promise<void>`

**Example:**
\`\`\`javascript
await client.start();
\`\`\`

---

#### `stop(): Promise<void>`

Stop the client connection.

**Returns:** `Promise<void>`

**Example:**
\`\`\`javascript
await client.stop();
\`\`\`
```

### Генерация changelog

```bash
/ctx docs-changelog --version 1.0.0
```

Результат:
```markdown
# Changelog

## [1.0.0] - 2026-03-03

### Added
- Initial release
- Multi-provider support
- MCP Hub integration

### Features
- 29 MCP tools
- 10 AI agents
- Knowledge base with FTS5
```

## Интеграция с CTX

### MCP Mode (Claude Code)

```javascript
// Автогенерация всей документации
const docs = await ctx_generate_docs({
  type: 'all'
});

console.log(`Generated ${docs.files.length} files`);
```

### CLI Mode (другие провайдеры)

```bash
node scripts/ctx-cli.js generate-docs --type all
```

## Шаблоны README

| Template | Секции | Размер |
|----------|--------|--------|
| minimal | Installation, Quick Start, License | ~1KB |
| standard | + API, Contributing, Tests | ~3KB |
| full | + Architecture, Examples, FAQ | ~8KB |

## Поддерживаемые форматы

- ✅ Markdown (GitHub Flavored)
- ✅ HTML (with theme)
- ⚠️ PDF (via HTML)
- ⚠️ DocBook

## Экономия времени

```
Вручную:   4 часа на документацию
С генератором: 2 минуты
Экономия:  99% времени
```

## Преимущества

- 📚 Автогенерация README, API docs, changelog
- 🔄 Синхронизация docs с кодом
- 📊 Архитектурные диаграммы
- 🎨 Красивые шаблоны
- 🚀 Работает на всех провайдерах
