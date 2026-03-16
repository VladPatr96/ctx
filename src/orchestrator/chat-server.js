/**
 * Chat Server — центральный HTTP-сервер для межагентного общения.
 *
 * Все агенты (через MCP tools) и основной экран подключаются к одному серверу.
 * Сообщения доставляются в реальном времени через SSE (Server-Sent Events).
 *
 * API:
 *   POST /chat/post          — отправить сообщение
 *   GET  /chat/history       — получить историю (?count=50&role=...&type=...)
 *   GET  /chat/stream        — SSE поток (live updates)
 *   POST /chat/team          — зарегистрировать команду
 *   GET  /chat/team          — получить состав команды
 *   GET  /chat/ping          — health check
 */

import http from 'node:http';

export function createChatServer() {
  const messages = [];
  const team = [];
  const sseClients = new Set();
  let nextId = 1;

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch { sseClients.delete(res); }
    }
  }

  function addMessage(msg) {
    const entry = {
      id: nextId++,
      ts: new Date().toISOString(),
      role: msg.role || 'system',
      agent: msg.agent || null,
      type: msg.type || 'system',
      text: msg.text || '',
      target: msg.target || null,
    };
    messages.push(entry);
    if (messages.length > 500) messages.shift();
    broadcast('message', entry);
    return entry;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 50000) reject(new Error('Too large')); });
      req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // POST /chat/post
      if (req.method === 'POST' && url.pathname === '/chat/post') {
        const data = await readBody(req);
        const entry = addMessage(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entry));
        return;
      }

      // GET /chat/history
      if (req.method === 'GET' && url.pathname === '/chat/history') {
        const count = parseInt(url.searchParams.get('count') || '50', 10);
        const role = url.searchParams.get('role');
        const type = url.searchParams.get('type');

        let filtered = messages;
        if (role) filtered = filtered.filter(m => m.role === role);
        if (type) filtered = filtered.filter(m => m.type === type);

        const result = filtered.slice(-Math.min(count, 200));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: result.length, messages: result }));
        return;
      }

      // GET /chat/stream — SSE
      if (req.method === 'GET' && url.pathname === '/chat/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(': connected\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));

        // Keep-alive every 30s
        const keepAlive = setInterval(() => {
          try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); sseClients.delete(res); }
        }, 30000);
        req.on('close', () => clearInterval(keepAlive));
        return;
      }

      // POST /chat/team
      if (req.method === 'POST' && url.pathname === '/chat/team') {
        const data = await readBody(req);
        if (data.members && Array.isArray(data.members)) {
          team.length = 0;
          team.push(...data.members);
          broadcast('team', { members: team });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ members: team }));
        return;
      }

      // GET /chat/team
      if (req.method === 'GET' && url.pathname === '/chat/team') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ members: team, messageCount: messages.length }));
        return;
      }

      // GET /chat/ping
      if (req.method === 'GET' && url.pathname === '/chat/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, clients: sseClients.size, messages: messages.length }));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  return {
    server,
    addMessage,
    getMessages: (count = 50) => messages.slice(-count),
    getTeam: () => [...team],
    sseClientCount: () => sseClients.size,

    start(port = 0) {
      return new Promise((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => {
          const assignedPort = server.address().port;
          resolve(assignedPort);
        });
        server.on('error', reject);
      });
    },

    stop() {
      for (const client of sseClients) {
        try { client.end(); } catch { /* ignore */ }
      }
      sseClients.clear();
      return new Promise(resolve => server.close(resolve));
    },
  };
}
