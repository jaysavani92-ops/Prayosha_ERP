import { createServer } from 'node:http';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { ZodError } from 'zod';
import { loadConfig } from './config/env.js';
import { systemClock } from './common/utils/clock.js';
import { safeEqual } from './common/utils/crypto.js';
import { createGracefulShutdown, installProcessHandlers } from './common/utils/shutdown.js';
import { connectMongo } from './infrastructure/mongodb/mongo-client.js';
import { closeRedis, createRedis, waitForRedis } from './infrastructure/redis/redis-client.js';
import { S3ObjectStorage } from './infrastructure/storage/s3-storage.js';
import { BullMqDispatcher } from './jobs/dispatcher.js';
import { JOBS, QUEUES, cleanupUploadsPayload, deleteUploadObjectPayload } from './jobs/queues/definitions.js';
import { UploadJobs } from './jobs/workers/upload-jobs.js';
import { UploadsRepository } from './modules/uploads/uploads.repository.js';
import { createLogger } from './observability/logger.js';
import { createMetrics } from './observability/metrics.js';

/**
 * Worker process composition root. Runs separately from the API so slow jobs
 * never compete with request handling, and so it can be scaled independently.
 * Multiple worker replicas are safe: BullMQ hands each job to one worker and
 * the job scheduler is deduplicated by id.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ ...config, serviceName: `${config.serviceName}-worker` });
  const metrics = createMetrics(`${config.serviceName}-worker`);

  const mongo = await connectMongo(config.mongo, {
    appName: `${config.serviceName}-worker`,
    logger,
    metrics,
  });
  const workerRedis = createRedis(config.redis, 'queue-worker', logger);
  const producerRedis = createRedis(config.redis, 'queue-producer', logger);
  const storage = new S3ObjectStorage(config.s3);
  // The worker is useless without Redis: fail startup (and let the restart
  // policy retry) rather than run without a queue.
  await Promise.all([waitForRedis(workerRedis, 30_000), waitForRedis(producerRedis, 30_000)]);
  const dispatcher = new BullMqDispatcher(producerRedis, config.redis.keyPrefix, logger);
  const jobs = new UploadJobs({
    config: config.s3,
    uploads: new UploadsRepository(mongo.db, config.mongo.queryTimeoutMs),
    storage,
    dispatcher,
    clock: systemClock,
    logger,
  });

  const route = async (job: Job): Promise<unknown> => {
    switch (job.name) {
      case JOBS.deleteUploadObject:
        return jobs.deleteObject(deleteUploadObjectPayload.parse(job.data));
      case JOBS.cleanupUploads:
        cleanupUploadsPayload.parse(job.data);
        return jobs.cleanup();
      default:
        throw new UnrecoverableError(`Unknown job: ${job.name}`);
    }
  };
  const processor = async (job: Job): Promise<unknown> => {
    try {
      return await route(job);
    } catch (error) {
      // A malformed payload will never succeed: fail it permanently (kept in
      // the failed set for inspection) instead of burning every retry.
      if (error instanceof ZodError) throw new UnrecoverableError(`Invalid payload for ${job.name}`);
      throw error;
    }
  };

  const worker = new Worker(QUEUES.uploads, processor, {
    connection: workerRedis,
    prefix: `${config.redis.keyPrefix}bull`,
    concurrency: config.worker.concurrency,
    // A job whose lock is not renewed within lockDuration (worker crashed or
    // event loop blocked) is "stalled" and returned to the queue; after
    // maxStalledCount stalls it is failed and kept for inspection.
    lockDuration: 60_000,
    stalledInterval: 30_000,
    maxStalledCount: 2,
  });
  worker.on('completed', (job) => {
    metrics.jobsProcessed.inc({ queue: QUEUES.uploads, outcome: 'completed' });
    logger.debug({ jobId: job.id, name: job.name }, 'Job completed');
  });
  worker.on('failed', (job, error) => {
    const exhausted = job ? job.attemptsMade >= (job.opts.attempts ?? 1) : true;
    metrics.jobsProcessed.inc({ queue: QUEUES.uploads, outcome: exhausted ? 'failed' : 'retrying' });
    const log = exhausted ? logger.error.bind(logger) : logger.warn.bind(logger);
    log(
      { err: error, jobId: job?.id, name: job?.name, attempts: job?.attemptsMade },
      exhausted ? 'Job failed permanently' : 'Job failed; will retry',
    );
  });
  worker.on('stalled', (jobId) => logger.warn({ jobId }, 'Job stalled; returned to queue'));
  worker.on('error', (error) => logger.error({ err: error }, 'Worker error'));

  await dispatcher.uploadsQueue.upsertJobScheduler(
    'uploads-cleanup',
    { pattern: config.worker.uploadCleanupCron },
    {
      name: JOBS.cleanupUploads,
      data: {},
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    },
  );

  // Minimal health/metrics endpoint for the container orchestrator and Prometheus.
  const health = createServer((request, response) => {
    void (async () => {
      if (request.url === '/health/live') {
        response.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
      } else if (request.url === '/health/ready') {
        const ready = worker.isRunning() && (await mongo.ping(1000));
        response
          .writeHead(ready ? 200 : 503, { 'content-type': 'application/json' })
          .end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
      } else if (
        request.url === '/internal/metrics' &&
        config.metricsToken &&
        safeEqual(request.headers.authorization ?? '', `Bearer ${config.metricsToken}`)
      ) {
        response
          .writeHead(200, { 'content-type': metrics.registry.contentType })
          .end(await metrics.registry.metrics());
      } else {
        response.writeHead(404).end();
      }
    })().catch(() => {
      response.writeHead(500).end();
    });
  });
  health.listen(config.worker.healthPort, config.http.host);

  const shutdown = createGracefulShutdown({
    logger,
    timeoutMs: config.shutdown.timeoutMs,
    steps: [
      // close() stops fetching new jobs and waits for active ones to finish.
      { name: 'worker', run: () => worker.close() },
      { name: 'health', run: () => new Promise<void>((resolve) => health.close(() => resolve())) },
      { name: 'queue', run: () => dispatcher.close() },
      {
        name: 'redis',
        run: () => Promise.all([closeRedis(workerRedis), closeRedis(producerRedis)]).then(() => undefined),
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
  logger.info({ concurrency: config.worker.concurrency }, 'Worker started');
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
