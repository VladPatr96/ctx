---
name: refactoring-assistant
description: >
  Помощник рефакторинга: находит code smells, предлагает улучшения,
  применяет безопасные трансформации с автоматическими тестами.
---

# /ctx refactor — Помощник рефакторинга

Находит code smells и предлагает улучшения.

## Команды

```
/ctx refactor --directory src --severity high
/ctx refactor-analyze --file src/auth.js
/ctx refactor-suggest --pattern "extract-method"
/ctx refactor-apply --transformation "extract-class" --safe-mode
```

## Как работает

```
┌─────────────────────────────────────────┐
│  1. CODE SMELL DETECTION                 │
│     ├─ God Object (>1000 LOC)            │
│     ├─ Long Method (>100 lines)          │
│     ├─ Duplicate Code                    │
│     └─ High Complexity (>15)             │
├─────────────────────────────────────────┤
│  2. PATTERN SUGGESTIONS                  │
│     ├─ Extract Method                    │
│     ├─ Extract Class                     │
│     ├─ Replace Conditional               │
│     └─ Introduce Strategy                │
├─────────────────────────────────────────┤
│  3. SAFE REFACTORING                     │
│     ├─ Run tests before                  │
│     ├─ Apply changes                     │
│     ├─ Run tests after                   │
│     └─ Rollback if broken                │
└─────────────────────────────────────────┘
```

## Примеры использования

### Анализ кода

```bash
/ctx refactor --directory src
```

Результат:
```json
{
  "smells": [
    {
      "type": "god-object",
      "file": "src/UserService.js",
      "lines": 1247,
      "severity": "critical",
      "suggestion": "Split into 4 services"
    },
    {
      "type": "duplicate-code",
      "file": "src/auth.js",
      "count": 7,
      "severity": "high",
      "suggestion": "Extract to utils/validation.js"
    }
  ]
}
```

## Экономия времени

```
Вручную:   2-3 часа на рефакторинг
С помощником: 30 минут
Экономия:  83% времени
```

## Преимущества

- 🔍 Автообнаружение code smells
- 🎯 Паттерны рефакторинга
- ✅ Безопасные трансформации
- 🔄 Авто-rollback при ошибках
