import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { safeEqual } from '../../common/utils/crypto.js';
import type { JobDispatcher } from '../../jobs/dispatcher.js';
import type { Metrics } from '../../observability/metrics.js';

export interface HealthDependencies {
  pingMongo(timeoutMs: number): Promise<boolean>;
  pingRedis(timeoutMs: number): Promise<boolean>;
  isShuttingDown(): boolean;
}

const CHECK_TIMEOUT_MS = 1000;
const status = z.enum(['up', 'down']);

/**
 * Liveness: the process can serve HTTP. Never checks dependencies, so a
 * database outage does not make the orchestrator restart healthy processes.
 *
 * Readiness: this instance should receive traffic. Fails while shutting down
 * and when MongoDB is unreachable. Redis is reported but does not fail
 * readiness: without it the API degrades (rate limits fall back, cache misses,
 * deletions are swept later) rather than stopping.
 *
 * Responses carry no versions, hostnames or error text.
 */
export const healthRoutes: FastifyPluginAsyncZod<{ deps: HealthDependencies }> = (app, { deps }) => {
  app.get(
    '/health/live',
    {
      config: { rateLimit: false },
      logLevel: 'warn',
      schema: { tags: ['health'], response: { 200: z.object({ status: z.literal('ok') }) } },
    },
    () => ({ status: 'ok' as const }),
  );

  app.get(
    '/health/ready',
    {
      config: { rateLimit: false },
      logLevel: 'warn',
      schema: {
        tags: ['health'],
        response: {
          '2xx': z.object({
            status: z.enum(['ready', 'not_ready']),
            checks: z.object({ mongodb: status, redis: status }),
          }),
          503: z.object({
            status: z.enum(['ready', 'not_ready']),
            checks: z.object({ mongodb: status, redis: status }),
          }),
        },
      },
    },
    async (_request, reply) => {
      const [mongoUp, redisUp] = await Promise.all([
        deps.pingMongo(CHECK_TIMEOUT_MS),
        deps.pingRedis(CHECK_TIMEOUT_MS),
      ]);
      const ready = mongoUp && !deps.isShuttingDown();
      return reply.status(ready ? 200 : 503).send({
        status: ready ? 'ready' : 'not_ready',
        checks: { mongodb: mongoUp ? 'up' : 'down', redis: redisUp ? 'up' : 'down' },
      });
    },
  );

  return Promise.resolve();
};

/**
 * Prometheus scrape endpoint, disabled unless METRICS_TOKEN is set. The
 * reverse proxy must also block /internal/* from the public internet.
 */
export const metricsRoutes: FastifyPluginAsyncZod<{
  metrics: Metrics;
  token: string;
  dispatcher: JobDispatcher;
}> = (app, { metrics, token, dispatcher }) => {
  app.get(
    '/internal/metrics',
    { config: { rateLimit: false }, logLevel: 'warn', schema: { hide: true } },
    async (request, reply) => {
      const header = request.headers.authorization ?? '';
      if (!safeEqual(header, `Bearer ${token}`)) {
        return reply.status(404).send();
      }
      try {
        for (const { queue, counts } of await dispatcher.getQueueCounts()) {
          for (const [state, value] of Object.entries(counts)) metrics.queueJobs.set({ queue, state }, value);
        }
      } catch {
        // Queue depth is best effort; Redis may be down.
      }
      return reply
        .header('content-type', metrics.registry.contentType)
        .send(await metrics.registry.metrics());
    },
  );
  return Promise.resolve();
};
