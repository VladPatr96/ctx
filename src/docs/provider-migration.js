import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProviderMigrationArtifact } from '../contracts/provider-schemas.js';
import { getProviderModeContract } from '../providers/provider-modes.js';
import { listProviderSetupDefinitions } from '../setup/provider-catalog.js';

export function buildProviderMigrationArtifact({ now = new Date().toISOString() } = {}) {
  const providers = listProviderSetupDefinitions().map((entry) => {
    const runtimeContract = getProviderModeContract(entry.id);
    if (!runtimeContract) {
      throw new Error(`Missing runtime contract for provider: ${entry.id}`);
    }

    return {
      id: entry.id,
      name: entry.name,
      setupDescription: entry.description,
      hostInterface: entry.hostInterface,
      hostMcpOptional: entry.hostMcpOptional,
      setupCommand: entry.setupCommand,
      preferredInvocation: entry.preferredInvocation,
      configurationSurface: entry.configurationSurface,
      detectionSignals: entry.detectionSignals,
      migrationNotes: entry.migrationNotes,
      sourceDocs: entry.sourceDocs,
      runtime: {
        mode: runtimeContract.mode,
        adapter: runtimeContract.adapter,
        executionTransport: runtimeContract.executionTransport,
        supportsCheckpointing: runtimeContract.lifecycle.supportsCheckpointing,
        supportsSuspend: runtimeContract.lifecycle.supportsSuspend,
        timeoutAction: runtimeContract.lifecycle.timeoutAction,
      },
    };
  });

  return createProviderMigrationArtifact({
    generatedAt: now,
    providers,
  });
}

export function writeProviderMigrationArtifact({
  rootDir = process.cwd(),
  outputPath = 'docs/setup/providers/provider-compatibility.json',
  now,
} = {}) {
  const artifact = buildProviderMigrationArtifact({ now });
  const resolvedOutput = resolve(rootDir, outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
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
  const artifact = outputPath
    ? writeProviderMigrationArtifact({ outputPath })
    : buildProviderMigrationArtifact();
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}

