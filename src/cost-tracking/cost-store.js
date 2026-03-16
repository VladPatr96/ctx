/**
 * Cost Store — persistent storage layer for cost tracking data
 *
 * Provides atomic, thread-safe operations for storing and retrieving cost data.
 * Follows the storage adapter pattern used in scripts/storage/json-store.js
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  readJsonFile,
  withLockSync,
  writeJsonAtomic
} from '../core/utils/state-io.js';
import { resolveDataDir } from '../core/storage/index.js';

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export class CostStore {
  constructor(options = {}) {
    this.dataDir = resolveDataDir(options);
    this.costFile = join(this.dataDir, 'cost-tracking.json');
    this.lockFile = join(this.dataDir, '.cost-tracking.lock');
  }

  /**
   * Read cost data from storage
   * @returns {Object} Cost data structure {requests: [], sessions: {}, projects: {}}
   */
  readCostData() {
    const fallback = {
      requests: [],
      sessions: {},
      projects: {},
      metadata: { createdAt: new Date().toISOString() }
    };
    return readJsonFile(this.costFile, fallback);
  }

  /**
   * Write cost data to storage (atomic, locked)
   * @param {Object} data - Cost data to write
   */
  writeCostData(data) {
    ensureDir(this.dataDir);
    withLockSync(this.lockFile, () => {
      // Ensure metadata is updated
      data.metadata = data.metadata || {};
      data.metadata.updatedAt = new Date().toISOString();
      writeJsonAtomic(this.costFile, data);
    });
  }

  /**
   * Record a cost entry
   * @param {Object} entry - Cost record to store
   * @param {string} entry.provider - Provider name
   * @param {number} entry.cost - Cost in USD
   * @param {string} [entry.model] - Model identifier
   * @param {number} [entry.inputTokens] - Input tokens used
   * @param {number} [entry.outputTokens] - Output tokens used
   * @param {string} [entry.sessionId] - Session identifier
   * @param {string} [entry.projectId] - Project identifier
   */
  recordCost(entry) {
    const data = this.readCostData();

    const record = {
      timestamp: entry.timestamp || new Date().toISOString(),
      provider: entry.provider,
      model: entry.model || 'unknown',
      cost: entry.cost,
      inputTokens: entry.inputTokens || 0,
      outputTokens: entry.outputTokens || 0,
      totalTokens: (entry.inputTokens || 0) + (entry.outputTokens || 0),
      sessionId: entry.sessionId || null,
      projectId: entry.projectId || null,
      metadata: entry.metadata || {}
    };

    data.requests.push(record);

    // Update session aggregation
    if (entry.sessionId) {
      if (!data.sessions[entry.sessionId]) {
        data.sessions[entry.sessionId] = {
          createdAt: record.timestamp,
          totalCost: 0,
          totalTokens: 0,
          requests: 0
        };
      }
      const session = data.sessions[entry.sessionId];
      session.totalCost += entry.cost;
      session.totalTokens += record.totalTokens;
      session.requests += 1;
      session.updatedAt = record.timestamp;
    }

    // Update project aggregation
    if (entry.projectId) {
      if (!data.projects[entry.projectId]) {
        data.projects[entry.projectId] = {
          createdAt: record.timestamp,
          totalCost: 0,
          totalTokens: 0,
          requests: 0
        };
      }
      const project = data.projects[entry.projectId];
      project.totalCost += entry.cost;
      project.totalTokens += record.totalTokens;
      project.requests += 1;
      project.updatedAt = record.timestamp;
    }

    this.writeCostData(data);
  }

  /**
   * Get total cost across all requests
   * @returns {number} Total cost in USD
   */
  getTotalCost() {
    const data = this.readCostData();
    if (!data.requests || data.requests.length === 0) return 0;

    return data.requests.reduce((sum, req) => sum + (req.cost || 0), 0);
  }

  /**
   * Get costs aggregated by provider
   * @returns {Object} Map of provider → {totalCost, requests, totalTokens, models}
   */
  getCostsByProvider() {
    const data = this.readCostData();
    if (!data.requests || data.requests.length === 0) return {};

    const byProvider = {};

    for (const req of data.requests) {
      const provider = req.provider;
      if (!byProvider[provider]) {
        byProvider[provider] = {
          totalCost: 0,
          requests: 0,
          totalTokens: 0,
          models: {}
        };
      }

      byProvider[provider].totalCost += req.cost || 0;
      byProvider[provider].requests += 1;
      byProvider[provider].totalTokens += req.totalTokens || 0;

      const model = req.model || 'unknown';
      if (!byProvider[provider].models[model]) {
        byProvider[provider].models[model] = {
          totalCost: 0,
          requests: 0,
          totalTokens: 0
        };
      }
      byProvider[provider].models[model].totalCost += req.cost || 0;
      byProvider[provider].models[model].requests += 1;
      byProvider[provider].models[model].totalTokens += req.totalTokens || 0;
    }

    return byProvider;
  }

  /**
   * Get costs for a specific session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session cost data or null
   */
  getCostsBySession(sessionId) {
    const data = this.readCostData();
    return data.sessions?.[sessionId] || null;
  }

  /**
   * Get costs for a specific project
   * @param {string} projectId - Project identifier
   * @returns {Object|null} Project cost data or null
   */
  getCostsByProject(projectId) {
    const data = this.readCostData();
    return data.projects?.[projectId] || null;
  }

  /**
   * Get comprehensive cost summary
   * @returns {Object} Complete cost summary with totals and breakdowns
   */
  getCostSummary() {
    const data = this.readCostData();
    const totalCost = this.getTotalCost();
    const byProvider = this.getCostsByProvider();

    return {
      totalCost,
      totalRequests: data.requests?.length || 0,
      byProvider,
      sessions: data.sessions || {},
      projects: data.projects || {},
      lastUpdated: data.metadata?.updatedAt || null
    };
  }

  /**
   * Clear all cost data
   */
  clearCostData() {
    const emptyData = {
      requests: [],
      sessions: {},
      projects: {},
      metadata: { createdAt: new Date().toISOString() }
    };
    this.writeCostData(emptyData);
  }
}

/**
 * Factory function to create a cost store instance
 * @param {Object} options - Configuration options
 * @param {string} [options.dataDir] - Data directory path (default: '.data')
 * @returns {CostStore} Cost store instance
 */
export function createCostStore(options = {}) {
  return new CostStore(options);
}

export default {
  CostStore,
  createCostStore
};
