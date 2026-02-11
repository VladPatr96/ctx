import json, os, subprocess
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path

def get_git_info(path):
    git_dir = Path(path) / '.git'
    if not Path(path).is_dir() or not git_dir.exists():
        return None, 0
    try:
        result = subprocess.run(['git', '-C', path, 'remote', 'get-url', 'origin'],
                                capture_output=True, text=True, timeout=5)
        remote = result.stdout.strip() if result.returncode == 0 else None
        if remote:
            remote = remote.replace('git@github.com:', 'github.com/').replace('.git', '').replace('https://', '')
        week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        result = subprocess.run(['git', '-C', path, 'rev-list', '--count', f'--since={week_ago}', 'HEAD'],
                                capture_output=True, text=True, timeout=5)
        commits = int(result.stdout.strip()) if result.returncode == 0 else 0
        return remote, commits
    except Exception:
        return None, 0

def make_bar(value, max_val, width=40):
    filled = int((value / max_val) * width) if max_val > 0 else 0
    return '\u2588' * filled

history_path = Path.home() / '.claude' / 'history.jsonl'
history = []
if history_path.exists():
    with open(history_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                history.append(json.loads(line))
            except Exception:
                pass

days = 7
now = datetime.now()
cutoff = (now - timedelta(days=days)).timestamp() * 1000

projects = defaultdict(lambda: {'prompts': [], 'sessions': set()})
for entry in history:
    ts = entry.get('timestamp', 0)
    if ts >= cutoff:
        project = entry.get('project', 'unknown')
        projects[project]['prompts'].append(entry)
        projects[project]['sessions'].add(datetime.fromtimestamp(ts/1000).strftime('%Y-%m-%d'))

user_home = str(Path.home())
results = []
total_commits = 0
for project, data in projects.items():
    remote, commits = get_git_info(project)
    total_commits += commits
    display_name = Path(project).name or project.replace(user_home, '~')
    results.append({
        'name': display_name,
        'folder': project.replace(user_home, '~').replace('\\', '/'),
        'remote': remote,
        'prompts': len(data['prompts']),
        'sessions': len(data['sessions']),
        'commits': commits
    })

results.sort(key=lambda x: -x['prompts'])
max_prompts = results[0]['prompts'] if results else 1
total_prompts = sum(r['prompts'] for r in results)
all_sessions = set()
for p in projects:
    all_sessions.update(projects[p]['sessions'])
total_sessions = len(all_sessions)
start_date = (now - timedelta(days=days)).strftime('%Y-%m-%d')
end_date = now.strftime('%Y-%m-%d')

rows = ''
chart = ''
for i, r in enumerate(results):
    if r['remote']:
        link = f'<a href="https://{r["remote"]}">{r["remote"]}</a>'
    else:
        link = '<span class="dim">local</span>'
    rows += f'''<div class="row">
  <span class="dim">{i+1}.</span>
  <span class="bright">{r['name']}</span>
  <span>{link}</span>
  <span class="cyan">{r['prompts']}</span>
  <span class="orange">{r['commits']}</span>
  <span class="dim">{r['sessions']}d</span>
</div>
'''
    bar = make_bar(r['prompts'], max_prompts)
    chart += f'<div><span class="dim" style="display:inline-block;width:180px">{r["name"]}</span> <span class="cyan">{bar}</span> <span class="bright">{r["prompts"]}</span></div>\n'

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>claude-analytics</title>
  <style>
    body {{
      font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
      background: #0d0d0d;
      color: #b0b0b0;
      font-size: 14px;
      line-height: 1.6;
      padding: 24px;
    }}
    .container {{ max-width: 900px; margin: 0 auto; }}
    .header {{ color: #6a9955; margin-bottom: 24px; }}
    .dim {{ color: #555; }}
    .bright {{ color: #e0e0e0; }}
    .cyan {{ color: #4ec9b0; }}
    .orange {{ color: #ce9178; }}
    .row {{
      display: grid;
      grid-template-columns: 24px 200px 1fr 80px 80px 60px;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #1a1a1a;
    }}
    .row:hover {{ background: #141414; }}
    a {{ color: #555; text-decoration: none; }}
    a:hover {{ color: #888; }}
    .stat-box {{ display: inline-block; margin-right: 32px; }}
    .stat-value {{ font-size: 28px; color: #e0e0e0; }}
    .stat-label {{ color: #555; font-size: 12px; }}
    .section {{ margin: 24px 0; }}
    .section-header {{ color: #555; margin-bottom: 12px; }}
  </style>
</head>
<body>
  <div class="container">
    <pre class="header">
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502   \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557      \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557             \u2502
\u2502  \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d             \u2502
\u2502  \u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557               \u2502
\u2502  \u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255d               \u2502
\u2502  \u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557             \u2502
\u2502   \u255a\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d             \u2502
\u2502   Weekly Analytics Report                                      \u2502
\u2502   {start_date} .. {end_date}                                   \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
</pre>

    <div class="section">
      <div class="stat-box"><div class="stat-value">{len(results)}</div><div class="stat-label">PROJECTS</div></div>
      <div class="stat-box"><div class="stat-value">{total_prompts}</div><div class="stat-label">PROMPTS</div></div>
      <div class="stat-box"><div class="stat-value">{total_commits}</div><div class="stat-label">COMMITS</div></div>
      <div class="stat-box"><div class="stat-value">{total_sessions}</div><div class="stat-label">ACTIVE DAYS</div></div>
    </div>

    <div class="section">
      <div class="section-header">$ cc --list --sort prompts</div>
      <div class="row" style="border-bottom: 1px solid #333;">
        <span class="dim">#</span>
        <span class="dim">PROJECT</span>
        <span class="dim">REMOTE</span>
        <span class="dim">PROMPTS</span>
        <span class="dim">COMMITS</span>
        <span class="dim">DAYS</span>
      </div>
      {rows}
    </div>

    <div class="section">
      <div class="section-header">$ cc --chart prompts</div>
      {chart}
    </div>
  </div>
</body>
</html>'''

out_path = Path.home() / 'claude-analytics.html'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'Report saved to {out_path}')
print(f'Projects: {len(results)}, Prompts: {total_prompts}, Commits: {total_commits}, Days: {total_sessions}')
for r in results:
    print(f'  {r["name"]}: {r["prompts"]} prompts, {r["commits"]} commits, {r["sessions"]}d')
