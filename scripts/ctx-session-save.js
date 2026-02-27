#!/usr/bin/env node

/**
 * ctx-session-save.js
 *
 * Сохраняет контекст сессии в GitHub Issues при компакте или завершении.
 * Гибридная запись: Issues проекта + центральный репо (my_claude_code).
 *
 * Вызывается из hooks: PreCompact, Stop
 * Usage: node ctx-session-save.js --event <compact|stop>
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { runCommandSync } from './utils/shell.js';

const DEFAULT_CENTRAL_REPO = 'VladPatr96/my_claude_code';
const LOCAL_KB_DIR = join(process.cwd(), '.data', 'knowledge');
const LOCAL_KB_JSON = join(LOCAL_KB_DIR, 'knowledge.json');

function getCentralRepo() {
  // 1. Env variable
  if (process.env.CTX_CENTRAL_REPO) return process.env.CTX_CENTRAL_REPO;

  // 2. Git config
  const gitConfig = exec('git', ['config', '--get', 'ctx.central-repo']);
  if (gitConfig) return gitConfig;

  // 3. Fallback
  return DEFAULT_CENTRAL_REPO;
}

const CENTRAL_REPO = getCentralRepo();

function exec(command, args = []) {
  const result = runCommandSync(command, args, { timeout: 15000 });
  return result.success ? result.stdout : '';
}

function getProjectName() {
  const toplevel = exec('git', ['rev-parse', '--show-toplevel']);
  if (toplevel) return basename(toplevel);

  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return basename(dir);
}

function getProjectRepo() {
  const remote = exec('git', ['remote', 'get-url', 'origin']);
  if (!remote) return null;

  // Extract owner/repo from git URL
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? match[1] : null;
}

function getGitContext() {
  const branch = exec('git', ['branch', '--show-current']);
  const diffStat = exec('git', ['diff', '--stat']);
  const log = exec('git', ['log', '-5', '--oneline']);
  const status = exec('git', ['status', '--short']);

  return { branch, diffStat, log, status };
}

function getLatestSessionLog() {
  const sessionsDir = join(process.cwd(), '.sessions');
  if (!existsSync(sessionsDir)) return null;

  const files = readdirSync(sessionsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  try {
    return readFileSync(join(sessionsDir, files[0]), 'utf-8');
  } catch {
    return null;
  }
}

function extractSections(log) {
  if (!log) return { actions: '', errors: '', decisions: '', files: '', tasks: '', summary: '' };

  const sections = {};
  const sectionNames = ['Actions', 'Errors & Solutions', 'Decisions', 'Files Modified', 'Tasks', 'Summary'];

  for (const name of sectionNames) {
    const regex = new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = log.match(regex);
    sections[name.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_')] = match ? match[1].trim() : '';
  }

  return sections;
}

function buildIssueBody(event, project, git, sections) {
  const now = new Date().toISOString();

  return `## Session ${event === 'compact' ? '(auto-compact)' : '(end)'}
**Date:** ${now}
**Project:** ${project}
**Branch:** ${git.branch || 'unknown'}
**Provider:** Claude Code
**Event:** ${event}

## What was done
${sections.actions || sections.summary || '_No actions logged_'}

## Errors & Solutions
${sections.errors_solutions || '_None_'}

## Decisions
${sections.decisions || '_None_'}

## Files Modified
${sections.files_modified || '_None_'}

### Git Status
\`\`\`
${git.status || 'clean'}
\`\`\`

### Recent Commits
\`\`\`
${git.log || 'none'}
\`\`\`

## Tasks
${sections.tasks || '_None_'}`;
}

function buildLessonBody(project, sections) {
  // Для центрального репо — только уроки и решения (кросс-проектный поиск)
  const hasContent = sections.errors_solutions || sections.decisions;
  if (!hasContent) return null;

  return `## Project: ${project}

## Lessons Learned
${sections.errors_solutions || '_None_'}

## Decisions Made
${sections.decisions || '_None_'}

## Key Actions
${sections.actions || sections.summary || '_None_'}`;
}

function createIssue(repo, title, body, labels) {
  const args = ['issue', 'create'];
  if (repo) args.push('--repo', repo);
  args.push('--title', title);
  for (const label of labels) {
    args.push('-l', label);
  }
  args.push('--body', body);

  const result = runCommandSync('gh', args, { timeout: 30000 });
  if (!result.success) {
    console.error(`Failed to create issue in ${repo || 'current repo'}: ${result.error}`);
    return null;
  }
  console.log(`Issue created: ${result.stdout}`);
  return result.stdout;
}

async function loadKnowledgeStore() {
  if (process.env.CTX_KB_DISABLED === '1') return null;
  try {
    const { createKnowledgeStore } = await import('./knowledge/kb-json-fallback.js');
    const runtime = await createKnowledgeStore({
      dbPath: process.env.CTX_KB_PATH || undefined,
      onWarning: (message) => console.warn(`[ctx] ${message}`)
    });
    if (runtime.store) {
      return { store: runtime.store, mode: runtime.mode || 'unknown' };
    }
  } catch {
    // Fallback below
  }
  return loadLocalJsonStore();
}

async function loadLocalJsonStore() {
  try {
    const { JsonKnowledgeStore } = await import('./knowledge/kb-json-fallback.js');
    return {
      store: new JsonKnowledgeStore({
        dbDir: LOCAL_KB_DIR,
        filePath: LOCAL_KB_JSON
      }),
      mode: 'json-local'
    };
  } catch {
    return null;
  }
}

function isReadonlyDbError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('readonly database') || msg.includes('read-only database');
}

async function saveToKB(store, project, sections, git) {
  let saved = 0;

  // Save errors/solutions as 'error' category
  if (sections.errors_solutions) {
    const result = store.saveEntry({
      project,
      category: 'error',
      title: `Errors & Solutions — ${new Date().toISOString().split('T')[0]}`,
      body: sections.errors_solutions,
      tags: 'auto-session',
      source: 'session-save'
    });
    if (result.saved) saved++;
  }

  // Save decisions
  if (sections.decisions) {
    const result = store.saveEntry({
      project,
      category: 'decision',
      title: `Decisions — ${new Date().toISOString().split('T')[0]}`,
      body: sections.decisions,
      tags: 'auto-session',
      source: 'session-save'
    });
    if (result.saved) saved++;
  }

  // Save session summary
  const summaryBody = sections.actions || sections.summary;
  if (summaryBody) {
    const result = store.saveEntry({
      project,
      category: 'session-summary',
      title: `Session — ${new Date().toISOString().split('T')[0]}`,
      body: summaryBody,
      tags: 'auto-session',
      source: 'session-save'
    });
    if (result.saved) saved++;
  }

  // Save snapshot
  store.saveSnapshot(project, {
    branch: git.branch || 'unknown',
    status: git.status || '',
    log: git.log || '',
    date: new Date().toISOString()
  });

  return saved;
}

async function syncKB() {
  try {
    const { KbSync } = await import('./knowledge/kb-sync.js');
    const sync = new KbSync();
    const result = await sync.push('kb: session save');
    return result;
  } catch {
    return { status: 'sync-unavailable' };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/ctx-session-save.js --event <compact|stop>');
    return;
  }
  const eventIdx = args.indexOf('--event');
  const event = eventIdx !== -1 ? args[eventIdx + 1] : 'unknown';

  const project = getProjectName();
  const projectRepo = getProjectRepo();
  const git = getGitContext();
  const sessionLog = getLatestSessionLog();
  const sections = extractSections(sessionLog);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  console.log(`[ctx] Saving session for ${project} (event: ${event})`);

  // 0. Save to local KB (fast, <5ms)
  let kbSaved = false;
  let kbRuntime = await loadKnowledgeStore();
  if (kbRuntime?.store) {
    let activeStore = kbRuntime.store;
    let activeMode = kbRuntime.mode || 'unknown';
    try {
      const savedEntries = await saveToKB(activeStore, project, sections, git);
      console.log(`[ctx] KB (${activeMode}): ${savedEntries} entries saved`);
      kbSaved = true;
    } catch (err) {
      if (activeMode === 'sqlite' && isReadonlyDbError(err)) {
        console.warn('[ctx] KB sqlite is read-only. Retrying with local JSON fallback.');
        try {
          if (typeof activeStore.close === 'function') activeStore.close();
        } catch {}

        kbRuntime = await loadLocalJsonStore();
        activeStore = kbRuntime?.store;
        activeMode = kbRuntime?.mode || 'json-local';
        if (activeStore) {
          try {
            const savedEntries = await saveToKB(activeStore, project, sections, git);
            console.log(`[ctx] KB (${activeMode}): ${savedEntries} entries saved`);
            kbSaved = true;
          } catch (fallbackErr) {
            console.warn(`[ctx] KB fallback save failed: ${fallbackErr.message || fallbackErr}`);
          }
        } else {
          console.warn('[ctx] KB fallback store is unavailable.');
        }
      } else {
        console.warn(`[ctx] KB save failed: ${err.message || err}`);
      }
    } finally {
      try {
        if (activeStore && typeof activeStore.close === 'function') activeStore.close();
      } catch {}
    }
  }

  // 1. Issue в репозитории проекта (если есть GitHub remote)
  const hasContent = sections.errors_solutions || sections.decisions || sections.actions || sections.summary;
  if (projectRepo && hasContent) {
    const title = `Session: ${dateStr} — ${event}`;
    const body = buildIssueBody(event, project, git, sections);
    createIssue(projectRepo, title, body, ['session', `provider:claude-code`]);
  }

  // 2. Issue в центральном репо (lessons для кросс-проектного поиска)
  const lessonBody = buildLessonBody(project, sections);
  if (lessonBody) {
    const title = `Session: ${project} ${dateStr} — lessons`;
    createIssue(CENTRAL_REPO, title, lessonBody, ['lesson', `project:${project}`]);
  }

  // 3. Sync KB to remote (background)
  if (kbSaved) {
    const syncResult = await syncKB();
    console.log(`[ctx] KB sync: ${syncResult.status}`);
  }

  console.log(`[ctx] Session saved successfully`);
}

main();
