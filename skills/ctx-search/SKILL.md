---
name: ctx-search
description: >
  Поиск решений в кросс-проектной базе знаний (GitHub Issues).
  Ищет уроки, решения ошибок и архитектурные решения из всех проектов.
  Используй когда сталкиваешься с проблемой — возможно она уже решалась ранее.
  ALIAS: эквивалент `/ctx search <запрос>`. Оба варианта работают одинаково.
---

# /ctx-search — Knowledge Base Search

Поиск решений из прошлых сессий по всем проектам.

## Использование

`/ctx-search <запрос>` — поиск по описанию проблемы

## Workflow

### 1. Поиск уроков (lessons)

```bash
# Поиск по всем проектам — уроки
gh search issues "$ARGUMENTS" --owner VladPatr96 --label lesson --json number,title,body,repository --limit 15

# Поиск решений
gh search issues "$ARGUMENTS" --owner VladPatr96 --label solution --json number,title,body,repository --limit 10
```

### 2. Поиск по сессиям

```bash
# Если уроки не нашлись — ищем в сессиях
gh search issues "$ARGUMENTS" --owner VladPatr96 --label session --json number,title,body,repository --limit 10
```

### 3. Поиск по решениям консилиума

```bash
gh search issues "$ARGUMENTS" --owner VladPatr96 --label consilium --json number,title,body,repository --limit 5
```

### 4. Показать результаты

Для каждого найденного решения покажи:

```
🔍 Найдено N решений:

1. [project-name] Lesson: описание проблемы
   Решение: краткое описание решения
   Issue: #NNN

2. [project-name] Session: что было сделано
   Ключевое: описание
   Issue: #NNN
```

### 5. Адаптация

Если найдено решение — предложи как адаптировать его для текущего проекта:
- Что из решения применимо напрямую
- Что нужно изменить
- Какие зависимости/контекст отличаются

### 6. Если ничего не найдено

Сообщи пользователю и предложи:
- Уточнить запрос
- Поискать по другим ключевым словам
- Решить проблему и сохранить урок через `/ctx save`
