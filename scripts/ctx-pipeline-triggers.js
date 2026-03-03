/**
 * ctx-pipeline-triggers.js
 * 
 * Автоматические триггеры для запуска скиллов при смене стадии pipeline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const PIPELINE_FILE = join(DATA_DIR, 'pipeline.json');

/**
 * Pipeline stage triggers configuration
 */
const STAGE_TRIGGERS = {
  detect: [
    {
      skill: 'security-scanner',
      command: 'security-scan',
      args: { scope: 'quick' },
      description: 'Quick security check on project detection'
    }
  ],
  
  context: [
    {
      skill: 'api-designer',
      command: 'api-design',
      args: { format: 'openapi' },
      description: 'Analyze API structure'
    },
    {
      skill: 'documentation-generator',
      command: 'docs-readme',
      args: { template: 'standard' },
      description: 'Generate/update README'
    }
  ],
  
  task: [
    {
      skill: 'refactoring-assistant',
      command: 'refactor',
      args: { severity: 'high' },
      description: 'Check for critical code smells'
    }
  ],
  
  brainstorm: [
    {
      skill: 'provider-health-monitor',
      command: 'provider-health',
      args: { provider: 'all' },
      description: 'Check provider health before brainstorming'
    }
  ],
  
  plan: [
    {
      skill: 'api-designer',
      command: 'api-design',
      args: { format: 'openapi' },
      description: 'Generate API specification for planning'
    },
    {
      skill: 'documentation-generator',
      command: 'docs-api',
      args: { format: 'markdown' },
      description: 'Generate API documentation'
    }
  ],
  
  execute: [
    {
      skill: 'security-scanner',
      command: 'security-scan',
      args: { scope: 'code' },
      description: 'Security check during execution'
    },
    {
      skill: 'test-coverage-booster',
      command: 'test-coverage',
      args: { target: 80 },
      description: 'Check test coverage'
    }
  ],
  
  done: [
    {
      skill: 'documentation-generator',
      command: 'generate-docs',
      args: { type: 'all' },
      description: 'Generate all documentation'
    },
    {
      skill: 'test-coverage-booster',
      command: 'coverage-mutate',
      args: { runs: 50 },
      description: 'Run mutation testing'
    },
    {
      skill: 'provider-health-monitor',
      command: 'provider-metrics',
      args: { period: '24h' },
      description: 'Log provider metrics'
    }
  ]
};

/**
 * Execute triggers for a stage
 */
export async function executeStageTriggers(stage, pipeline) {
  const triggers = STAGE_TRIGGERS[stage] || [];
  const results = [];
  
  console.log(`[pipeline-triggers] Executing ${triggers.length} triggers for stage: ${stage}`);
  
  for (const trigger of triggers) {
    try {
      console.log(`[pipeline-triggers] Running: ${trigger.description}`);
      
      // Import skill command
      const commandPath = join(
        process.cwd(), 
        'skills', 
        trigger.skill, 
        'commands', 
        `${trigger.command}.js`
      );
      
      const { default: commandFn } = await import(commandPath);
      
      // Execute command
      const result = await commandFn(trigger.args, {
        storage: null, // Will be injected
        loadPipeline: () => pipeline,
        savePipeline: (p) => {
          writeFileSync(PIPELINE_FILE, JSON.stringify(p, null, 2));
        },
        appendLog: (entry) => {
          // Log to console for now
          console.log('[log]', entry);
        }
      });
      
      results.push({
        trigger: trigger.description,
        success: true,
        result
      });
      
    } catch (error) {
      console.error(`[pipeline-triggers] Error: ${error.message}`);
      
      results.push({
        trigger: trigger.description,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Middleware for pipeline stage changes
 */
export async function onPipelineStageChange(newStage, previousStage, pipeline) {
  console.log(`[pipeline-triggers] Stage change: ${previousStage} → ${newStage}`);
  
  // Execute triggers for new stage
  const results = await executeStageTriggers(newStage, pipeline);
  
  // Log results
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`[pipeline-triggers] Completed: ${successful} success, ${failed} failed`);
  
  return results;
}

// CLI interface
if (process.argv[1] === import.meta.url) {
  const stage = process.argv[2];
  
  if (!stage) {
    console.log('Usage: node ctx-pipeline-triggers.js <stage>');
    console.log('Stages: detect, context, task, brainstorm, plan, execute, done');
    process.exit(1);
  }
  
  // Load pipeline
  const pipeline = JSON.parse(readFileSync(PIPELINE_FILE, 'utf-8'));
  
  // Execute triggers
  const results = await executeStageTriggers(stage, pipeline);
  
  console.log(JSON.stringify(results, null, 2));
}
