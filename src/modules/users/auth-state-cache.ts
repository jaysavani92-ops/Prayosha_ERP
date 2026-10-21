import type { ObjectId } from 'mongodb';
import type { Redis } from 'ioredis';
import { ROLES } from '../../common/constants/roles.js';
import type { Logger } from '../../observability/logger.js';
import type { Metrics } from '../../observability/metrics.js';
import type { AuthState } from './users.repository.js';
import { USER_STATUSES } from './users.types.js';

/**
 * Caches the few user fields needed to authorise every request (role, status,
 * tokenVersion) so authenticated requests do not each read `users`.
 *
 * Invalidation: every write path that changes these fields (UsersService)
 * calls invalidate() after the database write commits. A concurrent reader can
 * still repopulate a stale value between the write and the delete, so the TTL
 * (PRINCIPAL_CACHE_TTL_SECONDS, default 60s) bounds staleness.
 *
 * Failure behaviour: Redis errors are treated as cache misses (fall back to
 * MongoDB). The cache can only make authorisation slower, never weaker.
 */
export interface AuthStateCache {
  get(userId: ObjectId): Promise<AuthState | undefined>;
  set(state: AuthState): Promise<void>;
  invalidate(userId: ObjectId): Promise<void>;
}

export class NoopAuthStateCache implements AuthStateCache {
  get(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
  set(): Promise<void> {
    return Promise.resolve();
  }
  invalidate(): Promise<void> {
    return Promise.resolve();
  }
}

interface CachedState {
  r: string;
  s: string;
  v: number;
}

export class RedisAuthStateCache implements AuthStateCache {
  constructor(
    private readonly redis: Redis,
    private readonly options: { keyPrefix: string; ttlSeconds: number; logger: Logger; metrics: Metrics },
  ) {}

  private key(userId: ObjectId): string {
    return `${this.options.keyPrefix}auth-state:${userId.toHexString()}`;
  }

  async get(userId: ObjectId): Promise<AuthState | undefined> {
    try {
      const raw = await this.redis.get(this.key(userId));
      if (raw === null) {
        this.options.metrics.cacheRequests.inc({ cache: 'auth_state', result: 'miss' });
        return undefined;
      }
      const parsed = JSON.parse(raw) as CachedState;
      if (!isRole(parsed.r) || !isStatus(parsed.s) || !Number.isInteger(parsed.v)) return undefined;
      this.options.metrics.cacheRequests.inc({ cache: 'auth_state', result: 'hit' });
      return { _id: userId, role: parsed.r, status: parsed.s, tokenVersion: parsed.v };
    } catch (error) {
      this.options.metrics.cacheRequests.inc({ cache: 'auth_state', result: 'error' });
      this.options.logger.warn({ err: error }, 'auth-state cache read failed; falling back to MongoDB');
      return undefined;
    }
  }

  async set(state: AuthState): Promise<void> {
    try {
      const value: CachedState = { r: state.role, s: state.status, v: state.tokenVersion };
      await this.redis.set(this.key(state._id), JSON.stringify(value), 'EX', this.options.ttlSeconds);
    } catch (error) {
      this.options.logger.warn({ err: error }, 'auth-state cache write failed');
    }
  }

  async invalidate(userId: ObjectId): Promise<void> {
    try {
      await this.redis.del(this.key(userId));
    } catch (error) {
      // Staleness is still bounded by the TTL.
      this.options.logger.warn(
        { err: error, userId: userId.toHexString() },
        'auth-state cache invalidation failed',
      );
    }
  }
}

function isRole(value: string): value is AuthState['role'] {
  return (ROLES as readonly string[]).includes(value);
}

function isStatus(value: string): value is AuthState['status'] {
  return (USER_STATUSES as readonly string[]).includes(value);
}
