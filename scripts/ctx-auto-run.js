#!/usr/bin/env node
/**
 * ctx-auto-run.js
 * 
 * Автоматический запуск скиллов по расписанию или событиям
 */

import { scheduleJob } from 'node-schedule';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const AUTO_CONFIG = join(DATA_DIR, 'auto-run-config.json');

/**
 * Default auto-run configuration
 */
const DEFAULT_CONFIG = {
  enabled: true,
  schedule: {
    // Ежедневно в 9:00 - проверка безопасности
    dailySecurity: {
      enabled: true,
      cron: '0 9 * * *',
      skill: 'security-scanner',
      command: 'security-scan',
      args: { scope: 'dependencies' }
    },
    
    // Еженедельно в понедельник 10:00 - полный анализ
    weeklyFullScan: {
      enabled: true,
      cron: '0 10 * * 1',
      skill: 'security-scanner',
      command: 'security-scan',
      args: { scope: 'all' }
    },
    
    // Каждый час - метрики провайдеров
    hourlyMetrics: {
      enabled: false,
      cron: '0 * * * *',
      skill: 'provider-health-monitor',
      command: 'provider-metrics',
      args: { period: '1h' }
    }
  }
};

/**
 * Load or create config
 */
function loadConfig() {
  if (existsSync(AUTO_CONFIG)) {
    return JSON.parse(readFileSync(AUTO_CONFIG, 'utf-8'));
  }
  
  writeFileSync(AUTO_CONFIG, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

/**
 * Run skill command
 */
async function runSkill(skillName, command, args) {
  try {
    console.log(`[auto-run] Running: ${skillName}/${command}`);
    
    const commandPath = join(
      process.cwd(),
      'skills',
      skillName,
      'commands',
      `${command}.js`
    );
    
    if (!existsSync(commandPath)) {
      throw new Error(`Command not found: ${commandPath}`);
    }
    
    const { default: commandFn } = await import(pathToFileURL(commandPath).href);
    const result = await commandFn(args, {});
    
    console.log(`[auto-run] ✓ Completed: ${skillName}/${command}`);
    return { success: true, result };
    
  } catch (error) {
    console.error(`[auto-run] ✗ Failed: ${skillName}/${command}`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Start scheduled jobs
 */
function startScheduler(config) {
  if (!config.enabled) {
    console.log('[auto-run] Scheduler disabled');
    return;
  }
  
  console.log('[auto-run] Starting scheduler...');
  
  for (const [name, job] of Object.entries(config.schedule)) {
    if (!job.enabled) {
      console.log(`[auto-run] Skipping disabled job: ${name}`);
      continue;
    }
    
    console.log(`[auto-run] Scheduling: ${name} (${job.cron})`);
    
    scheduleJob(job.cron, async () => {
      console.log(`[auto-run] Triggered: ${name}`);
      await runSkill(job.skill, job.command, job.args);
    });
  }
  
  console.log('[auto-run] ✓ Scheduler started');
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
CTX Auto-Run - Automatic skill execution

Commands:
  start              Start scheduler with cron jobs
  run <skill> <cmd>  Run skill command once
  config             Show current configuration
  enable <job>       Enable a scheduled job
  disable <job>      Disable a scheduled job
    `);
    process.exit(0);
  }
  
  const config = loadConfig();
  
  switch (args[0]) {
    case 'start':
      startScheduler(config);
      // Keep process alive
      process.on('SIGINT', () => {
        console.log('\n[auto-run] Stopping scheduler...');
        process.exit(0);
      });
      break;
      
    case 'run':
      if (args.length < 3) {
        console.error('Usage: node ctx-auto-run.js run <skill> <command>');
        process.exit(1);
      }
      await runSkill(args[1], args[2], {});
      break;
      
    case 'config':
      console.log(JSON.stringify(config, null, 2));
      break;
      
    case 'enable':
      if (args[1] && config.schedule[args[1]]) {
        config.schedule[args[1]].enabled = true;
        writeFileSync(AUTO_CONFIG, JSON.stringify(config, null, 2));
        console.log(`✓ Enabled: ${args[1]}`);
      } else {
        console.error('Job not found');
      }
      break;
      
    case 'disable':
      if (args[1] && config.schedule[args[1]]) {
        config.schedule[args[1]].enabled = false;
        writeFileSync(AUTO_CONFIG, JSON.stringify(config, null, 2));
        console.log(`✓ Disabled: ${args[1]}`);
      } else {
        console.error('Job not found');
      }
      break;
      
    default:
      console.error('Unknown command:', args[0]);
      process.exit(1);
  }
}

main().catch(console.error);
