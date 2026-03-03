/**
 * docs-changelog.js — Генерация CHANGELOG.md
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function docsChangelog(args, ctx) {
  const { appendLog } = ctx || {};
  
  const version = args.version || '1.0.0';
  const rootDir = process.cwd();
  
  // Generate changelog
  const changelog = `# Changelog

All notable changes to this project will be documented in this file.

## [${version}] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial release
- Core functionality implemented
- Documentation generated

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

## [0.1.0] - ${new Date().toISOString().split('T')[0]}

### Added
- Project initialization
`;

  // Write changelog
  writeFileSync(join(rootDir, 'CHANGELOG.md'), changelog, 'utf-8');
  
  const result = {
    file: 'CHANGELOG.md',
    version,
    size: changelog.length,
    generatedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'docs_changelog', version });
  }
  
  return result;
}
