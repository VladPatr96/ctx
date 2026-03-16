#!/usr/bin/env bash
# Windows Terminal split layout for agent teams + consilium testing
# Usage: bash scripts/wt-test-launch.sh

PROJECT_DIR="C:/Users/Патраваев/projects/claude_ctx"

CONSILIUM_PROMPT='Проект: ctx-app (Electron + React + Vite + TypeScript + Zustand)
Структура: ctx-app/src/pages/ (10 страниц: Dashboard, Knowledge, Agents, Routing, DevPipeline, Orchestrator, Debates, Settings, Terminal, CommandCenter)
Компоненты: ctx-app/src/components/layout/ (Sidebar, ErrorBoundary), ctx-app/src/api/ (client, hooks)
Дизайн: CSS с data-theme (dark/light), Lucide icons, Framer Motion анимации

Задача: Оцени готовность десктопного приложения по критериям приемки:
1. Единая дизайн-система с темной/светлой темой
2. Лента активности сессий в реальном времени (SSE)
3. Браузер базы знаний с поиском, фильтрацией и детальным просмотром
4. Сводка состояния провайдеров с метками времени
5. Интуитивная навигация для новых пользователей
6. Запуск < 3 секунд, нет зависаний

Прочитай файлы в ctx-app/src/ и дай оценку каждого критерия: READY / PARTIAL / NOT_READY.
Включи обоснование и конкретные рекомендации по улучшению.'

# Launch Windows Terminal with 4 panes
wt.exe \
  new-tab -d "$PROJECT_DIR/ctx-app" --title "🚀 Dev Server" -- bash -c "echo '=== CTX App Dev Server ==='; npm run dev 2>&1; exec bash" \; \
  split-pane -H -s 0.5 -d "$PROJECT_DIR" --title "🧪 Tests" -- bash -c "echo '=== Dashboard & Shell Tests ==='; node --test tests/dashboard*.test.mjs tests/shell*.test.mjs 2>&1; echo; echo '--- Done ---'; exec bash" \; \
  split-pane -V -s 0.5 -d "$PROJECT_DIR" --title "🤖 Gemini" -- bash -c "echo '=== Gemini Consilium ==='; gemini -p \"$CONSILIUM_PROMPT\" 2>&1; echo; echo '--- Done ---'; exec bash" \; \
  move-focus -d left \; \
  split-pane -V -s 0.5 -d "$PROJECT_DIR" --title "📦 Codex" -- bash -c "echo '=== Codex Consilium ==='; codex exec --ephemeral --skip-git-repo-check \"$CONSILIUM_PROMPT\" 2>&1; echo; echo '--- Done ---'; exec bash"

echo "Windows Terminal launched with 4 panes:"
echo "  Top-left:     Dev Server (npm run dev)"
echo "  Top-right:    Codex CLI consilium"
echo "  Bottom-left:  Tests (dashboard + shell)"
echo "  Bottom-right: Gemini CLI consilium"
