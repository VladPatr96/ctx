/**
 * round-orchestrator.js — Multi-round anonymous consilium orchestration.
 *
 * Factory pattern: createRoundOrchestrator returns an object with execute().
 * Dependency injection for invoke and evalStore enables testing.
 */

import { buildR1Prompt, buildFollowUpPrompt, formatClaimsBlock } from './prompts.js';
import { extractClaimsFromResponses } from './claim-extractor.js';

const ALIAS_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Fisher-Yates shuffle (in-place).
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Create stable alias mapping via Fisher-Yates shuffle.
 * @param {string[]} providers
 * @returns {Map<string, string>} provider → 'Participant X'
 */
export function createAliasMap(providers) {
  const shuffled = shuffle(providers);
  const map = new Map();
  for (let i = 0; i < shuffled.length; i++) {
    map.set(shuffled[i], `Participant ${ALIAS_LETTERS[i] || String(i + 1)}`);
  }
  return map;
}

/**
 * Parse structured R2+ response. Graceful fallback if provider returns plain text.
 * @param {string} rawResponse
 * @returns {object}
 */
export function parseStructuredResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return { current_position: '', evaluations: [], agreements: [], disagreements: [], confidence: 0.5 };
  }

  // Try to extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = rawResponse.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  // Try to find JSON object boundaries
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      current_position: parsed.current_position || '',
      evaluations: Array.isArray(parsed.evaluations) ? parsed.evaluations : [],
      agreements: Array.isArray(parsed.agreements) ? parsed.agreements : [],
      disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
    };
  } catch {
    // Graceful fallback: wrap plain text as position
    return {
      current_position: rawResponse,
      evaluations: [],
      agreements: [],
      disagreements: [],
      confidence: 0.5
    };
  }
}

/**
 * Create a multi-round consilium orchestrator.
 * @param {object} options
 * @param {string} options.topic
 * @param {string[]} options.providers
 * @param {number} [options.rounds=2]
 * @param {string} [options.projectContext='']
 * @param {number} [options.timeout=60000]
 * @param {object} [options.evalStore=null]
 * @param {string} [options.runId=null]
 * @param {Function} [options.invokeFn=null] — for testing; defaults to real invoke
 * @returns {{ execute(): Promise<object> }}
 */
export function createRoundOrchestrator(options) {
  const {
    topic,
    providers,
    rounds: maxRounds = 2,
    projectContext = '',
    timeout = 60000,
    evalStore = null,
    runId: existingRunId = null,
    invokeFn = null,
    enableClaimExtraction = false,
    claimProvider = 'claude',
    claimTimeout = 30000
  } = options;

  const clampedRounds = Math.max(1, Math.min(4, maxRounds));

  return {
    async execute() {
      // Lazy-load real invoke if not injected
      const doInvoke = invokeFn || (await import('../providers/index.js')).invoke;

      const startTime = Date.now();
      const aliasMap = createAliasMap(providers);
      const roundHistory = [];
      let runId = existingRunId;

      // Start eval run if store provided and no existing runId
      if (evalStore && !runId) {
        runId = evalStore.startRun({
          project: 'consilium',
          topic,
          mode: 'providers',
          providers
        });
      }

      for (let roundNum = 1; roundNum <= clampedRounds; roundNum++) {
        const prevRound = roundHistory[roundHistory.length - 1] || null;

        // Claim extraction between R1 → R2 (CBDP Phase 1)
        let roundClaims = null;
        if (enableClaimExtraction && roundNum === 2 && prevRound) {
          const successfulResponses = prevRound.responses
            .filter(r => r.status === 'success')
            .map(r => ({ provider: r.provider, alias: r.alias, response: r.response }));

          if (successfulResponses.length > 0) {
            try {
              roundClaims = await extractClaimsFromResponses({
                responses: successfulResponses,
                invokeFn: doInvoke,
                extractionProvider: claimProvider,
                timeout: claimTimeout
              });
              if (roundClaims.size === 0) roundClaims = null;
            } catch {
              roundClaims = null;
            }
          }
        }

        // Build prompts for this round
        const providerPrompts = new Map();
        for (const provider of providers) {
          if (roundNum === 1) {
            providerPrompts.set(provider, buildR1Prompt(topic, projectContext));
          } else {
            // Get this provider's previous response
            const ownPrev = prevRound?.responses.find(r => r.provider === provider);
            if (!ownPrev || ownPrev.status !== 'success') {
              // Provider failed last round — still try with empty context
              providerPrompts.set(provider, buildR1Prompt(topic, projectContext));
              continue;
            }

            // Get anonymized responses of others (only successful ones)
            const othersResponses = prevRound.responses
              .filter(r => r.provider !== provider && r.status === 'success')
              .map(r => ({ alias: r.alias, response: r.response }));

            if (othersResponses.length === 0) {
              // No others succeeded — re-send R1-style prompt
              providerPrompts.set(provider, buildR1Prompt(topic, projectContext));
              continue;
            }

            // Build claims block for others if extraction succeeded
            let claimsBlockStr = null;
            if (roundClaims) {
              const othersClaims = othersResponses
                .map(r => ({
                  alias: r.alias,
                  claims: roundClaims.get(r.alias) || []
                }))
                .filter(c => c.claims.length > 0);

              if (othersClaims.length > 0) {
                claimsBlockStr = formatClaimsBlock(othersClaims);
              }
            }

            providerPrompts.set(provider, buildFollowUpPrompt({
              topic,
              ownAlias: aliasMap.get(provider),
              ownPreviousResponse: ownPrev.response,
              othersResponses,
              roundNumber: roundNum,
              totalRounds: clampedRounds,
              claimsBlock: claimsBlockStr
            }));
          }
        }

        // Dispatch all providers in parallel
        const results = await Promise.allSettled(
          providers.map(async (provider) => {
            const prompt = providerPrompts.get(provider);
            const startMs = Date.now();
            const result = await doInvoke(provider, prompt, { timeout });
            const elapsed = Date.now() - startMs;
            return { provider, result, elapsed };
          })
        );

        // Collect round responses
        const roundEntry = {
          round: roundNum,
          responses: [],
          claims: roundClaims ? Object.fromEntries(roundClaims) : null
        };

        for (const settled of results) {
          if (settled.status === 'fulfilled') {
            const { provider, result, elapsed } = settled.value;
            const alias = aliasMap.get(provider);
            const isSuccess = result.status === 'success';

            // Detect position change for R2+
            let positionChanged = 0;
            if (roundNum > 1 && isSuccess && prevRound) {
              const prevResponse = prevRound.responses.find(r => r.provider === provider);
              if (prevResponse?.status === 'success') {
                const parsed = parseStructuredResponse(result.response);
                const prevText = prevResponse.response || '';
                // Simple heuristic: if current_position differs from previous response
                positionChanged = parsed.current_position !== prevText ? 1 : 0;
              }
            }

            const entry = {
              provider,
              alias,
              status: isSuccess ? 'success' : (result.status || 'error'),
              response: isSuccess ? result.response : (result.error || 'No response'),
              response_ms: elapsed,
              error: isSuccess ? null : (result.error || result.detail || null)
            };
            roundEntry.responses.push(entry);

            // Record in eval store
            if (evalStore) {
              try {
                evalStore.addRoundResponse(runId, {
                  round: roundNum,
                  provider,
                  alias,
                  status: entry.status === 'success' ? 'completed' : entry.status,
                  response_ms: elapsed,
                  response_text: entry.response?.slice(0, 10000) || null,
                  confidence: isSuccess && roundNum > 1
                    ? (parseStructuredResponse(result.response).confidence ?? null)
                    : null,
                  position_changed: positionChanged
                });
              } catch {
                // Fail silently
              }
            }
          } else {
            // Promise rejected
            const provider = providers[results.indexOf(settled)];
            roundEntry.responses.push({
              provider,
              alias: aliasMap.get(provider),
              status: 'error',
              response: settled.reason?.message || 'Unknown error',
              response_ms: 0,
              error: settled.reason?.message || 'Promise rejected'
            });
          }
        }

        roundHistory.push(roundEntry);
      }

      const totalDurationMs = Date.now() - startTime;

      return {
        topic,
        providers,
        rounds: roundHistory,
        aliasMap,
        totalDurationMs,
        runId
      };
    }
  };
}
