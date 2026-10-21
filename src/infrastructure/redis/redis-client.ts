import { Redis } from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import type { Logger } from '../../observability/logger.js';

export type RedisRole = 'cache' | 'queue-producer' | 'queue-worker';

/**
 * Redis connections are role specific because their failure semantics differ:
 *  - cache / rate limiting: fail fast (no offline queue, bounded command timeout)
 *    so a Redis outage degrades features instead of stalling requests.
 *  - queue-producer: fail fast so an API request never hangs on enqueue.
 *  - queue-worker: BullMQ requires maxRetriesPerRequest=null on blocking
 *    connections so workers survive Redis restarts.
 */
export function createRedis(config: AppConfig['redis'], role: RedisRole, logger: Logger): Redis {
  const worker = role === 'queue-worker';
  const client = new Redis(config.url, {
    connectionName: `prayosha:${role}`,
    lazyConnect: false,
    enableOfflineQueue: worker,
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 5000,
    // A command timeout would abort the worker's long-running blocking commands.
    ...(worker ? {} : { commandTimeout: config.commandTimeoutMs }),
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    reconnectOnError: (error) => error.message.includes('READONLY'),
  });
  let lastErrorLoggedAt = 0;
  client.on('error', (error: Error) => {
    // Reconnect loops can emit an error every retry; log at most every 10s.
    const now = Date.now();
    if (now - lastErrorLoggedAt > 10_000) {
      lastErrorLoggedAt = now;
      logger.warn({ err: error, role }, 'Redis connection error');
    }
  });
  client.on('ready', () => logger.info({ role }, 'Redis ready'));
  return client;
}

/**
 * Resolves once the connection is ready. BullMQ issues commands as soon as a
 * Queue is constructed, which fails on a fail-fast connection (no offline
 * queue) that has not connected yet, so callers await this first.
 */
export function waitForRedis(client: Redis, timeoutMs: number): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Redis not ready after ${timeoutMs}ms`));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      client.off('ready', onReady);
    };
    client.on('ready', onReady);
  });
}

export async function pingRedis(client: Pick<Redis, 'ping'>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Redis ping timeout'));
        }, timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function closeRedis(client: Redis): Promise<void> {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
