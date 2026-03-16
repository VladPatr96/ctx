/**
 * Team Chat — диалоговое окно команды агентов.
 *
 * Реалтайм-чат в терминале, где видно как агенты общаются:
 * консилиум, делегирование, отчёты, синтез.
 *
 * Каждый агент имеет роль и цвет — выглядит как Slack-канал команды.
 */

import { EventEmitter } from 'node:events';
import {
  formatChatLine,
  formatSynthesisBox,
  formatSeparator,
  formatTeamRoster,
  formatDelegation,
} from './team-chat-format.js';
import { getRole } from './team-chat-roles.js';

// ==================== ChatRoom ====================

export function createChatRoom(options = {}) {
  const {
    output = process.stdout,
    maxHistory = 500,
    maxWidth = null, // auto-detect
    timestamps = true,
    autoScroll = true,
    sessionId = `chat-${Date.now()}`,
  } = options;

  return new ChatRoom({ output, maxHistory, maxWidth, timestamps, autoScroll, sessionId });
}

class ChatRoom extends EventEmitter {
  #messages = [];
  #output;
  #maxHistory;
  #nextId = 1;
  #opts;
  #members = [];
  #sessionId;

  constructor(opts) {
    super();
    this.#output = opts.output;
    this.#maxHistory = opts.maxHistory;
    this.#sessionId = opts.sessionId;
    this.#opts = opts;
  }

  // ==================== Core API ====================

  /**
   * Опубликовать сообщение в чат.
   * @param {object} msg - { role, agent?, type, text, metadata? }
   * @returns {object} enriched message with id, timestamp
   */
  post(msg) {
    const entry = {
      id: this.#nextId++,
      timestamp: new Date().toISOString(),
      role: msg.role || 'system',
      agent: msg.agent || '',
      type: msg.type || 'system',
      text: msg.text || '',
      metadata: msg.metadata || null,
    };

    this.#messages.push(entry);
    if (this.#messages.length > this.#maxHistory) {
      this.#messages.splice(0, this.#messages.length - this.#maxHistory);
    }

    if (this.#opts.autoScroll) {
      this.#render(entry);
    }

    this.emit('message', entry);
    return entry;
  }

  // ==================== Shorthand methods ====================

  postSystem(text) {
    return this.post({ role: 'system', type: 'system', text });
  }

  postOpinion(role, agent, text) {
    return this.post({ role, agent, type: 'opinion', text });
  }

  postDelegation(fromRole, fromAgent, task, targetRole) {
    return this.post({
      role: fromRole,
      agent: fromAgent,
      type: 'delegation',
      text: task,
      metadata: { target: targetRole, task },
    });
  }

  postReport(role, agent, text, status = 'done') {
    return this.post({
      role,
      agent,
      type: status === 'error' ? 'error' : 'report',
      text,
      metadata: { status },
    });
  }

  postProgress(role, agent, text, percent = null) {
    return this.post({
      role,
      agent,
      type: 'progress',
      text,
      metadata: percent !== null ? { percent } : null,
    });
  }

  postSynthesis(role, agent, text) {
    return this.post({ role, agent, type: 'synthesis', text });
  }

  postDone(role, agent, text) {
    return this.post({ role, agent, type: 'done', text });
  }

  postError(role, agent, text) {
    return this.post({ role, agent, type: 'error', text });
  }

  postQuestion(role, agent, text) {
    return this.post({ role, agent, type: 'question', text });
  }

  postAgreement(role, agent, text) {
    return this.post({ role, agent, type: 'agreement', text });
  }

  postDisagreement(role, agent, text) {
    return this.post({ role, agent, type: 'disagreement', text });
  }

  // ==================== Visual elements ====================

  separator(label) {
    const line = formatSeparator(label, this.#getFormatOpts());
    this.#write(line);
    this.emit('separator', label);
  }

  showTeam(members) {
    this.#members = members;
    const roster = formatTeamRoster(members);
    this.#write(roster);
    this.postSystem(`Команда собрана: ${members.map(m => m.name).join(', ')}`);
  }

  // ==================== History ====================

  getHistory(n = 50) {
    return this.#messages.slice(-n);
  }

  getHistoryByRole(role, n = 50) {
    return this.#messages.filter(m => m.role === role).slice(-n);
  }

  getHistoryByType(type, n = 50) {
    return this.#messages.filter(m => m.type === type).slice(-n);
  }

  // ==================== Serialization ====================

  toJSON() {
    return {
      sessionId: this.#sessionId,
      members: this.#members,
      messageCount: this.#messages.length,
      messages: this.#messages,
    };
  }

  // ==================== Stream control ====================

  setOutput(stream) {
    this.#output = stream;
  }

  replay(output) {
    const target = output || this.#output;
    for (const msg of this.#messages) {
      const line = this.#formatMessage(msg);
      target.write(line + '\n');
    }
  }

  clear() {
    this.#messages = [];
    this.#nextId = 1;
    this.emit('clear');
  }

  // ==================== Private ====================

  #getFormatOpts() {
    return {
      maxWidth: this.#opts.maxWidth || (this.#output.columns || 120),
    };
  }

  #formatMessage(entry) {
    const opts = this.#getFormatOpts();

    if (entry.type === 'synthesis') {
      return formatSynthesisBox(entry, opts);
    }

    if (entry.type === 'delegation') {
      return formatDelegation(entry);
    }

    return formatChatLine(entry, opts);
  }

  #render(entry) {
    const line = this.#formatMessage(entry);
    this.#write(line);
  }

  #write(text) {
    if (this.#output && this.#output.writable !== false) {
      this.#output.write(text + '\n');
    }
  }
}

export default createChatRoom;
