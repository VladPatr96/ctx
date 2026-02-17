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

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const CENTRAL_REPO = 'VladPatr96/my_claude_code';

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 15000 }).trim();
  } catch {
    return '';
  }
}

function getProjectName() {
  const toplevel = exec('git rev-parse --show-toplevel');
  if (toplevel) return basename(toplevel);

  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return basename(dir);
}

function getProjectRepo() {
  const remote = exec('git remote get-url origin');
  if (!remote) return null;

  // Extract owner/repo from git URL
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? match[1] : null;
}

function getGitContext() {
  const branch = exec('git branch --show-current');
  const diffStat = exec('git diff --stat');
  const log = exec('git log -5 --oneline');
  const status = exec('git status --short');

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
  const labelsArg = labels.map(l => `-l "${l}"`).join(' ');
  const repoArg = repo ? `-R ${repo}` : '';

  // Escape body for shell
  const escapedBody = body.replace(/"/g, '\\"').replace(/`/g, '\\`');

  const cmd = `gh issue create ${repoArg} --title "${title}" ${labelsArg} --body "${escapedBody}"`;

  try {
    const result = exec(cmd);
    console.log(`Issue created: ${result}`);
    return result;
  } catch (e) {
    console.error(`Failed to create issue in ${repo || 'current repo'}: ${e.message}`);
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
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

  // 1. Issue в репозитории проекта (если есть GitHub remote)
  if (projectRepo) {
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

  console.log(`[ctx] Session saved successfully`);
}

main();
