---
name: api-security-review
description: Use before merging any change to authentication, sessions, permissions, input handling, uploads, logging, configuration or infrastructure exposure in the Prayosha API — a structured security review with concrete checks and the tests that must exist.
---

# API security review

## Purpose

Catch authorisation gaps, injection, data exposure and unsafe configuration before they ship.

## When to use

PRs touching `src/modules/auth`, `src/plugins/auth.ts`, `src/common/constants/roles.ts`, any route/schema, uploads, logging/redaction, `src/config/env.ts`, Dockerfile/Compose/Caddy, or dependencies.

## Workflow

1. List every changed route: method, path, `onRequest` hook, permission. Flag any route without authentication that is not intentionally public.
2. For each route, ask **who can call it, on whose data**: test another user's id (expect 404), a lower role (expect 403), a disabled user's old token (expect 401).
3. Inputs: schemas `.strict()`, no `z.any()`/`z.unknown()` in request bodies, no request object spread into Mongo filters/updates, no client-controlled sort/projection/field names. Try `{"$ne": null}`, `{"$where": "1"}`, extra fields, huge strings, deep nesting.
4. Outputs: response schemas exclude secrets/internal fields; errors use `AppError` (no stack/DB text to clients).
5. Auth changes: token claims verified (alg/iss/aud/exp), `tokenVersion` bumped where access must end, refresh rotation and reuse detection intact, cookie flags unchanged.
6. Logging: new sensitive fields added to `REDACT_PATHS`; no logging of bodies with credentials.
7. Config/infra: secrets only via env; production refinements in `env.ts`; no new published ports; containers stay non-root/read-only.
8. Dependencies: `npm audit --omit=dev`; new packages are maintained, minimal, and do not need install scripts (`allowScripts` stays deny-by-default).
9. Record findings as: severity, scenario, fix, test.

## Validation checklist

- [ ] Every new route has tests for 401, 403/404 and validation failure.
- [ ] Injection payload test for every new filterable input.
- [ ] No secrets/PII in logs, errors, OpenAPI examples or fixtures.
- [ ] `docs/security-checklist.md` updated (tick or add items).
- [ ] `npm run check` and `npm audit --omit=dev --audit-level=high` clean.

## Relevant files

`src/plugins/auth.ts`, `src/modules/auth/*`, `src/common/constants/roles.ts`, `src/common/errors/*`, `src/observability/logger.ts`, `src/config/env.ts`, `src/app.ts` (helmet, CORS, rate limits), `docker/caddy/Caddyfile`, `docs/security-checklist.md`, `tests/e2e/auth.e2e.test.ts`.
