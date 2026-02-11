---
name: windows-fixer
description: Use when system feels sluggish, apps unresponsive, fans spinning, or user asks about memory/RAM/performance - diagnoses Windows memory and suggests fixes
---

# Windows Fixer

## Diagnostic Commands

Claude Code runs in Git Bash. Use `pwsh -c` for Windows-specific commands.

Run in order, stop when problem found:

```bash
# 1. Quick overview (RAM, CPU)
pwsh -NoProfile -c "Get-CimInstance Win32_OperatingSystem | Select-Object @{N='TotalRAM_GB';E={[math]::Round(\$_.TotalVisibleMemorySize/1MB,1)}}, @{N='FreeRAM_GB';E={[math]::Round(\$_.FreePhysicalMemory/1MB,1)}}, @{N='UsedRAM_Pct';E={[math]::Round(100-(\$_.FreePhysicalMemory/\$_.TotalVisibleMemorySize*100),1)}}"

# 2. Page file (swap) usage
pwsh -NoProfile -c "Get-CimInstance Win32_PageFileUsage | Select-Object Name, @{N='Allocated_MB';E={\$_.AllocatedBaseSize}}, @{N='Used_MB';E={\$_.CurrentUsage}}, @{N='Peak_MB';E={\$_.PeakUsage}}"

# 3. Top memory consumers (MB)
pwsh -NoProfile -c "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 @{N='PID';E={\$_.Id}}, @{N='MB';E={[math]::Round(\$_.WorkingSet64/1MB)}}, @{N='Name';E={\$_.ProcessName}}"

# 4. System uptime
pwsh -NoProfile -c "(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Select-Object Days, Hours, Minutes"

# 5. Dev servers — node processes listening on ports
pwsh -NoProfile -c "Get-NetTCPConnection -State Listen -EA 0 | Where-Object { (Get-Process -Id \$_.OwningProcess -EA 0).ProcessName -eq 'node' } | Select-Object LocalPort, @{N='PID';E={\$_.OwningProcess}}"

# 6. Docker containers running
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null

# 7. Chrome / Electron process count
pwsh -NoProfile -c "@{Chrome=(Get-Process chrome -EA 0).Count; VSCode=(Get-Process 'Code' -EA 0).Count; Docker=(Get-Process 'com.docker*' -EA 0).Count}"

# 8. Disk usage
pwsh -NoProfile -c "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='Used_GB';E={[math]::Round(\$_.Used/1GB,1)}}, @{N='Free_GB';E={[math]::Round(\$_.Free/1GB,1)}}"
```

## Decision Tree

```
RAM Used > 90%? ──────yes──→ CRITICAL: close apps NOW
     |no
     v
Page file > 50% used? ──yes──→ RESTART RECOMMENDED
     |no
     v
High disk I/O? ────────yes──→ MEMORY THRASHING: find the leak
     |no
     v
Uptime > 5 days? ──────yes──→ SCHEDULE RESTART
     |no
     v
Node process > 700MB? ─yes──→ Kill dev servers
     |no
     v
Docker high usage? ────yes──→ docker system prune
     |no
     v
Chrome > 40 processes? ─yes──→ Close tabs or restart Chrome
     |no
     v
SYSTEM OK
```

## Quick Fixes

All commands run from Git Bash:

| Problem | Command |
|---------|---------|
| Kill all node | `pwsh -NoProfile -c "Stop-Process -Name node -Force -EA 0"` |
| Kill port 3000 | `pwsh -NoProfile -c "Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force"` |
| Kill Chrome | `pwsh -NoProfile -c "Stop-Process -Name chrome -Force"` |
| Docker cleanup | `docker system prune -f` |
| Docker stop all | `docker stop $(docker ps -q)` |
| Clear temp files | `rm -rf "$TEMP"/* 2>/dev/null` |
| Clear DNS cache | `pwsh -NoProfile -c "Clear-DnsClientCache"` |
| Restart Explorer | `pwsh -NoProfile -c "Stop-Process -Name explorer -Force; Start-Process explorer"` |
| Full restart | `pwsh -NoProfile -c "Restart-Computer -Force"` |

## Common Memory Hogs

| App | Typical | Leak Signs |
|-----|---------|------------|
| node (dev) | 200-400 MB | > 700 MB, multiple instances |
| chrome | 50-100 MB/tab | > 40 processes |
| Code (VSCode) | 300-600 MB | extensions bloat, grows over time |
| Docker Desktop | 1-4 GB | WSL2 VM grows, containers accumulate |
| python | 50-200 MB | > 500 MB = probable leak |
| Electron apps | 200-400 MB | multiple renderer processes |

## Report Format

```
## Memory Status: [OK/WARNING/CRITICAL]

| Metric | Value | Status |
|--------|-------|--------|
| RAM used | X/Y GB | |
| Page file | X/Y MB | |
| Uptime | X days | |
| Docker containers | X running | |
| Disk free (C:) | X GB | |

**Top Consumers:**
1. app: X MB
2. app: X MB
3. app: X MB

**Issues:** [list or "none"]
**Actions:** [numbered list or "none needed"]
```

## Docker-Specific Diagnostics

```bash
# Container resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Dangling images eating disk
docker image ls --filter "dangling=true" --format "table {{.Repository}}\t{{.Size}}"

# Total Docker disk usage
docker system df

# WSL2 VM memory (Docker Desktop uses WSL2)
pwsh -NoProfile -c "Get-Process vmmem -EA 0 | Select-Object @{N='MB';E={[math]::Round(\$_.WorkingSet64/1MB)}}"
```

## Misconceptions

| Myth | Reality |
|------|---------|
| "High used RAM = problem" | Windows caches aggressively; check available, not free |
| "Memory cleaner apps help" | They flush cache, causing MORE disk I/O later |
| "Page file = always bad" | Page file with low usage = normal Windows behavior |
| "Disable page file for SSD" | Bad idea — apps may crash without page file |
| "Docker Desktop is light" | WSL2 VM (vmmem) can eat 2-8 GB easily |

## Preventive Measures

1. **Restart schedule**: Every 3-5 days, or when page file usage is high
2. **Dev cleanup**: Kill node servers after work session
3. **Docker cleanup**: Run `docker system prune` weekly
4. **Chrome hygiene**: Use tab suspender extension, limit tabs
5. **WSL2 memory limit**: Create `%USERPROFILE%\.wslconfig` with `[wsl2] memory=4GB`
