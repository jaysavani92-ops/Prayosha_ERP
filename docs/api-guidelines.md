# API guidelines

Audience: backend engineers adding endpoints, and frontend engineers consuming them. The machine-readable contract is `docs/openapi.json` (`npm run openapi:export`); outside production it is browsable at `/docs`.

## Versioning and URLs

- All business endpoints live under `/api/v1`. Breaking changes (removing/renaming fields, changing types or error codes, tightening validation) require `/api/v2` for the affected resources; additive changes do not.
- Plural nouns, kebab-case: `/api/v1/uploads/:id/download-url`. Actions that are not CRUD are sub-resources with `POST` (`/uploads/:id/complete`).
- Health and metrics are unversioned: `/health/live`, `/health/ready`, `/internal/metrics` (token, blocked at the proxy).

## Requests

- JSON only (`content-type: application/json`), 1 MB body limit by default. Send no body (and no content-type) on bodiless `POST`s.
- All inputs are validated with Zod `.strict()` schemas: unknown fields return 400, not silently ignored. Clients must not send fields they do not intend.
- Authentication: `Authorization: Bearer <accessToken>`. Browsers call `/api/v1/auth/*` with `credentials: 'include'` so the refresh cookie is sent.
- Retried creates: send `Idempotency-Key: <8–128 chars>` on `POST /users` and `POST /uploads`. Same key + same body ⇒ the original response (`Idempotent-Replayed: true`); same key + different body ⇒ 422; key still executing ⇒ 409 with `Retry-After`.
- Optional `X-Request-Id` (8–128 of `[A-Za-z0-9._-]`) for correlation; behind Caddy the proxy assigns it.

## Responses

```jsonc
// single resource
{ "data": { "id": "65f…", "username": "site.eng" } }
// list
{ "data": [ … ], "page": { "nextCursor": "eyJj…", "limit": 20 } }
// error
{ "error": { "code": "VALIDATION_FAILED", "message": "Invalid request body", "requestId": "…", "details": [ { "path": "/size", "message": "…" } ] } }
```

- Timestamps are ISO-8601 UTC strings. Ids are 24-char hex strings.
- Responses are serialized through Zod schemas: fields not in the schema are never sent.
- Pagination: pass `nextCursor` back as `?cursor=`; it is opaque and only valid with the same filters. `limit` 1–100 (default 20). Sorting is fixed (newest first); clients cannot choose sort fields.

## Status codes

| Code                                                                                        | When                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 200 / 201                                                                                   | success / created                                                    |
| 202                                                                                         | accepted for asynchronous completion (upload deletion)               |
| 204                                                                                         | success, no body                                                     |
| 400 `VALIDATION_FAILED` / `BAD_REQUEST`                                                     | schema violation, malformed JSON or cursor                           |
| 401 `UNAUTHENTICATED` / `INVALID_CREDENTIALS` / `SESSION_INVALID`                           | missing/expired token, wrong credentials, refresh failed             |
| 403 `FORBIDDEN` / `ACCOUNT_DISABLED`                                                        | authenticated but not permitted                                      |
| 404 `NOT_FOUND`                                                                             | does not exist **or** caller may not see it                          |
| 409 `CONFLICT` / `INVALID_STATE` / `UPLOAD_VERIFICATION_FAILED` / `IDEMPOTENCY_IN_PROGRESS` | duplicate, wrong state, object not uploaded yet                      |
| 413 / 415                                                                                   | file too large / type not allowed for the purpose                    |
| 422 `UPLOAD_VERIFICATION_FAILED` / `IDEMPOTENCY_KEY_REUSED`                                 | uploaded bytes failed verification; key reused with a different body |
| 423 `ACCOUNT_LOCKED`                                                                        | too many failed logins (`Retry-After`)                               |
| 429 `RATE_LIMITED`                                                                          | rate limit (`Retry-After`)                                           |
| 500 `INTERNAL_ERROR`                                                                        | bug; message is generic, details are in logs under `requestId`       |
| 503 `SERVICE_BUSY` / `DEPENDENCY_UNAVAILABLE`                                               | load shedding or a dependency outage (`Retry-After`)                 |

Clients branch on `error.code`, never on `message`.

## Endpoints (v1)

| Method & path                      | Permission                           | Notes                                                 |
| ---------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `POST /auth/login`                 | public, 10/min/IP                    | sets refresh cookie                                   |
| `POST /auth/refresh`               | refresh cookie                       | rotates cookie, returns new access token              |
| `POST /auth/logout`                | refresh cookie                       | revokes session                                       |
| `GET /auth/me`                     | authenticated                        |                                                       |
| `PUT /auth/password`               | authenticated                        | signs out every session                               |
| `POST /users`                      | `users:manage`                       | only owners create owners; Idempotency-Key            |
| `GET /users`, `GET /users/:id`     | `users:read`                         | filters `role`, `status`                              |
| `PATCH /users/:id`                 | `users:manage`                       | not your own role/status; last active owner protected |
| `PUT /users/:id/password`          | `users:manage`                       | admin reset ("forgot PIN" flow)                       |
| `POST /uploads`                    | `uploads:create`                     | presigned PUT; Idempotency-Key                        |
| `POST /uploads/:id/complete`       | uploader only                        | verifies object                                       |
| `GET /uploads`, `GET /uploads/:id` | own; `uploads:read:any` for others   | `status`, `ownerId` (admins)                          |
| `POST /uploads/:id/download-url`   | as above                             | 5-minute presigned GET, `Cache-Control: no-store`     |
| `DELETE /uploads/:id`              | own; `uploads:delete:any` for others | 202, object removed asynchronously                    |

## Frontend upload example

```js
const { data } = await api.post('/api/v1/uploads', {
  purpose: 'snag_photo',
  contentType: file.type,
  size: file.size,
  filename: file.name,
  checksumSha256: await sha256Base64(file), // optional but recommended
});
const put = await fetch(data.uploadUrl.url, { method: 'PUT', headers: data.uploadUrl.headers, body: file });
if (!put.ok) throw new Error(`upload failed: ${put.status}`);
const { data: upload } = await api.post(`/api/v1/uploads/${data.upload.id}/complete`);
// store upload.id on the domain record (snag, invoice, …), never the URL
```

Send exactly the returned headers: they are part of the signature. Store the upload **id**; request a fresh download URL when displaying.

## Adding an endpoint (checklist)

1. Zod schemas in `*.schema.ts` (`.strict()`; response schema with `.meta({ id })` for reusable components).
2. Route with `onRequest: app.requirePermission(...)`, `schema`, documented error responses.
3. Controller: no business logic. Service: rules + authorisation. Repository: bounded, indexed query.
4. New query ⇒ index in `index-specs.ts` + `explain()` check. New field ⇒ type + validator.
5. Tests: success, 400, 401, 403/404, conflicts, idempotency where relevant.
6. `npm run check`, `npm run openapi:export`.
