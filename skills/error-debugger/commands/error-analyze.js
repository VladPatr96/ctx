/**
 * error-analyze.js — Analyze specific file:line for potential errors
 */

import { readFileSync, existsSync } from 'node:fs';

/**
 * Common error patterns to check
 */
const CHECKS = [
  {
    name: 'null-check-missing',
    pattern: /(?:req|res|ctx|data)\.\w+\.\w+/g,
    message: 'Potential null/undefined access without check',
    severity: 'high'
  },
  {
    name: 'missing-error-handling',
    pattern: /(?:await|return)\s+\w+\([^)]*\)[;\s]*$/gm,
    message: 'Missing try-catch or .catch() for async operation',
    severity: 'medium'
  },
  {
    name: 'unvalidated-input',
    pattern: /req\.(?:body|params|query)\.\w+/g,
    message: 'Direct use of user input without validation',
    severity: 'high'
  },
  {
    name: 'hardcoded-values',
    pattern: /(?:password|secret|api[_-]?key|token)\s*[=:]\s*["'][^"']+["']/gi,
    message: 'Hardcoded sensitive value',
    severity: 'critical'
  },
  {
    name: 'sql-injection-risk',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\+.*(?:req|params|body)/gi,
    message: 'Potential SQL injection vulnerability',
    severity: 'critical'
  }
];

/**
 * Main command handler
 */
export default async function errorAnalyze(args, ctx) {
  const { appendLog } = ctx || {};
  
  const filePath = args.file;
  const lineNumber = args.line ? parseInt(args.line) : null;
  
  if (!filePath) {
    return {
      error: 'Missing --file argument',
      usage: 'error-analyze --file <path> [--line <number>]'
    };
  }
  
  if (!existsSync(filePath)) {
    return {
      error: `File not found: ${filePath}`
    };
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const findings = [];
  
  // Analyze specific line or entire file
  const startLine = lineNumber ? lineNumber - 1 : 0;
  const endLine = lineNumber ? lineNumber : lines.length;
  const targetLines = lines.slice(startLine, endLine);
  
  for (let i = 0; i < targetLines.length; i++) {
    const line = targetLines[i];
    const actualLineNumber = startLine + i + 1;
    
    for (const check of CHECKS) {
      const matches = line.match(check.pattern);
      
      if (matches) {
        findings.push({
          line: actualLineNumber,
          code: line.trim(),
          check: check.name,
          message: check.message,
          severity: check.severity,
          match: matches[0]
        });
      }
    }
  }
  
  // Group by severity
  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length
  };
  
  const result = {
    file: filePath,
    analyzedLines: targetLines.length,
    findings: findings,
    summary: summary,
    analyzedAt: new Date().toISOString()
  };
  
  // Log to CTX
  if (appendLog) {
    appendLog({
      action: 'error_analyze',
      file: filePath,
      line: lineNumber,
      findings: findings.length,
      critical: summary.critical,
      high: summary.high
    });
  }
  
  return result;
}
