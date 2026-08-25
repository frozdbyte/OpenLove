#!/usr/bin/env bash
set -e

VERSION="${1:-$(node -p "require('./package.json').version")}"
IMAGE_REPO="${IMAGE_REPO:-docker.io/frozdbyte/openlove}"
IMAGE_TAG="${IMAGE_REPO}:${VERSION}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

echo -e "\n\033[1;35m📦 OpenLove Container Build\033[0m"
echo -e "\033[0;90m──────────────────────────────────────────\033[0m"
echo -e "\033[1;36m🏷️  Version:   ${VERSION}\033[0m"
echo -e "\033[1;36m🖼️  Image:     ${IMAGE_TAG}\033[0m"
echo -e "\033[1;36m🌐 Platforms: ${PLATFORMS}\033[0m"
echo -e "\033[0;90m──────────────────────────────────────────\033[0m\n"

# 1. Clean up existing manifest if present
podman manifest rm "${IMAGE_TAG}" 2>/dev/null || true

# 2. Create manifest
echo -e "\033[1;33m📋 Creating Podman manifest for ${IMAGE_TAG}...\033[0m"
podman manifest create "${IMAGE_TAG}"

# 3. Build multi-platform image
echo -e "\n\033[1;33m🚀 Building multi-arch container images (${PLATFORMS})...\033[0m"
podman build --platform "${PLATFORMS}" --manifest "${IMAGE_TAG}" .

echo -e "\n\033[1;32m✅ Build complete! Manifest created: ${IMAGE_TAG}\033[0m\n"
