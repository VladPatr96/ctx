@echo off
setlocal

set "PS_LAUNCHER=%~dp0codex-mcp.ps1"

if not exist "%PS_LAUNCHER%" (
  echo PowerShell launcher "%PS_LAUNCHER%" not found.
  exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%PS_LAUNCHER%" %*
exit /b %ERRORLEVEL%
