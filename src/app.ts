import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyUnderPressure from '@fastify/under-pressure';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import type { AppConfig } from './config/env.js';
import { AppError, ErrorCode } from './common/errors/app-error.js';
import { errorHandler, notFoundHandler } from './common/errors/error-handler.js';
import { IdempotencyService } from './common/idempotency/idempotency.service.js';
import { systemClock, type Clock } from './common/utils/clock.js';
import type { ObjectStorage } from './infrastructure/storage/object-storage.js';
import type { JobDispatcher } from './jobs/dispatcher.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { SessionsRepository } from './modules/auth/auth.repository.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { healthRoutes, metricsRoutes } from './modules/health/health.routes.js';
import { UploadsController } from './modules/uploads/uploads.controller.js';
import { UploadsRepository } from './modules/uploads/uploads.repository.js';
import { uploadsRoutes } from './modules/uploads/uploads.routes.js';
import { UploadsService } from './modules/uploads/uploads.service.js';
import {
  NoopAuthStateCache,
  RedisAuthStateCache,
  type AuthStateCache,
} from './modules/users/auth-state-cache.js';
import { Argon2PasswordHasher, type PasswordHasher } from './modules/users/password-hasher.js';
import { UsersController } from './modules/users/users.controller.js';
import { UsersRepository } from './modules/users/users.repository.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { UsersService } from './modules/users/users.service.js';
import type { Logger } from './observability/logger.js';
import type { Metrics } from './observability/metrics.js';
import { authPlugin } from './plugins/auth.js';

/**
 * Everything the HTTP application needs, created by the composition root
 * (server.ts) or by tests. buildApp() opens no connections of its own.
 */
export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  metrics: Metrics;
  db: Db;
  pingMongo(timeoutMs: number): Promise<boolean>;
  /** Shared store for rate limits and the auth-state cache; null = in-process. */
  redis: Redis | null;
  pingRedis(timeoutMs: number): Promise<boolean>;
  storage: ObjectStorage;
  dispatcher: JobDispatcher;
  lifecycle: { shuttingDown: boolean };
  clock?: Clock;
  hasher?: PasswordHasher;
  authStateCache?: AuthStateCache;
}

/** A hop count trusts that many proxies closest to the server. */
function toFastifyTrustProxy(value: boolean | number | string[]) {
  return typeof value === 'number' ? (_address: string, hop: number) => hop < value : value;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/** Accept a well-formed upstream X-Request-Id (from the proxy) or mint one. */
function genReqId(request: IncomingMessage): string {
  const incoming = request.headers['x-request-id'];
  return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config, logger, metrics } = deps;
  const clock = deps.clock ?? systemClock;

  const loggerInstance: FastifyBaseLogger = logger;
  const app = Fastify({
    loggerInstance,
    genReqId,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    trustProxy: toFastifyTrustProxy(config.http.trustProxy),
    bodyLimit: config.http.bodyLimitBytes,
    requestTimeout: config.http.requestTimeoutMs,
    keepAliveTimeout: config.http.keepAliveTimeoutMs,
    connectionTimeout: config.http.requestTimeoutMs,
    return503OnClosing: true,
    forceCloseConnections: 'idle',
    routerOptions: { maxParamLength: 128 },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // ---- cross-cutting hooks --------------------------------------------------
  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', request.id);
    done();
  });
  app.addHook('onSend', (_request, reply, payload, done) => {
    // While draining, close each keep-alive connection after its response
    // (decided at send time so requests already in flight are covered too).
    // Otherwise app.close() waits on idle clients until keepAliveTimeout.
    if (deps.lifecycle.shuttingDown) void reply.header('connection', 'close');
    done(null, payload);
  });
  app.addHook('onResponse', (request, reply, done) => {
    metrics.httpRequestDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status_code: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
    done();
  });

  // ---- security & protection plugins ----------------------------------------
  await app.register(fastifyHelmet, {
    // JSON API: no HTML is served except optional docs, which set their own CSP.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });

  const allowedOrigins = new Set(config.http.corsOrigins);
  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      // Requests without Origin are not cross-origin browser requests.
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after', 'idempotent-replayed'],
    maxAge: 600,
  });

  await app.register(fastifyCookie);

  await app.register(fastifyUnderPressure, {
    maxEventLoopDelay: 1000,
    maxEventLoopUtilization: 0.98,
    retryAfter: 10,
    exposeStatusRoute: false,
    pressureHandler: (request, reply, type) => {
      request.log.warn({ type }, 'Shedding load: process under pressure');
      void reply
        .status(503)
        .header('retry-after', '10')
        .send({
          error: { code: ErrorCode.SERVICE_BUSY, message: 'The service is busy', requestId: request.id },
        });
    },
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimit.globalMax,
    timeWindow: config.rateLimit.windowMs,
    ...(deps.redis ? { redis: deps.redis, nameSpace: `${config.redis.keyPrefix}rl:` } : {}),
    // If Redis is unavailable, serve the request rather than fail it; account
    // lockout (stored in MongoDB) still protects credentials.
    skipOnError: true,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, ErrorCode.RATE_LIMITED, 'Too many requests, please slow down', {
        details: { retryAfterSeconds: Math.ceil(context.ttl / 1000) },
      }),
  });

  if (config.http.compression) {
    await app.register(fastifyCompress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] });
  }

  if (config.http.apiDocsEnabled) {
    await app.register(fastifySwagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'Prayosha ERP API', version: '1.0.0' },
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        },
      },
      transform: jsonSchemaTransform,
      transformObject: jsonSchemaTransformObject,
    });
    await app.register(fastifySwaggerUi, { routePrefix: '/docs', staticCSP: true });
  }

  // ---- services ------------------------------------------------------------
  const { db } = deps;
  const queryTimeoutMs = config.mongo.queryTimeoutMs;
  const usersRepository = new UsersRepository(db, queryTimeoutMs);
  const sessionsRepository = new SessionsRepository(db, queryTimeoutMs);
  const uploadsRepository = new UploadsRepository(db, queryTimeoutMs);
  const hasher =
    deps.hasher ??
    new Argon2PasswordHasher({
      concurrency: config.auth.passwordHashConcurrency,
      queueLimit: config.auth.passwordHashQueueLimit,
    });
  const authStateCache =
    deps.authStateCache ??
    (deps.redis && config.auth.principalCacheTtlSeconds > 0
      ? new RedisAuthStateCache(deps.redis, {
          keyPrefix: config.redis.keyPrefix,
          ttlSeconds: config.auth.principalCacheTtlSeconds,
          logger,
          metrics,
        })
      : new NoopAuthStateCache());
  const tokens = new TokenService(config.auth, clock);
  const idempotency = new IdempotencyService(db, clock);

  const authService = new AuthService({
    config: config.auth,
    users: usersRepository,
    sessions: sessionsRepository,
    hasher,
    tokens,
    authStateCache,
    clock,
    logger,
    metrics,
  });
  const usersService = new UsersService(usersRepository, hasher, authStateCache, clock);
  const uploadsService = new UploadsService({
    config: config.s3,
    uploads: uploadsRepository,
    storage: deps.storage,
    dispatcher: deps.dispatcher,
    clock,
    logger,
  });

  await app.register(authPlugin, { tokens, users: usersRepository, authStateCache });

  // ---- routes --------------------------------------------------------------
  await app.register(healthRoutes, {
    deps: {
      pingMongo: (timeoutMs) => deps.pingMongo(timeoutMs),
      pingRedis: (timeoutMs) => deps.pingRedis(timeoutMs),
      isShuttingDown: () => deps.lifecycle.shuttingDown,
    },
  });
  if (config.metricsToken) {
    await app.register(metricsRoutes, { metrics, token: config.metricsToken, dispatcher: deps.dispatcher });
  }

  await app.register(
    async (api) => {
      await api.register(authRoutes, {
        prefix: '/auth',
        controller: new AuthController(authService, config.auth),
        loginRateLimit: { max: config.rateLimit.loginMax, timeWindow: config.rateLimit.windowMs },
      });
      await api.register(usersRoutes, {
        prefix: '/users',
        controller: new UsersController(usersService, idempotency),
      });
      await api.register(uploadsRoutes, {
        prefix: '/uploads',
        controller: new UploadsController(uploadsService, idempotency),
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
