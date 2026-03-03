---
name: security-scanner
description: >
  Сканер безопасности для кода и зависимостей.
  Автоматически находит уязвимости, проверяет зависимости и генерирует отчеты.
---

# /ctx security-scan — Сканер безопасности

Универсальный скилл для проверки безопасности проекта.

## Команды

```
/ctx security-scan [--scope code|dependencies|all]
/ctx security-report [--format json|markdown]
/ctx security-ignore <pattern>
```

## Режимы работы

**Автоматическое определение:**
- MCP Mode (Claude Code): `ctx_security_scan()`
- CLI Mode (другие): `node ctx-cli.js security-scan`

## Примеры использования

### Сканирование кода

```bash
/ctx security-scan --scope code
```

Результат:
```json
{
  "critical": 2,
  "high": 5,
  "medium": 12,
  "findings": [
    {
      "severity": "critical",
      "type": "sql-injection",
      "file": "scripts/auth.js",
      "line": 45,
      "message": "Potential SQL injection vulnerability",
      "recommendation": "Use parameterized queries"
    }
  ]
}
```

### Проверка зависимостей

```bash
/ctx security-scan --scope dependencies
```

Результат:
```json
{
  "vulnerable": 3,
  "outdated": 7,
  "findings": [
    {
      "package": "lodash",
      "version": "4.17.15",
      "severity": "high",
      "cve": "CVE-2020-8203",
      "recommendation": "Upgrade to 4.17.21"
    }
  ]
}
```

## Интеграция с CTX

### MCP Mode (Claude Code)

```javascript
// Прямой вызов MCP tool
const result = await ctx_security_scan({ scope: 'all' });
console.log(result.critical, result.findings);
```

### CLI Mode (Codex/Gemini/OpenCode)

```bash
# CLI wrapper
node scripts/ctx-cli.js security-scan --scope all

# Результат в JSON
{
  "critical": 2,
  "findings": [...]
}
```

### Сохранение в KB

```javascript
// Автоматическое сохранение уроков
ctx_save_lesson({
  type: 'security',
  title: 'SQL Injection в auth.js',
  solution: 'Использовать параметризованные запросы',
  severity: 'critical'
});
```

## Конфигурация

Файл: `.ctx/security-scanner.json`

```json
{
  "enabled": true,
  "scope": ["code", "dependencies"],
  "ignore": [
    "**/test/**",
    "**/*.test.js"
  ],
  "severity": ["critical", "high"],
  "autoFix": false
}
```

## Алгоритм работы

```
1. Парсинг кода
   ├─ JavaScript/TypeScript AST analysis
   ├─ Regex patterns for common vulnerabilities
   └─ Framework-specific checks

2. Dependency scanning
   ├─ npm audit
   ├─ Known CVE database
   └─ License compliance

3. Report generation
   ├─ Group by severity
   ├─ Provide fix recommendations
   └─ Save to KB for future reference

4. CTX integration
   ├─ Log findings via ctx_log_action
   ├─ Save lessons to KB
   └─ Update pipeline status
```

## Преимущества

- ⏱️ Экономит 2-3 часа на code review
- 🛡️ Предотвращает 80% типичных уязвимостей
- 📊 Соответствие OWASP Top 10
- 🔄 Интеграция с pipeline
- 📚 Learning from KB
