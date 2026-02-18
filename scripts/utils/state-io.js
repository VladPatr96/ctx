import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait, short lock-retry window only
  }
}

function ensureDirForFile(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallbackValue;
  }
}

export function writeFileAtomic(filePath, data) {
  ensureDirForFile(filePath);
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpFile, data);
  renameSync(tmpFile, filePath);
}

export function writeJsonAtomic(filePath, value) {
  writeFileAtomic(filePath, JSON.stringify(value, null, 2));
}

export function withLockSync(lockFile, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2000;
  const retryMs = options.retryMs ?? 20;
  const staleMs = options.staleMs ?? 30000;
  const start = Date.now();

  ensureDirForFile(lockFile);

  let fd = null;
  while (Date.now() - start < timeoutMs) {
    try {
      fd = openSync(lockFile, 'wx');
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const ageMs = Date.now() - statSync(lockFile).mtimeMs;
        if (ageMs > staleMs) unlinkSync(lockFile);
      } catch {
        // ignore stale-check errors
      }
      sleepSync(retryMs);
    }
  }

  if (fd === null) {
    throw new Error(`Lock timeout for ${lockFile}`);
  }

  try {
    return fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
      // ignore close errors
    }
    try {
      unlinkSync(lockFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

export function appendLineLocked(filePath, line, lockFile) {
  const effectiveLock = lockFile || join(dirname(filePath), '.state.lock');
  withLockSync(effectiveLock, () => {
    ensureDirForFile(filePath);
    appendFileSync(filePath, `${line}\n`, 'utf-8');
  });
}
