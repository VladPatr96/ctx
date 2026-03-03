/**
 * generate-docs.js — Главная команда генерации документации
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Анализ структуры проекта
 */
function analyzeProject(rootDir) {
  const pkgPath = join(rootDir, 'package.json');
  let pkg = {};
  
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  }
  
  return {
    name: pkg.name || basename(rootDir),
    description: pkg.description || '',
    version: pkg.version || '1.0.0',
    license: pkg.license || 'MIT',
    dependencies: Object.keys(pkg.dependencies || {}),
    devDependencies: Object.keys(pkg.devDependencies || {}),
    scripts: pkg.scripts || {}
  };
}

/**
 * Поиск JSDoc комментариев
 */
function findJSDocComments(rootDir) {
  const comments = [];
  
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
        const jsdocPattern = /\/\*\*[\s\S]*?\*\//g;
        const matches = content.match(jsdocPattern) || [];
        
        comments.push(...matches.map(m => ({
          file: fullPath,
          comment: m
        })));
      }
    }
  }
  
  try {
    walk(rootDir);
  } catch (error) {
    // ignore
  }
  
  return comments;
}

/**
 * Генерация README.md
 */
function generateREADME(project) {
  return `# ${project.name}

${project.description}

## Installation

\`\`\`bash
npm install ${project.name}
\`\`\`

## Quick Start

\`\`\`javascript
import { Client } from '${project.name}';

const client = new Client();
await client.start();
\`\`\`

## Features

${project.dependencies.slice(0, 5).map(d => `- ${d}`).join('\n')}

## License

${project.license}
`;
}

/**
 * Генерация API.md
 */
function generateAPIDocs(comments) {
  let docs = `# API Reference\n\n`;
  
  docs += `## Functions\n\n`;
  docs += comments.slice(0, 10).map(c => {
    const lines = c.comment.split('\n');
    const description = lines
      .filter(l => l.trim().startsWith('*') && !l.includes('@'))
      .map(l => l.replace(/^\s*\*\s*/, ''))
      .join(' ');
    
    return `### Function\n\n${description || 'No description'}\n`;
  }).join('\n');
  
  return docs;
}

/**
 * Main command handler
 */
export default async function generateDocs(args, ctx) {
  const { appendLog } = ctx || {};
  
  const type = args.type || 'all';
  const rootDir = process.cwd();
  
  // Analyze project
  const project = analyzeProject(rootDir);
  const comments = findJSDocComments(rootDir);
  
  const files = [];
  
  if (type === 'all' || type === 'readme') {
    const readme = generateREADME(project);
    writeFileSync(join(rootDir, 'README.md'), readme, 'utf-8');
    files.push({ file: 'README.md', size: readme.length });
  }
  
  if (type === 'all' || type === 'api') {
    const apiDocs = generateAPIDocs(comments);
    writeFileSync(join(rootDir, 'docs', 'API.md'), apiDocs, 'utf-8');
    files.push({ file: 'docs/API.md', size: apiDocs.length });
  }
  
  const result = {
    type,
    project: project.name,
    files,
    generatedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'generate_docs', type, files: files.length });
  }
  
  return result;
}
