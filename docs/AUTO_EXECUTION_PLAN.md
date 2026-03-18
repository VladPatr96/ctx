# 🔄 План автоматического выполнения скиллов

## Текущее состояние

✅ **Автоматически:**
- Регистрация MCP tools при запуске MCP Hub
- Загрузка CLI commands при запуске ctx-cli.js
- Доступность скиллов на всех провайдерах

❌ **НЕ автоматически:**
- Запуск security-scan при коммите
- Запуск test-coverage при pull request
- Запуск debug при ошибке

---

## 🎯 Варианты автоматизации

### Вариант 1: Git Hooks (рекомендуется)

**Создать:** `.git/hooks/pre-commit`

```bash
#!/bin/bash

# Автоматический security-scan перед коммитом
echo "🔒 Running security scan..."
node scripts/ctx-cli.js security-scan --scope dependencies

if [ $? -ne 0 ]; then
  echo "❌ Security issues found. Commit blocked."
  exit 1
fi

echo "✅ Security check passed"
```

**Создать:** `.git/hooks/pre-push`

```bash
#!/bin/bash

# Автоматический test-coverage перед push
echo "✅ Running test coverage..."
node scripts/ctx-cli.js test-coverage --target 90

if [ $? -ne 0 ]; then
  echo "❌ Coverage below target. Push blocked."
  exit 1
fi
```

---

### Вариант 2: CI/CD Integration

**Добавить в:** `.github/workflows/ci.yml`

```yaml
name: Auto Security & Tests

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Security Scan
        run: node scripts/ctx-cli.js security-scan --scope all
        
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Test Coverage
        run: node scripts/ctx-cli.js test-coverage --target 90
```

---

### Вариант 3: CTX Pipeline Hooks

**Обновить:** `hooks/hooks.json`

```json
{
  "hooks": {
    "PreCompress": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/ctx-cli.js security-scan --quick"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/ctx-session-save.js --event stop"
          },
          {
            "type": "command",
            "command": "node scripts/ctx-cli.js generate-docs --type changelog"
          }
        ]
      }
    ],
    "OnError": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/ctx-cli.js debug --auto-log"
          }
        ]
      }
    ]
  }
}
```

---

### Вариант 4: Pipeline Stage Triggers

**Добавить в:** `scripts/ctx-mcp-hub.js`

```javascript
// Автоматический запуск при смене стадии pipeline
async function onStageChange(newStage, pipeline) {
  switch(newStage) {
    case 'plan':
      // Автоматически анализировать API при планировании
      await ctx_api_design({ format: 'openapi' });
      break;
      
    case 'execute':
      // Автоматически проверять security при выполнении
      await ctx_security_scan({ scope: 'code' });
      break;
      
    case 'done':
      // Автоматически генерировать docs при завершении
      await ctx_generate_docs({ type: 'all' });
      break;
  }
}
```

---

## 🚀 Рекомендуемый подход

### Минимальный (Git Hooks):

```bash
# Создать pre-commit hook
cat > .git/hooks/pre-commit << 'HOOK'
#!/bin/bash
node scripts/ctx-cli.js security-scan --scope dependencies
HOOK

chmod +x .git/hooks/pre-commit
```

### Продвинутый (Pipeline Integration):

1. Добавить триггеры в pipeline
2. Связать стадии с автоматическими проверками
3. Логировать результаты в KB

---

## 📊 Что даст автоматизация

| Событие | Автоматический запуск | Экономия |
|---------|----------------------|----------|
| git commit | security-scan | 100% (не забыть) |
| git push | test-coverage | 100% (всегда проверено) |
| CI pipeline | все проверки | 100% (гарантия качества) |
| pipeline stage | соответствующие скиллы | 90% (автоматизация) |
| error | debug | 95% (мгновенный анализ) |

---

## ✅ Что делать сейчас?

Выбери вариант:

1. **Git Hooks** — Простая автоматизация (5 минут)
2. **CI/CD Integration** — Полная автоматизация (15 минут)
3. **Pipeline Hooks** — Интеграция с CTX (10 минут)
4. **Все вместе** — Максимальная автоматизация (30 минут)

Какой вариант хочешь реализовать?
