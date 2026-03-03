---
name: test-coverage-booster
description: Анализ покрытия тестами и автогенерация недостающих тестов для достижения 90%+ coverage.
---

# /ctx test-coverage — Анализ и улучшение покрытия тестами

## Как работает

```
┌─────────────────────────────────────────┐
│  1. COVERAGE ANALYSIS                    │
│     ├─ Запуск тестов с coverage          │
│     ├─ Парсинг coverage report           │
│     └─ Выявление gaps                    │
├─────────────────────────────────────────┤
│  2. GAP DETECTION                        │
│     ├─ Функции без тестов                │
│     ├─ Ветки if/else без покрытия        │
│     └─ Edge cases (null, empty, max)     │
├─────────────────────────────────────────┤
│  3. AUTO-GENERATION                      │
│     ├─ Unit tests для функций            │
│     ├─ Integration tests для API         │
│     └─ Edge case tests                   │
└─────────────────────────────────────────┘
```

## Примеры использования

### Анализ покрытия

```bash
/ctx test-coverage --directory src --target 90
```

Результат:
```json
{
  "current": 67,
  "target": 90,
  "gap": 23,
  "byFile": [
    {
      "file": "src/auth.js",
      "coverage": 80,
      "missing": ["refreshToken() else branch"]
    },
    {
      "file": "src/payment.js",
      "coverage": 40,
      "missing": ["processPayment()", "validateAmount()"]
    }
  ],
  "generatedTests": 8,
  "estimatedCoverage": 89
}
```

## Интеграция с CTX Pipeline

### MCP Mode (Claude Code)
```javascript
const result = await ctx_test_coverage({ 
  directory: 'src', 
  target: 90 
});
console.log(`Coverage: ${result.current}% → ${result.estimatedCoverage}%`);
```

### CLI Mode (Codex/Gemini/OpenCode)
```bash
node scripts/ctx-cli.js test-coverage --directory src --target 90
```

## Поддерживаемые фреймворки

| Framework | Unit Tests | Coverage | Mutation |
|-----------|-----------|----------|----------|
| Jest      | ✅        | ✅       | ✅       |
| Mocha     | ✅        | ✅       | ⚠️       |
| Vitest    | ✅        | ✅       | ✅       |
| Node:test | ✅        | ✅       | ⚠️       |

## Экономия времени

```
Вручную:   4-5 часов на написание тестов
С бустером: 15-20 минут на автогенерацию
Экономия:  90% времени
```

## График улучшения

```
Покрытие тестами (%)

100% ┤
 90% ┤              ╭───────╮  С бустером
 80% ┤          ╭───╯       ╰─── 89%
 70% ┤      ╭───╯
 60% ┤  ╭───╯  67%
 50% ┤──╯       Без бустера
     └────┬────┬────┬────┬────
         W1   W2   W3   W4   W5

Ускорение роста покрытия: 3x 📈
```

## Конфигурация

`.ctx/test-coverage.json`:
```json
{
  "enabled": true,
  "framework": "jest",
  "target": 90,
  "exclude": ["**/test/**", "**/*.test.js"],
  "mutationTesting": {
    "enabled": true,
    "runs": 100
  }
}
```

## Преимущества

- 📈 Автоматическое повышение coverage на 20-30%
- ⏱️ Экономит 4-5 часов на написание тестов
- 🎯 Находит непокрытые edge cases
- 🧬 Mutation testing для качества тестов
- 🔄 Интеграция с CTX pipeline
