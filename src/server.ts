import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createGracefulShutdown, installProcessHandlers, sleep } from './common/utils/shutdown.js';
import { connectMongo } from './infrastructure/mongodb/mongo-client.js';
import { closeRedis, createRedis, pingRedis, waitForRedis } from './infrastructure/redis/redis-client.js';
import { S3ObjectStorage } from './infrastructure/storage/s3-storage.js';
import { BullMqDispatcher } from './jobs/dispatcher.js';
import { createLogger } from './observability/logger.js';
import { createMetrics } from './observability/metrics.js';

/** API process composition root: create infrastructure, build app, listen. */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const metrics = createMetrics(config.serviceName);

  const mongo = await connectMongo(config.mongo, { appName: `${config.serviceName}-api`, logger, metrics });
  const cacheRedis = createRedis(config.redis, 'cache', logger);
  const queueRedis = createRedis(config.redis, 'queue-producer', logger);
  const storage = new S3ObjectStorage(config.s3);
  // Redis is not required to serve requests (degraded mode), so do not block
  // startup on it for long; BullMQ reconnects once Redis becomes available.
  await waitForRedis(queueRedis, 5000).catch(() =>
    logger.warn(
      'Redis not ready at startup; continuing in degraded mode (queue/rate-limit store unavailable)',
    ),
  );
  const dispatcher = new BullMqDispatcher(queueRedis, config.redis.keyPrefix, logger);
  const lifecycle = { shuttingDown: false };

  const app = await buildApp({
    config,
    logger,
    metrics,
    db: mongo.db,
    pingMongo: (ms) => mongo.ping(ms),
    redis: cacheRedis,
    pingRedis: (ms) => pingRedis(cacheRedis, ms),
    storage,
    dispatcher,
    lifecycle,
  });

  const shutdown = createGracefulShutdown({
    logger,
    timeoutMs: config.shutdown.timeoutMs,
    steps: [
      {
        // Fail readiness first and give the load balancer time to stop routing
        // new requests here before the listener closes.
        name: 'drain',
        run: async () => {
          lifecycle.shuttingDown = true;
          await sleep(config.shutdown.drainDelayMs);
        },
      },
      { name: 'http', run: () => app.close() },
      { name: 'queue', run: () => dispatcher.close() },
      {
        name: 'redis',
        run: async () => Promise.all([closeRedis(cacheRedis), closeRedis(queueRedis)]).then(() => undefined),
      },
      { name: 'mongodb', run: () => mongo.close() },
      {
        name: 's3',
        run: () => {
          storage.destroy();
          return Promise.resolve();
        },
      },
    ],
  });
  installProcessHandlers(shutdown, logger);

  await app.listen({ host: config.http.host, port: config.http.port });
}

main().catch((error: unknown) => {
  // Startup failure (bad config, database unreachable): log and exit non-zero
  // so the container restarts with backoff instead of serving partially.
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
