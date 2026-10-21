---
name: mongodb-self-hosted-operations
description: Use for anything touching the self-hosted MongoDB — schema/index/validator changes, migrations, query performance with explain(), connection pool sizing, backups and restores, user/credential management, or moving from the single-server deployment to a replica set.
---

# MongoDB self-hosted operations

## Purpose

Change and operate the self-hosted MongoDB safely: no unindexed queries, no unsafe migrations, no untested backups, no public exposure.

## When to use

- Adding/changing fields, indexes, validators or data migrations.
- A slow query, pool exhaustion, disk or connection alerts.
- Backup, restore, credential rotation, version upgrades, replica-set work.

## Workflow — schema change

1. Update the TS document type (`*.types.ts`), `src/database/validators.ts` and, for new queries, `src/database/indexes/index-specs.ts` (with `servesQuery`).
2. Data transformation needed? Add `src/database/migrations/NNNN-name.ts` to `MIGRATIONS` (ids increasing, batched, re-runnable). Expand-only: never remove a field that running code still reads.
3. Add an `explain()` assertion in `tests/integration/database.test.ts` for new query shapes (no `COLLSCAN`, no blocking `SORT`).
4. Locally: `npm run db:migrate:dev && npm run db:verify-indexes:dev`. Benchmark with `npm run load:seed` data, not an empty DB.
5. Production: migrations run in `scripts/ops/deploy.sh` before the new code starts. Large index builds: schedule low traffic, watch `db.currentOp({ "command.createIndexes": { $exists: true } })`.

## Workflow — slow query

1. Find the route in metrics (p95 by route), then the query in the repository.
2. `explain('executionStats')` against production-like data: compare `totalDocsExamined` to `nReturned`, check for `SORT`/`COLLSCAN`.
3. Fix with an ESR-ordered compound index, a projection, or a tighter filter. Do not add caching to hide it.

## Workflow — operations

- Users: app (custom role: find/insert/update/remove only), migrator (readWrite + dbAdmin), backup (backup, clusterMonitor), root (emergency). Rotate with `db.changeUserPassword()` then update `.env.production` and restart api/worker.
- Backups/restores: follow `docs/backup-and-restore.md`; run the drill monthly.
- Version: stay on MongoDB 8.2.x (8.0 cannot start on Linux kernel ≥ 6.19, SERVER-121912). Upgrade one minor at a time; read release notes; take a backup first.
- Replica set: follow "Upgrade path A → B" in `docs/database-design.md`. Members on separate machines only.

## Validation checklist

- [ ] Type, validator and index spec changed together; `db:verify-indexes` clean.
- [ ] Migration is expand-only, batched, idempotent; never edited after running anywhere.
- [ ] New query has an index and test-verified plan.
- [ ] Pool budget: (API + worker replicas) × `MONGODB_MAX_POOL_SIZE` well below server capacity.
- [ ] Port 27017 never published or opened in a firewall to the internet.
- [ ] Backup taken before upgrades or risky migrations; restore tested in the last month.

## Relevant files

`src/database/*`, `src/infrastructure/mongodb/mongo-client.ts`, `*/**.repository.ts`, `docker/mongo/init/01-create-users.js`, `docker-compose.prod.yml`, `scripts/backup/*`, `docs/database-design.md`, `docs/backup-and-restore.md`, `docker/monitoring/alerts.yml`.
