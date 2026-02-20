import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once, EventEmitter } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { broadcast, createRouter, sseConnect, state } from '../scripts/dashboard-backend.js';

const TOKEN = 'test-dashboard-token';

async function withServer(run) {
  const router = createRouter(() => '<html><body>ok</body></html>', TOKEN);
  const server = http.createServer((req, res) => {
    Promise.resolve(router(req, res)).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: error?.message || 'router_error' }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/state rejects unauthorized and allows authorized', async () => {
  await withServer(async (base) => {
    const unauthorized = await fetch(`${base}/api/state`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${base}/api/state?token=${TOKEN}`);
    assert.equal(authorized.status, 200);
    const payload = await authorized.json();
    assert.equal(typeof payload.pipeline, 'object');
  });
});

test('KB save/search routes work with token auth', async () => {
  const kbDir = mkdtempSync(join(tmpdir(), 'ctx-kb-http-'));
  process.env.CTX_KB_PATH = join(kbDir, 'knowledge.sqlite');
  delete process.env.CTX_KB_DISABLED;

  await withServer(async (base) => {
    const saveResponse = await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-test',
        category: 'solution',
        title: 'KB HTTP smoke',
        body: 'KB endpoint should save and return searchable content'
      })
    });

    assert.equal(saveResponse.status, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.ok, true);

    const searchResponse = await fetch(`${base}/api/kb/search?q=searchable&token=${TOKEN}`);
    assert.equal(searchResponse.status, 200);
    const search = await searchResponse.json();
    assert.ok(Array.isArray(search.entries));
    assert.ok(search.entries.length >= 1);
  });
});

test('SSE connect sends retry and replays events after Last-Event-Id', () => {
  const before = state.lastEventId;
  broadcast('log', { seq: 'a' });
  broadcast('log', { seq: 'b' });

  const req = new EventEmitter();
  req.headers = { 'last-event-id': String(before + 1) };

  const writes = [];
  const res = {
    writeHead() {},
    write(chunk) {
      writes.push(String(chunk));
      return true;
    }
  };

  sseConnect(req, res, () => ({ snapshot: true }), new URL('http://localhost/events'));
  req.emit('close');

  const payload = writes.join('');
  assert.match(payload, /retry: 3000/);
  assert.match(payload, /"seq":"b"/);
  assert.doesNotMatch(payload, /"snapshot":true/);
});

test('router serves static dist index when staticDir is configured', async () => {
  const staticDir = mkdtempSync(join(tmpdir(), 'ctx-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html><body>static-ok</body></html>', 'utf8');
  writeFileSync(join(staticDir, 'manifest.webmanifest'), '{"name":"ctx"}', 'utf8');

  const router = createRouter(() => '<html><body>legacy</body></html>', TOKEN, { staticDir });
  const server = http.createServer((req, res) => {
    Promise.resolve(router(req, res)).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: error?.message || 'router_error' }));
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const root = await fetch(`${base}/`);
    assert.equal(root.status, 200);
    const html = await root.text();
    assert.match(html, /static-ok/);

    const manifest = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    const text = await manifest.text();
    assert.match(text, /"name":"ctx"/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
