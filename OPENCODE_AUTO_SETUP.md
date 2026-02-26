# OpenCode Auto-Setup — CTX Skill Auto-Update

Автоматическая установка и обновление CTX skill для OpenCode при запуске программы.

## 🚀 Быстрая установка

```bash
# Автоопределение директории OpenCode skills
node scripts/opencode-auto-setup.js

# Указать путь вручную
node scripts/opencode-auto-setup.js "C:\\Users\\user\\.opencode\\skills"
```

## 📋 Что делает этот скрипт

1. **Находит** директорию OpenCode skills
2. **Копирует** универсальный CTX skill (`skills/ctx-universal-full/SKILL.md`)
3. **Создаёт** скрипт автообновления (`update-ctx-skill.js`)
4. **Создаёт** startup скрипт для запуска (`update-ctx-skill.bat`/`.sh`)

## 🔧 Интеграция в OpenCode

### Вариант 1: Startup скрипт (Windows)

Создайте ярлык для OpenCode с такими параметрами:

```
Цель: cmd.exe /c "C:\Users\user\.opencode\skills\update-ctx-skill.bat && opencode"
Рабочая папка: C:\Users\user\.opencode
```

### Вариант 2: PowerShell скрипт

Создайте файл `launch-opencode.ps1`:

```powershell
# Update CTX skill
& "C:\Users\user\.opencode\skills\update-ctx-skill.bat"

# Launch OpenCode
Start-Process opencode
```

### Вариант 3: Shell скрипт (macOS/Linux)

Создайте файл `launch-opencode.sh`:

```bash
#!/bin/bash
# Update CTX skill
~/.opencode/skills/update-ctx-skill.sh

# Launch OpenCode
opencode
```

Сделайте файл исполняемым:
```bash
chmod +x launch-opencode.sh
```

## 📁 Структура после установки

```
~/.opencode/skills/
├── ctx/
│   └── SKILL.md                      ← Универсальный CTX skill
├── update-ctx-skill.js               ← Скрипт автообновления
├── update-ctx-skill.bat              ← Windows startup скрипт
└── update-ctx-skill.sh               ← Unix startup скрипт
```

## 🔄 Обновление вручную

В любой момент можно обновить CTX skill:

```bash
# Windows
C:\Users\user\.opencode\skills\update-ctx-skill.bat

# macOS/Linux
~/.opencode/skills/update-ctx-skill.sh
```

Или напрямую:
```bash
node ~/.opencode/skills/update-ctx-skill.js
```

## 💻 Использование в OpenCode

После установки:

```
/ctx start           — Запустить pipeline
/ctx task <описание> — Определить задачу
/ctx brainstorm      — Обсудить подход
/ctx plan            — Создать план
/ctx execute         — Выполнить план
/ctx save            — Сохранить сессию
/ctx status          — Показать статус
/ctx lead <provider> — Сменить ведущего
```

## 🎯 Преимущества автообновления

- ✅ **Всегда актуальный skill** — автоматически обновляется при запуске
- ✅ **Никаких ручных копирований** — всё происходит автоматически
- ✅ **Лёгкое обновление** — один скрипт для всех изменений
- ✅ **Безопасность** — создаются бэкапы при обновлении
- ✅ **Кроссплатформенность** — Windows, macOS, Linux

## 🔍 Поиск директории OpenCode

Скрипт автоматически ищет OpenCode skills в следующих местах:

**Windows:**
- `%APPDATA%\OpenCode\skills`
- `%LOCALAPPDATA%\OpenCode\skills`
- `%USERPROFILE%\.opencode\skills`
- `C:\Program Files\OpenCode\skills`
- `C:\Program Files (x86)\OpenCode\skills`

**macOS/Linux:**
- `~/.opencode/skills`
- `~/.config/opencode/skills`
- `/usr/local/share/opencode/skills`
- `/opt/opencode/skills`

Если директория не найдена, укажите путь вручную.

## 🛠️ Устранение проблем

### OpenCode skills не найден

Укажите путь вручную:
```bash
node scripts/opencode-auto-setup.js "C:\\path\\to\\opencode\\skills"
```

### Ошибка при копировании

Убедитесь, что:
- У вас есть права на запись в директорию OpenCode skills
- Директория существует
- Исходный файл `skills/ctx-universal-full/SKILL.md` существует

### Skill не обновляется

Проверьте:
- Версию исходного файла
- Дату последнего изменения в `~/.opencode/skills/ctx/SKILL.md`

## 📚 Документация

- **CTX_QUICKSTART.md** — Быстрый старт
- **CTX_UNIVERSAL.md** — Полная документация
- **CTX_README.md** — Обзор функционала

## 🔗 Связанные скрипты

- `scripts/ctx-setup.js` — Установка для всех провайдеров
- `scripts/final-test.js` — Комплексные тесты
- `scripts/ctx-cli.js` — CLI wrapper

---

**Установите один раз и забудьте о ручном обновлении!** 🚀
