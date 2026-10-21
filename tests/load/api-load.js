// k6 load test for the Prayosha API. NEVER run against production.
//
//   k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROFILE=normal tests/load/api-load.js
//   docker run --rm -i --network host -v "$PWD/tests/load:/load" grafana/k6 run \
//     -e BASE_URL=http://127.0.0.1:3000 -e PROFILE=smoke /load/api-load.js
//
// Profiles: smoke | normal | burst | sustained | stress (see docs/performance-testing.md)
// Requires users seeded by `npm run load:seed` (loadtest.000 ... loadtest.NNN).
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const PROFILE = __ENV.PROFILE || 'smoke';
const USERS = Number(__ENV.LOAD_USERS || 50);
const PASSWORD = __ENV.LOAD_PASSWORD || 'load-test-password-1';
// SCALE < 1 shortens every stage proportionally (e.g. 0.25 for a quick run on a laptop).
const SCALE = Number(__ENV.SCALE || 1);
const scaled = (d) => `${Math.max(1, Math.round(parseInt(d, 10) * (d.endsWith('m') ? 60 : 1) * SCALE))}s`;

if (/prayosha\.(com|in)|\.prod\./.test(BASE_URL) && __ENV.I_KNOW_THIS_IS_NOT_PRODUCTION !== 'yes') {
  fail(`Refusing to load test what looks like production: ${BASE_URL}`);
}

const listLatency = new Trend('list_uploads_duration', true);
const presignLatency = new Trend('presign_duration', true);
const meLatency = new Trend('me_duration', true);
const businessErrors = new Rate('business_errors');

const PROFILES = {
  smoke: {
    executor: 'constant-vus',
    vus: 2,
    duration: '30s',
  },
  // Typical working day: ramp to a steady population of active users.
  normal: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
  // Shift change / morning sync: sudden spike in request rate.
  burst: {
    executor: 'ramping-arrival-rate',
    startRate: 20,
    timeUnit: '1s',
    preAllocatedVUs: 100,
    maxVUs: 400,
    stages: [
      { duration: '30s', target: 20 },
      { duration: '10s', target: 300 },
      { duration: '1m', target: 300 },
      { duration: '30s', target: 20 },
    ],
  },
  // Capacity search: raise the arrival rate until latency/errors break (expected to fail thresholds).
  stress: {
    executor: 'ramping-arrival-rate',
    startRate: 100,
    timeUnit: '1s',
    preAllocatedVUs: 200,
    maxVUs: 1000,
    stages: [
      { duration: '1m', target: 1000 },
      { duration: '1m', target: 2500 },
      { duration: '1m', target: 4000 },
    ],
  },
  // Soak: finds leaks, pool exhaustion and slow degradation.
  sustained: {
    executor: 'constant-arrival-rate',
    rate: 100,
    timeUnit: '1s',
    duration: '30m',
    preAllocatedVUs: 100,
    maxVUs: 300,
  },
};

const scenario = { ...PROFILES[PROFILE] };
if (scenario.duration) scenario.duration = scaled(scenario.duration);
if (scenario.stages)
  scenario.stages = scenario.stages.map((stage) => ({ ...stage, duration: scaled(stage.duration) }));

export const options = {
  scenarios: { [PROFILE]: scenario },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<1000'],
    list_uploads_duration: ['p(95)<250'],
    business_errors: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Log in once per test (Argon2 login is intentionally expensive) and share tokens.
export function setup() {
  const tokens = [];
  for (let i = 0; i < USERS; i++) {
    const username = `loadtest.${String(i).padStart(3, '0')}`;
    const res = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({ username, password: PASSWORD }), {
      headers: { 'content-type': 'application/json' },
      tags: { name: 'login' },
    });
    if (res.status !== 200) fail(`login failed for ${username}: ${res.status} ${res.body}`);
    tokens.push(res.json('data.accessToken'));
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[exec.vu.idInTest % data.tokens.length];
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const roll = Math.random();

  if (roll < 0.6) {
    // Most frequent: browse my uploads (indexed, keyset paginated).
    const res = http.get(`${BASE_URL}/api/v1/uploads?limit=20`, { headers, tags: { name: 'list_uploads' } });
    listLatency.add(res.timings.duration);
    const ok = check(res, { 'list 200': (r) => r.status === 200 });
    businessErrors.add(!ok);
    const cursor = ok ? res.json('page.nextCursor') : null;
    if (cursor && Math.random() < 0.3) {
      const next = http.get(`${BASE_URL}/api/v1/uploads?limit=20&cursor=${encodeURIComponent(cursor)}`, {
        headers,
        tags: { name: 'list_uploads_page2' },
      });
      check(next, { 'page 2 200': (r) => r.status === 200 });
    }
  } else if (roll < 0.85) {
    const res = http.get(`${BASE_URL}/api/v1/auth/me`, { headers, tags: { name: 'me' } });
    meLatency.add(res.timings.duration);
    businessErrors.add(!check(res, { 'me 200': (r) => r.status === 200 }));
  } else {
    // Presign only; bytes go to S3, not through the API.
    const body = JSON.stringify({
      purpose: 'snag_photo',
      contentType: 'image/jpeg',
      size: 250000,
      filename: 'site.jpg',
    });
    const res = http.post(`${BASE_URL}/api/v1/uploads`, body, { headers, tags: { name: 'presign' } });
    presignLatency.add(res.timings.duration);
    businessErrors.add(!check(res, { 'presign 201': (r) => r.status === 201 }));
  }
  // Closed-model profiles simulate people: think time between actions.
  if (PROFILE === 'normal') sleep(1 + Math.random() * 2);
}
