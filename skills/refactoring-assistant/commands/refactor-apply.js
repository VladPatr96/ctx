/**
 * refactor-apply.js — Применение трансформации
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export default async function refactorApply(args, ctx) {
  const { appendLog } = ctx || {};
  
  const transformation = args.transformation;
  const file = args.file;
  const safeMode = args['safe-mode'] !== 'false';
  
  if (!transformation || !file) {
    return { 
      error: 'Missing arguments',
      usage: '--transformation <name> --file <path> [--safe-mode]'
    };
  }
  
  if (!existsSync(file)) {
    return { error: `File not found: ${file}` };
  }
  
  const originalContent = readFileSync(file, 'utf-8');
  
  try {
    // Run tests before (safe mode)
    if (safeMode) {
      try {
        execSync('npm test', { stdio: 'pipe' });
      } catch (error) {
        return {
          error: 'Tests failed before refactoring',
          hint: 'Fix tests before applying transformations'
        };
      }
    }
    
    // Apply transformation (mock)
    let newContent = originalContent;
    
    switch (transformation) {
      case 'extract-method':
        newContent = `// Refactored: extract-method applied\n${originalContent}`;
        break;
      case 'extract-class':
        newContent = `// Refactored: extract-class applied\n${originalContent}`;
        break;
      default:
        return {
          error: `Unknown transformation: ${transformation}`,
          available: ['extract-method', 'extract-class']
        };
    }
    
    // Write changes
    writeFileSync(file, newContent, 'utf-8');
    
    // Run tests after (safe mode)
    if (safeMode) {
      try {
        execSync('npm test', { stdio: 'pipe' });
      } catch (error) {
        // Rollback
        writeFileSync(file, originalContent, 'utf-8');
        
        return {
          error: 'Tests failed after refactoring',
          rolledBack: true,
          hint: 'Transformation not applied due to test failures'
        };
      }
    }
    
    const result = {
      transformation,
      file,
      safeMode,
      applied: true,
      backup: originalContent.slice(0, 100) + '...',
      appliedAt: new Date().toISOString()
    };
    
    if (appendLog) {
      appendLog({ 
        action: 'refactor_apply', 
        transformation, 
        file,
        safeMode,
        success: true
      });
    }
    
    return result;
    
  } catch (error) {
    return {
      error: 'Refactoring failed',
      details: error.message
    };
  }
}
