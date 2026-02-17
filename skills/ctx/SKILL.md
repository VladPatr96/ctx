---
name: ctx
description: >
  Система управления контекстом сессий. При вызове /ctx — запускает индексацию проекта,
  загружает контекст из GitHub Issues, ищет релевантные уроки, создаёт лог сессии.
  При /ctx save — сохраняет результаты в GitHub Issues (проект + центральная база).
---

# /ctx — Session & Context Manager

Управляет контекстом между сессиями. Загружает уроки, индексирует файлы, ведёт логи.

## Использование

- `/ctx` — старт сессии
- `/ctx save` — конец сессии
- `/ctx status` — текущее состояние

---

## Старт сессии (`/ctx` или `/ctx` без аргументов)

### 1. Индексация проекта

Запусти индексатор для построения карты проекта:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-indexer.js"
```

Если скрипт недоступен, выполни вручную:

```bash
# Определить стек
ls package.json go.mod requirements.txt Cargo.toml pom.xml 2>/dev/null

# Структура проекта (без node_modules, .git, dist)
find . -maxdepth 3 -type d \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/dist/*' \
  -not -path '*/.next/*' \
  -not -path '*/build/*' \
  -not -name node_modules \
  -not -name .git | head -50

# Git состояние
git status --short 2>/dev/null
git log -5 --oneline 2>/dev/null
git diff --stat 2>/dev/null
```

Покажи пользователю краткую карту проекта.

### 2. Загрузить контекст из GitHub Issues

```bash
# Определить текущий проект
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")

# Открытые задачи текущего проекта
gh issue list -L 20 --json number,title,labels,state 2>/dev/null

# Уроки из центральной базы знаний (все проекты)
gh search issues "label:lesson" --owner VladPatr96 --limit 10 --json title,body,repository

# Уроки для текущего стека
gh search issues "label:lesson label:project:$PROJECT_NAME" --owner VladPatr96 --limit 5 --json title,body

# Текущие блокеры
gh issue list -l blocker --state open --json number,title,body 2>/dev/null

# WIP задачи
gh issue list -l wip --state open --json number,title,body 2>/dev/null
```

### 3. Создать файл лога сессии

Создай файл `.sessions/YYYY-MM-DD-HHmm.md`:

```markdown
# Session YYYY-MM-DD HH:mm
**Project:** [имя проекта]
**Machine:** [определить из окружения]
**Branch:** [текущая ветка git]
**Provider:** Claude Code
**Goals:** [спросить у пользователя или определить из контекста]

## Project Map
<!-- Краткая карта из индексатора -->

## Context Loaded
- Open issues: [количество]
- Recent lessons: [список]
- Active blockers: [список]

## Actions
<!-- Логировать каждое значимое действие -->

## Errors & Solutions
<!-- При обнаружении и решении бага — документировать -->

## Decisions
<!-- Архитектурные и технические решения -->

## Files Modified
<!-- Список изменённых файлов -->

## Tasks
<!-- Трекер задач текущей сессии -->
- [ ] задача 1
- [ ] задача 2

## Summary
<!-- Заполнить в конце сессии -->
```

### 4. Показать сводку

```
📋 Сессия начата: YYYY-MM-DD HH:mm
📂 Лог: .sessions/YYYY-MM-DD-HHmm.md
🗺️ Проект: [имя] ([стек])

📁 Структура:
  src/ — [N файлов] ([типы])
  ...

🔓 Открытые задачи: N
  #1 — Название

🚫 Блокеры: N
  #X — Описание

📚 Релевантные уроки:
  - [проект] Урок: описание
  - [проект] Урок: описание

🔧 WIP:
  #Z — В процессе
```

---

## В процессе работы

### Логирование действий
После каждого значимого действия добавляй запись в `## Actions`:
```
- [HH:mm] действие — файл/компонент — результат
```

### При обнаружении и решении бага
1. Задокументируй в `## Errors & Solutions`
2. Создай GitHub issue с меткой `lesson` в **центральном репо**:
```bash
gh issue create -R VladPatr96/my_claude_code \
  --title "Lesson: краткое описание" \
  --label "lesson,project:$PROJECT_NAME" \
  --body "## Ошибка
описание

## Решение
как исправлено

## Как предотвратить
рекомендации"
```
3. Закрой issue сразу:
```bash
gh issue close <number> -R VladPatr96/my_claude_code
```

### При принятии архитектурного решения
Задокументируй в `## Decisions`. Если значимое — создай issue с `decision` label.

---

## Конец сессии (`/ctx save`)

### 1. Заполнить Summary
Суммируй все действия, ошибки, решения.

### 2. Сохранить в GitHub Issues (гибридная запись)

**В репозитории проекта** (session log + task tracker):
```bash
gh issue create \
  --title "Session: $(date +%Y-%m-%d) — краткое описание" \
  --label "session,provider:claude-code" \
  --body "## Сводка сессии
Дата, ветка, машина

## Что сделано
- пункт 1
- пункт 2

## Tasks
- [x] выполненная задача
- [ ] незавершённая задача

## Ошибки и решения
- ошибка → решение

## Изменённые файлы
- список"
```

**В центральный репо** (lessons для кросс-проектного поиска):
```bash
gh issue create -R VladPatr96/my_claude_code \
  --title "Session: $PROJECT_NAME $(date +%Y-%m-%d) — краткое описание" \
  --label "session,project:$PROJECT_NAME" \
  --body "## Ключевые уроки
- урок 1
- урок 2

## Решения
- решение (контекст для повторного использования)"
```

### 3. Обновить WIP issues
- Закрой завершённые
- Создай новые для незавершённой работы

---

## Правила

1. `.sessions/` в `.gitignore` — логи приватны
2. Issues — только финальные выводы, без чувствительных данных
3. Уроки закрываются сразу — хранятся как reference
4. Не дублируй — если урок уже в MEMORY.md, не создавай issue
5. Task tracker — чекбоксы в issue проекта для видимости прогресса
