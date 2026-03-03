import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

const HOME = process.env.USERPROFILE || process.env.HOME || '';
const GEMINI_DIR = join(HOME, '.gemini');
const CREDS_PATH = join(GEMINI_DIR, 'oauth_creds.json');
const CHATS_DIR = join(GEMINI_DIR, 'tmp', 'claude-ctx', 'chats');

// ANSI colors
const e = '\x1b';
const reset = `${e}[0m`;
const dim = `${e}[2m`;
const green = `${e}[32m`;
const yellow = `${e}[33m`;
const red = `${e}[31m`;
const cyan = `${e}[36m`;
const blue = `${e}[34m`;

function getUsage() {
  if (!existsSync(CREDS_PATH)) return null;
  try {
    const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
    return { expiry: creds.expiry_date };
  } catch (e) { return null; }
}

function getLatestChatInfo() {
  if (!existsSync(CHATS_DIR)) return null;
  try {
    const files = readdirSync(CHATS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, time: statSync(join(CHATS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    if (files.length === 0) return null;
    const chat = JSON.parse(readFileSync(join(CHATS_DIR, files[0].name), 'utf-8'));
    const lastGeminiMsg = [...(chat.messages || [])].reverse().find(m => m.type === 'gemini');
    if (lastGeminiMsg && lastGeminiMsg.tokens) {
      return { model: lastGeminiMsg.model, tokens: lastGeminiMsg.tokens };
    }
  } catch (e) {}
  return null;
}

function getGitInfo() {
  try {
    const branch = execSync('git branch --show-current', { stdio: 'pipe' }).toString().trim();
    const project = basename(process.cwd());
    return { branch, project };
  } catch (e) {
    return { branch: '', project: basename(process.cwd()) };
  }
}

/**
 * Creates a 10-dot bar
 * @param {number} pct 0-100
 * @param {boolean} fillUp If true, bar fills from left (context). If false, bar empties from right (limits).
 * @param {string} type 'limit' or 'ctx'
 */
function renderBar(pct, fillUp, type) {
  const dots = 10;
  const filledCount = Math.round((pct / 100) * dots);
  let res = '';

  for (let i = 1; i <= dots; i++) {
    const isFilled = i <= filledCount; 
    
    if (isFilled) {
      let color = green;
      if (type === 'ctx') {
        if (pct > 80) color = red;
        else if (pct > 50) color = yellow;
      } else { // limit (remaining %)
        if (pct < 20) color = red;
        else if (pct < 50) color = yellow;
      }
      res += `${color}●${reset}`;
    } else {
      res += `${dim}○${reset}`;
    }
  }
  return res;
}

function formatTime(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return 'expired';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
}

async function main() {
  const usage = getUsage();
  const chatInfo = getLatestChatInfo();
  const git = getGitInfo();
  
  const model = chatInfo?.model || 'gemini-3.1-pro';
  const tokens = chatInfo?.tokens || { input: 0, total: 0 };
  const ctxLimit = 1000000;
  const ctxPct = Math.min(100, Math.round((tokens.input / ctxLimit) * 100));

  // Top Line
  const branchInfo = git.branch ? ` ${dim}(${git.branch})${reset}` : '';
  process.stdout.write(`${blue}${git.project}${branchInfo} ${dim}•${reset} ${cyan}${model}${reset} ${dim}•${reset} ${green}$0.00${reset}\n`);

  // 5h Limit (Simulated using Token Expiry for now as Gemini doesn't have 5h)
  if (usage) {
    const timeRemaining = formatTime(usage.expiry);
    process.stdout.write(`${dim}5h  ${reset}${renderBar(90, false, 'limit')} ${dim}90%  ${timeRemaining}${reset}\n`);
    
    // Weekly Limit (Static placeholder since not available)
    process.stdout.write(`${dim}W   ${reset}${renderBar(100, false, 'limit')} ${dim}100% Mon 14:30${reset}\n`);
  }

  // Context Bar
  process.stdout.write(`${dim}ctx ${reset}${renderBar(ctxPct, true, 'ctx')} ${dim}${ctxPct}%${reset}\n`);
}

main();
