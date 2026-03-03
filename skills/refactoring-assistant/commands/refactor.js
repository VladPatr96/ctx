/**
 * refactor.js — Главная команда рефакторинга
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Обнаружение code smells
 */
function detectCodeSmells(directory) {
  const smells = [];
  
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').length;
        
        // God Object detection (>1000 LOC)
        if (lines > 1000) {
          smells.push({
            type: 'god-object',
            file: fullPath,
            lines,
            severity: 'critical',
            suggestion: `Split into ${Math.ceil(lines / 300)} smaller modules`
          });
        }
        
        // Duplicate code detection (simple)
        const duplicates = findDuplicates(content);
        if (duplicates.length > 0) {
          smells.push({
            type: 'duplicate-code',
            file: fullPath,
            count: duplicates.length,
            severity: 'high',
            suggestion: 'Extract to shared utility'
          });
        }
        
        // Long method detection
        const longMethods = findLongMethods(content);
        if (longMethods.length > 0) {
          smells.push({
            type: 'long-method',
            file: fullPath,
            methods: longMethods,
            severity: 'medium',
            suggestion: 'Extract to smaller methods'
          });
        }
      }
    }
  }
  
  try {
    walk(directory);
  } catch (error) {
    // ignore
  }
  
  return smells;
}

function findDuplicates(content) {
  // Simple duplicate detection (lines that appear more than once)
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 20);
  const seen = {};
  const duplicates = [];
  
  for (const line of lines) {
    if (seen[line]) {
      duplicates.push(line);
    } else {
      seen[line] = true;
    }
  }
  
  return duplicates;
}

function findLongMethods(content) {
  // Find functions with >50 lines
  const methodPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
  const methods = [];
  
  let match;
  while ((match = methodPattern.exec(content)) !== null) {
    const methodName = match[1] || match[2];
    const startIdx = match.index;
    
    // Simple line count (very rough)
    const methodBody = content.slice(startIdx, startIdx + 1000);
    const lines = methodBody.split('\n').length;
    
    if (lines > 50) {
      methods.push({ name: methodName, lines });
    }
  }
  
  return methods;
}

/**
 * Main command handler
 */
export default async function refactor(args, ctx) {
  const { appendLog } = ctx || {};
  
  const directory = args.directory || 'src';
  const severity = args.severity || 'all';
  
  const smells = detectCodeSmells(directory);
  
  // Filter by severity
  const filtered = severity === 'all' 
    ? smells 
    : smells.filter(s => s.severity === severity);
  
  // Group by severity
  const summary = {
    critical: filtered.filter(s => s.severity === 'critical').length,
    high: filtered.filter(s => s.severity === 'high').length,
    medium: filtered.filter(s => s.severity === 'medium').length,
    low: filtered.filter(s => s.severity === 'low').length
  };
  
  const result = {
    directory,
    smells: filtered,
    summary,
    analyzedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ 
      action: 'refactor', 
      directory,
      total: filtered.length,
      critical: summary.critical
    });
  }
  
  return result;
}
