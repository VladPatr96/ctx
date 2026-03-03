import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStatusLine,
  collectDateCandidates,
  formatCountdown,
  formatDuration,
  parseArgs,
  parseEpochMs
} from '../scripts/provider-limits-statusline.js';

test('parseEpochMs handles epoch and ISO strings', () => {
  assert.equal(parseEpochMs(1772522113451), 1772522113451);
  assert.equal(parseEpochMs('1772522113451'), 1772522113451);
  assert.equal(parseEpochMs('2026-03-03T10:00:00.000Z'), Date.parse('2026-03-03T10:00:00.000Z'));
  assert.equal(parseEpochMs('not-a-date'), null);
});

test('formatDuration formats compact units', () => {
  assert.equal(formatDuration(5 * 60000), '5m');
  assert.equal(formatDuration(2 * 3600000 + 7 * 60000), '2h7m');
  assert.equal(formatDuration(3 * 24 * 3600000 + 4 * 3600000), '3d4h');
});

test('formatCountdown returns -- when timestamp is missing', () => {
  assert.equal(formatCountdown(null, Date.now()), '--');
});

test('collectDateCandidates walks nested structures', () => {
  const values = collectDateCandidates({
    a: '2026-03-03T10:00:00.000Z',
    b: ['1772522113451', { c: 1772522113000 }]
  });
  assert.equal(values.length, 3);
  assert.ok(values.every(v => Number.isFinite(v)));
});

test('buildStatusLine renders all providers in plain mode', () => {
  const nowMs = Date.parse('2026-03-03T10:00:00.000Z');
  const line = buildStatusLine({
    nowMs,
    providerHealth: {
      claude: { calls: 5, failures: 0 },
      gemini: { calls: 3, failures: 1 },
      codex: { calls: 2, failures: 0 },
      opencode: { calls: 1, failures: 0 }
    },
    claude: {
      fiveRemainingPct: 80,
      weekRemainingPct: 62,
      fiveResetMs: nowMs + 7200000,
      weekResetMs: nowMs + 172800000
    },
    gemini: { expiryMs: nowMs + 3600000, authLeft: '1h0m' },
    codex: { hasAuth: true, lastRefreshAgo: '10m' },
    opencode: { hasAccount: true, nextResetMs: null, lastUsedAgo: '5m' }
  }, { noColor: true });

  assert.match(line, /CLAUDE/);
  assert.match(line, /GEMINI/);
  assert.match(line, /CODEX/);
  assert.match(line, /OPENCODE/);
  assert.match(line, /use:5/);
});

test('parseArgs handles watch, interval and color flags', () => {
  const opts = parseArgs(['--watch', '--interval=9', '--no-color']);
  assert.equal(opts.watch, true);
  assert.equal(opts.intervalSec, 9);
  assert.equal(opts.noColor, true);
});

test('buildStatusLine renders OpenCode model limits summary', () => {
  const nowMs = Date.parse('2026-03-03T10:00:00.000Z');
  const line = buildStatusLine({
    nowMs,
    providerHealth: {
      claude: { calls: 0 },
      gemini: { calls: 0 },
      codex: { calls: 0 },
      opencode: { calls: 4 }
    },
    claude: null,
    gemini: { expiryMs: null, authLeft: '--' },
    codex: { hasAuth: false, lastRefreshAgo: '--' },
    opencode: {
      hasAccount: true,
      nextResetMs: null,
      resetLeft: '--',
      lastUsedAgo: '3m',
      modelLimits: {
        connectedProviders: 3,
        totalModels: 28,
        maxContext: 400000,
        maxOutput: 128000,
        selected: {
          providerId: 'openai',
          modelId: 'openai/gpt-5.3-codex',
          context: 400000,
          output: 128000
        }
      }
    }
  }, { noColor: true });

  assert.match(line, /OPENCODE/);
  assert.match(line, /mdl:gpt-5.3-codex/);
  assert.match(line, /400k\/128k/);
  assert.match(line, /keys:3 mdl:28/);
  assert.match(line, /use:4/);
});
