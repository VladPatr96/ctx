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
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || join(__dirname, '..', '..');
const PRESETS_FILE = join(PLUGIN_ROOT, 'consilium.presets.json');
const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');
const DEFAULT_PROVIDER_TIMEOUT_MS = 60000;
const DEFAULT_CLAIM_TIMEOUT_MS = 30000;
const DEFAULT_SYNTHESIS_TIMEOUT_MS = 90000;
const MIN_PROVIDER_TIMEOUT_MS = 8000;
const MIN_PHASE_TIMEOUT_MS = 5000;
const DEFAULT_TOOL_BUDGET_MS = 105000;
const FIXED_OVERHEAD_MS = 5000;
const PER_STEP_OVERHEAD_MS = 1500;
const MAX_AUTO_PROVIDER_TIMEOUT_MS = 45000;

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

function estimateSequentialSteps(rounds, enableClaimExtraction, enableSmartSynthesis) {
  let steps = Math.max(1, rounds);
  if (enableClaimExtraction && rounds > 1) steps += 1;
  if (enableSmartSynthesis) steps += 1;
  return steps;
}

function resolveConsiliumTiming({
  requestedTimeout,
  rounds,
  enableClaimExtraction,
  enableSmartSynthesis
}) {
  const sequentialSteps = estimateSequentialSteps(rounds, enableClaimExtraction, enableSmartSynthesis);
  const toolBudgetMs = parsePositiveInt(process.env.CTX_CONSILIUM_TOOL_BUDGET_MS, DEFAULT_TOOL_BUDGET_MS);
  const budgetForInvocations = Math.max(
    MIN_PROVIDER_TIMEOUT_MS * sequentialSteps,
    toolBudgetMs - FIXED_OVERHEAD_MS - (sequentialSteps * PER_STEP_OVERHEAD_MS)
  );
  const autoProviderTimeoutMs = Math.max(
    MIN_PROVIDER_TIMEOUT_MS,
    Math.min(
      MAX_AUTO_PROVIDER_TIMEOUT_MS,
      Math.floor(budgetForInvocations / sequentialSteps)
    )
  );
  const providerTimeoutMs = requestedTimeout
    ? parsePositiveInt(requestedTimeout, DEFAULT_PROVIDER_TIMEOUT_MS)
    : autoProviderTimeoutMs;
  const claimTimeoutMs = Math.max(
    MIN_PHASE_TIMEOUT_MS,
    Math.min(providerTimeoutMs, DEFAULT_CLAIM_TIMEOUT_MS)
  );
  const synthesisTimeoutMs = Math.max(
    MIN_PHASE_TIMEOUT_MS,
    Math.min(providerTimeoutMs, DEFAULT_SYNTHESIS_TIMEOUT_MS)
  );
  const estimatedWorstCaseMs =
    FIXED_OVERHEAD_MS +
    (sequentialSteps * PER_STEP_OVERHEAD_MS) +
    (rounds * providerTimeoutMs) +
    ((enableClaimExtraction && rounds > 1) ? claimTimeoutMs : 0) +
    (enableSmartSynthesis ? synthesisTimeoutMs : 0);

  return {
    mode: requestedTimeout ? 'requested' : 'auto_budgeted',
    sequentialSteps,
    toolBudgetMs,
    providerTimeoutMs,
    claimTimeoutMs,
    synthesisTimeoutMs,
    estimatedWorstCaseMs
  };
}

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
        timeout: z.number().optional().describe('Таймаут на провайдера (мс). Если не задан — рассчитывается автоматически из лимита инструмента'),
        preset: z.string().optional().describe('Пресет из consilium.presets.json (debate-full, debate-fast, debate-claims)'),
        enableClaimExtraction: z.boolean().optional().default(false).describe('Включить claim extraction между раундами (CBDP)'),
        claimProvider: z.string().optional().default('claude').describe('Провайдер для claim extraction'),
        enableStructuredResponse: z.boolean().optional().default(false).describe('Включить structured response format (CBDP Phase 2)'),
        enableSmartSynthesis: z.boolean().optional().default(false).describe('Включить smart synthesis с claim graph (CBDP Phase 3)'),
        synthesisProvider: z.string().optional().default('claude').describe('Провайдер для синтеза')
      }).shape,
    },
    async ({ topic, providers: providersList, rounds, projectContext, timeout, preset, enableClaimExtraction, claimProvider, enableStructuredResponse, enableSmartSynthesis, synthesisProvider }) => {
      try {
        // Resolve preset if provided
        let resolvedProviders = providersList;
        let resolvedRounds = rounds;
        let resolvedClaimExtraction = enableClaimExtraction;
        let resolvedStructuredResponse = enableStructuredResponse;
        let resolvedSmartSynthesis = enableSmartSynthesis;
        if (preset && existsSync(PRESETS_FILE)) {
          const presets = JSON.parse(readFileSync(PRESETS_FILE, 'utf-8'));
          const presetConfig = presets[preset];
          if (presetConfig) {
            if (presetConfig.providers) resolvedProviders = presetConfig.providers;
            if (presetConfig.rounds) resolvedRounds = presetConfig.rounds;
            if (presetConfig.enableClaimExtraction !== undefined && !enableClaimExtraction) {
              resolvedClaimExtraction = presetConfig.enableClaimExtraction;
            }
            if (presetConfig.enableStructuredResponse !== undefined && !enableStructuredResponse) {
              resolvedStructuredResponse = presetConfig.enableStructuredResponse;
            }
            if (presetConfig.enableSmartSynthesis !== undefined && !enableSmartSynthesis) {
              resolvedSmartSynthesis = presetConfig.enableSmartSynthesis;
            }
          }
        }

        const timing = resolveConsiliumTiming({
          requestedTimeout: timeout,
          rounds: resolvedRounds,
          enableClaimExtraction: resolvedClaimExtraction,
          enableSmartSynthesis: resolvedSmartSynthesis
        });

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
          timeout: timing.providerTimeoutMs,
          evalStore,
          enableClaimExtraction: resolvedClaimExtraction,
          claimProvider: claimProvider || 'claude',
          claimTimeout: timing.claimTimeoutMs,
          enableStructuredResponse: resolvedStructuredResponse,
          enableSmartSynthesis: resolvedSmartSynthesis,
          synthesisProvider: synthesisProvider || 'claude',
          synthesisTimeout: timing.synthesisTimeoutMs
        });

        const result = await orchestrator.execute();

        // --- Feedback loop: record provider responses for adaptive routing ---
        if (evalStore && result.runId) {
          // Determine task_type from topic via router
          const routeResult = route(topic);
          const taskType = routeResult?.strength || null;

          // 1. Record each provider's aggregate response
          for (const provider of resolvedProviders) {
            const alias = result.aliasMap.get(provider);
            // Collect stats across all rounds for this provider
            const providerResponses = result.rounds.flatMap(r =>
              r.responses.filter(resp => resp.provider === provider && resp.status === 'success')
            );

            if (providerResponses.length > 0) {
              const totalMs = providerResponses.reduce((s, r) => s + (r.response_ms || 0), 0);
              const avgMs = Math.round(totalMs / providerResponses.length);

              // Derive confidence from trust scores (how much others trust this provider)
              // Trust keys may be short ("A") or full ("Participant A") — check both
              let confidence = null;
              if (result.aggregatedTrustScores && alias) {
                const shortKey = alias.split(' ').pop(); // "Participant A" → "A"
                const trustValues = Object.values(result.aggregatedTrustScores)
                  .map(scores => scores[alias] ?? scores[shortKey])
                  .filter(v => typeof v === 'number');
                if (trustValues.length > 0) {
                  confidence = +(trustValues.reduce((a, b) => a + b, 0) / trustValues.length).toFixed(2);
                }
              }

              evalStore.addProviderResponse(result.runId, {
                provider,
                status: 'completed',
                response_ms: avgMs,
                confidence,
                key_idea: `${providerResponses.length} rounds completed`,
                task_type: taskType
              });
            } else {
              evalStore.addProviderResponse(result.runId, {
                provider,
                status: 'error',
                error_message: 'No successful responses',
                task_type: taskType
              });
            }
          }

          // 2. Determine winner (proposed_by) — most trusted provider
          let proposedBy = null;
          if (result.aggregatedTrustScores) {
            const trustTotals = {};
            for (const [, scores] of Object.entries(result.aggregatedTrustScores)) {
              for (const [toAlias, score] of Object.entries(scores)) {
                trustTotals[toAlias] = (trustTotals[toAlias] || 0) + score;
              }
            }
            // Find provider with highest aggregate trust
            let bestAlias = null;
            let bestTrust = -1;
            for (const [alias, total] of Object.entries(trustTotals)) {
              if (total > bestTrust) { bestTrust = total; bestAlias = alias; }
            }
            if (bestAlias) {
              // Reverse lookup: alias or short key → provider
              for (const [prov, al] of result.aliasMap) {
                const letter = al.split(' ').pop(); // "Participant B" → "B"
                if (al === bestAlias || letter === bestAlias) { proposedBy = prov; break; }
              }
            }
          }

          // 3. Complete run with proposed_by
          const synthConfidence = result.synthesis?.parsed?.confidence;
          evalStore.completeRun(result.runId, {
            proposed_by: proposedBy,
            consensus: synthConfidence >= 0.7 ? 1 : 0,
            rounds: result.rounds.length,
            decision_summary: result.synthesis?.parsed?.recommendation
              || `Multi-round consilium: ${result.rounds.length} rounds, ${resolvedProviders.length} providers`
          });
        }

        // Format result for MCP response
        const aliasMapObj = Object.fromEntries(result.aliasMap);
        const output = {
          topic: result.topic,
          providers: result.providers,
          rounds_completed: result.rounds.length,
          alias_map: aliasMapObj,
          timing: {
            mode: timing.mode,
            provider_timeout_ms: timing.providerTimeoutMs,
            claim_timeout_ms: timing.claimTimeoutMs,
            synthesis_timeout_ms: timing.synthesisTimeoutMs,
            sequential_steps: timing.sequentialSteps,
            tool_budget_ms: timing.toolBudgetMs,
            estimated_worst_case_ms: timing.estimatedWorstCaseMs
          },
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

        // Phase 3: add synthesis, claim graph, auto-stop
        if (result.synthesis) {
          output.synthesis = {
            provider: result.synthesis.provider,
            status: result.synthesis.status,
            response: result.synthesis.response?.slice(0, 10000),
            parsed: result.synthesis.parsed
          };
        }
        try {
          const { recordConsiliumObservability, setClaimGraph } = await import('../dashboard/server.js');
          recordConsiliumObservability(result);
          setClaimGraph(result.claimGraph || null);
        } catch { /* dashboard may not be running */ }
        if (result.claimGraph) {
          output.claim_graph = result.claimGraph.stats;
        }
        if (result.autoStop) {
          output.auto_stop = result.autoStop;
        }

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

  // --- ctx_advisor_consilium (Board of Advisors) ---
  server.registerTool(
    'ctx_advisor_consilium',
    {
      description: 'Board of Advisors — совет из 4-6 экспертных персон (Steve Jobs, Karpathy, Carmack и др.). Каждый анализирует задачу через свою уникальную линзу изолированно, затем синтез. Используй для продуктовых, архитектурных и стратегических решений.',
      inputSchema: z.object({
        topic: z.string().describe('Задача/вопрос для совета'),
        advisors: z.array(z.string()).optional().describe('Список советников (jobs, victor, karpathy, carmack, lutke, tufte, norman, isenberg, collison, tinkov, cto, cmo, contrarian, user)'),
        preset: z.string().optional().describe('Пресет: product, architecture, growth, full-review, stress-test'),
        projectContext: z.string().optional().describe('Контекст проекта'),
        timeout: z.number().optional().describe('Таймаут на советника (мс, по умолчанию 60000)')
      }).shape,
    },
    async ({ topic, advisors: advisorIds, preset, projectContext, timeout }) => {
      try {
        const { ADVISOR_CATALOG, ADVISOR_PRESETS, buildAdvisorPrompt, resolveAdvisors } = await import('../consilium/advisors.js');

        const resolved = resolveAdvisors(advisorIds, preset);
        const timeoutMs = timeout || DEFAULT_PROVIDER_TIMEOUT_MS;

        // Build prompts for each advisor
        const advisorPrompts = resolved.map(id => ({
          id,
          name: ADVISOR_CATALOG[id]?.name || id,
          lens: ADVISOR_CATALOG[id]?.lens || '',
          prompt: buildAdvisorPrompt(id, topic, projectContext)
        }));

        // Execute all advisors in parallel via Claude subagents
        const startTime = Date.now();
        const results = await Promise.allSettled(
          advisorPrompts.map(async (adv) => {
            const advStart = Date.now();
            const result = await invoke('claude', adv.prompt, {
              model: 'sonnet',
              timeout: timeoutMs
            });
            return {
              id: adv.id,
              name: adv.name,
              lens: adv.lens,
              status: result.status || 'success',
              response: result.response || result.text || '',
              response_ms: Date.now() - advStart
            };
          })
        );

        const advisorResults = results.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : {
                id: advisorPrompts[i].id,
                name: advisorPrompts[i].name,
                lens: advisorPrompts[i].lens,
                status: 'error',
                response: r.reason?.message || 'Unknown error',
                response_ms: 0
              }
        );

        const totalMs = Date.now() - startTime;

        // Build synthesis prompt
        const advisorBlock = advisorResults
          .filter(a => a.status !== 'error')
          .map(a => `--- ${a.name} (${a.lens}) ---\n${a.response}`)
          .join('\n\n');

        const synthesisPrompt = `Ты главный синтезатор Board of Advisors.
Задача: ${topic}

Ответы советников:

${advisorBlock}

Проанализируй и синтезируй:
1. **Консенсус** — в чём советники согласны?
2. **Уникальные инсайты** — что увидел только один советник (и это ценно)?
3. **Противоречия** — где советники расходятся и кто прав?
4. **Слепые зоны** — что НЕ увидел никто?
5. **Итоговая рекомендация** — синтез лучших идей
6. **Top-3 action items** — конкретные следующие шаги

Отвечай на русском. Будь конкретен.`;

        // Run synthesis
        let synthesis = null;
        try {
          const synthStart = Date.now();
          const synthResult = await invoke('claude', synthesisPrompt, {
            model: 'sonnet',
            timeout: DEFAULT_SYNTHESIS_TIMEOUT_MS
          });
          synthesis = {
            status: 'success',
            response: synthResult.response || synthResult.text || '',
            response_ms: Date.now() - synthStart
          };
        } catch (err) {
          synthesis = { status: 'error', response: err.message, response_ms: 0 };
        }

        const output = {
          topic,
          mode: 'advisor',
          preset: preset || null,
          advisors_count: resolved.length,
          total_duration_ms: totalMs,
          advisors: advisorResults.map(a => ({
            id: a.id,
            name: a.name,
            lens: a.lens,
            status: a.status,
            response: a.response?.slice(0, 3000),
            response_ms: a.response_ms
          })),
          synthesis
        };

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

  // --- ctx_adversarial_review ---
  server.registerTool(
    'ctx_adversarial_review',
    {
      description: 'Adversarial code review: авто-определение scope по git diff, запуск ревьюеров (skeptic/architect/minimalist) с кросс-провайдерным режимом, финальный вердикт PASS/CONTESTED/REJECT.',
      inputSchema: z.object({
        target: z.string().optional().describe('Что ревьюить: "staged", "HEAD", "HEAD~N..HEAD", ветка, или путь к файлам. По умолчанию: staged changes, если нет — HEAD'),
        preset: z.string().optional().describe('Пресет: review-adversarial (full), review-quick (skeptic only), review-cross (кросс-провайдеры)'),
        agents: z.array(z.string()).optional().describe('Явный список ревьюеров (skeptic, architect, minimalist). Если не задан — авто-scope'),
        crossProvider: z.boolean().optional().default(false).describe('Запустить ревьюеров на разных провайдерах (Claude vs Codex/Gemini)'),
        timeout: z.number().optional().describe('Таймаут на ревьюера (мс, по умолчанию 60000)')
      }).shape,
    },
    async ({ target, preset, agents: explicitAgents, crossProvider, timeout }) => {
      try {
        const timeoutMs = timeout || DEFAULT_PROVIDER_TIMEOUT_MS;

        // --- Step 1: Get diff ---
        let diff = '';
        let diffTarget = target || 'auto';
        try {
          if (diffTarget === 'auto' || diffTarget === 'staged') {
            diff = execSync('git diff --cached', { encoding: 'utf-8', timeout: 10000 }).trim();
            if (!diff) {
              diff = execSync('git diff HEAD~1..HEAD', { encoding: 'utf-8', timeout: 10000 }).trim();
              diffTarget = 'HEAD~1..HEAD';
            } else {
              diffTarget = 'staged';
            }
          } else if (diffTarget === 'HEAD') {
            diff = execSync('git diff HEAD~1..HEAD', { encoding: 'utf-8', timeout: 10000 }).trim();
          } else {
            diff = execSync(`git diff ${diffTarget}`, { encoding: 'utf-8', timeout: 10000 }).trim();
          }
        } catch (err) {
          diff = '';
        }

        if (!diff) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No diff found. Stage changes or specify target.' }, null, 2) }]
          };
        }

        // --- Step 2: Auto-scope ---
        const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
        const removedLines = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length;
        const totalChangedLines = addedLines + removedLines;

        let scope;
        let reviewAgents;
        if (explicitAgents && explicitAgents.length > 0) {
          reviewAgents = explicitAgents;
          scope = 'explicit';
        } else if (preset) {
          // Load from preset
          let presetConfig = null;
          if (existsSync(PRESETS_FILE)) {
            const presets = JSON.parse(readFileSync(PRESETS_FILE, 'utf-8'));
            presetConfig = presets[preset];
          }
          if (presetConfig?.agents) {
            reviewAgents = presetConfig.agents;
          } else {
            reviewAgents = ['skeptic', 'architect', 'minimalist'];
          }
          scope = preset;
        } else {
          // Auto-scope by diff size
          if (totalChangedLines < 50) {
            reviewAgents = ['skeptic'];
            scope = 'small';
          } else if (totalChangedLines <= 200) {
            reviewAgents = ['skeptic', 'architect'];
            scope = 'medium';
          } else {
            reviewAgents = ['skeptic', 'architect', 'minimalist'];
            scope = 'large';
          }
        }

        // Truncate diff for prompt (max 8000 chars to fit in context)
        const maxDiffLen = 8000;
        const truncatedDiff = diff.length > maxDiffLen
          ? diff.slice(0, maxDiffLen) + `\n\n... [truncated, ${diff.length - maxDiffLen} chars omitted]`
          : diff;

        // --- Step 3: Build review prompts ---
        const reviewPrompts = [];
        for (const agentName of reviewAgents) {
          const agentFile = join(AGENTS_DIR, `${agentName}.md`);
          let agentInstructions = '';
          if (existsSync(agentFile)) {
            agentInstructions = readFileSync(agentFile, 'utf-8');
          }

          const prompt = `${agentInstructions}

---
REVIEW TARGET: ${diffTarget}
CHANGED LINES: +${addedLines} / -${removedLines} (total: ${totalChangedLines})

DIFF:
\`\`\`diff
${truncatedDiff}
\`\`\`

Review this diff STRICTLY from your role's perspective.
End with a verdict: PASS, CONCERNS, or REJECT with one-sentence reason.
Respond in Russian. Be specific — cite file:line where possible.`;

          reviewPrompts.push({ agent: agentName, prompt });
        }

        // --- Step 4: Execute reviews ---
        const startTime = Date.now();

        // Assign providers for cross-provider mode
        const crossProviders = crossProvider
          ? ['claude', 'codex', 'gemini'].slice(0, reviewAgents.length)
          : reviewAgents.map(() => 'claude');

        const reviewResults = await Promise.allSettled(
          reviewPrompts.map(async (rp, idx) => {
            const provider = crossProviders[idx] || 'claude';
            const rpStart = Date.now();
            const result = await invoke(provider, rp.prompt, {
              model: provider === 'claude' ? 'sonnet' : undefined,
              timeout: timeoutMs
            });
            return {
              agent: rp.agent,
              provider,
              status: 'success',
              response: result.response || result.text || '',
              response_ms: Date.now() - rpStart
            };
          })
        );

        const results = reviewResults.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : {
                agent: reviewPrompts[i].agent,
                provider: crossProviders[i],
                status: 'error',
                response: r.reason?.message || 'Unknown error',
                response_ms: 0
              }
        );

        // --- Step 5: Synthesize verdict ---
        const successResults = results.filter(r => r.status === 'success');
        let verdict = 'PASS';
        let verdictReason = '';

        if (successResults.length === 0) {
          verdict = 'ERROR';
          verdictReason = 'All reviewers failed';
        } else {
          // Parse individual verdicts from responses
          const individualVerdicts = successResults.map(r => {
            const response = r.response.toUpperCase();
            // Search for verdict pattern at the end
            if (response.includes('REJECT')) return { agent: r.agent, verdict: 'REJECT' };
            if (response.includes('CONCERNS')) return { agent: r.agent, verdict: 'CONCERNS' };
            return { agent: r.agent, verdict: 'PASS' };
          });

          const rejects = individualVerdicts.filter(v => v.verdict === 'REJECT');
          const concerns = individualVerdicts.filter(v => v.verdict === 'CONCERNS');

          if (rejects.length > 0 && rejects.length >= Math.ceil(successResults.length / 2)) {
            verdict = 'REJECT';
            verdictReason = `Consensus reject from: ${rejects.map(r => r.agent).join(', ')}`;
          } else if (rejects.length > 0) {
            verdict = 'CONTESTED';
            verdictReason = `Reject by ${rejects.map(r => r.agent).join(', ')}, others disagree`;
          } else if (concerns.length > 0) {
            verdict = 'PASS_WITH_CONCERNS';
            verdictReason = `Concerns from: ${concerns.map(r => r.agent).join(', ')}`;
          } else {
            verdict = 'PASS';
            verdictReason = 'All reviewers approve';
          }
        }

        const totalMs = Date.now() - startTime;

        const output = {
          verdict,
          verdict_reason: verdictReason,
          scope,
          target: diffTarget,
          stats: {
            added_lines: addedLines,
            removed_lines: removedLines,
            total_changed: totalChangedLines,
            reviewers_count: reviewAgents.length,
            cross_provider: crossProvider || false
          },
          duration_ms: totalMs,
          reviews: results.map(r => ({
            agent: r.agent,
            provider: r.provider,
            status: r.status,
            response: r.response?.slice(0, 5000),
            response_ms: r.response_ms
          }))
        };

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
}
