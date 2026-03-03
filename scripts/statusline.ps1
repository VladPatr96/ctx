# Claude Code statusline with 10-dot bars (Windows)
# Reads JSON from stdin and renders a 4-line status block.

$inputData = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputData)) {
    exit 0
}

try {
    $json = $inputData | ConvertFrom-Json
} catch {
    exit 0
}

# ANSI escapes
$e = [char]27
$reset = "$e[0m"
$dim = "$e[2m"
$green = "$e[32m"
$yellow = "$e[33m"
$red = "$e[31m"
$cyan = "$e[36m"
$blue = "$e[34m"

function ClampPercent([double]$value) {
    if ($value -lt 0) { return 0.0 }
    if ($value -gt 100) { return 100.0 }
    return $value
}

function Get-RemainingColor([double]$remainingPct) {
    if ($remainingPct -gt 50) { return $green }
    if ($remainingPct -ge 20) { return $yellow }
    return $red
}

function Get-ContextColor([double]$usedPct) {
    if ($usedPct -lt 50) { return $green }
    if ($usedPct -lt 80) { return $yellow }
    return $red
}

function Build-DotBar([double]$percent, [string]$mode) {
    $pct = ClampPercent $percent
    $filled = [Math]::Round($pct / 10.0, 0, [MidpointRounding]::AwayFromZero)
    if ($filled -lt 0) { $filled = 0 }
    if ($filled -gt 10) { $filled = 10 }
    $empty = 10 - $filled

    $color = if ($mode -eq "remaining") { Get-RemainingColor $pct } else { Get-ContextColor $pct }
    $filledDots = if ($filled -gt 0) { ('●' * $filled) } else { '' }
    $emptyDots = if ($empty -gt 0) { ('○' * $empty) } else { '' }

    return "${color}${filledDots}${reset}${dim}${emptyDots}${reset}"
}

function Format-Countdown([string]$isoUtc) {
    if ([string]::IsNullOrWhiteSpace($isoUtc)) { return "--" }
    try {
        $resetAt = [DateTimeOffset]::Parse($isoUtc)
        $diff = $resetAt - [DateTimeOffset]::UtcNow
        if ($diff.TotalSeconds -le 0) { return "0m" }
        $hours = [int][Math]::Floor($diff.TotalHours)
        $mins = [int][Math]::Floor($diff.TotalMinutes % 60)
        if ($hours -gt 0) { return "${hours}h${mins}m" }
        return "${mins}m"
    } catch {
        return "--"
    }
}

function Format-WeeklyReset([string]$isoUtc) {
    if ([string]::IsNullOrWhiteSpace($isoUtc)) { return "--" }
    try {
        $local = [DateTimeOffset]::Parse($isoUtc).ToLocalTime()
        return $local.ToString("ddd HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
    } catch {
        return "--"
    }
}

# Usage limits (cache for 2 minutes).
$cacheFile = Join-Path $env:TEMP "claude-usage-cache.json"
$cacheTTL = 120

function Get-ClaudeUsage {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $cacheTime = 0

    if (Test-Path $cacheFile) {
        $cacheTime = [DateTimeOffset]::new((Get-Item $cacheFile).LastWriteTimeUtc).ToUnixTimeSeconds()
    }

    if (($now - $cacheTime) -gt $cacheTTL) {
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
        try {
            return Get-Content $cacheFile -Raw | ConvertFrom-Json
        } catch {
            return $null
        }
    }
    return $null
}

# Top line fields from Claude statusline payload.
$dirFull = $json.workspace.current_dir
$dirName = if ($dirFull) { Split-Path $dirFull -Leaf } else { "?" }
$model = if ($json.model.display_name) { [string]$json.model.display_name } else { "?" }

$cost = 0.0
try {
    if ($null -ne $json.cost.total_cost_usd) { $cost = [double]$json.cost.total_cost_usd }
} catch {}
$costFmt = '$' + $cost.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)

$ctxUsed = 0.0
try {
    if ($null -ne $json.context_window.used_percentage) { $ctxUsed = [double]$json.context_window.used_percentage }
} catch {}
$ctxUsed = ClampPercent $ctxUsed
$ctxUsedInt = [int][Math]::Round($ctxUsed, 0, [MidpointRounding]::AwayFromZero)

# Branch.
$branch = ""
if ($dirFull) {
    try {
        $branch = (git -C $dirFull branch --show-current 2>$null)
    } catch {}
}
if ($branch -is [array]) {
    $branch = ($branch | Select-Object -First 1)
}
if ($null -eq $branch) {
    $branch = ""
}
$branch = "$branch".Trim()

# Usage bars.
$usage = Get-ClaudeUsage
$fiveRemaining = 0.0
$weekRemaining = 0.0
$fiveResetLeft = "--"
$weekResetLabel = "--"
$hasUsage = $false

if ($usage -and $usage.five_hour -and $usage.seven_day) {
    $hasUsage = $true
    $fiveUsed = 0.0
    $weekUsed = 0.0
    try {
        if ($null -ne $usage.five_hour.utilization) { $fiveUsed = [double]$usage.five_hour.utilization }
        if ($null -ne $usage.seven_day.utilization) { $weekUsed = [double]$usage.seven_day.utilization }
    } catch {}

    $fiveRemaining = ClampPercent (100.0 - $fiveUsed)
    $weekRemaining = ClampPercent (100.0 - $weekUsed)
    $fiveResetLeft = Format-Countdown ([string]$usage.five_hour.resets_at)
    $weekResetLabel = Format-WeeklyReset ([string]$usage.seven_day.resets_at)
}

$fivePctInt = if ($hasUsage) { [int][Math]::Round($fiveRemaining, 0, [MidpointRounding]::AwayFromZero) } else { $null }
$weekPctInt = if ($hasUsage) { [int][Math]::Round($weekRemaining, 0, [MidpointRounding]::AwayFromZero) } else { $null }

$fiveBar = Build-DotBar -percent $fiveRemaining -mode "remaining"
$weekBar = Build-DotBar -percent $weekRemaining -mode "remaining"
$ctxBar = Build-DotBar -percent $ctxUsed -mode "context"

$fiveColor = Get-RemainingColor $fiveRemaining
$weekColor = Get-RemainingColor $weekRemaining
$ctxColor = Get-ContextColor $ctxUsed
$sep = " ${dim}•${reset} "

$branchChunk = if ($branch) { " ${dim}(${branch})${reset}" } else { "" }
$line1 = "${blue}${dirName}${reset}${branchChunk}${sep}${cyan}${model}${reset}${sep}${green}${costFmt}${reset}"

$fivePctText = if ($hasUsage) { "${fiveColor}${fivePctInt}%${reset}" } else { "${dim}--${reset}" }
$weekPctText = if ($hasUsage) { "${weekColor}${weekPctInt}%${reset}" } else { "${dim}--${reset}" }
$ctxPctText = "${ctxColor}${ctxUsedInt}%${reset}"

$line2 = "5h ${fiveBar} ${fivePctText}  ${dim}${fiveResetLeft}${reset}"
$line3 = "W  ${weekBar} ${weekPctText}  ${dim}${weekResetLabel}${reset}"
$line4 = "ctx${ctxBar} ${ctxPctText}"

$out = @($line1, $line2, $line3, $line4) -join "`n"
Write-Host -NoNewline $out
