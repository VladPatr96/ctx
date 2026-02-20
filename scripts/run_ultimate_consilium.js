import { delegate } from './providers/router.js';
import { writeFileSync } from 'node:fs';

const topic = "Modernizing CTX Dashboard: Migrating to Electron + React + TypeScript + Vite. Key features: Terminal integration (xterm.js + node-pty), Graph visualization (React Flow), Monaco Editor for Diff, and direct FS access via Preload API.";
const projectContext = "CTX Orchestrator (Node.js, MCP). Current UI: Hardcoded HTML string. Backend: Node.js HTTP/SSE. Goal: Desktop App with real terminal and code editing.";

async function run() {
    console.log("Starting GEMINI 3 AUTO Consilium (Model selection delegated to CLI)...");
    
    const tasks = [
        { 
            provider: 'gemini', 
            role: 'Architect/Researcher',
            task: `You are the lead architect and researcher (Gemini 3). Topic: ${topic}. Context: ${projectContext}. Analyze the migration to Electron + React. Provide architectural approach, tech stack recommendations (xterm, React Flow, node-pty) and security best practices. Russian. Max 600 words.` 
        }
    ];

    const results = [];
    for (const t of tasks) {
        console.log(`- Invoking ${t.provider.toUpperCase()} in AUTO mode...`);
        try {
            // Passing model: null to avoid --model flag and trigger CLI auto-selection
            const res = await delegate(t.task, { provider: 'gemini', model: null, timeout: 120000 });
            results.push({ provider: t.provider, role: t.role, ...res });
        } catch (e) {
            results.push({ provider: t.provider, role: t.role, status: 'error', error: e.message });
        }
    }

    writeFileSync('.data/results.json', JSON.stringify(results, null, 2));
    console.log(`\n--- GEMINI 3 AUTO RESULTS ---\n`);
    results.forEach(r => {
        console.log(`### ${r.role} (${r.provider.toUpperCase()})`);
        if (r.status === 'success') {
            console.log(r.response);
        } else {
            console.log(`ERROR: ${r.error}`);
        }
        console.log(`\n---\n`);
    });
}

run().catch(console.error);
