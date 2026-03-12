import { z } from 'zod';
import {
  IsoDatetimeSchema,
  ProviderKeySchema,
  UnitIntervalSchema,
} from './runtime-schemas.js';

export const ConsiliumParticipantSchema = z.object({
  provider: ProviderKeySchema,
  alias: z.string().min(1),
}).strict();

export const ConsiliumObservabilityResponseSchema = z.object({
  provider: ProviderKeySchema,
  alias: z.string().min(1),
  status: z.string().min(1),
  responseMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
}).strict();

export const ConsiliumObservabilityRoundSchema = z.object({
  round: z.number().int().positive(),
  successfulResponses: z.number().int().nonnegative(),
  failedResponses: z.number().int().nonnegative(),
  claimsExtracted: z.number().int().nonnegative(),
  newClaims: z.number().int().nonnegative(),
  responses: z.array(ConsiliumObservabilityResponseSchema),
}).strict();

export const ConsiliumTrustScoreSchema = z.object({
  targetAlias: z.string().min(1),
  targetProvider: ProviderKeySchema.nullable(),
  score: UnitIntervalSchema,
}).strict();

export const ConsiliumTrustMatrixRowSchema = z.object({
  fromAlias: z.string().min(1),
  fromProvider: ProviderKeySchema.nullable(),
  scores: z.array(ConsiliumTrustScoreSchema),
}).strict();

export const ConsiliumClaimGraphStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  consensusCount: z.number().int().nonnegative(),
  contestedCount: z.number().int().nonnegative(),
  uniqueCount: z.number().int().nonnegative(),
  contentionRatio: UnitIntervalSchema,
}).strict();

export const ConsiliumSynthesisSummarySchema = z.object({
  provider: ProviderKeySchema.nullable(),
  status: z.string().nullable(),
  confidence: UnitIntervalSchema.nullable(),
  recommendation: z.string().nullable(),
  consensusPoints: z.number().int().nonnegative(),
  disputedPoints: z.number().int().nonnegative(),
}).strict();

export const ConsiliumAutoStopSchema = z.object({
  stoppedAfterRound: z.number().int().positive(),
  reason: z.string().min(1),
}).strict();

export const ConsiliumObservabilitySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  runId: z.string().nullable(),
  topic: z.string().min(1),
  totalDurationMs: z.number().int().nonnegative(),
  structured: z.boolean(),
  participants: z.array(ConsiliumParticipantSchema),
  rounds: z.array(ConsiliumObservabilityRoundSchema),
  trustMatrix: z.array(ConsiliumTrustMatrixRowSchema),
  claimGraph: ConsiliumClaimGraphStatsSchema.nullable(),
  synthesis: ConsiliumSynthesisSummarySchema,
  autoStop: ConsiliumAutoStopSchema.nullable(),
}).strict();

export function createConsiliumObservabilitySnapshot(input) {
  return ConsiliumObservabilitySchema.parse(input);
}

export function buildConsiliumObservabilitySnapshot(result, options = {}) {
  const participants = normalizeParticipants(result?.aliasMap);
  const aliasResolver = createAliasResolver(participants);
  const participantByAlias = new Map(participants.map((participant) => [participant.alias, participant]));
  const generatedAt = normalizeIsoDatetime(options.generatedAt);

  const rounds = Array.isArray(result?.rounds)
    ? result.rounds.map((round) => {
        const responses = Array.isArray(round?.responses)
          ? round.responses.map((response) => {
              const provider = normalizeProviderKey(response?.provider);
              const alias = normalizeAlias(
                response?.alias || participants.find((participant) => participant.provider === provider)?.alias || provider
              );

              return {
                provider,
                alias,
                status: normalizeStatus(response?.status),
                responseMs: normalizeNullableDuration(response?.response_ms),
                error: normalizeNullableString(response?.error),
              };
            })
          : [];

        const successfulResponses = responses.filter((response) =>
          response.status === 'success' || response.status === 'completed'
        ).length;

        return {
          round: normalizePositiveInt(round?.round, 1),
          successfulResponses,
          failedResponses: Math.max(0, responses.length - successfulResponses),
          claimsExtracted: countClaimRecords(round?.claims),
          newClaims: countClaimRecords(round?.new_claims),
          responses,
        };
      })
    : [];

  const trustMatrix = Object.entries(result?.aggregatedTrustScores || {})
    .map(([fromAliasRaw, scores]) => {
      const fromAlias = aliasResolver(fromAliasRaw);
      const participant = participantByAlias.get(fromAlias) || null;
      const normalizedScores = Object.entries(scores || {})
        .map(([targetAliasRaw, score]) => {
          const targetAlias = aliasResolver(targetAliasRaw);
          const targetParticipant = participantByAlias.get(targetAlias) || null;
          return {
            targetAlias,
            targetProvider: targetParticipant?.provider || null,
            score: clampUnitInterval(score),
          };
        })
        .sort((left, right) => left.targetAlias.localeCompare(right.targetAlias));

      return {
        fromAlias,
        fromProvider: participant?.provider || null,
        scores: normalizedScores,
      };
    })
    .sort((left, right) => left.fromAlias.localeCompare(right.fromAlias));

  const claimGraphStats = result?.claimGraph?.stats
    ? {
        total: normalizeNonNegativeInt(result.claimGraph.stats.total),
        consensusCount: normalizeNonNegativeInt(result.claimGraph.stats.consensus_count),
        contestedCount: normalizeNonNegativeInt(result.claimGraph.stats.contested_count),
        uniqueCount: normalizeNonNegativeInt(result.claimGraph.stats.unique_count),
        contentionRatio: clampUnitInterval(result.claimGraph.stats.contention_ratio),
      }
    : null;

  const synthesisParsed = result?.synthesis?.parsed || null;
  const synthesis = {
    provider: normalizeNullableProviderKey(result?.synthesis?.provider),
    status: normalizeNullableString(result?.synthesis?.status),
    confidence: typeof synthesisParsed?.confidence === 'number'
      ? clampUnitInterval(synthesisParsed.confidence)
      : null,
    recommendation: normalizeNullableString(synthesisParsed?.recommendation),
    consensusPoints: Array.isArray(synthesisParsed?.consensus_points)
      ? synthesisParsed.consensus_points.length
      : 0,
    disputedPoints: Array.isArray(synthesisParsed?.disputed_points)
      ? synthesisParsed.disputed_points.length
      : 0,
  };

  return createConsiliumObservabilitySnapshot({
    generatedAt,
    runId: typeof result?.runId === 'string' && result.runId.trim() ? result.runId : null,
    topic: normalizeTopic(result?.topic),
    totalDurationMs: normalizeNonNegativeInt(result?.totalDurationMs),
    structured: Boolean(result?.structured),
    participants,
    rounds,
    trustMatrix,
    claimGraph: claimGraphStats,
    synthesis,
    autoStop: result?.autoStop
      ? {
          stoppedAfterRound: normalizePositiveInt(result.autoStop.stoppedAfterRound, 1),
          reason: normalizeTopic(result.autoStop.reason),
        }
      : null,
  });
}

function normalizeParticipants(aliasMap) {
  if (!aliasMap) return [];
  const entries = aliasMap instanceof Map
    ? [...aliasMap.entries()]
    : Array.isArray(aliasMap)
      ? aliasMap.map((item) => [item.provider, item.alias])
      : Object.entries(aliasMap);

  return entries
    .map(([provider, alias]) => ({
      provider: normalizeProviderKey(provider),
      alias: normalizeAlias(alias || provider),
    }))
    .filter((participant, index, all) =>
      all.findIndex((candidate) => candidate.provider === participant.provider) === index
    );
}

function createAliasResolver(participants) {
  const aliasMap = new Map();
  for (const participant of participants) {
    aliasMap.set(participant.alias, participant.alias);
    const shortAlias = participant.alias.split(' ').pop();
    if (shortAlias) aliasMap.set(shortAlias, participant.alias);
  }

  return (value) => {
    const normalized = normalizeAlias(value);
    return aliasMap.get(normalized) || normalized;
  };
}

function countClaimRecords(record) {
  if (!record || typeof record !== 'object') return 0;
  return Object.values(record).reduce((total, claims) => (
    total + (Array.isArray(claims) ? claims.length : 0)
  ), 0);
}

function clampUnitInterval(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return +num.toFixed(2);
}

function normalizePositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.round(num);
}

function normalizeNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num);
}

function normalizeNullableDuration(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function normalizeProviderKey(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || 'claude';
}

function normalizeNullableProviderKey(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function normalizeAlias(value) {
  const text = String(value || '').trim();
  return text || 'Unknown participant';
}

function normalizeStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || 'error';
}

function normalizeTopic(value) {
  const text = String(value || '').trim();
  return text || 'consilium';
}

function normalizeNullableString(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeIsoDatetime(value) {
  if (typeof value === 'string' && value.trim()) return value;
  return new Date().toISOString();
}
