/**
 * error-fix.js — Auto-apply fix for known error pattern
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Main command handler
 */
export default async function errorFix(args, ctx) {
  const { storage, appendLog } = ctx || {};
  
  const errorId = args['error-id'];
  const autoApply = args['auto-apply'] === 'true' || args['auto-apply'] === true;
  
  if (!errorId) {
    return {
      error: 'Missing --error-id argument',
      usage: 'error-fix --error-id <id> [--auto-apply]'
    };
  }
  
  if (!storage) {
    return {
      error: 'Knowledge Base not available',
      hint: 'KB must be enabled for this command'
    };
  }
  
  try {
    // Get error details from KB
    const errorRecord = await storage.getLesson(errorId);
    
    if (!errorRecord) {
      return {
        error: `Error not found: ${errorId}`,
        hint: 'Use error-similar to find error IDs'
      };
    }
    
    const { file, line, solution, code } = errorRecord.metadata || {};
    
    if (!file || !existsSync(file)) {
      return {
        error: 'File not found or not recorded',
        file: file
      };
    }
    
    // Read file
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    if (!line || line < 1 || line > lines.length) {
      return {
        error: 'Invalid line number',
        line: line,
        maxLine: lines.length
      };
    }
    
    const originalLine = lines[line - 1];
    
    // Generate fix
    const fix = {
      file: file,
      line: line,
      original: originalLine,
      suggested: code || `// TODO: ${solution}`,
      explanation: solution
    };
    
    if (autoApply) {
      // Apply fix automatically
      lines[line - 1] = fix.suggested;
      const newContent = lines.join('\n');
      
      // Write back
      writeFileSync(file, newContent, 'utf-8');
      
      fix.applied = true;
      fix.backup = originalLine;
      
      // Log to CTX
      if (appendLog) {
        appendLog({
          action: 'error_fix_applied',
          errorId: errorId,
          file: file,
          line: line
        });
      }
    } else {
      fix.applied = false;
      fix.hint = 'Add --auto-apply to automatically apply this fix';
    }
    
    return {
      errorId: errorId,
      fix: fix,
      fixedAt: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      error: 'Failed to apply fix',
      details: error.message
    };
  }
}
