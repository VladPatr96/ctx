/**
 * Gemini CLI provider adapter.
 * gemini -p "prompt" -o text
 */

import { spawn } from 'node:child_process';
import { runCommand } from '../utils/shell.js';

export default {
  name: 'gemini',
  transport: 'mcp',
  models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
  capabilities: ['mcp', 'skills', 'extensions'],
  strengths: ['large_context', 'codebase_analysis', 'documentation', 'translation'],
  bestFor: {
    'large_context': 'Анализ больших файлов и кодовых баз (1M+ контекст)',
    'codebase_analysis': 'Полный аудит проекта, поиск паттернов',
    'documentation': 'Генерация документации из кода',
    'translation': 'Перевод и i18n (весь проект в контексте)'
  },

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    // Build command string with proper quoting to avoid Windows shell arg splitting.
    // spawn(cmdString, [], {shell:true}) passes the whole string to cmd.exe.
    const escaped = shellEscape(String(prompt));
    const modelFlag = opts.model ? ` --model ${normalizeModel(opts.model)}` : '';
    const cmd = `gemini -p "${escaped}" -o text${modelFlag}`;

    const result = await spawnShell(cmd, { timeout, cwd: opts.cwd || process.cwd() });

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('429') || msg.includes('CAPACITY')) {
        return { status: 'error', error: 'rate_limit', detail: buildDetail(result) || 'MODEL_CAPACITY_EXHAUSTED' };
      }
      return {
        status: 'error',
        error: msg || 'gemini_invoke_failed',
        detail: buildDetail(result)
      };
    }
    return { status: 'success', response: result.stdout };
  },

  async healthCheck() {
    const result = await runCommand('gemini', ['--version'], { timeout: 30000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'gemini CLI not found or timed out' };
  }
};

function normalizeModel(model) {
  const raw = String(model).trim();
  if (raw.startsWith('google/')) return raw.slice('google/'.length);
  return raw;
}

function spawnShell(cmd, opts = {}) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env);
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const child = spawn(cmd, [], {
      shell: true,
      cwd: opts.cwd || process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '', settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };

    const timer = setTimeout(() => {
      child.kill();
      done(stdout.trim()
        ? { success: true, stdout: stdout.trim(), stderr: stderr.trim() }
        : { success: false, error: 'timeout' });
    }, opts.timeout || 60000);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      done(code === 0 || code === null
        ? { success: true, stdout: stdout.trim(), stderr: stderr.trim() }
        : { success: false, error: (stderr || stdout || '').trim() || `Exit code ${code}` });
    });
    child.on('error', (err) => { clearTimeout(timer); done({ success: false, error: err.message }); });
  });
}

function shellEscape(str) {
  // Escape double quotes and backslashes for shell embedding in "..."
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

function buildDetail(result) {
  const raw = result.rawError || {};
  const detailParts = [
    typeof raw.stderr === 'string' ? raw.stderr.trim() : '',
    typeof raw.stdout === 'string' ? raw.stdout.trim() : ''
  ].filter(Boolean);
  return detailParts.join('\n').slice(0, 2000) || result.error || null;
}

