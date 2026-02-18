/**
 * CTX Dashboard — Frontend HTML builder
 * Phase 3: Sidebar navigation + 6 tabs (HQ mode)
 */

export function buildHtml(token) {
  var authToken = token || '';
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CTX Dashboard</title>
<style>
/* ── Theme: Dark ── */
:root,[data-theme="dark"]{
  --bg:#0d0d0f;--surface:#141418;--surface-2:#1c1c22;
  --border:#242429;--border-2:#2e2e35;
  --text:#e8e8ed;--muted:#56565f;--subtle:#3a3a42;
  --accent:#5b8af5;--accent-dim:#2a3f7a;--accent-bg:#111827;
  --cyan:#4de2c5;--green:#3ecf8e;--amber:#f5a623;--red:#f05252;--purple:#9b8afb;
  --font-mono:'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace;
  --font-ui:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
}
[data-theme="light"]{
  --bg:#f5f5f7;--surface:#ffffff;--surface-2:#f0f0f4;
  --border:#e0e0e6;--border-2:#d1d1d8;
  --text:#1a1a1f;--muted:#8e8e9a;--subtle:#b0b0ba;
  --accent:#2563eb;--accent-dim:#bfdbfe;--accent-bg:#eff6ff;
  --cyan:#0d9488;--green:#059669;--amber:#d97706;--red:#dc2626;--purple:#7c3aed;
}

/* ── Reset ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--font-ui);font-size:13px;line-height:1.5;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}

/* ── Dashboard Grid ── */
.dashboard{
  display:grid;height:100vh;
  background:var(--border);gap:1px;
  grid-template-areas:
    "sidebar header"
    "sidebar pipeline"
    "sidebar content";
  grid-template-columns:52px 1fr;
  grid-template-rows:auto auto 1fr;
}

/* ── Sidebar ── */
.sidebar{
  grid-area:sidebar;background:var(--surface);
  display:flex;flex-direction:column;align-items:center;
  padding:8px 0;gap:2px;border-right:1px solid var(--border);
  z-index:10;
}
.nav-item{
  width:40px;height:40px;border-radius:8px;
  display:flex;align-items:center;justify-content:center;
  background:none;border:none;color:var(--muted);cursor:pointer;
  font-size:16px;font-family:var(--font-mono);
  transition:background .15s,color .15s;position:relative;
}
.nav-item:hover{background:var(--surface-2);color:var(--text)}
.nav-item.active{background:var(--accent-bg);color:var(--accent)}
.nav-item.active::after{
  content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);
  width:3px;height:60%;border-radius:0 3px 3px 0;background:var(--accent);
}
.nav-badge{position:absolute;top:4px;right:4px;min-width:14px;height:14px;border-radius:7px;background:var(--red);color:#fff;font-size:9px;font-weight:700;font-family:var(--font-ui);display:flex;align-items:center;justify-content:center;padding:0 3px;opacity:0;transform:scale(0);transition:opacity .2s,transform .2s}
.nav-badge.visible{opacity:1;transform:scale(1)}
.nav-badge.warn{background:var(--amber)}
.nav-badge.info{background:var(--accent)}
.nav-spacer{flex:1}
.nav-item[title]::before{
  content:attr(title);position:absolute;left:52px;top:50%;transform:translateY(-50%);
  background:var(--surface);border:1px solid var(--border);border-radius:6px;
  color:var(--text);font-size:11px;font-family:var(--font-ui);font-weight:600;
  padding:4px 10px;white-space:nowrap;pointer-events:none;opacity:0;
  transition:opacity .15s;z-index:100;
}
.nav-item[title]:hover::before{opacity:1}

/* ── Header ── */
.dash-header{
  grid-area:header;background:var(--surface);
  display:flex;align-items:center;gap:12px;padding:10px 20px;
}
.dash-header h1{font-size:14px;font-weight:700;letter-spacing:-.01em}
.dash-header .logo{font-size:16px;opacity:.7}
.status-pill{display:flex;align-items:center;gap:6px;margin-left:auto;font-size:11px;color:var(--muted)}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--amber)}
.status-dot.live{background:var(--green);box-shadow:0 0 8px var(--green)}
.status-dot.err{background:var(--red)}
.theme-btn{background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);cursor:pointer;padding:4px 8px;font-size:12px;margin-left:8px}
.theme-btn:hover{border-color:var(--border-2);color:var(--text)}

/* ── Pipeline Strip ── */
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
.stage.active{color:var(--text);border-color:var(--accent);background:linear-gradient(90deg,var(--surface-2),#1a2744,var(--surface-2));background-size:200% 100%;animation:beam 2.5s linear infinite}
@keyframes beam{to{background-position:200% 0}}
.stage.pending{color:var(--subtle)}
.stage:hover:not(.active){color:var(--text);border-color:var(--border-2)}
.pipeline-controls{display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap}
.task-form{display:flex;gap:6px;flex:1;min-width:180px}
.task-input{flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font-ui);font-size:12px;padding:6px 10px;outline:none;transition:border-color .15s}
.task-input:focus{border-color:var(--accent)}
.task-input::placeholder{color:var(--muted)}
.action-btn{background:var(--surface-2);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:12px;font-family:var(--font-ui);padding:6px 12px;transition:border-color .15s,background .15s;white-space:nowrap}
.action-btn:hover{border-color:var(--accent);background:var(--accent-bg);color:var(--accent)}
.action-btn.danger:hover{border-color:var(--red);background:rgba(240,82,82,.08);color:var(--red)}
.lead-options{display:flex;gap:4px}
.lead-chip{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.03em;padding:4px 10px;text-transform:uppercase;transition:all .15s;font-family:var(--font-ui)}
.lead-chip:hover{border-color:var(--cyan);color:var(--cyan)}
.lead-chip.active{background:rgba(77,226,197,.08);border-color:var(--cyan);color:var(--cyan)}

/* ── Tab Content ── */
.tab-content{grid-area:content;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.tab-panel{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.tab-panel.hidden{display:none}
.tab-split{display:grid;grid-template-columns:1.3fr 1fr;gap:1px;flex:1;overflow:hidden;background:var(--border)}
.tab-full{flex:1;overflow:hidden;display:flex;flex-direction:column}

/* ── Panel ── */
.panel{background:var(--bg);display:flex;flex-direction:column;overflow:hidden;min-height:0}
.panel-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;gap:6px}
.panel-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.panel-badge{font-size:10px;font-weight:600;color:var(--accent);background:var(--accent-bg);padding:2px 7px;border-radius:4px}
.panel-body{flex:1;overflow-y:auto;padding:12px 16px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
.panel-body:empty::after{content:"No data";color:var(--muted);font-size:12px}

/* ── Agent Cards ── */
.agents-grid{display:flex;flex-direction:column;gap:8px}
.agents-grid-full{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:16px}
.agent-card{display:flex;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;transition:border-color .15s,transform .15s}
.agent-card:hover{border-color:var(--accent-dim);transform:translateY(-1px)}
.agent-bar{width:3px;flex-shrink:0;background:var(--muted)}
.agent-card[data-status="active"] .agent-bar{background:var(--green)}
.agent-card[data-status="busy"] .agent-bar{background:var(--amber);animation:blink-bar .8s step-end infinite}
@keyframes blink-bar{50%{opacity:.3}}
.agent-body{padding:10px 12px;flex:1;min-width:0}
.agent-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.agent-name{font-size:13px;font-weight:600}
.agent-role{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);background:var(--accent-bg);padding:2px 6px;border-radius:3px}
.agent-stage{font-size:11px;color:var(--muted);margin-top:3px}
.agent-skills{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.skill-tag{font-size:10px;padding:2px 7px;border-radius:3px;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);font-family:var(--font-mono)}
.agent-details-btn{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:10px;font-family:var(--font-mono);padding:3px 8px;transition:all .15s;text-transform:uppercase;margin-top:8px}
.agent-details-btn:hover{border-color:var(--accent);color:var(--accent)}

/* ── Consilium ── */
.consilium-panel[data-consensus="consensus"] .panel-header{border-left:3px solid var(--green)}
.consilium-panel[data-consensus="split"] .panel-header{border-left:3px solid var(--amber)}
.consilium-panel[data-consensus="conflict"] .panel-header{border-left:3px solid var(--red)}
.consilium-list{display:flex;flex-direction:column;gap:8px}
.consilium-row{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 12px;opacity:0;animation:fade-row .25s ease forwards}
.consilium-row:nth-child(1){animation-delay:0ms}
.consilium-row:nth-child(2){animation-delay:80ms}
.consilium-row:nth-child(3){animation-delay:120ms}
.consilium-row:nth-child(4){animation-delay:160ms}
.consilium-row:nth-child(5){animation-delay:200ms}
@keyframes fade-row{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.consilium-provider{font-size:11px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.05em}
.consilium-desc{font-size:12px;color:var(--text);margin-top:4px;line-height:1.4}
.consilium-members{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.consilium-member{font-size:10px;padding:2px 7px;border-radius:3px;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);font-family:var(--font-mono)}
.preset-activate-btn{background:none;border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:10px;font-family:var(--font-mono);margin-top:6px;padding:3px 8px;transition:all .15s}
.preset-activate-btn:hover{border-color:var(--cyan);color:var(--cyan)}
.preset-activate-btn.active-preset{border-color:var(--green);color:var(--green);background:rgba(62,207,142,.06)}
.provider-filters{display:flex;gap:4px;flex-wrap:wrap}
.filter-chip{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:10px;font-weight:600;padding:2px 8px;text-transform:uppercase;transition:all .15s;font-family:var(--font-ui)}
.filter-chip:hover{border-color:var(--accent);color:var(--accent)}
.filter-chip.active{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}

/* ── Log & Console ── */
.log-list{list-style:none;display:flex;flex-direction:column;gap:0}
.log-entry{padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;display:flex;gap:8px;align-items:flex-start}
.log-entry.new{animation:log-in .3s ease-out}
@keyframes log-in{from{opacity:0;transform:translateX(-8px);background:var(--accent-bg)}to{opacity:1;transform:none;background:transparent}}
.log-ts{color:var(--subtle);font-family:var(--font-mono);font-size:10px;white-space:nowrap;min-width:60px;padding-top:1px;font-variant-numeric:tabular-nums}
.log-action{font-size:10px;font-weight:600;color:var(--accent);text-transform:uppercase;min-width:56px;padding-top:1px}
.log-msg{color:var(--text);word-break:break-word;flex:1}
.log-entries{display:flex;flex-direction:column}
.console-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.filter-btn{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:10px;font-weight:600;padding:2px 8px;text-transform:uppercase;transition:all .15s;font-family:var(--font-ui)}
.filter-btn:hover{border-color:var(--accent);color:var(--accent)}
.filter-btn.active{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}
.log-search{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:2px 8px;outline:none;width:120px;transition:border-color .15s}
.log-search:focus{border-color:var(--accent)}
.log-search::placeholder{color:var(--muted)}

/* ── Progress Timeline ── */
.progress-section{margin-bottom:16px;padding:12px 16px;background:var(--surface);border-radius:8px;border:1px solid var(--border)}
.progress-list{position:relative;padding-left:20px;list-style:none}
.progress-list::before{content:"";position:absolute;left:5px;top:8px;bottom:8px;width:2px;background:var(--subtle);opacity:.3}
.progress-step{position:relative;padding-bottom:12px;display:flex;flex-direction:column;gap:3px}
.progress-step:last-child{padding-bottom:0}
.progress-marker{position:absolute;left:-20px;top:3px;width:12px;height:12px;border-radius:50%;background:var(--bg);border:2px solid var(--muted);z-index:1;transition:all .2s}
.progress-step.is-action .progress-marker{border-color:var(--green)}
.progress-step.is-error .progress-marker{border-color:var(--red);box-shadow:0 0 6px var(--red)}
.p-header{display:flex;align-items:center;gap:6px}
.p-ts{font-family:var(--font-mono);font-size:10px;color:var(--muted)}
.p-kind{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:1px 5px;border-radius:3px;background:var(--surface-2)}
.progress-step.is-action .p-kind{color:var(--green);background:rgba(62,207,142,.1)}
.progress-step.is-error .p-kind{color:var(--red);background:rgba(240,82,82,.1)}
.p-content{font-size:12px;color:var(--text);font-weight:500}
.p-detail{font-size:11px;color:var(--muted);font-family:var(--font-mono);word-break:break-all}

/* ── Results cards ── */
.results-section{margin-top:16px;border-top:1px solid var(--border);padding-top:12px}
.section-title{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
.result-group{margin-bottom:12px}
.result-run-label{font-size:9px;color:var(--subtle);font-family:var(--font-mono);margin-bottom:4px}
.result-card{background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:6px}
.result-card-header{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.result-provider-name{font-size:11px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.05em}
.result-task-label{font-size:10px;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.result-text{font-size:12px;color:var(--text);line-height:1.4;max-height:60px;overflow:hidden;transition:max-height .3s ease}
.result-text.expanded{max-height:400px}
.expand-btn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:10px;font-family:var(--font-mono);padding:2px 0;margin-top:4px;display:block}
.expand-btn:hover{color:var(--accent)}
.conf-wrap{margin-top:6px}
.conf-label{font-size:9px;color:var(--muted);margin-bottom:2px}
.conf-bar{height:3px;border-radius:2px;background:var(--border);overflow:hidden}
.conf-fill{height:100%;border-radius:2px;transition:width .4s ease}

/* ── Project Map ── */
.map-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px}
.map-key{font-weight:600;color:var(--muted)}
.map-val{color:var(--text);word-break:break-word;font-family:var(--font-mono);font-size:11px}

/* ── Brainstorm / Plan tab ── */
.brainstorm-section{margin-bottom:20px}
.brainstorm-summary{font-size:13px;color:var(--text);line-height:1.6;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:12px 16px}
/* Markdown rendered elements */
.md-h2{font-size:15px;font-weight:700;color:var(--text);margin:12px 0 6px}
.md-h3{font-size:13px;font-weight:700;color:var(--accent);margin:10px 0 4px}
.md-h4{font-size:12px;font-weight:600;color:var(--cyan);margin:8px 0 4px}
.md-p{margin:4px 0}
.md-list{margin:4px 0 4px 18px;list-style:disc}
.md-list li{margin:2px 0}
.md-code{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:8px 12px;font-family:var(--font-mono);font-size:11px;overflow-x:auto;margin:6px 0;white-space:pre}
.md-inline-code{background:var(--surface-2);border-radius:3px;padding:1px 5px;font-family:var(--font-mono);font-size:11px}
.md-link{color:var(--accent);text-decoration:none}
.md-link:hover{text-decoration:underline}
.agent-md-content .md-h2,.agent-md-content .md-h3{margin-top:16px}
.plan-cards{display:flex;flex-direction:column;gap:10px}
.plan-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px 16px;transition:border-color .15s}
.plan-card:hover{border-color:var(--border-2)}
.plan-card.selected-plan{border-color:var(--green);background:linear-gradient(180deg,var(--surface),rgba(62,207,142,.03))}
.plan-card-header{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.plan-name{font-size:13px;font-weight:700;color:var(--text)}
.plan-complexity{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.plan-eta{font-size:10px;color:var(--muted);font-family:var(--font-mono);margin-left:auto}
.plan-approach{font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:8px}
.plan-files{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.plan-pros-cons{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
.plan-pros{font-size:11px;color:var(--green);line-height:1.4}
.plan-cons{font-size:11px;color:var(--amber);line-height:1.4}
.plan-select-btn{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:11px;font-weight:600;padding:4px 14px;transition:all .15s;font-family:var(--font-ui)}
.plan-select-btn:hover{border-color:var(--green);color:var(--green)}
.plan-select-btn.plan-selected{border-color:var(--green);color:var(--green);background:rgba(62,207,142,.08);cursor:default}
/* ── History ── */
.history-list{display:flex;flex-direction:column;gap:4px}
.history-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:12px;transition:border-color .15s}
.history-item:hover{border-color:var(--border-2)}
.history-stage{font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;min-width:60px}
.history-task{flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.history-lead{font-size:10px;color:var(--cyan);font-weight:600;text-transform:uppercase}
.history-time{font-size:10px;color:var(--muted);font-family:var(--font-mono);white-space:nowrap}
.history-restore-btn{background:none;border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:10px;padding:2px 8px;font-family:var(--font-ui);transition:all .15s}
.history-restore-btn:hover{border-color:var(--accent);color:var(--accent)}

/* ── Settings tab ── */
.state-inspector{font-family:var(--font-mono);font-size:10px;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:12px;overflow:auto;max-height:360px;white-space:pre}
.model-select-group{display:flex;flex-direction:column;gap:6px}
.model-select-row{display:flex;align-items:center;gap:10px}
.model-select-label{font-size:11px;color:var(--muted);min-width:72px;text-transform:uppercase;font-weight:600}
.model-select{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;padding:4px 8px;outline:none;flex:1;cursor:pointer}
.model-select:focus{border-color:var(--accent)}

/* ── Modal ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1000;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
.modal-overlay.open{opacity:1;pointer-events:auto}
.modal{background:var(--surface);border:1px solid var(--border-2);border-radius:12px;width:min(640px,96vw);max-height:90vh;overflow-y:auto;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,.5)}
.modal-title{font-size:15px;font-weight:700;margin-bottom:20px}
.modal-field{margin-bottom:16px}
.modal-label{display:block;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.modal-textarea{width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font-ui);font-size:13px;padding:8px 12px;outline:none;resize:vertical;min-height:72px;transition:border-color .15s}
.modal-textarea:focus{border-color:var(--accent)}
.modal-textarea::placeholder{color:var(--muted)}
.chip-group{display:flex;flex-wrap:wrap;gap:6px}
.modal-chip{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;font-size:11px;font-weight:600;padding:4px 10px;text-transform:uppercase;transition:all .15s;font-family:var(--font-ui)}
.modal-chip:hover{border-color:var(--accent);color:var(--accent)}
.modal-chip.selected{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}
.modal-chip.selected-lead{background:rgba(77,226,197,.08);border-color:var(--cyan);color:var(--cyan)}
.checkbox-group{display:flex;flex-direction:column;gap:6px;max-height:120px;overflow-y:auto;padding:2px 0}
.checkbox-item{display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer}
.checkbox-item input{accent-color:var(--accent);cursor:pointer}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}

/* ── Toast ── */
.toast{position:fixed;bottom:20px;right:20px;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;z-index:9999;animation:toast-in .25s ease-out;pointer-events:none}
.toast-ok{background:rgba(62,207,142,.12);border:1px solid var(--green);color:var(--green)}
.toast-error{background:rgba(240,82,82,.12);border:1px solid var(--red);color:var(--red)}
@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* ── Responsive ── */
@media(max-width:900px){
  .dashboard{grid-template-columns:40px 1fr}
  .nav-item{width:32px;height:32px;font-size:13px}
  .tab-split{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}
</style>
</head>
<body>
<div class="dashboard">

  <!-- Sidebar navigation -->
  <nav class="sidebar" id="sidebar" aria-label="Main navigation">
    <button class="nav-item active" data-tab="pipeline" title="Pipeline" type="button">&#9658;<span class="nav-badge" id="badge-pipeline"></span></button>
    <button class="nav-item" data-tab="console" title="Console" type="button">&gt;_<span class="nav-badge" id="badge-console"></span></button>
    <button class="nav-item" data-tab="brainstorm" title="Brainstorm" type="button">&#9672;<span class="nav-badge" id="badge-brainstorm"></span></button>
    <button class="nav-item" data-tab="agents" title="Agents" type="button">&#9673;<span class="nav-badge" id="badge-agents"></span></button>
    <button class="nav-item" data-tab="consilium" title="Consilium" type="button">&#11041;<span class="nav-badge" id="badge-consilium"></span></button>
    <div class="nav-spacer"></div>
    <button class="nav-item" data-tab="settings" title="Settings" type="button">&#9881;</button>
  </nav>

  <!-- Header -->
  <header class="dash-header">
    <span class="logo" aria-hidden="true">&#x2B22;</span>
    <h1>CTX Dashboard</h1>
    <div class="status-pill" aria-live="polite">
      <span class="status-dot" id="statusDot"></span>
      <span id="statusText">Connecting...</span>
    </div>
    <button class="theme-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle dark/light theme">&#9681;</button>
  </header>

  <!-- Pipeline strip — always visible -->
  <section class="pipeline-wrap" id="panelPipeline" aria-label="Pipeline">
    <div id="pipelineTrack" class="pipeline-track"></div>
    <div class="pipeline-controls">
      <div class="task-form">
        <label for="taskInput" class="sr-only">Task description</label>
        <input id="taskInput" class="task-input" type="text" placeholder="Describe task..." autocomplete="off">
        <button class="action-btn" id="openModalBtn" type="button">Set Task</button>
      </div>
      <div id="leadSelector"><div class="lead-options"></div></div>
      <button id="resetBtn" class="action-btn danger" type="button">Reset</button>
    </div>
  </section>

  <!-- Tab content area -->
  <div class="tab-content" id="tabContent">

    <!-- TAB: Pipeline — Agents + Project Map + History -->
    <div class="tab-panel" id="tab-pipeline">
      <div class="tab-split">
        <section class="panel" id="panelAgents">
          <div class="panel-header">
            <span class="panel-title">Agents</span>
            <span class="panel-badge" id="agentCount">0</span>
          </div>
          <div class="panel-body"></div>
        </section>
        <section class="panel" id="panelMap">
          <div class="panel-header">
            <span class="panel-title">Project</span>
          </div>
          <div class="panel-body"></div>
        </section>
      </div>
      <section class="panel" id="panelHistory" style="margin-top:1px">
        <div class="panel-header">
          <span class="panel-title">Task History</span>
          <span class="panel-badge" id="historyCount">0</span>
        </div>
        <div class="panel-body"></div>
      </section>
    </div>

    <!-- TAB: Console — Timeline + Progress -->
    <div class="tab-panel hidden" id="tab-console">
      <section class="panel tab-full" id="panelLog">
        <div class="panel-header">
          <span class="panel-title">Timeline</span>
          <span class="panel-badge" id="logCount">0</span>
          <div class="console-toolbar">
            <button class="filter-btn active" data-filter="all" type="button">All</button>
            <button class="filter-btn" data-filter="error" type="button">Errors</button>
            <button class="filter-btn" data-filter="action" type="button">Actions</button>
            <input class="log-search" id="logSearch" type="search" placeholder="Search...">
          </div>
        </div>
        <div class="panel-body"></div>
      </section>
    </div>

    <!-- TAB: Brainstorm — Summary + Plan variants -->
    <div class="tab-panel hidden" id="tab-brainstorm">
      <section class="panel tab-full" id="panelBrainstorm">
        <div class="panel-header">
          <span class="panel-title">Brainstorm &amp; Plan</span>
        </div>
        <div class="panel-body"></div>
      </section>
    </div>

    <!-- TAB: Agents — Full grid + Skills -->
    <div class="tab-panel hidden" id="tab-agents">
      <section class="panel tab-full" id="panelAgentsFull">
        <div class="panel-header">
          <span class="panel-title">Agents</span>
          <span class="panel-badge" id="agentCountFull">0</span>
        </div>
        <div class="panel-body"></div>
      </section>
    </div>

    <!-- TAB: Consilium — Presets + Results -->
    <div class="tab-panel hidden" id="tab-consilium">
      <section class="panel consilium-panel tab-full" id="panelConsilium">
        <div class="panel-header">
          <span class="panel-title">Consilium</span>
          <div class="provider-filters" id="providerFilters">
            <button class="filter-chip active" data-provider="all" type="button">All</button>
            <button class="filter-chip" data-provider="claude" type="button">Claude</button>
            <button class="filter-chip" data-provider="gemini" type="button">Gemini</button>
            <button class="filter-chip" data-provider="codex" type="button">Codex</button>
            <button class="filter-chip" data-provider="opencode" type="button">OpenCode</button>
          </div>
        </div>
        <div class="panel-body"></div>
      </section>
    </div>

    <!-- TAB: Settings -->
    <div class="tab-panel hidden" id="tab-settings">
      <section class="panel tab-full" id="panelSettings">
        <div class="panel-header">
          <span class="panel-title">Settings</span>
        </div>
        <div class="panel-body"></div>
      </section>
    </div>

  </div><!-- end tab-content -->
</div><!-- end .dashboard -->

<!-- Task Creation Modal -->
<div class="modal-overlay" id="taskModal" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal-title">New Task</div>
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
<div class="modal-overlay" id="agentModal" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal-title" id="agentModalTitle">Agent</div>
    <div class="modal-field">
      <div id="agentModalContent" style="white-space:pre-wrap;font-family:var(--font-mono);font-size:11px;max-height:400px;overflow-y:auto;background:var(--surface-2);padding:12px;border:1px solid var(--border);border-radius:6px;color:var(--muted)"></div>
    </div>
    <div class="modal-actions">
      <button class="action-btn" id="agentModalCloseBtn" type="button">Close</button>
    </div>
  </div>
</div>

<script>
(function() {
  'use strict';

  var AUTH_TOKEN = '${authToken}';
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
  var currentTab = localStorage.getItem('ctx-tab') || 'pipeline';
  var consoleFilter = 'all';
  var consoleSearch = '';
  var consiliumProviderFilter = 'all';

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /** Mini markdown → HTML renderer. Supports: headers, bold, italic, code, inline code, lists, links */
  function miniMd(s) {
    var text = esc(s);
    var lines = text.split('\n');
    var html = [];
    var inList = false;
    var inCode = false;
    var codeLines = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Fenced code blocks
      if (/^\x60\x60\x60/.test(line)) {
        if (inCode) {
          html.push('<pre class="md-code">' + codeLines.join('\n') + '</pre>');
          codeLines = [];
          inCode = false;
        } else {
          if (inList) { html.push('</ul>'); inList = false; }
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      // Close list if line is not a list item
      if (inList && !/^\s*[-*]\s/.test(line)) { html.push('</ul>'); inList = false; }

      // Headers
      if (/^### /.test(line)) { html.push('<h4 class="md-h4">' + inlineMd(line.slice(4)) + '</h4>'); continue; }
      if (/^## /.test(line)) { html.push('<h3 class="md-h3">' + inlineMd(line.slice(3)) + '</h3>'); continue; }
      if (/^# /.test(line)) { html.push('<h2 class="md-h2">' + inlineMd(line.slice(2)) + '</h2>'); continue; }

      // List items
      if (/^\s*[-*]\s/.test(line)) {
        if (!inList) { html.push('<ul class="md-list">'); inList = true; }
        html.push('<li>' + inlineMd(line.replace(/^\s*[-*]\s/, '')) + '</li>');
        continue;
      }

      // Empty lines
      if (!line.trim()) { html.push(''); continue; }

      // Regular paragraph
      html.push('<p class="md-p">' + inlineMd(line) + '</p>');
    }
    if (inCode && codeLines.length) html.push('<pre class="md-code">' + codeLines.join('\n') + '</pre>');
    if (inList) html.push('</ul>');
    return html.join('\n');
  }

  function inlineMd(s) {
    return s
      .replace(/\x60([^\x60]+)\x60/g, '<code class="md-inline-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
  }

  function apiPost(path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
    return fetch(path, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  function showToast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type === 'error' ? 'error' : 'ok');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 2500);
  }

  /* ── Theme ── */
  var theme = localStorage.getItem('ctx-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtn').addEventListener('click', function() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ctx-theme', theme);
  });

  /* ── Tab switching ── */
  function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(function(p) {
      p.classList.toggle('hidden', p.id !== 'tab-' + tabId);
    });
    document.querySelectorAll('.nav-item[data-tab]').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    currentTab = tabId;
    localStorage.setItem('ctx-tab', tabId);
    document.title = 'CTX \u00B7 ' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
  }

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

  /* ── Preset activate ── */
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

    var agentChecks = document.getElementById('modalAgentChecks');
    if (agentChecks) {
      agentChecks.innerHTML = (agents || []).map(function(a) {
        var aid = a.id || a.name;
        var checked = modalState.agents[aid] ? ' checked' : '';
        return '<label class="checkbox-item"><input type="checkbox" data-agent="' + esc(aid) + '"' + checked + '> ' + esc(a.name || a.id) + '</label>';
      }).join('');
      agentChecks.querySelectorAll('input[type=checkbox]').forEach(function(chk) {
        chk.onchange = function() { modalState.agents[chk.getAttribute('data-agent')] = chk.checked; };
      });
    }

    var skillChecks = document.getElementById('modalSkillChecks');
    if (skillChecks) {
      skillChecks.innerHTML = (skills || []).map(function(s) {
        var checked = modalState.skills[s] ? ' checked' : '';
        return '<label class="checkbox-item"><input type="checkbox" data-skill="' + esc(s) + '"' + checked + '> ' + esc(s) + '</label>';
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
    var el = document.getElementById('agentModalContent');
    el.innerHTML = '<div class="agent-md-content">' + miniMd(content) + '</div>';
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
      return '<div class="model-select-row"><span class="model-select-label">' + esc(p) + '</span><select class="model-select" data-provider="' + esc(p) + '">' + opts + '</select></div>';
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
      return '<div class="' + cls + '" data-stage="' + name.toLowerCase() + '">' + name + '<span class="stage-time"></span></div>';
    }).join('');
    var taskInput = document.getElementById('taskInput');
    if (taskInput && document.activeElement !== taskInput) taskInput.value = pipeline.task || '';
    renderLeadSelector(pipeline.lead || 'claude');
    attachStageClicks();
  }

  /* ── Task History ── */
  function renderHistory(pipeline) {
    var body = document.querySelector('#panelHistory .panel-body');
    var badge = document.getElementById('historyCount');
    if (!body) return;
    var history = (pipeline && pipeline._history) || [];
    if (badge) badge.textContent = history.length;
    if (!history.length) {
      body.innerHTML = '<span style="color:var(--muted);font-size:12px">No task history yet. History is saved on pipeline reset.</span>';
      return;
    }
    var items = history.slice().reverse().map(function(h) {
      var time = h.resetAt ? new Date(h.resetAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      return '<div class="history-item">' +
        '<span class="history-stage">' + esc(h.stage || '') + '</span>' +
        '<span class="history-task">' + esc(h.task || '(no task)') + '</span>' +
        '<span class="history-lead">' + esc(h.lead || '') + '</span>' +
        '<span class="history-time">' + esc(time) + '</span>' +
        '<button class="history-restore-btn" data-task="' + esc(h.task || '') + '" type="button">Restore</button>' +
        '</div>';
    }).join('');
    body.innerHTML = '<div class="history-list">' + items + '</div>';
    body.querySelectorAll('.history-restore-btn').forEach(function(btn) {
      btn.onclick = function() {
        var task = btn.getAttribute('data-task');
        if (!task) return;
        var taskInput = document.getElementById('taskInput');
        if (taskInput) taskInput.value = task;
        showToast('Task restored to input', 'ok');
        switchTab('pipeline');
      };
    });
  }

  /* ── Agents (compact — Pipeline tab) ── */
  function renderAgents(agents) {
    var body = document.querySelector('#panelAgents .panel-body');
    var badge = document.getElementById('agentCount');
    if (!body) return;
    badge.textContent = (agents || []).length;
    if (!agents || !agents.length) { body.innerHTML = ''; return; }
    var cards = agents.map(function(a) {
      var skills = (a.skills || []).slice(0, 4).map(function(s) {
        return '<span class="skill-tag">' + esc(s) + '</span>';
      }).join('');
      return '<div class="agent-card" data-status="active">' +
        '<div class="agent-bar"></div><div class="agent-body">' +
        '<div class="agent-top"><span class="agent-name">' + esc(a.name || '') + '</span>' +
        (a.role ? '<span class="agent-role">' + esc(a.role) + '</span>' : '') + '</div>' +
        (a.stage ? '<div class="agent-stage">' + esc(a.stage) + '</div>' : '') +
        (skills ? '<div class="agent-skills">' + skills + '</div>' : '') +
        '</div></div>';
    }).join('');
    body.innerHTML = '<div class="agents-grid">' + cards + '</div>';
  }

  /* ── Agents Full (Agents tab) ── */
  function renderAgentsFull(agents, skills, pipeline) {
    var body = document.querySelector('#panelAgentsFull .panel-body');
    var badge = document.getElementById('agentCountFull');
    if (!body) return;
    if (badge) badge.textContent = (agents || []).length;
    var activeAgents = (pipeline || {}).activeAgents || [];
    var cardsHtml = '';
    if (agents && agents.length) {
      var cards = agents.map(function(a) {
        var aid = a.id || a.name;
        var isActive = activeAgents.indexOf(aid) !== -1;
        var skillTags = (a.skills || []).map(function(s) {
          return '<span class="skill-tag">' + esc(s) + '</span>';
        }).join('');
        return '<div class="agent-card" data-status="' + (isActive ? 'active' : 'idle') + '">' +
          '<div class="agent-bar"></div><div class="agent-body">' +
          '<div class="agent-top"><span class="agent-name">' + esc(a.name || '') + '</span>' +
          (a.role ? '<span class="agent-role">' + esc(a.role) + '</span>' : '') +
          (isActive ? '<span class="agent-role" style="color:var(--green);background:rgba(62,207,142,.08)">ACTIVE</span>' : '') +
          '</div>' +
          (a.stage ? '<div class="agent-stage">' + esc(a.stage) + '</div>' : '') +
          (skillTags ? '<div class="agent-skills">' + skillTags + '</div>' : '') +
          '<button class="agent-details-btn" data-agent-id="' + esc(aid) + '" type="button">Details</button>' +
          '</div></div>';
      }).join('');
      cardsHtml = '<div class="agents-grid-full">' + cards + '</div>';
    }
    var skillsHtml = '';
    if (skills && skills.length) {
      skillsHtml = '<div class="brainstorm-section">' +
        '<div class="section-title">Skill Registry (' + skills.length + ')</div>' +
        '<div class="chip-group">' +
        skills.map(function(s) { return '<span class="skill-tag" style="padding:4px 10px">' + esc(s) + '</span>'; }).join('') +
        '</div></div>';
    }
    body.innerHTML = cardsHtml + skillsHtml;
    body.querySelectorAll('.agent-details-btn').forEach(function(btn) {
      btn.onclick = function() {
        var id = btn.getAttribute('data-agent-id');
        apiPost('/api/agent/details', { id: id }).then(function(r) {
          if (r && r.content) openAgentModal(id, r.content);
          else showToast('Agent details not found', 'error');
        }).catch(function() { showToast('Connection error', 'error'); });
      };
    });
  }

  /* ── Consilium + Results ── */
  function renderConsilium(consilium, results, pipeline) {
    var body = document.querySelector('#panelConsilium .panel-body');
    if (!body) return;
    var activePreset = (pipeline || {}).activePreset || '';

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

    var resultsHtml = '';
    if (results && results.length) {
      var filtered = consiliumProviderFilter === 'all' ? results :
        results.filter(function(r) { return (r.provider || '').toLowerCase() === consiliumProviderFilter; });
      if (filtered.length) {
        var runs = {};
        filtered.forEach(function(r) {
          var rid = r.runId !== undefined ? r.runId : 0;
          if (!runs[rid]) runs[rid] = [];
          runs[rid].push(r);
        });
        var runIds = Object.keys(runs).map(Number).sort(function(a, b) { return b - a; });
        var runGroups = runIds.map(function(rid) {
          var cards = runs[rid].map(function(r) {
            var conf = typeof r.confidence === 'number' ? r.confidence : 0;
            var confColor = conf >= 0.8 ? 'var(--green)' : conf >= 0.5 ? 'var(--amber)' : 'var(--red)';
            var pct = Math.round(conf * 100);
            var ts = r.time ? new Date(r.time).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
            var resultText = r.result || '';
            var isLong = resultText.length > 200;
            var tid = 'rt-' + esc(r.provider || 'x') + '-' + rid;
            return '<div class="result-card">' +
              '<div class="result-card-header">' +
              '<span class="result-provider-name">' + esc(r.provider || '') + '</span>' +
              '<span class="result-task-label">' + esc(r.task || ts) + '</span>' +
              '</div>' +
              '<div class="result-text" id="' + tid + '">' + miniMd(resultText) + '</div>' +
              (isLong ? '<button class="expand-btn" data-target="' + tid + '" type="button">expand</button>' : '') +
              '<div class="conf-wrap"><div class="conf-label">Confidence: ' + pct + '%</div>' +
              '<div class="conf-bar"><div class="conf-fill" style="width:' + pct + '%;background:' + confColor + '"></div></div></div>' +
              '</div>';
          }).join('');
          return '<div class="result-group"><div class="result-run-label">Run #' + rid + '</div>' + cards + '</div>';
        }).join('');
        resultsHtml = '<div class="results-section"><div class="section-title">Last Run Results</div>' + runGroups + '</div>';
      }
    }

    body.innerHTML = presetsHtml + resultsHtml;
    attachPresetActivate();
    body.querySelectorAll('.expand-btn').forEach(function(btn) {
      btn.onclick = function() {
        var target = document.getElementById(btn.getAttribute('data-target'));
        if (!target) return;
        if (target.classList.contains('expanded')) {
          target.classList.remove('expanded');
          btn.textContent = 'expand';
        } else {
          target.classList.add('expanded');
          btn.textContent = 'collapse';
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
    var steps = progress.slice(0, 20).map(function(p, i) {
      var ts = p.ts ? new Date(p.ts).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
      var isErr = p.kind === 'error';
      var cls = 'progress-step ' + (isErr ? 'is-error' : 'is-action');
      var detail = p.file ? (p.file + (p.result ? ' \u2192 ' + p.result : '')) : (p.result || '');
      return '<li class="' + cls + '">' +
        '<div class="progress-marker" aria-hidden="true"></div>' +
        '<div class="p-header">' +
        '<span class="p-ts">' + esc(ts) + '</span>' +
        '<span class="p-kind">' + esc(p.kind) + '</span>' +
        (p.agent ? '<span style="font-size:11px;color:var(--text);font-weight:600">' + esc(p.agent) + '</span>' : '') +
        '</div>' +
        '<div class="p-content">' + esc(p.agent || p.file || p.kind) + '</div>' +
        (detail ? '<div class="p-detail">' + esc(detail) + '</div>' : '') +
        '</li>';
    }).join('');
    var html = '<div class="progress-section"><div class="section-title">Session Progress</div><ol class="progress-list">' + steps + '</ol></div>';
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
    if (!body) return;
    badge.textContent = (log || []).length;
    if (!log || !log.length) {
      var logEntries = body.querySelector('.log-entries');
      if (logEntries) logEntries.innerHTML = '';
      return;
    }
    var items = log.slice().reverse().map(function(e) {
      var ts = e.ts ? new Date(e.ts).toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
      var action = e.action || '';
      var msg = e.message || e.file || e.result || '';
      return '<li class="log-entry">' +
        '<span class="log-ts">' + esc(ts) + '</span>' +
        (action ? '<span class="log-action">' + esc(action) + '</span>' : '') +
        '<span class="log-msg">' + esc(msg) + '</span>' +
        '</li>';
    }).join('');
    var logEntries = body.querySelector('.log-entries');
    if (!logEntries) {
      logEntries = document.createElement('div');
      logEntries.className = 'log-entries';
      body.appendChild(logEntries);
    }
    logEntries.innerHTML = '<ul class="log-list">' + items + '</ul>';
  }

  /* ── Console filters ── */
  function applyConsoleFilters() {
    document.querySelectorAll('#panelLog .log-entry').forEach(function(entry) {
      var action = (entry.querySelector('.log-action') || {}).textContent || '';
      var msg = (entry.querySelector('.log-msg') || {}).textContent || '';
      var matchFilter = consoleFilter === 'all' ||
        (consoleFilter === 'error' && action.toLowerCase().indexOf('error') !== -1) ||
        (consoleFilter === 'action' && action.toLowerCase().indexOf('error') === -1 && action !== '');
      var matchSearch = !consoleSearch || msg.toLowerCase().indexOf(consoleSearch) !== -1 || action.toLowerCase().indexOf(consoleSearch) !== -1;
      entry.style.display = (matchFilter && matchSearch) ? '' : 'none';
    });
  }

  /* ── Brainstorm & Plan ── */
  function renderBrainstorm(brainstorm, plan) {
    var body = document.querySelector('#panelBrainstorm .panel-body');
    if (!body) return;
    var html = '';

    if (brainstorm && brainstorm.summary) {
      html += '<div class="brainstorm-section"><div class="section-title">Brainstorm Summary</div>' +
        '<div class="brainstorm-summary">' + miniMd(brainstorm.summary) + '</div></div>';
    }

    if (plan && plan.variants && plan.variants.length) {
      var selectedId = plan.selected || 0;
      var varCards = plan.variants.map(function(v) {
        var isSelected = v.id === selectedId;
        var complexColor = v.complexity === 'low' ? 'var(--green)' : v.complexity === 'medium' ? 'var(--amber)' : 'var(--red)';
        var files = (v.files || []).slice(0, 8).map(function(f) {
          return '<span class="skill-tag">' + esc(f) + '</span>';
        }).join('');
        var btnCls = 'plan-select-btn' + (isSelected ? ' plan-selected' : '');
        return '<div class="plan-card' + (isSelected ? ' selected-plan' : '') + '">' +
          '<div class="plan-card-header">' +
          '<span class="plan-name">' + esc(v.name || '') + '</span>' +
          '<span class="plan-complexity" style="color:' + complexColor + '">' + esc(v.complexity || '') + '</span>' +
          '<span class="plan-eta">' + esc(v.eta || '') + '</span>' +
          '</div>' +
          (v.approach ? '<div class="plan-approach">' + miniMd(v.approach) + '</div>' : '') +
          (files ? '<div class="plan-files">' + files + '</div>' : '') +
          '<div class="plan-pros-cons">' +
          (v.pros ? '<div class="plan-pros">\u2713 ' + esc(v.pros) + '</div>' : '') +
          (v.cons ? '<div class="plan-cons">\u2717 ' + esc(v.cons) + '</div>' : '') +
          '</div>' +
          '<button class="' + btnCls + '" data-variant="' + v.id + '" type="button">' +
          (isSelected ? 'Selected' : 'Select') +
          '</button></div>';
      }).join('');
      html += '<div class="brainstorm-section"><div class="section-title">Plan Variants</div>' +
        '<div class="plan-cards">' + varCards + '</div></div>';
    }

    if (plan && plan.consilium && plan.consilium.synthesis) {
      html += '<div class="brainstorm-section"><div class="section-title">Consilium Synthesis</div>' +
        '<div class="brainstorm-summary">' + miniMd(plan.consilium.synthesis) + '</div></div>';
    }

    body.innerHTML = html || '<span style="color:var(--muted);font-size:12px">No brainstorm data. Use /ctx brainstorm to start.</span>';

    body.querySelectorAll('.plan-select-btn:not(.plan-selected)').forEach(function(btn) {
      btn.onclick = function() {
        var v = parseInt(btn.getAttribute('data-variant'));
        apiPost('/api/pipeline/plan', { selected: v }).then(function(r) {
          if (r && r.ok) showToast('Variant ' + v + ' selected', 'ok');
          else showToast('Error: ' + (r && r.error || 'Unknown'), 'error');
        }).catch(function() { showToast('Connection error', 'error'); });
      };
    });
  }

  /* ── Project Map ── */
  function renderMap(project, pipeline) {
    var body = document.querySelector('#panelMap .panel-body');
    if (!body) return;
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
        var commits = (project.git.recentCommits || []).slice(0, 1);
        if (commits.length) pairs.push(['Last commit', commits[0]]);
      }
      var dirs = Object.keys(project.structure || {});
      if (dirs.length) pairs.push(['Dirs', dirs.slice(0,4).join(', ')]);
    }
    pairs.push(['Stage', pipeline.stage || '\u2014']);
    if (pipeline.task) pairs.push(['Task', pipeline.task]);
    if (pipeline.lead) pairs.push(['Lead', pipeline.lead]);
    if (pipeline.activePreset) pairs.push(['Preset', pipeline.activePreset]);
    if ((pipeline.activeAgents || []).length) pairs.push(['Agents', pipeline.activeAgents.join(', ')]);
    var html = pairs.map(function(p) {
      var val = String(p[1]);
      if (val.length > 80) val = val.slice(0, 77) + '...';
      return '<span class="map-key">' + esc(p[0]) + '</span><span class="map-val">' + esc(val) + '</span>';
    }).join('');
    body.innerHTML = '<div class="map-grid">' + html + '</div>';
  }

  /* ── Settings ── */
  function renderSettings(state) {
    var body = document.querySelector('#panelSettings .panel-body');
    if (!body) return;
    var pipeline = state.pipeline || {};
    var modelsHtml = '<div class="brainstorm-section"><div class="section-title">Models per Provider</div>' +
      '<div class="model-select-group">' +
      PROVIDERS.map(function(p) {
        var models = MODELS[p] || [];
        var currentModel = (pipeline.models || {})[p] || models[0] || '';
        var opts = models.map(function(m) {
          return '<option value="' + esc(m) + '"' + (m === currentModel ? ' selected' : '') + '>' + esc(m) + '</option>';
        }).join('');
        return '<div class="model-select-row"><span class="model-select-label">' + esc(p) + '</span>' +
          '<select class="model-select" data-settings-provider="' + esc(p) + '">' + opts + '</select></div>';
      }).join('') + '</div></div>';

    var inspectorHtml = '<div class="brainstorm-section"><div class="section-title">Raw State</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:8px">' +
      '<button class="action-btn" id="copyStateBtn" type="button">Copy JSON</button>' +
      '<button class="action-btn" id="refreshStateBtn" type="button">Refresh</button>' +
      '</div>' +
      '<pre class="state-inspector">' + esc(JSON.stringify(state, null, 2)) + '</pre></div>';

    body.innerHTML = modelsHtml + inspectorHtml;

    body.querySelectorAll('.model-select[data-settings-provider]').forEach(function(sel) {
      sel.onchange = function() {
        var provider = sel.getAttribute('data-settings-provider');
        var models = Object.assign({}, ((_state.pipeline || {}).models || {}));
        models[provider] = sel.value;
        var task = (_state.pipeline || {}).task || '';
        if (!task) { showToast('Set a task first', 'error'); return; }
        apiPost('/api/pipeline/task', { task: task, models: models }).then(function(r) {
          if (r && r.ok) showToast('Model updated', 'ok');
        }).catch(function() {});
      };
    });

    var copyBtn = document.getElementById('copyStateBtn');
    if (copyBtn) {
      copyBtn.onclick = function() {
        navigator.clipboard.writeText(JSON.stringify(_state, null, 2)).then(function() {
          showToast('Copied!', 'ok');
        }).catch(function() { showToast('Copy failed', 'error'); });
      };
    }
    var refreshBtn = document.getElementById('refreshStateBtn');
    if (refreshBtn) {
      refreshBtn.onclick = function() {
        fetch('/state').then(function(r) { return r.json(); }).then(function(s) {
          renderAll(s);
          showToast('Refreshed', 'ok');
        }).catch(function() { showToast('Error', 'error'); });
      };
    }
  }

  /* ── Render all ── */
  /* ── Notification Badges ── */
  var seenCounts = { console: 0, consilium: 0, brainstorm: 0 };

  function setBadge(tabId, count, cls) {
    var el = document.getElementById('badge-' + tabId);
    if (!el) return;
    if (count > 0 && currentTab !== tabId) {
      el.textContent = count > 99 ? '99+' : count;
      el.className = 'nav-badge visible' + (cls ? ' ' + cls : '');
    } else {
      el.className = 'nav-badge';
    }
  }

  function updateBadges(state) {
    // Console: count errors
    var errors = ((state.log || []).filter(function(e) { return e.action === 'error'; })).length;
    var errorDelta = errors - (seenCounts.console || 0);
    setBadge('console', errorDelta > 0 ? errorDelta : 0, '');

    // Consilium: count results
    var resultCount = (state.results || []).length;
    var resultDelta = resultCount - (seenCounts.consilium || 0);
    setBadge('consilium', resultDelta > 0 ? resultDelta : 0, 'info');

    // Brainstorm: show if plan changed
    var planSel = state.plan && state.plan.selected ? 1 : 0;
    var bsSel = seenCounts.brainstorm || 0;
    setBadge('brainstorm', planSel > bsSel ? 1 : 0, 'warn');
  }

  // Clear badge when switching to that tab
  var origSwitchTab = switchTab;
  switchTab = function(tabId) {
    origSwitchTab(tabId);
    if (tabId === 'console') seenCounts.console = ((_state.log || []).filter(function(e) { return e.action === 'error'; })).length;
    if (tabId === 'consilium') seenCounts.consilium = (_state.results || []).length;
    if (tabId === 'brainstorm') seenCounts.brainstorm = _state.plan && _state.plan.selected ? 1 : 0;
    setBadge(tabId, 0);
  };

  function renderAll(state) {
    _state = state;
    renderPipeline(state.pipeline || {});
    renderAgents(state.agents || []);
    renderAgentsFull(state.agents || [], state.skills || [], state.pipeline || {});
    renderConsilium(state.consilium || [], state.results || [], state.pipeline || {});
    renderProgress(state.progress || []);
    renderLog(state.log || []);
    renderMap(state.project || {}, state.pipeline || {});
    renderBrainstorm(state.brainstorm, state.plan);
    renderHistory(state.pipeline || {});
    renderSettings(state);
    updateBadges(state);
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

  /* ── Init ── */

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-tab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // Provider filter for Consilium
  document.querySelectorAll('#providerFilters .filter-chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      consiliumProviderFilter = btn.getAttribute('data-provider');
      document.querySelectorAll('#providerFilters .filter-chip').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-provider') === consiliumProviderFilter);
      });
      renderConsilium(_state.consilium || [], _state.results || [], _state.pipeline || {});
    });
  });

  // Console filters
  document.querySelectorAll('.filter-btn[data-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      consoleFilter = btn.getAttribute('data-filter');
      document.querySelectorAll('.filter-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-filter') === consoleFilter);
      });
      applyConsoleFilters();
    });
  });
  var logSearch = document.getElementById('logSearch');
  if (logSearch) {
    logSearch.addEventListener('input', function() {
      consoleSearch = logSearch.value.toLowerCase();
      applyConsoleFilters();
    });
  }

  // Set Task modal
  var openModalBtn = document.getElementById('openModalBtn');
  var taskInput = document.getElementById('taskInput');
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

  document.getElementById('agentModalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('agentModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  // Reset
  var resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      apiPost('/api/pipeline/reset', {}).then(function(r) {
        if (r && r.ok) showToast('Pipeline reset', 'ok');
        else showToast('Error: ' + (r && r.error || 'Unknown'), 'error');
      }).catch(function() { showToast('Connection error', 'error'); });
    });
  }

  // Restore saved tab
  switchTab(currentTab);

  // Boot
  fetch('/state').then(function(r) { return r.json(); }).then(renderAll).catch(function() {});
  connectSSE();

})();
</script>
</body>
</html>`;
}
