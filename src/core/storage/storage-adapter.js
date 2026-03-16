import { StorageModeSchema, normalizeStorageMode } from '../../contracts/config-schemas.js';

export const STORAGE_MODES = Object.freeze([...StorageModeSchema.options]);
export { normalizeStorageMode };

export class StorageAdapter {
  readPipeline(_fallbackValue) {
    throw new Error('StorageAdapter.readPipeline is not implemented');
  }

  readLog(_limit = 50) {
    throw new Error('StorageAdapter.readLog is not implemented');
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
