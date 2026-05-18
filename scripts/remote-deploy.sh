#!/usr/bin/env bash
# Runs on the production VM (via gcloud IAP SSH). Expects env: DEPLOY_PATH, IMAGE, GHCR_USER, GHCR_TOKEN.
set -euo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${IMAGE:?IMAGE is required}"
: "${GHCR_USER:?GHCR_USER is required}"
: "${GHCR_TOKEN:?GHCR_TOKEN is required}"

cd "$DEPLOY_PATH"
echo "[deploy] Updating checkout"
git fetch --quiet origin main
git pull --ff-only origin main
echo "[deploy] Logging in to ghcr.io"
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
echo "[deploy] Pulling image: $IMAGE"
docker pull "$IMAGE"
echo "[deploy] Restarting vms-app"
export VMS_APP_IMAGE="$IMAGE"
docker compose up -d --no-build vms-app
echo "[deploy] Pruning old images"
docker image prune -f
echo "[deploy] Done"
