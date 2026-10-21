import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { canManageRole, hasPermission } from '../../src/common/constants/roles.js';
import { AppError } from '../../src/common/errors/app-error.js';
import { stableStringify } from '../../src/common/idempotency/idempotency.service.js';
import { ConcurrencyLimiter } from '../../src/common/utils/concurrency-limiter.js';
import { safeEqual } from '../../src/common/utils/crypto.js';
import { decodeCursor, encodeCursor, toPage } from '../../src/common/utils/pagination.js';
import { createGracefulShutdown } from '../../src/common/utils/shutdown.js';

describe('pagination cursors', () => {
  it('round-trips a position', () => {
    const position = { createdAt: new Date('2026-01-02T03:04:05.678Z'), id: new ObjectId() };
    const decoded = decodeCursor(encodeCursor(position));
    expect(decoded.createdAt.toISOString()).toBe(position.createdAt.toISOString());
    expect(decoded.id.equals(position.id)).toBe(true);
  });

  it.each([
    'not-base64!',
    Buffer.from('{"c":"x","i":"y"}').toString('base64url'),
    Buffer.from('{"$gt":1}').toString('base64url'),
  ])('rejects malformed cursor %s with a 400', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(AppError);
  });

  it('uses the extra row only to signal another page', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      _id: new ObjectId(),
      createdAt: new Date(1000 - i),
    }));
    const page = toPage(rows, 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(toPage(rows.slice(0, 2), 2).nextCursor).toBeNull();
  });
});

describe('roles', () => {
  it('only owners manage owners', () => {
    expect(canManageRole('owner', 'owner')).toBe(true);
    expect(canManageRole('general_manager', 'owner')).toBe(false);
    expect(canManageRole('general_manager', 'site_engineer')).toBe(true);
    expect(canManageRole('site_engineer', 'site_engineer')).toBe(false);
  });

  it('staff cannot read other users uploads', () => {
    expect(hasPermission('site_engineer', 'uploads:read:any')).toBe(false);
    expect(hasPermission('general_manager', 'uploads:read:any')).toBe(true);
  });
});

describe('stableStringify', () => {
  it('ignores key order and undefined values', () => {
    expect(stableStringify({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      stableStringify({ a: { c: 'x', d: [1, 2] }, b: 1 }),
    );
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
});

describe('safeEqual', () => {
  it('compares strings without early exit', () => {
    expect(safeEqual('Bearer abc', 'Bearer abc')).toBe(true);
    expect(safeEqual('Bearer abc', 'Bearer abd')).toBe(false);
    expect(safeEqual('', 'Bearer abc')).toBe(false);
  });
});

describe('ConcurrencyLimiter', () => {
  it('caps concurrency and rejects when the queue is full', async () => {
    const limiter = new ConcurrencyLimiter(2, 1);
    let active = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const task = () =>
      limiter.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => release.push(resolve));
        active--;
      });
    const running = [task(), task(), task()];
    await expect(task()).rejects.toMatchObject({ statusCode: 503, code: 'SERVICE_BUSY' });
    while (release.length > 0 || active > 0) {
      release.shift()?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await Promise.all(running);
    expect(peak).toBe(2);
  });
});

describe('createGracefulShutdown', () => {
  const logger = { info: vi.fn(), error: vi.fn() };

  it('runs steps in order once, even when called repeatedly', async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const shutdown = createGracefulShutdown({
      logger,
      timeoutMs: 1000,
      exit,
      steps: [
        { name: 'a', run: () => Promise.resolve(void order.push('a')) },
        { name: 'b', run: () => Promise.resolve(void order.push('b')) },
      ],
    });
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(order).toEqual(['a', 'b']);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('continues after a failing step and exits non-zero', async () => {
    const exit = vi.fn();
    const later = vi.fn(() => Promise.resolve());
    const shutdown = createGracefulShutdown({
      logger,
      timeoutMs: 1000,
      exit,
      steps: [
        { name: 'broken', run: () => Promise.reject(new Error('boom')) },
        { name: 'later', run: later },
      ],
    });
    await shutdown('SIGTERM');
    expect(later).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('forces exit when a step hangs past the deadline', async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const shutdown = createGracefulShutdown({
      logger,
      timeoutMs: 500,
      exit,
      steps: [{ name: 'hang', run: () => new Promise<void>(() => undefined) }],
    });
    void shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(600);
    expect(exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});
