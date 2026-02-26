const TERMINAL_FORBIDDEN_RE = /[&;<>`]/

export const TERMINAL_ALLOWLIST = Object.freeze({
  node: [['-v'], ['--version']],
  npm: [['test'], ['run', 'test'], ['run', 'build']],
  git: [['status'], ['status', '--short'], ['branch', '--show-current']],
  powershell: [['-NoProfile', '-Command', '"Get-ChildItem .sessions/*.md | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content"']]
})

function normalizeBin(bin) {
  const normalized = String(bin || '').trim().toLowerCase()
  if (normalized === 'node.exe') return 'node'
  if (normalized === 'npm.cmd' || normalized === 'npm.exe') return 'npm'
  if (normalized === 'git.exe') return 'git'
  if (normalized === 'powershell.exe') return 'powershell'
  return normalized
}

export function listAllowlistedCommands() {
  return Object.entries(TERMINAL_ALLOWLIST)
    .flatMap(([bin, rules]) => rules.map((args) => `${bin} ${args.join(' ')}`.trim()))
}

export function parseAllowlistedCommand(commandLine, platform = process.platform) {
  const text = String(commandLine || '').trim()
  if (!text) throw new Error('command is empty')
  if (text.length > 256) throw new Error('command is too long')
  if (TERMINAL_FORBIDDEN_RE.test(text) || text.includes('\n') || text.includes('\r')) {
    throw new Error('command contains forbidden characters')
  }

  const tokens = text.match(/(?:[^\s"]+|"[^"]*")+/g)?.filter(Boolean) || []
  if (tokens.length === 0) throw new Error('command is empty')

  const bin = normalizeBin(tokens[0])
  const args = tokens.slice(1)
  const allowed = TERMINAL_ALLOWLIST[bin]
  if (!allowed) throw new Error(`command is not allowlisted: ${bin}`)

  const matches = allowed.some((rule) => rule.length === args.length && rule.every((part, index) => part === args[index]))
  if (!matches) throw new Error(`arguments are not allowlisted for ${bin}`)

  const execBin = platform === 'win32' && bin === 'npm' ? 'npm.cmd' : bin
  return { bin: execBin, args, normalized: `${bin} ${args.join(' ')}`.trim() }
}
