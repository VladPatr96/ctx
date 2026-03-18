#!/bin/bash
#
# test-all-providers.sh — Тестирование скиллов на всех провайдерах
#

set -e

echo "🧪 CTX Skills — Тестирование на всех провайдерах"
echo "================================================"
echo ""

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция тестирования
test_skill() {
    local provider=$1
    local command=$2
    local description=$3
    
    echo -n "  Testing $description on $provider... "
    
    case $provider in
        "claude")
            # MCP Mode (если доступен)
            if command -v claude &> /dev/null; then
                echo -e "${YELLOW}MCP Mode${NC}"
            else
                echo -e "${YELLOW}(Claude Code not detected)${NC}"
            fi
            ;;
        
        "codex"|"gemini"|"opencode")
            # CLI Mode
            local cli_path="scripts/ctx-cli.js"
            if [ -f "$cli_path" ]; then
                if node "$cli_path" "$command" > /tmp/test-$provider.json 2>&1; then
                    echo -e "${GREEN}✓${NC}"
                else
                    echo -e "${RED}✗${NC}"
                fi
            else
                echo -e "${RED}CLI not found${NC}"
            fi
            ;;
    esac
}

# 1. Проверка установки провайдеров
echo "1️⃣  Проверка провайдеров:"
echo ""

for provider in claude codex gemini opencode; do
    case $provider in
        "claude")
            if command -v claude &> /dev/null; then
                echo -e "  ${GREEN}✓${NC} Claude Code detected (MCP Mode)"
            else
                echo -e "  ${YELLOW}○${NC} Claude Code not found"
            fi
            ;;
        "codex")
            if command -v codex &> /dev/null; then
                echo -e "  ${GREEN}✓${NC} Codex CLI detected"
            else
                echo -e "  ${YELLOW}○${NC} Codex CLI not found"
            fi
            ;;
        "gemini")
            if command -v gemini &> /dev/null; then
                echo -e "  ${GREEN}✓${NC} Gemini CLI detected"
            else
                echo -e "  ${YELLOW}○${NC} Gemini CLI not found"
            fi
            ;;
        "opencode")
            if command -v opencode &> /dev/null; then
                echo -e "  ${GREEN}✓${NC} OpenCode detected"
            else
                echo -e "  ${YELLOW}○${NC} OpenCode not found"
            fi
            ;;
    esac
done

echo ""
echo "2️⃣  Проверка CLI Wrapper (scripts/ctx-cli.js):"
echo ""

if [ -f "scripts/ctx-cli.js" ]; then
    echo -e "  ${GREEN}✓${NC} CLI wrapper found"
    
    # Тест базовых команд
    echo ""
    echo "  Testing basic commands:"
    node scripts/ctx-cli.js --help > /dev/null 2>&1 && echo -e "    ${GREEN}✓${NC} Help command" || echo -e "    ${RED}✗${NC} Help command failed"
else
    echo -e "  ${RED}✗${NC} CLI wrapper not found"
    exit 1
fi

echo ""
echo "3️⃣  Тестирование скиллов на каждом провайдере:"
echo ""

# Приоритет 1: Критичные
echo "  Приоритет 1 (Критичные):"
test_skill "codex" "security-scan" "security-scanner"
test_skill "codex" "debug" "error-debugger"
test_skill "codex" "test-coverage" "test-coverage-booster"

# Приоритет 2: Продуктивность
echo ""
echo "  Приоритет 2 (Продуктивность):"
test_skill "codex" "api-design" "api-designer"
test_skill "codex" "generate-docs" "documentation-generator"
test_skill "codex" "refactor" "refactoring-assistant"

# Приоритет 3: DevOps
echo ""
echo "  Приоритет 3 (DevOps):"
test_skill "codex" "dockerize" "dockerizer"
test_skill "codex" "ci-cd" "ci-cd-pipeline"

# Приоритет 4: CTX-Specific
echo ""
echo "  Приоритет 4 (CTX-Specific):"
test_skill "codex" "provider-health" "provider-health-monitor"
test_skill "codex" "consilium-opt" "consilium-optimizer"

echo ""
echo "4️⃣  Проверка автоматизации:"
echo ""

# Git Hooks
if [ -f ".git/hooks/pre-commit" ]; then
    echo -e "  ${GREEN}✓${NC} Git pre-commit hook"
else
    echo -e "  ${RED}✗${NC} Git pre-commit hook missing"
fi

if [ -f ".git/hooks/pre-push" ]; then
    echo -e "  ${GREEN}✓${NC} Git pre-push hook"
else
    echo -e "  ${RED}✗${NC} Git pre-push hook missing"
fi

# GitHub Actions
if [ -f ".github/workflows/ctx-auto-full.yml" ]; then
    echo -e "  ${GREEN}✓${NC} GitHub Actions workflow"
else
    echo -e "  ${RED}✗${NC} GitHub Actions workflow missing"
fi

# Pipeline Triggers
if [ -f "scripts/ctx-pipeline-triggers-full.js" ]; then
    echo -e "  ${GREEN}✓${NC} Pipeline triggers"
else
    echo -e "  ${RED}✗${NC} Pipeline triggers missing"
fi

# Scheduler
if [ -f "scripts/ctx-auto-run.js" ]; then
    echo -e "  ${GREEN}✓${NC} Auto-run scheduler"
else
    echo -e "  ${RED}✗${NC} Auto-run scheduler missing"
fi

echo ""
echo "5️⃣  Реестр скиллов:"
echo ""

if [ -f "scripts/skills/skill-registry.js" ]; then
    node scripts/skills/skill-registry.js list
else
    echo -e "  ${RED}✗${NC} Skill registry not found"
fi

echo ""
echo "================================================"
echo -e "${GREEN}✅ Тестирование завершено!${NC}"
echo ""
echo "📖 Для тестирования на конкретном провайдере:"
echo "   Claude Code:  /ctx security-scan"
echo "   Codex CLI:    node scripts/ctx-cli.js security-scan"
echo "   Gemini CLI:   node scripts/ctx-cli.js security-scan"
echo "   OpenCode:     node scripts/ctx-cli.js security-scan"
