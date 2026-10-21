# Database design (MongoDB, self-hosted)

Audience: engineers changing schemas, queries or the database deployment.

## Principles

- **Design from access patterns.** Every query lives in a repository, and every repository query has an index in `src/database/indexes/index-specs.ts` that records the query it serves (`servesQuery`). Tests assert the important plans via `explain()` (no `COLLSCAN`, no in-memory `SORT`).
- **Bounded everything.** Lists use keyset pagination (max 100 per page), `maxTimeMS` on reads (`MONGODB_QUERY_TIMEOUT_MS`), projections that exclude credentials, no unbounded arrays inside documents.
- **Two layers of schema.** Zod validates API input; MongoDB `$jsonSchema` validators (`src/database/validators.ts`, `validationLevel: strict`, `additionalProperties: false`) reject malformed writes from bugs or manual sessions.
- **Single-document atomicity.** Every state change is one conditional `findOneAndUpdate` (e.g. `{_id, status: 'pending'}` → `available`). No multi-document transactions are needed today.

## Collections

### `users`

| Field                                                                     | Type                   | Notes                                                                             |
| ------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `_id`                                                                     | ObjectId               |                                                                                   |
| `username`                                                                | string                 | lower-case, `^[a-z0-9._-]{3,32}$`, unique                                         |
| `displayName`                                                             | string                 | 1–100                                                                             |
| `role`                                                                    | enum                   | `src/common/constants/roles.ts`                                                   |
| `status`                                                                  | `active` \| `disabled` | users are disabled, never deleted (audit trail)                                   |
| `passwordHash`                                                            | string                 | Argon2id PHC string; excluded from every non-login projection                     |
| `tokenVersion`                                                            | int                    | bumped on role change, disable, password change → invalidates tokens and sessions |
| `failedLoginCount`, `lockedUntil`                                         | int, date              | lockout counter, updated atomically with an update pipeline                       |
| `lastLoginAt`, `passwordChangedAt`, `createdBy`, `createdAt`, `updatedAt` |                        |                                                                                   |

Indexes: `username_unique {username:1}` (login), `createdAt_id {createdAt:-1,_id:-1}` (admin list). Role/status filters on the user list scan within the sorted index; acceptable because the collection holds staff accounts (hundreds, not millions). Revisit with `{role:1, createdAt:-1, _id:-1}` if it grows.

### `sessions` (refresh-token families)

One document per login; `tokenHash` (SHA-256 of the current refresh token) and `previousTokenHash` for reuse detection; `tokenVersion` snapshot; absolute `expiresAt`.
Indexes: `tokenHash_unique`, `previousTokenHash` (partial: only when set), `userId`, `expiresAt_ttl` (TTL 0 → MongoDB deletes expired sessions within ~60 s; code still checks `expiresAt`).

### `uploads`

Metadata only; the bytes live in S3. `objectKey` is server-generated and unique. State machine:

```
pending ──complete ok──► available ──DELETE──► deleting ──worker──► deleted
   │  └──verification fails──────────────────► deleting (rejectionReason)
   └──never completed (sweep)──► deleting ──► expired
```

Indexes:

| Name                       | Key                                                 | Serves                                                      |
| -------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| `objectKey_unique`         | `{objectKey:1}` unique                              | one record per object                                       |
| `owner_status_recent`      | `{ownerId:1,status:1,createdAt:-1,_id:-1}`          | "my uploads" list, keyset pagination (ESR: equality → sort) |
| `status_recent`            | `{status:1,createdAt:-1,_id:-1}`                    | admin list across owners                                    |
| `pending_by_expiry`        | `{uploadUrlExpiresAt:1}` partial `status:'pending'` | cleanup sweep                                               |
| `deleting_by_request_time` | `{deleteRequestedAt:1}` partial `status:'deleting'` | stuck-deletion sweep                                        |

Partial indexes stay small: they only contain documents in transient states.

### `idempotency_keys`

`_id = sha256(userId:scope:key)`, request fingerprint, stored response, `expiresAt` (TTL 24 h). Passwords are excluded from fingerprints.

### `_migrations`, `_migration_lock`

Applied data migrations and a lock document preventing concurrent runs.

## Pagination

Cursor = base64url(`{c: createdAt, i: _id}`); next page filter `createdAt < c OR (createdAt = c AND _id < i)`, sort `{createdAt:-1,_id:-1}`, limit `n+1` (the extra row only signals another page). Stable under concurrent inserts, O(page) cost at any depth, unlike `skip`.

## Migrations and index changes

`npm run db:migrate` (a deploy step, never at boot) runs in this order, all idempotent, under a lock:

1. create missing collections / `collMod` validators;
2. `createIndexes` for declared indexes (existing ones are a no-op);
3. ordered data migrations from `src/database/migrations/index.ts` (recorded in `_migrations`).

Rules:

- **Expand → deploy → contract.** Add fields/indexes first; code must tolerate both old and new shapes during a deploy; remove old fields only in a later release.
- Large-collection backfills run in bounded batches and must be re-runnable.
- Index builds on large collections: MongoDB builds without blocking reads and writes for most of the build, but they consume I/O and cache. Run during low traffic; watch `db.currentOp()`.
- Never drop indexes automatically. Remove from `index-specs.ts`, deploy, confirm with `$indexStats` that it is unused, then `dropIndex` by hand. `npm run db:verify-indexes` (non-zero exit on drift) belongs in the deploy checklist.

Validating an index for a new query:

```js
db.uploads
  .find({ ownerId: ObjectId('...'), status: 'available' })
  .sort({ createdAt: -1, _id: -1 })
  .limit(21)
  .explain('executionStats');
// Expect IXSCAN on owner_status_recent, no SORT stage,
// totalDocsExamined ≈ nReturned, executionTimeMillis small at production volume.
```

Benchmark with representative volume (`npm run load:seed`), not an empty database.

## Consistency, retries and deletion semantics

- Write concern `majority` (equivalent to `w:1` on a standalone; durable across failover once a replica set exists). Reads from the primary only.
- Retryable reads/writes are enabled in the driver (effective on replica sets).
- Uniqueness is enforced by unique indexes, never by "check then insert".
- Deletion: users are disabled; uploads are soft-deleted (record kept with status) and objects removed asynchronously. Sessions and idempotency records expire via TTL.
- Eventual processing: object removal after `DELETE` typically completes within seconds and is guaranteed eventually by the cleanup sweep (≤ ~25 min after a worker or Redis outage ends).

## Deployment options

### Option A — single self-hosted server (initial, cost-conscious)

- One MongoDB 8.2 instance (standalone, auth on) in Docker on the application VPS, data on a host directory (`/srv/prayosha/mongo`) on its own volume if the provider allows.
- No published port; only containers on the internal `backend` network can connect. Separate users: `prayosha_app` (custom `prayoshaApp` role: find/insert/update/remove only — no index, drop or collMod rights), `prayosha_migrator` (readWrite + dbAdmin), `prayosha_backup` (backup + clusterMonitor), root (emergencies only).
- Nightly encrypted `mongodump` to off-site object storage + provider disk snapshots; monthly restore drill (`docs/backup-and-restore.md`).
- **Single points of failure:** the VPS, its disk, its network, the MongoDB process. **Expected impact of host loss:** downtime until a new host is provisioned and restored (hours), and data loss up to the last backup (RPO ≤ 24 h with nightly dumps; reduce by running backups more often or using provider snapshots).

A2 (recommended next step, still not HA): move MongoDB to its own VPS on a private network (provider VPC / WireGuard), firewall 27017 to the app hosts only, enable TLS between app and database.

### Option B — replica set (high availability)

- Three data-bearing members (or two + an arbiter only if the budget forces it; arbiters weaken majority-write guarantees) on **separate machines in separate failure domains** (different hosts at minimum; different zones/datacentres preferred).
- `keyFile` (or x.509) internal auth, TLS for all connections, `rs.initiate()` with explicit member priorities, connection string listing all members with `replicaSet=rs0`.
- Enables transactions, change streams, `mongodump --oplog` point-in-time-consistent backups, and rolling upgrades.
- Monitor replication lag, oplog window (size it for ≥ 24 h of writes), and elections.

Three containers on one VPS do **not** protect against failure of that VPS.

### Upgrade path A → B (no application code changes)

1. Convert the standalone to a single-member replica set: add `--replSet rs0 --keyFile /etc/mongo/keyfile`, restart, `rs.initiate()`. Update `MONGODB_URI` with `replicaSet=rs0`. (Downtime: one restart.)
2. Provision two new machines; restore nothing — add them with `rs.add()` and let initial sync copy data. Wait for `SECONDARY` state and low lag.
3. Set priorities so the primary prefers the strongest machine; test failover with `rs.stepDown()` in a maintenance window.
4. Move the application to a seed list with all members. The driver handles failover; retryable writes cover the brief election window.
5. Switch backups to `mongodump --oplog` from a secondary (or filesystem snapshots of a secondary).

## Monitoring checklist

Disk free and growth (alerts at 20 %/10 % and a 24 h fill projection), connections in use vs. available, pool checkout failures (application metric), operation latency, WiredTiger cache usage, replication lag (Option B), backup freshness (`prayosha_backup_last_success_timestamp_seconds`). Rules: `docker/monitoring/alerts.yml`.
