# Security checklist

Audience: engineers and whoever operates the production server. Items marked **[action]** need someone to do something outside this repository.

## Immediate (from the repository assessment)

- [ ] **[action] Rotate the Cloudflare R2 key** whose access key _and secret_ are in `config.js` on the `main` branch (public to every visitor of the frontend and in git history). Treat the bucket as compromised: review its contents, check for unknown objects, and enable access logging.
- [ ] **[action]** Remove the secret from the frontend; move uploads to this API's presigned flow. Rewriting git history does not un-leak a key — rotation is what matters.
- [ ] **[action]** Review Supabase row-level security for every table while the frontend still talks to Supabase directly with the publishable key.

## Authentication & sessions

- [x] Argon2id (19 MiB, t=2, p=1), concurrency-bounded; unknown users cost the same time as known ones.
- [x] Passwords ≥ 8 characters, ≤ 128, not equal to the username. **Decision needed:** the current frontend uses 4-digit PINs. If the business insists on PINs, keep account lockout + per-IP rate limits and add a second factor for admin roles; do not lower the minimum without that.
- [x] Account lockout after `AUTH_MAX_FAILED_LOGINS` (5) for `AUTH_LOCKOUT_SECONDS` (15 min), atomic under concurrency. Trade-off: an attacker who knows a username can lock it; lockout is temporary and logged.
- [x] Login rate limit per IP (10/min) on top of the global limit (300/min/IP), shared across replicas via Redis.
- [x] Access tokens: HS256, 15 min, issuer/audience/alg pinned, `alg=none` rejected; secret ≥ 32 chars with rotation support (`JWT_ACCESS_SECRET_PREVIOUS`).
- [x] Every request re-checks `status` and `tokenVersion` (cached ≤ 60 s, invalidated on change): disable/role change/password reset take effect immediately.
- [x] Refresh tokens: 256-bit random, stored as SHA-256, rotated on every use, reuse after a 10 s grace window revokes the session; httpOnly, Secure, SameSite=Strict, path `/api/v1/auth`; absolute 14-day lifetime.
- [ ] **[action]** Serve the frontend and API on the same site (e.g. `app.example.com` + `api.example.com`) or SameSite=Strict cookies will not be sent.
- [ ] Consider MFA for `owner` and `general_manager` before go-live.

## Authorisation

- [x] Permission map in one file; services check permissions, not role names.
- [x] General managers cannot create, modify or promote to `owner`; nobody changes their own role/status; last active owner protected.
- [x] Cross-user resource access returns 404 (no existence disclosure).

## Input & output

- [x] Zod `.strict()` validation on params/query/headers/body; operator objects (`{"$ne": …}`) and unknown keys rejected (tests cover injection payloads).
- [x] No client-controlled sort fields, projections or filters beyond enumerated values; page size ≤ 100.
- [x] Response schemas filter output; `passwordHash` excluded by projection.
- [x] Body limit 1 MB (API) / 2 MB (proxy); JSON only.
- [x] Proto-poisoning protection (Fastify default: error on `__proto__`).

## Uploads (S3)

- [x] Private bucket; server-generated keys `uploads/<purpose>/<yyyy>/<mm>/<id>.<ext>`; client filenames never reach keys.
- [x] Presigned PUT valid 5 min, signing exact `Content-Length`, `Content-Type`, `If-None-Match: *` (no overwrite) and optional SHA-256.
- [x] `/complete` checks size, type, checksum and magic bytes; mismatches are queued for deletion.
- [x] Allow-list per purpose (JPEG/PNG/WebP/HEIC/PDF); no SVG/HTML (script-capable). Documents download as attachments.
- [ ] **[action]** Bucket: Block Public Access on, Object Ownership = BucketOwnerEnforced, default encryption SSE-S3 (or SSE-KMS), versioning optional, CORS restricted to the frontend origins, lifecycle rule `AbortIncompleteMultipartUpload` after 1 day. See `docs/deployment.md`.
- [ ] **[action]** IAM: the API principal may only `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/uploads/*`. Prefer an EC2 instance role / IAM Roles Anywhere over long-lived keys.
- [ ] Malware scanning is not implemented. If files are shared with external parties, add an asynchronous scan (e.g. ClamAV worker or GuardDuty Malware Protection for S3) before marking uploads `available`.

## Transport & headers

- [x] HTTPS via Caddy (automatic certificates), HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors 'none'`, CSP `default-src 'none'`, no `Server`/`X-Powered-By`.
- [x] CORS allow-list; `*` rejected in production config.
- [x] `TRUST_PROXY=1` behind exactly one proxy; `true` rejected in production (prevents IP spoofing in rate limits).

## Secrets & configuration

- [x] All config validated at startup; unsafe production values (wildcard CORS, insecure cookies, short metrics token) refuse to boot.
- [x] `.env*` git-ignored; `.env.example` placeholders only; Docker build context excludes `.env`.
- [ ] **[action]** Production secrets in `/opt/prayosha/.env.production` (`chmod 600`, owned by the deploy user) or a secret manager; never in shell history (`read -s`).
- [x] Separate MongoDB users: app (custom role: find/insert/update/remove only), migrator (readWrite + dbAdmin), backup (backup role), root (emergency only).

## Logging & monitoring

- [x] Structured JSON logs with request ids; authorization, cookies, passwords, tokens and connection strings redacted.
- [x] Security metrics: login failures, lockouts, refresh-token reuse → alert rules.
- [x] Health endpoints reveal no versions, hosts or errors; metrics require a token and are blocked at the proxy.

## Infrastructure

- [ ] **[action]** SSH: keys only, no root login, non-default user, `fail2ban` or provider firewall rate limiting.
- [ ] **[action]** Firewall: allow 22 (restricted source IPs if possible), 80, 443 only. MongoDB 27017 and Redis 6379 are never published (Docker-published ports bypass UFW).
- [ ] **[action]** Unattended security upgrades; patch MongoDB/Redis/Caddy/Node images monthly (rebuild the API image for Node patch releases).
- [x] Containers run as non-root, read-only root filesystem, all capabilities dropped, `no-new-privileges`.
- [x] CI runs `npm audit --omit=dev --audit-level=high`; dependency install scripts are denied (`allowScripts`).

## Known limitations

- Option A has no high availability (see `docs/database-design.md`).
- No WAF/bot protection beyond rate limits; put Cloudflare or AWS WAF in front if abuse appears.
- Per-user rate limiting is not implemented (limits are per IP; site offices behind one NAT share a budget — raise `RATE_LIMIT_GLOBAL_MAX` if needed).
- Access tokens remain valid until expiry after logout (≤ 15 min) unless the user's `tokenVersion` changes.
