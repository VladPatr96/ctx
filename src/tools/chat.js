/**
 * Chat domain tools: team chat room for inter-agent communication.
 *
 * Dual mode:
 * - CTX_CHAT_URL set → HTTP client (shared chat server, live across all agents)
 * - CTX_CHAT_URL not set → in-process ChatRoom (single agent, local only)
 *
 * Tools (3):
 * - ctx_chat_post    — post a message to the team chat (visible to all agents)
 * - ctx_chat_history — read recent chat history
 * - ctx_chat_team    — show team roster / register team members
 */

import { z } from 'zod';
import { createChatRoom } from '../ui/team-chat.js';

const CHAT_URL = process.env.CTX_CHAT_URL || '';
const AGENT_ID = process.env.CTX_AGENT_ID || '';
const AGENT_NAME = process.env.CTX_AGENT_NAME || '';
let heartbeatInterval = null;

// ==================== HTTP client (shared server mode) ====================

async function httpPost(path, data) {
  const resp = await fetch(`${CHAT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });
  return resp.json();
}

async function httpGet(path) {
  const resp = await fetch(`${CHAT_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  return resp.json();
}

// ==================== In-process fallback ====================

let defaultRoom = null;

export function getDefaultChatRoom() {
  if (!defaultRoom) {
    defaultRoom = createChatRoom({ autoScroll: true });
  }
  return defaultRoom;
}

export function resetChatRoom() {
  if (defaultRoom) defaultRoom.clear();
  defaultRoom = null;
}

// ==================== Tool registration ====================

export function registerChatTools(server) {

  server.registerTool(
    'ctx_chat_post',
    {
      description: 'Отправить сообщение в командный чат. Видно всем агентам в реальном времени. Используйте для обмена мнениями, делегирования задач, отчётов и синтеза.',
      inputSchema: z.object({
        role: z.string().describe('Роль агента: lead, architect, reviewer, tester, researcher, implementer, claude, gemini, codex, opencode'),
        agent: z.string().optional().describe('Имя агента (например "SecurityBot", "DesignAI")'),
        type: z.enum(['opinion', 'delegation', 'report', 'synthesis', 'question', 'agreement', 'disagreement', 'progress', 'done', 'error', 'system'])
          .describe('Тип сообщения'),
        text: z.string().max(10000).describe('Текст сообщения'),
        target: z.string().optional().describe('Для delegation: целевая роль/агент'),
      }).shape,
    },
    async ({ role, agent, type, text, target }) => {
      // HTTP mode — shared server
      if (CHAT_URL) {
        try {
          const entry = await httpPost('/chat/post', { role, agent, type, text, target });
          return {
            content: [{ type: 'text', text: JSON.stringify(entry, null, 2) }]
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Chat server error: ${err.message}. URL: ${CHAT_URL}` }],
            isError: true,
          };
        }
      }

      // In-process fallback
      const room = getDefaultChatRoom();
      let entry;
      switch (type) {
        case 'delegation':  entry = room.postDelegation(role, agent, text, target); break;
        case 'synthesis':   entry = room.postSynthesis(role, agent, text); break;
        case 'done':        entry = room.postDone(role, agent, text); break;
        case 'error':       entry = room.postError(role, agent, text); break;
        case 'progress':    entry = room.postProgress(role, agent, text); break;
        case 'question':    entry = room.postQuestion(role, agent, text); break;
        case 'agreement':   entry = room.postAgreement(role, agent, text); break;
        case 'disagreement': entry = room.postDisagreement(role, agent, text); break;
        case 'opinion':     entry = room.postOpinion(role, agent, text); break;
        default:            entry = room.post({ role, agent, type, text }); break;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(entry, null, 2) }]
      };
    }
  );

  server.registerTool(
    'ctx_chat_history',
    {
      description: 'Прочитать историю командного чата. Используйте для контекста при подключении к обсуждению. Возвращает последние сообщения с ролями и типами.',
      inputSchema: z.object({
        count: z.number().int().min(1).max(200).optional()
          .describe('Количество сообщений (по умолчанию 50)'),
        role: z.string().optional().describe('Фильтр по роли'),
        type: z.string().optional().describe('Фильтр по типу сообщения'),
      }).shape,
    },
    async ({ count, role, type }) => {
      // HTTP mode
      if (CHAT_URL) {
        try {
          const params = new URLSearchParams();
          if (count) params.set('count', String(count));
          if (role) params.set('role', role);
          if (type) params.set('type', type);
          const qs = params.toString();
          const result = await httpGet(`/chat/history${qs ? '?' + qs : ''}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Chat server error: ${err.message}` }],
            isError: true,
          };
        }
      }

      // In-process fallback
      const room = getDefaultChatRoom();
      let msgs;
      if (role) {
        msgs = room.getHistoryByRole(role, count || 50);
      } else if (type) {
        msgs = room.getHistoryByType(type, count || 50);
      } else {
        msgs = room.getHistory(count || 50);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({
          total: msgs.length,
          messages: msgs,
        }, null, 2) }]
      };
    }
  );

  // ==================== Auto-announce ====================
  // При наличии CTX_CHAT_URL + CTX_AGENT_ID — автоматически регистрируемся на chat server
  if (CHAT_URL && AGENT_ID) {
    (async () => {
      try {
        await fetch(`${CHAT_URL}/chat/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: AGENT_ID,
            provider: AGENT_ID,
            name: AGENT_NAME || AGENT_ID,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Chat server may not be ready yet — silent fail
      }

      // Heartbeat every 30s
      heartbeatInterval = setInterval(async () => {
        try {
          await fetch(`${CHAT_URL}/chat/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: AGENT_ID, status: 'active' }),
            signal: AbortSignal.timeout(3000),
          });
        } catch { /* silent */ }
      }, 30000);

      // Cleanup on exit
      if (heartbeatInterval?.unref) heartbeatInterval.unref();
    })();
  }

  // ==================== Poll for tasks (idle mode) ====================

  server.registerTool(
    'ctx_chat_poll',
    {
      description: 'Проверить новые задачи, назначенные этому агенту. Используй в idle-режиме для получения делегированных задач. Возвращает delegation-сообщения, адресованные тебе или всем агентам.',
      inputSchema: z.object({
        since: z.number().optional().describe('Timestamp (ms) — показать только сообщения после этого момента'),
      }).shape,
    },
    async ({ since }) => {
      if (!CHAT_URL) {
        return {
          content: [{ type: 'text', text: 'No chat server (CTX_CHAT_URL not set). Poll unavailable.' }],
        };
      }

      try {
        const params = new URLSearchParams({ count: '50', type: 'delegation' });
        const result = await httpGet(`/chat/history?${params}`);

        // Фильтруем: только задачи для нас или для всех
        let tasks = (result.messages || []).filter(m => {
          if (!m.target) return true; // broadcast
          const t = m.target.toLowerCase();
          return t === AGENT_ID.toLowerCase()
            || t === 'все агенты'
            || t === 'all'
            || t === '*';
        });

        // Фильтр по времени
        if (since) {
          tasks = tasks.filter(m => m.ts > since);
        }

        if (tasks.length === 0) {
          return {
            content: [{ type: 'text', text: 'Нет новых задач. Продолжай ждать.' }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({
            newTasks: tasks.length,
            tasks,
            hint: 'Выполни последнюю задачу. После выполнения отправь результат через ctx_chat_post (type=done).',
          }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Poll error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'ctx_chat_team',
    {
      description: 'Показать или зарегистрировать состав команды в чате.',
      inputSchema: z.object({
        members: z.array(z.object({
          name: z.string().describe('Имя агента'),
          role: z.string().describe('Роль (lead, architect, reviewer, tester, etc.)'),
          provider: z.string().optional().describe('CLI провайдер (claude, gemini, codex, opencode)'),
        })).optional().describe('Состав команды (если не указан — показать текущий)'),
      }).shape,
    },
    async ({ members }) => {
      // HTTP mode
      if (CHAT_URL) {
        try {
          if (members && members.length > 0) {
            const result = await httpPost('/chat/team', { members });
            return {
              content: [{ type: 'text', text: `Team registered: ${members.map(m => m.name).join(', ')}` }]
            };
          }
          const result = await httpGet('/chat/team');
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Chat server error: ${err.message}` }],
            isError: true,
          };
        }
      }

      // In-process fallback
      const room = getDefaultChatRoom();
      if (members && members.length > 0) {
        room.showTeam(members);
        return {
          content: [{ type: 'text', text: `Team registered: ${members.map(m => m.name).join(', ')}` }]
        };
      }
      const history = room.toJSON();
      return {
        content: [{ type: 'text', text: JSON.stringify({
          members: history.members,
          messageCount: history.messageCount,
        }, null, 2) }]
      };
    }
  );
}
