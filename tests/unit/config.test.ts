import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { TEST_ENV } from '../helpers/test-app.js';

const prod = { ...TEST_ENV, NODE_ENV: 'production', REFRESH_COOKIE_SECURE: 'true' };

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(TEST_ENV);
    expect(config.http.port).toBe(3000);
    expect(config.mongo.maxPoolSize).toBe(20);
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.http.trustProxy).toBe(false);
  });

  it('reports every invalid variable at once', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(ConfigError);
    try {
      loadConfig({ NODE_ENV: 'test', JWT_ACCESS_SECRET: 'short' });
    } catch (error) {
      const issues = (error as ConfigError).issues.join('\n');
      expect(issues).toContain('MONGODB_URI');
      expect(issues).toContain('JWT_ACCESS_SECRET');
      expect(issues).toContain('S3_BUCKET');
    }
  });

  it('parses TRUST_PROXY as hop count or CIDR list', () => {
    expect(loadConfig({ ...TEST_ENV, TRUST_PROXY: '1' }).http.trustProxy).toBe(1);
    expect(loadConfig({ ...TEST_ENV, TRUST_PROXY: '10.0.0.0/8, 127.0.0.1' }).http.trustProxy).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
    ]);
  });

  it.each([
    [{ TRUST_PROXY: 'true' }, 'TRUST_PROXY'],
    [{ CORS_ORIGINS: '*' }, 'CORS_ORIGINS'],
    [{ REFRESH_COOKIE_SECURE: 'false' }, 'REFRESH_COOKIE_SECURE'],
    [{ METRICS_TOKEN: 'too-short' }, 'METRICS_TOKEN'],
  ])('rejects unsafe production setting %o', (override, name) => {
    expect(() => loadConfig({ ...prod, ...override })).toThrow(name);
  });

  it('disables API docs in production unless explicitly enabled', () => {
    expect(loadConfig({ ...prod, API_DOCS_ENABLED: undefined }).http.apiDocsEnabled).toBe(false);
    expect(loadConfig({ ...TEST_ENV, API_DOCS_ENABLED: undefined }).http.apiDocsEnabled).toBe(true);
  });
});
