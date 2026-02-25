/**
 * claim-extractor.js — LLM-based claim extraction from free-text responses.
 *
 * Extracts key claims (assertions) from R1 free-text responses and structures
 * them for use in R2+ prompts (CBDP Phase 1).
 *
 * Pure logic + single LLM call per response. No side effects beyond invokeFn.
 */

const VALID_TYPES = new Set(['fact', 'opinion', 'risk', 'requirement']);
const MAX_CLAIMS = 7;

/**
 * Build extraction prompt for a single R1 response.
 * @param {string} responseText — full R1 text from one provider
 * @param {string} participantAlias — e.g. "Participant A"
 * @returns {string}
 */
export function buildClaimExtractionPrompt(responseText, participantAlias) {
  return `Проанализируй следующий текст участника "${participantAlias}" и извлеки ключевые утверждения (claims).

Текст:
${responseText}

Извлеки каждое конкретное утверждение и классифицируй его тип.

Ответь СТРОГО JSON-массивом:
[
  { "text": "конкретное утверждение", "type": "fact|opinion|risk|requirement" },
  ...
]

Правила:
- Каждый claim — одно конкретное утверждение (1-2 предложения)
- Типы: fact (факт/наблюдение), opinion (мнение/рекомендация), risk (риск/проблема), requirement (требование/условие)
- Максимум ${MAX_CLAIMS} claims на участника
- Ответь ТОЛЬКО JSON-массивом, без markdown`;
}

/**
 * Parse LLM extraction result into structured claims.
 * @param {string} rawResponse — raw LLM output
 * @param {string} aliasPrefix — e.g. "A" (letter from alias)
 * @returns {Array<{id: string, text: string, type: string}>}
 */
export function parseClaimExtractionResponse(rawResponse, aliasPrefix) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return [];
  }

  let jsonStr = rawResponse.trim();

  // Strip markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

  // Find array boundaries
  const firstBracket = jsonStr.indexOf('[');
  const lastBracket = jsonStr.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    jsonStr = jsonStr.slice(firstBracket, lastBracket + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item => item && typeof item.text === 'string' && item.text.trim())
      .slice(0, MAX_CLAIMS)
      .map((item, idx) => ({
        id: `${aliasPrefix}${idx + 1}`,
        text: item.text.trim(),
        type: VALID_TYPES.has(item.type) ? item.type : 'opinion'
      }));
  } catch {
    return [];
  }
}

/**
 * Extract alias prefix letter from alias string.
 * "Participant A" → "A", "Participant B" → "B"
 * @param {string} alias
 * @returns {string}
 */
function aliasPrefix(alias) {
  const match = alias.match(/Participant\s+(\w)/);
  return match ? match[1] : alias.charAt(0);
}

/**
 * Extract claims from all R1 responses via LLM calls.
 * @param {object} params
 * @param {Array<{provider: string, alias: string, response: string}>} params.responses
 * @param {Function} params.invokeFn — (provider, prompt, opts) => result
 * @param {string} [params.extractionProvider='claude']
 * @param {number} [params.timeout=30000]
 * @returns {Promise<Map<string, Array<{id: string, text: string, type: string}>>>} alias → claims[]
 */
export async function extractClaimsFromResponses({
  responses,
  invokeFn,
  extractionProvider = 'claude',
  timeout = 30000
}) {
  const claimsMap = new Map();

  const results = await Promise.allSettled(
    responses.map(async (r) => {
      const prompt = buildClaimExtractionPrompt(r.response, r.alias);
      const result = await invokeFn(extractionProvider, prompt, { timeout });
      return { alias: r.alias, result, prefix: aliasPrefix(r.alias) };
    })
  );

  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      const { alias, result, prefix } = settled.value;
      if (result.status === 'success' && result.response) {
        const claims = parseClaimExtractionResponse(result.response, prefix);
        if (claims.length > 0) {
          claimsMap.set(alias, claims);
        }
      }
    }
  }

  return claimsMap;
}
