/**
 * docs-readme.js — Генерация README.md
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function docsReadme(args, ctx) {
  const { appendLog } = ctx || {};
  
  const template = args.template || 'standard';
  const rootDir = process.cwd();
  
  // Read package.json
  const pkgPath = join(rootDir, 'package.json');
  let pkg = {};
  
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  }
  
  // Generate README based on template
  let readme = '';
  
  if (template === 'minimal') {
    readme = `# ${pkg.name || 'Project'}

${pkg.description || 'Description'}

## Installation

\`\`\`bash
npm install ${pkg.name || 'project'}
\`\`\`

## License

${pkg.license || 'MIT'}
`;
  } else {
    readme = `# ${pkg.name || 'Project'}

${pkg.description || 'Description'}

## Installation

\`\`\`bash
npm install ${pkg.name || 'project'}
\`\`\`

## Quick Start

\`\`\`javascript
import { Client } from '${pkg.name || 'project'}';

const client = new Client();
await client.start();
\`\`\`

## API Reference

See [API.md](./docs/API.md) for full documentation.

## Development

\`\`\`bash
npm install
npm test
\`\`\`

## License

${pkg.license || 'MIT'}
`;
  }
  
  // Write README
  writeFileSync(join(rootDir, 'README.md'), readme, 'utf-8');
  
  const result = {
    file: 'README.md',
    template,
    size: readme.length,
    generatedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'docs_readme', template });
  }
  
  return result;
}
