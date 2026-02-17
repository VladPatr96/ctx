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

/* ── Pipeline (ticket rail with clip-path arrows) ── */
.pipeline-wrap{grid-area:pipeline;background:var(--surface);padding:16px 20px}
.pipeline-track{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.stage{
  padding:10px 8px;font-weight:700;font-size:11px;letter-spacing:.06em;
  text-align:center;color:var(--muted);background:var(--surface-2);
  border:1px solid var(--border);position:relative;
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
.pipeline-meta{
  display:flex;gap:24px;margin-top:12px;font-size:12px;color:var(--muted);
}
.pipeline-meta strong{color:var(--text);font-weight:600}

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

/* ── Project Map ── */
.map-panel{grid-area:map}
.map-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px}
.map-key{font-weight:600;color:var(--muted)}
.map-val{color:var(--text);word-break:break-word;font-family:var(--font-mono);font-size:11px}

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
  <header class="dash-header">
    <span class="logo">&#x2B22;</span>
    <h1>CTX Dashboard</h1>
    <div class="status-pill">
      <span class="status-dot" id="statusDot"></span>
      <span id="statusText">Connecting...</span>
    </div>
    <button class="theme-btn" id="themeBtn" title="Toggle theme">&#9681;</button>
  </header>

  <!-- Pipeline -->
  <section class="pipeline-wrap" id="panelPipeline"></section>

  <!-- Agents -->
  <section class="panel agents-panel" id="panelAgents">
    <div class="panel-header">
      <span class="panel-title">Agents</span>
      <span class="panel-badge" id="agentCount">0</span>
    </div>
    <div class="panel-body"></div>
  </section>

  <!-- Consilium -->
  <section class="panel consilium-panel" id="panelConsilium">
    <div class="panel-header">
      <span class="panel-title">Consilium</span>
    </div>
    <div class="panel-body"></div>
  </section>

  <!-- Log -->
  <section class="panel log-panel" id="panelLog">
    <div class="panel-header">
      <span class="panel-title">Timeline</span>
      <span class="panel-badge" id="logCount">0</span>
    </div>
    <div class="panel-body"></div>
  </section>

  <!-- Project Map -->
  <section class="panel map-panel" id="panelMap">
    <div class="panel-header">
      <span class="panel-title">Project</span>
    </div>
    <div class="panel-body"></div>
  </section>
</div>

<script>
(function() {
  'use strict';

  var STAGES = ['DETECT','CONTEXT','TASK','BRAINSTORM','PLAN','EXECUTE','DONE'];

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Theme toggle ── */
  var theme = localStorage.getItem('ctx-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtn').addEventListener('click', function() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ctx-theme', theme);
  });

  /* ── Pipeline ── */
  function renderPipeline(pipeline) {
    var wrap = document.getElementById('panelPipeline');
    var current = (pipeline.stage || 'idle').toUpperCase();
    var idx = STAGES.indexOf(current);

    var stages = STAGES.map(function(name, i) {
      var cls = 'stage';
      if (i < idx) cls += ' done';
      else if (i === idx) cls += ' active';
      else cls += ' pending';
      return '<div class="' + cls + '">' + name + '<span class="stage-time"></span></div>';
    }).join('');

    var meta = '<div class="pipeline-meta">';
    if (pipeline.task) meta += '<span><strong>Task:</strong> ' + esc(pipeline.task) + '</span>';
    if (pipeline.lead) meta += '<span><strong>Lead:</strong> ' + esc(pipeline.lead) + '</span>';
    meta += '</div>';

    wrap.innerHTML = '<div class="pipeline-track">' + stages + '</div>' + meta;

    /* Update page title */
    document.title = 'CTX \\u00B7 ' + (current !== 'IDLE' ? current : 'Ready');
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
        '</div></div>';
    }).join('');

    body.innerHTML = '<div class="agents-grid">' + cards + '</div>';
  }

  /* ── Consilium Presets ── */
  function renderConsilium(consilium) {
    var body = document.querySelector('#panelConsilium .panel-body');
    if (!consilium || !consilium.length) {
      body.innerHTML = '';
      return;
    }

    var rows = consilium.map(function(c) {
      var members = (c.providers || c.agents || []).map(function(m) {
        return '<span class="consilium-member">' + esc(m) + '</span>';
      }).join('');
      var type = c.providers && c.providers.length ? 'providers' : 'agents';
      return '<div class="consilium-row">' +
        '<div class="consilium-provider">' + esc(c.name || '') +
          ' <span style="color:var(--muted);font-weight:400;font-size:9px">' + type + '</span></div>' +
        (c.description ? '<div class="consilium-desc">' + esc(c.description) + '</div>' : '') +
        (members ? '<div class="consilium-members">' + members + '</div>' : '') +
        '</div>';
    }).join('');

    body.innerHTML = '<div class="consilium-list">' + rows + '</div>';
  }

  /* ── Log ── */
  function renderLog(log) {
    var body = document.querySelector('#panelLog .panel-body');
    var badge = document.getElementById('logCount');
    if (!log || !log.length) {
      body.innerHTML = '';
      badge.textContent = '0';
      return;
    }
    badge.textContent = log.length;

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

    body.innerHTML = '<ul class="log-list">' + items + '</ul>';
  }

  /* ── Project Map ── */
  function renderMap(project, pipeline) {
    var body = document.querySelector('#panelMap .panel-body');
    var pairs = [];

    // Project info from index.json
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
      // Structure summary
      var dirs = Object.keys(project.structure || {});
      if (dirs.length) pairs.push(['Directories', dirs.join(', ')]);
    }

    // Pipeline state
    pairs.push(['Stage', pipeline.stage || '\\u2014']);
    if (pipeline.task) pairs.push(['Task', pipeline.task]);
    if (pipeline.lead) pairs.push(['Lead', pipeline.lead]);

    var html = pairs.map(function(p) {
      var val = String(p[1]);
      if (val.length > 100) val = val.slice(0, 97) + '...';
      return '<span class="map-key">' + esc(p[0]) + '</span><span class="map-val">' + esc(val) + '</span>';
    }).join('');

    body.innerHTML = '<div class="map-grid">' + html + '</div>';
  }

  /* ── Render all ── */
  function renderAll(state) {
    renderPipeline(state.pipeline || {});
    renderAgents(state.agents || []);
    renderConsilium(state.consilium || []);
    renderLog(state.log || []);
    renderMap(state.project || {}, state.pipeline || {});
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
    es.addEventListener('consilium', function(e) { renderConsilium(JSON.parse(e.data)); });
    es.onopen = function() { setStatus('connected'); };
    es.onerror = function() { setStatus('error'); es.close(); setTimeout(connectSSE, 3000); };
  }

  /* ── Init ── */
  fetch('/state').then(function(r) { return r.json(); }).then(renderAll).catch(function() {});
  connectSSE();

})();
</script>
</body>
</html>`;
}
