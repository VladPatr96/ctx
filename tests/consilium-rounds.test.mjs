import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAliasMap,
  parseStructuredResponse,
  createRoundOrchestrator
} from '../scripts/consilium/round-orchestrator.js';
import {
  buildR1Prompt,
  buildFollowUpPrompt,
  buildSynthesisPrompt,
  formatAnonymizedResponses,
  formatClaimsBlock
} from '../scripts/consilium/prompts.js';
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
