# PowerShell Publish Script for OpenLove Multi-Arch Image with Podman
param (
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

if (-not $Version) {
    if (Test-Path "package.json") {
        $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
        $Version = $pkg.version
    } else {
        Write-Error "package.json not found."
        exit 1
    }
}

$ImageRepo = if ($env:IMAGE_REPO) { $env:IMAGE_REPO } else { "docker.io/frozdbyte/openlove" }
$VersionTag = "${ImageRepo}:${Version}"
$LatestTag = "${ImageRepo}:latest"

Write-Host "`n🚀 OpenLove Container Publish" -ForegroundColor Magenta
Write-Host "──────────────────────────────────────────" -ForegroundColor Gray
Write-Host "🏷️  Version Tag: $VersionTag" -ForegroundColor Cyan
Write-Host "🏷️  Latest Tag:  $LatestTag" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────────`n" -ForegroundColor Gray

# 1. Tag manifest as latest
Write-Host "🏷️  Tagging $VersionTag as $LatestTag..." -ForegroundColor Yellow
podman tag $VersionTag $LatestTag
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2. Push versioned manifest
Write-Host "`n📤 Pushing versioned manifest: $VersionTag..." -ForegroundColor Yellow
podman manifest push --all $VersionTag "docker://${VersionTag}"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Push latest manifest
Write-Host "`n📤 Pushing latest manifest: $LatestTag..." -ForegroundColor Yellow
podman manifest push --all $LatestTag "docker://${LatestTag}"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n🎉 Successfully published multi-arch images!" -ForegroundColor Green
Write-Host "  👉 $VersionTag" -ForegroundColor Green
Write-Host "  👉 $LatestTag`n" -ForegroundColor Green
