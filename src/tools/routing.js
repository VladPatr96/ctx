/**
 * Routing domain tools: ctx_routing_config, ctx_routing_explain, ctx_routing_override
 *
 * MCP tools for managing and observing adaptive routing.
 */

import { z } from 'zod';
import { explain, loadRoutingConfig, ROUTING_CONFIG_FILE } from '../providers/router.js';
import { writeJsonAtomic } from '../core/utils/state-io.js';
import { createEvalStore } from '../evaluation/eval-store.js';
import { normalizeRoutingConfig } from '../contracts/config-schemas.js';

export function registerRoutingTools(server, { DATA_DIR }) {
  let evalStore = null;
  try {
    evalStore = createEvalStore(DATA_DIR);
  } catch (err) {
    console.error('[routing-tools] Failed to init eval store:', err.message);
  }

  const configFile = ROUTING_CONFIG_FILE;

  server.registerTool(
    'ctx_routing_config',
    {
      description: 'Get or set adaptive routing config, including readiness, mode, and threshold.',
      inputSchema: z.object({
        action: z.enum(['get', 'set']).describe('Action: get or set'),
        enabled: z.boolean().optional().describe('Enable or disable adaptive routing'),
        threshold: z.number().optional().describe('Minimum score threshold for adaptive selection'),
      }).shape,
    },
    async ({ action, enabled, threshold }) => {
      if (action === 'get') {
        const config = loadRoutingConfig();
        const readiness = evalStore
          ? evalStore.getReadiness()
          : { totalRuns: 0, isReady: false, alpha: 0, adaptiveEnabled: false };
        const envForced = process.env.CTX_ADAPTIVE_ROUTING === '0';

        let mode = 'static';
        if (envForced) mode = 'forced_off';
        else if (config.enabled === false) mode = 'config_off';
        else if (readiness.adaptiveEnabled) mode = 'adaptive';

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              mode,
              readiness,
              config: {
                enabled: config.enabled ?? null,
                threshold: config.threshold ?? null,
                overrides: config.overrides ?? {},
              },
              env_override: envForced ? 'CTX_ADAPTIVE_ROUTING=0 (forced off)' : null,
            }, null, 2),
          }],
        };
      }

      const config = normalizeRoutingConfig({
        ...loadRoutingConfig(),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(threshold !== undefined ? { threshold } : {}),
      });
      writeJsonAtomic(configFile, config);

      const envNote = process.env.CTX_ADAPTIVE_ROUTING === '0'
        ? ' (note: CTX_ADAPTIVE_ROUTING=0 env var overrides this setting)'
        : '';

      return {
        content: [{
          type: 'text',
          text: `Routing config updated: enabled=${config.enabled ?? 'auto'}, threshold=${config.threshold ?? 'default'}${envNote}`,
        }],
      };
    }
  );

  server.registerTool(
    'ctx_routing_explain',
    {
      description: 'Explain provider selection for a task, including candidates, scoring, and readiness.',
      inputSchema: z.object({
        task: z.string().describe('Task description to analyze'),
      }).shape,
    },
    async ({ task }) => {
      const result = explain(task);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  server.registerTool(
    'ctx_routing_override',
    {
      description: 'Manually override the provider for a task type for the next N routing decisions.',
      inputSchema: z.object({
        task_type: z.string().describe('Task type to override'),
        provider: z.string().describe('Provider to force (claude, gemini, codex, opencode)'),
        count: z.number().int().positive().optional().default(10)
          .describe('Number of decisions to apply the override to'),
      }).shape,
    },
    async ({ task_type, provider, count }) => {
      const currentConfig = loadRoutingConfig();
      const config = normalizeRoutingConfig({
        ...currentConfig,
        overrides: {
          ...(currentConfig.overrides ?? {}),
          [task_type]: { provider, remaining: count ?? 10 },
        },
      });
      writeJsonAtomic(configFile, config);

      return {
        content: [{
          type: 'text',
          text: `Override set: ${task_type} -> ${provider} for next ${count ?? 10} decisions`,
        }],
      };
    }
  );
}
