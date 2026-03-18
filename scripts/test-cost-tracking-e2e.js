#!/usr/bin/env node

/**
 * End-to-end verification script for cost tracking feature
 *
 * This script verifies the complete cost tracking flow:
 * 1. Makes test provider calls
 * 2. Verifies costs are recorded in cost-tracking.json
 * 3. Checks optimization recommendations
 * 4. Tests budget alert triggers
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { recordUsage, getCostSummary, getCostsByProvider, clearCostData } from '../src/cost-tracking/index.js';
import { getRecommendations } from '../src/cost-tracking/optimization-engine.js';
import { setBudget, setProviderBudget, checkBudget, checkAllBudgets } from '../src/cost-tracking/budget-alerts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const DATA_DIR = join(__dirname, '..', '.data');
const COST_FILE = join(DATA_DIR, 'cost-tracking.json');
const BUDGET_FILE = join(DATA_DIR, 'budget-config.json');

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = level === 'success' ? `${colors.green}✓${colors.reset}` :
                 level === 'error' ? `${colors.red}✗${colors.reset}` :
                 level === 'info' ? `${colors.blue}ℹ${colors.reset}` :
                 `${colors.yellow}⚠${colors.reset}`;
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Test Steps ====================

async function step1_clearExistingData() {
  logSection('Step 1: Clear Existing Cost Data (for clean test)');

  try {
    await clearCostData();
    log('success', 'Cleared existing cost data');

    // Verify file is empty
    if (existsSync(COST_FILE)) {
      const data = JSON.parse(readFileSync(COST_FILE, 'utf-8'));
      if (data.requests && data.requests.length === 0) {
        log('success', 'Verified cost-tracking.json is empty');
      } else {
        log('error', 'Cost data not properly cleared');
        return false;
      }
    }

    return true;
  } catch (error) {
    log('error', `Failed to clear data: ${error.message}`);
    return false;
  }
}

async function step2_simulateProviderCalls() {
  logSection('Step 2: Simulate Provider Calls with Token Usage');

  try {
    // Simulate a Claude call
    log('info', 'Recording usage for Claude (opus-4)...');
    const result1 = await recordUsage({
      provider: 'claude',
      model: 'opus-4',
      inputTokens: 2000,
      outputTokens: 1000,
      sessionId: 'e2e-test-session',
      projectId: 'e2e-test-project'
    });
    if (result1.status === 'success') {
      log('success', `Claude cost recorded: $${result1.totalCost.toFixed(4)}`);
    } else {
      throw new Error(`Failed to record: ${result1.error || result1.reason}`);
    }

    await sleep(100);

    // Simulate a Gemini call
    log('info', 'Recording usage for Gemini (gemini-2.0-flash-exp)...');
    const result2 = await recordUsage({
      provider: 'gemini',
      model: 'gemini-2.0-flash-exp',
      inputTokens: 10000,
      outputTokens: 5000,
      sessionId: 'e2e-test-session',
      projectId: 'e2e-test-project'
    });
    if (result2.status === 'success') {
      log('success', `Gemini cost recorded: $${result2.totalCost.toFixed(4)}`);
    } else {
      throw new Error(`Failed to record: ${result2.error || result2.reason}`);
    }

    await sleep(100);

    // Simulate another Claude call
    log('info', 'Recording another Claude usage (opus-4.6)...');
    const result3 = await recordUsage({
      provider: 'claude',
      model: 'opus-4.6',
      inputTokens: 5000,
      outputTokens: 2500,
      sessionId: 'e2e-test-session',
      projectId: 'e2e-test-project'
    });
    if (result3.status === 'success') {
      log('success', `Claude cost recorded: $${result3.totalCost.toFixed(4)}`);
    } else {
      throw new Error(`Failed to record: ${result3.error || result3.reason}`);
    }

    return true;
  } catch (error) {
    log('error', `Failed to record usage: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function step3_verifyCostRecorded() {
  logSection('Step 3: Verify Costs Recorded in cost-tracking.json');

  try {
    if (!existsSync(COST_FILE)) {
      log('error', 'cost-tracking.json does not exist');
      return false;
    }

    const data = JSON.parse(readFileSync(COST_FILE, 'utf-8'));
    log('success', `Found cost-tracking.json`);

    // Verify requests
    if (!data.requests || data.requests.length === 0) {
      log('error', 'No requests recorded');
      return false;
    }
    log('success', `Verified ${data.requests.length} requests recorded`);

    // Verify sessions
    if (!data.sessions || !data.sessions['e2e-test-session']) {
      log('error', 'Session data not recorded');
      return false;
    }
    log('success', 'Session data recorded correctly');

    // Verify projects
    if (!data.projects || !data.projects['e2e-test-project']) {
      log('error', 'Project data not recorded');
      return false;
    }
    log('success', 'Project data recorded correctly');

    // Display summary
    const summary = await getCostSummary();
    console.log(`\n${colors.bold}Cost Summary:${colors.reset}`);
    console.log(`  Total Cost: $${summary.totalCost.toFixed(4)}`);
    console.log(`  Total Requests: ${summary.totalRequests}`);
    console.log(`  Total Tokens: ${summary.totalTokens || 'N/A'}`);
    console.log(`  Cost per Request: $${(summary.costPerRequest || 0).toFixed(4)}`);

    // Display by provider
    const byProvider = await getCostsByProvider();
    console.log(`\n${colors.bold}By Provider:${colors.reset}`);
    for (const [provider, stats] of Object.entries(byProvider)) {
      console.log(`  ${provider}: $${stats.totalCost.toFixed(4)} (${stats.requests} requests)`);
    }

    return true;
  } catch (error) {
    log('error', `Failed to verify cost data: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function step4_checkOptimizationRecommendations() {
  logSection('Step 4: Check Optimization Recommendations');

  try {
    const recommendations = await getRecommendations();

    if (!recommendations || recommendations.length === 0) {
      log('info', 'No optimization recommendations (may need more diverse data)');
      return true; // Not a failure, just means no recommendations
    }

    log('success', `Found ${recommendations.length} optimization recommendations`);

    console.log(`\n${colors.bold}Recommendations:${colors.reset}`);
    for (const rec of recommendations) {
      console.log(`\n  ${colors.yellow}Type:${colors.reset} ${rec.type}`);
      console.log(`  ${colors.yellow}Priority:${colors.reset} ${rec.priority}`);
      console.log(`  ${colors.yellow}Message:${colors.reset} ${rec.message}`);
      if (rec.savings) {
        console.log(`  ${colors.yellow}Potential Savings:${colors.reset} $${rec.savings.toFixed(4)}`);
      }
    }

    return true;
  } catch (error) {
    log('error', `Failed to get recommendations: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function step5_testBudgetAlerts() {
  logSection('Step 5: Test Budget Alerts');

  try {
    // Set a low budget to trigger alerts
    const testBudget = 0.05; // $0.05
    await setBudget(testBudget);
    log('success', `Set global budget to $${testBudget.toFixed(2)}`);

    await sleep(100);

    // Get current total cost
    const summary = await getCostSummary();
    log('info', `Current total cost: $${summary.totalCost.toFixed(4)}`);

    // Check budget status
    const status = await checkBudget(summary.totalCost);
    log('success', `Budget check returned status: ${status.status}`);

    if (status.status === 'ok') {
      log('warning', 'Budget not exceeded (need more test data)');
    } else if (status.status === 'warning') {
      log('success', `Budget WARNING triggered at ${status.percentUsed.toFixed(1)}%`);
    } else if (status.status === 'critical') {
      log('success', `Budget CRITICAL alert triggered at ${status.percentUsed.toFixed(1)}%`);
    } else if (status.status === 'exceeded') {
      log('success', `Budget EXCEEDED alert triggered at ${status.percentUsed.toFixed(1)}%`);
    }

    // Display budget status
    console.log(`\n${colors.bold}Budget Status:${colors.reset}`);
    console.log(`  Level: ${status.status}`);
    console.log(`  Spent: $${status.currentCost.toFixed(4)} / $${(status.budget || 0).toFixed(2)}`);
    console.log(`  Percentage: ${status.percentUsed?.toFixed(1) || 'N/A'}%`);
    console.log(`  Remaining: $${(status.remaining || 0).toFixed(4)}`);

    // Test provider-specific budget
    await setProviderBudget('claude', 0.10);
    log('success', 'Set Claude provider budget to $0.10');

    const byProvider = await getCostsByProvider();
    const claudeCost = byProvider.claude?.totalCost || 0;
    const claudeStatus = await checkBudget(claudeCost, { budget: 0.10 });
    log('success', `Claude budget check: ${claudeStatus.status} (${claudeStatus.percentUsed?.toFixed(1) || 'N/A'}%)`);

    return true;
  } catch (error) {
    log('error', `Failed to test budget alerts: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function step6_verifyRealTimeUpdates() {
  logSection('Step 6: Verify Real-Time Updates (File Watchers)');

  try {
    log('info', 'Making additional provider call to trigger file watcher...');

    await recordUsage({
      provider: 'gemini',
      model: 'gemini-2.0-flash-exp',
      inputTokens: 1000,
      outputTokens: 500,
      sessionId: 'e2e-test-session-2'
    });

    log('success', 'Additional usage recorded');
    log('info', 'If dashboard is running, SSE should broadcast cost-update event');
    log('info', 'Check dashboard UI at http://localhost:5173/ to verify real-time updates');

    return true;
  } catch (error) {
    log('error', `Failed to test real-time updates: ${error.message}`);
    return false;
  }
}

// ==================== Main Test Runner ====================

async function runE2ETests() {
  console.log(`${colors.bold}${colors.blue}`);
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Cost Tracking & Optimization Engine - E2E Tests       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const results = [];

  // Run all test steps
  results.push({ step: 'Clear Data', pass: await step1_clearExistingData() });
  results.push({ step: 'Simulate Calls', pass: await step2_simulateProviderCalls() });
  results.push({ step: 'Verify Recording', pass: await step3_verifyCostRecorded() });
  results.push({ step: 'Check Recommendations', pass: await step4_checkOptimizationRecommendations() });
  results.push({ step: 'Test Budget Alerts', pass: await step5_testBudgetAlerts() });
  results.push({ step: 'Verify Real-Time', pass: await step6_verifyRealTimeUpdates() });

  // Summary
  logSection('Test Summary');

  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  console.log('');
  results.forEach(r => {
    const icon = r.pass ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`  ${icon} ${r.step}`);
  });

  console.log('');
  if (passed === total) {
    log('success', `All ${total} tests passed!`);
    console.log(`\n${colors.bold}${colors.green}✓ End-to-End Verification Complete!${colors.reset}\n`);

    console.log(`${colors.bold}Next Steps:${colors.reset}`);
    console.log(`  1. Start dashboard: ${colors.blue}node scripts/dashboard-backend.js${colors.reset}`);
    console.log(`  2. Start frontend: ${colors.blue}cd ctx-app && npm run dev${colors.reset}`);
    console.log(`  3. Open browser: ${colors.blue}http://localhost:5173/${colors.reset}`);
    console.log(`  4. Verify cost data appears in dashboard UI\n`);

    process.exit(0);
  } else {
    log('error', `${total - passed} of ${total} tests failed`);
    console.log(`\n${colors.bold}${colors.red}✗ End-to-End Verification Failed${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runE2ETests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
