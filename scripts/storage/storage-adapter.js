export const STORAGE_MODES = Object.freeze(['json', 'sqlite']);

export function normalizeStorageMode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return STORAGE_MODES.includes(normalized) ? normalized : null;
}

export class StorageAdapter {
  readPipeline(_fallbackValue) {
    throw new Error('StorageAdapter.readPipeline is not implemented');
  }

  writePipeline(_pipeline) {
    throw new Error('StorageAdapter.writePipeline is not implemented');
  }

  appendLog(_entry) {
    throw new Error('StorageAdapter.appendLog is not implemented');
  }

  clearLog() {
    throw new Error('StorageAdapter.clearLog is not implemented');
  }
}
