/**
 * round-orchestrator.js — Multi-round anonymous consilium orchestration.
 *
 * Factory pattern: createRoundOrchestrator returns an object with execute().
 * Dependency injection for invoke and evalStore enables testing.
 */

import { buildR1Prompt, buildFollowUpPrompt, buildStructuredFollowUpPrompt, buildSmartSynthesisPrompt, formatClaimsBlock } from './prompts.js';
import { extractClaimsFromResponses } from './claim-extractor.js';
import { buildClaimGraph, formatClaimGraph } from './claim-graph.js';

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

const VALID_STANCES = ['agree', 'partial_agree', 'disagree', 'new_proposal'];
const VALID_CHALLENGE_TYPES = ['weaken', 'contradict'];
const VALID_CLAIM_TYPES = ['fact', 'opinion', 'risk', 'requirement'];

/**
 * Parse structured R2+ response (CBDP Phase 2).
 * @param {string} rawResponse
 * @param {string} ownAliasPrefix — e.g. 'B' (letter only)
 * @param {number} [roundNumber=2]
 * @returns {object}
 */
export function parseStructuredResponseV2(rawResponse, ownAliasPrefix, roundNumber = 2) {
  const fallback = {
    stance: 'partial_agree',
    confidence: 0.5,
    accepts: [],
    challenges: [],
    new_claims: [],
    trust_scores: {}
  };

  if (!rawResponse || typeof rawResponse !== 'string') return fallback;

  let jsonStr = rawResponse.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    const stance = VALID_STANCES.includes(parsed.stance) ? parsed.stance : 'partial_agree';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    const accepts = Array.isArray(parsed.accepts)
      ? parsed.accepts.filter(a => typeof a === 'string')
      : [];

    const challenges = Array.isArray(parsed.challenges)
      ? parsed.challenges.map(c => ({
          target: c?.target || '',
          type: VALID_CHALLENGE_TYPES.includes(c?.type) ? c.type : 'weaken',
          argument: c?.argument || ''
        }))
      : [];

    const rawNewClaims = Array.isArray(parsed.new_claims) ? parsed.new_claims : [];
    const new_claims = rawNewClaims.map((c, idx) => ({
      id: `${ownAliasPrefix}${roundNumber}-${idx + 1}`,
      text: c?.text || '',
      type: VALID_CLAIM_TYPES.includes(c?.type) ? c.type : 'opinion'
    }));

    const trust_scores = (parsed.trust_scores && typeof parsed.trust_scores === 'object' && !Array.isArray(parsed.trust_scores))
      ? Object.fromEntries(
          Object.entries(parsed.trust_scores)
            .filter(([, v]) => typeof v === 'number')
            .map(([k, v]) => [k, Math.max(0, Math.min(1, v))])
        )
      : {};

    return { stance, confidence, accepts, challenges, new_claims, trust_scores };
  } catch {
    return fallback;
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
    claimTimeout = 30000,
    enableStructuredResponse = false,
    enableSmartSynthesis = false,
    synthesisProvider = 'claude',
    synthesisTimeout = 90000
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

      // Phase 2: accumulated claims and trust scores
      const accumulatedClaims = new Map(); // alias → [...claims]
      const trustScoreHistory = new Map(); // alias → [{round, scores}]
      let autoStopInfo = null; // Phase 3: auto-stop info

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

            // Seed accumulatedClaims from R1 extraction (once)
            if (roundClaims && accumulatedClaims.size === 0) {
              for (const [alias, claims] of roundClaims) {
                accumulatedClaims.set(alias, [...claims]);
              }
            }

            if (enableStructuredResponse) {
              // Build allClaims block from accumulated claims
              let allClaimsStr = null;
              if (accumulatedClaims.size > 0) {
                const allClaimsArr = [...accumulatedClaims.entries()]
                  .filter(([alias]) => alias !== aliasMap.get(provider))
                  .map(([alias, claims]) => ({ alias, claims }))
                  .filter(c => c.claims.length > 0);
                if (allClaimsArr.length > 0) {
                  allClaimsStr = formatClaimsBlock(allClaimsArr);
                }
              }

              providerPrompts.set(provider, buildStructuredFollowUpPrompt({
                topic,
                ownAlias: aliasMap.get(provider),
                ownPreviousResponse: ownPrev.response,
                othersResponses,
                roundNumber: roundNum,
                totalRounds: clampedRounds,
                claimsBlock: claimsBlockStr,
                allClaims: allClaimsStr
              }));
            } else {
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
          claims: roundClaims ? Object.fromEntries(roundClaims) : null,
          new_claims: null
        };

        const roundNewClaims = new Map(); // alias → new_claims from this round

        for (const settled of results) {
          if (settled.status === 'fulfilled') {
            const { provider, result, elapsed } = settled.value;
            const alias = aliasMap.get(provider);
            const isSuccess = result.status === 'success';
            const aliasLetter = alias.replace('Participant ', '');

            // Detect position change for R2+
            let positionChanged = 0;
            let parsedV2 = null;
            if (roundNum > 1 && isSuccess && prevRound) {
              const prevResponse = prevRound.responses.find(r => r.provider === provider);
              if (prevResponse?.status === 'success') {
                if (enableStructuredResponse) {
                  parsedV2 = parseStructuredResponseV2(result.response, aliasLetter, roundNum);
                  positionChanged = parsedV2.stance !== 'agree' ? 1 : 0;
                } else {
                  const parsed = parseStructuredResponse(result.response);
                  const prevText = prevResponse.response || '';
                  positionChanged = parsed.current_position !== prevText ? 1 : 0;
                }
              }
            }

            // Accumulate new_claims and trust_scores for Phase 2
            if (enableStructuredResponse && roundNum > 1 && isSuccess) {
              if (!parsedV2) parsedV2 = parseStructuredResponseV2(result.response, aliasLetter, roundNum);

              // Accumulate new_claims
              if (parsedV2.new_claims.length > 0) {
                roundNewClaims.set(alias, parsedV2.new_claims);
                const existing = accumulatedClaims.get(alias) || [];
                accumulatedClaims.set(alias, [...existing, ...parsedV2.new_claims]);
              }

              // Accumulate trust_scores
              if (Object.keys(parsedV2.trust_scores).length > 0) {
                const history = trustScoreHistory.get(alias) || [];
                history.push({ round: roundNum, scores: parsedV2.trust_scores });
                trustScoreHistory.set(alias, history);
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
                const confidence = isSuccess && roundNum > 1
                  ? (enableStructuredResponse
                      ? (parsedV2 || parseStructuredResponseV2(result.response, aliasLetter, roundNum)).confidence
                      : (parseStructuredResponse(result.response).confidence ?? null))
                  : null;
                evalStore.addRoundResponse(runId, {
                  round: roundNum,
                  provider,
                  alias,
                  status: entry.status === 'success' ? 'completed' : entry.status,
                  response_ms: elapsed,
                  response_text: entry.response?.slice(0, 10000) || null,
                  confidence,
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

        if (roundNewClaims.size > 0) {
          roundEntry.new_claims = Object.fromEntries(roundNewClaims);
        }

        roundHistory.push(roundEntry);

        // Phase 3: auto-stop if no contested claims
        if (enableSmartSynthesis && enableStructuredResponse && roundNum >= 2 && roundNum < clampedRounds) {
          const graph = buildClaimGraph({
            allClaims: accumulatedClaims,
            rounds: roundHistory,
            enableStructuredResponse
          });
          if (graph.stats.contested_count === 0) {
            autoStopInfo = { stoppedAfterRound: roundNum, reason: 'No contested claims remaining' };
            break;
          }
        }
      }

      const totalDurationMs = Date.now() - startTime;

      const result = {
        topic,
        providers,
        rounds: roundHistory,
        aliasMap,
        totalDurationMs,
        runId
      };

      // Phase 2: add structured data
      if (enableStructuredResponse) {
        result.structured = true;
        result.allClaims = Object.fromEntries(
          [...accumulatedClaims.entries()].map(([alias, claims]) => [alias, claims])
        );

        // Aggregate trust scores: average per alias pair across rounds
        const aggregated = {};
        for (const [fromAlias, history] of trustScoreHistory) {
          aggregated[fromAlias] = {};
          const allTargets = new Set();
          for (const { scores } of history) {
            for (const target of Object.keys(scores)) allTargets.add(target);
          }
          for (const target of allTargets) {
            const values = history
              .map(h => h.scores[target])
              .filter(v => typeof v === 'number');
            if (values.length > 0) {
              aggregated[fromAlias][target] = +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
            }
          }
        }
        result.aggregatedTrustScores = aggregated;
      }

      // Phase 3: smart synthesis
      if (enableSmartSynthesis) {
        const claimGraphData = enableStructuredResponse && accumulatedClaims.size > 0
          ? buildClaimGraph({ allClaims: accumulatedClaims, rounds: roundHistory, enableStructuredResponse })
          : null;

        if (claimGraphData) {
          result.claimGraph = claimGraphData;
        }
        if (autoStopInfo) {
          result.autoStop = autoStopInfo;
        }

        // Build and execute synthesis
        try {
          const claimGraphStr = claimGraphData ? formatClaimGraph(claimGraphData) : null;
          const aggregatedScores = result.aggregatedTrustScores || {};
          const synthesisPrompt = buildSmartSynthesisPrompt({
            topic,
            rounds: roundHistory,
            aliasMap,
            claimGraphFormatted: claimGraphStr,
            aggregatedTrustScores: aggregatedScores,
            autoStopped: autoStopInfo
          });

          const synthResult = await doInvoke(synthesisProvider, synthesisPrompt, { timeout: synthesisTimeout });
          const synthEntry = {
            provider: synthesisProvider,
            status: synthResult.status === 'success' ? 'success' : 'error',
            response: synthResult.response || synthResult.error || null,
            parsed: null
          };

          // Try to parse structured synthesis response
          if (synthResult.status === 'success' && synthResult.response) {
            try {
              let jsonStr = synthResult.response.trim();
              const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (jsonMatch) jsonStr = jsonMatch[1].trim();
              const firstBrace = jsonStr.indexOf('{');
              const lastBrace = jsonStr.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace > firstBrace) {
                jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
              }
              const parsed = JSON.parse(jsonStr);
              synthEntry.parsed = {
                consensus_points: Array.isArray(parsed.consensus_points) ? parsed.consensus_points : [],
                disputed_points: Array.isArray(parsed.disputed_points) ? parsed.disputed_points : [],
                recommendation: parsed.recommendation || '',
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
                trust_weighted_summary: parsed.trust_weighted_summary || ''
              };
            } catch {
              // Keep raw response, parsed stays null
            }
          }

          result.synthesis = synthEntry;
        } catch (err) {
          result.synthesis = {
            provider: synthesisProvider,
            status: 'error',
            response: err?.message || 'Synthesis failed',
            parsed: null
          };
        }
      }

      return result;
    }
  };
}
