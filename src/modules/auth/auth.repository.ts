import type { Collection, Db, ObjectId } from 'mongodb';
import { Collections } from '../../database/collections.js';
import type { SessionDocument } from './auth.types.js';

/** Persistence for refresh-token sessions (`sessions` collection). */
export class SessionsRepository {
  private readonly collection: Collection<SessionDocument>;

  constructor(
    db: Db,
    private readonly queryTimeoutMs: number,
  ) {
    this.collection = db.collection<SessionDocument>(Collections.sessions);
  }

  async create(session: SessionDocument): Promise<void> {
    await this.collection.insertOne(session);
  }

  /**
   * Atomically swaps the current token for a new one. Only one of several
   * concurrent requests presenting the same token can win; the others get null.
   */
  rotate(tokenHash: string, newTokenHash: string, now: Date): Promise<SessionDocument | null> {
    return this.collection.findOneAndUpdate(
      { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { tokenHash: newTokenHash, previousTokenHash: tokenHash, lastRotatedAt: now } },
      { returnDocument: 'after', maxTimeMS: this.queryTimeoutMs },
    );
  }

  findByPreviousTokenHash(tokenHash: string): Promise<SessionDocument | null> {
    return this.collection.findOne({ previousTokenHash: tokenHash }, { maxTimeMS: this.queryTimeoutMs });
  }

  async revokeByTokenHash(tokenHash: string, reason: string, now: Date): Promise<void> {
    await this.collection.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: reason } },
    );
  }

  async revoke(sessionId: ObjectId, reason: string, now: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: reason } },
    );
  }

  async revokeAllForUser(userId: ObjectId, reason: string, now: Date): Promise<number> {
    const result = await this.collection.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: reason } },
    );
    return result.modifiedCount;
  }
}
