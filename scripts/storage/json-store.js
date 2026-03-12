import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  appendLineLocked,
  readJsonFile,
  withLockSync,
  writeFileAtomic,
  writeJsonAtomic
} from '../utils/state-io.js';
import { StorageAdapter } from './storage-adapter.js';

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export class JsonStore extends StorageAdapter {
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || '.data';
    this.pipelineFile = join(this.dataDir, 'pipeline.json');
    this.logFile = join(this.dataDir, 'log.jsonl');
    this.pipelineLockFile = join(this.dataDir, '.pipeline.lock');
    this.logLockFile = join(this.dataDir, '.log.lock');
  }

  readPipeline(fallbackValue) {
    return readJsonFile(this.pipelineFile, fallbackValue);
  }

  readLog(limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 50);
    try {
      if (!existsSync(this.logFile)) return [];
      return readFileSync(this.logFile, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .slice(-normalizedLimit)
        .map(parseLogEntry)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  writePipeline(pipeline) {
    ensureDir(this.dataDir);
    withLockSync(this.pipelineLockFile, () => {
      writeJsonAtomic(this.pipelineFile, pipeline);
    });
  }

  appendLog(entry) {
    ensureDir(this.dataDir);
    appendLineLocked(this.logFile, JSON.stringify(entry), this.logLockFile);
  }

  clearLog() {
    ensureDir(this.dataDir);
    withLockSync(this.logLockFile, () => {
      writeFileAtomic(this.logFile, '');
    });
  }
}

function parseLogEntry(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
