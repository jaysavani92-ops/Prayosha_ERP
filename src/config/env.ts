import { z } from 'zod';

/**
 * Environment configuration. Every value the process reads from the
 * environment is declared and validated here; nothing else touches process.env.
 * Invalid configuration fails fast at startup with a readable error.
 */

const bool = (defaultValue: boolean) => z.stringbool().default(defaultValue);
const int = (defaultValue: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);
const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim()));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('prayosha-api'),
  HOST: z.string().default('0.0.0.0'),
  PORT: int(3000, 1, 65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // "false" (direct exposure), a hop count ("1" behind one proxy), or a comma
  // separated list of trusted proxy IPs/CIDRs. "true" is rejected in production
  // because it lets any client spoof X-Forwarded-For.
  TRUST_PROXY: z.string().default('false'),
  HTTP_BODY_LIMIT_BYTES: int(1_048_576, 1024, 10_485_760),
  HTTP_REQUEST_TIMEOUT_MS: int(30_000, 1000),
  HTTP_KEEP_ALIVE_TIMEOUT_MS: int(72_000, 1000),
  HTTP_COMPRESSION: bool(false),
  CORS_ORIGINS: csv,
  API_DOCS_ENABLED: z.stringbool().optional(),
  SHUTDOWN_DRAIN_DELAY_MS: int(5000, 0, 60_000),
  SHUTDOWN_TIMEOUT_MS: int(25_000, 1000, 120_000),

  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default('prayosha'),
  MONGODB_MAX_POOL_SIZE: int(20, 1, 500),
  MONGODB_MIN_POOL_SIZE: int(0, 0, 100),
  MONGODB_MAX_IDLE_TIME_MS: int(60_000),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: int(5000, 100),
  MONGODB_CONNECT_TIMEOUT_MS: int(5000, 100),
  MONGODB_SOCKET_TIMEOUT_MS: int(30_000, 1000),
  MONGODB_QUERY_TIMEOUT_MS: int(5000, 100),

  REDIS_URL: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().default('prayosha:'),
  REDIS_COMMAND_TIMEOUT_MS: int(1000, 50),

  RATE_LIMIT_GLOBAL_MAX: int(300, 1),
  RATE_LIMIT_WINDOW_MS: int(60_000, 1000),
  RATE_LIMIT_LOGIN_MAX: int(10, 1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_SECRET_PREVIOUS: optionalString,
  JWT_ISSUER: z.string().default('prayosha-api'),
  JWT_AUDIENCE: z.string().default('prayosha-clients'),
  ACCESS_TOKEN_TTL_SECONDS: int(900, 60, 3600),
  REFRESH_TOKEN_TTL_SECONDS: int(1_209_600, 3600, 7_776_000),
  REFRESH_COOKIE_SECURE: bool(true),
  REFRESH_COOKIE_DOMAIN: optionalString,
  AUTH_MAX_FAILED_LOGINS: int(5, 1, 100),
  AUTH_LOCKOUT_SECONDS: int(900, 1, 86_400),
  PASSWORD_HASH_CONCURRENCY: int(4, 1, 64),
  PASSWORD_HASH_QUEUE_LIMIT: int(64, 0, 10_000),
  PRINCIPAL_CACHE_TTL_SECONDS: int(60, 0, 600),

  S3_BUCKET: z.string().min(3),
  S3_REGION: z.string().min(1),
  S3_ENDPOINT: optionalString,
  S3_PRESIGN_ENDPOINT: optionalString,
  S3_FORCE_PATH_STYLE: bool(false),
  S3_REQUEST_TIMEOUT_MS: int(5000, 100),
  UPLOAD_URL_TTL_SECONDS: int(300, 60, 3600),
  DOWNLOAD_URL_TTL_SECONDS: int(300, 60, 3600),
  UPLOAD_PENDING_GRACE_SECONDS: int(3600, 0, 604_800),

  METRICS_TOKEN: optionalString,
  WORKER_HEALTH_PORT: int(3001, 1, 65535),
  WORKER_CONCURRENCY: int(5, 1, 100),
  UPLOAD_CLEANUP_CRON: z.string().default('*/15 * * * *'),
});

type RawEnv = z.infer<typeof envSchema>;

export interface AppConfig {
  env: RawEnv['NODE_ENV'];
  isProduction: boolean;
  serviceName: string;
  logLevel: RawEnv['LOG_LEVEL'];
  http: {
    host: string;
    port: number;
    trustProxy: boolean | number | string[];
    bodyLimitBytes: number;
    requestTimeoutMs: number;
    keepAliveTimeoutMs: number;
    compression: boolean;
    corsOrigins: string[];
    apiDocsEnabled: boolean;
  };
  shutdown: { drainDelayMs: number; timeoutMs: number };
  mongo: {
    uri: string;
    dbName: string;
    maxPoolSize: number;
    minPoolSize: number;
    maxIdleTimeMs: number;
    serverSelectionTimeoutMs: number;
    connectTimeoutMs: number;
    socketTimeoutMs: number;
    queryTimeoutMs: number;
  };
  redis: { url: string; keyPrefix: string; commandTimeoutMs: number };
  rateLimit: { globalMax: number; windowMs: number; loginMax: number };
  auth: {
    accessSecret: string;
    accessSecretPrevious: string | undefined;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    refreshCookieSecure: boolean;
    refreshCookieDomain: string | undefined;
    maxFailedLogins: number;
    lockoutSeconds: number;
    passwordHashConcurrency: number;
    passwordHashQueueLimit: number;
    principalCacheTtlSeconds: number;
  };
  s3: {
    bucket: string;
    region: string;
    endpoint: string | undefined;
    presignEndpoint: string | undefined;
    forcePathStyle: boolean;
    requestTimeoutMs: number;
    uploadUrlTtlSeconds: number;
    downloadUrlTtlSeconds: number;
    pendingGraceSeconds: number;
  };
  metricsToken: string | undefined;
  worker: { healthPort: number; concurrency: number; uploadCleanupCron: string };
}

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

function parseTrustProxy(value: string): boolean | number | string[] {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'false' || trimmed === '') return false;
  if (trimmed === 'true') return true;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);

  const problems: string[] = [];
  if (isProduction) {
    if (trustProxy === true)
      problems.push('TRUST_PROXY=true is not allowed in production; use a hop count or CIDR list');
    if (env.CORS_ORIGINS.includes('*')) problems.push('CORS_ORIGINS must not contain "*" in production');
    if (!env.REFRESH_COOKIE_SECURE) problems.push('REFRESH_COOKIE_SECURE must be true in production');
    if (env.METRICS_TOKEN !== undefined && env.METRICS_TOKEN.length < 24)
      problems.push('METRICS_TOKEN must be at least 24 characters');
  }
  if (env.MONGODB_MIN_POOL_SIZE > env.MONGODB_MAX_POOL_SIZE)
    problems.push('MONGODB_MIN_POOL_SIZE must not exceed MONGODB_MAX_POOL_SIZE');
  if (problems.length > 0) throw new ConfigError(problems);

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction,
    serviceName: env.SERVICE_NAME,
    logLevel: env.LOG_LEVEL,
    http: {
      host: env.HOST,
      port: env.PORT,
      trustProxy,
      bodyLimitBytes: env.HTTP_BODY_LIMIT_BYTES,
      requestTimeoutMs: env.HTTP_REQUEST_TIMEOUT_MS,
      keepAliveTimeoutMs: env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
      compression: env.HTTP_COMPRESSION,
      corsOrigins: env.CORS_ORIGINS,
      apiDocsEnabled: env.API_DOCS_ENABLED ?? !isProduction,
    },
    shutdown: { drainDelayMs: env.SHUTDOWN_DRAIN_DELAY_MS, timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
    mongo: {
      uri: env.MONGODB_URI,
      dbName: env.MONGODB_DB_NAME,
      maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
      minPoolSize: env.MONGODB_MIN_POOL_SIZE,
      maxIdleTimeMs: env.MONGODB_MAX_IDLE_TIME_MS,
      serverSelectionTimeoutMs: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      connectTimeoutMs: env.MONGODB_CONNECT_TIMEOUT_MS,
      socketTimeoutMs: env.MONGODB_SOCKET_TIMEOUT_MS,
      queryTimeoutMs: env.MONGODB_QUERY_TIMEOUT_MS,
    },
    redis: {
      url: env.REDIS_URL,
      keyPrefix: env.REDIS_KEY_PREFIX,
      commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
    },
    rateLimit: {
      globalMax: env.RATE_LIMIT_GLOBAL_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      loginMax: env.RATE_LIMIT_LOGIN_MAX,
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessSecretPrevious: env.JWT_ACCESS_SECRET_PREVIOUS,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
      refreshCookieSecure: env.REFRESH_COOKIE_SECURE,
      refreshCookieDomain: env.REFRESH_COOKIE_DOMAIN,
      maxFailedLogins: env.AUTH_MAX_FAILED_LOGINS,
      lockoutSeconds: env.AUTH_LOCKOUT_SECONDS,
      passwordHashConcurrency: env.PASSWORD_HASH_CONCURRENCY,
      passwordHashQueueLimit: env.PASSWORD_HASH_QUEUE_LIMIT,
      principalCacheTtlSeconds: env.PRINCIPAL_CACHE_TTL_SECONDS,
    },
    s3: {
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      presignEndpoint: env.S3_PRESIGN_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      requestTimeoutMs: env.S3_REQUEST_TIMEOUT_MS,
      uploadUrlTtlSeconds: env.UPLOAD_URL_TTL_SECONDS,
      downloadUrlTtlSeconds: env.DOWNLOAD_URL_TTL_SECONDS,
      pendingGraceSeconds: env.UPLOAD_PENDING_GRACE_SECONDS,
    },
    metricsToken: env.METRICS_TOKEN,
    worker: {
      healthPort: env.WORKER_HEALTH_PORT,
      concurrency: env.WORKER_CONCURRENCY,
      uploadCleanupCron: env.UPLOAD_CLEANUP_CRON,
    },
  });
}
