---
name: production-deployment
description: Use when preparing, executing or rolling back a Prayosha production deployment, changing Docker/Compose/Caddy/CI configuration, rotating secrets, or provisioning/hardening the VPS. Enforces the safe deploy order and the no-surprises rules.
---

# Production deployment

## Purpose

Deploy predictably: immutable images, migrations before code, health-checked rollout, one-command rollback, and no accidental exposure.

## When to use

Releases, infrastructure/config changes, secret rotation, server provisioning, incident mitigation by rollback.

## Rules

- Production actions (deploys, migrations, restarts, firewall/DNS changes) need explicit human authorization in the conversation. Prepare commands; let a human run or approve them.
- Never deploy `latest`; tags are immutable (CI-built from a commit).
- Never publish MongoDB/Redis ports; never disable TLS, auth or the `/internal` block.
- Never run load tests, seeds or `--replace-live-db` restores against production without an explicit, written decision.

## Workflow — release

1. CI green (`verify` + `image` jobs) on the commit to release.
2. Read the diff for migrations: expand-only? Long index builds? If contract-phase, it must be a separate later release.
3. Backup taken in the last 24 h (check `BackupMissing` alert is clear) — run `mongo-backup.sh` manually before risky migrations.
4. `REGISTRY_IMAGE=… API_DOMAIN=… scripts/ops/deploy.sh <tag>` (pull → migrate → verify indexes → recreate api/worker with `--wait` → readiness through Caddy).
5. Watch 15 min: 5xx rate, p95, logs (`docker compose logs -f api | jq`), queue backlog.
6. Problem? `scripts/ops/rollback.sh` (image only; schema stays).

## Workflow — config/secret change

1. Edit `/opt/prayosha/.env.production` (chmod 600), never via shell history.
2. JWT secret rotation: new value in `JWT_ACCESS_SECRET`, old in `JWT_ACCESS_SECRET_PREVIOUS`, deploy; remove the previous after `ACCESS_TOKEN_TTL_SECONDS`.
3. MongoDB password: `db.changeUserPassword()` first, then env, then restart api/worker.
4. `docker compose ... up -d` recreates affected services; verify readiness.

## Validation checklist

- [ ] Image tag immutable and from a green commit.
- [ ] Migrations expand-only; `verify-indexes` clean after migrate.
- [ ] Readiness OK through the proxy; error rate and latency normal after 15 min.
- [ ] Previous image recorded in `.deploy-state` (rollback possible).
- [ ] Only ports 80/443 (and restricted 22) reachable from the internet (`ss -tlnp`, external port scan).
- [ ] Docs updated if the procedure changed (`docs/deployment.md`).

## Relevant files

`Dockerfile`, `docker-compose.prod.yml`, `docker-compose.monitoring.yml`, `docker/caddy/Caddyfile`, `docker/mongo/init/*`, `scripts/ops/deploy.sh`, `scripts/ops/rollback.sh`, `scripts/backup/*`, `.github/workflows/ci.yml`, `.env.example`, `docs/deployment.md`, `docs/backup-and-restore.md`.
