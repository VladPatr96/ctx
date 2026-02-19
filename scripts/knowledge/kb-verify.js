#!/usr/bin/env node

/**
 * kb-verify.js — CLI for manual KB verification.
 *
 * Usage:
 *   node scripts/knowledge/kb-verify.js stats
 *   node scripts/knowledge/kb-verify.js search "sqlite error"
 *   node scripts/knowledge/kb-verify.js context claude_ctx
 */

async function loadStore() {
  try {
    const { KnowledgeStore } = await import('./knowledge-store.js');
    return { store: new KnowledgeStore(), mode: 'sqlite' };
  } catch {
    const { JsonKnowledgeStore } = await import('./kb-json-fallback.js');
    return { store: new JsonKnowledgeStore(), mode: 'json' };
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === '--help') {
    console.log(`Usage:
  kb-verify.js stats              Show KB statistics
  kb-verify.js search <query>     Search entries
  kb-verify.js context <project>  Get project context
  kb-verify.js entries [limit]    List recent entries`);
    return;
  }

  const { store, mode } = await loadStore();
  console.log(`[kb-verify] Mode: ${mode}`);

  try {
    switch (command) {
      case 'stats': {
        const stats = store.getStats();
        console.log(JSON.stringify(stats, null, 2));
        break;
      }

      case 'search': {
        const query = args.join(' ');
        if (!query) {
          console.error('Usage: kb-verify.js search <query>');
          process.exit(1);
        }
        const results = store.searchEntries(query, { limit: 10 });
        if (results.length === 0) {
          console.log('No results found.');
        } else {
          for (const r of results) {
            console.log(`\n[${r.project}] ${r.category}: ${r.title}`);
            console.log(`  ${r.body.slice(0, 200)}${r.body.length > 200 ? '...' : ''}`);
            if (r.github_url) console.log(`  URL: ${r.github_url}`);
          }
        }
        break;
      }

      case 'context': {
        const project = args[0];
        if (!project) {
          console.error('Usage: kb-verify.js context <project>');
          process.exit(1);
        }
        const ctx = store.getContextForProject(project, 10);
        console.log(`Entries for ${project}: ${ctx.entries.length}`);
        for (const e of ctx.entries) {
          console.log(`  [${e.category}] ${e.title}`);
        }
        if (ctx.snapshot) {
          console.log(`\nSnapshot (${ctx.snapshot.created_at}):`);
          console.log(JSON.stringify(ctx.snapshot.data, null, 2));
        } else {
          console.log('\nNo snapshot.');
        }
        break;
      }

      case 'entries': {
        const limit = parseInt(args[0]) || 20;
        const stats = store.getStats();
        console.log(`Total: ${stats.total} entries`);
        // Show via search with broad query
        const all = store.getContextForProject('', limit);
        if (all.entries.length === 0) {
          // Try listing all projects
          console.log('Projects:', Object.keys(stats.byProject).join(', '));
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } finally {
    store.close();
  }
}

main().catch(err => {
  console.error('[kb-verify] Error:', err.message);
  process.exit(1);
});
