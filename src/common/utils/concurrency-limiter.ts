import { Errors } from '../errors/app-error.js';

/**
 * Bounds how many expensive operations (e.g. password hashing) run at once and
 * how many may wait. When the wait queue is full the caller gets a 503 instead
 * of the process accumulating unbounded memory and latency.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {
    if (maxConcurrent < 1) throw new Error('maxConcurrent must be >= 1');
  }

  get stats(): { active: number; queued: number } {
    return { active: this.active, queued: this.waiting.length };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.maxQueued) {
      return Promise.reject(Errors.serviceBusy());
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiting.shift();
    if (next) next();
  }
}
