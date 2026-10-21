import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/test-app.js';

let ctx: TestContext | undefined;
afterEach(async () => {
  await ctx?.close().catch(() => undefined);
  ctx = undefined;
});

describe('health endpoints', () => {
  it('reports ready without leaking internals', async () => {
    ctx = await createTestApp();
    const live = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(live.json()).toEqual({ status: 'ok' });
    const ready = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready', checks: { mongodb: 'up', redis: 'down' } });
    expect(ready.body).not.toMatch(/mongodb:\/\/|version|host/i);
  });

  it('fails readiness (not liveness) when MongoDB is unreachable or the process is draining', async () => {
    ctx = await createTestApp();
    ctx.mongoUp.value = false;
    expect((await ctx.app.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(503);
    expect((await ctx.app.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
    ctx.mongoUp.value = true;
    ctx.lifecycle.shuttingDown = true;
    const draining = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(draining.statusCode).toBe(503);
    expect(draining.json().status).toBe('not_ready');
  });

  it('serves metrics only with the bearer token', async () => {
    ctx = await createTestApp({ METRICS_TOKEN: 'metrics-token-metrics-token-123' });
    await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect((await ctx.app.inject({ method: 'GET', url: '/internal/metrics' })).statusCode).toBe(404);
    const scrape = await ctx.app.inject({
      method: 'GET',
      url: '/internal/metrics',
      headers: { authorization: 'Bearer metrics-token-metrics-token-123' },
    });
    expect(scrape.statusCode).toBe(200);
    expect(scrape.body).toContain('http_request_duration_seconds_bucket');
    expect(scrape.body).toContain('route="/health/live"');
    expect(scrape.body).toContain('queue_jobs{');
  });
});

describe('graceful shutdown', () => {
  it('finishes in-flight requests, then refuses new connections', async () => {
    let entered!: () => void;
    const handlerEntered = new Promise<void>((resolve) => (entered = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    ctx = await createTestApp(
      {},
      {
        beforeReady: (app) => {
          app.get('/__test/slow', async () => {
            entered();
            await gate;
            return { done: true };
          });
        },
      },
    );
    await ctx.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = ctx.app.server.address() as AddressInfo;

    const inFlight = new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/__test/slow' }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
    await handlerEntered;

    // server.ts flips this in its drain step before closing the listener.
    ctx.lifecycle.shuttingDown = true;
    const closing = ctx.app.close();
    // New connections are refused as soon as the listener closes ...
    await expect(
      new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: '/health/live' }, resolve);
        req.on('error', reject);
        req.end();
      }),
    ).rejects.toSatisfy((error: NodeJS.ErrnoException) =>
      ['ECONNREFUSED', 'ECONNRESET'].includes(error.code ?? ''),
    );
    // ... while the request already being handled completes normally.
    release();
    await expect(inFlight).resolves.toEqual({ status: 200, body: '{"done":true}' });
    // close() must not wait for the client's keep-alive socket (72s default).
    const started = Date.now();
    await closing;
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
