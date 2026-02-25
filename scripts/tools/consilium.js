/**
 * Consilium domain tools: ctx_share_result, ctx_read_results, ctx_delegate_task,
 * ctx_inner_consilium, ctx_agent_consilium, ctx_consilium_presets
 */

import { z } from 'zod';
import { route, routeMulti, delegate } from '../providers/router.js';
import { getProvider, invoke } from '../providers/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || join(__dirname, '..', '..');
const PRESETS_FILE = join(PLUGIN_ROOT, 'consilium.presets.json');
const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');

export function registerConsiliumTools(server, { getResults, saveResults, DATA_DIR }) {

  server.registerTool(
    'ctx_share_result',
    {
      description: 'Опубликовать результат работы для других агентов. Используется в consilium для обмена предложениями.',
      inputSchema: z.object({
        provider: z.string().describe('Имя провайдера (claude, gemini, opencode, codex)'),
        task: z.string().describe('Описание задачи'),
        result: z.string().describe('Результат/предложение'),
        confidence: z.number().optional().describe('Уверенность 0-1')
      }).shape,
    },
    async ({ provider, task, result, confidence }) => {
      const results = getResults();
      results.push({
        time: new Date().toISOString(),
        provider,
        task,
        result,
        confidence: confidence || null
      });
      saveResults(results);
      return { content: [{ type: 'text', text: `Result shared by ${provider}` }] };
    }
  );

  server.registerTool(
    'ctx_read_results',
    {
      description: 'Прочитать результаты других агентов. Используется для синтеза в consilium.',
      inputSchema: z.object({
        task: z.string().optional().describe('Фильтр по задаче'),
        provider: z.string().optional().describe('Фильтр по провайдеру')
      }).shape,
    },
    async ({ task, provider }) => {
      let results = getResults();
      if (task) results = results.filter(r => r.task.includes(task));
      if (provider) results = results.filter(r => r.provider === provider);

      return {
        content: [{
          type: 'text',
          text: results.length > 0 ? JSON.stringify(results, null, 2) : 'No results found.'
        }]
      };
    }
  );

  server.registerTool(
    'ctx_delegate_task',
    {
      description: 'Делегировать задачу лучшему AI провайдеру. Роутер автоматически выбирает провайдера по типу задачи (code review → Codex, анализ → Gemini, планирование → Claude). Можно указать провайдера явно или запустить параллельно.',
      inputSchema: z.object({
        task: z.string().describe('Описание задачи для делегирования'),
        provider: z.string().optional().describe('Явный выбор провайдера (claude, gemini, codex, opencode). Если не указан — авто-роутинг'),
        multi: z.boolean().optional().describe('Запустить задачу параллельно у нескольких подходящих провайдеров'),
        timeout: z.number().optional().describe('Таймаут в мс (по умолчанию 60000)')
      }).shape,
    },
    async ({ task, provider, multi, timeout }) => {
      // Сначала покажем рекомендацию роутера
      const recommendation = provider ? null : route(task);
      const candidates = multi ? routeMulti(task) : [];

      // Делегируем
      const result = await delegate(task, { provider, multi, timeout });

      const output = {
        recommendation: recommendation || (provider ? { provider, routing: 'explicit' } : null),
        candidates: candidates.length > 0 ? candidates : undefined,
        result
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    }
  );

  server.registerTool(
    'ctx_inner_consilium',
    {
      description: 'Мини-консилиум внутри одного провайдера: запускает задачу через разные модели параллельно и возвращает массив ответов для синтеза.',
      inputSchema: z.object({
        provider: z.string().describe('Провайдер (claude, gemini, opencode)'),
        models: z.array(z.string()).describe('Массив моделей для запуска (например ["opus", "sonnet", "haiku"])'),
        task: z.string().describe('Задача для анализа'),
        timeout: z.number().optional().describe('Таймаут в мс (по умолчанию 60000)')
      }).shape,
    },
    async ({ provider: providerName, models, task, timeout }) => {
      const providerObj = getProvider(providerName);
      if (!providerObj) {
        return { content: [{ type: 'text', text: `Error: unknown provider "${providerName}"` }] };
      }

      const availableModels = providerObj.models || ['default'];
      const requestedModels = models.filter(m => availableModels.includes(m));
      if (requestedModels.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `Error: none of [${models.join(', ')}] available for ${providerName}. Available: ${availableModels.join(', ')}`
          }]
        };
      }

      const results = await Promise.allSettled(
        requestedModels.map(async model => {
          const result = await invoke(providerName, task, { model, timeout: timeout || 60000 });
          return { model, ...result };
        })
      );

      const output = results.map(r =>
        r.status === 'fulfilled' ? r.value : { model: 'unknown', status: 'error', error: r.reason?.message }
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ provider: providerName, models: requestedModels, results: output }, null, 2)
        }]
      };
    }
  );

  server.registerTool(
    'ctx_consilium_presets',
    {
      description: 'Получить список пресетов для consilium. Пресеты определяют предустановленные составы провайдеров или агентов.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      if (!existsSync(PRESETS_FILE)) {
        return { content: [{ type: 'text', text: '{}' }] };
      }
      const presets = JSON.parse(readFileSync(PRESETS_FILE, 'utf-8'));
      return {
        content: [{ type: 'text', text: JSON.stringify(presets, null, 2) }]
      };
    }
  );

  // --- ctx_consilium_multi_round ---
  server.registerTool(
    'ctx_consilium_multi_round',
    {
      description: 'Многораундовый анонимный консилиум. Провайдеры обсуждают тему в нескольких раундах, видя анонимизированные ответы друг друга. R1 — свободный ответ, R2+ — структурированная дискуссия с оценками.',
      inputSchema: z.object({
        topic: z.string().describe('Тема для обсуждения'),
        providers: z.array(z.string()).default(['claude', 'gemini', 'codex']).describe('Список провайдеров'),
        rounds: z.number().min(1).max(4).default(2).describe('Количество раундов (1-4)'),
        projectContext: z.string().optional().describe('Контекст проекта'),
        timeout: z.number().optional().default(60000).describe('Таймаут на провайдера (мс)'),
        preset: z.string().optional().describe('Пресет из consilium.presets.json (debate-full, debate-fast, debate-claims)'),
        enableClaimExtraction: z.boolean().optional().default(false).describe('Включить claim extraction между раундами (CBDP)'),
        claimProvider: z.string().optional().default('claude').describe('Провайдер для claim extraction')
      }).shape,
    },
    async ({ topic, providers: providersList, rounds, projectContext, timeout, preset, enableClaimExtraction, claimProvider }) => {
      try {
        // Resolve preset if provided
        let resolvedProviders = providersList;
        let resolvedRounds = rounds;
        let resolvedClaimExtraction = enableClaimExtraction;
        if (preset && existsSync(PRESETS_FILE)) {
          const presets = JSON.parse(readFileSync(PRESETS_FILE, 'utf-8'));
          const presetConfig = presets[preset];
          if (presetConfig) {
            if (presetConfig.providers) resolvedProviders = presetConfig.providers;
            if (presetConfig.rounds) resolvedRounds = presetConfig.rounds;
            if (presetConfig.enableClaimExtraction !== undefined && !enableClaimExtraction) {
              resolvedClaimExtraction = presetConfig.enableClaimExtraction;
            }
          }
        }

        // Create eval store (optional)
        let evalStore = null;
        if (DATA_DIR) {
          try {
            const { createEvalStore } = await import('../evaluation/eval-store.js');
            evalStore = createEvalStore(DATA_DIR);
          } catch { /* eval store optional */ }
        }

        const { createRoundOrchestrator } = await import('../consilium/round-orchestrator.js');
        const orchestrator = createRoundOrchestrator({
          topic,
          providers: resolvedProviders,
          rounds: resolvedRounds,
          projectContext: projectContext || '',
          timeout: timeout || 60000,
          evalStore,
          enableClaimExtraction: resolvedClaimExtraction,
          claimProvider: claimProvider || 'claude'
        });

        const result = await orchestrator.execute();

        // Complete eval run
        if (evalStore && result.runId) {
          evalStore.completeRun(result.runId, {
            rounds: result.rounds.length,
            decision_summary: `Multi-round consilium: ${result.rounds.length} rounds, ${resolvedProviders.length} providers`
          });
        }

        // Format result for MCP response
        const aliasMapObj = Object.fromEntries(result.aliasMap);
        const output = {
          topic: result.topic,
          providers: result.providers,
          rounds_completed: result.rounds.length,
          alias_map: aliasMapObj,
          total_duration_ms: result.totalDurationMs,
          run_id: result.runId,
          rounds: result.rounds.map(r => ({
            round: r.round,
            responses: r.responses.map(resp => ({
              alias: resp.alias,
              provider: resp.provider,
              status: resp.status,
              response: resp.response?.slice(0, 5000),
              response_ms: resp.response_ms
            }))
          }))
        };

        // Close eval store
        if (evalStore) {
          try { evalStore.close(); } catch { /* ignore */ }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }]
        };
      }
    }
  );

  server.registerTool(
    'ctx_agent_consilium',
    {
      description: 'Внутренний агентный консилиум: запускает выбранных агентов (architect, researcher, reviewer и др.) для анализа задачи каждый со своей позиции. Возвращает промпты для параллельного запуска через Task tool.',
      inputSchema: z.object({
        topic: z.string().describe('Тема для анализа'),
        agents: z.array(z.string()).describe('Список агентов (например ["architect", "researcher", "reviewer"])'),
        projectContext: z.string().optional().describe('Контекст проекта (стек, структура)')
      }).shape,
    },
    async ({ topic, agents, projectContext }) => {
      const prompts = [];

      for (const agentName of agents) {
        const agentFile = join(AGENTS_DIR, `${agentName}.md`);
        if (!existsSync(agentFile)) {
          prompts.push({ agent: agentName, error: `Agent file not found: ${agentFile}` });
          continue;
        }

        const agentContent = readFileSync(agentFile, 'utf-8');
        const roleMatch = agentContent.match(/\*\*(?:Role|Роль)\*\*:\s*(.+)/i);
        const role = roleMatch ? roleMatch[1].trim() : agentName;

        prompts.push({
          agent: agentName,
          role,
          prompt: `You are the **${agentName}** agent.\nYour role: ${role}\n\nTopic: ${topic}\n${projectContext ? `\nProject context: ${projectContext}` : ''}\n\nAnalyze this topic STRICTLY from your role's perspective.\nDo NOT try to cover all angles — only your specialization.\nProvide: approach, risks from your perspective, key recommendations.\nRespond in Russian. Max 300 words.`
        });
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ topic, agents: prompts }, null, 2)
        }]
      };
    }
  );
}
