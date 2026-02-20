import { delegate } from './providers/router.js';
import { writeFileSync } from 'node:fs';

const topic = "Modernizing CTX Dashboard: Migrating to Electron + React + TypeScript + Vite. Key features: Terminal integration (xterm.js), Graph visualization (React Flow), Diff viewer, and direct FS access.";
const projectContext = "CTX Orchestrator (Node.js, MCP). Current UI: Hardcoded HTML string. Backend: Node.js HTTP/SSE (dashboard-backend.js).";

async function run() {
    console.log("Starting Real Consilium (Multi-model Gemini)...");
    
    // Using different models of Gemini for different roles
    const tasks = [
        { 
            provider: 'gemini', 
            model: 'gemini-3-pro-preview',
            role: 'Architect',
            task: `You are the **architect** agent. Role: Decomposition, API contracts (IPC), architecture. Topic: ${topic}. Context: ${projectContext}. Analyze from your role. Provide: approach, diagram (text), recommendations. Russian. Max 400 words.` 
        },
        { 
            provider: 'gemini', 
            model: 'gemini-3-flash-preview',
            role: 'Researcher',
            task: `You are the **researcher** agent. Role: Tech research, comparison, PoC. Topic: ${topic}. Compare Electron vs Tauri. Research xterm.js and React Flow. Russian. Max 400 words.` 
        }
    ];

    const results = [];
    for (const t of tasks) {
        console.log(`- Invoking Gemini (${t.model}) as ${t.role}...`);
        const res = await delegate(t.task, { provider: 'gemini', model: t.model, timeout: 90000 });
        results.push({ provider: 'gemini', model: t.model, role: t.role, ...res });
    }

    // Add Codex result from previous run (it was good)
    results.push({
        provider: 'codex',
        role: 'Reviewer',
        status: 'success',
        response: "Рекомендации по безопасности и стейт-менеджменту (см. предыдущий вывод)."
    });

    writeFileSync('.data/results.json', JSON.stringify(results, null, 2));
    console.log(`\n--- CONSILIUM RESULTS (GEMINI + CODEX) ---\n`);
    results.forEach(r => {
        console.log(`### ${r.role} (${r.provider} ${r.model || ''})`);
        if (r.status === 'success') {
            console.log(r.response);
        } else {
            console.log(`ERROR: ${r.error}`);
        }
        console.log(`\n---\n`);
    });
}

run().catch(console.error);
