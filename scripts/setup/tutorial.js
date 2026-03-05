#!/usr/bin/env node

/**
 * tutorial.js — Interactive tutorial for CTX framework
 *
 * Demonstrates key features:
 * - Knowledge search and synchronization
 * - Consilium multi-round discussions
 * - Session management and persistence
 *
 * Usage:
 *   node tutorial.js              — Run full interactive tutorial
 *   import { runTutorial } from './tutorial.js'  — Use programmatically
 */

import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function log(message, emoji = '✓') {
  console.log(`${emoji} ${message}`);
}

function error(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function header(message) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${message}`);
  console.log(`${'='.repeat(60)}\n`);
}

function section(message) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${message}`);
  console.log(`${'─'.repeat(60)}\n`);
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function waitForContinue(rl) {
  await prompt(rl, '\n⏎ Press Enter to continue...');
}

/**
 * Knowledge Search Demo
 */
async function demoKnowledgeSearch(rl) {
  section('📚 Knowledge Search Demo');

  console.log('CTX maintains a synchronized knowledge base for AI context:');
  console.log('');
  console.log('  • Local cache: ~/.config/ctx/knowledge/');
  console.log('  • Remote sync: GitHub repository');
  console.log('  • Auto-sync: Background updates every 30s');
  console.log('  • Smart search: Indexed lookups across all knowledge');
  console.log('');

  const kbDir = join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.config', 'ctx', 'knowledge'
  );

  if (existsSync(kbDir)) {
    log(`Knowledge base found at: ${kbDir}`);
    console.log('');

    // Demonstrate knowledge sync
    try {
      const { KbSync } = await import('../knowledge/kb-sync.js');
      const kb = new KbSync({ repoDir: kbDir });

      console.log('  Checking knowledge base status...');
      const isClean = await kb.isClean();
      if (isClean) {
        log('  Knowledge base is up to date', '✓');
      } else {
        log('  Knowledge base has uncommitted changes', '⚠');
      }
      console.log('');
    } catch (err) {
      log(`  Demo skipped: ${err.message}`, 'ℹ');
      console.log('');
    }

    console.log('  Try these commands:');
    console.log('  • ctx search "authentication"  — Search knowledge base');
    console.log('  • ctx kb sync                  — Manual sync with remote');
    console.log('  • ctx kb verify                — Check knowledge integrity');
  } else {
    log('Knowledge base not yet initialized', '⚠');
    console.log('');
    console.log('  Run these to get started:');
    console.log('  • ctx kb init                  — Initialize knowledge base');
    console.log('  • ctx search "topic"           — Auto-init on first search');
  }

  await waitForContinue(rl);
}

/**
 * Consilium Demo
 */
async function demoConsilium(rl) {
  section('🤝 Consilium Multi-Provider Demo');

  console.log('Consilium orchestrates anonymous multi-round discussions');
  console.log('between different AI providers for better decision-making:');
  console.log('');
  console.log('  • Round 1: Each provider gives independent opinion');
  console.log('  • Round 2+: Providers see anonymized responses');
  console.log('  • Synthesis: Smart aggregation of all viewpoints');
  console.log('  • Claim extraction: Identifies key arguments');
  console.log('');

  console.log('Example workflow:');
  console.log('');
  console.log('  1. You ask: "Should I use microservices or monolith?"');
  console.log('');
  console.log('  2. Consilium invokes:');
  console.log('     • Claude (Participant A)');
  console.log('     • Gemini (Participant B)');
  console.log('     • Codex (Participant C)');
  console.log('');
  console.log('  3. Round 1 responses collected independently');
  console.log('');
  console.log('  4. Round 2: Each sees others\' anonymized arguments');
  console.log('');
  console.log('  5. Synthesis: Balanced recommendation with trade-offs');
  console.log('');

  // Demonstrate alias mapping (core consilium feature)
  try {
    const { createAliasMap } = await import('../consilium/round-orchestrator.js');
    const testProviders = ['claude', 'gemini', 'codex'];
    const aliasMap = createAliasMap(testProviders);

    console.log('  Demo: Anonymous alias mapping');
    console.log('  ─────────────────────────────');
    for (const [provider, alias] of aliasMap) {
      console.log(`  ${provider} → ${alias}`);
    }
    console.log('');
    log('  Providers are anonymized for unbiased discussion', '✓');
    console.log('');
  } catch (err) {
    log(`  Demo skipped: ${err.message}`, 'ℹ');
    console.log('');
  }

  console.log('  Try it:');
  console.log('  • ctx consilium "Your complex question here"');
  console.log('  • ctx consilium --rounds 3 "Deep analysis question"');
  console.log('  • ctx consilium --providers claude,gemini "Question"');

  await waitForContinue(rl);
}

/**
 * Session Management Demo
 */
async function demoSessionManagement(rl) {
  section('💾 Session Management Demo');

  console.log('CTX automatically saves your work context to GitHub:');
  console.log('');
  console.log('  • Auto-save: On session compact or stop');
  console.log('  • Dual storage: Project issues + central repo');
  console.log('  • Rich context: Conversation + knowledge + claims');
  console.log('  • Resume capability: Restore from saved sessions');
  console.log('');

  console.log('How it works:');
  console.log('');
  console.log('  1. You work on a task with CTX');
  console.log('  2. Context grows: prompts, responses, knowledge');
  console.log('  3. On compact/stop: Auto-save to GitHub issue');
  console.log('  4. Later: Resume with full context restored');
  console.log('');

  const projectName = process.env.CLAUDE_PROJECT_DIR
    ? process.env.CLAUDE_PROJECT_DIR.split(/[/\\]/).pop()
    : 'your-project';

  console.log('  Session saved to:');
  console.log(`  • Project issues: ${projectName}/issues`);
  console.log('  • Central repo: VladPatr96/my_claude_code');
  console.log('');

  console.log('  Useful commands:');
  console.log('  • ctx session save             — Manual save');
  console.log('  • ctx session list             — View saved sessions');
  console.log('  • ctx session restore <id>     — Resume session');
  console.log('  • ctx session export           — Export to JSON');

  await waitForContinue(rl);
}

/**
 * Additional Tips
 */
async function showTips(rl) {
  section('💡 Pro Tips');

  console.log('Get the most out of CTX:');
  console.log('');
  console.log('  1. Provider Setup:');
  console.log('     • Use multiple providers for consilium');
  console.log('     • Set API keys in environment variables');
  console.log('     • Run `ctx setup` to configure providers');
  console.log('');
  console.log('  2. Knowledge Base:');
  console.log('     • Add project docs to knowledge/');
  console.log('     • Use descriptive filenames for better search');
  console.log('     • Sync regularly with `ctx kb sync`');
  console.log('');
  console.log('  3. Workflow Integration:');
  console.log('     • Enable auto-save hooks in git');
  console.log('     • Use session restore after interruptions');
  console.log('     • Export sessions for team sharing');
  console.log('');
  console.log('  4. Advanced Features:');
  console.log('     • Claim graphs visualize argument structure');
  console.log('     • Multi-round consilium for complex decisions');
  console.log('     • Custom provider priorities via config');
  console.log('');

  await waitForContinue(rl);
}

/**
 * Main tutorial flow
 */
export async function runTutorial(options = {}) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    header('🚀 Welcome to the CTX Interactive Tutorial!');

    console.log('This tutorial will walk you through CTX\'s key features:');
    console.log('');
    console.log('  1. 📚 Knowledge Search & Synchronization');
    console.log('  2. 🤝 Consilium Multi-Provider Discussions');
    console.log('  3. 💾 Session Management & Persistence');
    console.log('  4. 💡 Pro Tips & Best Practices');
    console.log('');
    console.log('Estimated time: 5 minutes');
    console.log('');

    if (!options.skipPrompt) {
      const answer = await prompt(rl, '📖 Ready to start? [Y/n]');
      if (answer.toLowerCase() === 'n') {
        log('Tutorial cancelled. Run `node tutorial.js` anytime!', 'ℹ');
        rl.close();
        return;
      }
    }

    // Run demos
    await demoKnowledgeSearch(rl);
    await demoConsilium(rl);
    await demoSessionManagement(rl);
    await showTips(rl);

    // Completion
    header('🎉 Tutorial Complete!');

    console.log('You\'re ready to use CTX! Here\'s what to do next:');
    console.log('');
    console.log('  ✓ Configure providers: ctx setup');
    console.log('  ✓ Initialize knowledge: ctx kb init');
    console.log('  ✓ Try a search: ctx search "your topic"');
    console.log('  ✓ Ask consilium: ctx consilium "your question"');
    console.log('');
    console.log('📚 Documentation:');
    console.log('  • CTX_QUICKSTART.md — Quick reference guide');
    console.log('  • CTX_UNIVERSAL.md — Complete documentation');
    console.log('  • GitHub: VladPatr96/ctx-knowledge');
    console.log('');

    log('Happy coding with CTX! 🚀', '🎊');
    console.log('');

    rl.close();
  } catch (err) {
    error(`Tutorial error: ${err.message}`);
  }
}

// Run as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  runTutorial().catch(err => {
    error(`Failed to run tutorial: ${err.message}`);
  });
}
