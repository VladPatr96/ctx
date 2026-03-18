import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConsiliumReplayArchive,
  buildConsiliumReplayExport,
  buildConsiliumReplayKnowledgeContext,
  createConsiliumReplayArchive,
} from '../src/contracts/consilium-schemas.js';

test('buildConsiliumReplayArchive normalizes decision history, rounds, and archive references', () => {
  const run = {
    run_id: 'run-replay-1',
    project: 'claude_ctx',
    topic: 'Replay archive rollout',
    mode: 'providers',
    providers_invoked: JSON.stringify(['claude', 'gemini']),
    providers_responded: JSON.stringify(['claude', 'gemini']),
    rounds: 2,
    proposed_by: 'claude',
    consensus_reached: 1,
    decision_summary: 'Use a dedicated replay contract and archive links.',
    github_issue_url: 'https://github.com/VladPatr96/my_claude_code/issues/447',
    started_at: '2026-03-12T08:00:00.000Z',
    ended_at: '2026-03-12T08:00:03.000Z',
    duration_ms: 3000,
  };

  const archive = buildConsiliumReplayArchive({
    decisions: [run],
    allDecisions: [run, {
      ...run,
      run_id: 'run-replay-2',
      project: 'ctx_other',
      proposed_by: 'gemini',
      consensus_reached: 0,
      github_issue_url: null,
    }],
    detail: {
      run,
      providerResponses: [
        {
          provider: 'claude',
          model: 'opus-4.6',
          status: 'completed',
          response_ms: 1200,
          confidence: 0.84,
          key_idea: 'Persist replay in one typed surface',
          was_chosen: 1,
          error_message: null,
        },
        {
          provider: 'gemini',
          model: 'gemini-2.5-pro',
          status: 'completed',
          response_ms: 1500,
          confidence: 0.63,
          key_idea: 'Keep archive refs explicit',
          was_chosen: 0,
          error_message: null,
        },
      ],
      roundSummary: [
        {
          round: 1,
          total: 2,
          completed: 2,
          avg_ms: 1350,
          avg_confidence: 0.73,
          positions_changed: 1,
        },
      ],
      roundResponses: [
        {
          round: 1,
          provider: 'claude',
          alias: 'Participant A',
          status: 'completed',
          response_ms: 1200,
          response_text: 'Round one from Claude',
          confidence: 0.84,
          position_changed: 0,
        },
        {
          round: 1,
          provider: 'gemini',
          alias: 'Participant B',
          status: 'completed',
          response_ms: 1500,
          response_text: 'Round one from Gemini',
          confidence: 0.63,
          position_changed: 1,
        },
      ],
    },
    filters: {
      project: 'claude_ctx',
      provider: 'claude',
      consensus: 'consensus',
    },
    knowledgeContext: buildConsiliumReplayKnowledgeContext({
      project: 'claude_ctx',
      query: 'Replay archive rollout dedicated replay contract typed surface',
      actions: [{
        id: 'run-replay-1:knowledge_search',
        type: 'knowledge_search',
        label: 'Open related knowledge',
        href: '?tab=knowledge&kb_project=claude_ctx&kb_query=Replay%20archive%20rollout',
        project: 'claude_ctx',
        query: 'Replay archive rollout',
      }],
      entries: [{
        id: 12,
        project: 'claude_ctx',
        category: 'decision',
        title: 'Replay archive contract decision',
        body: 'Document the typed replay archive and its rollout constraints for the dashboard.',
        href: '?tab=knowledge&kb_project=claude_ctx&kb_query=Replay%20archive%20contract%20decision&kb_focus=12',
        updatedAt: '2026-03-12T08:04:00.000Z',
        source: 'github-issues',
        githubUrl: 'https://github.com/VladPatr96/my_claude_code/issues/450',
        retrieval: {
          score: 0.91,
          matchReason: 'High text overlap with decision summary',
        },
      }],
      continuity: {
        snapshot: {
          exists: true,
          task: 'Link replay archive with knowledge context',
          branch: 'codex/consilium-knowledge-links',
        },
        recentDecisions: [{
          title: 'Replay archive contract decision',
        }],
        suggestions: [{
          title: 'Review replay archive decision',
        }],
      },
    }),
    generatedAt: '2026-03-12T08:05:00.000Z',
  });

  assert.equal(archive.selectedRunId, 'run-replay-1');
  assert.equal(archive.filters.applied.project, 'claude_ctx');
  assert.equal(archive.filters.applied.provider, 'claude');
  assert.equal(archive.filters.applied.consensus, 'consensus');
  assert.equal(archive.filters.availableProjects.length, 2);
  assert.equal(archive.filters.consensusCounts.open, 1);
  assert.equal(archive.decisions[0].archiveReferences.length, 2);
  assert.equal(archive.decisions[0].archiveReferences[0].type, 'dashboard_replay');
  assert.equal(archive.decisions[0].archiveReferences[1].type, 'github_issue');
  assert.equal(archive.replay.decision.decisionSummary, 'Use a dedicated replay contract and archive links.');
  assert.equal(archive.replay.providers[0].provider, 'claude');
  assert.equal(archive.replay.providers[0].wasChosen, true);
  assert.equal(archive.replay.rounds[0].positionsChanged, 1);
  assert.equal(archive.replay.rounds[0].responses[1].responseText, 'Round one from Gemini');
  assert.equal(archive.replay.knowledgeContext.project, 'claude_ctx');
  assert.equal(archive.replay.knowledgeContext.entries[0].entryId, 12);
  assert.equal(archive.replay.knowledgeContext.continuity.snapshotExists, true);
});

test('createConsiliumReplayArchive accepts normalized payload', () => {
  const archive = createConsiliumReplayArchive({
    generatedAt: '2026-03-12T08:10:00.000Z',
    selectedRunId: null,
    filters: {
      applied: {
        project: null,
        provider: null,
        consensus: 'all',
      },
      availableProjects: [],
      availableProviders: [],
      consensusCounts: {
        all: 0,
        consensus: 0,
        open: 0,
      },
    },
    decisions: [],
    replay: null,
  });

  assert.equal(archive.decisions.length, 0);
  assert.equal(archive.replay, null);
});

test('buildConsiliumReplayExport renders deterministic markdown and json artifacts', () => {
  const replay = buildConsiliumReplayArchive({
    decisions: [{
      run_id: 'run-export-1',
      project: 'claude_ctx',
      topic: 'Export the replay trail',
      mode: 'providers',
      providers_invoked: JSON.stringify(['claude']),
      providers_responded: JSON.stringify(['claude']),
      rounds: 1,
      proposed_by: 'claude',
      consensus_reached: 1,
      decision_summary: 'Export the selected replay as markdown and json.',
      github_issue_url: null,
      started_at: '2026-03-12T08:12:00.000Z',
      ended_at: '2026-03-12T08:12:01.000Z',
      duration_ms: 1000,
    }],
    detail: {
      run: {
        run_id: 'run-export-1',
        project: 'claude_ctx',
        topic: 'Export the replay trail',
        mode: 'providers',
        providers_invoked: JSON.stringify(['claude']),
        providers_responded: JSON.stringify(['claude']),
        rounds: 1,
        proposed_by: 'claude',
        consensus_reached: 1,
        decision_summary: 'Export the selected replay as markdown and json.',
        github_issue_url: null,
        started_at: '2026-03-12T08:12:00.000Z',
        ended_at: '2026-03-12T08:12:01.000Z',
        duration_ms: 1000,
      },
      providerResponses: [{
        provider: 'claude',
        model: 'opus-4.6',
        status: 'completed',
        response_ms: 800,
        confidence: 0.82,
        key_idea: 'Expose deterministic export actions',
        was_chosen: 1,
        error_message: null,
      }],
      roundSummary: [{
        round: 1,
        total: 1,
        completed: 1,
        avg_ms: 800,
        avg_confidence: 0.82,
        positions_changed: 0,
      }],
      roundResponses: [{
        round: 1,
        provider: 'claude',
        alias: 'Participant A',
        status: 'completed',
        response_ms: 800,
        response_text: 'Exportable response trail',
        confidence: 0.82,
        position_changed: 0,
      }],
    },
    knowledgeContext: {
      project: 'claude_ctx',
      query: 'Export the replay trail deterministic export actions',
      actions: [{
        id: 'run-export-1:knowledge_search',
        type: 'knowledge_search',
        label: 'Open related knowledge',
        href: '?tab=knowledge&kb_project=claude_ctx&kb_query=Export%20the%20replay%20trail',
        project: 'claude_ctx',
        query: 'Export the replay trail',
      }],
      entries: [{
        id: 4,
        project: 'claude_ctx',
        category: 'decision',
        title: 'Replay export reference',
        body: 'The replay export artifact should stay deterministic and include knowledge context.',
        href: '?tab=knowledge&kb_project=claude_ctx&kb_query=Replay%20export%20reference&kb_focus=4',
        updatedAt: '2026-03-12T08:12:30.000Z',
        source: 'ctx-session-save',
        githubUrl: null,
        retrieval: {
          score: 0.88,
          matchReason: 'Decision summary matches export artifact',
        },
      }],
      continuity: null,
    },
  }).replay;

  const markdownArtifact = buildConsiliumReplayExport(replay, {
    format: 'markdown',
    generatedAt: '2026-03-12T08:13:00.000Z',
  });
  const jsonArtifact = buildConsiliumReplayExport(replay, {
    format: 'json',
    generatedAt: '2026-03-12T08:13:30.000Z',
  });

  assert.equal(markdownArtifact.filename, 'consilium-decision-trail-run-expo.md');
  assert.match(markdownArtifact.content, /# Consilium Decision Trail/);
  assert.match(markdownArtifact.content, /## Knowledge Context/);
  assert.match(markdownArtifact.content, /Open related knowledge/);
  assert.match(markdownArtifact.content, /## Round Replay/);
  assert.equal(jsonArtifact.filename, 'consilium-decision-trail-run-expo.json');
  assert.match(jsonArtifact.content, /"decisionSummary": "Export the selected replay as markdown and json."/);
  assert.match(jsonArtifact.content, /"knowledgeContext"/);
});
