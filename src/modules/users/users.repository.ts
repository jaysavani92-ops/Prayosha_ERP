import { MongoServerError, type Collection, type Db, type Filter, type ObjectId } from 'mongodb';
import type { Role } from '../../common/constants/roles.js';
import {
  NEWEST_FIRST,
  afterCursorFilter,
  toPage,
  type CursorPosition,
  type Page,
} from '../../common/utils/pagination.js';
import { Collections } from '../../database/collections.js';
import type { UserDocument, UserStatus } from './users.types.js';

export class DuplicateUsernameError extends Error {
  constructor() {
    super('Username already exists');
  }
}

/** Projection excluding credential fields, for every read that is not login. */
const PUBLIC_PROJECTION = { passwordHash: 0 } as const;

export interface UserListFilter {
  role?: Role | undefined;
  status?: UserStatus | undefined;
}

export interface AuthState {
  _id: ObjectId;
  role: Role;
  status: UserStatus;
  tokenVersion: number;
}

export class UsersRepository {
  private readonly collection: Collection<UserDocument>;

  constructor(
    db: Db,
    private readonly queryTimeoutMs: number,
  ) {
    this.collection = db.collection<UserDocument>(Collections.users);
  }

  async insert(user: UserDocument): Promise<void> {
    try {
      await this.collection.insertOne(user);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new DuplicateUsernameError();
      throw error;
    }
  }

  /** Includes the password hash. Use only for credential verification. */
  findByUsernameWithCredentials(username: string): Promise<UserDocument | null> {
    return this.collection.findOne({ username }, { maxTimeMS: this.queryTimeoutMs });
  }

  findById(id: ObjectId): Promise<Omit<UserDocument, 'passwordHash'> | null> {
    return this.collection.findOne(
      { _id: id },
      { projection: PUBLIC_PROJECTION, maxTimeMS: this.queryTimeoutMs },
    );
  }

  /** Minimal fields needed to authorise a request. */
  findAuthState(id: ObjectId): Promise<AuthState | null> {
    return this.collection.findOne<AuthState>(
      { _id: id },
      { projection: { _id: 1, role: 1, status: 1, tokenVersion: 1 }, maxTimeMS: this.queryTimeoutMs },
    );
  }

  async list(
    filter: UserListFilter,
    limit: number,
    after: CursorPosition | undefined,
  ): Promise<Page<Omit<UserDocument, 'passwordHash'>>> {
    const query: Filter<UserDocument> = { ...afterCursorFilter<UserDocument>(after) };
    if (filter.role) query.role = filter.role;
    if (filter.status) query.status = filter.status;
    const rows = await this.collection
      .find(query, { projection: PUBLIC_PROJECTION, maxTimeMS: this.queryTimeoutMs })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .toArray();
    return toPage(rows, limit);
  }

  /**
   * Partial update of profile/role/status. Bumps tokenVersion when access
   * should be cut immediately (role change or disable).
   */
  updateProfile(
    id: ObjectId,
    changes: Partial<Pick<UserDocument, 'displayName' | 'role' | 'status'>>,
    options: { revokeTokens: boolean; now: Date },
  ): Promise<Omit<UserDocument, 'passwordHash'> | null> {
    return this.collection.findOneAndUpdate(
      { _id: id },
      {
        $set: { ...changes, updatedAt: options.now },
        ...(options.revokeTokens ? { $inc: { tokenVersion: 1 } } : {}),
      },
      { returnDocument: 'after', projection: PUBLIC_PROJECTION, maxTimeMS: this.queryTimeoutMs },
    );
  }

  async setPassword(id: ObjectId, passwordHash: string, now: Date): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id },
      {
        $set: {
          passwordHash,
          passwordChangedAt: now,
          updatedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
        },
        $inc: { tokenVersion: 1 },
      },
    );
    return result.matchedCount === 1;
  }

  /**
   * Atomically counts a failed login and, when the threshold is reached,
   * locks the account. A single update pipeline avoids read-modify-write races
   * between concurrent login attempts.
   */
  async recordFailedLogin(
    id: ObjectId,
    options: { maxAttempts: number; lockUntil: Date; now: Date },
  ): Promise<{ locked: boolean }> {
    const updated = await this.collection.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            failedLoginCount: { $add: ['$failedLoginCount', 1] },
            updatedAt: options.now,
          },
        },
        {
          $set: {
            lockedUntil: {
              $cond: [
                { $gte: ['$failedLoginCount', options.maxAttempts] },
                options.lockUntil,
                '$lockedUntil',
              ],
            },
            failedLoginCount: {
              $cond: [{ $gte: ['$failedLoginCount', options.maxAttempts] }, 0, '$failedLoginCount'],
            },
          },
        },
      ],
      { returnDocument: 'after', projection: { lockedUntil: 1 } },
    );
    const lockedUntil = updated?.lockedUntil;
    return { locked: lockedUntil instanceof Date && lockedUntil.getTime() === options.lockUntil.getTime() };
  }

  async recordSuccessfulLogin(id: ObjectId, now: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: id },
      { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now } },
    );
  }

  countByRoleAndStatus(role: Role, status: UserStatus): Promise<number> {
    return this.collection.countDocuments({ role, status }, { maxTimeMS: this.queryTimeoutMs });
  }
}
