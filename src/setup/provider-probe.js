import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProviders, hasCtxMcpConfig } from './provider-detector.js';
import { validateProvider } from './config-validator.js';
import { parseProviderProbe } from '../contracts/provider-schemas.js';
import { hasOpenCodeCtxInstall, resolveHomeDir } from './opencode-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

export function probeProviders() {
  return detectProviders().map((provider) => probeProvider(provider));
}

export function probeProvider(providerOrId) {
  const provider = typeof providerOrId === 'string'
    ? detectProviders().find((entry) => entry.id === providerOrId)
    : providerOrId;

  if (!provider) {
    throw new Error(`Unknown provider: ${providerOrId}`);
  }

  const validation = validateProvider(provider);
  const ctxConfigured = isCtxConfigured(provider.id);
  const readiness = !provider.available
    ? 'unavailable'
    : (ctxConfigured ? 'ready' : 'needs_setup');

  return parseProviderProbe({
    id: provider.id,
    name: provider.name,
    available: provider.available,
    readiness,
    ctxConfigured,
    canConfigure: provider.available,
    statusLine: buildStatusLine(readiness, validation),
    reason: buildReason(readiness, provider.reason, validation.message),
    detection: {
      reason: provider.reason,
      details: provider.details,
    },
    validation,
  });
}

function isCtxConfigured(providerId) {
  switch (providerId) {
    case 'antigravity':
    case 'claude':
      return hasCtxMcpConfig();
    case 'codex':
      return existsSync(join(ROOT_DIR, '.codex', 'skills', 'ctx', 'SKILL.md'))
        || existsSync(join(ROOT_DIR, 'skills', 'ctx', 'SKILL.md'))
        || existsSync(join(ROOT_DIR, 'skills', 'ctx-universal-full', 'SKILL.md'));
    case 'gemini':
      return existsSync(join(resolveHomeDir(), '.config', 'gemini-cli', 'skills', 'ctx', 'SKILL.md'));
    case 'opencode':
      return hasOpenCodeCtxInstall();
    default:
      return false;
  }
}

function buildStatusLine(readiness, validation) {
  if (readiness === 'ready') {
    if (validation.status === 'valid') {
      return 'CTX is configured and provider health checks passed';
    }
    return `CTX is configured; provider health is ${validation.status}`;
  }

  if (readiness === 'needs_setup') {
    return 'Provider is detected but CTX setup is still required';
  }

  return 'Provider is not available on this machine yet';
}

function buildReason(readiness, detectionReason, validationMessage) {
  if (readiness === 'ready') {
    return `Ready: ${validationMessage}`;
  }

  if (readiness === 'needs_setup') {
    return `Needs setup: ${detectionReason}`;
  }

  return `Unavailable: ${validationMessage}`;
}
