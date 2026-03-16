/**
 * Chat Server — HTTP + SSE сервер для межагентного общения.
 *
 * Endpoints:
 *   POST /chat/post     — отправить сообщение { role, agent, type, text, target? }
 *   GET  /chat/stream   — SSE подписка на все сообщения
 *   GET  /chat/history  — последние N сообщений (?count=20)
 *   GET  /chat/ping     — статус { clients, messages }
 */

import http from 'node:http';

export function createChatServer() {
  const messages = [];
  const sseClients = new Set();
  const agents = new Map(); // agentId → { id, provider, connectedAt, lastSeen, status }
  let server = null;
  let onAgentChange = null; // callback for agent status changes

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const res of sseClients) {
      try {
        res.write(`event: message\ndata: ${data}\n\n`);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  function handlePost(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        msg.ts = Date.now();
        msg.id = messages.length;
        messages.push(msg);
        broadcast(msg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: msg.id }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
  }

  function handleStream(_req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseClients.add(res);

    res.on('close', () => sseClients.delete(res));
  }

  function handleHistory(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const count = Math.min(parseInt(url.searchParams.get('count') || '20', 10), 500);
    const typeFilter = url.searchParams.get('type');
    const roleFilter = url.searchParams.get('role');
    const sinceFilter = url.searchParams.get('since');

    let filtered = messages;
    if (typeFilter) filtered = filtered.filter(m => m.type === typeFilter);
    if (roleFilter) filtered = filtered.filter(m => m.role === roleFilter);
    if (sinceFilter) {
      const ts = parseInt(sinceFilter, 10);
      if (!isNaN(ts)) filtered = filtered.filter(m => m.ts > ts);
    }

    const slice = filtered.slice(-count);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: filtered.length, messages: slice }));
  }

  function handlePing(_req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      clients: sseClients.size,
      messages: messages.length,
      uptime: process.uptime(),
    }));
  }

  function handleConnect(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const agentId = data.agentId || data.provider || 'unknown';
        const alreadyConnected = agents.has(agentId);

        if (alreadyConnected) {
          // Дедупликация: обновляем lastSeen, не спамим повторным "подключился"
          const existing = agents.get(agentId);
          existing.lastSeen = Date.now();
          existing.status = 'connected';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, agentId, reconnect: true, agents: agentList() }));
          return;
        }

        const entry = {
          id: agentId,
          provider: data.provider || agentId,
          name: data.name || agentId,
          connectedAt: Date.now(),
          lastSeen: Date.now(),
          status: 'connected',
        };
        agents.set(agentId, entry);

        // Broadcast agent connection as system message
        const sysMsg = {
          role: 'system',
          agent: 'ChatServer',
          type: 'agent_connected',
          text: `${entry.name} подключился к сессии`,
          agentId,
          ts: Date.now(),
          id: messages.length,
        };
        messages.push(sysMsg);
        broadcast(sysMsg);

        if (onAgentChange) onAgentChange('connected', entry);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, agentId, agents: agentList() }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
  }

  function handleHeartbeat(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const agentId = data.agentId || 'unknown';
        const agent = agents.get(agentId);
        if (agent) {
          agent.lastSeen = Date.now();
          agent.status = data.status || 'active';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      }
    });
  }

  function agentList() {
    const now = Date.now();
    return Array.from(agents.values()).map(a => ({
      ...a,
      alive: (now - a.lastSeen) < 60000, // считаем живым, если heartbeat < 60s
    }));
  }

  function handleAgents(_req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents: agentList() }));
  }

  function handleCors(_req, res) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
  }

  function requestHandler(req, res) {
    // CORS preflight
    if (req.method === 'OPTIONS') return handleCors(req, res);

    const path = req.url?.split('?')[0];

    if (req.method === 'POST' && path === '/chat/post') return handlePost(req, res);
    if (req.method === 'POST' && path === '/chat/connect') return handleConnect(req, res);
    if (req.method === 'POST' && path === '/chat/heartbeat') return handleHeartbeat(req, res);
    if (req.method === 'GET' && path === '/chat/agents') return handleAgents(req, res);
    if (req.method === 'GET' && path === '/chat/stream') return handleStream(req, res);
    if (req.method === 'GET' && path === '/chat/history') return handleHistory(req, res);
    if (req.method === 'GET' && path === '/chat/ping') return handlePing(req, res);

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  return {
    async start(port = 0) {
      return new Promise((resolve, reject) => {
        server = http.createServer(requestHandler);
        server.listen(port, '127.0.0.1', () => {
          const addr = server.address();
          resolve(addr.port);
        });
        server.on('error', reject);
      });
    },

    async stop() {
      // Close all SSE connections
      for (const res of sseClients) {
        try { res.end(); } catch { /* ignore */ }
      }
      sseClients.clear();

      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
      });
    },

    getMessages() { return messages; },
    getClientCount() { return sseClients.size; },
    getAgents() { return agentList(); },
    onAgentChange(cb) { onAgentChange = cb; },
  };
}
