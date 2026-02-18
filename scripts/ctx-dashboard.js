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
import { refreshAllData, startWatchers, createRouter, broadcast, initAuthToken } from './dashboard-backend.js';
import { buildHtml } from './dashboard-frontend.js';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 7331;

// Parse CLI args
const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1]) : DEFAULT_PORT;

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' }).unref();
}

function main() {
  const token = initAuthToken();
  refreshAllData();
  startWatchers(broadcast);

  const router = createRouter(buildHtml, token);
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
    console.log(`Auth token → ${token}`);
    console.log(`Token file → .data/.dashboard-token`);
    if (!noOpen) openBrowser(url);
  });

  process.on('SIGINT', () => { server.close(); process.exit(0); });
  process.on('SIGTERM', () => { server.close(); process.exit(0); });
}

main();
