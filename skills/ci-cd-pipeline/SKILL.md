---
name: ci-cd-pipeline
description: Автоматическое создание CI/CD pipelines для GitHub Actions, GitLab CI и Azure DevOps.
---

# /ctx ci-cd — CI/CD Pipeline Generator

Автоматизация деплоя.

## Команды

```
/ctx ci-cd --platform github --stages test,build,deploy
/ctx cicd-generate --platform gitlab
/ctx cicd-deploy --env staging --strategy blue-green
/ctx cicd-rollback --version v1.2.0
```

## Пример

```bash
/ctx ci-cd --platform github
```

Результат: .github/workflows/ci-cd.yml

## Преимущества

- 🚀 10 минут вместо 2 часов
- ⚡ Auto-deploy
- 🔄 Rollback automation
