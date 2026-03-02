/**
 * Routing domain tools: ctx_routing_config, ctx_routing_explain, ctx_routing_override
 *
 * MCP tools for managing and observing adaptive routing.
 */

import { z } from 'zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { explain, loadRoutingConfig, ROUTING_CONFIG_FILE } from '../providers/router.js';
import { writeJsonAtomic, readJsonFile } from '../utils/state-io.js';
import { createEvalStore } from '../evaluation/eval-store.js';

export function registerRoutingTools(server, { DATA_DIR }) {
  let evalStore = null;
  try {
    evalStore = createEvalStore(DATA_DIR);
  } catch (err) {
    console.error('[routing-tools] Failed to init eval store:', err.message);
  }

  const configFile = ROUTING_CONFIG_FILE;

  // --- ctx_routing_config ---
  server.registerTool(
    'ctx_routing_config',
    {
      description: 'Получить или установить конфигурацию адаптивного роутинга. Get: показывает readiness, текущий режим, threshold. Set: записывает enabled/threshold в конфиг.',
      inputSchema: z.object({
        action: z.enum(['get', 'set']).describe('Действие: get или set'),
        enabled: z.boolean().optional().describe('Включить/выключить адаптивный роутинг (для set)'),
        threshold: z.number().optional().describe('Минимальный порог score для адаптивного выбора (для set)')
      }).shape,
    },
    async ({ action, enabled, threshold }) => {
      if (action === 'get') {
        const config = readJsonFile(configFile, {});
        const readiness = evalStore ? evalStore.getReadiness() : { totalRuns: 0, isReady: false, alpha: 0, adaptiveEnabled: false };
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
                overrides: config.overrides ?? {}
              },
              env_override: envForced ? 'CTX_ADAPTIVE_ROUTING=0 (forced off)' : null
            }, null, 2)
          }]
        };
      }

      // action === 'set'
      const config = readJsonFile(configFile, {});
      if (enabled !== undefined) config.enabled = enabled;
      if (threshold !== undefined) config.threshold = threshold;
      writeJsonAtomic(configFile, config);

      const envNote = process.env.CTX_ADAPTIVE_ROUTING === '0'
        ? ' (note: CTX_ADAPTIVE_ROUTING=0 env var overrides this setting)'
        : '';

      return {
        content: [{
          type: 'text',
          text: `Routing config updated: enabled=${config.enabled ?? 'auto'}, threshold=${config.threshold ?? 'default'}${envNote}`
        }]
      };
    }
  );

  // --- ctx_routing_explain ---
  server.registerTool(
    'ctx_routing_explain',
    {
      description: 'Объяснить выбор провайдера для задачи. Показывает task_type, всех кандидатов с декомпозицией score, readiness gate, итоговый выбор.',
      inputSchema: z.object({
        task: z.string().describe('Описание задачи для анализа роутинга')
      }).shape,
    },
    async ({ task }) => {
      const result = explain(task);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // --- ctx_routing_override ---
  server.registerTool(
    'ctx_routing_override',
    {
      description: 'Ручное переопределение провайдера для task_type на N следующих решений. Провайдер будет выбираться вместо адаптивного/статического роутинга.',
      inputSchema: z.object({
        task_type: z.string().describe('Тип задачи (code_review, codebase_analysis, documentation, etc.)'),
        provider: z.string().describe('Провайдер для принудительного выбора (claude, gemini, codex, opencode)'),
        count: z.number().optional().default(10).describe('Количество решений для override (по умолчанию 10)')
      }).shape,
    },
    async ({ task_type, provider, count }) => {
      const config = readJsonFile(configFile, {});
      if (!config.overrides) config.overrides = {};
      config.overrides[task_type] = { provider, remaining: count ?? 10 };
      writeJsonAtomic(configFile, config);

      return {
        content: [{
          type: 'text',
          text: `Override set: ${task_type} → ${provider} for next ${count ?? 10} decisions`
        }]
      };
    }
  );
}
