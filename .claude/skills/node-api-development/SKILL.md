---
name: node-api-development
description: Use when implementing or changing an HTTP endpoint, service, repository, schema or job in the Prayosha Fastify/TypeScript API — the step-by-step recipe for a correct, tested, documented endpoint following project conventions.
---

# Node API development

## Purpose

Ship endpoints that are validated, authorised, bounded, tested and documented the same way every time.

## When to use

Any new or changed route, request/response shape, service rule, repository query, or background job.

## Workflow

1. **Contract** (`*.schema.ts`): Zod request schemas with `.strict()`; header schemas with `z.looseObject`; response schema (reuse DTOs with `.meta({ id })`). Use `objectIdParam`, `paginationQuery`, `dataEnvelope`, `listEnvelope`, `commonErrorResponses` from `src/common/http/schemas.ts`.
2. **Route** (`*.routes.ts`): `onRequest: app.requirePermission('<perm>')` (add the permission in `src/common/constants/roles.ts` if new), `schema: { tags, summary, security, params/querystring/body, response }`. Rate-limit overrides via `config.rateLimit` only for sensitive routes.
3. **Controller**: map request → service call → `reply.status(..).send({ data })`. Wrap non-idempotent creates with `IdempotencyService` when clients may retry.
4. **Service**: business rules and authorisation (`hasPermission`, ownership checks; 404 for invisible resources). Throw `Errors.*`/`AppError`. Use the injected `Clock`.
5. **Repository**: bounded query with `maxTimeMS`, projection, `limit`; keyset pagination via `afterCursorFilter`/`toPage`; conditional updates for state changes; translate duplicate-key errors to domain errors. Add the index to `src/database/indexes/index-specs.ts` and fields to `src/database/validators.ts`.
6. **Jobs** (if any): payload = ids only, Zod-validated; processor re-reads state and is idempotent; enqueue failures are logged and reconciled by a sweep.
7. **Tests**: `tests/e2e/<module>.e2e.test.ts` with `createTestApp`/`seedUser`/`login`; cover 2xx, 400, 401, 403/404, conflict and idempotency. Repository plan checks in `tests/integration/database.test.ts` for new queries.
8. Run `npm run check` and `npm run openapi:export`.

## Validation checklist

- [ ] Unknown fields and operator objects rejected (test with `{ "$ne": null }`).
- [ ] Authorisation tested for another user's resource (expects 404) and for an under-privileged role (403).
- [ ] Every list endpoint paginated with `limit ≤ 100`; no client-chosen sort/projection.
- [ ] New query has an index and an `explain()` assertion; new field is in the `$jsonSchema` validator.
- [ ] Errors use existing `ErrorCode`s; a new code is additive and documented in `docs/api-guidelines.md`.
- [ ] No success response before the critical write commits.
- [ ] `npm run check` passes; OpenAPI regenerated.

## Relevant files

`src/modules/users/*` (reference module), `src/modules/uploads/*`, `src/common/http/schemas.ts`, `src/common/errors/app-error.ts`, `src/common/idempotency/idempotency.service.ts`, `src/common/utils/pagination.ts`, `tests/helpers/*`, `docs/api-guidelines.md`.
