/**
 * skill-loader.js — Dynamic skill loader for MCP Hub
 * 
 * Автоматически загружает скиллы и регистрирует их как MCP tools
 */

import { z } from 'zod';
import { listEnabledSkills, generateMCPTools, syncRegistry } from './skill-registry.js';
import { loadSkillCommandHandlerByName } from './skill-contracts.js';

const SKILL_TOOL_INPUT_SCHEMA = z.object({}).passthrough();

function emitSkillLog(logger, message) {
  if (!logger) return;
  if (typeof logger === 'function') {
    logger(message);
    return;
  }
  if (typeof logger.log === 'function') {
    logger.log(message);
  }
}

/**
 * Execute skill command
 */
async function executeSkillCommand(skillName, command, params) {
  const { handler } = await loadSkillCommandHandlerByName(skillName, command);
  return await handler(params);
}

/**
 * Register skill-based MCP tools
 */
export function registerSkillTools(server, { logger = null } = {}) {
  // Sync registry on startup
  emitSkillLog(logger, '[skill-loader] Syncing skill registry...');
  const registry = syncRegistry({ logger });
  emitSkillLog(logger, `[skill-loader] Found ${registry.size} skills`);
  
  // Generate MCP tools from skills
  const tools = generateMCPTools();
  emitSkillLog(logger, `[skill-loader] Generated ${tools.length} MCP tools from skills`);
  
  // Register each tool
  for (const tool of tools) {
    const toolName = tool.name;
    
    server.registerTool(
      toolName,
      {
        description: tool.description || `Execute ${tool.command} command`,
        inputSchema: SKILL_TOOL_INPUT_SCHEMA,
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
    
    emitSkillLog(logger, `[skill-loader] Registered MCP tool: ${toolName}`);
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
