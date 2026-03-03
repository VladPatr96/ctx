/**
 * AI-assisted git conflict resolution.
 * Uses providers/index.js invoke() for AI reasoning.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from '../utils/shell.js';
import { invoke } from '../providers/index.js';

const CONFLICT_MARKERS = ['<<<<<<<', '=======', '>>>>>>>'];

/**
 * Resolve merge conflicts using AI provider.
 * @param {object} opts
 * @param {string}  opts.cwd            — repo directory
 * @param {string}  [opts.provider]     — AI provider (default 'claude')
 * @param {number}  [opts.retries]      — max retries (default 1)
 * @param {Function} [opts.invokeFn]    — override invoke for testing
 * @returns {{ success: boolean, filesResolved: string[], reasoning: string, error?: string }}
 */
export async function resolveConflicts(opts = {}) {
  const { cwd = process.cwd(), provider = 'claude', retries = 1, invokeFn } = opts;
  const callInvoke = invokeFn || invoke;

  // Find conflicted files
  const diffResult = await runCommand('git', ['diff', '--name-only', '--diff-filter=U'], { cwd });
  if (!diffResult.success || !diffResult.stdout.trim()) {
    return { success: false, filesResolved: [], reasoning: '', error: 'No conflict files found or git diff failed' };
  }

  const conflictFiles = diffResult.stdout.trim().split('\n').filter(Boolean);

  // Read file contents
  const fileContents = {};
  for (const file of conflictFiles) {
    try {
      fileContents[file] = readFileSync(join(cwd, file), 'utf-8');
    } catch (e) {
      return { success: false, filesResolved: [], reasoning: '', error: `Cannot read ${file}: ${e.message}` };
    }
  }

  const prompt = buildConflictPrompt({ files: fileContents });

  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await callInvoke(provider, prompt, { temperature: 0.2 });

    if (result.status !== 'success') {
      lastError = result.error || 'Provider invocation failed';
      continue;
    }

    const parsed = parseConflictResponse(result.response);
    if (!parsed) {
      lastError = 'Failed to parse AI response';
      continue;
    }

    // Validate: no conflict markers in resolved content
    const invalid = parsed.files.filter(f =>
      CONFLICT_MARKERS.some(m => f.content.includes(m))
    );
    if (invalid.length > 0) {
      lastError = `Resolved files still contain conflict markers: ${invalid.map(f => f.path).join(', ')}`;
      continue;
    }

    // Apply resolved files
    for (const f of parsed.files) {
      writeFileSync(join(cwd, f.path), f.content, 'utf-8');
    }

    // Stage resolved files
    const addResult = await runCommand('git', ['add', ...parsed.files.map(f => f.path)], { cwd });
    if (!addResult.success) {
      return { success: false, filesResolved: [], reasoning: parsed.reasoning, error: 'git add failed' };
    }

    // Commit merge
    const commitResult = await runCommand('git', ['commit', '--no-edit'], { cwd });
    if (!commitResult.success) {
      return { success: false, filesResolved: parsed.files.map(f => f.path), reasoning: parsed.reasoning, error: 'git commit failed' };
    }

    return {
      success: true,
      filesResolved: parsed.files.map(f => f.path),
      reasoning: parsed.reasoning,
    };
  }

  return { success: false, filesResolved: [], reasoning: '', error: lastError };
}

/**
 * Build prompt for conflict resolution.
 * @param {{ files: Record<string, string> }} context
 * @returns {string}
 */
export function buildConflictPrompt(context) {
  const fileEntries = Object.entries(context.files)
    .map(([path, content]) => `### File: ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  return `You are resolving git merge conflicts. For each file below, produce the correctly merged version.
The files contain standard git conflict markers (<<<<<<<, =======, >>>>>>>).
Merge intelligently — keep both sides' intent where possible.

${fileEntries}

Respond with ONLY a JSON object (no markdown fences):
{
  "reasoning": "brief explanation of merge decisions",
  "files": [
    { "path": "file/path.js", "content": "full resolved file content" }
  ]
}`;
}

/**
 * Parse AI response into structured conflict resolution.
 * @param {string} raw
 * @returns {{ files: Array<{path: string, content: string}>, reasoning: string } | null}
 */
export function parseConflictResponse(raw) {
  if (!raw) return null;
  try {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned);
    if (!parsed.files || !Array.isArray(parsed.files)) return null;

    const valid = parsed.files.every(f => typeof f.path === 'string' && typeof f.content === 'string');
    if (!valid) return null;

    return { files: parsed.files, reasoning: parsed.reasoning || '' };
  } catch {
    return null;
  }
}
