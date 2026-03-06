import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { listAllowlistedCommands, parseAllowlistedCommand } from './terminal-allowlist.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
const DASHBOARD_BASE_URL = process.env.CTX_DASHBOARD_URL || 'http://127.0.0.1:7331'
const DASHBOARD_TOKEN_FILE = process.env.CTX_DASHBOARD_TOKEN_FILE || path.join(process.cwd(), '.data', '.dashboard-token')
const TERMINAL_TIMEOUT_MS = 60000
const TERMINAL_MAX_OUTPUT = 64 * 1024

interface TerminalResult {
  ok: boolean
  command: string
  stdout: string
  stderr: string
  code: number
  durationMs: number
  error?: string
}

function readDashboardToken() {
  if (process.env.CTX_DASHBOARD_TOKEN) return process.env.CTX_DASHBOARD_TOKEN
  try {
    if (!existsSync(DASHBOARD_TOKEN_FILE)) return ''
    return readFileSync(DASHBOARD_TOKEN_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

function resolveDashboardUrl(route: string) {
  const base = DASHBOARD_BASE_URL.endsWith('/') ? DASHBOARD_BASE_URL.slice(0, -1) : DASHBOARD_BASE_URL
  return `${base}${route.startsWith('/') ? route : `/${route}`}`
}

async function fetchDashboardJson(route: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {})
  const token = readDashboardToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(resolveDashboardUrl(route), {
    ...init,
    headers
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || `${response.status} ${response.statusText}`)
  }
  return payload
}

function pushChunk(current: string, chunk: string) {
  if (!chunk) return current
  const joined = current + chunk
  if (joined.length <= TERMINAL_MAX_OUTPUT) return joined
  return joined.slice(joined.length - TERMINAL_MAX_OUTPUT)
}

function runAllowlistedCommand(commandLine: string): Promise<TerminalResult> {
  const startedAt = Date.now()
  let parsed: ReturnType<typeof parseAllowlistedCommand>
  try {
    parsed = parseAllowlistedCommand(commandLine, process.platform)
  } catch (err) {
    return Promise.resolve({
      ok: false,
      command: commandLine.trim(),
      stdout: '',
      stderr: '',
      code: -1,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err)
    })
  }

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let finished = false
    let timedOut = false
    const child = spawn(parsed.bin, parsed.args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true
    })

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, TERMINAL_TIMEOUT_MS)

    const done = (result: TerminalResult) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      resolve(result)
    }

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout = pushChunk(stdout, chunk.toString())
    })
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr = pushChunk(stderr, chunk.toString())
    })

    child.on('error', (err) => {
      done({
        ok: false,
        command: parsed.normalized,
        stdout,
        stderr,
        code: -1,
        durationMs: Date.now() - startedAt,
        error: err.message
      })
    })

    child.on('close', (code) => {
      const exitCode = Number.isInteger(code) ? Number(code) : 1
      const ok = exitCode === 0 && !timedOut
      const timeoutText = timedOut ? '\n[terminated: timeout]' : ''
      done({
        ok,
        command: parsed.normalized,
        stdout,
        stderr: `${stderr}${timeoutText}`.trim(),
        code: timedOut ? 124 : exitCode,
        durationMs: Date.now() - startedAt,
        error: ok ? undefined : (timedOut ? 'command timeout' : 'command failed')
      })
    })
  })
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d0d0f',
      symbolColor: '#56565f',
      height: 32
    }
  })

  // Open DevTools in development
  if (VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools()
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date()).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    const token = readDashboardToken()
    const sep = VITE_DEV_SERVER_URL.includes('?') ? '&' : '?'
    const url = token ? `${VITE_DEV_SERVER_URL}${sep}token=${encodeURIComponent(token)}` : VITE_DEV_SERVER_URL
    win.loadURL(url)
  } else {
    const token = readDashboardToken()
    if (token) {
      win.loadURL(`file://${path.join(RENDERER_DIST, 'index.html')}?token=${encodeURIComponent(token)}`)
    } else {
      win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)

// IPC Handlers
ipcMain.handle('get-env', () => ({
  platform: process.platform,
  version: app.getVersion(),
}))

// Terminal-only IPC (API calls now go through HTTP directly from renderer)
ipcMain.handle('ctx-terminal:get-allowlist', () =>
  listAllowlistedCommands()
)
ipcMain.handle('ctx-terminal:run', async (_event, command: string) => runAllowlistedCommand(command))
