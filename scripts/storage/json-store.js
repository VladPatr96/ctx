import { existsSync, mkdirSync } from 'node:fs';
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
