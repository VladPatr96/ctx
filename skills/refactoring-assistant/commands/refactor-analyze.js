/**
 * refactor-analyze.js — Анализ конкретного файла
 */

import { readFileSync, existsSync } from 'node:fs';

export default async function refactorAnalyze(args, ctx) {
  const { appendLog } = ctx || {};
  
  const file = args.file;
  
  if (!file) {
    return { error: 'Missing --file argument' };
  }
  
  if (!existsSync(file)) {
    return { error: `File not found: ${file}` };
  }
  
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  
  // Analysis
  const analysis = {
    file,
    metrics: {
      lines: lines.length,
      characters: content.length,
      functions: (content.match(/function\s+\w+/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      imports: (content.match(/import.*from/g) || []).length
    },
    issues: []
  };
  
  // Check for issues
  if (lines.length > 500) {
    analysis.issues.push({
      type: 'large-file',
      severity: 'high',
      message: 'File is too large',
      suggestion: 'Split into multiple modules'
    });
  }
  
  if ((content.match(/TODO|FIXME/g) || []).length > 5) {
    analysis.issues.push({
      type: 'todos',
      severity: 'low',
      message: 'Many TODOs/FIXMEs',
      suggestion: 'Address technical debt'
    });
  }
  
  if (appendLog) {
    appendLog({ action: 'refactor_analyze', file });
  }
  
  return analysis;
}
