import { ObjectId } from 'mongodb';
import { canManageRole } from '../../common/constants/roles.js';
import { Errors } from '../../common/errors/app-error.js';
import type { Principal } from '../../common/types/principal.js';
import type { Clock } from '../../common/utils/clock.js';
import { decodeCursor } from '../../common/utils/pagination.js';
import type { AuthStateCache } from './auth-state-cache.js';
import type { PasswordHasher } from './password-hasher.js';
import { DuplicateUsernameError, type UsersRepository } from './users.repository.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema.js';
import { toUserDto, type UserDocument, type UserDto } from './users.types.js';

export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly authStateCache: AuthStateCache,
    private readonly clock: Clock,
  ) {}

  async createUser(actor: Principal | null, input: CreateUserInput): Promise<UserDto> {
    // actor === null is reserved for the bootstrap CLI (create-owner script).
    if (actor && !canManageRole(actor.role, input.role)) throw Errors.forbidden();
    const now = this.clock.now();
    const user: UserDocument = {
      _id: new ObjectId(),
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      status: 'active',
      passwordHash: await this.hasher.hash(input.password),
      passwordChangedAt: now,
      tokenVersion: 0,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdBy: actor?.userId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.users.insert(user);
    } catch (error) {
      if (error instanceof DuplicateUsernameError) throw Errors.conflict('Username is already taken');
      throw error;
    }
    return toUserDto(user);
  }

  async getUser(id: ObjectId): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) throw Errors.notFound('User');
    return toUserDto(user);
  }

  async listUsers(query: ListUsersQuery): Promise<{ items: UserDto[]; nextCursor: string | null }> {
    const after = query.cursor ? decodeCursor(query.cursor) : undefined;
    const page = await this.users.list({ role: query.role, status: query.status }, query.limit, after);
    return { items: page.items.map(toUserDto), nextCursor: page.nextCursor };
  }

  async updateUser(actor: Principal, id: ObjectId, changes: UpdateUserInput): Promise<UserDto> {
    const isSelf = actor.userId.equals(id);
    if (isSelf && (changes.role !== undefined || changes.status !== undefined)) {
      throw Errors.forbidden('You cannot change your own role or status');
    }
    const target = await this.users.findById(id);
    if (!target) throw Errors.notFound('User');
    if (!isSelf && !canManageRole(actor.role, target.role)) throw Errors.forbidden();
    if (changes.role !== undefined && !canManageRole(actor.role, changes.role)) throw Errors.forbidden();

    const roleChanged = changes.role !== undefined && changes.role !== target.role;
    const disabling = changes.status === 'disabled' && target.status !== 'disabled';
    if (target.role === 'owner' && target.status === 'active' && (disabling || roleChanged)) {
      await this.assertNotLastActiveOwner();
    }

    const updated = await this.users.updateProfile(id, changes, {
      // A role change or disable must take effect immediately, not when the
      // current access token expires.
      revokeTokens: roleChanged || disabling,
      now: this.clock.now(),
    });
    if (!updated) throw Errors.notFound('User');
    await this.authStateCache.invalidate(id);
    return toUserDto(updated);
  }

  /** Administrative reset (the frontend's "forgot PIN" flow goes via an admin). */
  async resetPassword(actor: Principal, id: ObjectId, newPassword: string): Promise<void> {
    const target = await this.users.findById(id);
    if (!target) throw Errors.notFound('User');
    if (!actor.userId.equals(id) && !canManageRole(actor.role, target.role)) throw Errors.forbidden();
    if (newPassword.toLowerCase() === target.username) {
      throw Errors.badRequest('Password must not equal the username');
    }
    const updated = await this.users.setPassword(id, await this.hasher.hash(newPassword), this.clock.now());
    if (!updated) throw Errors.notFound('User');
    await this.authStateCache.invalidate(id);
  }

  private async assertNotLastActiveOwner(): Promise<void> {
    const activeOwners = await this.users.countByRoleAndStatus('owner', 'active');
    if (activeOwners <= 1) {
      throw Errors.invalidState('At least one active owner must remain');
    }
  }
}
