import { MongoClient, type Db } from 'mongodb';
import type { AppConfig } from '../../config/env.js';
import type { Logger } from '../../observability/logger.js';
import type { Metrics } from '../../observability/metrics.js';

export interface MongoConnection {
  client: MongoClient;
  db: Db;
  ping(timeoutMs: number): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Creates the single MongoClient for this process. The driver maintains a
 * connection pool per server; one client must be shared by the whole process.
 * The total connections a deployment opens is
 * (API instances + worker instances) x maxPoolSize, so size the pool against
 * the server's connection limit, not per request volume.
 */
export async function connectMongo(
  config: AppConfig['mongo'],
  options: { appName: string; logger: Logger; metrics?: Metrics },
): Promise<MongoConnection> {
  const client = new MongoClient(config.uri, {
    appName: options.appName,
    maxPoolSize: config.maxPoolSize,
    minPoolSize: config.minPoolSize,
    maxIdleTimeMS: config.maxIdleTimeMs,
    maxConnecting: 2,
    serverSelectionTimeoutMS: config.serverSelectionTimeoutMs,
    connectTimeoutMS: config.connectTimeoutMs,
    socketTimeoutMS: config.socketTimeoutMs,
    retryReads: true,
    retryWrites: true,
    // Majority write concern: once a replica set is introduced, acknowledged
    // writes survive a primary failover. On a standalone it behaves like w:1.
    writeConcern: { w: 'majority' },
    readPreference: 'primary',
    monitorCommands: false,
  });

  const { metrics, logger } = options;
  if (metrics) {
    let checkedOut = 0;
    client.on('connectionCheckedOut', () => metrics.mongoPoolCheckedOut.set(++checkedOut));
    client.on('connectionCheckedIn', () => metrics.mongoPoolCheckedOut.set(Math.max(0, --checkedOut)));
    client.on('connectionCheckOutFailed', (event) =>
      metrics.mongoPoolCheckoutFailures.inc({ reason: event.reason }),
    );
  }
  client.on('serverHeartbeatFailed', (event) =>
    logger.warn({ connectionId: event.connectionId }, 'MongoDB heartbeat failed'),
  );
  client.on('topologyDescriptionChanged', (event) =>
    logger.info({ type: event.newDescription.type }, 'MongoDB topology changed'),
  );

  await client.connect();
  const db = client.db(config.dbName);
  logger.info({ db: config.dbName }, 'MongoDB connected');

  return {
    client,
    db,
    async ping(timeoutMs: number) {
      try {
        await db.command({ ping: 1 }, { timeoutMS: timeoutMs });
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await client.close();
      logger.info('MongoDB connection closed');
    },
  };
}
