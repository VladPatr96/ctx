@echo off
echo Updating CTX skill...
node "C:\Users\Патраваев\projects\claude_ctx\.test-opencode-skills\update-ctx-skill.js"
if errorlevel 1 (
  echo Error updating CTX skill
  pause
  exit /b 1
)
echo CTX skill updated successfully
