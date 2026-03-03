/**
 * security-scan.js — Implementation of security-scan command
 * 
 * Universal command for security scanning (works on all providers)
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Scan code for vulnerabilities
 */
function scanCode(rootDir) {
  const findings = [];
  
  // Common vulnerability patterns
  const patterns = [
    {
      type: 'sql-injection',
      regex: /(?:SELECT|INSERT|UPDATE|DELETE).*\+.*(?:req\.|params\.|body\.)/gi,
      severity: 'critical',
      message: 'Potential SQL injection vulnerability'
    },
    {
      type: 'xss',
      regex: /innerHTML\s*=\s*(?:req\.|params\.|body\.)/gi,
      severity: 'high',
      message: 'Potential XSS vulnerability'
    },
    {
      type: 'hardcoded-secret',
      regex: /(?:password|apiKey|secret|token)\s*[:=]\s*["'][^"']+["']/gi,
      severity: 'critical',
      message: 'Hardcoded secret detected'
    },
    {
      type: 'eval-usage',
      regex: /eval\s*\(/gi,
      severity: 'high',
      message: 'Unsafe eval() usage'
    }
  ];
  
  // Simple file scanning (in real implementation would use AST)
  const jsFiles = findFiles(rootDir, '.js');
  
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    for (const pattern of patterns) {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((match = regex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        findings.push({
          severity: pattern.severity,
          type: pattern.type,
          file: file,
          line: lineNumber,
          message: pattern.message,
          match: match[0].substring(0, 50),
          recommendation: getRecommendation(pattern.type)
        });
      }
    }
  }
  
  return findings;
}

/**
 * Scan dependencies for vulnerabilities
 */
function scanDependencies(rootDir) {
  const findings = [];
  
  try {
    // Run npm audit
    const result = execSync('npm audit --json', { 
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const audit = JSON.parse(result);
    
    if (audit.vulnerabilities) {
      for (const [pkg, info] of Object.entries(audit.vulnerabilities)) {
        findings.push({
          severity: info.severity,
          type: 'vulnerable-dependency',
          package: pkg,
          version: info.version,
          via: info.via,
          fixAvailable: info.fixAvailable,
          recommendation: info.fixAvailable ? 'Run npm fix' : 'Manual update required'
        });
      }
    }
  } catch (error) {
    // npm audit might exit with code != 0 if vulnerabilities found
    try {
      const audit = JSON.parse(error.stdout);
      if (audit.vulnerabilities) {
        for (const [pkg, info] of Object.entries(audit.vulnerabilities)) {
          findings.push({
            severity: info.severity,
            type: 'vulnerable-dependency',
            package: pkg,
            version: info.version,
            via: info.via,
            fixAvailable: info.fixAvailable
          });
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }
  
  return findings;
}

/**
 * Find files with extension
 */
function findFiles(dir, ext) {
  const files = [];
  const { readdirSync, statSync } = require('node:fs');
  
  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  }
  
  try {
    walk(dir);
  } catch (error) {
    // Ignore errors
  }
  
  return files;
}

/**
 * Get recommendation for vulnerability type
 */
function getRecommendation(type) {
  const recommendations = {
    'sql-injection': 'Use parameterized queries or prepared statements',
    'xss': 'Sanitize user input before rendering',
    'hardcoded-secret': 'Use environment variables or secret management',
    'eval-usage': 'Avoid eval(), use safer alternatives'
  };
  
  return recommendations[type] || 'Review and fix the vulnerability';
}

/**
 * Main command handler
 */
export default async function securityScan(args, ctx) {
  const { storage, loadPipeline, savePipeline, appendLog } = ctx || {};
  
  const rootDir = process.cwd();
  const scope = args.scope || 'all';
  
  const result = {
    scannedAt: new Date().toISOString(),
    scope: scope,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    findings: []
  };
  
  // Scan code
  if (scope === 'all' || scope === 'code') {
    const codeFindings = scanCode(rootDir);
    result.findings.push(...codeFindings);
  }
  
  // Scan dependencies
  if (scope === 'all' || scope === 'dependencies') {
    const depFindings = scanDependencies(rootDir);
    result.findings.push(...depFindings);
  }
  
  // Count by severity
  for (const finding of result.findings) {
    result[finding.severity] = (result[finding.severity] || 0) + 1;
  }
  
  // Log to CTX
  if (appendLog) {
    appendLog({
      action: 'security_scan',
      scope: scope,
      critical: result.critical,
      high: result.high,
      total: result.findings.length
    });
  }
  
  return result;
}
