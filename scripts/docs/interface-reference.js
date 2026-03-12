import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterfaceReference } from '../contracts/interface-reference-schemas.js';
import { listCliCommands } from '../cli/command-manifest.js';
import { listMcpTools } from '../mcp/tool-manifest.js';

export function buildInterfaceReference({ rootDir = process.cwd(), now = new Date().toISOString() } = {}) {
  const resolvedRoot = resolve(rootDir);
  return createInterfaceReference({
    generatedAt: now,
    cliCommands: listCliCommands(),
    mcpTools: listMcpTools({ rootDir: resolvedRoot }),
  });
}

export function writeInterfaceReference({
  rootDir = process.cwd(),
  outputPath = 'docs/reference/interface-surface.json',
  now,
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const reference = buildInterfaceReference({ rootDir: resolvedRoot, now });
  const resolvedOutput = resolve(resolvedRoot, outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(reference, null, 2)}\n`, 'utf8');
  return reference;
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const writeIndex = args.indexOf('--write');
  const outputPath = writeIndex >= 0 && args[writeIndex + 1]
    ? args[writeIndex + 1]
    : null;
  const reference = outputPath
    ? writeInterfaceReference({ outputPath })
    : buildInterfaceReference();
  process.stdout.write(`${JSON.stringify(reference, null, 2)}\n`);
}
