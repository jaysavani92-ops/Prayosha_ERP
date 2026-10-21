import type { ObjectId } from 'mongodb';
import type { Role } from '../../common/constants/roles.js';

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Stored shape of a `users` document. Mirrors the $jsonSchema validator. */
export interface UserDocument {
  _id: ObjectId;
  /** Lower-case, unique, immutable login name. */
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  passwordHash: string;
  passwordChangedAt: Date;
  /** Incremented to invalidate every outstanding access token for the user. */
  tokenVersion: number;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Public representation. Never includes credentials or lockout internals. */
export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toUserDto(user: Omit<UserDocument, 'passwordHash'>): UserDto {
  return {
    id: user._id.toHexString(),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
