---
name: cc-analytics
description: Use when user asks for Claude Code usage stats, weekly analytics, project activity summary, or wants to see what projects were worked on. Triggers on "analytics", "cc stats", "weekly report", "usage stats"
---

# Claude Code Analytics

Generate HTML report of Claude Code usage from `~/.claude/history.jsonl`.

## Data Sources

- **History:** `~/.claude/history.jsonl` — prompts with timestamps and project paths
- **Git:** Remote URLs and commit counts per project

## Output

Single HTML file with terminal aesthetic:
- ASCII art header
- Summary stats (projects, prompts, commits, days)
- Project table with remote links
- ASCII bar chart

## Generation Script

Run this Python script to generate the report. Python 3 is available at `python` (not `python3` on this system).

```python
import json
import os
import subprocess
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path

def get_git_info(path):
    """Get git remote URL and recent commit count for a project path."""
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

# Parse history — handle Windows path (C:\Users\user\.claude\history.jsonl)
history_path = Path.home() / '.claude' / 'history.jsonl'
history = []
if history_path.exists():
    with open(history_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                history.append(json.loads(line))
            except Exception:
                pass

# Filter last N days (default 7)
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

# Collect data — normalize Windows paths
user_home = str(Path.home())
results = []
total_commits = 0
for project, data in projects.items():
    # Normalize path separators for git commands
    norm_path = project.replace('/', os.sep).replace('\\', os.sep)
    remote, commits = get_git_info(norm_path)
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
```

## HTML Template

Use terminal aesthetic with:
- Monospace system fonts: `'Cascadia Code', 'Consolas', 'Courier New', monospace`
- Dark background: `#0d0d0d`
- Muted colors: `#b0b0b0` (text), `#555` (dim), `#4ec9b0` (cyan), `#ce9178` (orange)

## Bar Chart Generation

```python
def make_bar(value, max_val, width=40):
    filled = int((value / max_val) * width)
    return '#' * filled
```

## Usage

1. User asks for analytics: "cc stats", "weekly report", "usage stats"
2. Run Python script to collect data: `python script.py`
3. Generate HTML with template
4. Save to `~/claude-analytics.html`
5. Open in browser: `start "" "$USERPROFILE/claude-analytics.html"`

## Customization

- **Period:** Change `days = 7` to desired range
- **Output path:** Change save location
- **Colors:** Adjust CSS variables
- **Columns:** Add/remove metrics in grid
