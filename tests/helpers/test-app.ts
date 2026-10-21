import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { inject } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import type { Role } from '../../src/common/constants/roles.js';
import { MIGRATIONS } from '../../src/database/migrations/index.js';
import { runMigrations } from '../../src/database/migrations/runner.js';
import { createLogger } from '../../src/observability/logger.js';
import { createMetrics } from '../../src/observability/metrics.js';
import { Collections } from '../../src/database/collections.js';
import type { UserDocument } from '../../src/modules/users/users.types.js';
import { FastTestHasher, InMemoryStorage, MutableClock, RecordingDispatcher } from './fakes.js';

export const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  MONGODB_URI: 'mongodb://127.0.0.1:1/unused',
  REDIS_URL: 'redis://127.0.0.1:1',
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
  S3_BUCKET: 'test-bucket',
  S3_REGION: 'ap-south-1',
  CORS_ORIGINS: 'https://app.prayosha.test',
  REFRESH_COOKIE_SECURE: 'false',
  API_DOCS_ENABLED: 'false',
  RATE_LIMIT_LOGIN_MAX: '1000',
  RATE_LIMIT_GLOBAL_MAX: '100000',
};

export function testConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

/** Connects to the test mongod and creates a fresh, migrated database. */
export async function createTestDb(): Promise<{ client: MongoClient; db: Db }> {
  const uri = inject('mongoUri');
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/?$/.test(uri)) {
    throw new Error(`Refusing to run tests against non-local MongoDB: ${uri}`);
  }
  const client = await MongoClient.connect(uri);
  const db = client.db(`test_${randomUUID().replaceAll('-', '')}`);
  await runMigrations(db, MIGRATIONS, { info: () => undefined, warn: () => undefined });
  return { client, db };
}

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  client: MongoClient;
  storage: InMemoryStorage;
  dispatcher: RecordingDispatcher;
  clock: MutableClock;
  lifecycle: { shuttingDown: boolean };
  mongoUp: { value: boolean };
  close(): Promise<void>;
}

export async function createTestApp(
  overrides: NodeJS.ProcessEnv = {},
  options: { beforeReady?: (app: FastifyInstance) => void } = {},
): Promise<TestContext> {
  const { client, db } = await createTestDb();
  const config = testConfig(overrides);
  const storage = new InMemoryStorage();
  const dispatcher = new RecordingDispatcher();
  const clock = new MutableClock(new Date());
  const lifecycle = { shuttingDown: false };
  const mongoUp = { value: true };
  const app = await buildApp({
    config,
    logger: createLogger(config),
    metrics: createMetrics('test'),
    db,
    pingMongo: () => Promise.resolve(mongoUp.value),
    redis: null,
    pingRedis: () => Promise.resolve(false),
    storage,
    dispatcher,
    lifecycle,
    clock,
    hasher: new FastTestHasher(),
  });
  options.beforeReady?.(app);
  await app.ready();
  return {
    app,
    db,
    client,
    storage,
    dispatcher,
    clock,
    lifecycle,
    mongoUp,
    async close() {
      await app.close();
      await db.dropDatabase();
      await client.close();
    },
  };
}

/** Inserts a user directly (bypassing the API) with the FastTestHasher scheme. */
export async function seedUser(
  ctx: Pick<TestContext, 'db'>,
  input: { username: string; role: Role; password?: string; status?: 'active' | 'disabled' },
): Promise<UserDocument> {
  const now = new Date();
  const user: UserDocument = {
    _id: new ObjectId(),
    username: input.username,
    displayName: input.username,
    role: input.role,
    status: input.status ?? 'active',
    passwordHash: await new FastTestHasher().hash(input.password ?? 'correct-horse-battery'),
    passwordChangedAt: now,
    tokenVersion: 0,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  };
  await ctx.db.collection<UserDocument>(Collections.users).insertOne(user);
  return user;
}

export interface LoggedIn {
  accessToken: string;
  refreshCookie: string;
  auth: { authorization: string };
}

export async function login(
  app: FastifyInstance,
  username: string,
  password = 'correct-horse-battery',
): Promise<LoggedIn> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username, password },
  });
  if (response.statusCode !== 200) throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  const accessToken = response.json<{ data: { accessToken: string } }>().data.accessToken;
  const cookie = response.cookies.find((c) => c.name === 'prayosha_rt');
  if (!cookie) throw new Error('refresh cookie missing');
  return { accessToken, refreshCookie: cookie.value, auth: { authorization: `Bearer ${accessToken}` } };
}
