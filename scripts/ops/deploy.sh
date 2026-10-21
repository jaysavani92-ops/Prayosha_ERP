#!/usr/bin/env bash
# Deploy a new image tag on the Option A VPS.
#   /opt/prayosha/scripts/ops/deploy.sh 1.4.2
#
# Order matters: migrations first (they must be backward compatible with the
# running version: expand -> deploy -> contract), then API + worker.
# Docker Compose has no true rolling update: replicas are recreated, and Caddy
# retries connection failures for up to 5s (lb_try_duration), so expect at most
# a few seconds of elevated latency. Use docker-rollout or Option B for zero downtime.
set -Eeuo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
cd "${PRAYOSHA_DIR:-/opt/prayosha}"
: "${REGISTRY_IMAGE:?set REGISTRY_IMAGE, e.g. ghcr.io/org/prayosha-api}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

current="$(grep -s '^API_IMAGE=' .deploy-state | cut -d= -f2- || true)"
export API_IMAGE="${REGISTRY_IMAGE}:${TAG}"

echo "==> pulling ${API_IMAGE}"
docker pull "${API_IMAGE}"

echo "==> running migrations"
"${COMPOSE[@]}" run --rm --no-deps api node dist/database/scripts/migrate.js
"${COMPOSE[@]}" run --rm --no-deps api node dist/database/scripts/verify-indexes.js

echo "==> updating api and worker"
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 120 api worker

echo "==> verifying readiness through the proxy"
for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 "https://${API_DOMAIN:?}/health/ready" > /dev/null; then
    printf 'API_IMAGE=%s\nPREVIOUS_API_IMAGE=%s\n' "${API_IMAGE}" "${current}" > .deploy-state
    echo "==> deployed ${API_IMAGE}"
    exit 0
  fi
  sleep 3
done
echo "!! readiness check failed; consider scripts/ops/rollback.sh" >&2
exit 1
