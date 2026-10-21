import argon2 from 'argon2';
import { ConcurrencyLimiter } from '../../common/utils/concurrency-limiter.js';

/**
 * Argon2id with the OWASP baseline profile (19 MiB, t=2, p=1). Hashing runs on
 * the libuv thread pool (UV_THREADPOOL_SIZE, default 4); the limiter keeps
 * concurrent hashes at or below that so bursts of logins queue briefly or get
 * a 503 instead of exhausting memory (19 MiB per in-flight hash).
 */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /** Spends the same work as verify() for unknown users (timing equalisation). */
  verifyAgainstDummy(plain: string): Promise<void>;
}

export class Argon2PasswordHasher implements PasswordHasher {
  private readonly limiter: ConcurrencyLimiter;
  private dummyHash: Promise<string> | undefined;

  constructor(options: { concurrency: number; queueLimit: number }) {
    this.limiter = new ConcurrencyLimiter(options.concurrency, options.queueLimit);
  }

  hash(plain: string): Promise<string> {
    return this.limiter.run(() => argon2.hash(plain, ARGON2_OPTIONS));
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return this.limiter.run(async () => {
      try {
        return await argon2.verify(hash, plain);
      } catch {
        return false; // malformed hash
      }
    });
  }

  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= argon2.hash('dummy-password-for-timing', ARGON2_OPTIONS);
    await this.verify(await this.dummyHash, plain);
  }
}
