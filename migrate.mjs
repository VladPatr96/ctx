import fs from 'fs';
import path from 'path';

const root = process.cwd();

const mappings = {
  'scripts/contracts': 'src/contracts',
  'scripts/tools': 'src/tools',
  'scripts/consilium': 'src/consilium',
  'scripts/knowledge': 'src/knowledge',
  'scripts/providers': 'src/providers',
  'scripts/evaluation': 'src/evaluation',
  'scripts/orchestrator': 'src/orchestrator',
  'scripts/reactions': 'src/reactions',
  'scripts/runtime': 'src/runtime',
  'scripts/cost-tracking': 'src/cost-tracking',
  'scripts/docs': 'src/docs',
  'scripts/skills': 'src/skills',
  'scripts/ui': 'src/ui',
  'scripts/testing': 'src/testing',
  'scripts/mcp': 'src/tools',       
  
  'scripts/config': 'src/core/config',
  'scripts/storage': 'src/core/storage',
  'scripts/cache': 'src/core/cache',
  'scripts/utils': 'src/core/utils',
  
  'scripts/setup': 'src/setup',
  
  'scripts/ctx-mcp-hub.js': 'src/core/mcp-hub.js',
  'scripts/ctx-cli.js': 'src/core/cli.js',
  'scripts/ctx-setup.js': 'src/setup/setup-providers.js',
  'scripts/ctx-wizard.js': 'src/setup/wizard.js',
  'scripts/ctx-indexer.js': 'src/setup/indexer.js',
  'scripts/cli/init.js': 'src/setup/init.js',
  'scripts/ctx-session-save.js': 'src/knowledge/session-save.js',
  'scripts/dashboard-backend.js': 'src/dashboard/server.js',
  'scripts/dashboard-frontend.js': 'src/dashboard/frontend.js',
  'scripts/dashboard-actions.js': 'src/dashboard/actions.js',
  'scripts/ctx-dashboard.js': 'src/dashboard/launcher.js',
  'scripts/mcp/register-ctx-tools.js': 'src/tools/register.js',
  'scripts/mcp/tool-manifest.js': 'src/tools/tool-manifest.js',
};

const fileMoves = new Map();

function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir)) {
    const fullMode = path.join(dir, item);
    if (fs.statSync(fullMode).isDirectory()) files.push(...walk(fullMode));
    else files.push(fullMode);
  }
  return files;
}

const allScripts = walk(path.join(root, 'scripts'));

for (const oldAbs of allScripts) {
  const oldRel = path.relative(root, oldAbs).replace(/\\/g, '/');
  
  let newRel = null;
  if (mappings[oldRel]) {
    newRel = mappings[oldRel];
  } else {
    let bestPrefix = '';
    for (const prefix of Object.keys(mappings)) {
      if (oldRel.startsWith(prefix + '/')) {
        if (prefix.length > bestPrefix.length) {
          bestPrefix = prefix;
        }
      }
    }
    if (bestPrefix) {
      newRel = mappings[bestPrefix] + oldRel.slice(bestPrefix.length);
    } else {
      newRel = oldRel;
    }
  }
  
  if (oldRel !== newRel) {
    fileMoves.set(oldAbs, path.join(root, newRel));
  }
}

const getNewPathIfMoved = (absPath) => {
  return fileMoves.get(absPath) || absPath;
};

for (const [oldAbs, newAbs] of fileMoves.entries()) {
  fs.mkdirSync(path.dirname(newAbs), { recursive: true });
  
  let content = fs.readFileSync(oldAbs, 'utf-8');
  
  if (oldAbs.endsWith('.js') || oldAbs.endsWith('.mjs') || oldAbs.endsWith('.ts')) {
    content = content.replace(/(from\s+['"]|import\s*\(\s*['"])([^'"]+)(['"])/g, (match, prefix, importPath, suffix) => {
      if (importPath.startsWith('.')) {
         let oldImportAbs = path.resolve(path.dirname(oldAbs), importPath);
         
         let targetFileAbs = null;
         if (fs.existsSync(oldImportAbs) && fs.statSync(oldImportAbs).isFile()) targetFileAbs = oldImportAbs;
         else if (fs.existsSync(oldImportAbs + '.js')) targetFileAbs = oldImportAbs + '.js';
         else if (fs.existsSync(path.join(oldImportAbs, 'index.js'))) targetFileAbs = path.join(oldImportAbs, 'index.js');
         
         let finalImportAbs = targetFileAbs ? getNewPathIfMoved(targetFileAbs) : getNewPathIfMoved(oldImportAbs);
         
         let newRelPath = path.relative(path.dirname(newAbs), finalImportAbs).replace(/\\/g, '/');
         if (!newRelPath.startsWith('.')) newRelPath = './' + newRelPath;
         
         if (!importPath.endsWith('.js') && newRelPath.endsWith('.js') && !fs.existsSync(oldImportAbs)) {
            let newRawAbs = getNewPathIfMoved(oldImportAbs);
            newRelPath = path.relative(path.dirname(newAbs), newRawAbs).replace(/\\/g, '/');
            if (!newRelPath.startsWith('.')) newRelPath = './' + newRelPath;
         }
         
         return prefix + newRelPath + suffix;
      }
      return match;
    });
  }
  
  fs.writeFileSync(newAbs, content, 'utf-8');
}

const tests = walk(path.join(root, 'tests'));
for (const testAbs of tests) {
  if (testAbs.endsWith('.js') || testAbs.endsWith('.mjs')) {
    let content = fs.readFileSync(testAbs, 'utf-8');
    content = content.replace(/(from\s+['"]|import\s*\(\s*['"])([^'"]+)(['"])/g, (match, prefix, importPath, suffix) => {
      if (importPath.startsWith('.')) {
         let oldImportAbs = path.resolve(path.dirname(testAbs), importPath);
         
         let targetFileAbs = null;
         if (fs.existsSync(oldImportAbs) && fs.statSync(oldImportAbs).isFile()) targetFileAbs = oldImportAbs;
         else if (fs.existsSync(oldImportAbs + '.js')) targetFileAbs = oldImportAbs + '.js';
         else if (fs.existsSync(path.join(oldImportAbs, 'index.js'))) targetFileAbs = path.join(oldImportAbs, 'index.js');
         
         let finalImportAbs = targetFileAbs ? getNewPathIfMoved(targetFileAbs) : getNewPathIfMoved(oldImportAbs);
         
         let newRelPath = path.relative(path.dirname(testAbs), finalImportAbs).replace(/\\/g, '/');
         if (!newRelPath.startsWith('.')) newRelPath = './' + newRelPath;
         
         if (!importPath.endsWith('.js') && newRelPath.endsWith('.js') && !fs.existsSync(oldImportAbs)) {
            let newRawAbs = getNewPathIfMoved(oldImportAbs);
            newRelPath = path.relative(path.dirname(testAbs), newRawAbs).replace(/\\/g, '/');
            if (!newRelPath.startsWith('.')) newRelPath = './' + newRelPath;
         }
         
         return prefix + newRelPath + suffix;
      }
      return match;
    });
    fs.writeFileSync(testAbs, content, 'utf-8');
  }
}

for (const oldAbs of fileMoves.keys()) {
  fs.unlinkSync(oldAbs);
}

// Write shims
const shims = {
  'scripts/ctx-mcp-hub.js': "#!/usr/bin/env node\nimport '../src/core/mcp-hub.js';\n",
  'scripts/ctx-cli.js': "#!/usr/bin/env node\nimport '../src/core/cli.js';\n",
  'scripts/ctx-setup.js': "#!/usr/bin/env node\nimport '../src/setup/setup-providers.js';\n",
  'scripts/ctx-dashboard.js': "#!/usr/bin/env node\nimport '../src/dashboard/launcher.js';\n",
  'scripts/ctx-session-save.js': "#!/usr/bin/env node\nimport '../src/knowledge/session-save.js';\n",
};

for (const [shimRel, shimContent] of Object.entries(shims)) {
  fs.writeFileSync(path.join(root, shimRel), shimContent, 'utf-8');
}

console.log(`Migrated ${fileMoves.size} files successfully.`);
