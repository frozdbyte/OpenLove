<#
.SYNOPSIS
    Finds (and optionally kills) whatever process is listening on a given TCP port.

.DESCRIPTION
    Windows lets an IPv4 (0.0.0.0) and an IPv6 (::) listener share the same port as
    two separate sockets without an EADDRINUSE conflict — which is how a leftover
    `pnpm dev` and a freshly started `pnpm start` can both end up listening on the
    same port at once, with whichever one answers a given connection effectively
    random. This lists every listener on the port (not just the first) so that kind
    of collision is visible instead of silently swallowed.

.PARAMETER Port
    TCP port to inspect. Defaults to 5173 (this project's dev/PORT default).

.PARAMETER Kill
    Stop every process found listening on the port instead of just listing them.

.EXAMPLE
    ./scripts/port.ps1
    ./scripts/port.ps1 -Port 3000
    ./scripts/port.ps1 -Kill
#>
param(
	[int]$Port = 5173,
	[switch]$Kill
)

$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
	Where-Object { $_.LocalPort -eq $Port }

if (-not $connections) {
	Write-Host "Nothing is listening on port $Port." -ForegroundColor Yellow
	exit 0
}

$rows = $connections | ForEach-Object {
	$owningPid = $_.OwningProcess
	$proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
	$cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $owningPid" -ErrorAction SilentlyContinue).CommandLine

	[pscustomobject]@{
		Address     = $_.LocalAddress
		Port        = $_.LocalPort
		PID         = $owningPid
		Process     = $proc.ProcessName
		StartTime   = $proc.StartTime
		CommandLine = $cmd
	}
}

$rows | Format-Table -AutoSize -Wrap

if ($Kill) {
	$pidsToKill = $rows.PID | Sort-Object -Unique
	foreach ($targetPid in $pidsToKill) {
		try {
			Stop-Process -Id $targetPid -Force -Confirm:$false -ErrorAction Stop
			Write-Host "Killed PID $targetPid" -ForegroundColor Green
		} catch {
			Write-Host "Failed to kill PID ${targetPid}: $_" -ForegroundColor Red
		}
	}
} else {
	Write-Host "Run with -Kill to stop the process(es) above, e.g.:" -ForegroundColor Cyan
	Write-Host "  ./scripts/port.ps1 -Port $Port -Kill" -ForegroundColor Cyan
}
