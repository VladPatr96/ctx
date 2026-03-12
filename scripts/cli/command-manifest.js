import { generateCLICommands, syncRegistry } from '../skills/skill-registry.js';

export const BUILT_IN_CLI_COMMANDS = [
  {
    name: 'get_pipeline',
    source: 'built_in',
    description: 'Read current pipeline state.',
    usage: 'get_pipeline',
    skill: null,
    category: 'pipeline',
  },
  {
    name: 'set_stage',
    source: 'built_in',
    description: 'Move pipeline to a specific stage.',
    usage: 'set_stage --stage <name> [--data <json>]',
    skill: null,
    category: 'pipeline',
  },
  {
    name: 'update_pipeline',
    source: 'built_in',
    description: 'Patch allowed pipeline fields.',
    usage: 'update_pipeline --patch <json>',
    skill: null,
    category: 'pipeline',
  },
  {
    name: 'log_action',
    source: 'built_in',
    description: 'Append an action entry to the CTX log.',
    usage: 'log_action --entry <json>',
    skill: null,
    category: 'logging',
  },
  {
    name: 'log_error',
    source: 'built_in',
    description: 'Append an error entry to the CTX log.',
    usage: 'log_error --entry <json>',
    skill: null,
    category: 'logging',
  },
];

export function listBuiltInCliCommands() {
  return BUILT_IN_CLI_COMMANDS.map((command) => ({ ...command }));
}

export function listSkillCliCommands() {
  syncRegistry();
  const skillCommands = generateCLICommands();
  return [...skillCommands.entries()]
    .map(([name, info]) => ({
      name,
      source: 'skill',
      description: info.description || `Execute ${name} via skill runtime.`,
      usage: `${name} [--args ...]`,
      skill: info.skill || null,
      category: info.category || null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listCliCommands() {
  return [...listBuiltInCliCommands(), ...listSkillCliCommands()]
    .sort((left, right) => left.name.localeCompare(right.name));
}
