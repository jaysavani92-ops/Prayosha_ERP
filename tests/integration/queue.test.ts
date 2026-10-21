import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMqDispatcher } from '../../src/jobs/dispatcher.js';
import { JOBS, QUEUES } from '../../src/jobs/queues/definitions.js';

/**
 * Real BullMQ semantics against a real Redis. Runs only when TEST_REDIS_URL is
 * set (CI provides a Redis service container); a throwaway key prefix keeps
 * runs isolated. Never point this at a production Redis.
 */
const redisUrl = process.env.TEST_REDIS_URL;

describe.skipIf(!redisUrl)('BullMQ integration', () => {
  const prefix = `test-${randomUUID()}:`;
  let connection: Redis;
  let workerConnection: Redis;
  let dispatcher: BullMqDispatcher;

  beforeAll(() => {
    connection = new Redis(redisUrl!, { maxRetriesPerRequest: 1 });
    workerConnection = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    dispatcher = new BullMqDispatcher(connection, prefix);
  });
  afterAll(async () => {
    await dispatcher.uploadsQueue.obliterate({ force: true });
    await dispatcher.close();
    connection.disconnect();
    workerConnection.disconnect();
  });

  it('deduplicates dispatches with the same job id while the job exists', async () => {
    const id = '65f0000000000000000000aa';
    await dispatcher.dispatchUploadDeletion(id, { delayMs: 60_000 });
    await dispatcher.dispatchUploadDeletion(id, { delayMs: 60_000 });
    const delayed = await dispatcher.uploadsQueue.getDelayed();
    expect(delayed.filter((job) => job.data.uploadId === id)).toHaveLength(1);
    const counts = await dispatcher.getQueueCounts();
    expect(counts[0]?.counts.delayed).toBeGreaterThanOrEqual(1);
  });

  it('retries a failing job and does not lose it; unrecoverable errors fail without retrying', async () => {
    const queueName = `${QUEUES.uploads}-retry`;
    const queue = new Queue(queueName, { connection, prefix });
    const events = new QueueEvents(queueName, { connection: workerConnection.duplicate(), prefix });
    await events.waitUntilReady();
    const attempts = new Map<string, number>();
    const worker = new Worker(
      queueName,
      (job: Job<{ mode: string }>) => {
        const n = (attempts.get(job.id!) ?? 0) + 1;
        attempts.set(job.id!, n);
        if (job.data.mode === 'flaky' && n < 3) throw new Error('transient failure');
        if (job.data.mode === 'poison') throw new UnrecoverableError('bad payload');
        return Promise.resolve('ok');
      },
      { connection: workerConnection, prefix, concurrency: 2 },
    );
    try {
      const options = { attempts: 5, backoff: { type: 'fixed', delay: 50 }, removeOnFail: { age: 3600 } };
      const flaky = await queue.add(JOBS.deleteUploadObject, { mode: 'flaky' }, options);
      const poison = await queue.add(JOBS.deleteUploadObject, { mode: 'poison' }, options);
      await expect(flaky.waitUntilFinished(events, 10_000)).resolves.toBe('ok');
      await expect(poison.waitUntilFinished(events, 10_000)).rejects.toThrow('bad payload');
      expect(attempts.get(flaky.id!)).toBe(3);
      expect(attempts.get(poison.id!)).toBe(1);
      // Permanently failed jobs are retained for inspection and manual retry.
      const failed = await queue.getFailed();
      expect(failed.map((job) => job.id)).toContain(poison.id);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
