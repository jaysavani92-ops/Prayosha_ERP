import { pino, type LoggerOptions } from 'pino';
import type { AppConfig } from '../config/env.js';

/**
 * Paths removed from every log line. Request bodies are never logged by
 * default; these cover headers and any object a developer logs explicitly.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'password',
  'newPassword',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  'secret',
  '*.password',
  '*.newPassword',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.secret',
  'config.auth.accessSecret',
  'config.auth.accessSecretPrevious',
  'config.mongo.uri',
  'config.redis.url',
];

export function loggerOptions(config: Pick<AppConfig, 'env' | 'logLevel' | 'serviceName'>): LoggerOptions {
  const options: LoggerOptions = {
    level: config.logLevel,
    base: { service: config.serviceName, env: config.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: { level: (label) => ({ level: label }) },
  };
  if (config.env === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
    };
  }
  return options;
}

export function createLogger(config: Pick<AppConfig, 'env' | 'logLevel' | 'serviceName'>) {
  return pino(loggerOptions(config));
}

export type Logger = ReturnType<typeof createLogger>;
