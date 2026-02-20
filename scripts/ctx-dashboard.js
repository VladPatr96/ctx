#!/usr/bin/env node

/**
 * CTX Dashboard — Real-time web dashboard for CTX pipeline
 *
 * Usage: node scripts/ctx-dashboard.js [--no-open] [--port=7331]
 *
 * Zero dependencies — uses only Node.js stdlib.
 * Frontend by Claude, Backend by Gemini, Integration by Opus.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { refreshAllData, startWatchers, createRouter, broadcast, initAuthToken } from './dashboard-backend.js';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 7331;
let buildHtmlFn = null;

// Parse CLI args
const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const legacyHtml = args.includes('--legacy-html') || process.env.CTX_DASHBOARD_LEGACY === '1';
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1]) : DEFAULT_PORT;
const STATIC_DIST = resolve(process.cwd(), 'ctx-app', 'dist');

function detectStaticDir() {
  if (legacyHtml) return null;
  const indexFile = join(STATIC_DIST, 'index.html');
  return existsSync(indexFile) ? STATIC_DIST : null;
}

async function loadFrontend() {
  const mod = await import(`./dashboard-frontend.js?t=${Date.now()}`);
  if (typeof mod.buildHtml !== 'function') {
    throw new Error('dashboard-frontend.js must export buildHtml(token)');
  }
  buildHtmlFn = mod.buildHtml;
}

export async function reloadFrontend() {
  await loadFrontend();
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  const token = initAuthToken();
  const staticDir = detectStaticDir();
  if (!staticDir) {
    await loadFrontend();
  } else {
    buildHtmlFn = () => '<!doctype html><html><body>Static mode enabled</body></html>';
  }
  refreshAllData();
  startWatchers(broadcast, staticDir ? null : reloadFrontend);

  const router = createRouter((t) => buildHtmlFn(t), token, { staticDir });
  const server = http.createServer((req, res) => {
    Promise.resolve(router(req, res)).catch(err => {
      console.error('Router error:', err);
      if (!res.headersSent) { res.writeHead(500); res.end('Internal Server Error'); }
    });
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Use --port=XXXX to specify another.`);
      process.exit(1);
    }
    console.error('Server error:', e.message);
  });

  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`CTX Dashboard → ${url}`);
    console.log(`UI mode → ${staticDir ? `static (${staticDir})` : 'legacy-html'}`);
    console.log(`Auth token → ${token}`);
    console.log(`Token file → .data/.dashboard-token`);
    console.log(`Storage health → ${url}/storage-health`);
    console.log('Rollback toggles → CTX_STORAGE, CTX_SQLITE_FALLBACK_JSON');
    if (!noOpen) openBrowser(url);
  });

  process.on('SIGINT', () => { server.close(); process.exit(0); });
  process.on('SIGTERM', () => { server.close(); process.exit(0); });
}

main().catch(err => {
  console.error('Failed to start dashboard:', err.message);
  process.exit(1);
});
