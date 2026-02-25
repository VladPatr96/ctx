/**
 * prompts.js — Pure prompt templates for multi-round consilium.
 *
 * No I/O, no side effects. All functions are deterministic.
 */

/**
 * Build the Round 1 prompt — free-form analysis.
 * @param {string} topic
 * @param {string} [projectContext='']
 * @returns {string}
 */
export function buildR1Prompt(topic, projectContext = '') {
  const ctx = projectContext ? `\nКонтекст проекта: ${projectContext}\n` : '';
  return `Ты участник анонимной экспертной дискуссии.
${ctx}
Задача: ${topic}

Дай своё обоснованное предложение по решению. Включи:
1. Подход (что делать)
2. Обоснование (почему именно так)
3. Риски (что может пойти не так)
4. Альтернативы (что ещё рассматривал)

Отвечай на русском. Максимум 500 слов.`;
}

/**
 * Format anonymized responses for embedding in a follow-up prompt.
 * @param {Array<{alias: string, response: string}>} responses
 * @returns {string}
 */
export function formatAnonymizedResponses(responses) {
  return responses
    .map(r => `--- ${r.alias} ---\n${r.response}`)
    .join('\n\n');
}

/**
 * Format extracted claims for embedding in a follow-up prompt.
 * @param {Array<{alias: string, claims: Array<{id: string, text: string, type: string}>}>} participantClaims
 * @returns {string}
 */
export function formatClaimsBlock(participantClaims) {
  return participantClaims
    .map(({ alias, claims }) => {
      const claimLines = claims
        .map(c => `  [${c.id}] (${c.type}) ${c.text}`)
        .join('\n');
      return `--- ${alias} ---\n${claimLines}`;
    })
    .join('\n\n');
}

/**
 * Build a Round 2+ prompt for a specific provider.
 * @param {object} params
 * @param {string} params.topic
 * @param {string} params.ownAlias
 * @param {string} params.ownPreviousResponse
 * @param {Array<{alias: string, response: string}>} params.othersResponses
 * @param {number} params.roundNumber
 * @param {number} params.totalRounds
 * @returns {string}
 */
export function buildFollowUpPrompt({ topic, ownAlias, ownPreviousResponse, othersResponses, roundNumber, totalRounds, claimsBlock }) {
  // If claims provided, use claims-based format; otherwise use full text (backward compat)
  const othersBlock = claimsBlock || formatAnonymizedResponses(othersResponses);
  const othersLabel = claimsBlock
    ? 'Ключевые утверждения (claims) других участников из предыдущего раунда:'
    : 'Ответы других участников из предыдущего раунда:';
  const claimsRule = claimsBlock
    ? '\n- Ссылайся на конкретные claims по ID (например A1, B2)'
    : '';

  return `Ты ${ownAlias} в многораундовой экспертной дискуссии.
Задача: ${topic}

Твой ответ в предыдущем раунде:
${ownPreviousResponse}

${othersLabel}

${othersBlock}

---
Это раунд ${roundNumber} из ${totalRounds}.
Проанализируй решения коллег и ответь СТРОГО JSON-объектом:

{
  "current_position": "Твоя уточнённая/подтверждённая позиция (если изменил — объясни почему)",
  "evaluations": [
    { "participant": "${othersResponses[0]?.alias || 'Participant A'}", "assessment": "Твоя оценка подхода" }${othersResponses.length > 1 ? othersResponses.slice(1).map(r => `,\n    { "participant": "${r.alias}", "assessment": "..." }`).join('') : ''}
  ],
  "agreements": ["С чем согласен у других"],
  "disagreements": ["С чем не согласен и почему"],
  "confidence": 0.8
}

Правила:
- Защити или скорректируй свою позицию на основе аргументов других
- Честно оцени подход каждого участника
- Явно укажи согласия и несогласия${claimsRule}
- Скорректируй confidence на основе силы аргументов
- Ответь ТОЛЬКО JSON-объектом, без markdown`;
}

/**
 * Build the final synthesis prompt for the lead synthesizer.
 * @param {object} params
 * @param {string} params.topic
 * @param {Array<{round: number, responses: Array<{provider: string, alias: string, status: string, response: string}>}>} params.rounds
 * @param {Map<string, string>|object} params.aliasMap — provider → alias mapping
 * @returns {string}
 */
export function buildSynthesisPrompt({ topic, rounds, aliasMap }) {
  // Build alias reveal section
  const aliasEntries = aliasMap instanceof Map
    ? [...aliasMap.entries()]
    : Object.entries(aliasMap);
  const aliasReveal = aliasEntries
    .map(([provider, alias]) => `- ${alias} = ${provider}`)
    .join('\n');

  // Build round history
  const roundHistory = rounds.map(r => {
    const header = `=== Раунд ${r.round} ===`;
    const entries = r.responses
      .filter(resp => resp.status === 'success')
      .map(resp => `**${resp.provider}** (${resp.alias}):\n${resp.response}`)
      .join('\n\n');
    return `${header}\n${entries}`;
  }).join('\n\n');

  return `Ты главный синтезатор многораундового консилиума.
Задача: ${topic}

Маппинг участников (раскрыт):
${aliasReveal}

Полная история дискуссии:

${roundHistory}

Проанализируй дискуссию и предоставь:
1. **Эволюция позиций**: как менялась позиция каждого провайдера через раунды?
2. **Конвергенция**: в чём участники сошлись?
3. **Неразрешённые разногласия**: что осталось спорным?
4. **Сильнейшие аргументы**: какие тезисы выдержали критику?
5. **Итоговая рекомендация**: синтезируй лучшие элементы
6. **Оценка уверенности**: насколько крепко заключение?

Отвечай на русском.`;
}
