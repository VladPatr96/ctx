param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CodexArgs
)

$ErrorActionPreference = 'Stop'

$env:CODEX_HOME = 'C:\Users\user\.codex-mcp'

if (-not (Test-Path $env:CODEX_HOME)) {
  throw "CODEX_HOME '$env:CODEX_HOME' not found. Run the MCP bootstrap setup first."
}

& codex @CodexArgs
$exitCode = $LASTEXITCODE
if ($null -ne $exitCode) {
  exit $exitCode
}
