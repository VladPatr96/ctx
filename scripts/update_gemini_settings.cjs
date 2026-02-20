const fs = require('fs');
const path = require('path');
const os = require('os');
const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');

if (!fs.existsSync(settingsPath)) {
  console.error('Settings file not found at: ' + settingsPath);
  process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const projectRoot = 'C:/Users/Патраваев/projects/claude_ctx'.replace(/\\/g, '/');

// 1. Configure MCP Server
if (!settings.mcpServers) settings.mcpServers = {};
settings.mcpServers['ctx-hub'] = {
  command: 'node',
  args: [path.join(projectRoot, 'scripts/ctx-mcp-hub.js').replace(/\\/g, '/')],
  env: {
    CTX_DATA_DIR: path.join(projectRoot, '.data').replace(/\\/g, '/'),
    GITHUB_OWNER: 'VladPatr96',
    CLAUDE_PROJECT_DIR: projectRoot,
    CLAUDE_PLUGIN_ROOT: projectRoot
  }
};

// 2. Configure Hooks
if (!settings.hooks) settings.hooks = {};

const ensureHook = (hookName, cmd) => {
  if (!settings.hooks[hookName]) {
    settings.hooks[hookName] = [{ type: 'command', command: cmd }];
    return;
  }
  
  let hookList = settings.hooks[hookName];
  if (!Array.isArray(hookList)) {
    // Some formats use { hooks: [...] }
    if (hookList.hooks) {
        hookList = hookList.hooks;
    } else {
        settings.hooks[hookName] = [settings.hooks[hookName]];
        hookList = settings.hooks[hookName];
    }
  }
  
  const exists = hookList.some(h => h.command === cmd);
  if (!exists) {
    hookList.push({ type: 'command', command: cmd });
  }
};

const compactCmd = 'node "' + path.join(projectRoot, 'scripts/ctx-session-save.js').replace(/\\/g, '/') + '" --event compact';
const stopCmd = 'node "' + path.join(projectRoot, 'scripts/ctx-session-save.js').replace(/\\/g, '/') + '" --event stop';

ensureHook('PreCompress', compactCmd);
ensureHook('SessionEnd', stopCmd);

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log('Global settings updated successfully');
