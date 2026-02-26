import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAliasMap,
  parseStructuredResponse,
  parseStructuredResponseV2,
  createRoundOrchestrator
} from '../scripts/consilium/round-orchestrator.js';
import {
  buildR1Prompt,
  buildFollowUpPrompt,
  buildStructuredFollowUpPrompt,
  buildSynthesisPrompt,
  buildSmartSynthesisPrompt,
  formatAnonymizedResponses,
  formatClaimsBlock
} from '../scripts/consilium/prompts.js';
import {
  buildClaimGraph,
  formatClaimGraph
} from '../scripts/consilium/claim-graph.js';
import {
  buildClaimExtractionPrompt,
  parseClaimExtractionResponse,
  extractClaimsFromResponses
} from '../scripts/consilium/claim-extractor.js';

// ---- createAliasMap ----

test('createAliasMap: correct number of aliases', () => {
  const map = createAliasMap(['claude', 'gemini', 'codex']);
  assert.equal(map.size, 3);
});

test('createAliasMap: all aliases are unique', () => {
  const map = createAliasMap(['claude', 'gemini', 'codex', 'opencode']);
  const values = [...map.values()];
  assert.equal(new Set(values).size, values.length);
});

test('createAliasMap: all providers mapped', () => {
  const providers = ['claude', 'gemini', 'codex'];
  const map = createAliasMap(providers);
  for (const p of providers) {
    assert.ok(map.has(p), `${p} should be in alias map`);
    assert.ok(map.get(p).startsWith('Participant '), `alias should start with "Participant "`);
  }
});

test('createAliasMap: single provider', () => {
  const map = createAliasMap(['claude']);
  assert.equal(map.size, 1);
  assert.equal(map.get('claude'), 'Participant A');
});

// ---- parseStructuredResponse ----

test('parseStructuredResponse: valid JSON', () => {
  const json = JSON.stringify({
    current_position: 'my position',
    evaluations: [{ participant: 'A', assessment: 'good' }],
    agreements: ['point 1'],
    disagreements: ['point 2'],
    confidence: 0.9
  });
  const result = parseStructuredResponse(json);
  assert.equal(result.current_position, 'my position');
  assert.equal(result.evaluations.length, 1);
  assert.equal(result.confidence, 0.9);
});

test('parseStructuredResponse: invalid JSON → graceful fallback', () => {
  const result = parseStructuredResponse('This is just plain text, not JSON');
  assert.equal(result.current_position, 'This is just plain text, not JSON');
  assert.deepEqual(result.evaluations, []);
  assert.equal(result.confidence, 0.5);
});

test('parseStructuredResponse: empty string', () => {
  const result = parseStructuredResponse('');
  assert.equal(result.current_position, '');
  assert.deepEqual(result.evaluations, []);
});

test('parseStructuredResponse: null/undefined', () => {
  assert.equal(parseStructuredResponse(null).current_position, '');
  assert.equal(parseStructuredResponse(undefined).current_position, '');
});

test('parseStructuredResponse: JSON missing fields → defaults', () => {
  const result = parseStructuredResponse('{"current_position": "pos"}');
  assert.equal(result.current_position, 'pos');
  assert.deepEqual(result.evaluations, []);
  assert.deepEqual(result.agreements, []);
  assert.deepEqual(result.disagreements, []);
  assert.equal(result.confidence, 0.5);
});

test('parseStructuredResponse: JSON in markdown code block', () => {
  const input = '```json\n{"current_position": "from markdown", "confidence": 0.7}\n```';
  const result = parseStructuredResponse(input);
  assert.equal(result.current_position, 'from markdown');
  assert.equal(result.confidence, 0.7);
});

// ---- prompts ----

test('buildR1Prompt: includes topic', () => {
  const prompt = buildR1Prompt('test topic', 'Node.js project');
  assert.ok(prompt.includes('test topic'), 'should include topic');
  assert.ok(prompt.includes('Node.js project'), 'should include project context');
});

test('buildR1Prompt: works without projectContext', () => {
  const prompt = buildR1Prompt('test topic');
  assert.ok(prompt.includes('test topic'));
  assert.ok(!prompt.includes('undefined'));
});

test('buildFollowUpPrompt: includes anonymized responses without real names', () => {
  const prompt = buildFollowUpPrompt({
    topic: 'test',
    ownAlias: 'Participant B',
    ownPreviousResponse: 'my response',
    othersResponses: [
      { alias: 'Participant A', response: 'response A' },
      { alias: 'Participant C', response: 'response C' }
    ],
    roundNumber: 2,
    totalRounds: 3
  });
  assert.ok(prompt.includes('Participant B'), 'should include own alias');
  assert.ok(prompt.includes('my response'), 'should include own previous');
  assert.ok(prompt.includes('Participant A'), 'should include others alias');
  assert.ok(prompt.includes('response A'), 'should include others response');
  assert.ok(!prompt.includes('claude'), 'should NOT include real provider names');
  assert.ok(!prompt.includes('gemini'), 'should NOT include real provider names');
  assert.ok(prompt.includes('раунд 2 из 3'), 'should include round info');
});

test('buildSynthesisPrompt: reveals real names', () => {
  const prompt = buildSynthesisPrompt({
    topic: 'test topic',
    rounds: [{
      round: 1,
      responses: [
        { provider: 'claude', alias: 'Participant A', status: 'success', response: 'claude answer' },
        { provider: 'gemini', alias: 'Participant B', status: 'success', response: 'gemini answer' }
      ]
    }],
    aliasMap: new Map([['claude', 'Participant A'], ['gemini', 'Participant B']])
  });
  assert.ok(prompt.includes('Participant A = claude'), 'should reveal alias mapping');
  assert.ok(prompt.includes('Participant B = gemini'), 'should reveal alias mapping');
  assert.ok(prompt.includes('claude answer'), 'should include responses');
});

test('formatAnonymizedResponses: formats correctly', () => {
  const result = formatAnonymizedResponses([
    { alias: 'Participant A', response: 'hello' },
    { alias: 'Participant B', response: 'world' }
  ]);
  assert.ok(result.includes('--- Participant A ---'));
  assert.ok(result.includes('hello'));
  assert.ok(result.includes('--- Participant B ---'));
  assert.ok(result.includes('world'));
});

// ---- orchestrator ----

test('orchestrator: single round works', async () => {
  const invokeCalls = [];
  const mockInvoke = async (provider, prompt, opts) => {
    invokeCalls.push({ provider, prompt: prompt.slice(0, 50) });
    return { status: 'success', response: `Response from ${provider}` };
  };

  const orch = createRoundOrchestrator({
    topic: 'test topic',
    providers: ['a', 'b'],
    rounds: 1,
    invokeFn: mockInvoke
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0].responses.length, 2);
  assert.equal(invokeCalls.length, 2);
  assert.ok(result.aliasMap instanceof Map);
  assert.equal(result.aliasMap.size, 2);
});

test('orchestrator: two rounds dispatches R2 with anonymized R1', async () => {
  const invokePrompts = [];
  const mockInvoke = async (provider, prompt) => {
    invokePrompts.push({ provider, prompt });
    if (invokePrompts.length <= 3) {
      // R1 responses
      return { status: 'success', response: `R1 from ${provider}` };
    }
    // R2 responses
    return { status: 'success', response: JSON.stringify({ current_position: `R2 from ${provider}`, evaluations: [], agreements: [], disagreements: [], confidence: 0.8 }) };
  };

  const orch = createRoundOrchestrator({
    topic: 'debate test',
    providers: ['alpha', 'beta', 'gamma'],
    rounds: 2,
    invokeFn: mockInvoke
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 2);

  // R1: 3 providers
  assert.equal(result.rounds[0].responses.length, 3);

  // R2: 3 providers, prompts should contain anonymized R1 responses
  assert.equal(result.rounds[1].responses.length, 3);

  // R2 prompts should contain 'Participant' but not real provider names
  const r2Prompts = invokePrompts.slice(3);
  for (const p of r2Prompts) {
    assert.ok(p.prompt.includes('Participant'), `R2 prompt should contain anonymous aliases`);
  }
});

test('orchestrator: provider error in R1 handled gracefully', async () => {
  const mockInvoke = async (provider) => {
    if (provider === 'bad') return { status: 'error', error: 'timeout' };
    return { status: 'success', response: `OK from ${provider}` };
  };

  const orch = createRoundOrchestrator({
    topic: 'test',
    providers: ['good', 'bad'],
    rounds: 2,
    invokeFn: mockInvoke
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 2);

  // R1: bad should have error status
  const r1Bad = result.rounds[0].responses.find(r => r.provider === 'bad');
  assert.equal(r1Bad.status, 'error');

  // R2: should still run both providers
  assert.equal(result.rounds[1].responses.length, 2);
});

test('orchestrator: eval-store null → no errors', async () => {
  const mockInvoke = async (provider) => ({ status: 'success', response: 'ok' });

  const orch = createRoundOrchestrator({
    topic: 'test',
    providers: ['a'],
    rounds: 1,
    invokeFn: mockInvoke,
    evalStore: null
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 1);
  assert.equal(result.runId, null);
});

test('orchestrator: eval-store methods called correctly', async () => {
  const calls = { startRun: 0, addRoundResponse: [] };
  const mockStore = {
    startRun: (opts) => { calls.startRun++; return 'test-run-id'; },
    addRoundResponse: (runId, data) => { calls.addRoundResponse.push({ runId, ...data }); }
  };
  const mockInvoke = async (provider) => ({ status: 'success', response: `from ${provider}` });

  const orch = createRoundOrchestrator({
    topic: 'test',
    providers: ['x', 'y'],
    rounds: 1,
    invokeFn: mockInvoke,
    evalStore: mockStore
  });

  const result = await orch.execute();
  assert.equal(calls.startRun, 1);
  assert.equal(calls.addRoundResponse.length, 2);
  assert.equal(result.runId, 'test-run-id');
  assert.ok(calls.addRoundResponse.every(c => c.runId === 'test-run-id'));
});

test('orchestrator: rounds clamped to 1-4', async () => {
  const mockInvoke = async () => ({ status: 'success', response: 'ok' });

  const orch = createRoundOrchestrator({
    topic: 'test', providers: ['a'], rounds: 10, invokeFn: mockInvoke
  });
  const result = await orch.execute();
  assert.equal(result.rounds.length, 4, 'should clamp to max 4');
});

test('orchestrator: returns totalDurationMs', async () => {
  const mockInvoke = async () => ({ status: 'success', response: 'ok' });
  const orch = createRoundOrchestrator({
    topic: 'test', providers: ['a'], rounds: 1, invokeFn: mockInvoke
  });
  const result = await orch.execute();
  assert.ok(typeof result.totalDurationMs === 'number');
  assert.ok(result.totalDurationMs >= 0);
});

// ---- claim-extractor ----

test('parseClaimExtractionResponse: valid JSON array', () => {
  const json = JSON.stringify([
    { text: 'Нужно использовать микросервисы', type: 'opinion' },
    { text: 'Текущая нагрузка 1000 rps', type: 'fact' },
    { text: 'Возможна потеря данных', type: 'risk' }
  ]);
  const result = parseClaimExtractionResponse(json, 'A');
  assert.equal(result.length, 3);
  assert.equal(result[0].id, 'A1');
  assert.equal(result[0].type, 'opinion');
  assert.equal(result[1].id, 'A2');
  assert.equal(result[1].type, 'fact');
  assert.equal(result[2].id, 'A3');
  assert.equal(result[2].type, 'risk');
});

test('parseClaimExtractionResponse: invalid type defaults to opinion', () => {
  const json = JSON.stringify([
    { text: 'some claim', type: 'unknown_type' }
  ]);
  const result = parseClaimExtractionResponse(json, 'B');
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'opinion');
  assert.equal(result[0].id, 'B1');
});

test('parseClaimExtractionResponse: max 7 claims', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ text: `claim ${i}`, type: 'fact' }));
  const result = parseClaimExtractionResponse(JSON.stringify(items), 'C');
  assert.equal(result.length, 7);
  assert.equal(result[6].id, 'C7');
});

test('parseClaimExtractionResponse: invalid JSON returns empty array', () => {
  assert.deepEqual(parseClaimExtractionResponse('not json at all', 'A'), []);
  assert.deepEqual(parseClaimExtractionResponse('', 'A'), []);
  assert.deepEqual(parseClaimExtractionResponse(null, 'A'), []);
  assert.deepEqual(parseClaimExtractionResponse(undefined, 'A'), []);
});

test('parseClaimExtractionResponse: JSON in markdown code block', () => {
  const input = '```json\n[{"text": "extracted claim", "type": "requirement"}]\n```';
  const result = parseClaimExtractionResponse(input, 'D');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'D1');
  assert.equal(result[0].type, 'requirement');
  assert.equal(result[0].text, 'extracted claim');
});

test('extractClaimsFromResponses: mock invokeFn', async () => {
  const mockInvoke = async (provider, prompt) => ({
    status: 'success',
    response: JSON.stringify([
      { text: 'claim from extraction', type: 'fact' }
    ])
  });

  const result = await extractClaimsFromResponses({
    responses: [
      { provider: 'claude', alias: 'Participant A', response: 'some R1 text' },
      { provider: 'gemini', alias: 'Participant B', response: 'other R1 text' }
    ],
    invokeFn: mockInvoke,
    extractionProvider: 'claude'
  });

  assert.ok(result instanceof Map);
  assert.equal(result.size, 2);
  assert.ok(result.has('Participant A'));
  assert.ok(result.has('Participant B'));
  assert.equal(result.get('Participant A')[0].id, 'A1');
  assert.equal(result.get('Participant B')[0].id, 'B1');
});

// ---- formatClaimsBlock ----

test('formatClaimsBlock: formats claims correctly', () => {
  const block = formatClaimsBlock([
    { alias: 'Participant A', claims: [
      { id: 'A1', text: 'first claim', type: 'fact' },
      { id: 'A2', text: 'second claim', type: 'risk' }
    ]},
    { alias: 'Participant C', claims: [
      { id: 'C1', text: 'third claim', type: 'opinion' }
    ]}
  ]);
  assert.ok(block.includes('--- Participant A ---'));
  assert.ok(block.includes('[A1] (fact) first claim'));
  assert.ok(block.includes('[A2] (risk) second claim'));
  assert.ok(block.includes('--- Participant C ---'));
  assert.ok(block.includes('[C1] (opinion) third claim'));
});

test('buildFollowUpPrompt: with claimsBlock uses claims label', () => {
  const claimsBlock = '--- Participant A ---\n  [A1] (fact) some claim';
  const prompt = buildFollowUpPrompt({
    topic: 'test',
    ownAlias: 'Participant B',
    ownPreviousResponse: 'my response',
    othersResponses: [{ alias: 'Participant A', response: 'full text' }],
    roundNumber: 2,
    totalRounds: 3,
    claimsBlock
  });
  assert.ok(prompt.includes('claims'), 'should contain claims label');
  assert.ok(prompt.includes('[A1] (fact) some claim'), 'should contain claims block');
  assert.ok(!prompt.includes('full text'), 'should NOT contain full text of others');
  assert.ok(prompt.includes('my response'), 'should still include own response');
  assert.ok(prompt.includes('A1, B2'), 'should include claim ID reference rule');
});

// ---- orchestrator with claim extraction ----

test('orchestrator: enableClaimExtraction=true, 2 rounds', async () => {
  const invokeCalls = [];
  const mockInvoke = async (provider, prompt) => {
    invokeCalls.push({ provider, prompt });
    // Extraction calls contain "извлеки" in prompt
    if (prompt.includes('извлеки')) {
      return {
        status: 'success',
        response: JSON.stringify([
          { text: 'extracted claim', type: 'opinion' }
        ])
      };
    }
    // R1 responses
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    // R2 responses
    return { status: 'success', response: JSON.stringify({ current_position: 'pos', evaluations: [], agreements: [], disagreements: [], confidence: 0.8 }) };
  };

  const orch = createRoundOrchestrator({
    topic: 'test',
    providers: ['alpha', 'beta'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    claimProvider: 'alpha'
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 2);

  // R1: no claims
  assert.equal(result.rounds[0].claims, null);

  // R2: should have claims from extraction
  assert.ok(result.rounds[1].claims !== null, 'R2 should have extracted claims');

  // R2 prompts should contain claims-based content
  const r2Prompts = invokeCalls.filter(c => c.prompt.includes('раунд'));
  for (const p of r2Prompts) {
    assert.ok(p.prompt.includes('claims'), 'R2 prompt should use claims label');
  }
});

test('orchestrator: claim extraction fallback on failure', async () => {
  let extractionCalled = false;
  const mockInvoke = async (provider, prompt) => {
    if (prompt.includes('извлеки')) {
      extractionCalled = true;
      return { status: 'error', error: 'extraction failed' };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return { status: 'success', response: JSON.stringify({ current_position: 'pos', evaluations: [], agreements: [], disagreements: [], confidence: 0.7 }) };
  };

  const orch = createRoundOrchestrator({
    topic: 'test',
    providers: ['a', 'b'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true
  });

  const result = await orch.execute();
  assert.ok(extractionCalled, 'extraction should have been attempted');
  assert.equal(result.rounds.length, 2);
  // R2 claims should be null (fallback)
  assert.equal(result.rounds[1].claims, null);

  // R2 should still work with full text fallback
  assert.equal(result.rounds[1].responses.length, 2);
  for (const r of result.rounds[1].responses) {
    assert.equal(r.status, 'success');
  }
});

test('orchestrator: enableClaimExtraction=false (default), no extraction calls', async () => {
  const invokeCalls = [];
  const mockInvoke = async (provider, prompt) => {
    invokeCalls.push({ provider, prompt });
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return { status: 'success', response: JSON.stringify({ current_position: 'pos', evaluations: [], agreements: [], disagreements: [], confidence: 0.8 }) };
  };

  const orch = createRoundOrchestrator({
    topic: 'test',
    providers: ['a', 'b'],
    rounds: 2,
    invokeFn: mockInvoke
    // enableClaimExtraction defaults to false
  });

  const result = await orch.execute();
  // Should be exactly 4 calls: 2 R1 + 2 R2 (no extraction)
  assert.equal(invokeCalls.length, 4, 'should not have extraction calls');
  // No extraction prompts
  const extractionCalls = invokeCalls.filter(c => c.prompt.includes('извлеки'));
  assert.equal(extractionCalls.length, 0, 'no extraction should happen');
});

// ==== CBDP Phase 2: parseStructuredResponseV2 ====

test('parseStructuredResponseV2: valid JSON → correct parsing', () => {
  const json = JSON.stringify({
    stance: 'disagree',
    confidence: 0.85,
    accepts: ['A1', 'C2'],
    challenges: [{ target: 'A3', type: 'contradict', argument: 'not valid' }],
    new_claims: [{ text: 'new idea', type: 'opinion' }],
    trust_scores: { A: 0.9, C: 0.6 }
  });
  const result = parseStructuredResponseV2(json, 'B', 2);
  assert.equal(result.stance, 'disagree');
  assert.equal(result.confidence, 0.85);
  assert.deepEqual(result.accepts, ['A1', 'C2']);
  assert.equal(result.challenges.length, 1);
  assert.equal(result.challenges[0].target, 'A3');
  assert.equal(result.challenges[0].type, 'contradict');
  assert.equal(result.new_claims.length, 1);
  assert.equal(result.new_claims[0].id, 'B2-1');
  assert.equal(result.new_claims[0].text, 'new idea');
  assert.equal(result.new_claims[0].type, 'opinion');
  assert.equal(result.trust_scores.A, 0.9);
  assert.equal(result.trust_scores.C, 0.6);
});

test('parseStructuredResponseV2: invalid stance → default partial_agree', () => {
  const json = JSON.stringify({ stance: 'maybe', confidence: 0.7, accepts: [], challenges: [], new_claims: [], trust_scores: {} });
  const result = parseStructuredResponseV2(json, 'A', 2);
  assert.equal(result.stance, 'partial_agree');
});

test('parseStructuredResponseV2: invalid challenge type → default weaken', () => {
  const json = JSON.stringify({
    stance: 'disagree',
    confidence: 0.7,
    accepts: [],
    challenges: [{ target: 'A1', type: 'invalid_type', argument: 'test' }],
    new_claims: [],
    trust_scores: {}
  });
  const result = parseStructuredResponseV2(json, 'B', 2);
  assert.equal(result.challenges[0].type, 'weaken');
});

test('parseStructuredResponseV2: new_claims get correct IDs (prefix + round)', () => {
  const json = JSON.stringify({
    stance: 'new_proposal',
    confidence: 0.9,
    accepts: [],
    challenges: [],
    new_claims: [
      { text: 'first', type: 'fact' },
      { text: 'second', type: 'risk' },
      { text: 'third', type: 'requirement' }
    ],
    trust_scores: {}
  });
  const result = parseStructuredResponseV2(json, 'C', 3);
  assert.equal(result.new_claims[0].id, 'C3-1');
  assert.equal(result.new_claims[1].id, 'C3-2');
  assert.equal(result.new_claims[2].id, 'C3-3');
  assert.equal(result.new_claims[0].type, 'fact');
  assert.equal(result.new_claims[1].type, 'risk');
  assert.equal(result.new_claims[2].type, 'requirement');
});

test('parseStructuredResponseV2: invalid JSON → graceful fallback', () => {
  const result = parseStructuredResponseV2('not json at all', 'A', 2);
  assert.equal(result.stance, 'partial_agree');
  assert.equal(result.confidence, 0.5);
  assert.deepEqual(result.accepts, []);
  assert.deepEqual(result.challenges, []);
  assert.deepEqual(result.new_claims, []);
  assert.deepEqual(result.trust_scores, {});
});

test('parseStructuredResponseV2: JSON in markdown code block', () => {
  const input = '```json\n{"stance": "agree", "confidence": 0.95, "accepts": ["A1"], "challenges": [], "new_claims": [], "trust_scores": {"A": 0.8}}\n```';
  const result = parseStructuredResponseV2(input, 'B', 2);
  assert.equal(result.stance, 'agree');
  assert.equal(result.confidence, 0.95);
  assert.deepEqual(result.accepts, ['A1']);
  assert.equal(result.trust_scores.A, 0.8);
});

test('parseStructuredResponseV2: null/undefined → defaults', () => {
  const r1 = parseStructuredResponseV2(null, 'A', 2);
  assert.equal(r1.stance, 'partial_agree');
  assert.equal(r1.confidence, 0.5);
  const r2 = parseStructuredResponseV2(undefined, 'A', 2);
  assert.equal(r2.stance, 'partial_agree');
});

test('parseStructuredResponseV2: confidence clamped to 0-1', () => {
  const json = JSON.stringify({ stance: 'agree', confidence: 1.5, accepts: [], challenges: [], new_claims: [], trust_scores: {} });
  const result = parseStructuredResponseV2(json, 'A', 2);
  assert.equal(result.confidence, 1.0);
  const json2 = JSON.stringify({ stance: 'agree', confidence: -0.5, accepts: [], challenges: [], new_claims: [], trust_scores: {} });
  const result2 = parseStructuredResponseV2(json2, 'A', 2);
  assert.equal(result2.confidence, 0);
});

test('parseStructuredResponseV2: invalid new_claims type → default opinion', () => {
  const json = JSON.stringify({
    stance: 'agree',
    confidence: 0.8,
    accepts: [],
    challenges: [],
    new_claims: [{ text: 'claim', type: 'bogus' }],
    trust_scores: {}
  });
  const result = parseStructuredResponseV2(json, 'A', 2);
  assert.equal(result.new_claims[0].type, 'opinion');
});

// ==== buildStructuredFollowUpPrompt ====

test('buildStructuredFollowUpPrompt: includes topic and ownAlias', () => {
  const prompt = buildStructuredFollowUpPrompt({
    topic: 'test topic',
    ownAlias: 'Participant B',
    ownPreviousResponse: 'my prev response',
    othersResponses: [{ alias: 'Participant A', response: 'resp A' }],
    roundNumber: 2,
    totalRounds: 3,
    claimsBlock: null,
    allClaims: null
  });
  assert.ok(prompt.includes('test topic'));
  assert.ok(prompt.includes('Participant B'));
  assert.ok(prompt.includes('my prev response'));
  assert.ok(prompt.includes('раунд 2 из 3'));
});

test('buildStructuredFollowUpPrompt: includes stance/accepts/challenges format', () => {
  const prompt = buildStructuredFollowUpPrompt({
    topic: 'test',
    ownAlias: 'Participant B',
    ownPreviousResponse: 'prev',
    othersResponses: [{ alias: 'Participant A', response: 'resp A' }],
    roundNumber: 2,
    totalRounds: 3,
    claimsBlock: null,
    allClaims: null
  });
  assert.ok(prompt.includes('"stance"'));
  assert.ok(prompt.includes('"accepts"'));
  assert.ok(prompt.includes('"challenges"'));
  assert.ok(prompt.includes('"new_claims"'));
  assert.ok(prompt.includes('"trust_scores"'));
  assert.ok(prompt.includes('weaken|contradict'));
});

test('buildStructuredFollowUpPrompt: uses allClaims when provided', () => {
  const allClaims = '--- Participant A ---\n  [A1] (fact) some claim\n  [A2-1] (opinion) new claim from R2';
  const prompt = buildStructuredFollowUpPrompt({
    topic: 'test',
    ownAlias: 'Participant B',
    ownPreviousResponse: 'prev',
    othersResponses: [{ alias: 'Participant A', response: 'resp A' }],
    roundNumber: 3,
    totalRounds: 3,
    claimsBlock: null,
    allClaims
  });
  assert.ok(prompt.includes('[A1] (fact) some claim'));
  assert.ok(prompt.includes('[A2-1] (opinion) new claim from R2'));
  assert.ok(prompt.includes('Все claims'));
});

test('buildStructuredFollowUpPrompt: does not include real provider names', () => {
  const prompt = buildStructuredFollowUpPrompt({
    topic: 'test',
    ownAlias: 'Participant B',
    ownPreviousResponse: 'prev',
    othersResponses: [
      { alias: 'Participant A', response: 'resp A' },
      { alias: 'Participant C', response: 'resp C' }
    ],
    roundNumber: 2,
    totalRounds: 3,
    claimsBlock: null,
    allClaims: null
  });
  assert.ok(!prompt.includes('claude'));
  assert.ok(!prompt.includes('gemini'));
  assert.ok(!prompt.includes('codex'));
});

// ==== Orchestrator with enableStructuredResponse=true ====

test('orchestrator: enableStructuredResponse=true, 2 rounds — R2 uses structured prompt', async () => {
  const invokeCalls = [];
  const mockInvoke = async (provider, prompt) => {
    invokeCalls.push({ provider, prompt });
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'claim', type: 'fact' }]) };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return {
      status: 'success',
      response: JSON.stringify({
        stance: 'partial_agree',
        confidence: 0.7,
        accepts: ['A1'],
        challenges: [{ target: 'B1', type: 'weaken', argument: 'weak point' }],
        new_claims: [{ text: 'new insight', type: 'opinion' }],
        trust_scores: { A: 0.8, B: 0.6 }
      })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test structured',
    providers: ['alpha', 'beta'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    claimProvider: 'alpha'
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 2);
  assert.equal(result.structured, true);

  // R2 prompts should contain structured format markers
  const r2Prompts = invokeCalls.filter(c => c.prompt.includes('раунд'));
  for (const p of r2Prompts) {
    assert.ok(p.prompt.includes('"stance"'), 'R2 prompt should contain stance format');
    assert.ok(p.prompt.includes('"trust_scores"'), 'R2 prompt should contain trust_scores format');
  }
});

test('orchestrator: enableStructuredResponse=true, 3 rounds — new_claims accumulate', async () => {
  let roundCounter = 0;
  const mockInvoke = async (provider, prompt) => {
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'R1 claim', type: 'fact' }]) };
    }
    if (!prompt.includes('раунд')) {
      roundCounter++;
      return { status: 'success', response: `R1 from ${provider}` };
    }
    // R2 and R3 responses with new_claims
    return {
      status: 'success',
      response: JSON.stringify({
        stance: 'partial_agree',
        confidence: 0.75,
        accepts: [],
        challenges: [],
        new_claims: [{ text: `new from ${provider}`, type: 'opinion' }],
        trust_scores: { A: 0.7, B: 0.8 }
      })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test accumulation',
    providers: ['x', 'y'],
    rounds: 3,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    claimProvider: 'x'
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 3);
  assert.ok(result.allClaims, 'should have allClaims');

  // allClaims should contain R1 claims + accumulated new_claims
  const allClaimsValues = Object.values(result.allClaims);
  assert.ok(allClaimsValues.length > 0, 'should have claims for at least one participant');

  // R3 prompt should contain accumulated claims from R2
  // (allClaims block is only in R3+ structured prompts)
  assert.ok(result.rounds[2].responses.every(r => r.status === 'success'));
});

test('orchestrator: enableStructuredResponse=true — trust_scores aggregated', async () => {
  const mockInvoke = async (provider, prompt) => {
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'claim', type: 'fact' }]) };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    // Different trust scores per round
    const scores = provider === 'x' ? { B: 0.8 } : { A: 0.6 };
    return {
      status: 'success',
      response: JSON.stringify({
        stance: 'agree',
        confidence: 0.9,
        accepts: [],
        challenges: [],
        new_claims: [],
        trust_scores: scores
      })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test trust',
    providers: ['x', 'y'],
    rounds: 3,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    claimProvider: 'x'
  });

  const result = await orch.execute();
  assert.ok(result.aggregatedTrustScores, 'should have aggregatedTrustScores');
  // Each provider should have trust entries
  const aliases = [...result.aliasMap.values()];
  assert.ok(typeof result.aggregatedTrustScores === 'object');
});

test('orchestrator: enableStructuredResponse=true — fallback on invalid JSON', async () => {
  const mockInvoke = async (provider, prompt) => {
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'claim', type: 'fact' }]) };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    // Return invalid JSON for R2
    return { status: 'success', response: 'This is not JSON at all' };
  };

  const orch = createRoundOrchestrator({
    topic: 'test fallback',
    providers: ['a', 'b'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    claimProvider: 'a'
  });

  // Should not throw
  const result = await orch.execute();
  assert.equal(result.rounds.length, 2);
  assert.equal(result.structured, true);
  // All responses should still be success (invalid JSON is handled gracefully)
  for (const r of result.rounds[1].responses) {
    assert.equal(r.status, 'success');
  }
});

test('orchestrator: enableStructuredResponse=false → old behavior (no regression)', async () => {
  const invokeCalls = [];
  const mockInvoke = async (provider, prompt) => {
    invokeCalls.push({ provider, prompt });
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return { status: 'success', response: JSON.stringify({ current_position: 'pos', evaluations: [], agreements: [], disagreements: [], confidence: 0.8 }) };
  };

  const orch = createRoundOrchestrator({
    topic: 'test old behavior',
    providers: ['a', 'b'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableStructuredResponse: false
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 2);
  assert.equal(result.structured, undefined, 'should not have structured flag');
  assert.equal(result.aggregatedTrustScores, undefined, 'should not have trust scores');
  assert.equal(result.allClaims, undefined, 'should not have allClaims');

  // R2 prompts should use old format (current_position)
  const r2Prompts = invokeCalls.filter(c => c.prompt.includes('раунд'));
  for (const p of r2Prompts) {
    assert.ok(p.prompt.includes('current_position'), 'R2 prompt should use old format');
    assert.ok(!p.prompt.includes('"stance"'), 'R2 prompt should NOT contain structured format');
  }
});

test('orchestrator: enableStructuredResponse=true + enableClaimExtraction=true — both work together', async () => {
  const invokeCalls = [];
  const mockInvoke = async (provider, prompt) => {
    invokeCalls.push({ provider, prompt });
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'extracted claim', type: 'fact' }]) };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return {
      status: 'success',
      response: JSON.stringify({
        stance: 'disagree',
        confidence: 0.65,
        accepts: ['A1'],
        challenges: [{ target: 'B1', type: 'contradict', argument: 'wrong' }],
        new_claims: [{ text: 'better approach', type: 'opinion' }],
        trust_scores: { A: 0.7 }
      })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test both',
    providers: ['p1', 'p2'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    claimProvider: 'p1'
  });

  const result = await orch.execute();
  assert.equal(result.rounds.length, 2);
  assert.equal(result.structured, true);

  // R2 should have claims from extraction (Phase 1)
  assert.ok(result.rounds[1].claims !== null, 'R2 should have extracted claims');

  // Result should have Phase 2 data
  assert.ok(result.aggregatedTrustScores, 'should have aggregated trust scores');
  assert.ok(result.allClaims, 'should have allClaims');

  // R2 prompts should contain structured format
  const r2Prompts = invokeCalls.filter(c => c.prompt.includes('раунд'));
  for (const p of r2Prompts) {
    assert.ok(p.prompt.includes('"stance"'), 'should use structured prompt');
  }

  // Extraction should have been called
  const extractionCalls = invokeCalls.filter(c => c.prompt.includes('извлеки'));
  assert.ok(extractionCalls.length > 0, 'extraction should have been called');
});

// ==== CBDP Phase 3: buildClaimGraph ====

test('buildClaimGraph: consensus — accepted by 2+, no challenges', () => {
  const allClaims = {
    'Participant A': [{ id: 'A1', text: 'use microservices', type: 'opinion' }],
    'Participant B': [{ id: 'B1', text: 'use monolith', type: 'opinion' }]
  };
  const rounds = [
    { round: 1, responses: [] },
    { round: 2, responses: [
      { alias: 'Participant A', status: 'success', response: JSON.stringify({ stance: 'agree', confidence: 0.8, accepts: ['B1'], challenges: [], new_claims: [], trust_scores: {} }) },
      { alias: 'Participant B', status: 'success', response: JSON.stringify({ stance: 'agree', confidence: 0.9, accepts: ['A1'], challenges: [], new_claims: [], trust_scores: {} }) }
    ]}
  ];
  const graph = buildClaimGraph({ allClaims, rounds });
  // A1 accepted by B, B1 accepted by A → each has 1 accept (not 2+, but no challenges → consensus with 1)
  assert.equal(graph.contested.length, 0);
  assert.equal(graph.stats.contested_count, 0);
  assert.equal(graph.stats.contention_ratio, 0);
});

test('buildClaimGraph: contested — at least 1 challenge', () => {
  const allClaims = {
    'Participant A': [{ id: 'A1', text: 'use microservices', type: 'opinion' }],
    'Participant B': [{ id: 'B1', text: 'use monolith', type: 'opinion' }]
  };
  const rounds = [
    { round: 1, responses: [] },
    { round: 2, responses: [
      { alias: 'Participant A', status: 'success', response: JSON.stringify({ stance: 'disagree', confidence: 0.7, accepts: [], challenges: [{ target: 'B1', type: 'contradict', argument: 'monolith too rigid' }], new_claims: [], trust_scores: {} }) },
      { alias: 'Participant B', status: 'success', response: JSON.stringify({ stance: 'disagree', confidence: 0.6, accepts: [], challenges: [{ target: 'A1', type: 'weaken', argument: 'too complex' }], new_claims: [], trust_scores: {} }) }
    ]}
  ];
  const graph = buildClaimGraph({ allClaims, rounds });
  assert.equal(graph.contested.length, 2, 'both claims should be contested');
  assert.equal(graph.consensus.length, 0);
  assert.equal(graph.stats.contested_count, 2);
  assert.ok(graph.stats.contention_ratio > 0);
});

test('buildClaimGraph: unique — not referenced by anyone', () => {
  const allClaims = {
    'Participant A': [
      { id: 'A1', text: 'first claim', type: 'fact' },
      { id: 'A2', text: 'second claim', type: 'opinion' }
    ],
    'Participant B': [{ id: 'B1', text: 'B claim', type: 'risk' }]
  };
  const rounds = [
    { round: 1, responses: [] },
    { round: 2, responses: [
      { alias: 'Participant A', status: 'success', response: JSON.stringify({ stance: 'agree', confidence: 0.8, accepts: ['B1'], challenges: [], new_claims: [], trust_scores: {} }) },
      { alias: 'Participant B', status: 'success', response: JSON.stringify({ stance: 'agree', confidence: 0.8, accepts: ['A1'], challenges: [], new_claims: [], trust_scores: {} }) }
    ]}
  ];
  const graph = buildClaimGraph({ allClaims, rounds });
  // A2 not referenced → unique
  assert.equal(graph.unique.length, 1);
  assert.equal(graph.unique[0].id, 'A2');
  assert.equal(graph.unique[0].from, 'Participant A');
});

test('buildClaimGraph: empty claims → empty graph', () => {
  const graph = buildClaimGraph({ allClaims: {}, rounds: [] });
  assert.equal(graph.stats.total, 0);
  assert.equal(graph.consensus.length, 0);
  assert.equal(graph.contested.length, 0);
  assert.equal(graph.unique.length, 0);
  assert.equal(graph.stats.contention_ratio, 0);
});

test('buildClaimGraph: contention_ratio calculation', () => {
  const allClaims = {
    'Participant A': [
      { id: 'A1', text: 'claim 1', type: 'fact' },
      { id: 'A2', text: 'claim 2', type: 'fact' }
    ]
  };
  const rounds = [
    { round: 1, responses: [] },
    { round: 2, responses: [
      { alias: 'Participant B', status: 'success', response: JSON.stringify({ stance: 'partial_agree', confidence: 0.7, accepts: ['A1'], challenges: [{ target: 'A2', type: 'weaken', argument: 'weak' }], new_claims: [], trust_scores: {} }) }
    ]}
  ];
  const graph = buildClaimGraph({ allClaims, rounds });
  // 1 contested out of 2 total = 0.5
  assert.equal(graph.stats.contention_ratio, 0.5);
});

test('buildClaimGraph: Map input for allClaims', () => {
  const allClaims = new Map([
    ['Participant A', [{ id: 'A1', text: 'test', type: 'fact' }]]
  ]);
  const graph = buildClaimGraph({ allClaims, rounds: [] });
  assert.equal(graph.stats.total, 1);
  assert.equal(graph.unique.length, 1);
});

// ==== formatClaimGraph ====

test('formatClaimGraph: includes all sections', () => {
  const graph = {
    consensus: [{ id: 'A1', text: 'agreed', type: 'fact', supportedBy: ['Participant B'] }],
    contested: [{ id: 'B1', text: 'disputed', type: 'opinion', positions: [
      { alias: 'Participant A', stance: 'challenge', argument: 'wrong' }
    ]}],
    unique: [{ id: 'C1', text: 'solo', type: 'risk', from: 'Participant C' }],
    stats: { total: 3, consensus_count: 1, contested_count: 1, unique_count: 1, contention_ratio: 0.33 }
  };
  const formatted = formatClaimGraph(graph);
  assert.ok(formatted.includes('Консенсус'));
  assert.ok(formatted.includes('Спорные'));
  assert.ok(formatted.includes('Уникальные'));
  assert.ok(formatted.includes('Статистика'));
  assert.ok(formatted.includes('[A1]'));
  assert.ok(formatted.includes('[B1]'));
  assert.ok(formatted.includes('[C1]'));
  assert.ok(formatted.includes('ОСПАРИВАЕТ'));
});

test('formatClaimGraph: empty graph → only stats, no detail sections', () => {
  const graph = { consensus: [], contested: [], unique: [], stats: { total: 0, consensus_count: 0, contested_count: 0, unique_count: 0, contention_ratio: 0 } };
  const formatted = formatClaimGraph(graph);
  assert.ok(formatted.includes('Статистика'));
  assert.ok(formatted.includes('Всего claims: 0'));
  // No detail sections (claims lists) should appear
  assert.ok(!formatted.includes('Консенсус (принятые claims)'), 'should not have consensus detail section');
  assert.ok(!formatted.includes('Спорные claims'), 'should not have contested detail section');
  assert.ok(!formatted.includes('Уникальные (без реакции)'), 'should not have unique detail section');
});

// ==== buildSmartSynthesisPrompt ====

test('buildSmartSynthesisPrompt: includes claim graph and trust matrix', () => {
  const prompt = buildSmartSynthesisPrompt({
    topic: 'test topic',
    rounds: [],
    aliasMap: new Map([['claude', 'Participant A'], ['gemini', 'Participant B']]),
    claimGraphFormatted: '=== Статистика ===\nВсего claims: 5',
    aggregatedTrustScores: { 'Participant A': { B: 0.8 }, 'Participant B': { A: 0.7 } },
    autoStopped: null
  });
  assert.ok(prompt.includes('test topic'));
  assert.ok(prompt.includes('Participant A = claude'));
  assert.ok(prompt.includes('Всего claims: 5'));
  assert.ok(prompt.includes('Матрица доверия'));
  assert.ok(prompt.includes('consensus_points'));
  assert.ok(prompt.includes('disputed_points'));
  assert.ok(prompt.includes('trust_weighted_summary'));
});

test('buildSmartSynthesisPrompt: includes auto-stop info', () => {
  const prompt = buildSmartSynthesisPrompt({
    topic: 'test',
    rounds: [],
    aliasMap: new Map([['claude', 'Participant A']]),
    claimGraphFormatted: null,
    aggregatedTrustScores: {},
    autoStopped: { stoppedAfterRound: 2, reason: 'No contested claims remaining' }
  });
  assert.ok(prompt.includes('завершена досрочно'));
  assert.ok(prompt.includes('раунда 2'));
  assert.ok(prompt.includes('No contested claims'));
});

test('buildSmartSynthesisPrompt: no auto-stop → no auto-stop text', () => {
  const prompt = buildSmartSynthesisPrompt({
    topic: 'test',
    rounds: [],
    aliasMap: new Map([['claude', 'Participant A']]),
    claimGraphFormatted: null,
    aggregatedTrustScores: {},
    autoStopped: null
  });
  assert.ok(!prompt.includes('завершена досрочно'));
});

// ==== Orchestrator with enableSmartSynthesis=true ====

test('orchestrator: enableSmartSynthesis=true — synthesis called after rounds', async () => {
  const invokeCalls = [];
  const mockInvoke = async (provider, prompt) => {
    invokeCalls.push({ provider, prompt });
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'claim', type: 'fact' }]) };
    }
    if (prompt.includes('Smart Synthesis') || prompt.includes('синтезатор')) {
      return {
        status: 'success',
        response: JSON.stringify({
          consensus_points: ['all agree on X'],
          disputed_points: [{ claim_id: 'A1', summary: 'disputed' }],
          recommendation: 'do X',
          confidence: 0.85,
          trust_weighted_summary: 'A is most trusted'
        })
      };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return {
      status: 'success',
      response: JSON.stringify({
        stance: 'partial_agree',
        confidence: 0.7,
        accepts: ['A1'],
        challenges: [{ target: 'B1', type: 'weaken', argument: 'weak' }],
        new_claims: [],
        trust_scores: { A: 0.8 }
      })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test synthesis',
    providers: ['alpha', 'beta'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    enableSmartSynthesis: true,
    claimProvider: 'alpha',
    synthesisProvider: 'alpha'
  });

  const result = await orch.execute();
  assert.ok(result.synthesis, 'should have synthesis');
  assert.equal(result.synthesis.status, 'success');
  assert.ok(result.synthesis.parsed, 'should have parsed synthesis');
  assert.deepEqual(result.synthesis.parsed.consensus_points, ['all agree on X']);
  assert.equal(result.synthesis.parsed.recommendation, 'do X');
  assert.equal(result.synthesis.parsed.confidence, 0.85);
});

test('orchestrator: enableSmartSynthesis=true — claimGraph in result', async () => {
  const mockInvoke = async (provider, prompt) => {
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'claim', type: 'fact' }]) };
    }
    if (prompt.includes('синтезатор') || prompt.includes('Smart Synthesis')) {
      return { status: 'success', response: '{"consensus_points":[],"disputed_points":[],"recommendation":"ok","confidence":0.5,"trust_weighted_summary":""}' };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return {
      status: 'success',
      response: JSON.stringify({ stance: 'agree', confidence: 0.9, accepts: [], challenges: [], new_claims: [], trust_scores: {} })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test graph',
    providers: ['a', 'b'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    enableSmartSynthesis: true,
    claimProvider: 'a'
  });

  const result = await orch.execute();
  assert.ok(result.claimGraph, 'should have claimGraph');
  assert.ok(result.claimGraph.stats, 'should have stats');
  assert.ok(typeof result.claimGraph.stats.total === 'number');
});

test('orchestrator: auto-stop when 0 contested claims after R2', async () => {
  const mockInvoke = async (provider, prompt) => {
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'claim', type: 'fact' }]) };
    }
    if (prompt.includes('синтезатор') || prompt.includes('Smart Synthesis')) {
      return { status: 'success', response: '{"consensus_points":["all agree"],"disputed_points":[],"recommendation":"consensus","confidence":0.95,"trust_weighted_summary":""}' };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    // All accept each other's claims, no challenges → 0 contested
    return {
      status: 'success',
      response: JSON.stringify({
        stance: 'agree',
        confidence: 0.95,
        accepts: ['A1', 'B1'],
        challenges: [],
        new_claims: [],
        trust_scores: { A: 0.9, B: 0.9 }
      })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test auto-stop',
    providers: ['x', 'y'],
    rounds: 3, // Should stop after R2
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    enableSmartSynthesis: true,
    claimProvider: 'x'
  });

  const result = await orch.execute();
  assert.ok(result.autoStop, 'should have auto-stop info');
  assert.equal(result.autoStop.stoppedAfterRound, 2);
  assert.equal(result.rounds.length, 2, 'should only have 2 rounds (R3 skipped)');
});

test('orchestrator: enableSmartSynthesis=true — synthesis fallback on invalid JSON', async () => {
  const mockInvoke = async (provider, prompt) => {
    if (prompt.includes('извлеки')) {
      return { status: 'success', response: JSON.stringify([{ text: 'claim', type: 'fact' }]) };
    }
    if (prompt.includes('синтезатор') || prompt.includes('Smart Synthesis')) {
      return { status: 'success', response: 'This is not JSON synthesis output' };
    }
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return {
      status: 'success',
      response: JSON.stringify({ stance: 'agree', confidence: 0.9, accepts: [], challenges: [], new_claims: [], trust_scores: {} })
    };
  };

  const orch = createRoundOrchestrator({
    topic: 'test synthesis fallback',
    providers: ['a', 'b'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableClaimExtraction: true,
    enableStructuredResponse: true,
    enableSmartSynthesis: true,
    claimProvider: 'a'
  });

  const result = await orch.execute();
  assert.ok(result.synthesis, 'should have synthesis');
  assert.equal(result.synthesis.status, 'success');
  assert.equal(result.synthesis.parsed, null, 'parsed should be null for invalid JSON');
  assert.ok(result.synthesis.response.includes('not JSON'), 'raw response preserved');
});

test('orchestrator: enableSmartSynthesis=false → no synthesis (no regression)', async () => {
  const mockInvoke = async (provider, prompt) => {
    if (!prompt.includes('раунд')) {
      return { status: 'success', response: `R1 from ${provider}` };
    }
    return { status: 'success', response: JSON.stringify({ current_position: 'pos', evaluations: [], agreements: [], disagreements: [], confidence: 0.8 }) };
  };

  const orch = createRoundOrchestrator({
    topic: 'test no synthesis',
    providers: ['a', 'b'],
    rounds: 2,
    invokeFn: mockInvoke,
    enableSmartSynthesis: false
  });

  const result = await orch.execute();
  assert.equal(result.synthesis, undefined, 'should not have synthesis');
  assert.equal(result.claimGraph, undefined, 'should not have claimGraph');
  assert.equal(result.autoStop, undefined, 'should not have autoStop');
});
