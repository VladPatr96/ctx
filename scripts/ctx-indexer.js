#!/usr/bin/env node

/**
 * ctx-indexer.js — wrapper that delegates to src/setup/indexer.js.
 *
 * Exists in scripts/ for backward compatibility with SKILL.md references.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexerPath = join(__dirname, '..', 'src', 'setup', 'indexer.js');

await import(pathToFileURL(indexerPath).href);
