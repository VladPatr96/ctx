import { StorageAdapter } from './storage-adapter.js';

function noop() {}
const SQLITE_MISS = Symbol('sqlite_miss');
const READ_SOURCES = new Set(['json', 'sqlite', 'auto']);

function stringifyStable(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export class ShadowStore extends StorageAdapter {
  constructor(options = {}) {
    super();
    if (!options.primary) {
      throw new Error('ShadowStore requires a primary adapter');
    }
    this.primary = options.primary;
    this.mirror = options.mirror || null;
    this.verifyWrites = Boolean(options.verifyWrites);
    this.readSource = normalizeReadSource(options.readSource) || 'json';
    this.warn = typeof options.onWarning === 'function' ? options.onWarning : noop;
    this.stats = {
      mirror_ok: 0,
      mirror_fail: 0,
      mismatch_detected: 0,
      read_sqlite_ok: 0,
      read_sqlite_fail: 0,
      read_fallback_json: 0
    };
  }

  getShadowStats() {
    return { ...this.stats };
  }

  readPipeline(fallbackValue) {
    if (!this.shouldReadFromMirror()) {
      return this.primary.readPipeline(fallbackValue);
    }

    try {
      const mirrored = this.mirror.readPipeline(SQLITE_MISS);
      if (mirrored === SQLITE_MISS) {
        this.stats.read_sqlite_fail += 1;
        return this.readPrimaryFallback(fallbackValue, 'empty_or_invalid_payload');
      }
      this.stats.read_sqlite_ok += 1;
      return mirrored;
    } catch (err) {
      this.stats.read_sqlite_fail += 1;
      return this.readPrimaryFallback(fallbackValue, 'sqlite_read_error', err);
    }
  }

  shouldReadFromMirror() {
    if (!this.mirror) return false;
    return this.readSource === 'sqlite' || this.readSource === 'auto';
  }

  readPrimaryFallback(fallbackValue, reason, err = null) {
    this.stats.read_fallback_json += 1;
    const suffix = err ? `: ${err.message}` : '';
    this.warn(`Shadow read fallback to JSON during readPipeline (${reason})${suffix}`);
    this.logPrimary({
      action: 'shadow_read_fallback',
      message: 'SQLite read failed; served JSON primary',
      operation: 'readPipeline',
      reason,
      error: err ? err.message : null
    });
    return this.primary.readPipeline(fallbackValue);
  }

  writePipeline(pipeline) {
    this.primary.writePipeline(pipeline);
    if (!this.mirror) return;

    try {
      this.mirror.writePipeline(pipeline);
      this.stats.mirror_ok += 1;
      if (this.verifyWrites) {
        const mirrored = this.mirror.readPipeline(null);
        if (stringifyStable(mirrored) !== stringifyStable(pipeline)) {
          this.stats.mismatch_detected += 1;
          this.logPrimary({
            action: 'shadow_mismatch',
            message: 'Mirror payload mismatch after writePipeline',
            operation: 'writePipeline'
          });
        }
      }
    } catch (err) {
      this.stats.mirror_fail += 1;
      this.warn(`Shadow write failed during writePipeline: ${err.message}`);
      this.logPrimary({
        action: 'shadow_mirror_fail',
        message: 'Mirror write failed during writePipeline',
        operation: 'writePipeline',
        error: err.message
      });
    }
  }

  appendLog(entry) {
    this.primary.appendLog(entry);
    if (!this.mirror) return;

    try {
      this.mirror.appendLog(entry);
      this.stats.mirror_ok += 1;
    } catch (err) {
      this.stats.mirror_fail += 1;
      this.warn(`Shadow write failed during appendLog: ${err.message}`);
      this.logPrimary({
        action: 'shadow_mirror_fail',
        message: 'Mirror write failed during appendLog',
        operation: 'appendLog',
        error: err.message
      });
    }
  }

  clearLog() {
    this.primary.clearLog();
    if (!this.mirror) return;
    try {
      this.mirror.clearLog();
      this.stats.mirror_ok += 1;
    } catch (err) {
      this.stats.mirror_fail += 1;
      this.warn(`Shadow write failed during clearLog: ${err.message}`);
      this.logPrimary({
        action: 'shadow_mirror_fail',
        message: 'Mirror clear failed during clearLog',
        operation: 'clearLog',
        error: err.message
      });
    }
  }

  close() {
    if (this.mirror && typeof this.mirror.close === 'function') {
      this.mirror.close();
    }
  }

  logPrimary(entry) {
    try {
      this.primary.appendLog({
        ts: new Date().toISOString(),
        ...entry
      });
    } catch {
      // keep shadow-write non-blocking
    }
  }
}

function normalizeReadSource(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return READ_SOURCES.has(normalized) ? normalized : null;
}
