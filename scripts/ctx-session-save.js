#!/usr/bin/env node

/**
 * Persist session context to the local KB and GitHub Issues on compact/stop.
 * The runtime is injectable so quality tests can cover memory persistence
 * without live git/gh dependencies.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCommandSync } from './utils/shell.js';

function getLocalKbDir(cwd = process.cwd()) {
  return join(cwd, '.data', 'knowledge');
}

function getLocalKbJsonPath(cwd = process.cwd()) {
  return join(getLocalKbDir(cwd), 'knowledge.json');
}

function exec(command, args = []) {
  const result = runCommandSync(command, args, { timeout: 15000 });
  return result.success ? result.stdout : '';
}

export function getCentralRepo() {
  if (process.env.CTX_CENTRAL_REPO) return process.env.CTX_CENTRAL_REPO;

  const gitConfig = exec('git', ['config', '--get', 'ctx.central-repo']);
  if (gitConfig) return gitConfig;

  // Auto-detect from GITHUB_OWNER env or gh CLI
  const owner = process.env.GITHUB_OWNER || process.env.CTX_GITHUB_OWNER;
  if (owner) return `${owner}/my_claude_code`;

  // Try gh api user as last resort
  const ghLogin = exec('gh', ['api', 'user', '-q', '.login']);
  if (ghLogin) return `${ghLogin}/my_claude_code`;

  return null;
}

export function getProjectName() {
  const toplevel = exec('git', ['rev-parse', '--show-toplevel']);
  if (toplevel) return basename(toplevel);

  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return basename(dir);
}

export function getProjectRepo() {
  const remote = exec('git', ['remote', 'get-url', 'origin']);
  if (!remote) return null;

  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? match[1] : null;
}

export function getGitContext() {
  const branch = exec('git', ['branch', '--show-current']);
  const diffStat = exec('git', ['diff', '--stat']);
  const log = exec('git', ['log', '-5', '--oneline']);
  const status = exec('git', ['status', '--short']);

  return { branch, diffStat, log, status };
}

export function getLatestSessionLog() {
  const sessionsDir = join(process.cwd(), '.sessions');
  if (!existsSync(sessionsDir)) return null;

  const files = readdirSync(sessionsDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  try {
    return readFileSync(join(sessionsDir, files[0]), 'utf-8');
  } catch {
    return null;
  }
}

export function extractSections(log) {
  if (!log) {
    return {
      actions: '',
      errors_solutions: '',
      decisions: '',
      files_modified: '',
      tasks: '',
      summary: '',
    };
  }

  const normalizedLog = log.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sections = {};
  const sectionNames = ['Actions', 'Errors & Solutions', 'Decisions', 'Files Modified', 'Tasks', 'Summary'];

  for (const name of sectionNames) {
    const regex = new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = normalizedLog.match(regex);
    sections[name.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_')] = match ? match[1].trim() : '';
  }

  return sections;
}

export function buildIssueBody(event, project, git, sections, now = new Date()) {
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  return `## Session ${event === 'compact' ? '(auto-compact)' : '(end)'}
**Date:** ${timestamp}
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

export function buildLessonBody(project, sections) {
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

export function getRepoLabels(repo) {
  if (!repo) return null;

  const result = runCommandSync(
    'gh',
    ['label', 'list', '-R', repo, '--limit', '200', '--json', 'name'],
    { timeout: 30000 }
  );

  if (!result.success) return null;

  try {
    const labels = JSON.parse(result.stdout || '[]');
    return new Set(labels.map((label) => label?.name).filter(Boolean));
  } catch {
    return null;
  }
}

export function createIssue(repo, title, body, labels) {
  const requestedLabels = [...new Set((labels || []).filter(Boolean))];
  let labelsToUse = [...requestedLabels];

  const availableLabels = getRepoLabels(repo);
  if (availableLabels) {
    const droppedLabels = labelsToUse.filter((label) => !availableLabels.has(label));
    labelsToUse = labelsToUse.filter((label) => availableLabels.has(label));
    if (droppedLabels.length > 0) {
      console.warn(`[ctx] Missing labels in ${repo}: ${droppedLabels.join(', ')}. Creating issue without them.`);
    }
  }

  const runCreate = (labelsForRun) => {
    const args = ['issue', 'create'];
    if (repo) args.push('--repo', repo);
    args.push('--title', title);
    for (const label of labelsForRun) args.push('-l', label);
    args.push('--body', body);
    return runCommandSync('gh', args, { timeout: 30000 });
  };

  let result = runCreate(labelsToUse);
  if (!result.success && labelsToUse.length > 0 && /label/i.test(String(result.error || ''))) {
    console.warn(`[ctx] Retrying issue creation in ${repo || 'current repo'} without labels.`);
    result = runCreate([]);
  }

  if (!result.success) {
    console.error(`Failed to create issue in ${repo || 'current repo'}: ${result.error}`);
    return null;
  }

  console.log(`Issue created: ${result.stdout}`);
  return result.stdout;
}

export async function loadKnowledgeStore() {
  if (process.env.CTX_KB_DISABLED === '1') return null;

  try {
    const { createKnowledgeStore } = await import('./knowledge/kb-json-fallback.js');
    const runtime = await createKnowledgeStore({
      dbPath: process.env.CTX_KB_PATH || undefined,
      onWarning: (message) => console.warn(`[ctx] ${message}`),
    });
    if (runtime.store) {
      return { store: runtime.store, mode: runtime.mode || 'unknown' };
    }
  } catch {
    // Fall through to local JSON store.
  }

  return loadLocalJsonStore();
}

export async function loadLocalJsonStore() {
  try {
    const { JsonKnowledgeStore } = await import('./knowledge/kb-json-fallback.js');
    return {
      store: new JsonKnowledgeStore({
        dbDir: getLocalKbDir(),
        filePath: getLocalKbJsonPath(),
      }),
      mode: 'json-local',
    };
  } catch {
    return null;
  }
}

export function isReadonlyDbError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return message.includes('readonly database') || message.includes('read-only database');
}

export async function saveToKB(store, project, sections, git, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const dateStr = date.toISOString().split('T')[0];
  let saved = 0;

  if (sections.errors_solutions) {
    const result = store.saveEntry({
      project,
      category: 'error',
      title: `Errors & Solutions — ${dateStr}`,
      body: sections.errors_solutions,
      tags: 'auto-session',
      source: 'session-save',
    });
    if (result.saved) saved++;
  }

  if (sections.decisions) {
    const result = store.saveEntry({
      project,
      category: 'decision',
      title: `Decisions — ${dateStr}`,
      body: sections.decisions,
      tags: 'auto-session',
      source: 'session-save',
    });
    if (result.saved) saved++;
  }

  const summaryBody = sections.actions || sections.summary;
  if (summaryBody) {
    const result = store.saveEntry({
      project,
      category: 'session-summary',
      title: `Session — ${dateStr}`,
      body: summaryBody,
      tags: 'auto-session',
      source: 'session-save',
    });
    if (result.saved) saved++;
  }

  store.saveSnapshot(project, {
    branch: git.branch || 'unknown',
    status: git.status || '',
    log: git.log || '',
    date: date.toISOString(),
  });

  return saved;
}

export async function syncKB() {
  try {
    const { KbSync } = await import('./knowledge/kb-sync.js');
    const sync = new KbSync();
    return await sync.push('kb: session save');
  } catch {
    return { status: 'sync-unavailable' };
  }
}

export async function saveSessionContext(options = {}, deps = {}) {
  const {
    event = 'unknown',
    now = new Date(),
    project,
    projectRepo,
    git,
    sessionLog,
    centralRepo,
  } = options;

  const log = deps.log || ((message) => console.log(message));
  const warn = deps.warn || ((message) => console.warn(message));
  const getCentralRepoFn = deps.getCentralRepo || getCentralRepo;
  const getProjectNameFn = deps.getProjectName || getProjectName;
  const getProjectRepoFn = deps.getProjectRepo || getProjectRepo;
  const getGitContextFn = deps.getGitContext || getGitContext;
  const getLatestSessionLogFn = deps.getLatestSessionLog || getLatestSessionLog;
  const loadKnowledgeStoreFn = deps.loadKnowledgeStore || loadKnowledgeStore;
  const loadLocalJsonStoreFn = deps.loadLocalJsonStore || loadLocalJsonStore;
  const createIssueFn = deps.createIssue || createIssue;
  const syncKBFn = deps.syncKB || syncKB;
  const saveToKBFn = deps.saveToKB || saveToKB;
  const readonlyCheckFn = deps.isReadonlyDbError || isReadonlyDbError;

  const timestamp = now instanceof Date ? now : new Date(now);
  const dateStr = timestamp.toISOString().split('T')[0];
  const resolvedProject = project ?? getProjectNameFn();
  const resolvedProjectRepo = projectRepo !== undefined ? projectRepo : getProjectRepoFn();
  const resolvedGit = git ?? getGitContextFn();
  const resolvedSessionLog = sessionLog !== undefined ? sessionLog : getLatestSessionLogFn();
  const sections = extractSections(resolvedSessionLog);
  const resolvedCentralRepo = centralRepo ?? getCentralRepoFn();

  log(`[ctx] Saving session for ${resolvedProject} (event: ${event})`);

  let kbSaved = false;
  let kbMode = null;
  let projectIssueUrl = null;
  let lessonIssueUrl = null;
  let syncStatus = null;
  let kbRuntime = await loadKnowledgeStoreFn();

  if (kbRuntime?.store) {
    let activeStore = kbRuntime.store;
    let activeMode = kbRuntime.mode || 'unknown';
    kbMode = activeMode;

    try {
      const savedEntries = await saveToKBFn(activeStore, resolvedProject, sections, resolvedGit, timestamp);
      log(`[ctx] KB (${activeMode}): ${savedEntries} entries saved`);
      kbSaved = true;
    } catch (err) {
      if (activeMode === 'sqlite' && readonlyCheckFn(err)) {
        warn('[ctx] KB sqlite is read-only. Retrying with local JSON fallback.');

        try {
          if (typeof activeStore.close === 'function') activeStore.close();
        } catch {}

        kbRuntime = await loadLocalJsonStoreFn();
        activeStore = kbRuntime?.store;
        activeMode = kbRuntime?.mode || 'json-local';
        kbMode = activeMode;

        if (activeStore) {
          try {
            const savedEntries = await saveToKBFn(activeStore, resolvedProject, sections, resolvedGit, timestamp);
            log(`[ctx] KB (${activeMode}): ${savedEntries} entries saved`);
            kbSaved = true;
          } catch (fallbackErr) {
            warn(`[ctx] KB fallback save failed: ${fallbackErr.message || fallbackErr}`);
          }
        } else {
          warn('[ctx] KB fallback store is unavailable.');
        }
      } else {
        warn(`[ctx] KB save failed: ${err.message || err}`);
      }
    } finally {
      try {
        if (activeStore && typeof activeStore.close === 'function') activeStore.close();
      } catch {}
    }
  }

  const hasContent = Boolean(sections.errors_solutions || sections.decisions || sections.actions || sections.summary);
  if (resolvedProjectRepo && hasContent) {
    const title = `Session: ${dateStr} — ${event}`;
    const body = buildIssueBody(event, resolvedProject, resolvedGit, sections, timestamp);
    projectIssueUrl = createIssueFn(resolvedProjectRepo, title, body, ['session', 'provider:claude-code']);
  }

  const lessonBody = buildLessonBody(resolvedProject, sections);
  if (lessonBody) {
    const title = `Session: ${resolvedProject} ${dateStr} — lessons`;
    lessonIssueUrl = createIssueFn(resolvedCentralRepo, title, lessonBody, ['lesson', `project:${resolvedProject}`]);
  }

  if (kbSaved) {
    const syncResult = await syncKBFn();
    syncStatus = syncResult.status;
    log(`[ctx] KB sync: ${syncStatus}`);
  }

  log('[ctx] Session saved successfully');

  return {
    event,
    project: resolvedProject,
    projectRepo: resolvedProjectRepo,
    centralRepo: resolvedCentralRepo,
    sections,
    kbSaved,
    kbMode,
    syncStatus,
    issueUrls: {
      project: projectIssueUrl,
      lesson: lessonIssueUrl,
    },
  };
}

export async function main(args = process.argv.slice(2), deps = {}) {
  if (args.includes('--help') || args.includes('-h')) {
    const log = deps.log || ((message) => console.log(message));
    log('Usage: node scripts/ctx-session-save.js --event <compact|stop>');
    return { status: 'help' };
  }

  const eventIndex = args.indexOf('--event');
  const event = eventIndex !== -1 ? args[eventIndex + 1] : 'unknown';
  return saveSessionContext({ event }, deps);
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main().catch((err) => {
    console.error(`[ctx] Session save failed: ${err.message || err}`);
    process.exitCode = 1;
  });
}
