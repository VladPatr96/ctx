#!/usr/bin/env node
/**
 * Auto-update script for CTX skill in OpenCode
 * Run this to update the CTX skill to latest version
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const UNIVERSAL_SKILL = 'C:\\Users\\Патраваев\\projects\\claude_ctx\\skills\\ctx-universal-full\\SKILL.md';
const DEST_SKILL = join('C:\\Users\\Патраваев\\projects\\claude_ctx\\.test-opencode-skills', 'ctx', 'SKILL.md');

if (!existsSync(UNIVERSAL_SKILL)) {
  console.error('Source skill not found:', UNIVERSAL_SKILL);
  process.exit(1);
}

const source = readFileSync(UNIVERSAL_SKILL, 'utf-8');

if (existsSync(DEST_SKILL)) {
  const existing = readFileSync(DEST_SKILL, 'utf-8');
  if (source === existing) {
    console.log('✓ CTX skill is already up to date');
    process.exit(0);
  }
}

const destDir = dirname(DEST_SKILL);
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

writeFileSync(DEST_SKILL, source, 'utf-8');
console.log('✓ CTX skill updated successfully');
console.log('  Source:', UNIVERSAL_SKILL);
console.log('  Destination:', DEST_SKILL);
