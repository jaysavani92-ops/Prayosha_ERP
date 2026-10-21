import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * One registry per process (API or worker). Label values are bounded: routes
 * use the route template (e.g. /api/v1/uploads/:id), never the raw URL, so
 * cardinality cannot be driven by clients.
 */
export function createMetrics(serviceName: string) {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });
  collectDefaultMetrics({ register: registry });

  return {
    registry,
    httpRequestDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency by route template',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    mongoPoolCheckedOut: new Gauge({
      name: 'mongodb_pool_checked_out_connections',
      help: 'MongoDB connections currently checked out of the pool',
      registers: [registry],
    }),
    mongoPoolCheckoutFailures: new Counter({
      name: 'mongodb_pool_checkout_failures_total',
      help: 'Failed attempts to check a connection out of the MongoDB pool',
      labelNames: ['reason'] as const,
      registers: [registry],
    }),
    queueJobs: new Gauge({
      name: 'queue_jobs',
      help: 'Jobs per queue and state (sampled at scrape time)',
      labelNames: ['queue', 'state'] as const,
      registers: [registry],
    }),
    jobsProcessed: new Counter({
      name: 'jobs_processed_total',
      help: 'Jobs finished by the worker, by outcome',
      labelNames: ['queue', 'outcome'] as const,
      registers: [registry],
    }),
    authEvents: new Counter({
      name: 'auth_events_total',
      help: 'Authentication events (login success/failure, lockouts, token reuse)',
      labelNames: ['event'] as const,
      registers: [registry],
    }),
    cacheRequests: new Counter({
      name: 'cache_requests_total',
      help: 'Cache lookups by cache name and result',
      labelNames: ['cache', 'result'] as const,
      registers: [registry],
    }),
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
