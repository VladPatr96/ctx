/**
 * skill-registry.js — Auto-discovery and registration system for CTX skills
 * 
 * Автоматически находит и регистрирует все скиллы из директории skills/
 * Поддерживает hot-reload и валидацию
 */

import { readdirSync, readFileSync, existsSync, watch, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_SKILLS_DIR = join(__dirname, '..', '..', 'skills');
const DEFAULT_REGISTRY_FILE = join(__dirname, '..', '..', '.data', 'skill-registry.json');

function emitRegistryLog(logger, message) {
  if (!logger) return;
  if (typeof logger === 'function') {
    logger(message);
    return;
  }
  if (typeof logger.log === 'function') {
    logger.log(message);
  }
}

export function getSkillsDir() {
  return process.env.CTX_SKILLS_DIR || DEFAULT_SKILLS_DIR;
}

export function getRegistryFile() {
  return process.env.CTX_SKILL_REGISTRY_FILE || DEFAULT_REGISTRY_FILE;
}

/**
 * Parse skill metadata from SKILL.md frontmatter
 */
function parseSkillMetadata(skillPath) {
  const skillFile = join(skillPath, 'SKILL.md');
  
  if (!existsSync(skillFile)) {
    return null;
  }
  
  const content = readFileSync(skillFile, 'utf-8');
  
  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }
  
  const frontmatter = frontmatterMatch[1];
  const metadata = {};
  
  // Parse simple YAML (name, description)
  let currentKey = null;
  let currentValue = '';
  
  frontmatter.split('\n').forEach(line => {
    const match = line.match(/^(\w+):\s*(.*)$/);
    
    if (match) {
      // Save previous key-value
      if (currentKey) {
        metadata[currentKey] = currentValue.trim();
      }
      
      const [, key, value] = match;
      currentKey = key;
      
      // Handle multiline values starting with >
      if (value.startsWith('>')) {
        currentValue = value.slice(1).trim();
      } else {
        currentValue = value.trim();
      }
    } else if (currentKey && line.startsWith('  ')) {
      // Continuation of multiline value
      currentValue += ' ' + line.trim();
    }
  });
  
  // Save last key-value
  if (currentKey) {
    metadata[currentKey] = currentValue.trim();
  }
  
  // Extract commands from skill file
  const commands = [];
  const commandRegex = /\/ctx\s+(\w+(?:-\w+)*)/g;
  let match;
  while ((match = commandRegex.exec(content)) !== null) {
    if (!commands.includes(match[1])) {
      commands.push(match[1]);
    }
  }
  
  return {
    ...metadata,
    commands,
    path: skillPath,
    file: skillFile,
    lastModified: Date.now()
  };
}

/**
 * Discover all skills recursively
 */
export function discoverSkills(skillsDir = getSkillsDir()) {
  const skills = new Map();
  
  function scanDirectory(dir, category = '') {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Check if directory contains SKILL.md
        const skillFile = join(fullPath, 'SKILL.md');
        if (existsSync(skillFile)) {
          // This is a skill directory
          const metadata = parseSkillMetadata(fullPath);
          if (metadata) {
            const skillName = entry.name;
            skills.set(skillName, {
              ...metadata,
              name: metadata.name || skillName,
              category: category || 'general',
              enabled: true
            });
          }
        } else {
          // This might be a category directory
          scanDirectory(fullPath, entry.name);
        }
      }
    }
  }
  
  scanDirectory(skillsDir);
  return skills;
}

/**
 * Load skill registry from disk or create new
 */
export function loadRegistry(registryFile = getRegistryFile()) {
  if (existsSync(registryFile)) {
    try {
      const data = JSON.parse(readFileSync(registryFile, 'utf-8'));
      return new Map(Object.entries(data));
    } catch (e) {
      console.error('[skill-registry] Failed to load registry:', e.message);
    }
  }
  return new Map();
}

/**
 * Save skill registry to disk
 */
export function saveRegistry(registry, registryFile = getRegistryFile()) {
  const dataDir = dirname(registryFile);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const data = Object.fromEntries(registry);
  writeFileSync(registryFile, JSON.stringify(data, null, 2));
}

/**
 * Sync discovered skills with registry
 */
export function syncRegistry({
  skillsDir = getSkillsDir(),
  registryFile = getRegistryFile(),
  logger = null,
} = {}) {
  const discovered = discoverSkills(skillsDir);
  const registry = loadRegistry(registryFile);
  
  // Add new skills
  for (const [name, skill] of discovered) {
    if (!registry.has(name)) {
      emitRegistryLog(logger, `[skill-registry] New skill discovered: ${name}`);
      registry.set(name, skill);
    } else {
      // Update metadata
      const existing = registry.get(name);
      registry.set(name, { ...existing, ...skill, enabled: existing.enabled });
    }
  }
  
  // Mark removed skills as disabled
  for (const [name, skill] of registry) {
    if (!discovered.has(name)) {
      emitRegistryLog(logger, `[skill-registry] Skill removed: ${name}`);
      skill.enabled = false;
    }
  }
  
  saveRegistry(registry, registryFile);
  return registry;
}

/**
 * Get skill by name
 */
export function getSkill(name) {
  const registry = loadRegistry();
  return registry.get(name);
}

/**
 * List all enabled skills
 */
export function listEnabledSkills() {
  const registry = loadRegistry();
  return Array.from(registry.values()).filter(s => s.enabled);
}

/**
 * List skills by category
 */
export function listSkillsByCategory(category) {
  const registry = loadRegistry();
  return Array.from(registry.values())
    .filter(s => s.enabled && s.category === category);
}

/**
 * Enable/disable skill
 */
export function setSkillEnabled(name, enabled) {
  const registry = loadRegistry();
  const skill = registry.get(name);
  if (skill) {
    skill.enabled = enabled;
    saveRegistry(registry);
    return true;
  }
  return false;
}

/**
 * Watch for skill changes (hot reload)
 */
export function watchSkills(callback) {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) return;
  
  watch(skillsDir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('SKILL.md')) {
      console.log(`[skill-registry] 🔄 Skill changed: ${filename}`);
      const registry = syncRegistry();
      if (callback) callback(registry);
    }
  });
}

/**
 * Generate MCP tools from skills
 */
export function generateMCPTools() {
  const skills = listEnabledSkills();
  const tools = [];
  
  for (const skill of skills) {
    // Each command becomes a potential MCP tool
    for (const cmd of skill.commands) {
      tools.push({
        name: `ctx_${cmd.replace(/-/g, '_')}`,
        description: skill.description || `Execute ${cmd} command`,
        skill: skill.name,
        category: skill.category,
        command: cmd
      });
    }
  }
  
  return tools;
}

/**
 * Generate CLI commands from skills
 */
export function generateCLICommands() {
  const skills = listEnabledSkills();
  const commands = new Map();
  
  for (const skill of skills) {
    for (const cmd of skill.commands) {
      commands.set(cmd, {
        skill: skill.name,
        category: skill.category,
        description: skill.description
      });
    }
  }
  
  return commands;
}

/**
 * Validate skill structure
 */
export function validateSkill(skillPath) {
  const errors = [];
  
  const skillFile = join(skillPath, 'SKILL.md');
  if (!existsSync(skillFile)) {
    errors.push('Missing SKILL.md file');
    return { valid: false, errors };
  }
  
  const metadata = parseSkillMetadata(skillPath);
  if (!metadata) {
    errors.push('Invalid or missing frontmatter in SKILL.md');
    return { valid: false, errors };
  }
  
  if (!metadata.name) {
    errors.push('Missing "name" in frontmatter');
  }
  
  if (!metadata.description) {
    errors.push('Missing "description" in frontmatter');
  }
  
  if (metadata.commands.length === 0) {
    errors.push('No commands found in SKILL.md');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    metadata
  };
}

// CLI interface
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  
  switch (command) {
    case 'discover':
      const skills = discoverSkills();
      console.log(JSON.stringify(Object.fromEntries(skills), null, 2));
      break;
      
    case 'sync':
      const registry = syncRegistry();
      console.log(`Synced ${registry.size} skills`);
      break;
      
    case 'list':
      const enabled = listEnabledSkills();
      console.log('Enabled skills:');
      enabled.forEach(s => console.log(`  - ${s.name} (${s.category})`));
      break;
      
    case 'tools':
      const tools = generateMCPTools();
      console.log(JSON.stringify(tools, null, 2));
      break;
      
    case 'commands':
      const cmds = generateCLICommands();
      console.log(JSON.stringify(Object.fromEntries(cmds), null, 2));
      break;
      
    case 'validate':
      const skillPath = process.argv[3];
      if (!skillPath) {
        console.error('Usage: node skill-registry.js validate <skill-path>');
        process.exit(1);
      }
      const result = validateSkill(skillPath);
      console.log(JSON.stringify(result, null, 2));
      break;
      
    default:
      console.log(`
Skill Registry - Auto-discovery system for CTX skills

Commands:
  discover   - Discover all skills in skills/ directory
  sync       - Sync discovered skills with registry
  list       - List all enabled skills
  tools      - Generate MCP tools from skills
  commands   - Generate CLI commands from skills
  validate   - Validate skill structure
      `);
  }
}
