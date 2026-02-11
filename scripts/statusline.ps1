# Claude Code statusline with usage limits (Windows)
# Reads JSON from stdin, outputs formatted statusline with ANSI colors

$input_data = [Console]::In.ReadToEnd()
$json = $input_data | ConvertFrom-Json

# Extract from JSON
$dir_full = $json.workspace.current_dir
$dir_name = if ($dir_full) { Split-Path $dir_full -Leaf } else { "?" }
$model = if ($json.model.display_name) { $json.model.display_name } else { "?" }
$cost = if ($json.cost.total_cost_usd) { $json.cost.total_cost_usd } else { 0 }
$pct = if ($json.context_window.used_percentage) { [int]$json.context_window.used_percentage } else { 0 }

# Git branch
$branch = ""
if ($dir_full -and (Test-Path "$dir_full\.git" -ErrorAction SilentlyContinue)) {
    try {
        $branch = (git -C $dir_full branch --show-current 2>$null)
    } catch {}
}

# Usage limits (cached, refresh every 2 min)
$cacheFile = Join-Path $env:TEMP "claude-usage-cache.json"
$cacheTTL = 120

function Get-ClaudeUsage {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $cacheTime = 0

    if (Test-Path $cacheFile) {
        $cacheTime = [DateTimeOffset]::new((Get-Item $cacheFile).LastWriteTimeUtc).ToUnixTimeSeconds()
    }

    if (($now - $cacheTime) -gt $cacheTTL) {
        # Try to get token from credentials file
        $credFile = Join-Path $env:USERPROFILE ".claude\.credentials.json"
        $token = $null
        if (Test-Path $credFile) {
            try {
                $creds = Get-Content $credFile -Raw | ConvertFrom-Json
                $token = $creds.claudeAiOauth.accessToken
            } catch {}
        }

        if ($token) {
            try {
                $headers = @{
                    "Authorization" = "Bearer $token"
                    "anthropic-beta" = "oauth-2025-04-20"
                    "Accept" = "application/json"
                }
                $response = Invoke-RestMethod -Uri "https://api.anthropic.com/api/oauth/usage" -Headers $headers -TimeoutSec 5
                $response | ConvertTo-Json -Depth 10 | Set-Content $cacheFile -Force
            } catch {}
        }
    }

    if (Test-Path $cacheFile) {
        return Get-Content $cacheFile -Raw | ConvertFrom-Json
    }
    return $null
}

$usage = Get-ClaudeUsage
$fiveHLeft = ""
$weekLeft = ""
$timeLeft = ""

if ($usage -and $usage.five_hour) {
    $fiveHUsed = if ($usage.five_hour.utilization) { $usage.five_hour.utilization } else { 0 }
    $weekUsed = if ($usage.seven_day.utilization) { $usage.seven_day.utilization } else { 0 }
    $fiveHReset = $usage.five_hour.resets_at

    $fiveHLeft = [math]::Max(0, [int](100 - $fiveHUsed))
    $weekLeft = [math]::Max(0, [int](100 - $weekUsed))

    # Time until reset
    if ($fiveHReset) {
        try {
            $resetTime = [DateTimeOffset]::Parse($fiveHReset)
            $diff = $resetTime - [DateTimeOffset]::UtcNow
            if ($diff.TotalSeconds -gt 0) {
                $hours = [int]$diff.TotalHours
                $mins = [int]($diff.TotalMinutes % 60)
                if ($hours -gt 0) {
                    $timeLeft = "${hours}h${mins}m"
                } else {
                    $timeLeft = "${mins}m"
                }
            }
        } catch {}
    }
}

# Format cost
$costFmt = "{0:F2}" -f [double]$cost

# ESC character for ANSI
$e = [char]27

# Colors for context %
if ($pct -lt 50) {
    $pctColor = "$e[32m"   # green
} elseif ($pct -lt 80) {
    $pctColor = "$e[33m"   # yellow
} else {
    $pctColor = "$e[31m"   # red
}

# Color function for usage limits
function Get-UsageColor($val) {
    if ($val -gt 50) { return "$e[0m" }      # white/default
    elseif ($val -gt 20) { return "$e[33m" }  # yellow
    else { return "$e[31m" }                   # red
}

# Build output
$out = ""

# Dir and branch
if ($branch) {
    $out = "$e[34m${dir_name}$e[0m $e[2m(${branch})$e[0m"
} else {
    $out = "$e[34m${dir_name}$e[0m"
}

# Model
$out += " $([char]0x2022) $e[36m${model}$e[0m"

# Usage limits
if ($fiveHLeft -ne "" -and $weekLeft -ne "") {
    $fiveColor = Get-UsageColor $fiveHLeft
    $weekColor = Get-UsageColor $weekLeft
    if ($timeLeft) {
        $out += " $([char]0x2022) ${fiveColor}${timeLeft} ${fiveHLeft}%$e[0m ${weekColor}W${weekLeft}%$e[0m"
    } else {
        $out += " $([char]0x2022) ${fiveColor}5h ${fiveHLeft}%$e[0m ${weekColor}W${weekLeft}%$e[0m"
    }
}

# Cost and context
$out += " $([char]0x2022) $e[32m`$${costFmt}$e[0m $([char]0x2022) ${pctColor}${pct}%$e[0m"

Write-Host -NoNewline $out
