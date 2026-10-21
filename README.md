# Prayosha ERP — API

Backend API for the Prayosha construction ERP: authentication and staff accounts, secure file uploads to S3, and the foundation (data access, jobs, observability, deployment) for migrating the ERP's domain modules off direct browser-to-Supabase access.

|                     |                                                          |
| ------------------- | -------------------------------------------------------- |
| Runtime             | Node.js 24 LTS, TypeScript (strict, ESM)                 |
| HTTP                | Fastify 5, Zod 4 validation, OpenAPI 3.1                 |
| Data                | MongoDB 8.2, self-hosted (official driver)               |
| Jobs & shared state | Redis 8 + BullMQ (separate worker process)               |
| Files               | AWS S3 via presigned URLs (S3-compatible RustFS locally) |
| Ops                 | Docker, Caddy (TLS), Prometheus metrics, Pino JSON logs  |

**Local development and production are different topologies.** `docker-compose.yml` is for your laptop only. Production is described in [docs/deployment.md](docs/deployment.md) and `docker-compose.prod.yml`.

## Quick start (local development)

Prerequisites: Node.js 24 (`nvm use`), Docker with Compose v2.

```bash
npm ci
cp .env.example .env              # replace every change-me value
docker compose up -d              # MongoDB 8.2, Redis 8, RustFS (S3) on 127.0.0.1 only
npm run dev:bucket                # create the local bucket + CORS
npm run db:migrate:dev            # validators + indexes
OWNER_USERNAME=admin OWNER_DISPLAY_NAME="Admin" npm run user:create-owner:dev   # prompts for a password
npm run dev                       # API on http://127.0.0.1:3000, docs at /docs
npm run dev:worker                # background jobs (second terminal)
```

Smoke-test the real upload path (presign → PUT to S3 → verify → download → delete):

```bash
SMOKE_USER=admin SMOKE_PASSWORD='…' npm run smoke:upload
```

## Commands

| Command                                                        | Purpose                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `npm run check`                                                | lint + typecheck + tests + build (run before every commit)           |
| `npm test`                                                     | unit + integration + API tests (in-memory MongoDB; no Docker needed) |
| `TEST_REDIS_URL=redis://127.0.0.1:6379 npm test`               | also run the BullMQ tests against a real Redis                       |
| `npm run lint` / `npm run typecheck` / `npm run format`        | static checks                                                        |
| `npm run build` → `npm start` / `npm run start:worker`         | compiled API / worker                                                |
| `npm run db:migrate[:dev]` / `npm run db:verify-indexes[:dev]` | schema deploy step / drift check                                     |
| `npm run openapi:export`                                       | write `docs/openapi.json`                                            |
| `npm run load:seed` + `k6 run tests/load/api-load.js`          | load testing (never production)                                      |

## Layout

```
src/
  app.ts  server.ts  worker.ts     app factory and the two process entry points
  config/                          validated environment configuration
  common/                          errors, roles/permissions, pagination, idempotency, utils
  plugins/                         Fastify auth plugin
  infrastructure/                  MongoDB, Redis, S3 adapters
  modules/{auth,users,uploads,health}/   routes → controller → service → repository
  database/                        validators, index specs, migrations, ops scripts
  jobs/                            queue contracts, dispatcher, idempotent processors
  observability/                   logger (redaction), Prometheus metrics
tests/{unit,integration,e2e,load}/
docker/  scripts/  docs/  .claude/skills/
```

## Documentation

- [Architecture](docs/architecture.md): repository assessment, request lifecycle, trade-offs
- [Database design](docs/database-design.md): collections, indexes, migrations, Option A vs B
- [API guidelines](docs/api-guidelines.md): conventions, status codes, endpoints, upload example
- [Security checklist](docs/security-checklist.md): **includes urgent actions for the existing frontend**
- [Deployment](docs/deployment.md) · [Backup & restore](docs/backup-and-restore.md)
- [Performance testing](docs/performance-testing.md) · [Scaling roadmap](docs/scaling-roadmap.md)
- [CLAUDE.md](CLAUDE.md): working rules for engineers and Claude Code; project skills in `.claude/skills/`

## Status

Implemented: auth (login, rotating refresh sessions, lockout, password change), staff user management with role-based permissions, the full upload lifecycle with verification and asynchronous cleanup, health/metrics, migrations, CI, Docker/Compose/Caddy, backup scripts. Domain modules (projects, inventory, purchase, petty cash, possession, drawings, …) are not yet ported from the Supabase-based frontend.
