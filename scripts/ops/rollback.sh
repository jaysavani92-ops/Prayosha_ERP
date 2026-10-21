#!/usr/bin/env bash
# Roll API + worker back to the previously deployed image.
# Database migrations are NOT reverted: they are expand-only by policy, so the
# previous version keeps working against the newer schema (see CLAUDE.md).
set -Eeuo pipefail
cd "${PRAYOSHA_DIR:-/opt/prayosha}"
previous="$(grep -s '^PREVIOUS_API_IMAGE=' .deploy-state | cut -d= -f2- || true)"
[[ -n "${previous}" ]] || { echo "no previous image recorded in .deploy-state" >&2; exit 1; }
export API_IMAGE="${previous}"
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps --wait --wait-timeout 120 api worker
printf 'API_IMAGE=%s\nPREVIOUS_API_IMAGE=\n' "${previous}" > .deploy-state
echo "rolled back to ${previous}"
