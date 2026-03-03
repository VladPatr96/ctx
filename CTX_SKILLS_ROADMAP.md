# 📚 Подробный гид по расширению CTX: Популярные скиллы

> **Дата создания:** 2026-03-03  
> **Статус:** Планирование  
> **Приоритет:** High Impact → Productivity → DevOps → CTX Enhancement

---

## 📋 Содержание

1. [Обзор](#обзор)
2. [Приоритет 1 — Критически важные](#-приоритет-1--критически-важные)
3. [Приоритет 2 — Продуктивность](#-приоритет-2--продуктивность)
4. [Приоритет 3 — DevOps](#-приоритет-3--devops)
5. [Приоритет 4 — CTX-Specific](#-приоритет-4--ctx-specific)
6. [План внедрения](#-план-внедрения)
7. [Сводная таблица](#-сводная-таблица-всех-скиллов)

---

## Обзор

Этот документ описывает 10 популярных скиллов для интеграции в CTX Plugin. Каждый скилл подробно разобран с графиками, примерами использования и интеграцией с существующей архитектурой.

**Текущее состояние CTX:**
- ✅ 29 MCP tools
- ✅ 10 AI agents
- ✅ 15 skills
- ✅ Multi-provider support (Claude, Gemini, OpenCode, Codex)
- ✅ Adaptive routing
- ✅ Consilium engine (CBDP)

**Цель:** Расширить функциональность для покрытия полного цикла разработки ПО.

---

## 🌐 Универсальность — Работает везде!

Все 10 скиллов спроектированы как **универсальные** — работают идентично на всех AI провайдерах.

### Архитектура универсальности

```
┌─────────────────────────────────────────────────────────┐
│            УНИВЕРСАЛЬНЫЙ СКИЛЛ (skill/SKILL.md)         │
│                                                          │
│  /ctx security-scan                                     │
│  /ctx debug                                             │
│  /ctx test-coverage                                     │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────┐
         │   Автоопределение режима       │
         └────────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
        ▼                        ▼
┌───────────────┐        ┌──────────────┐
│  MCP Mode     │        │  CLI Wrapper │
│  (Claude)     │        │  (остальные) │
├───────────────┤        ├──────────────┤
│ ctx_security_ │        │ node         │
│ scan()        │        │ scripts/     │
│               │        │ ctx-cli.js   │
│ Прямой вызов  │        │ security-scan│
└───────────────┘        └──────────────┘
        │                        │
        └────────────┬───────────┘
                     ▼
         ┌────────────────────────┐
         │   scripts/tools/*.js   │
         │   (общая логика)       │
         └────────────────────────┘
                     │
                     ▼
         ┌────────────────────────┐
         │   .data/pipeline.json  │
         │   (общее состояние)    │
         └────────────────────────┘
```

### Таблица совместимости

| Провайдер | Режим | Доступ | Пример вызова |
|-----------|-------|--------|---------------|
| **Claude Code** | MCP native | ✅ `ctx_*` tools напрямую | `ctx_security_scan()` |
| **Codex CLI** | CLI wrapper | ✅ `scripts/ctx-cli.js` | `node ctx-cli.js security-scan` |
| **Gemini CLI** | CLI wrapper | ✅ `scripts/ctx-cli.js` | `node ctx-cli.js security-scan` |
| **OpenCode** | CLI wrapper | ✅ `scripts/ctx-cli.js` | `node ctx-cli.js security-scan` |

**Результат:** Идентичный функционал, одинаковое поведение, общее состояние.

### Пример универсального использования

**Skill файл (один для всех):**
```markdown
---
name: security-scanner
description: Сканер безопасности (универсальный)
---

# /ctx security-scan

Автоматически определяет провайдера и использует подходящий метод.

## MCP Mode (Claude Code)
```
ctx_security_scan({ scope: 'all' })
```

## CLI Wrapper Mode (Codex/Gemini/OpenCode)
```bash
node "${CTX_ROOT}/scripts/ctx-cli.js" security-scan --scope all
```

## Результат (идентичный для всех)
```json
{
  "critical": 2,
  "high": 5,
  "medium": 12,
  "findings": [...]
}
```
```

### Автоопределение режима

Каждый универсальный скилл автоматически определяет режим:

```javascript
// skills/security-scanner/SKILL.md

// Автоопределение
if (typeof ctx_security_scan === 'function') {
  // MCP mode (Claude Code)
  const result = await ctx_security_scan({ scope: 'all' });
} else {
  // CLI wrapper mode (Codex/Gemini/OpenCode)
  const result = await exec(
    `node "${process.env.CTX_ROOT}/scripts/ctx-cli.js" security-scan --scope all`
  );
}

// Результат всегда одинаковый
console.log(result.critical, result.high, result.findings);
```

### Преимущества универсальности

```
┌─────────────────────────────────────────────────────────┐
│                 ПРЕИМУЩЕСТВА                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. ОДИН SKILL ФАЙЛ                                      │
│     ├─ Не нужно дублировать для каждого провайдера      │
│     ├─ Обновления применяются везде                     │
│     └─ Проще поддерживать                                │
│                                                          │
│  2. ОБЩЕЕ СОСТОЯНИЕ                                      │
│     ├─ .data/pipeline.json доступен всем                │
│     ├─ Knowledge Base единая                             │
│     └─ История сохраняется при переключении             │
│                                                          │
│  3. ПЕРЕКЛЮЧЕНИЕ ПРОВАЙДЕРОВ                             │
│     ├─ Начал на Claude → продолжил на Gemini             │
│     ├─ Состояние не теряется                             │
│     └─ Скиллы работают одинаково                         │
│                                                          │
│  4. ЕДИНАЯ БАЗА ЗНАНИЙ                                   │
│     ├─ Уроки из Claude доступны в Gemini                 │
│     ├─ Consilium работает со всеми провайдерами         │
│     └─ Cross-provider learning                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Примеры использования на разных провайдерах

#### Claude Code (MCP native)
```bash
# Прямой вызов MCP tools
/ctx security-scan

# Внутри Claude:
ctx_security_scan({ scope: 'dependencies' })
  ↓
  {
    "critical": 1,
    "findings": [
      { "package": "lodash@4.17.15", "cve": "CVE-2020-8203" }
    ]
  }
```

#### Gemini CLI (CLI wrapper)
```bash
# То же команда
/ctx security-scan

# Внутри Gemini:
node /path/to/ctx/scripts/ctx-cli.js security-scan --scope dependencies
  ↓
  {
    "critical": 1,
    "findings": [
      { "package": "lodash@4.17.15", "cve": "CVE-2020-8203" }
    ]
  }
```

#### OpenCode (CLI wrapper)
```bash
# Идентичная команда
/ctx security-scan

# Внутри OpenCode:
node /path/to/ctx/scripts/ctx-cli.js security-scan --scope dependencies
  ↓
  {
    "critical": 1,
    "findings": [
      { "package": "lodash@4.17.15", "cve": "CVE-2020-8203" }
    ]
  }
```

**Результат всегда одинаковый!** ✅

### Как это работает технически

**1. Универсальный CLI wrapper** (`scripts/ctx-cli.js`):
```javascript
// Уже существует в проекте!
// Расширяем для новых скиллов

const commands = {
  // Существующие
  'get_pipeline': () => pipeline.get(),
  'set_stage': (args) => pipeline.setStage(args),
  
  // Новые скиллы (добавляем)
  'security-scan': (args) => security.scan(args),
  'debug': (args) => debugger.analyze(args),
  'test-coverage': (args) => coverage.analyze(args),
  // ... все 10 скиллов
};

// CLI interface
const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const result = await commands[command](args);
console.log(JSON.stringify(result));
```

**2. MCP tools для Claude** (добавляем в `scripts/ctx-mcp-hub.js`):
```javascript
// Регистрируем новые tools
server.tool('ctx_security_scan', securityScanSchema, async (params) => {
  return await security.scan(params);
});

server.tool('ctx_error_analyze', errorAnalyzeSchema, async (params) => {
  return await debugger.analyze(params);
});

// ... все 38 новых tools
```

**3. Общая логика** (в `scripts/tools/*.js`):
```javascript
// scripts/tools/security.js
// Работает и через MCP, и через CLI

export async function scan(params) {
  const { scope } = params;
  
  // Общая логика для всех провайдеров
  const codeFindings = await scanCode(scope);
  const depFindings = await scanDependencies(scope);
  
  // Сохранение в общую KB
  await ctx_save_lesson({
    type: 'security',
    findings: [...codeFindings, ...depFindings]
  });
  
  return {
    critical: filterBySeverity(codeFindings, 'critical').length,
    high: filterBySeverity(codeFindings, 'high').length,
    findings: [...codeFindings, ...depFindings]
  };
}
```

### Схема потока данных

```
┌─────────────────────────────────────────────────────────┐
│          ПОЛЬЗОВАТЕЛЬ ВЫПОЛНЯЕТ КОМАНДУ                 │
│                                                          │
│  /ctx security-scan                                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   ┌─────────┐      ┌──────────┐      ┌──────────┐
   │ Claude  │      │  Gemini  │      │ OpenCode │
   │  Code   │      │   CLI    │      │          │
   └─────────┘      └──────────┘      └──────────┘
        │                 │                 │
        │ MCP             │ CLI wrapper     │ CLI wrapper
        ▼                 ▼                 ▼
   ┌─────────────────────────────────────────────┐
   │        scripts/tools/security.js            │
   │        (общая логика)                       │
   └─────────────────────────────────────────────┘
                          │
                          ▼
   ┌─────────────────────────────────────────────┐
   │        .data/pipeline.json                  │
   │        .data/state.sqlite                   │
   │        (общее состояние)                    │
   └─────────────────────────────────────────────┘
                          │
                          ▼
   ┌─────────────────────────────────────────────┐
   │        GitHub Issues (KB)                   │
   │        (общая база знаний)                  │
   └─────────────────────────────────────────────┘
```

### Тестирование универсальности

Для каждого скилла создаем тесты:

```javascript
// tests/security-scanner.test.mjs

describe('Security Scanner - Universal', () => {
  
  test('MCP mode (Claude Code)', async () => {
    // Симулируем MCP call
    const result = await security.scan({ scope: 'all' });
    assert.equal(result.critical, 2);
    assert.equal(result.findings.length, 7);
  });
  
  test('CLI wrapper mode (Gemini/OpenCode)', async () => {
    // Симулируем CLI call
    const output = await exec(
      'node scripts/ctx-cli.js security-scan --scope all'
    );
    const result = JSON.parse(output);
    assert.equal(result.critical, 2);
    assert.equal(result.findings.length, 7);
  });
  
  test('Result format is identical', async () => {
    const mcpResult = await security.scan({ scope: 'all' });
    const cliOutput = await exec(
      'node scripts/ctx-cli.js security-scan --scope all'
    );
    const cliResult = JSON.parse(cliOutput);
    
    // Результаты должны быть идентичны
    assert.deepEqual(mcpResult, cliResult);
  });
  
});
```

### Обновление ctx-universal-full/SKILL.md

Добавляем новые команды в универсальный skill:

```markdown
# /ctx — Универсальный CTX Pipeline

## Команды (добавлены новые)

### Безопасность и качество
/ctx security-scan     — Сканер безопасности
/ctx debug             — Умный отладчик
/ctx test-coverage     — Анализ покрытия тестами

### Продуктивность
/ctx api-design        — Проектирование API
/ctx generate-docs     — Генерация документации
/ctx refactor          — Помощник рефакторинга

### DevOps
/ctx dockerize         — Контейнеризация
/ctx ci-cd             — CI/CD автоматизация

### CTX Enhancement
/ctx provider-health   — Мониторинг провайдеров
/ctx consilium-opt     — Оптимизация советов
```

---

## 🎯 Приоритет 1 — Критически важные

---

### 1. 🔒 **security-scanner** — Сканер безопасности

**Что делает:** Находит уязвимости в коде и зависимостях

**Зачем нужен:**
```
❌ Без сканера:
  Пишешь код → Коммитишь → Деплоишь → 💥 Взломали

✅ Со сканером:
  Пишешь код → Сканер проверяет → Исправляешь → Деплоишь → 😎 Безопасно
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│              SECURITY SCANNER WORKFLOW                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. CODE SCANNING                                        │
│     ├─ SQL Injection: "SELECT * FROM users WHERE id="   │
│     ├─ XSS Detection: innerHTML = userInput             │
│     ├─ Hardcoded Secrets: password = "admin123"         │
│     └─ Unsafe Deserialization: eval(userInput)          │
│                                                          │
│  2. DEPENDENCY CHECK                                     │
│     ├─ npm audit (известные CVE)                        │
│     ├─ Outdated packages с уязвимостями                 │
│     └─ License compliance (GPL, MIT, etc.)              │
│                                                          │
│  3. REPORT                                               │
│     ├─ 🔴 Critical: нужно исправить NOW                 │
│     ├─ 🟡 High: исправить в ближайшее время             │
│     ├─ 🟢 Medium: запланировать                         │
│     └─ ⚪ Low: nice to have                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример использования:**
```bash
/ctx security-scan

Результат:
🔴 CRITICAL (2):
  - scripts/auth.js:45 — SQL Injection в login()
  - package.json — lodash@4.17.15 (CVE-2020-8203)

🟡 HIGH (5):
  - ctx-app/src/api.ts — No rate limiting
  - scripts/db.js — Plaintext password storage
  ...
```

**Интеграция с CTX:**
```javascript
// Автоматически при коммите
ctx_log_action({
  action: 'security_scan',
  findings: 7,
  critical: 2,
  high: 5
})

// Сохранение в KB для будущих проектов
ctx_save_lesson({
  type: 'security',
  title: 'SQL Injection в auth.js',
  solution: 'Использовать параметризованные запросы'
})
```

**Польза:**
- ⏱️ Экономит 2-3 часа на code review безопасности
- 🛡️ Предотвращает 80% типичных уязвимостей
- 📊 Соответствие стандартам (OWASP, SOC2)

**MCP Tools для скилла:**
```javascript
ctx_security_scan({ scope: 'dependencies|code|all' })
ctx_security_report({ format: 'json|markdown' })
ctx_security_ignore({ pattern: '...', reason: '...' })
```

**Агент:** `agents/security-auditor.md`

---

### 2. 🐛 **error-debugger** — Умный отладчик

**Что делает:** Анализирует ошибки и предлагает решения

**Зачем нужен:**
```
❌ Без отладчика:
  Ошибка → Гуглишь → Stack Overflow → Пробуешь → Не работает → 
  Гуглишь еще → ... → 2 часа потрачено

✅ С отладчиком:
  Ошибка → AI анализирует → Находит в KB → Решение → 5 минут
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│              ERROR DEBUGGER WORKFLOW                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  INPUT: Stack trace + Error message                      │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  1. PARSING                                 │         │
│  │     Error: Cannot read property 'x'        │         │
│  │     at UserService.getUser (auth.js:45)    │         │
│  │     at Router.handle (/routes.js:123)      │         │
│  └────────────────────────────────────────────┘         │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  2. PATTERN MATCHING                        │         │
│  │     ├─ TypeError: null/undefined access    │         │
│  │     ├─ Location: auth.js:45                │         │
│  │     └─ Context: UserService.getUser()      │         │
│  └────────────────────────────────────────────┘         │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  3. KB SEARCH                               │         │
│  │     Поиск похожих ошибок в прошлых сессиях │         │
│  │     "TypeError null getUser" → 3 matches   │         │
│  └────────────────────────────────────────────┘         │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  4. SOLUTION GENERATION                     │         │
│  │     Top fix: Добавить null check           │         │
│  │     Confidence: 92%                         │         │
│  │     Code: if (!user) return null;          │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример использования:**
```bash
/ctx debug

Вставляешь ошибку:
TypeError: Cannot read properties of undefined (reading 'id')
    at UserController.update (src/controllers/user.js:45)

AI отвечает:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 АНАЛИЗ ОШИБКИ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Тип: TypeError (доступ к undefined)
Место: src/controllers/user.js:45
Вероятная причина: user object is undefined

💡 РЕШЕНИЕ (confidence: 94%)

Проблема в строке 45:
  const userId = req.user.id;  // ❌ req.user может быть undefined

Исправление:
  const userId = req.user?.id;  // ✅ Optional chaining
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

📚 ПОХОЖИЕ СЛУЧАИ ИЗ KB:
- 2026-02-18: Аналогичная ошибка в auth.js (решено за 3 мин)
- 2026-02-15: TypeError в OrderService (добавлен null check)
```

**График эффективности:**
```
Время на исправление ошибки (минуты)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Без отладчика:
████████████████████████████████████ 45 мин

С отладчиком:
████ 5 мин

Экономия: 89% времени ⏱️
```

**Интеграция с CTX:**
```javascript
// Автоматическое логирование
ctx_log_error({
  error: 'TypeError',
  file: 'user.js',
  line: 45,
  solution: 'Add null check',
  time_to_fix: 5  // минут
})

// Обучение на ошибках
ctx_save_lesson({
  type: 'bugfix',
  pattern: 'TypeError + undefined + property access',
  solution: 'Optional chaining + null check'
})
```

**MCP Tools для скилла:**
```javascript
ctx_error_analyze({ stack_trace: '...' })
ctx_error_find_similar({ error_hash: '...' })
ctx_error_get_solution({ error_id: '...' })
ctx_error_auto_fix({ safe_mode: true })
```

---

### 3. ✅ **test-coverage-booster** — Улучшение тестов

**Что делает:** Находит непокрытый код и генерирует тесты

**Зачем нужен:**
```
❌ Без бустера:
  Пишешь код → Тесты есть → Но покрыто 40% → Баги в проде

✅ С бустером:
  Пишешь код → Анализ покрытия → Автотесты для 90% → Качество
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│           TEST COVERAGE BOOSTER WORKFLOW                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. COVERAGE ANALYSIS                                    │
│     ┌─────────────────────────────────────┐             │
│     │  src/                               │             │
│     │  ├─ auth.js      ████████░░ 80%    │             │
│     │  ├─ user.js      ██████████ 100%   │             │
│     │  ├─ payment.js   ████░░░░░░ 40%  ⚠️│             │
│     │  └─ utils.js     ██░░░░░░░░ 20%  🔴│             │
│     └─────────────────────────────────────┘             │
│                                                          │
│  2. GAP DETECTION                                        │
│     ├─ Найти функции без тестов                         │
│     ├─ Найти ветки (if/else) без покрытия               │
│     └─ Найти edge cases (граничные случаи)             │
│                                                          │
│  3. AUTO-GENERATION                                      │
│     ├─ Unit tests для функций                           │
│     ├─ Integration tests для API                        │
│     └─ Edge case tests (null, empty, max)               │
│                                                          │
│  4. MUTATION TESTING                                     │
│     ├─ Изменить код (bug injection)                     │
│     ├─ Проверить: тесты ловят?                          │
│     └─ Score: X% мутантов убито                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример использования:**
```bash
/ctx test-coverage

Анализ покрытия...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 ТЕКУЩЕЕ ПОКРЫТИЕ: 67%

🔴 КРИТИЧЕСКИЕ ПРОПУСКИ:
  - payment.js:processPayment() — 0% coverage
  - utils.js:validateEmail() — нет тестов
  - auth.js:refreshToken() — ветка else не покрыта

💡 СГЕНЕРИРОВАННЫЕ ТЕСТЫ:

✅ tests/payment.test.mjs (NEW)
  describe('processPayment', () => {
    it('should process valid payment', async () => {
      const result = await processPayment({ amount: 100 });
      expect(result.success).toBe(true);
    });

    it('should reject invalid amount', async () => {
      await expect(processPayment({ amount: -1 }))
        .rejects.toThrow('Invalid amount');
    });

    it('should handle network error', async () => {
      // Edge case: API timeout
      mockApi.timeout();
      await expect(processPayment({ amount: 100 }))
        .rejects.toThrow('Network error');
    });
  });

📈 ПРОГНОЗ ПОСЛЕ ДОБАВЛЕНИЯ: 89% (+22%)
```

**График улучшения покрытия:**
```
Покрытие тестами (%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

100% ┤
 90% ┤              ╭───────╮  С бустером
 80% ┤          ╭───╯       ╰─── 89%
 70% ┤      ╭───╯
 60% ┤  ╭───╯  67%
 50% ┤──╯       Без бустера
 40% ┤
     └────┬────┬────┬────┬────┬────
         W1   W2   W3   W4   W5   W6

Ускорение роста покрытия: 3x 📈
```

**Интеграция с CTX:**
```javascript
// Автоматический анализ
ctx_log_action({
  action: 'coverage_analysis',
  current: 67,
  target: 90,
  generated_tests: 12
})

// Сохранение паттернов тестов
ctx_save_lesson({
  type: 'test_pattern',
  pattern: 'payment processing',
  tests: ['valid', 'invalid_amount', 'network_error']
})
```

**MCP Tools для скилла:**
```javascript
ctx_coverage_analyze({ directory: 'src' })
ctx_coverage_generate_tests({ target_file: 'payment.js' })
ctx_coverage_mutate({ runs: 100 })
ctx_coverage_report({ format: 'html|json|markdown' })
```

---

## 🚀 Приоритет 2 — Продуктивность

---

### 4. 🎨 **api-designer** — Проектировщик API

**Что делает:** Создает спецификации API автоматически

**Зачем нужен:**
```
❌ Без дизайнера:
  Код → API работает → Документация? → Нет → Фронтендщики в шоке

✅ С дизайнером:
  Код → Спецификация → Документация → Swagger UI → Все довольны
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│               API DESIGNER WORKFLOW                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  INPUT: Express/Fastify routes или TypeScript types     │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  1. CODE PARSING                            │         │
│  │     app.post('/users', (req, res) => {     │         │
│  │       const { name, email } = req.body;    │         │
│  │       ...                                  │         │
│  │     })                                     │         │
│  └────────────────────────────────────────────┘         │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  2. SCHEMA EXTRACTION                       │         │
│  │     POST /users                             │         │
│  │     Request: { name: string, email: string}│         │
│  │     Response: { id: number, ... }          │         │
│  └────────────────────────────────────────────┘         │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  3. OPENAPI GENERATION                      │         │
│  │     openapi: 3.0.0                          │         │
│  │     paths:                                  │         │
│  │       /users:                               │         │
│  │         post:                               │         │
│  │           requestBody: ...                  │         │
│  │           responses: ...                    │         │
│  └────────────────────────────────────────────┘         │
│         ↓                                                │
│  ┌────────────────────────────────────────────┐         │
│  │  4. DOCUMENTATION OUTPUT                    │         │
│  │     ├─ openapi.yaml                         │         │
│  │     ├─ Swagger UI (HTML)                    │         │
│  │     ├─ TypeScript client SDK                │         │
│  │     └─ Postman collection                   │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример использования:**
```bash
/ctx api-design --format openapi

Анализ маршрутов...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 Найдено 15 endpoints:
  GET    /api/users           — List users
  POST   /api/users           — Create user
  GET    /api/users/:id       — Get user
  PUT    /api/users/:id       — Update user
  DELETE /api/users/:id       — Delete user
  ...

✅ Сгенерировано:
  - openapi.yaml (2.3 KB)
  - swagger-ui.html (готов к просмотру)
  - api-client.ts (TypeScript SDK)
  - postman-collection.json

📊 Статистика API:
  - Endpoints: 15
  - Schemas: 8 (User, Order, Payment, etc.)
  - Auth: Bearer token
  - Rate limit: 100 req/min
```

**График экономии времени:**
```
Время на документацию API (часы)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Вручную:
████████████████████████████ 8 часов

С дизайнером:
█ 30 минут

Экономия: 94% времени 📝
```

**MCP Tools для скилла:**
```javascript
ctx_api_generate_spec({ format: 'openapi|graphql' })
ctx_api_validate_endpoints({ base_url: '...' })
ctx_api_generate_sdk({ language: 'typescript|python' })
ctx_api_create_postman({ collection_name: '...' })
```

**Агент:** `agents/api-architect.md`

---

### 5. 📚 **documentation-generator** — Генератор документации

**Что делает:** Создает README, API docs, комментарии

**Зачем нужен:**
```
❌ Без генератора:
  Код отличный → Документации нет → Никто не понимает → Заброшен

✅ С генератором:
  Код отличный → Автодокументация → README + Wiki → Популярность
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│          DOCUMENTATION GENERATOR WORKFLOW                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. CODE ANALYSIS                                        │
│     ├─ Parse JSDoc/TSDoc comments                        │
│     ├─ Extract function signatures                       │
│     ├─ Detect patterns (MVC, hooks, etc.)               │
│     └─ Identify entry points                             │
│                                                          │
│  2. STRUCTURE DETECTION                                  │
│     ├─ Installation section (package.json)              │
│     ├─ Usage examples (examples/)                        │
│     ├─ Configuration (.env, config files)               │
│     └─ API reference (routes, exports)                   │
│                                                          │
│  3. GENERATION                                           │
│     ├─ README.md                                         │
│     │   ├─ Description                                   │
│     │   ├─ Installation                                  │
│     │   ├─ Quick Start                                   │
│     │   ├─ API Reference                                 │
│     │   └─ Contributing                                  │
│     │                                                    │
│     ├─ docs/                                             │
│     │   ├─ API.md                                        │
│     │   ├─ ARCHITECTURE.md                               │
│     │   └─ CHANGELOG.md                                  │
│     │                                                    │
│     └─ Wiki/                                             │
│         ├─ Getting Started                               │
│         ├─ Advanced Usage                                │
│         └─ FAQ                                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример для CTX:**
```bash
/ctx generate-docs

Генерация документации...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Создано файлов:

📄 README.md (обновлен)
   ├─ Описание проекта
   ├─ Установка (npm install)
   ├─ Быстрый старт (5 примеров)
   ├─ Архитектура (диаграмма)
   └─ API Reference (ссылки)

📄 docs/API.md (NEW)
   ├─ MCP Hub Tools (29 tools)
   ├─ CLI Commands
   └─ Dashboard API

📄 docs/ARCHITECTURE.md (NEW)
   ├─ Pipeline State Machine
   ├─ Provider Routing
   └─ Storage Layer

📄 docs/CONTRIBUTING.md (NEW)
   ├─ Development Setup
   ├─ Testing Guide
   └─ Code Style

📄 CHANGELOG.md (обновлен)
   └─ v0.1.0 — Initial release

📊 Статистика:
  - Строк документации: 1,247
  - Примеров кода: 34
  - Диаграмм: 5
  - Время: 2 минуты (вручную — 4 часа)
```

**MCP Tools для скилла:**
```javascript
ctx_docs_generate({ type: 'readme|api|all' })
ctx_docs_update_changelog({ version: '0.2.0' })
ctx_docs_create_wiki({ pages: ['Getting Started', 'FAQ'] })
```

---

### 6. 🔧 **refactoring-assistant** — Помощник рефакторинга

**Что делает:** Находит code smells и предлагает улучшения

**Зачем нужен:**
```
❌ Без помощника:
  Код работает → Но грязный → Техдолг растет → Рефакторинг больно

✅ С помощником:
  Код работает → AI находит проблемы → Пошаговый рефакторинг → Чистый код
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│          REFACTORING ASSISTANT WORKFLOW                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. CODE SMELL DETECTION                                 │
│     ┌─────────────────────────────────────┐             │
│     │  🔴 Critical:                        │             │
│     │  - God Object (UserService 1200 LOC)│             │
│     │  - Spaghetti Code (callback hell)   │             │
│     │                                      │             │
│     │  🟡 Warning:                         │             │
│     │  - Duplicate Code (47 duplicates)   │             │
│     │  - Long Method (processOrder: 180 LOC)│            │
│     │  - Large Class (PaymentHandler)     │             │
│     │                                      │             │
│     │  🟢 Minor:                           │             │
│     │  - Magic Numbers                     │             │
│     │  - Dead Code (unused imports)        │             │
│     └─────────────────────────────────────┘             │
│                                                          │
│  2. PATTERN SUGGESTIONS                                  │
│     ├─ Extract Method                                    │
│     ├─ Extract Class                                     │
│     ├─ Replace Conditional with Polymorphism            │
│     └─ Introduce Strategy Pattern                        │
│                                                          │
│  3. REFACTORING PLAN                                     │
│     Step 1: Extract PaymentValidator class              │
│     Step 2: Split UserService into 3 services           │
│     Step 3: Replace callbacks with async/await          │
│                                                          │
│  4. SAFE REFACTORING                                     │
│     ├─ Run tests before                                  │
│     ├─ Apply changes                                     │
│     ├─ Run tests after                                   │
│     └─ Rollback if broken                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример:**
```bash
/ctx refactor --scope user-service

Анализ кода...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 CRITICAL REFACTORING NEEDED:

1. God Object: UserService (1,247 LOC)
   ┌─────────────────────────────────────┐
   │  UserService                        │
   │  ├─ createUser()                    │
   │  ├─ updateUser()                    │
   │  ├─ deleteUser()                    │
   │  ├─ sendEmail()        ❌ не тут    │
   │  ├─ processPayment()   ❌ не тут    │
   │  ├─ validateAddress()  ❌ не тут    │
   │  └─ ... 20 more methods             │
   └─────────────────────────────────────┘
   
   💡 РЕШЕНИЕ: Разбить на 4 сервиса
   ┌─────────────────────────────────────┐
   │  UserService      EmailService     │
   │  ├─ createUser    ├─ sendEmail     │
   │  ├─ updateUser    └─ sendSMS       │
   │  └─ deleteUser                    │
   │                                     │
   │  PaymentService   AddressService   │
   │  ├─ process       ├─ validate      │
   │  └─ refund        └─ format        │
   └─────────────────────────────────────┘

2. Duplicate Code: validateEmail() повторяется 7 раз
   💡 РЕШЕНИЕ: Вынести в utils/validation.js

3. Callback Hell: processOrder() — 5 уровней вложенности
   💡 РЕШЕНИЕ: Переписать на async/await

📊 РЕЗУЛЬТАТ РЕФАКТОРИНГА:
  - Строк кода: 1,247 → 892 (-28%)
  - Цикломатическая сложность: 45 → 18 (-60%)
  - Дублирование: 47 → 3 (-94%)
  - Maintainability Index: 42 → 78 (+86%)

⚠️  Безопасность: Все тесты пройдены ✅
```

**MCP Tools для скилла:**
```javascript
ctx_refactor_analyze({ directory: 'src' })
ctx_refactor_suggest({ file: 'UserService.js' })
ctx_refactor_apply({ transformation: 'extract_class' })
ctx_refactor_rollback({ commit: 'abc123' })
```

---

## 🛠️ Приоритет 3 — DevOps

---

### 7. 🐳 **dockerizer** — Контейнеризация

**Что делает:** Создает Docker конфигурацию для проекта

**Зачем нужен:**
```
❌ Без Docker:
  "У меня работает" → На сервере не работает → Конфликт версий → Деплой 3 часа

✅ С Docker:
  "У меня работает" → Docker контейнер → Работает везде → Деплой 5 минут
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│              DOCKERIZER WORKFLOW                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. PROJECT ANALYSIS                                     │
│     ├─ Detect runtime (Node.js, Python, Go)             │
│     ├─ Detect framework (Express, FastAPI, Gin)         │
│     ├─ Detect dependencies (package.json, requirements) │
│     └─ Detect ports (3000, 8080, etc.)                  │
│                                                          │
│  2. DOCKERFILE GENERATION                                │
│     ┌─────────────────────────────────────┐             │
│     │  # Stage 1: Build                   │             │
│     │  FROM node:20-alpine AS builder     │             │
│     │  WORKDIR /app                       │             │
│     │  COPY package*.json ./              │             │
│     │  RUN npm ci                         │             │
│     │  COPY . .                           │             │
│     │  RUN npm run build                  │             │
│     │                                      │             │
│     │  # Stage 2: Production              │             │
│     │  FROM node:20-alpine                │             │
│     │  WORKDIR /app                       │             │
│     │  COPY --from=builder /app/dist ./   │             │
│     │  EXPOSE 3000                         │             │
│     │  CMD ["node", "server.js"]          │             │
│     └─────────────────────────────────────┘             │
│                                                          │
│  3. DOCKER-COMPOSE                                       │
│     ├─ App service                                       │
│     ├─ Database (PostgreSQL/MongoDB)                    │
│     ├─ Redis cache                                       │
│     └─ Nginx reverse proxy                               │
│                                                          │
│  4. OPTIMIZATION                                         │
│     ├─ Multi-stage build (smaller image)                │
│     ├─ .dockerignore (exclude node_modules)             │
│     ├─ Health checks                                     │
│     └─ Security best practices                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример для CTX:**
```bash
/ctx dockerize

Анализ проекта...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Обнаружено:
  - Runtime: Node.js 20
  - Framework: Express (MCP Hub)
  - Database: SQLite
  - Frontend: React + Electron

🐳 Сгенерировано:

📄 Dockerfile (multi-stage)
   Stage 1: builder (npm install + build)
   Stage 2: production (minimal image)
   
   Size: 450 MB → 85 MB (-81%)

📄 docker-compose.yml
   services:
     ├─ ctx-hub (port 3000)
     ├─ ctx-dashboard (port 8080)
     ├─ postgres (port 5432)
     └─ redis (port 6379)

📄 .dockerignore
   node_modules
   .git
   .data
   *.log

📄 .env.docker
   DATABASE_URL=postgres://...
   REDIS_URL=redis://...

🚀 КОМАНДЫ:
  docker-compose up -d        # Запуск
  docker-compose logs -f      # Логи
  docker-compose down         # Остановка
```

**График размера образа:**
```
Размер Docker образа (MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Без оптимизации:
████████████████████████████████████████ 450 MB

Multi-stage build:
████████ 85 MB

Уменьшение: 81% 💾
```

**MCP Tools для скилла:**
```javascript
ctx_docker_generate({ include: ['app', 'db', 'redis'] })
ctx_docker_optimize({ strategy: 'multi-stage' })
ctx_docker_compose({ env: 'development|production' })
```

---

### 8. 🚀 **ci-cd-pipeline** — CI/CD автоматизация

**Что делает:** Создает pipeline для автоматического деплоя

**Зачем нужен:**
```
❌ Без CI/CD:
  Код → Тестируешь вручную → Билдишь → Загружаешь на сервер → 2 часа

✅ С CI/CD:
  Код → git push → Автотесты → Автобилд → Автодеплой → 5 минут
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│              CI/CD PIPELINE WORKFLOW                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  git push → GitHub                                       │
│       ↓                                                  │
│  ┌────────────────────────────────────────────┐         │
│  │  STAGE 1: TEST                              │         │
│  │  ├─ npm install                             │         │
│  │  ├─ npm run lint                            │         │
│  │  ├─ npm test (173 tests)                    │         │
│  │  └─ Coverage check (>80%)                   │         │
│  └────────────────────────────────────────────┘         │
│       ↓ (✅ pass)                                        │
│  ┌────────────────────────────────────────────┐         │
│  │  STAGE 2: BUILD                             │         │
│  │  ├─ npm run build                           │         │
│  │  ├─ Docker build                            │         │
│  │  └─ Push to registry                        │         │
│  └────────────────────────────────────────────┘         │
│       ↓ (✅ pass)                                        │
│  ┌────────────────────────────────────────────┐         │
│  │  STAGE 3: DEPLOY                            │         │
│  │  ├─ Staging (автоматически)                 │         │
│  │  ├─ Production (по кнопке)                  │         │
│  │  └─ Rollback (если что-то сломалось)        │         │
│  └────────────────────────────────────────────┘         │
│       ↓                                                  │
│  ┌────────────────────────────────────────────┐         │
│  │  STAGE 4: NOTIFY                            │         │
│  │  ├─ Slack: "Deployed to staging"           │         │
│  │  ├─ Email: "Release v1.2.3"                │         │
│  │  └─ GitHub: Create release                 │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример GitHub Actions:**
```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run coverage
      
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: docker build -t ctx-hub .
      - run: docker push registry/ctx-hub
      
  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: kubectl apply -f k8s/staging.yaml
      - run: slack-notify "Deployed to staging"
```

**График времени деплоя:**
```
Время от коммита до продакшена (часы)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Вручную:
████████████████████ 2 часа

CI/CD:
██ 10 минут

Ускорение: 92% ⚡
```

**MCP Tools для скилла:**
```javascript
ctx_cicd_generate({ platform: 'github|gitlab|azure' })
ctx_cicd_deploy({ env: 'staging|production' })
ctx_cicd_rollback({ version: 'v1.2.0' })
ctx_cicd_status({ pipeline_id: '...' })
```

**Агент:** `agents/devops-engineer.md`

---

## 🔧 Приоритет 4 — CTX-Specific

---

### 9. 🏥 **provider-health-monitor** — Мониторинг провайдеров

**Что делает:** Отслеживает здоровье AI провайдеров

**Зачем нужен:**
```
❌ Без мониторинга:
  Провайдер тормозит → Не знаешь → Теряешь время → Дедлайн горит

✅ С мониторингом:
  Провайдер тормозит → Алерт → Переключаешься на другой → Все успеваешь
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│         PROVIDER HEALTH MONITOR WORKFLOW                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. METRICS COLLECTION                                   │
│     ┌─────────────────────────────────────┐             │
│     │  Claude Code                         │             │
│     │  ├─ Latency: 1.2s (avg)              │             │
│     │  ├─ Success Rate: 98%                │             │
│     │  ├─ Cost: $0.03/1K tokens           │             │
│     │  └─ Availability: 99.9%              │             │
│     │                                      │             │
│     │  Gemini CLI                          │             │
│     │  ├─ Latency: 2.1s (avg)              │             │
│     │  ├─ Success Rate: 95%                │             │
│     │  ├─ Cost: $0.01/1K tokens           │             │
│     │  └─ Availability: 98.5%              │             │
│     └─────────────────────────────────────┘             │
│                                                          │
│  2. ANOMALY DETECTION                                    │
│     ├─ Latency spike (>2x normal)                       │
│     ├─ Error rate increase (>5%)                        │
│     ├─ Cost spike (>150% budget)                        │
│     └─ Availability drop (<95%)                         │
│                                                          │
│  3. ALERTS                                               │
│     🔴 CRITICAL: Claude latency 4.2s (normal: 1.2s)    │
│     🟡 WARNING: Gemini error rate 7%                    │
│                                                          │
│  4. AUTO-OPTIMIZATION                                    │
│     ├─ Switch to faster provider                        │
│     ├─ Reduce request frequency                         │
│     └─ Use cheaper model for simple tasks               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример дашборда:**
```
📊 PROVIDER HEALTH DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Provider      Latency   Success   Cost/1K   Status
──────────────────────────────────────────────────
Claude Code    1.2s      98%      $0.03     🟢 OK
Gemini CLI     2.1s      95%      $0.01     🟡 WARN
OpenCode       0.8s      99%      $0.02     🟢 OK
Codex CLI      3.5s      92%      $0.04     🔴 SLOW

📈 24h TRENDS:
  Requests: 1,247
  Avg Latency: 1.8s
  Total Cost: $12.34
  Errors: 23 (1.8%)

💡 РЕКОМЕНДАЦИИ:
  - Switch simple tasks to OpenCode (save $3.20/day)
  - Avoid Codex for real-time tasks (latency >3s)
  - Use Gemini for batch processing (cheapest)
```

**График стоимости:**
```
Дневные затраты на AI провайдеров ($)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Без оптимизации:
████████████████████ $15.00

С мониторингом:
██████████ $9.50

Экономия: 37% 💰
```

**Интеграция с существующим кодом:**
```javascript
// Интеграция с scripts/evaluation/eval-store.js
// Добавить поля:
// - latency_avg
// - success_rate
// - cost_per_1k_tokens
// - availability_pct

// Интеграция с scripts/providers/router.js
// Автоматическое переключение при аномалиях
```

**MCP Tools для скилла:**
```javascript
ctx_provider_health({ provider: 'claude|gemini|all' })
ctx_provider_metrics({ period: '24h|7d|30d' })
ctx_provider_alerts({ severity: 'critical|warning' })
ctx_provider_optimize({ goal: 'cost|speed|quality' })
```

---

### 10. 🧠 **consilium-optimizer** — Оптимизатор советов

**Что делает:** Улучшает качество multi-round советов

**Зачем нужен:**
```
❌ Без оптимизатора:
  Consilium → 4 раунда → Много времени → Качество среднее

✅ С оптимизатором:
  Consilium → Авто-стоп на раунде 2 → Меньше времени → Качество выше
```

**Как работает:**
```
┌─────────────────────────────────────────────────────────┐
│          CONSILIUM OPTIMIZER WORKFLOW                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. CLAIM GRAPH ANALYSIS                                 │
│     ┌─────────────────────────────────────┐             │
│     │  Round 1:                            │             │
│     │  ├─ Claude: 3 claims                 │             │
│     │  ├─ Gemini: 2 claims                 │             │
│     │  └─ OpenCode: 4 claims               │             │
│     │                                      │             │
│     │  Consensus: 2 claims ✅              │             │
│     │  Contested: 1 claim ⚠️               │             │
│     │  Unique: 6 claims                    │             │
│     └─────────────────────────────────────┘             │
│                                                          │
│  2. TRUST SCORE CALCULATION                              │
│     Claude:    ████████░░ 82%                            │
│     Gemini:    ███████░░░ 71%                            │
│     OpenCode:  █████████░ 91%                            │
│                                                          │
│  3. EARLY STOPPING CHECK                                 │
│     ┌─────────────────────────────────────┐             │
│     │  IF contested_claims == 0:           │             │
│     │    → STOP (консенсус достигнут)      │             │
│     │    → SYNTHESIZE final answer         │             │
│     │                                      │             │
│     │  IF round > 2 AND trust_delta < 5%:  │             │
│     │    → STOP (дальше не улучшится)      │             │
│     └─────────────────────────────────────┘             │
│                                                          │
│  4. SMART SYNTHESIS                                      │
│     ├─ Weight by trust score                             │
│     ├─ Include unique insights                           │
│     └─ Resolve contested claims                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Пример:**
```bash
/ctx consilium "Should we use microservices or monolith?"

Round 1 (3 providers)...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Claims extracted:
  ✅ Consensus (2): "Start with monolith, evolve later"
  ⚠️  Contested (1): "Team size matters"
  📝 Unique (4): Various insights

Trust scores:
  Claude: 82% → 84%
  Gemini: 71% → 73%
  OpenCode: 91% → 92%

🎯 AUTO-STOP: Consensus reached!
  Contested claims: 0
  Confidence: 94%

💡 SYNTHESIS:
  "Start with modular monolith. Split into microservices 
   when team > 10 engineers OR service > 10K LOC. 
   Recommended path: Monolith → Modules → Services"

⏱️  Время: 45 сек (вместо 3 минут)
```

**График эффективности:**
```
Время Consilium (секунды)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Без оптимизатора (4 раунда):
████████████████████████████ 180 сек

С оптимизатором (auto-stop):
████████ 45 сек

Экономия: 75% времени ⚡

Качество синтеза:
Без оптимизатора: 78%
С оптимизатором:  94% (+16%)
```

**Интеграция с существующим кодом:**
```javascript
// Интеграция с scripts/consilium/round-orchestrator.js
// Добавить функции:
// - checkEarlyStopping()
// - calculateConsensusLevel()
// - optimizeSynthesisWeights()

// Интеграция с scripts/consilium/claim-graph.js
// Добавить:
// - getContestedClaimsCount()
// - getConsensusStrength()
```

**MCP Tools для скилла:**
```javascript
ctx_consilium_optimize({ strategy: 'auto-stop|trust-weighted' })
ctx_consilium_early_stop({ contested_threshold: 0 })
ctx_consilium_trust_scores({ providers: ['claude', 'gemini'] })
```

---

## 📊 Сводная таблица всех скиллов

| Скилл | Приоритет | Время экономии | Сложность | Польза | MCP Tools |
|-------|-----------|----------------|-----------|--------|-----------|
| 🔒 security-scanner | 1 | 2-3 часа/неделю | Средняя | ⭐⭐⭐⭐⭐ | 3 |
| 🐛 error-debugger | 1 | 1-2 часа/день | Низкая | ⭐⭐⭐⭐⭐ | 4 |
| ✅ test-coverage-booster | 1 | 4-5 часов/спринт | Средняя | ⭐⭐⭐⭐ | 4 |
| 🎨 api-designer | 2 | 6-8 часов/проект | Средняя | ⭐⭐⭐⭐ | 4 |
| 📚 documentation-generator | 2 | 3-4 часа/релиз | Низкая | ⭐⭐⭐⭐ | 3 |
| 🔧 refactoring-assistant | 2 | 2-3 часа/неделю | Высокая | ⭐⭐⭐⭐ | 4 |
| 🐳 dockerizer | 3 | 4-6 часов/проект | Низкая | ⭐⭐⭐ | 3 |
| 🚀 ci-cd-pipeline | 3 | 2 часа/деплой | Средняя | ⭐⭐⭐⭐⭐ | 4 |
| 🏥 provider-health-monitor | 4 | 30 мин/день | Средняя | ⭐⭐⭐ | 4 |
| 🧠 consilium-optimizer | 4 | 2 мин/совет | Высокая | ⭐⭐⭐⭐ | 3 |

**Итого:**
- 10 новых скиллов
- 38 новых MCP tools
- 3 новых агента (security-auditor, api-architect, devops-engineer)
- Общая экономия времени: ~15-20 часов/неделю

---

## 🎯 План внедрения

### Неделя 1-2: Критичные
```
✅ Цель: Безопасность и качество

1. security-scanner
   - MCP tools: security_scan, security_report, security_ignore
   - Агент: security-auditor
   - Интеграция: ctx_log_action + ctx_save_lesson
   - Тесты: tests/security-scanner.test.mjs

2. error-debugger
   - MCP tools: error_analyze, error_find_similar, error_get_solution
   - Интеграция: ctx_log_error + ctx_search_solutions
   - Тесты: tests/error-debugger.test.mjs

3. test-coverage-booster
   - MCP tools: coverage_analyze, coverage_generate_tests, coverage_mutate
   - Интеграция: ctx_log_action + существующие тесты
   - Тесты: tests/coverage-booster.test.mjs
```

### Неделя 3-4: Продуктивность
```
✅ Цель: Автоматизация рутины

4. api-designer
   - MCP tools: api_generate_spec, api_validate_endpoints, api_generate_sdk
   - Агент: api-architect
   - Интеграция: ctx_get_project_map + Express routes parser
   - Тесты: tests/api-designer.test.mjs

5. documentation-generator
   - MCP tools: docs_generate, docs_update_changelog, docs_create_wiki
   - Интеграция: JSDoc parser + README template
   - Тесты: tests/docs-generator.test.mjs

6. refactoring-assistant
   - MCP tools: refactor_analyze, refactor_suggest, refactor_apply, refactor_rollback
   - Интеграция: ESLint + existing tests
   - Тесты: tests/refactoring-assistant.test.mjs
```

### Неделя 5-6: DevOps
```
✅ Цель: Автоматизация деплоя

7. dockerizer
   - MCP tools: docker_generate, docker_optimize, docker_compose
   - Интеграция: package.json parser + Dockerfile templates
   - Тесты: tests/dockerizer.test.mjs

8. ci-cd-pipeline
   - MCP tools: cicd_generate, cicd_deploy, cicd_rollback, cicd_status
   - Агент: devops-engineer
   - Интеграция: GitHub Actions API + existing npm-publish workflow
   - Тесты: tests/cicd-pipeline.test.mjs
```

### Неделя 7-8: CTX Enhancement
```
✅ Цель: Оптимизация провайдеров

9. provider-health-monitor
   - MCP tools: provider_health, provider_metrics, provider_alerts, provider_optimize
   - Интеграция: eval-store.js + router.js
   - Тесты: tests/provider-health.test.mjs

10. consilium-optimizer
    - MCP tools: consilium_optimize, consilium_early_stop, consilium_trust_scores
    - Интеграция: round-orchestrator.js + claim-graph.js
    - Тесты: tests/consilium-optimizer.test.mjs
```

---

## 📁 Структура новых файлов

```
scripts/
├── tools/
│   ├── security.js          # Security scanner tools
│   ├── error-debugger.js    # Error analysis tools
│   ├── coverage.js          # Test coverage tools
│   ├── api-designer.js      # API generation tools
│   ├── docs-generator.js    # Documentation tools
│   ├── refactoring.js       # Refactoring assistant tools
│   ├── dockerizer.js        # Docker generation tools
│   ├── cicd.js              # CI/CD pipeline tools
│   ├── provider-health.js   # Provider monitoring tools
│   └── consilium-opt.js     # Consilium optimization tools
│
├── security/
│   ├── scanner.js           # Security scanner core
│   ├── dependency-check.js  # npm audit wrapper
│   └── owasp-rules.js       # OWASP rules engine
│
├── debugging/
│   ├── error-parser.js      # Stack trace parser
│   ├── pattern-matcher.js   # Error pattern matching
│   └── solution-generator.js # Fix suggestion engine
│
├── coverage/
│   ├── analyzer.js          # Coverage analysis
│   ├── test-generator.js    # Auto-test generation
│   └── mutation-tester.js   # Mutation testing
│
├── api/
│   ├── route-parser.js      # Express/Fastify parser
│   ├── schema-extractor.js  # TypeScript schema extraction
│   └── openapi-generator.js # OpenAPI spec generator
│
├── docs/
│   ├── readme-builder.js    # README generator
│   ├── jsdoc-parser.js      # JSDoc extraction
│   └── changelog.js         # Changelog automation
│
├── refactoring/
│   ├── smell-detector.js    # Code smell detection
│   ├── pattern-suggester.js # Refactoring patterns
│   └── safe-refactor.js     # Safe refactoring engine
│
├── docker/
│   ├── dockerfile-gen.js    # Dockerfile generator
│   ├── compose-gen.js       # docker-compose generator
│   └── optimizer.js         # Image optimization
│
├── cicd/
│   ├── github-actions.js    # GitHub Actions generator
│   ├── deploy.js            # Deployment automation
│   └── rollback.js          # Rollback engine
│
├── health/
│   ├── provider-monitor.js  # Provider health monitor
│   ├── anomaly-detect.js    # Anomaly detection
│   └── auto-optimizer.js    # Auto-optimization
│
└── consilium-v2/
    ├── early-stop.js        # Early stopping logic
    ├── trust-calibrator.js  # Trust score calibration
    └── smart-synthesis.js   # Weighted synthesis

skills/
├── security-scanner/
│   └── SKILL.md
├── error-debugger/
│   └── SKILL.md
├── test-coverage/
│   └── SKILL.md
├── api-designer/
│   └── SKILL.md
├── documentation/
│   └── SKILL.md
├── refactoring/
│   └── SKILL.md
├── dockerizer/
│   └── SKILL.md
├── ci-cd/
│   └── SKILL.md
├── provider-health/
│   └── SKILL.md
└── consilium-opt/
    └── SKILL.md

agents/
├── security-auditor.md      # NEW
├── api-architect.md         # NEW
└── devops-engineer.md       # NEW

tests/
├── security-scanner.test.mjs
├── error-debugger.test.mjs
├── coverage-booster.test.mjs
├── api-designer.test.mjs
├── docs-generator.test.mjs
├── refactoring-assistant.test.mjs
├── dockerizer.test.mjs
├── cicd-pipeline.test.mjs
├── provider-health.test.mjs
└── consilium-optimizer.test.mjs
```

---

## 📈 Ожидаемые результаты

**После внедрения всех скиллов:**

| Метрика | Было | Стало | Улучшение |
|---------|------|-------|-----------|
| MCP Tools | 29 | 67 | +131% |
| Skills | 15 | 25 | +67% |
| Agents | 10 | 13 | +30% |
| Время на bug fix | 45 мин | 5 мин | -89% |
| Время на документацию | 4 часа | 2 мин | -99% |
| Покрытие тестами | 67% | 89% | +22% |
| Время деплоя | 2 часа | 10 мин | -92% |
| Стоимость AI/день | $15 | $9.50 | -37% |

---

## 🔗 Связанные документы

- [CTX_UNIVERSAL.md](./CTX_UNIVERSAL.md) — Универсальный pipeline
- [CTX_UNIFIED_PLAN.md](./CTX_UNIFIED_PLAN.md) — Единый план развития
- [AGENTS.md](./AGENTS.md) — Система агентов
- [README.md](./README.md) — Основная документация

---

## 📝 Примечания

1. Все скиллы следуют принципу **"безопасность прежде всего"**
2. Каждый скилл имеет **откат (rollback)** на случай ошибок
3. Новые MCP tools регистрируются в `scripts/ctx-mcp-hub.js`
4. Тесты обязательны для всех скиллов
5. Интеграция с существующей KB для сохранения уроков

---

**Создал:** AI Assistant (OpenCode)  
**Дата:** 2026-03-03  
**Версия:** 1.0  
**Статус:** Готов к реализации
