/**
 * CTX Dashboard — Frontend HTML builder
 * Redesigned based on consilium: "Obsidian Terminal" + "Mission Control"
 *
 * Exports buildHtml() which returns a complete HTML page
 * with embedded CSS (dark/light auto) and JS (SSE + renderers).
 */

export function buildHtml() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CTX Dashboard</title>
<style>
/* ── Theme: Dark (default) ── */
:root, [data-theme="dark"] {
  --bg:         #0d0d0f;
  --surface:    #141418;
  --surface-2:  #1c1c22;
  --border:     #242429;
  --border-2:   #2e2e35;
  --text:       #e8e8ed;
  --muted:      #56565f;
  --subtle:     #3a3a42;
  --accent:     #5b8af5;
  --accent-dim: #2a3f7a;
  --accent-bg:  #111827;
  --cyan:       #4de2c5;
  --green:      #3ecf8e;
  --amber:      #f5a623;
  --red:        #f05252;
  --purple:     #9b8afb;
  --font-mono:  'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace;
  --font-ui:    -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
}
[data-theme="light"] {
  --bg:         #f5f5f7;
  --surface:    #ffffff;
  --surface-2:  #f0f0f4;
  --border:     #e0e0e6;
  --border-2:   #d1d1d8;
  --text:       #1a1a1f;
  --muted:      #8e8e9a;
  --subtle:     #b0b0ba;
  --accent:     #2563eb;
  --accent-dim: #bfdbfe;
  --accent-bg:  #eff6ff;
  --cyan:       #0d9488;
  --green:      #059669;
  --amber:      #d97706;
  --red:        #dc2626;
  --purple:     #7c3aed;
}

/* ── Reset ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{height:100%}
body{
  font-family:var(--font-ui);font-size:13px;line-height:1.5;
  background:var(--bg);color:var(--text);height:100vh;overflow:hidden;
  -webkit-font-smoothing:antialiased;
}

/* ── Dashboard Grid ── */
.dashboard{
  display:grid;gap:1px;height:100vh;
  background:var(--border);
  grid-template-areas:
    "header   header    header"
    "pipeline pipeline  pipeline"
    "agents   consilium log"
    "agents   map       log";
  grid-template-columns:1.3fr 1fr 320px;
  grid-template-rows:auto auto 1fr 1fr;
}

/* ── Header ── */
.dash-header{
  grid-area:header;background:var(--surface);
  display:flex;align-items:center;gap:12px;
  padding:10px 20px;
}
.dash-header h1{font-size:14px;font-weight:700;letter-spacing:-.01em}
.dash-header .logo{font-size:16px;opacity:.7}
.status-pill{
  display:flex;align-items:center;gap:6px;margin-left:auto;
  font-size:11px;color:var(--muted);
}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--amber)}
.status-dot.live{background:var(--green);box-shadow:0 0 8px var(--green)}
.status-dot.err{background:var(--red)}
.theme-btn{
  background:none;border:1px solid var(--border);border-radius:6px;
  color:var(--muted);cursor:pointer;padding:4px 8px;font-size:12px;
  margin-left:8px;
}
.theme-btn:hover{border-color:var(--border-2);color:var(--text)}

/* ── Panel ── */
.panel{background:var(--bg);display:flex;flex-direction:column;overflow:hidden;min-height:0}
.panel-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0;
}
.panel-title{
  font-size:11px;font-weight:600;text-transform:uppercase;
  letter-spacing:.07em;color:var(--muted);
}
.panel-badge{
  font-size:10px;font-weight:600;color:var(--accent);
  background:var(--accent-bg);padding:2px 7px;border-radius:4px;
}
.panel-body{flex:1;overflow-y:auto;padding:12px 16px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
.panel-body:empty::after{content:"No data";color:var(--muted);font-size:12px}

/* ── Pipeline ── */
.pipeline-wrap{grid-area:pipeline;background:var(--surface);padding:16px 20px}
.pipeline-track{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.stage{
  padding:10px 8px;font-weight:700;font-size:11px;letter-spacing:.06em;
  text-align:center;color:var(--muted);background:var(--surface-2);
  border:1px solid var(--border);position:relative;cursor:pointer;
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%,14px 50%);
  transition:all .3s ease;
}
.stage:first-child{clip-path:polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)}
.stage-time{display:block;font-size:9px;font-weight:400;color:var(--subtle);font-family:var(--font-mono);margin-top:2px}
.stage.done{color:var(--green);border-color:rgba(62,207,142,.2);background:linear-gradient(180deg,#0f1f1a,#0d1a16)}
.stage.active{
  color:var(--text);border-color:var(--accent);
  background:linear-gradient(90deg,var(--surface-2),#1a2744,var(--surface-2));
  background-size:200% 100%;animation:beam 2.5s linear infinite;
}
@keyframes beam{to{background-position:200% 0}}
.stage.pending{color:var(--subtle)}
.stage:hover:not(.active){color:var(--text);border-color:var(--border-2)}

/* ── Pipeline Controls ── */
.pipeline-controls{display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap}
.task-form{display:flex;gap:6px;flex:1;min-width:180px}
.task-input{
  flex:1;background:var(--surface-2);border:1px solid var(--border);
  border-radius:6px;color:var(--text);font-family:var(--font-ui);
  font-size:12px;padding:6px 10px;outline:none;transition:border-color .15s;
}
.task-input:focus{border-color:var(--accent)}
.task-input::placeholder{color:var(--muted)}
.action-btn{
  background:var(--surface-2);border:1px solid var(--border);border-radius:6px;
  color:var(--text);cursor:pointer;font-size:12px;font-family:var(--font-ui);
  padding:6px 12px;transition:border-color .15s,background .15s;white-space:nowrap;
}
.action-btn:hover{border-color:var(--accent);background:var(--accent-bg);color:var(--accent)}
.action-btn.danger:hover{border-color:var(--red);background:rgba(240,82,82,.08);color:var(--red)}
.lead-options{display:flex;gap:4px}
.lead-chip{
  background:var(--surface-2);border:1px solid var(--border);border-radius:4px;
  color:var(--muted);cursor:pointer;font-size:11px;font-weight:600;
  letter-spacing:.03em;padding:4px 10px;text-transform:uppercase;
  transition:all .15s;font-family:var(--font-ui);
}
.lead-chip:hover{border-color:var(--cyan);color:var(--cyan)}
.lead-chip.active{background:rgba(77,226,197,.08);border-color:var(--cyan);color:var(--cyan)}

/* ── Agent Cards ── */
.agents-panel{grid-area:agents}
.agents-grid{display:flex;flex-direction:column;gap:8px}
.agent-card{
  display:flex;background:var(--surface);border:1px solid var(--border);
  border-radius:8px;overflow:hidden;transition:border-color .15s,transform .15s;
}
.agent-card:hover{border-color:var(--accent-dim);transform:translateY(-1px)}
.agent-bar{width:3px;flex-shrink:0;background:var(--muted)}
.agent-card[data-status="active"] .agent-bar{background:var(--green)}
.agent-card[data-status="busy"] .agent-bar{background:var(--amber);animation:blink-bar .8s step-end infinite}
@keyframes blink-bar{50%{opacity:.3}}
.agent-body{padding:10px 12px;flex:1;min-width:0}
.agent-top{display:flex;align-items:center;gap:8px}
.agent-name{font-size:13px;font-weight:600}
.agent-role{
  font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--accent);background:var(--accent-bg);padding:2px 6px;border-radius:3px;
}
.agent-stage{font-size:11px;color:var(--muted);margin-top:3px}
.agent-actions{display:flex;justify-content:flex-end;margin-top:10px}
.agent-details-btn{
  background:var(--surface-2);border:1px solid var(--border);border-radius:4px;
  color:var(--muted);cursor:pointer;font-size:10px;font-family:var(--font-mono);
  padding:3px 8px;transition:all .15s;text-transform:uppercase;
}
.agent-details-btn:hover{border-color:var(--accent);color:var(--accent)}
.agent-skills{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.skill-tag{
  font-size:10px;padding:2px 7px;border-radius:3px;
  background:var(--surface-2);border:1px solid var(--border);
  color:var(--muted);font-family:var(--font-mono);
}

/* ── Consilium ── */
.consilium-panel{grid-area:consilium}
.consilium-panel[data-consensus="consensus"] .panel-header{border-left:3px solid var(--green)}
.consilium-panel[data-consensus="split"] .panel-header{border-left:3px solid var(--amber)}
.consilium-panel[data-consensus="conflict"] .panel-header{border-left:3px solid var(--red)}
.consilium-list{display:flex;flex-direction:column;gap:8px}
.consilium-row{
  background:var(--surface);border:1px solid var(--border);border-radius:6px;
  padding:10px 12px;opacity:0;animation:fade-row .25s ease forwards;
}
.consilium-row:nth-child(1){animation-delay:0ms}
.consilium-row:nth-child(2){animation-delay:80ms}
.consilium-row:nth-child(3){animation-delay:120ms}
.consilium-row:nth-child(4){animation-delay:160ms}
.consilium-row:nth-child(5){animation-delay:200ms}
@keyframes fade-row{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.consilium-provider{font-size:11px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.05em}
.consilium-desc{font-size:12px;color:var(--text);margin-top:4px;line-height:1.4}
.consilium-members{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.consilium-member{
  font-size:10px;padding:2px 7px;border-radius:3px;
  background:var(--surface-2);border:1px solid var(--border);
  color:var(--muted);font-family:var(--font-mono);
}
.preset-activate-btn{
  background:none;border:1px solid var(--border);border-radius:4px;
  color:var(--muted);cursor:pointer;font-size:10px;font-family:var(--font-mono);
  margin-top:6px;padding:3px 8px;transition:all .15s;
}
.preset-activate-btn:hover{border-color:var(--cyan);color:var(--cyan)}
.preset-activate-btn.active-preset{
  border-color:var(--green);color:var(--green);background:rgba(62,207,142,.06);
}

/* ── Log Timeline ── */
.log-panel{grid-area:log}
.log-list{list-style:none;display:flex;flex-direction:column;gap:0}
.log-entry{
  padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;
  display:flex;gap:8px;align-items:flex-start;
}
.log-entry.new{animation:log-in .3s ease-out}
@keyframes log-in{from{opacity:0;transform:translateX(-8px);background:var(--accent-bg)}to{opacity:1;transform:none;background:transparent}}
.log-ts{
  color:var(--subtle);font-family:var(--font-mono);font-size:10px;
  white-space:nowrap;min-width:60px;padding-top:1px;
  font-variant-numeric:tabular-nums;
}
.log-action{
  font-size:10px;font-weight:600;color:var(--accent);text-transform:uppercase;
  min-width:56px;padding-top:1px;
}
.log-msg{color:var(--text);word-break:break-word;flex:1}

/* ── Progress Timeline ── */
.progress-section{margin-bottom:20px;padding:16px;background:var(--surface);border-radius:12px;border:1px solid var(--border)}
.progress-list{position:relative;padding-left:24px;list-style:none}
.progress-list::before{content:"";position:absolute;left:7px;top:8px;bottom:8px;width:2px;background:var(--subtle);opacity:.3}
.progress-step{position:relative;padding-bottom:16px;display:flex;flex-direction:column;gap:4px}
.progress-step:last-child{padding-bottom:0}
.progress-marker{
  position:absolute;left:-24px;top:4px;width:14px;height:14px;
  border-radius:50%;background:var(--bg);border:3px solid var(--muted);
  z-index:1;transition:all .2s;
}
.progress-step.is-action .progress-marker{border-color:var(--green)}
.progress-step.is-error .progress-marker{border-color:var(--red);box-shadow:0 0 8px var(--red)}
.progress-step:hover .progress-marker{transform:scale(1.2);border-color:var(--text)}
.p-header{display:flex;align-items:center;gap:8px}
.p-ts{font-family:var(--font-mono);font-size:10px;color:var(--muted)}
.p-kind{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:1px 5px;border-radius:3px;background:var(--surface-2)}
.progress-step.is-action .p-kind{color:var(--green);background:rgba(62,207,142,.1)}
.progress-step.is-error .p-kind{color:var(--red);background:rgba(240,82,82,.1)}
.p-content{font-size:12px;color:var(--text);font-weight:500}
.p-detail{font-size:11px;color:var(--muted);font-family:var(--font-mono);word-break:break-all}

/* ── Project Map ── */
.map-panel{grid-area:map}
.map-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px}
.map-key{font-weight:600;color:var(--muted)}
.map-val{color:var(--text);word-break:break-word;font-family:var(--font-mono);font-size:11px}

/* ── Toast ── */
.toast{
  position:fixed;bottom:20px;right:20px;padding:10px 16px;border-radius:8px;
  font-size:13px;font-weight:500;z-index:9999;animation:toast-in .25s ease-out;
  pointer-events:none;
}
.toast-ok{background:rgba(62,207,142,.12);border:1px solid var(--green);color:var(--green)}
.toast-error{background:rgba(240,82,82,.12);border:1px solid var(--red);color:var(--red)}
@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* ── Modal ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1000;
  display:flex;align-items:center;justify-content:center;
  opacity:0;pointer-events:none;transition:opacity .2s}
.modal-overlay.open{opacity:1;pointer-events:auto}
.modal{background:var(--surface);border:1px solid var(--border-2);border-radius:12px;
  width:min(640px,96vw);max-height:90vh;overflow-y:auto;padding:24px;
  box-shadow:0 24px 64px rgba(0,0,0,.5)}
.modal-title{font-size:15px;font-weight:700;margin-bottom:20px}
.modal-field{margin-bottom:16px}
.modal-label{display:block;font-size:11px;font-weight:600;color:var(--muted);
  text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.modal-textarea{width:100%;background:var(--surface-2);border:1px solid var(--border);
  border-radius:6px;color:var(--text);font-family:var(--font-ui);
  font-size:13px;padding:8px 12px;outline:none;resize:vertical;min-height:72px;
  transition:border-color .15s}
.modal-textarea:focus{border-color:var(--accent)}
.modal-textarea::placeholder{color:var(--muted)}
.chip-group{display:flex;flex-wrap:wrap;gap:6px}
.modal-chip{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;
  color:var(--muted);cursor:pointer;font-size:11px;font-weight:600;
  padding:4px 10px;text-transform:uppercase;transition:all .15s;font-family:var(--font-ui)}
.modal-chip:hover{border-color:var(--accent);color:var(--accent)}
.modal-chip.selected{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}
.modal-chip.selected-lead{background:rgba(77,226,197,.08);border-color:var(--cyan);color:var(--cyan)}
.checkbox-group{display:flex;flex-direction:column;gap:6px;max-height:120px;overflow-y:auto;
  padding:2px 0}
.checkbox-item{display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer}
.checkbox-item input{accent-color:var(--accent);cursor:pointer}
.model-select-group{display:flex;flex-direction:column;gap:6px}
.model-select-row{display:flex;align-items:center;gap:10px}
.model-select-label{font-size:11px;color:var(--muted);min-width:72px;
  text-transform:uppercase;font-weight:600}
.model-select{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;
  color:var(--text);font-size:12px;padding:4px 8px;outline:none;flex:1;cursor:pointer}
.model-select:focus{border-color:var(--accent)}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;
  padding-top:16px;border-top:1px solid var(--border)}

/* ── Results cards ── */
.results-section{margin-top:16px;border-top:1px solid var(--border);padding-top:12px}
.section-title{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;
  letter-spacing:.07em;margin-bottom:8px}
.result-group{margin-bottom:12px}
.result-run-label{font-size:9px;color:var(--subtle);font-family:var(--font-mono);margin-bottom:8px;display:flex;align-items:center;gap:6px}
.result-run-label::before{content:"";width:12px;height:1px;background:var(--border)}
.result-card{
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.1);
  transition:border-color .2s;
}
.result-card:hover{border-color:var(--cyan)}
.result-card-header{display:flex;align-items:center;gap:12px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.result-provider-name{
  font-size:10px;font-weight:800;color:var(--bg);background:var(--cyan);
  text-transform:uppercase;letter-spacing:.1em;padding:2px 8px;border-radius:4px;
}
.result-provider-name[data-provider="claude"]{background:var(--accent)}
.result-provider-name[data-provider="gemini"]{background:var(--purple)}
.result-provider-name[data-provider="codex"]{background:var(--amber)}
.result-task-label{font-size:11px;color:var(--muted);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.result-text{font-size:12px;color:var(--text);line-height:1.6;
  max-height:80px;overflow:hidden;transition:max-height .3s cubic-bezier(0.4, 0, 0.2, 1);
  position:relative;mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
}
.result-text.expanded{max-height:1000px;mask-image:none}
.expand-btn{
  background:var(--surface-2);border:1px solid var(--border);color:var(--muted);
  cursor:pointer;font-size:10px;font-family:var(--font-mono);padding:4px 12px;
  border-radius:6px;margin-top:8px;display:inline-block;transition:all .15s;
}
.expand-btn:hover{color:var(--text);border-color:var(--border-2)}
.conf-wrap{margin-top:6px}
.conf-label{font-size:9px;color:var(--muted);margin-bottom:2px}
.conf-bar{height:3px;border-radius:2px;background:var(--border);overflow:hidden}
.conf-fill{height:100%;border-radius:2px;transition:width .4s ease}

/* ── Session Progress ── */
.progress-section{margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border)}
.progress-step{padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;
  display:flex;gap:8px;align-items:flex-start}
.progress-step.is-error .p-kind,.progress-step.is-error .p-result{color:var(--red)}
.p-ts{color:var(--subtle);font-family:var(--font-mono);font-size:10px;
  white-space:nowrap;min-width:60px;padding-top:1px}
.p-kind{font-size:10px;font-weight:600;color:var(--green);text-transform:uppercase;
  min-width:50px;padding-top:1px}
.p-agent{font-weight:600;color:var(--text);margin-right:4px}
.p-result{color:var(--muted);word-break:break-word;flex:1}
.log-entries{display:flex;flex-direction:column}

/* ── SR Only ── */
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}

/* ── Responsive ── */
@media(max-width:1100px){
  .dashboard{
    grid-template-columns:1fr;height:auto;overflow-y:auto;
    grid-template-areas:"header" "pipeline" "agents" "consilium" "log" "map";
    grid-template-rows:auto;
  }
  .panel-body{max-height:400px}
  body{height:auto;overflow:auto}
}

/* ── Reduced motion ── */
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>

<div class="dashboard">
  <!-- Header -->
  <header class="dash-header" role="banner">
    <span class="logo" aria-hidden="true">&#x2B22;</span>
    <h1>CTX Dashboard</h1>
    <div class="status-pill" aria-live="polite">
      <span class="status-dot" id="statusDot"></span>
      <span id="statusText">Connecting...</span>
    </div>
    <button class="theme-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle dark/light theme">&#9681;</button>
  </header>

  <!-- Pipeline -->
  <section class="pipeline-wrap" id="panelPipeline" aria-label="Pipeline Control Center">
    <div id="pipelineTrack" class="pipeline-track" role="list" aria-label="Pipeline stages"></div>
    <div class="pipeline-controls">
      <div class="task-form">
        <label for="taskInput" class="sr-only">Quick task description</label>
        <input id="taskInput" class="task-input" type="text" placeholder="Describe task..." autocomplete="off">
        <button class="action-btn" id="openModalBtn" type="button" aria-haspopup="dialog">Set Task</button>
      </div>
      <div id="leadSelector" aria-label="Lead AI Provider selection"><div class="lead-options" role="group"></div></div>
      <button id="resetBtn" class="action-btn danger" type="button">Reset Pipeline</button>
    </div>
  </section>

  <!-- Agents -->
  <section class="panel agents-panel" id="panelAgents" aria-labelledby="h-agents">
    <div class="panel-header">
      <h2 class="panel-title" id="h-agents">Agents</h2>
      <span class="panel-badge" id="agentCount" aria-label="Number of active agents">0</span>
    </div>
    <div class="panel-body" role="region" aria-live="polite"></div>
  </section>

  <!-- Consilium -->
  <section class="panel consilium-panel" id="panelConsilium" aria-labelledby="h-consilium">
    <div class="panel-header">
      <h2 class="panel-title" id="h-consilium">Consilium</h2>
    </div>
    <div class="panel-body" role="region" aria-live="polite"></div>
  </section>

  <!-- Log -->
  <section class="panel log-panel" id="panelLog" aria-labelledby="h-log">
    <div class="panel-header">
      <h2 class="panel-title" id="h-log">Timeline</h2>
      <span class="panel-badge" id="logCount" aria-label="Log entries count">0</span>
    </div>
    <div class="panel-body" role="region" aria-live="polite"></div>
  </section>

  <!-- Project Map -->
  <section class="panel map-panel" id="panelMap" aria-labelledby="h-project">
    <div class="panel-header">
      <h2 class="panel-title" id="h-project">Project Info</h2>
    </div>
    <div class="panel-body"></div>
  </section>
</div>

<!-- Task Creation Modal -->
<div class="modal-overlay" id="taskModal" role="dialog" aria-modal="true" aria-labelledby="taskModalTitle">
  <div class="modal">
    <div class="modal-title" id="taskModalTitle">New Task</div>
    <div class="modal-field">
      <label class="modal-label" for="modalTaskInput">Task description</label>
      <textarea class="modal-textarea" id="modalTaskInput" placeholder="What needs to be done?"></textarea>
    </div>
    <div class="modal-field">
      <span class="modal-label">Lead Provider</span>
      <div class="chip-group" id="modalLeadChips"></div>
    </div>
    <div class="modal-field">
      <span class="modal-label">Consilium Preset</span>
      <div class="chip-group" id="modalPresetChips"></div>
    </div>
    <div class="modal-field">
      <span class="modal-label">Agents</span>
      <div class="checkbox-group" id="modalAgentChecks"></div>
    </div>
    <div class="modal-field">
      <span class="modal-label">Skills</span>
      <div class="checkbox-group" id="modalSkillChecks"></div>
    </div>
    <div class="modal-field">
      <span class="modal-label">Models per Provider</span>
      <div class="model-select-group" id="modalModelSelects"></div>
    </div>
    <div class="modal-actions">
      <button class="action-btn" id="modalCancelBtn" type="button">Cancel</button>
      <button class="action-btn" id="modalCreateBtn" type="button"
        style="border-color:var(--accent);color:var(--accent)">Create Task</button>
    </div>
  </div>
</div>

<!-- Agent Details Modal -->
<div class="modal-overlay" id="agentModal" role="dialog" aria-modal="true" aria-labelledby="agentModalTitle">
  <div class="modal">
    <div class="modal-title" id="agentModalTitle">Agent Instructions</div>
    <div class="modal-field">
      <div id="agentModalContent" style="white-space:pre-wrap;font-family:var(--font-mono);font-size:11px;max-height:400px;overflow-y:auto;background:var(--surface-2);padding:12px;border:1px solid var(--border);border-radius:6px;color:var(--muted);"></div>
    </div>
    <div class="modal-actions">
      <button class="action-btn" id="agentModalCloseBtn" type="button">Close</button>
    </div>
  </div>
</div>

<script>
(function() {
  'use strict';

  var STAGES = ['DETECT','CONTEXT','TASK','BRAINSTORM','PLAN','EXECUTE','DONE'];
  var PROVIDERS = ['claude','gemini','opencode','codex'];
  var MODELS = {
    claude:   ['claude-opus-4-6','claude-sonnet-4-6','claude-haiku-4-5-20251001'],
    gemini:   ['gemini-2.0-flash','gemini-2.0-pro','gemini-1.5-pro','gemini-1.5-flash'],
    codex:    ['gpt-4o','o3-mini','gpt-4.5-preview'],
    opencode: ['claude-sonnet-4-6','gemini-2.0-flash','gpt-4o']
  };
  var _state = {};
  var modalState = { lead: 'claude', preset: '', agents: {}, skills: {}, models: {} };

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── API helper ── */
  function apiPost(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  /* ── Toast notifications ── */
  function showToast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type === 'error' ? 'error' : 'ok');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 2500);
  }

  /* ── Theme toggle ── */
  var theme = localStorage.getItem('ctx-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtn').addEventListener('click', function() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ctx-theme', theme);
  });

  /* ── Stage click handlers ── */
  function attachStageClicks() {
    document.querySelectorAll('#pipelineTrack .stage').forEach(function(el) {
      el.onclick = function() {
        var stage = el.getAttribute('data-stage');
        if (!stage) return;
        apiPost('/api/pipeline/stage', { stage: stage }).then(function(r) {
          if (r && r.ok) showToast('Stage \u2192 ' + stage, 'ok');
          else showToast('Error: ' + (r && r.error || 'Unknown'), 'error');
        }).catch(function() { showToast('Connection error', 'error'); });
      };
    });
  }

  /* ── Lead selector ── */
  function renderLeadSelector(currentLead) {
    var container = document.querySelector('#leadSelector .lead-options');
    if (!container) return;
    container.innerHTML = PROVIDERS.map(function(p) {
      var cls = 'lead-chip' + (p === currentLead ? ' active' : '');
      return '<button class="' + cls + '" data-provider="' + p + '" type="button">' + esc(p) + '</button>';
    }).join('');
    container.querySelectorAll('.lead-chip').forEach(function(btn) {
      btn.onclick = function() {
        var provider = btn.getAttribute('data-provider');
        apiPost('/api/pipeline/lead', { lead: provider }).then(function(r) {
          if (r && r.ok) showToast('Lead \u2192 ' + provider, 'ok');
          else showToast('Error: ' + (r && r.error || 'Unknown'), 'error');
        }).catch(function() { showToast('Connection error', 'error'); });
      };
    });
  }

  /* ── Preset activate buttons ── */
  function attachPresetActivate() {
    document.querySelectorAll('.preset-activate-btn').forEach(function(btn) {
      btn.onclick = function() {
        var preset = btn.getAttribute('data-preset');
        apiPost('/api/consilium/activate', { preset: preset }).then(function(r) {
          if (r && r.ok) showToast('Preset: ' + preset, 'ok');
          else showToast('Error: ' + (r && r.error || 'Unknown'), 'error');
        }).catch(function() { showToast('Connection error', 'error'); });
      };
    });
  }

  /* ── Modal ── */
  function openModal(currentTask, agents, skills, presets, lead, preset) {
    modalState.lead = lead || 'claude';
    modalState.preset = preset || '';

    var modalTaskInput = document.getElementById('modalTaskInput');
    if (modalTaskInput) modalTaskInput.value = currentTask || '';

    // Lead chips
    var leadChips = document.getElementById('modalLeadChips');
    if (leadChips) {
      leadChips.innerHTML = PROVIDERS.map(function(p) {
        var cls = 'modal-chip' + (p === modalState.lead ? ' selected-lead' : '');
        return '<button class="' + cls + '" data-lead="' + esc(p) + '" type="button">' + esc(p) + '</button>';
      }).join('');
      leadChips.querySelectorAll('.modal-chip').forEach(function(btn) {
        btn.onclick = function() {
          modalState.lead = btn.getAttribute('data-lead');
          leadChips.querySelectorAll('.modal-chip').forEach(function(b) { b.className = 'modal-chip'; });
          btn.className = 'modal-chip selected-lead';
          renderModalModels();
        };
      });
    }

    // Preset chips
    var presetChips = document.getElementById('modalPresetChips');
    if (presetChips) {
      presetChips.innerHTML = (presets || []).map(function(p) {
        var cls = 'modal-chip' + (p.name === modalState.preset ? ' selected' : '');
        return '<button class="' + cls + '" data-preset="' + esc(p.name) + '" type="button">' + esc(p.name) + '</button>';
      }).join('');
      presetChips.querySelectorAll('.modal-chip').forEach(function(btn) {
        btn.onclick = function() {
          var pname = btn.getAttribute('data-preset');
          if (modalState.preset === pname) {
            modalState.preset = '';
            btn.className = 'modal-chip';
          } else {
            modalState.preset = pname;
            presetChips.querySelectorAll('.modal-chip').forEach(function(b) { b.className = 'modal-chip'; });
            btn.className = 'modal-chip selected';
          }
        };
      });
    }

    // Agent checkboxes
    var agentChecks = document.getElementById('modalAgentChecks');
    if (agentChecks) {
      agentChecks.innerHTML = (agents || []).map(function(a) {
        var aid = a.id || a.name;
        var idAttr = 'chk-agent-' + esc(aid);
        var checked = modalState.agents[aid] ? ' checked' : '';
        return '<label class="checkbox-item"><input type="checkbox" id="' + idAttr + '" data-agent="' + esc(aid) + '"' + checked + '> ' + esc(a.name || a.id) + '</label>';
      }).join('');
      agentChecks.querySelectorAll('input[type=checkbox]').forEach(function(chk) {
        chk.onchange = function() { modalState.agents[chk.getAttribute('data-agent')] = chk.checked; };
      });
    }

    // Skill checkboxes
    var skillChecks = document.getElementById('modalSkillChecks');
    if (skillChecks) {
      skillChecks.innerHTML = (skills || []).map(function(s) {
        var idAttr = 'chk-skill-' + esc(s);
        var checked = modalState.skills[s] ? ' checked' : '';
        return '<label class="checkbox-item"><input type="checkbox" id="' + idAttr + '" data-skill="' + esc(s) + '"' + checked + '> ' + esc(s) + '</label>';
      }).join('');
      skillChecks.querySelectorAll('input[type=checkbox]').forEach(function(chk) {
        chk.onchange = function() { modalState.skills[chk.getAttribute('data-skill')] = chk.checked; };
      });
    }

    renderModalModels();
    document.getElementById('taskModal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('taskModal').classList.remove('open');
    document.getElementById('agentModal').classList.remove('open');
  }

  function openAgentModal(id, content) {
    document.getElementById('agentModalTitle').textContent = 'Agent: ' + id;
    document.getElementById('agentModalContent').textContent = content;
    document.getElementById('agentModal').classList.add('open');
  }

  function renderModalModels() {
    var container = document.getElementById('modalModelSelects');
    if (!container) return;
    container.innerHTML = PROVIDERS.map(function(p) {
      var models = MODELS[p] || [];
      var currentModel = modalState.models[p] || models[0] || '';
      var opts = models.map(function(m) {
        return '<option value="' + esc(m) + '"' + (m === currentModel ? ' selected' : '') + '>' + esc(m) + '</option>';
      }).join('');
      return '<div class="model-select-row">' +
        '<span class="model-select-label">' + esc(p) + '</span>' +
        '<select class="model-select" data-provider="' + esc(p) + '">' + opts + '</select>' +
        '</div>';
    }).join('');
    container.querySelectorAll('.model-select').forEach(function(sel) {
      sel.onchange = function() { modalState.models[sel.getAttribute('data-provider')] = sel.value; };
    });
  }

  /* ── Pipeline ── */
  function renderPipeline(pipeline) {
    var track = document.getElementById('pipelineTrack');
    if (!track) return;
    var current = (pipeline.stage || 'idle').toUpperCase();
    var idx = STAGES.indexOf(current);

    track.innerHTML = STAGES.map(function(name, i) {
      var cls = 'stage';
      if (i < idx) cls += ' done';
      else if (i === idx) cls += ' active';
      else cls += ' pending';
      return '<div class="' + cls + '" data-stage="' + name.toLowerCase() + '">' +
        name + '<span class="stage-time"></span></div>';
    }).join('');

    /* Sync task input if not focused */
    var taskInput = document.getElementById('taskInput');
    if (taskInput && document.activeElement !== taskInput) {
      taskInput.value = pipeline.task || '';
    }

    /* Update page title */
    document.title = 'CTX \\u00B7 ' + (current !== 'IDLE' ? current : 'Ready');

    renderLeadSelector(pipeline.lead || 'claude');
    attachStageClicks();
  }

  /* ── Agents ── */
  function renderAgents(agents) {
    var body = document.querySelector('#panelAgents .panel-body');
    var badge = document.getElementById('agentCount');
    if (!agents || !agents.length) {
      body.innerHTML = '';
      badge.textContent = '0';
      return;
    }
    badge.textContent = agents.length;

    var cards = agents.map(function(a) {
      var skills = (a.skills || []).slice(0, 5).map(function(s) {
        return '<span class="skill-tag">' + esc(s) + '</span>';
      }).join('');
      var extra = (a.skills || []).length > 5 ? '<span class="skill-tag">+' + ((a.skills||[]).length - 5) + '</span>' : '';

      return '<div class="agent-card" data-status="active">' +
        '<div class="agent-bar"></div>' +
        '<div class="agent-body">' +
          '<div class="agent-top">' +
            '<span class="agent-name">' + esc(a.name || 'unknown') + '</span>' +
            (a.role ? '<span class="agent-role">' + esc(a.role) + '</span>' : '') +
          '</div>' +
          (a.stage ? '<div class="agent-stage">Stage: ' + esc(a.stage) + '</div>' : '') +
          (skills ? '<div class="agent-skills">' + skills + extra + '</div>' : '') +
          '<div class="agent-actions">' +
            '<button class="agent-details-btn" data-id="' + esc(a.id) + '" aria-label="View details for ' + esc(a.name) + '">Details</button>' +
          '</div>' +
        '</div></div>';
    }).join('');

    body.innerHTML = '<div class="agents-grid">' + cards + '</div>';
    
    // Add click handlers for details buttons
    body.querySelectorAll('.agent-details-btn').forEach(function(btn) {
      btn.onclick = function() {
        var aid = btn.getAttribute('data-id');
        apiPost('/api/agent/details', { id: aid }).then(function(r) {
          if (r && r.content) {
            openAgentModal(aid, r.content);
          } else {
            showToast('Agent not found', 'error');
          }
        }).catch(function() { showToast('Connection error', 'error'); });
      };
    });
  }

  /* ── Consilium Presets + Results ── */
  function renderConsilium(consilium, results, pipeline) {
    var body = document.querySelector('#panelConsilium .panel-body');
    var activePreset = (pipeline || {}).activePreset || '';

    // Presets section
    var presetsHtml = '';
    if (consilium && consilium.length) {
      var rows = consilium.map(function(c) {
        var members = (c.providers || c.agents || []).map(function(m) {
          return '<span class="consilium-member">' + esc(m) + '</span>';
        }).join('');
        var type = c.providers && c.providers.length ? 'providers' : 'agents';
        var btnCls = 'preset-activate-btn' + (c.name === activePreset ? ' active-preset' : '');
        return '<div class="consilium-row">' +
          '<div class="consilium-provider">' + esc(c.name || '') +
            ' <span style="color:var(--muted);font-weight:400;font-size:9px">' + type + '</span></div>' +
          (c.description ? '<div class="consilium-desc">' + esc(c.description) + '</div>' : '') +
          (members ? '<div class="consilium-members">' + members + '</div>' : '') +
          '<button class="' + btnCls + '" data-preset="' + esc(c.name || '') + '" type="button">Activate</button>' +
          '</div>';
      }).join('');
      presetsHtml = '<div class="consilium-list">' + rows + '</div>';
    }

    // Results section
    var resultsHtml = '';
    if (results && results.length) {
      var runs = {};
      results.forEach(function(r) {
        var rid = r.runId !== undefined ? r.runId : 0;
        if (!runs[rid]) runs[rid] = [];
        runs[rid].push(r);
      });
      var runIds = Object.keys(runs).map(Number).sort(function(a, b) { return b - a; });
      var runGroups = runIds.map(function(rid) {
        var items = runs[rid];
        var cards = items.map(function(r) {
          var conf = typeof r.confidence === 'number' ? r.confidence : 0;
          var confColor = conf >= 0.8 ? 'var(--green)' : conf >= 0.5 ? 'var(--amber)' : 'var(--red)';
          var pct = Math.round(conf * 100);
          var ts = r.time ? new Date(r.time).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
          var resultText = r.result || '';
          var isLong = resultText.length > 200;
          var tid = 'rt-' + esc(r.provider || '') + '-' + rid;
          var providerName = esc(r.provider || 'unknown');
          
          return '<article class="result-card" aria-labelledby="h-' + tid + '">' +
            '<div class="result-card-header">' +
              '<span class="result-provider-name" data-provider="' + providerName.toLowerCase() + '">' + providerName + '</span>' +
              '<span class="result-task-label" id="h-' + tid + '">' + esc(r.task || 'Response at ' + ts) + '</span>' +
            '</div>' +
            '<div class="result-text" id="' + tid + '" role="region" aria-label="Detailed response from ' + providerName + '">' + esc(resultText) + '</div>' +
            (isLong ? '<button class="expand-btn" data-target="' + tid + '" type="button" aria-expanded="false">Expand response</button>' : '') +
            '<div class="conf-wrap" aria-label="Provider confidence: ' + pct + '%">' +
              '<div class="conf-label" aria-hidden="true">Confidence: ' + pct + '%</div>' +
              '<div class="conf-bar"><div class="conf-fill" style="width:' + pct + '%;background:' + confColor + '"></div></div>' +
            '</div>' +
            '</article>';
        }).join('');
        return '<section class="result-group" aria-label="Consilium run #' + rid + '">' +
          '<div class="result-run-label">Run #' + rid + '</div>' +
          cards + '</section>';
      }).join('');
      resultsHtml = '<div class="results-section"><div class="section-title">Last Run Results</div>' + runGroups + '</div>';
    }

    body.innerHTML = presetsHtml + resultsHtml;
    attachPresetActivate();

    // Expand buttons
    body.querySelectorAll('.expand-btn').forEach(function(btn) {
      btn.onclick = function() {
        var target = document.getElementById(btn.getAttribute('data-target'));
        if (!target) return;
        if (target.classList.contains('expanded')) {
          target.classList.remove('expanded');
          btn.textContent = 'Collapse';
          btn.setAttribute('aria-expanded', 'false');
        } else {
          target.classList.add('expanded');
          btn.textContent = 'Collapse';
          btn.setAttribute('aria-expanded', 'true');
        }
      };
    });
  }

  /* ── Session Progress ── */
  function renderProgress(progress) {
    var body = document.querySelector('#panelLog .panel-body');
    if (!body) return;
    if (!progress || !progress.length) {
      var old = body.querySelector('.progress-section');
      if (old) old.parentNode.removeChild(old);
      return;
    }
    var steps = progress.slice(0, 30).map(function(p, i) {
      var ts = p.ts ? new Date(p.ts).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
      var isErr = p.kind === 'error';
      var cls = 'progress-step' + (isErr ? ' is-error' : ' is-action');
      var detail = p.file ? (p.file + (p.result ? ' \u2192 ' + p.result : '')) : (p.result || '');
      var aid = 'p-step-' + i;
      
      return '<li class="' + cls + '" id="' + aid + '">' +
        '<div class="progress-marker" aria-hidden="true"></div>' +
        '<div class="p-header">' +
          '<time class="p-ts" datetime="' + p.ts + '">' + esc(ts) + '</time>' +
          '<span class="p-kind" aria-label="Type: ' + p.kind + '">' + esc(p.kind) + '</span>' +
          (p.agent ? '<span class="p-agent" aria-label="Agent: ' + p.agent + '">' + esc(p.agent) + '</span>' : '') +
        '</div>' +
        '<div class="p-content" role="status">' + esc(p.agent || p.file || 'Action') + '</div>' +
        (detail ? '<div class="p-detail">' + esc(detail) + '</div>' : '') +
        '</li>';
    }).join('');
    var html = '<div class="progress-section" role="region" aria-label="Recent session activity timeline">' +
      '<div class="section-title">Session Progress</div>' +
      '<ol class="progress-list" role="list">' + steps + '</ol></div>';
    var existing = body.querySelector('.progress-section');
    if (existing) {
      existing.outerHTML = html;
    } else {
      body.insertAdjacentHTML('afterbegin', html);
    }
  }

  /* ── Log ── */
  function renderLog(log) {
    var body = document.querySelector('#panelLog .panel-body');
    var badge = document.getElementById('logCount');
    if (!log || !log.length) {
      var logEntries = body.querySelector('.log-entries');
      if (logEntries) logEntries.innerHTML = '';
      badge.textContent = '0';
      return;
    }
    badge.textContent = log.length;

    var items = log.slice().reverse().map(function(e) {
      try {
        var ts = e.ts ? new Date(e.ts).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
        if (ts === 'Invalid Date') ts = '??:??';
        var action = e.action || '';
        var msg = e.message || e.file || e.result || '';
        return '<li class="log-entry">' +
          '<span class="log-ts">' + esc(ts) + '</span>' +
          (action ? '<span class="log-action">' + esc(action) + '</span>' : '') +
          '<span class="log-msg">' + esc(msg) + '</span>' +
          '</li>';
      } catch (err) {
        return '<li class="log-entry">Error rendering entry</li>';
      }
    }).join('');

    var logEntries = body.querySelector('.log-entries');
    if (!logEntries) {
      logEntries = document.createElement('div');
      logEntries.className = 'log-entries';
      body.appendChild(logEntries);
    }
    logEntries.innerHTML = '<ul class="log-list">' + items + '</ul>';
  }

  /* ── Project Map ── */
  function renderMap(project, pipeline) {
    var body = document.querySelector('#panelMap .panel-body');
    var pairs = [];

    if (project && project.name) {
      pairs.push(['Project', project.name]);
      if (project.stack) {
        var stack = [project.stack.runtime, project.stack.framework].filter(Boolean).join(' + ');
        var langs = (project.stack.lang || []).join(', ');
        if (stack) pairs.push(['Stack', stack]);
        if (langs) pairs.push(['Languages', langs]);
      }
      if (project.git) {
        if (project.git.branch) pairs.push(['Branch', project.git.branch]);
        var commits = (project.git.recentCommits || []).slice(0, 3);
        if (commits.length) pairs.push(['Last commit', commits[0]]);
      }
      var dirs = Object.keys(project.structure || {});
      if (dirs.length) pairs.push(['Directories', dirs.join(', ')]);
    }

    pairs.push(['Stage', pipeline.stage || '\\u2014']);
    if (pipeline.task) pairs.push(['Task', pipeline.task]);
    if (pipeline.lead) pairs.push(['Lead', pipeline.lead]);
    if (pipeline.activePreset) pairs.push(['Preset', pipeline.activePreset]);

    var html = pairs.map(function(p) {
      var val = String(p[1]);
      if (val.length > 100) val = val.slice(0, 97) + '...';
      return '<span class="map-key">' + esc(p[0]) + '</span><span class="map-val">' + esc(val) + '</span>';
    }).join('');

    body.innerHTML = '<div class="map-grid">' + html + '</div>';
  }

  /* ── Render all ── */
  function renderAll(state) {
    console.log('[dashboard] Rendering state:', state);
    try {
      _state = state;
      renderPipeline(state.pipeline || {});
      renderAgents(state.agents || []);
      renderConsilium(state.consilium || [], state.results || [], state.pipeline || {});
      renderProgress(state.progress || []);
      renderLog(state.log || []);
      renderMap(state.project || {}, state.pipeline || {});
    } catch (err) {
      console.error('[dashboard] Render error:', err);
      showToast('Render error: ' + err.message, 'error');
    }
  }

  /* ── Status ── */
  function setStatus(s) {
    var dot = document.getElementById('statusDot');
    var txt = document.getElementById('statusText');
    dot.className = 'status-dot' + (s === 'connected' ? ' live' : s === 'error' ? ' err' : '');
    txt.textContent = s === 'connected' ? 'Live' : s === 'error' ? 'Disconnected' : 'Connecting...';
  }

  /* ── SSE ── */
  function connectSSE() {
    var es = new EventSource('/events');
    es.addEventListener('full', function(e) { renderAll(JSON.parse(e.data)); });
    es.addEventListener('pipeline', function(e) { renderPipeline(JSON.parse(e.data)); });
    es.addEventListener('agents', function(e) { renderAgents(JSON.parse(e.data)); });
    es.addEventListener('log', function(e) { renderLog(JSON.parse(e.data)); });
    es.addEventListener('consilium', function(e) { renderConsilium(JSON.parse(e.data), [], {}); });
    es.onopen = function() { setStatus('connected'); };
    es.onerror = function() { setStatus('error'); es.close(); setTimeout(connectSSE, 3000); };
  }

  /* ── Init interactive controls ── */
  var taskInput = document.getElementById('taskInput');
  var resetBtn = document.getElementById('resetBtn');

  // Open modal on Set button click
  var openModalBtn = document.getElementById('openModalBtn');
  if (openModalBtn) {
    openModalBtn.addEventListener('click', function() {
      openModal(
        taskInput ? taskInput.value : '',
        _state.agents || [],
        _state.skills || [],
        _state.consilium || [],
        (_state.pipeline || {}).lead || 'claude',
        (_state.pipeline || {}).activePreset || ''
      );
    });
  }

  // Create Task from modal
  document.getElementById('modalCreateBtn').addEventListener('click', function() {
    var task = document.getElementById('modalTaskInput').value.trim();
    if (!task) return showToast('Task is required', 'error');
    var body = {
      task: task,
      lead: modalState.lead,
      consiliumPreset: modalState.preset,
      agents: Object.keys(modalState.agents).filter(function(k) { return modalState.agents[k]; }),
      skills: Object.keys(modalState.skills).filter(function(k) { return modalState.skills[k]; }),
      models: Object.assign({}, modalState.models)
    };
    apiPost('/api/pipeline/task', body).then(function(r) {
      if (r && r.ok) { showToast('Task created', 'ok'); closeModal(); }
      else showToast('Error: ' + (r && r.error || 'Unknown'), 'error');
    }).catch(function() { showToast('Connection error', 'error'); });
  });

  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('taskModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      apiPost('/api/pipeline/reset', {}).then(function(r) {
        if (r && r.ok) showToast('Pipeline reset', 'ok');
        else showToast('Error: ' + (r && r.error || 'Unknown'), 'error');
      }).catch(function() { showToast('Connection error', 'error'); });
    });
  }

  document.getElementById('agentModalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('agentModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  /* ── Init ── */
  fetch('/state').then(function(r) { return r.json(); }).then(renderAll).catch(function() {});
  connectSSE();

})();
</script>
</body>
</html>`;
}
