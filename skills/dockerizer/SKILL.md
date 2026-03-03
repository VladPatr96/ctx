---
name: dockerizer
description: Автоматическая контейнеризация проектов с генерацией Dockerfile, docker-compose и оптимизацией образов.
---

# /ctx dockerize — Контейнеризация

Автоматическое создание Docker конфигурации.

## Команды

```
/ctx dockerize --runtime node|python|go
/ctx docker-generate --type multi-stage
/ctx docker-compose --services app,db,redis
/ctx docker-optimize --strategy size|speed
```

## Пример

```bash
/ctx dockerize --runtime node
```

Результат: Dockerfile, docker-compose.yml, .dockerignore

## Преимущества

- 🐳 Multi-stage builds (-81% size)
- ⏱️ 5 минут вместо 4-6 часов
- 🔧 Автоопределение стека
