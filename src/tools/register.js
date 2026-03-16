import { registerSessionTools } from './session.js';
import { registerKnowledgeTools } from './knowledge.js';
import { registerConsiliumTools } from './consilium.js';
import { registerPipelineTools } from './pipeline.js';
import { registerAgentTools } from './agents.js';
import { registerEvaluationTools } from './evaluation.js';
import { registerOrchestratorTools } from './orchestrator.js';
import { registerReactionTools } from './reactions.js';
import { registerRoutingTools } from './routing.js';
import { registerChatTools } from './chat.js';
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
  registerChatTools(server);
  registerSkillTools(server);
}
