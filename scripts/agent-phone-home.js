#!/usr/bin/env node
/**
 * Agent Phone Home — лёгкий процесс для регистрации агента на Chat Server.
 * Работает для ВСЕХ провайдеров, включая те, что не поддерживают MCP.
 *
 * Env vars:
 *   CTX_CHAT_URL   — URL chat server (обязателен)
 *   CTX_AGENT_ID   — ID провайдера: claude, gemini, codex, opencode
 *   CTX_AGENT_NAME — человеко-читаемое имя
 *
 * Usage:
 *   node agent-phone-home.js          — connect + heartbeat loop (foreground)
 *   start /b node agent-phone-home.js — connect + heartbeat loop (background on Windows)
 */

const CHAT_URL = process.env.CTX_CHAT_URL;
const AGENT_ID = process.env.CTX_AGENT_ID || 'unknown';
const AGENT_NAME = process.env.CTX_AGENT_NAME || AGENT_ID;
const HEARTBEAT_MS = 25000; // 25s

if (!CHAT_URL) {
  process.exit(0);
}

async function connect() {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const resp = await fetch(`${CHAT_URL}/chat/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: AGENT_ID,
          provider: AGENT_ID,
          name: AGENT_NAME,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) return true;
    } catch {
      // Server may not be ready yet
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

async function heartbeat() {
  try {
    await fetch(`${CHAT_URL}/chat/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: AGENT_ID, status: 'active' }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* silent */ }
}

async function main() {
  const ok = await connect();
  if (!ok) process.exit(1);

  // Heartbeat loop — keeps running until parent process dies
  const interval = setInterval(heartbeat, HEARTBEAT_MS);
  interval.unref();

  // Stay alive but don't block parent from exiting
  process.stdin.resume();
  process.stdin.unref();
}

main();
