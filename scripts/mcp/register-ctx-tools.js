import { registerSessionTools } from '../tools/session.js';
import { registerKnowledgeTools } from '../tools/knowledge.js';
import { registerConsiliumTools } from '../tools/consilium.js';
import { registerPipelineTools } from '../tools/pipeline.js';
import { registerAgentTools } from '../tools/agents.js';
import { registerEvaluationTools } from '../tools/evaluation.js';
import { registerOrchestratorTools } from '../tools/orchestrator.js';
import { registerReactionTools } from '../tools/reactions.js';
import { registerRoutingTools } from '../tools/routing.js';
import { registerSkillTools } from '../skills/skill-loader.js';

export function registerCtxTools(server, {
  getSession,
  saveSession,
  runCommand,
  readJson,
  DATA_DIR,
  GITHUB_OWNER,
  centralRepo,
  knowledgeStore,
  kbSync,
  getResults,
  saveResults,
  cacheStore,
} = {}) {
  registerSessionTools(server, { getSession, saveSession });
  registerKnowledgeTools(server, {
    runCommand,
    readJson,
    DATA_DIR,
    GITHUB_OWNER,
    centralRepo,
    knowledgeStore,
    kbSync,
  });
  registerConsiliumTools(server, { getResults, saveResults, DATA_DIR });
  registerPipelineTools(server);
  registerAgentTools(server);
  registerEvaluationTools(server, { DATA_DIR, cacheStore });
  registerOrchestratorTools(server);
  registerReactionTools(server);
  registerRoutingTools(server, { DATA_DIR });
  registerSkillTools(server);
}
