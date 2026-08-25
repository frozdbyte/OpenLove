#!/usr/bin/env bash
set -e

VERSION="${1:-$(node -p "require('./package.json').version")}"
IMAGE_REPO="${IMAGE_REPO:-docker.io/frozdbyte/openlove}"
VERSION_TAG="${IMAGE_REPO}:${VERSION}"
LATEST_TAG="${IMAGE_REPO}:latest"

echo -e "\n\033[1;35m🚀 OpenLove Container Publish\033[0m"
echo -e "\033[0;90m──────────────────────────────────────────\033[0m"
echo -e "\033[1;36m🏷️  Version Tag: ${VERSION_TAG}\033[0m"
echo -e "\033[1;36m🏷️  Latest Tag:  ${LATEST_TAG}\033[0m"
echo -e "\033[0;90m──────────────────────────────────────────\033[0m\n"

# 1. Tag manifest as latest
echo -e "\033[1;33m🏷️  Tagging ${VERSION_TAG} as ${LATEST_TAG}...\033[0m"
podman tag "${VERSION_TAG}" "${LATEST_TAG}"

# 2. Push versioned manifest
echo -e "\n\033[1;33m📤 Pushing versioned manifest: ${VERSION_TAG}...\033[0m"
podman manifest push --all "${VERSION_TAG}" "docker://${VERSION_TAG}"

# 3. Push latest manifest
echo -e "\n\033[1;33m📤 Pushing latest manifest: ${LATEST_TAG}...\033[0m"
podman manifest push --all "${LATEST_TAG}" "docker://${LATEST_TAG}"

echo -e "\n\033[1;32m🎉 Successfully published multi-arch images!\033[0m"
echo -e "  \033[1;32m👉 ${VERSION_TAG}\033[0m"
echo -e "  \033[1;32m👉 ${LATEST_TAG}\033[0m\n"
