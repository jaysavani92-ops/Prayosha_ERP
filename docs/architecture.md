# Architecture

Audience: engineers building and operating the Prayosha ERP backend.

## 1. Starting point (repository assessment, 2026-10-21)

| Finding                                               | Detail                                                                                                                                                                         | Consequence                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend` branch was empty                            | Commit `df30771` cleared it for a new Node.js API                                                                                                                              | Greenfield scaffold; nothing to preserve on this branch                                                                                                                 |
| Live system is a static frontend (`main`, `frontend`) | ~45 Supabase (PostgreSQL) tables used directly from the browser: projects, inventory, purchase, petty cash, possession/snags, drawings, plan changes, workforce, notifications | Domain modules will migrate onto this API incrementally; this foundation implements auth, users, uploads                                                                |
| **Critical:** storage secret in browser code          | `config.js` on `main` contains a Cloudflare R2 access key **and secret** and uploads directly from the browser                                                                 | Anyone can read, overwrite or delete the bucket. **Rotate the R2 key now**, regardless of this project. This API removes the need for client-held keys (presigned URLs) |
| Login = username + 4-digit PIN                        | Mapped to Supabase email/password (`<user>@prayosha.erp`, `<pin>-Prayosha`)                                                                                                    | 10,000 combinations; this API requires ≥ 8 characters plus account lockout (see security checklist)                                                                     |
| Roles are free-text and inconsistent                  | `Owner`, `General Manager`, `Site Engineer`/`site_engineer`/`Engineer`, `Supervisor`, `Store Keeper`, `Accountant`, `Project Manager`, `Construction Head`                     | Normalised to a fixed enum in `src/common/constants/roles.ts`; confirm with the business                                                                                |
| Upload folders                                        | project-photos, floor-plans, drawing-vault, case-chat-files, inventory invoices, task-evidence, possession-snags, petty-cash                                                   | Became the server-side upload `purpose` policy                                                                                                                          |

## 2. Shape of the system

```
 Browser / mobile ──HTTPS──► Caddy (TLS, compression, /internal blocked)
                                │  round-robin over healthy replicas
                     ┌──────────┴──────────┐
                     ▼                     ▼
               API instance 1 …      API instance N        (stateless, Fastify)
                     │   │   │                │
           MongoDB ◄─┘   │   └─► Redis ◄──────┘  (rate limits, auth-state cache, queue)
          (self-hosted)  │          ▲
                         │          │ BullMQ
                         │       Worker process(es) ──► S3 (delete/cleanup)
                         ▼
                  AWS S3 (private bucket) ◄── browser PUT/GET via presigned URLs
```

A **modular monolith**: one codebase and one image, two process types (API, worker). No microservices: the team size and load do not justify the operational cost, and module boundaries keep a later split possible.

## 3. Component responsibilities

| Layer             | Location                         | Responsibility                                                                   |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Composition roots | `src/server.ts`, `src/worker.ts` | Load config, open connections, build the app or workers, own shutdown            |
| App factory       | `src/app.ts`                     | Register plugins, construct services from injected dependencies, mount `/api/v1` |
| Routes            | `modules/*/*.routes.ts`          | URL, auth hook, Zod schemas (validation + OpenAPI), rate-limit overrides         |
| Controllers       | `modules/*/*.controller.ts`      | Translate HTTP ↔ service calls, cookies, status codes, idempotency wrapper       |
| Services          | `modules/*/*.service.ts`         | Business rules, authorisation decisions, orchestration                           |
| Repositories      | `modules/*/*.repository.ts`      | Every MongoDB query; bounded, indexed, `maxTimeMS`                               |
| Plugins           | `src/plugins/`                   | Authentication (`authenticate`, `requirePermission`)                             |
| Infrastructure    | `src/infrastructure/`            | MongoDB client, Redis clients, S3 adapter                                        |
| Jobs              | `src/jobs/`                      | Queue contracts, dispatcher (producer), idempotent processors                    |
| Database          | `src/database/`                  | Validators, index specs, migration runner, ops scripts                           |
| Observability     | `src/observability/`             | Pino logger with redaction, Prometheus metrics                                   |

## 4. Request lifecycle

1. **Caddy** terminates TLS, caps body size (2 MB), overwrites `X-Request-Id`, blocks `/internal/*` and `/docs`.
2. **Fastify `onRequest`**: request id (from proxy or new UUID) echoed as `X-Request-Id`; `under-pressure` sheds load with 503 when the event loop is saturated; **rate limit** (per IP, Redis-backed, shared across replicas); then the route's **auth hook** verifies the JWT and loads `{role, status, tokenVersion}` from the Redis auth-state cache, falling back to MongoDB.
3. **Body parsing** with a size limit (1 MB default), then **Zod validation** of params, query, headers and body (`.strict()`: unknown keys and operator objects are rejected).
4. **Controller → service → repository.** Repositories use indexed, bounded queries with `maxTimeMS`. Expensive or non-critical work is enqueued (BullMQ), not done inline.
5. **Serialization** through the Zod response schema (output filtering: fields not in the schema never leave the server).
6. **`onSend`**: `Connection: close` while draining. **`onResponse`**: latency histogram by route template; structured access log with request id.
7. Errors at any step go to the central error handler and become `{ error: { code, message, requestId } }`; 5xx bodies never contain internal detail.

## 5. Upload flow (S3)

```
client                       API                               S3
  │ POST /uploads {purpose,type,size,filename,sha256?}
  │──────────────────────────►│ authz + policy check
  │                           │ insert {status: pending, key: uploads/<purpose>/<yyyy>/<mm>/<id>.<ext>}
  │                           │ presign PUT (5 min), signed: Content-Type, Content-Length,
  │◄──────────────────────────│ If-None-Match:*, x-amz-checksum-sha256
  │ PUT bytes with returned headers ─────────────────────────────►│ rejects wrong size/type/hash,
  │                                                               │ rejects overwrite (412)
  │ POST /uploads/:id/complete
  │──────────────────────────►│ HeadObject: size, type, checksum
  │                           │ ranged GET 32 bytes: magic-number check
  │◄──────────────────────────│ pending → available   (or → deleting + queued removal, 422)
  │ POST /uploads/:id/download-url ─► presigned GET (5 min; attachment for documents)
```

Bytes never pass through Node.js. Details and the threat model: `docs/security-checklist.md` and the `s3-upload-security` skill.

## 6. Background work

| Job                    | Trigger                     | Idempotency                                                                | Failure handling                                                                                                  |
| ---------------------- | --------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `delete-upload-object` | upload deleted or rejected  | acts only if the record is `deleting`; S3 delete of a missing key succeeds | 8 attempts, exponential backoff from 5 s; waits until the presigned PUT has expired; failed jobs retained 14 days |
| `cleanup-uploads`      | job scheduler, every 15 min | conditional claims (`pending → deleting`)                                  | re-dispatches deletions stuck > 10 min, so a failed enqueue or exhausted job is never lost silently               |

The API never reports success before the critical write (MongoDB) commits. Deletion is reported as `202 Accepted` with status `deleting`, which is the honest state.

## 7. Infrastructure assumptions

- Linux VPS (Ubuntu 24.04 LTS), Docker Engine with Compose v2, a domain with DNS control, an AWS account for S3 (uploads) and a **separate** account or at least bucket/region for backups.
- MongoDB 8.2 (8.0 refuses to start on Linux kernels ≥ 6.19: SERVER-121912). Redis 8 with AOF persistence and `noeviction`.
- Clock sync (chrony/systemd-timesyncd) on every host: JWT expiry and S3 signatures depend on it.
- No workload measurements exist yet. Nothing here asserts a throughput number; see `docs/performance-testing.md`.

## 8. Expected bottlenecks (in likely order)

1. **Login**: Argon2id (19 MiB, t=2) is deliberately expensive, bounded by `PASSWORD_HASH_CONCURRENCY` and the libuv pool; bursts beyond capacity get 503 rather than queueing unboundedly. Scale by adding API replicas (CPU-bound).
2. **MongoDB on a shared VPS**: RAM for the WiredTiger cache (working set), disk IOPS, and the connection budget (`replicas × MONGODB_MAX_POOL_SIZE`).
3. **Single-host resources**: API, worker, MongoDB and Redis compete for CPU/RAM in Option A; resource limits are set in `docker-compose.prod.yml`.
4. **Redis** is unlikely to be a bottleneck at this scale; it is a dependency to monitor (memory, persistence).

## 9. Scaling strategy (summary — full plan in `docs/scaling-roadmap.md`)

Measure first (load tests, metrics). Then, in order: tune indexes/queries → add API replicas on the same host → move MongoDB to its own VPS on a private network → replica set across failure domains (Option B) → more API hosts behind a load balancer → CloudFront for downloads → split read-heavy reporting to secondary reads or a separate store if ever needed.

## 10. Major trade-offs

| Decision                                         | Alternative                           | Why                                                                                                                         |
| ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Modular monolith                                 | Microservices                         | One small team; module boundaries suffice                                                                                   |
| Official MongoDB driver                          | Mongoose                              | Explicit queries, projections and indexes; validation already in Zod + `$jsonSchema`                                        |
| Presigned PUT with signed headers                | Presigned POST policy                 | PUT signs exact Content-Length, Content-Type, checksum and `If-None-Match` (no overwrite); POST cannot express no-overwrite |
| Refresh token in httpOnly SameSite=Strict cookie | Token in response body / localStorage | Not readable by XSS; requires API and frontend on the same site (`app.` and `api.` subdomains)                              |
| Auth-state check per request (cached)            | Pure stateless JWT                    | Disable/role change/password reset take effect immediately; cost is one Redis GET per request                               |
| Migrations as a deploy step                      | Auto-migrate on boot                  | N replicas never race; slow index builds never fail health checks                                                           |
| Caddy                                            | Nginx                                 | Automatic HTTPS, simple config, dynamic upstreams for Compose replicas                                                      |
| Standalone MongoDB in Option A                   | 3 containers on one VPS               | Same failure domain gives no real HA; spend the effort on tested off-site backups                                           |
