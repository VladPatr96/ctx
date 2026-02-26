/**
 * claim-graph.js — Build claim graph from accumulated claims and round responses.
 *
 * Classifies claims into consensus / contested / unique based on
 * accepts and challenges from structured R2+ responses.
 *
 * Pure logic, no I/O, no side effects.
 */

import { parseStructuredResponseV2 } from './round-orchestrator.js';

/**
 * Build a claim graph from allClaims and round responses.
 * @param {object} params
 * @param {Record<string, Array<{id, text, type}>>|Map} params.allClaims — alias → claims[]
 * @param {Array<{round, responses: Array<{alias, status, response}>}>} params.rounds
 * @param {boolean} [params.enableStructuredResponse=true]
 * @returns {{
 *   consensus: Array<{id, text, type, supportedBy: string[]}>,
 *   contested: Array<{id, text, type, positions: Array<{alias, stance: 'accept'|'challenge', argument?}>}>,
 *   unique: Array<{id, text, type, from: string}>,
 *   stats: {total: number, consensus_count: number, contested_count: number, unique_count: number, contention_ratio: number}
 * }}
 */
export function buildClaimGraph({ allClaims, rounds, enableStructuredResponse = true }) {
  // Normalize allClaims to plain object
  const claimsObj = allClaims instanceof Map
    ? Object.fromEntries(allClaims)
    : (allClaims || {});

  // Flatten all claims into a list with source alias
  const allClaimsList = [];
  for (const [alias, claims] of Object.entries(claimsObj)) {
    for (const claim of claims) {
      allClaimsList.push({ ...claim, from: alias });
    }
  }

  if (allClaimsList.length === 0) {
    return {
      consensus: [],
      contested: [],
      unique: [],
      stats: { total: 0, consensus_count: 0, contested_count: 0, unique_count: 0, contention_ratio: 0 }
    };
  }

  // Collect accepts and challenges per claim ID from R2+ structured responses
  const acceptsMap = new Map();   // claimId → Set<alias>
  const challengesMap = new Map(); // claimId → Array<{alias, argument}>

  if (enableStructuredResponse) {
    for (const round of rounds) {
      if (round.round <= 1) continue; // R1 has no structured data

      for (const resp of round.responses) {
        if (resp.status !== 'success') continue;

        const aliasLetter = resp.alias.replace('Participant ', '');
        const parsed = parseStructuredResponseV2(resp.response, aliasLetter, round.round);

        // Track accepts
        for (const claimId of parsed.accepts) {
          if (!acceptsMap.has(claimId)) acceptsMap.set(claimId, new Set());
          acceptsMap.get(claimId).add(resp.alias);
        }

        // Track challenges
        for (const challenge of parsed.challenges) {
          if (!challenge.target) continue;
          if (!challengesMap.has(challenge.target)) challengesMap.set(challenge.target, []);
          challengesMap.get(challenge.target).push({
            alias: resp.alias,
            argument: challenge.argument || ''
          });
        }
      }
    }
  }

  // Classify each claim
  const consensus = [];
  const contested = [];
  const unique = [];

  for (const claim of allClaimsList) {
    const accepts = acceptsMap.get(claim.id);
    const challenges = challengesMap.get(claim.id);
    const hasAccepts = accepts && accepts.size > 0;
    const hasChallenges = challenges && challenges.length > 0;

    if (hasChallenges) {
      // Contested: at least 1 challenge
      const positions = [];
      if (hasAccepts) {
        for (const alias of accepts) {
          positions.push({ alias, stance: 'accept' });
        }
      }
      for (const ch of challenges) {
        positions.push({ alias: ch.alias, stance: 'challenge', argument: ch.argument });
      }
      contested.push({ id: claim.id, text: claim.text, type: claim.type, positions });
    } else if (hasAccepts && accepts.size >= 2) {
      // Consensus: accepted by 2+ participants, no challenges
      consensus.push({ id: claim.id, text: claim.text, type: claim.type, supportedBy: [...accepts] });
    } else if (hasAccepts && accepts.size === 1) {
      // Accepted by only 1 — treat as consensus with lower bar (still accepted, not challenged)
      consensus.push({ id: claim.id, text: claim.text, type: claim.type, supportedBy: [...accepts] });
    } else {
      // Unique: not referenced by anyone
      unique.push({ id: claim.id, text: claim.text, type: claim.type, from: claim.from });
    }
  }

  const total = allClaimsList.length;
  return {
    consensus,
    contested,
    unique,
    stats: {
      total,
      consensus_count: consensus.length,
      contested_count: contested.length,
      unique_count: unique.length,
      contention_ratio: total > 0 ? +(contested.length / total).toFixed(2) : 0
    }
  };
}

/**
 * Format claim graph as a readable text block for synthesis prompt.
 * @param {{consensus, contested, unique, stats}} graph
 * @returns {string}
 */
export function formatClaimGraph(graph) {
  const sections = [];

  sections.push(`=== Статистика ===
Всего claims: ${graph.stats.total}
Консенсус: ${graph.stats.consensus_count}
Спорные: ${graph.stats.contested_count}
Уникальные: ${graph.stats.unique_count}
Уровень спорности: ${(graph.stats.contention_ratio * 100).toFixed(0)}%`);

  if (graph.consensus.length > 0) {
    const lines = graph.consensus.map(c =>
      `  [${c.id}] (${c.type}) ${c.text} — поддержано: ${c.supportedBy.join(', ')}`
    );
    sections.push(`=== Консенсус (принятые claims) ===\n${lines.join('\n')}`);
  }

  if (graph.contested.length > 0) {
    const lines = graph.contested.map(c => {
      const posLines = c.positions.map(p =>
        p.stance === 'challenge'
          ? `    ${p.alias}: ОСПАРИВАЕТ — ${p.argument}`
          : `    ${p.alias}: принимает`
      );
      return `  [${c.id}] (${c.type}) ${c.text}\n${posLines.join('\n')}`;
    });
    sections.push(`=== Спорные claims ===\n${lines.join('\n')}`);
  }

  if (graph.unique.length > 0) {
    const lines = graph.unique.map(c =>
      `  [${c.id}] (${c.type}) ${c.text} — от: ${c.from}`
    );
    sections.push(`=== Уникальные (без реакции) ===\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
