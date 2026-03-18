#!/bin/bash
# Claude Code statusline - enhanced default with git, context, and more
export LC_NUMERIC=C
input=$(cat)

# Extract values from JSON
model=$(echo "$input" | jq -r '.model.display_name // "?"')
current_dir=$(echo "$input" | jq -r '.workspace.current_dir // "."')
context_used=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
output_style=$(echo "$input" | jq -r '.output_style.name // "default"')
vim_mode=$(echo "$input" | jq -r '.vim.mode // ""')
agent_name=$(echo "$input" | jq -r '.agent.name // ""')

# Get basename of current directory
dir_basename=$(basename "$current_dir")

# Get git branch and dirty status (skip optional locks for performance)
cd "$current_dir" 2>/dev/null
git_branch=$(git --no-optional-locks symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ -n "$git_branch" ]; then
    # Check if repo is dirty
    if ! git --no-optional-locks diff --quiet 2>/dev/null || ! git --no-optional-locks diff --cached --quiet 2>/dev/null; then
        git_branch="${git_branch}*"  # Add asterisk for uncommitted changes
    fi
fi

# Helper function for context color
context_color() {
    local pct=$1
    if awk "BEGIN { exit !($pct < 50) }" 2>/dev/null; then
        echo "\033[32m"  # green
    elif awk "BEGIN { exit !($pct < 80) }" 2>/dev/null; then
        echo "\033[33m"  # yellow
    else
        echo "\033[31m"  # red
    fi
}

# Build status line with colors
status=""

# Agent indicator (if present)
if [ -n "$agent_name" ]; then
    status="\033[35m[${agent_name}]\033[0m "  # magenta agent name
fi

# Model name
status="${status}\033[36m${model}\033[0m"  # cyan model name

# Directory
if [ -n "$dir_basename" ]; then
    status="${status} | \033[34m${dir_basename}\033[0m"  # blue directory
fi

# Git branch
if [ -n "$git_branch" ]; then
    status="${status} | \033[2m${git_branch}\033[0m"  # dimmed branch
fi

# Context usage
if [ "$context_used" != "0" ] && [ "$context_used" != "null" ]; then
    context_fmt=$(printf "%.0f" "$context_used")
    color=$(context_color "$context_used")
    status="${status} | ${color}ctx: ${context_fmt}%\033[0m"
fi

# Output style (if not default)
if [ "$output_style" != "default" ] && [ -n "$output_style" ]; then
    status="${status} | \033[2m${output_style}\033[0m"  # dimmed style name
fi

# Vim mode indicator
if [ -n "$vim_mode" ]; then
    if [ "$vim_mode" = "NORMAL" ]; then
        status="${status} | \033[32m[N]\033[0m"  # green for NORMAL
    else
        status="${status} | \033[33m[I]\033[0m"  # yellow for INSERT
    fi
fi

printf '%b' "$status"
