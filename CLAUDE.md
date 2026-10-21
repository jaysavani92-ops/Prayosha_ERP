# CLAUDE.md — Prayosha ERP API

Backend for the Prayosha construction ERP. Node.js 24 LTS, TypeScript (strict, ESM), Fastify 5, MongoDB 8.2 (self-hosted, official driver), Redis + BullMQ, AWS S3 (presigned URLs), Zod 4, Pino, Vitest. The static frontend lives on the `main`/`frontend` branches; this branch (`backend`) is the API only.

## Commands

```bash
npm run dev              # API with reload (reads .env)
npm run dev:worker       # background worker with reload
npm run check            # lint + typecheck + all tests + build — run before every commit
npm run lint | typecheck | test | test:unit | test:integration | build | format
npm run db:migrate:dev   # apply validators, indexes, data migrations (local)
npm run db:verify-indexes:dev
npm run openapi:export   # writes docs/openapi.json
docker compose up -d     # local MongoDB, Redis, S3 emulator (local dev only)
```

Integration tests start an in-memory `mongod` (no Docker needed). BullMQ tests run only when `TEST_REDIS_URL` is set.

## Architecture (modular monolith)

- `src/app.ts` builds the Fastify app from injected dependencies; `src/server.ts` (API) and `src/worker.ts` (jobs) are the only composition roots. Never open connections inside `app.ts` or a module.
- `src/modules/<name>/`: `*.routes.ts` (HTTP + schemas) → `*.controller.ts` (request/response only) → `*.service.ts` (business rules) → `*.repository.ts` (all MongoDB access). `*.schema.ts` holds Zod contracts, `*.types.ts` the document types and DTO mappers.
- Dependency direction: routes → controller → service → repository. `auth` may import from `users`; `users` never imports `auth`. Modules never import each other's repositories for writes.
- Cross-cutting code: `src/common/` (errors, pagination, idempotency, roles), `src/plugins/` (Fastify plugins), `src/infrastructure/` (Mongo, Redis, S3 adapters), `src/jobs/` (queue contracts, dispatcher, processors).
- External systems sit behind ports (`ObjectStorage`, `JobDispatcher`, `PasswordHasher`, `AuthStateCache`) so tests use fakes.

## Conventions

- Files `kebab-case.ts`; classes `PascalCase`; ESM imports end in `.js`. `import type` for types.
- Validate every input with Zod `.strict()` schemas at the route. Header schemas must be `z.looseObject` (a strict/plain object would strip `authorization`).
- Authenticate in `onRequest` (`app.authenticate` / `app.requirePermission(...)`), never `preHandler`, so unauthenticated requests are rejected before body parsing.
- Check permissions (`hasPermission`, `canManageRole`), never role names, in services.
- Return 404 (not 403) for resources the caller may not see.
- Responses: `{ data }`, lists `{ data: [], page: { nextCursor, limit } }`, errors `{ error: { code, message, requestId, details? } }`. Throw `AppError`/`Errors.*`; never send ad-hoc error bodies. Error codes in `src/common/errors/app-error.ts` are a public contract.
- Services receive a `Clock`; never call `new Date()` for business time in services.

## Database rules

- All queries live in repositories, bounded (`limit`), with `maxTimeMS`, projections where full documents are not needed, and an index declared in `src/database/indexes/index-specs.ts` (with `servesQuery`).
- Never pass request objects into filters/updates; never accept client-controlled sort fields, projections or operators.
- Lists use keyset pagination over `(createdAt desc, _id desc)` via `common/utils/pagination.ts`. No `skip`.
- State changes use conditional updates (`transition(id, fromStatuses, set)`), not read-modify-write.
- Transactions are not used (single-document atomicity suffices so far); adding one requires a replica set — see docs/database-design.md.
- Schema changes: update the TS type, the `$jsonSchema` in `src/database/validators.ts` and the indexes together. Migrations are **expand-only** (add fields/indexes; remove only in a later release after code stops using them). Never edit a migration that has run. Indexes are never dropped automatically.
- Tests must use `createTestDb()` (in-memory, localhost-guarded). Never point tests or scripts at production.

## Security requirements

- No secrets in code, logs, fixtures or `.env.example`. Config only via `src/config/env.ts`.
- Passwords: Argon2id via `PasswordHasher`. Tokens: short-lived HS256 access JWT + rotating httpOnly refresh cookie with reuse detection. Changing role/status/password bumps `tokenVersion`.
- Uploads: server-generated object keys only, presigned PUT with signed size/type/`If-None-Match`, verification on `/complete` (HeadObject + magic bytes). Bucket stays private.
- Log redaction list: `src/observability/logger.ts` — extend it when adding sensitive fields.
- Run the `api-security-review` skill for any auth, upload or permission change.

## Testing expectations

- Every service rule and every new endpoint gets tests: success, validation failure, authz failure, not-found, and idempotency/race behaviour where relevant. Use `tests/helpers/test-app.ts`.
- Jobs must be idempotent; test duplicate delivery and partial failure.
- `npm run check` must pass. Do not weaken a test to make it pass; fix the code or explain.

## Deployment safety

- Deploy order: build image → `db:migrate` → `db:verify-indexes` → roll API/worker (`scripts/ops/deploy.sh`). Rollback reverts the image only.
- Never publish MongoDB/Redis ports; never run destructive commands, load tests or seeds against production. Single-VPS (Option A) is not highly available — say so wherever it matters.

## Skills (`.claude/skills/`)

backend-architecture · node-api-development · mongodb-self-hosted-operations · s3-upload-security · api-security-review · performance-load-testing · production-deployment
