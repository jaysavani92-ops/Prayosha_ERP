# Performance testing

Audience: engineers measuring capacity and anyone making infrastructure decisions from the numbers.

## Method

Tool: k6 (`tests/load/api-load.js`). Data: `npm run load:seed`. The script logs each seeded user in once in `setup()` (Argon2 login is intentionally expensive and rate limited) and then drives a weighted mix that mirrors expected use:

| Share | Request                                                                | Why it matters                                                                |
| ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 60 %  | `GET /api/v1/uploads?limit=20` (+30 % of those fetch page 2 by cursor) | most frequent read; indexed keyset pagination over a large collection         |
| 25 %  | `GET /api/v1/auth/me`                                                  | cheapest authenticated path: JWT verify + auth-state cache + one indexed read |
| 15 %  | `POST /api/v1/uploads` (presign)                                       | write path: insert + local SigV4 signing (no S3 round trip)                   |

Profiles:

| Profile     | Model                                    | Shape                            | Purpose                                                 |
| ----------- | ---------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `smoke`     | closed, 2 VUs, no think time             | 30 s                             | wiring check; per-request latency floor                 |
| `normal`    | closed, ramp to 50 VUs, 1–3 s think time | 1 m ramp, 5 m hold, 1 m down     | a working day's concurrent users                        |
| `burst`     | open, 20 → 300 req/s in 10 s             | 30 s, 10 s spike, 1 m hold, 30 s | shift start / morning sync                              |
| `sustained` | open, 100 req/s                          | 30 m                             | leaks, pool exhaustion, slow degradation                |
| `stress`    | open, 100 → 4000 req/s                   | 3 × 1 m ramps                    | find the saturation point (expected to fail thresholds) |

`SCALE=<0..1>` shortens every stage proportionally for quick runs. Thresholds: error rate < 1 %, p95 < 300 ms, p99 < 1 s, list p95 < 250 ms.

Rules: never target production; raise `RATE_LIMIT_GLOBAL_MAX` for the test (all virtual users share one IP); record hardware, data volume, versions and configuration with every result; separate measured numbers from estimates.

```bash
LOAD_USERS=50 LOAD_UPLOADS_PER_USER=2000 npm run load:seed
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROFILE=normal \
  --summary-export tests/load/results/normal.json tests/load/api-load.js
```

Watch during runs: `/internal/metrics` (route latency histograms, `mongodb_pool_checked_out_connections`, `mongodb_pool_checkout_failures_total`, event-loop lag), process CPU/RSS, `db.serverStatus().connections`, Redis `INFO`.

## Results

### Run 1 — 2026-10-21, developer laptop (measured)

**This is not production capacity.** Everything ran on one laptop: k6, API, worker, MongoDB and Redis competed for the same CPUs over loopback, with no TLS and no reverse proxy, and the dataset fits in RAM. Use these numbers as a regression baseline and for relative comparisons, not for sizing a VPS.

|          |                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hardware | Apple M4 (4 performance + 6 efficiency cores), 16 GiB RAM, macOS 27.0.1                                                                                                   |
| Software | Node.js 24.22.0 (compiled `dist/`, `NODE_ENV=production`), 1 API process, 1 worker, MongoDB 8.2.12 standalone with auth (WiredTiger cache 0.5 GB), Redis 8.10.2, k6 2.3.0 |
| Config   | `MONGODB_MAX_POOL_SIZE=20`, `UV_THREADPOOL_SIZE=4`, rate limit raised to 10M/min, everything else default                                                                 |
| Data     | 50 users, 100,000 upload records (2,000 per user), indexes from `index-specs.ts`                                                                                          |
| Mix      | as in Method (list 60 %, me 25 %, presign 15 %)                                                                                                                           |

| Profile (as run)                                                | Requests | Throughput      | p50     | p95     | p99     | max    | Errors       | API CPU avg / max | MongoDB CPU avg / max | Mongo conns |
| --------------------------------------------------------------- | -------- | --------------- | ------- | ------- | ------- | ------ | ------------ | ----------------- | --------------------- | ----------- |
| smoke — 2 VUs, 30 s                                             | 43,380   | 1,401 req/s     | 0.65 ms | 4.04 ms | 4.40 ms | 26 ms  | 0 %          | —                 | —                     | —           |
| normal — `SCALE=0.5` (30 s ramp, 2.5 min at 50 VUs, think time) | 5,315    | 25 req/s        | 2.54 ms | 5.11 ms | 18.8 ms | 30 ms  | 0 %          | 5 % / 34 %        | 1 % / 3 %             | 9           |
| burst — full (20 → 300 it/s)                                    | 29,561   | 226 req/s avg   | 1.13 ms | 2.94 ms | 5.14 ms | 197 ms | 0 %          | 16 % / 29 %       | 4 % / 8 %             | 14          |
| sustained — `SCALE=0.1` (3 min at 100 it/s)                     | 21,331   | 117 req/s       | 1.63 ms | 3.83 ms | 13.7 ms | 211 ms | 0 %          | 14 % / 52 %       | 4 % / 6 %             | 10          |
| stress — 3 min, 100 → 4,000 it/s                                | 391,472  | 2,162 req/s avg | 4.83 ms | 55.7 ms | 140 ms  | 839 ms | 0.05 % (219) | 59 % / 138 %      | 24 % / 56 %           | 26          |

CPU is per-process `ps` sampling (100 % = one core); "it/s" = iterations per second (one iteration is 1 request, or 2 when it fetches page 2). Raw k6 summaries: `tests/load/results/*.json`.

**Observations**

- All thresholds passed in every profile. The server returned only 200/201 during the whole stress run: no 5xx responses, no load shedding (`under-pressure` never triggered) and no error-level log lines in the API or worker.
- The 219 stress errors were client-side TCP connection resets at connect time, in two bursts while k6 opened hundreds of new connections. They match macOS's listen backlog (`kern.ipc.somaxconn = 128`) overflowing; Linux defaults to 4096. **Inferred, not proven**: re-test on Linux.
- **Bottleneck: the single API process's CPU (event loop).** Around 2,000+ req/s for this mix, API CPU passed one core and tail latency rose (p95 56 ms, p99 140 ms), while MongoDB used at most 56 % of a core and Redis 18 %. Scaling lever: more API replicas, not database changes.
- Keyset pagination stayed flat: list p95 was 3–5 ms at 2,000 records per owner across all non-stress profiles.
- API memory: 215–235 MB RSS in normal operation, 440 MB peak under stress (container limit is 512 MB — revisit if replicas run hotter).

**Not measured yet**

- Login throughput. Argon2id is deliberately expensive; only the 50 setup logins ran. Measure the hash time on the target VPS CPU and run a login-only scenario before sizing.
- Behaviour behind Caddy with TLS, on Linux, on the production VPS size.
- Upload byte transfer (goes to S3 directly, not through the API) and worker throughput under deletion bursts.
- A real 30-minute soak (`PROFILE=sustained` without `SCALE`).

### Next run (to do before go-live)

On a staging VPS identical to production: full-length `normal`, `burst`, `sustained` (30 min) and `stress`, through Caddy, with production data volume. Record the results here in the same table format.
