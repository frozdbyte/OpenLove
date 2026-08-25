# PowerShell Build Script for OpenLove Multi-Arch Image with Podman
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
$ImageTag = "${ImageRepo}:${Version}"
$Platforms = if ($env:PLATFORMS) { $env:PLATFORMS } else { "linux/amd64,linux/arm64" }

Write-Host "`n📦 OpenLove Container Build" -ForegroundColor Magenta
Write-Host "──────────────────────────────────────────" -ForegroundColor Gray
Write-Host "🏷️  Version:   $Version" -ForegroundColor Cyan
Write-Host "🖼️  Image:     $ImageTag" -ForegroundColor Cyan
Write-Host "🌐 Platforms: $Platforms" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────────`n" -ForegroundColor Gray

# 1. Clean up existing manifest if present
podman manifest rm $ImageTag 2>$null | Out-Null

# 2. Create manifest
Write-Host "📋 Creating Podman manifest for $ImageTag..." -ForegroundColor Yellow
podman manifest create $ImageTag
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Build multi-platform image
Write-Host "`n🚀 Building multi-arch container images ($Platforms)..." -ForegroundColor Yellow
podman build --platform $Platforms --manifest $ImageTag .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n✅ Build complete! Manifest created: $ImageTag`n" -ForegroundColor Green
