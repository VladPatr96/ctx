/**
 * skill-loader.js — Dynamic skill loader for MCP Hub
 * 
 * Автоматически загружает скиллы и регистрирует их как MCP tools
 */

import { getSkill, listEnabledSkills, generateMCPTools, syncRegistry } from './skill-registry.js';

/**
 * Execute skill command
 */
async function executeSkillCommand(skillName, command, params) {
  const skill = getSkill(skillName);
  
  if (!skill || !skill.enabled) {
    throw new Error(`Skill "${skillName}" not found or disabled`);
  }
  
  // Load skill module dynamically
  const skillModulePath = join(skill.path, 'index.js');
  
  if (existsSync(skillModulePath)) {
    const { default: skillModule } = await import(pathToFileURL(skillModulePath).href);
    
    if (typeof skillModule[command] === 'function') {
      return await skillModule[command](params);
    }
  }
  
  // Fallback: try to load command from commands/ directory
  const commandPath = join(skill.path, 'commands', `${command}.js`);
  
  if (existsSync(commandPath)) {
    const { default: commandFn } = await import(pathToFileURL(commandPath).href);
    return await commandFn(params);
  }
  
  throw new Error(`Command "${command}" not found in skill "${skillName}"`);
}

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Register skill-based MCP tools
 */
export function registerSkillTools(server) {
  // Sync registry on startup
  console.log('[skill-loader] Syncing skill registry...');
  const registry = syncRegistry();
  console.log(`[skill-loader] Found ${registry.size} skills`);
  
  // Generate MCP tools from skills
  const tools = generateMCPTools();
  console.log(`[skill-loader] Generated ${tools.length} MCP tools from skills`);
  
  // Register each tool
  for (const tool of tools) {
    const toolName = tool.name;
    
    server.tool(
      toolName,
      {
        type: 'object',
        properties: {
          params: {
            type: 'object',
            description: `Parameters for ${tool.command} command`
          }
        }
      },
      async (params) => {
        try {
          const result = await executeSkillCommand(tool.skill, tool.command, params);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: error.message })
            }],
            isError: true
          };
        }
      }
    );
    
    console.log(`[skill-loader] ✓ Registered MCP tool: ${toolName}`);
  }
  
  return tools;
}

/**
 * Get skill commands for help
 */
export function getSkillCommandsHelp() {
  const skills = listEnabledSkills();
  const help = {};
  
  for (const skill of skills) {
    for (const cmd of skill.commands) {
      help[cmd] = {
        skill: skill.name,
        description: skill.description,
        category: skill.category
      };
    }
  }
  
  return help;
}
