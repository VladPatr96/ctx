import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverSkills, getSkill, validateSkill } from './skill-registry.js';

export async function loadSkillCommandHandlerByName(skillName, command) {
  const skill = getSkill(skillName);
  if (!skill || !skill.enabled) {
    throw new Error(`Skill "${skillName}" not found or disabled`);
  }

  return loadSkillCommandHandler(skill, command);
}

export async function loadSkillCommandHandler(skill, command) {
  const indexPath = join(skill.path, 'index.js');
  if (existsSync(indexPath)) {
    const skillModule = await import(pathToFileURL(indexPath).href);
    if (typeof skillModule.default?.[command] === 'function') {
      return {
        handler: skillModule.default[command],
        path: indexPath,
        resolution: 'index',
      };
    }
  }

  const commandPath = join(skill.path, 'commands', `${command}.js`);
  if (existsSync(commandPath)) {
    const commandModule = await import(pathToFileURL(commandPath).href);
    if (typeof commandModule.default === 'function') {
      return {
        handler: commandModule.default,
        path: commandPath,
        resolution: 'command',
      };
    }
  }

  throw new Error(`Command "${command}" not found in skill "${skill.name}"`);
}

export async function validateSkillContracts(skillsDir) {
  const discoveredSkills = discoverSkills(skillsDir);
  const commandOwners = new Map();
  const contracts = [];
  const violations = [];

  for (const [skillId, skill] of discoveredSkills) {
    const validation = validateSkill(skill.path);
    if (!validation.valid) {
      violations.push({
        type: 'invalid-metadata',
        skill: skillId,
        errors: validation.errors,
      });
      continue;
    }

    for (const command of skill.commands) {
      const existingOwner = commandOwners.get(command);
      if (existingOwner) {
        violations.push({
          type: 'duplicate-command',
          command,
          skills: [existingOwner, skillId],
        });
        continue;
      }

      commandOwners.set(command, skillId);

      try {
        const resolved = await loadSkillCommandHandler(skill, command);
        contracts.push({
          skill: skillId,
          command,
          resolution: resolved.resolution,
          path: resolved.path,
        });
      } catch (error) {
        violations.push({
          type: 'missing-handler',
          skill: skillId,
          command,
          error: error.message,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    skillCount: discoveredSkills.size,
    commandCount: contracts.length,
    contracts,
    violations,
  };
}
