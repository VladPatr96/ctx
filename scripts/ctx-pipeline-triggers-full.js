/**
 * ctx-pipeline-triggers-full.js
 * 
 * Полная интеграция всех 10 скиллов в pipeline стадии
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const PIPELINE_FILE = join(DATA_DIR, 'pipeline.json');

/**
 * Полная конфигурация триггеров для всех 10 скиллов
 */
const FULL_STAGE_TRIGGERS = {
  detect: [
    // Приоритет 1: Критичные
    {
      skill: 'security-scanner',
      command: 'security-scan',
      args: { scope: 'quick' },
      description: 'Quick security check',
      critical: true
    },
    {
      skill: 'error-debugger',
      command: 'error-analyze',
      args: { scope: 'quick' },
      description: 'Quick error pattern detection',
      critical: false
    }
  ],
  
  context: [
    // Приоритет 1: Критичные
    {
      skill: 'security-scanner',
      command: 'security-scan',
      args: { scope: 'code' },
      description: 'Full code security scan',
      critical: true
    },
    // Приоритет 2: Продуктивность
    {
      skill: 'api-designer',
      command: 'api-design',
      args: { format: 'openapi' },
      description: 'Analyze API structure',
      critical: false
    },
    {
      skill: 'documentation-generator',
      command: 'docs-readme',
      args: { template: 'standard' },
      description: 'Generate/update README',
      critical: false
    },
    // Приоритет 4: CTX-Specific
    {
      skill: 'provider-health-monitor',
      command: 'provider-health',
      args: { provider: 'all' },
      description: 'Check provider health',
      critical: false
    }
  ],
  
  task: [
    // Приоритет 1: Критичные
    {
      skill: 'error-debugger',
      command: 'error-analyze',
      args: { severity: 'high' },
      description: 'Analyze high severity errors',
      critical: false
    },
    // Приоритет 2: Продуктивность
    {
      skill: 'refactoring-assistant',
      command: 'refactor',
      args: { severity: 'high' },
      description: 'Check for critical code smells',
      critical: false
    }
  ],
  
  brainstorm: [
    // Приоритет 4: CTX-Specific
    {
      skill: 'provider-health-monitor',
      command: 'provider-health',
      args: { provider: 'all' },
      description: 'Check provider health before brainstorming',
      critical: false
    },
    {
      skill: 'provider-health-monitor',
      command: 'provider-optimize',
      args: { goal: 'quality' },
      description: 'Optimize provider selection',
      critical: false
    },
    {
      skill: 'consilium-optimizer',
      command: 'consilium-opt',
      args: { strategy: 'auto-stop' },
      description: 'Prepare consilium optimization',
      critical: false
    }
  ],
  
  plan: [
    // Приоритет 2: Продуктивность
    {
      skill: 'api-designer',
      command: 'api-design',
      args: { format: 'openapi' },
      description: 'Generate API specification',
      critical: false
    },
    {
      skill: 'api-designer',
      command: 'api-validate',
      args: {},
      description: 'Validate API design',
      critical: false
    },
    {
      skill: 'documentation-generator',
      command: 'docs-api',
      args: { format: 'markdown' },
      description: 'Generate API documentation',
      critical: false
    },
    {
      skill: 'refactoring-assistant',
      command: 'refactor-suggest',
      args: { pattern: 'all' },
      description: 'Suggest refactoring patterns',
      critical: false
    }
  ],
  
  execute: [
    // Приоритет 1: Критичные
    {
      skill: 'security-scanner',
      command: 'security-scan',
      args: { scope: 'code' },
      description: 'Security check during execution',
      critical: true
    },
    {
      skill: 'test-coverage-booster',
      command: 'test-coverage',
      args: { target: 80 },
      description: 'Check test coverage',
      critical: false
    },
    {
      skill: 'error-debugger',
      command: 'debug',
      args: { auto: true },
      description: 'Auto-debug if errors occur',
      critical: false
    },
    // Приоритет 3: DevOps
    {
      skill: 'dockerizer',
      command: 'dockerize',
      args: { runtime: 'node' },
      description: 'Generate Docker config',
      critical: false
    },
    {
      skill: 'ci-cd-pipeline',
      command: 'ci-cd',
      args: { platform: 'github' },
      description: 'Generate CI/CD pipeline',
      critical: false
    }
  ],
  
  done: [
    // Приоритет 1: Критичные
    {
      skill: 'test-coverage-booster',
      command: 'coverage-mutate',
      args: { runs: 50 },
      description: 'Run mutation testing',
      critical: false
    },
    // Приоритет 2: Продуктивность
    {
      skill: 'documentation-generator',
      command: 'generate-docs',
      args: { type: 'all' },
      description: 'Generate all documentation',
      critical: false
    },
    {
      skill: 'refactoring-assistant',
      command: 'refactor',
      args: { severity: 'all' },
      description: 'Final code quality check',
      critical: false
    },
    // Приоритет 3: DevOps
    {
      skill: 'dockerizer',
      command: 'docker-optimize',
      args: { strategy: 'size' },
      description: 'Optimize Docker image',
      critical: false
    },
    {
      skill: 'ci-cd-pipeline',
      command: 'cicd-deploy',
      args: { env: 'staging' },
      description: 'Deploy to staging',
      critical: false
    },
    // Приоритет 4: CTX-Specific
    {
      skill: 'provider-health-monitor',
      command: 'provider-metrics',
      args: { period: '24h' },
      description: 'Log provider metrics',
      critical: false
    },
    {
      skill: 'consilium-optimizer',
      command: 'consilium-smart-synthesis',
      args: { mode: 'consensus' },
      description: 'Optimize consilium results',
      critical: false
    }
  ]
};

/**
 * Execute triggers for a stage
 */
export async function executeStageTriggers(stage, pipeline) {
  const triggers = FULL_STAGE_TRIGGERS[stage] || [];
  const results = [];
  
  console.log(`[pipeline-triggers-full] Executing ${triggers.length} triggers for stage: ${stage}`);
  
  for (const trigger of triggers) {
    try {
      console.log(`[pipeline-triggers-full] Running: ${trigger.description} (${trigger.critical ? 'CRITICAL' : 'optional'})`);
      
      const commandPath = join(
        process.cwd(),
        'skills',
        trigger.skill,
        'commands',
        `${trigger.command}.js`
      );
      
      const { default: commandFn } = await import(pathToFileURL(commandPath).href);
      
      const result = await commandFn(trigger.args, {
        storage: null,
        loadPipeline: () => pipeline,
        savePipeline: (p) => {
          writeFileSync(PIPELINE_FILE, JSON.stringify(p, null, 2));
        },
        appendLog: (entry) => {
          console.log('[log]', entry);
        }
      });
      
      results.push({
        trigger: trigger.description,
        skill: trigger.skill,
        command: trigger.command,
        critical: trigger.critical,
        success: true,
        result
      });
      
    } catch (error) {
      console.error(`[pipeline-triggers-full] Error in ${trigger.description}: ${error.message}`);
      
      results.push({
        trigger: trigger.description,
        skill: trigger.skill,
        command: trigger.command,
        critical: trigger.critical,
        success: false,
        error: error.message
      });
      
      // Блокировать если критичный триггер упал
      if (trigger.critical) {
        console.error(`[pipeline-triggers-full] CRITICAL trigger failed! Stopping pipeline.`);
        throw error;
      }
    }
  }
  
  return results;
}

/**
 * Middleware for pipeline stage changes
 */
export async function onPipelineStageChange(newStage, previousStage, pipeline) {
  console.log(`[pipeline-triggers-full] Stage change: ${previousStage} → ${newStage}`);
  
  const results = await executeStageTriggers(newStage, pipeline);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const critical = resul
