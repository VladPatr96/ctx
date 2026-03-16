import { join, resolve } from 'node:path';
import { generateMCPTools, syncRegistry } from '../skills/skill-registry.js';
import { registerCtxTools } from './register.js';

export function listMcpTools({ rootDir = process.cwd(), registryFile } = {}) {
  const resolvedRoot = resolve(rootDir);
  const effectiveRegistryFile = registryFile || join(resolvedRoot, '.data', 'skill-registry.json');
  const previousRegistryFile = process.env.CTX_SKILL_REGISTRY_FILE;

  process.env.CTX_SKILL_REGISTRY_FILE = effectiveRegistryFile;
  try {
    syncRegistry();
    const generatedSkillTools = generateMCPTools();
    const skillToolIndex = new Map(generatedSkillTools.map((tool) => [tool.name, tool]));
    const captured = [];
    const server = {
      registerTool(name, config) {
        const skillTool = skillToolIndex.get(name);
        captured.push({
          name,
          source: skillTool ? 'skill' : 'built_in',
          description: config?.description || '',
          inputType: config?.inputSchema?.type || 'object',
          skill: skillTool?.skill || null,
          category: skillTool?.category || null,
        });
      },
    };

    const previousConsoleLog = console.log;
    console.log = () => {};
    try {
      registerCtxTools(server, {
        getSession: () => ({ actions: [], errors: [], tasks: [] }),
        saveSession: () => {},
        runCommand: async () => ({ success: true, stdout: '[]', stderr: '' }),
        readJson: () => null,
        DATA_DIR: join(resolvedRoot, '.data'),
        GITHUB_OWNER: process.env.GITHUB_OWNER || '',
        knowledgeStore: null,
        kbSync: null,
        getResults: () => [],
        saveResults: () => {},
        cacheStore: null,
      });
    } finally {
      console.log = previousConsoleLog;
    }

    return captured.sort((left, right) => left.name.localeCompare(right.name));
  } finally {
    if (previousRegistryFile === undefined) delete process.env.CTX_SKILL_REGISTRY_FILE;
    else process.env.CTX_SKILL_REGISTRY_FILE = previousRegistryFile;
  }
}
