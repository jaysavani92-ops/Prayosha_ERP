---
name: performance-load-testing
description: Use when measuring or improving Prayosha API performance — running k6 load profiles, interpreting latency/throughput/error results, finding bottlenecks (CPU, MongoDB, Redis, pool limits), or deciding whether infrastructure changes are justified.
---

# Performance and load testing

## Purpose

Replace guesses with measurements: reproducible load profiles, recorded environment and results, and bottlenecks identified before anyone buys hardware.

## When to use

Before go-live, before/after changes on hot paths (auth, lists, presign), when latency alerts fire, and before any scaling decision.

## Workflow

1. **Environment**: local stack or staging that mirrors production sizes. Never production. Record CPU model/cores, RAM, disk, OS, Node/MongoDB/Redis versions, replica counts, pool sizes.
2. **Data**: `LOAD_USERS=50 LOAD_UPLOADS_PER_USER=200 npm run load:seed` (refuses production/remote hosts). Use volumes close to expected production size.
3. **Config for the test**: raise `RATE_LIMIT_GLOBAL_MAX` (all VUs share one IP); keep everything else as in production.
4. **Run** profiles in order: `smoke` → `normal` → `burst` → `sustained`:
   `k6 run -e BASE_URL=... -e PROFILE=normal --summary-export tests/load/results/normal.json tests/load/api-load.js`
5. **Observe during the run**: `/internal/metrics` (p95 by route, pool checkout failures, event loop lag via process metrics), `docker stats` (CPU/RAM per container), `db.serverStatus().connections`, `mongostat`, Redis `INFO`.
6. **Analyse**: which resource saturates first? Typical order here: Argon2 (login) CPU → MongoDB cache/IO → API CPU. Check slow routes with `explain()` before scaling.
7. **Record** in `docs/performance-testing.md`: environment, data, profile, duration, VUs/arrival rate, throughput, p50/p95/p99, error rate, CPU/RAM, DB connections, queue backlog. Mark estimates as estimates.
8. Change one variable, re-run, compare.

## Validation checklist

- [ ] Target is not production; seed refused remote hosts unless staging was explicit.
- [ ] Results file and environment recorded; measured vs. estimated clearly separated.
- [ ] Thresholds (`http_req_failed < 1%`, p95/p99) checked, failures explained.
- [ ] Bottleneck identified with evidence before recommending infrastructure.

## Relevant files

`tests/load/api-load.js`, `scripts/load/seed-load-test.ts`, `docs/performance-testing.md`, `docs/scaling-roadmap.md`, `src/observability/metrics.ts`, `docker/monitoring/*`.
