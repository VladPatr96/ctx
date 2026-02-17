#!/usr/bin/env node

/**
 * Agent Factory — генерация кастомных агентов из шаблона.
 *
 * Usage:
 *   node agent-factory.js <name> <role> <responsibilities...>
 *
 * Example:
 *   node agent-factory.js "security-auditor" "Аудит безопасности кода" "OWASP проверки" "Поиск уязвимостей"
 *
 * Output: agents/generated/<name>.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, '..', 'agents');
const GENERATED_DIR = join(AGENTS_DIR, 'generated');
const TEMPLATE_FILE = join(AGENTS_DIR, '_template.md');

export function createAgent({ name, role, responsibilities, stage, tools }) {
  if (!existsSync(TEMPLATE_FILE)) {
    throw new Error(`Template not found: ${TEMPLATE_FILE}`);
  }

  let template = readFileSync(TEMPLATE_FILE, 'utf-8');
  template = template.replace(/\{\{NAME\}\}/g, name);
  template = template.replace(/\{\{ROLE\}\}/g, role);
  template = template.replace(/\{\{RESPONSIBILITIES\}\}/g, responsibilities.map(r => `- ${r}`).join('\n'));
  template = template.replace(/\{\{STAGE\}\}/g, stage || 'any');
  template = template.replace(/\{\{TOOLS\}\}/g, tools ? tools.map(t => `- ${t}`).join('\n') : '- (determined by task)');

  if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true });

  const outFile = join(GENERATED_DIR, `${name}.md`);
  writeFileSync(outFile, template);
  return outFile;
}

// CLI mode
if (process.argv[1] && process.argv[1].includes('agent-factory.js') && process.argv.length >= 4) {
  const [, , name, role, ...responsibilities] = process.argv;
  const outFile = createAgent({ name, role, responsibilities });
  console.log(`Agent created: ${outFile}`);
}
