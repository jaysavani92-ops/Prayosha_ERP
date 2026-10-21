/**
 * Writes the OpenAPI 3.1 contract to docs/openapi.json without starting
 * servers or opening connections (the MongoDB client is never connected).
 *
 *   npm run openapi:export
 */
import { writeFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createLogger } from '../observability/logger.js';
import { createMetrics } from '../observability/metrics.js';

const config = loadConfig({
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  API_DOCS_ENABLED: 'true',
  MONGODB_URI: 'mongodb://127.0.0.1:1/openapi',
  REDIS_URL: 'redis://127.0.0.1:1',
  JWT_ACCESS_SECRET: 'openapi-export-only-openapi-export-only',
  S3_BUCKET: 'openapi-export',
  S3_REGION: 'us-east-1',
});
const client = new MongoClient(config.mongo.uri);
const unused = () => Promise.reject(new Error('not available during OpenAPI export'));

const app = await buildApp({
  config,
  logger: createLogger({ ...config, env: 'production' }),
  metrics: createMetrics('openapi'),
  db: client.db('openapi'),
  pingMongo: () => Promise.resolve(false),
  redis: null,
  pingRedis: () => Promise.resolve(false),
  storage: {
    createUploadUrl: unused,
    headObject: unused,
    readPrefix: unused,
    createDownloadUrl: unused,
    deleteObject: unused,
  },
  dispatcher: { dispatchUploadDeletion: unused, getQueueCounts: unused, close: () => Promise.resolve() },
  lifecycle: { shuttingDown: false },
});
await app.ready();
await writeFile('docs/openapi.json', `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
console.log('wrote docs/openapi.json');
