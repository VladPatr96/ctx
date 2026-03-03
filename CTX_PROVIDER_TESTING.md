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
