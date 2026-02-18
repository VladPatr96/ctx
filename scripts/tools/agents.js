/**
 * Agent domain tools: ctx_list_agents, ctx_create_agent
 *
 * Manages base agents (agents/*.md) and generated agents (agents/generated/*.md).
 */

import { z } from 'zod';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, resolve, sep } from 'node:path';

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || join(process.cwd());
const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');
const GENERATED_DIR = join(AGENTS_DIR, 'generated');
const AGENT_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export function isValidAgentName(name) {
  return typeof name === 'string' && AGENT_NAME_RE.test(name);
}

export function resolveGeneratedAgentPath(name) {
  if (!isValidAgentName(name)) {
    throw new Error('Invalid agent name. Use kebab-case: lowercase letters, digits, hyphen.');
  }

  const baseDir = resolve(GENERATED_DIR);
  const outFile = resolve(baseDir, `${name}.md`);
  const inBase = outFile === baseDir || outFile.startsWith(`${baseDir}${sep}`);
  if (!inBase) {
    throw new Error('Invalid agent path');
  }
  return outFile;
}

function listAgentFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(f => {
      const content = readFileSync(join(dir, f), 'utf-8');
      const nameMatch = content.match(/^#\s+(.+)/m);
      const roleMatch = content.match(/\*\*(?:Role|Роль)\*\*:\s*(.+)/i);
      return {
        file: f,
        name: basename(f, '.md'),
        title: nameMatch ? nameMatch[1].trim() : basename(f, '.md'),
        role: roleMatch ? roleMatch[1].trim() : null
      };
    });
}

export function registerAgentTools(server) {

  server.registerTool(
    'ctx_list_agents',
    {
      description: 'Список всех агентов: базовые (agents/*.md) и сгенерированные (agents/generated/*.md).',
      inputSchema: z.object({}).shape,
    },
    async () => {
      const base = listAgentFiles(AGENTS_DIR).map(a => ({ ...a, type: 'base' }));
      const generated = listAgentFiles(GENERATED_DIR).map(a => ({ ...a, type: 'generated' }));
      const all = [...base, ...generated];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ total: all.length, base: base.length, generated: generated.length, agents: all }, null, 2)
        }]
      };
    }
  );

  server.registerTool(
    'ctx_create_agent',
    {
      description: 'Создать нового агента из шаблона. Файл сохраняется в agents/generated/<name>.md.',
      inputSchema: z.object({
        name: z.string().regex(AGENT_NAME_RE).describe('Имя агента (латиница, kebab-case)'),
        role: z.string().describe('Роль агента (кратко)'),
        responsibilities: z.array(z.string()).describe('Список обязанностей'),
        stage: z.string().optional().describe('Стадия pipeline когда агент активен'),
        tools: z.array(z.string()).optional().describe('Список MCP tools / CLI tools которые агент может использовать')
      }).shape,
    },
    async ({ name, role, responsibilities, stage, tools }) => {
      // Load template
      const templateFile = join(AGENTS_DIR, '_template.md');
      if (!existsSync(templateFile)) {
        return { content: [{ type: 'text', text: 'Error: agents/_template.md not found' }] };
      }

      let template = readFileSync(templateFile, 'utf-8');
      template = template.replace(/\{\{NAME\}\}/g, name);
      template = template.replace(/\{\{ROLE\}\}/g, role);
      template = template.replace(/\{\{RESPONSIBILITIES\}\}/g, responsibilities.map(r => `- ${r}`).join('\n'));
      template = template.replace(/\{\{STAGE\}\}/g, stage || 'any');
      template = template.replace(/\{\{TOOLS\}\}/g, tools ? tools.map(t => `- ${t}`).join('\n') : '- (определяется задачей)');

      if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true });

      const outFile = resolveGeneratedAgentPath(name);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(outFile, template);

      return {
        content: [{ type: 'text', text: `Agent created: agents/generated/${name}.md` }]
      };
    }
  );
}
