/**
 * debug.js — Implementation of debug command
 * 
 * Analyzes errors, finds similar cases in KB, generates solutions
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Error patterns database
 */
const ERROR_PATTERNS = [
  {
    type: 'TypeError',
    patterns: [
      {
        regex: /Cannot read propert(?:y|ies) of undefined/,
        cause: 'Accessing property of undefined object',
        solution: 'Add null check or optional chaining',
        codeTemplate: 'const value = obj?.property;\nif (!value) { /* handle */ }'
      },
      {
        regex: /Cannot read propert(?:y|ies) of null/,
        cause: 'Accessing property of null object',
        solution: 'Add null check',
        codeTemplate: 'if (obj === null) { /* handle */ }\nconst value = obj.property;'
      },
      {
        regex: /is not a function/,
        cause: 'Calling non-function value',
        solution: 'Verify function exists before calling',
        codeTemplate: 'if (typeof obj.method === \'function\') {\n  obj.method();\n}'
      }
    ]
  },
  {
    type: 'ReferenceError',
    patterns: [
      {
        regex: /(\w+) is not defined/,
        cause: 'Variable or import missing',
        solution: 'Declare variable or add import',
        codeTemplate: 'import { $1 } from \'module\';\n// or\nconst $1 = ...;'
      }
    ]
  },
  {
    type: 'SyntaxError',
    patterns: [
      {
        regex: /Unexpected token/,
        cause: 'Syntax error in code',
        solution: 'Fix syntax (missing bracket, comma, etc.)',
        codeTemplate: '// Check for:\n// - Missing { } ( )\n// - Missing , ;\n// - Typos'
      }
    ]
  }
];

/**
 * Parse stack trace
 */
function parseStackTrace(stack) {
  if (!stack) return [];
  
  const lines = stack.split('\n');
  const frames = [];
  
  for (const line of lines) {
    // Match patterns like "at functionName (file:line:col)" or "at file:line:col"
    const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
    
    if (match) {
      frames.push({
        function: match[1] || '<anonymous>',
        file: match[2],
        line: parseInt(match[3]),
        column: parseInt(match[4])
      });
    }
  }
  
  return frames;
}

/**
 * Analyze error
 */
function analyzeError(errorMessage) {
  for (const errorType of ERROR_PATTERNS) {
    for (const pattern of errorType.patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags || 'i');
      if (regex.test(errorMessage)) {
        return {
          type: errorType.type,
          pattern: pattern.regex.source,
          cause: pattern.cause,
          solution: pattern.solution,
          codeTemplate: pattern.codeTemplate
        };
      }
    }
  }
  
  return {
    type: 'Unknown',
    cause: 'Unable to determine cause',
    solution: 'Manual investigation required',
    codeTemplate: '// Check error message and stack trace'
  };
}

/**
 * Search similar errors in KB
 */
async function searchSimilarErrors(pattern, ctx) {
  if (!ctx || !ctx.storage) {
    return [];
  }
  
  try {
    // Search in knowledge base
    const results = await ctx.storage.searchKnowledge(pattern, { limit: 5 });
    
    return results.map(r => ({
      date: r.created_at,
      file: r.metadata?.file || 'unknown',
      solution: r.metadata?.solution || 'No solution recorded',
      timeToFix: r.metadata?.timeToFix || 0
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Generate fix suggestion
 */
function generateFix(analysis, stackFrames, code) {
  const topFrame = stackFrames[0];
  
  if (!topFrame) {
    return {
      confidence: 50,
      explanation: analysis.solution,
      code: analysis.codeTemplate
    };
  }
  
  let confidence = 80;
  let code = analysis.codeTemplate;
  
  // Try to read actual file if available
  if (code && topFrame.file) {
    try {
      const filePath = topFrame.file;
      if (existsSync(filePath)) {
        const fileContent = readFileSync(filePath, 'utf-8');
        const lines = fileContent.split('\n');
        const errorLine = lines[topFrame.line - 1];
        
        // Customize fix based on actual code
        if (errorLine && errorLine.includes('.')) {
          // Property access - suggest optional chaining
          const match = errorLine.match(/(\w+)\.(\w+)/);
          if (match) {
            code = errorLine.replace(/(\w+)\.(\w+)/, '$1?.$2');
            confidence = 94;
          }
        }
      }
    } catch (error) {
      // Ignore file read errors
    }
  }
  
  return {
    confidence,
    explanation: analysis.solution,
    code
  };
}

/**
 * Main command handler
 */
export default async function debug(args, ctx) {
  const { storage, loadPipeline, savePipeline, appendLog } = ctx || {};
  
  const errorMessage = args.error || '';
  const stackTrace = args.stack || '';
  
  if (!errorMessage) {
    return {
      error: 'Missing --error argument',
      usage: 'debug --error "<message>" --stack "<trace>"'
    };
  }
  
  // Parse stack trace
  const stackFrames = parseStackTrace(stackTrace);
  
  // Analyze error
  const analysis = analyzeError(errorMessage);
  
  // Search similar cases
  const similarCases = await searchSimilarErrors(analysis.pattern, ctx);
  
  // Generate fix
  const fix = generateFix(analysis, stackFrames, null);
  
  const result = {
    type: analysis.type,
    cause: analysis.cause,
    location: stackFrames[0] || null,
    solution: {
      confidence: fix.confidence,
      fix: fix.explanation,
      code: fix.code
    },
    similarCases: similarCases.slice(0, 3),
    analyzedAt: new Date().toISOString()
  };
  
  // Log to CTX
  if (appendLog) {
    appendLog({
      action: 'error_debug',
      type: analysis.type,
      cause: analysis.cause,
      confidence: fix.confidence,
      hasSimilarCases: similarCases.length > 0
    });
  }
  
  // Save to KB for future reference
  if (storage && fix.confidence >= 80) {
    try {
      await storage.saveLesson({
        type: 'bugfix',
        pattern: `${analysis.type} + ${analysis.cause}`,
        solution: fix.explanation,
        code: fix.code,
        file: stackFrames[0]?.file,
        line: stackFrames[0]?.line
      });
    } catch (error) {
      // Ignore KB save errors
    }
  }
  
  return result;
}
