import type { ObjectId } from 'mongodb';
import type { UserDto } from '../users/users.types.js';

/**
 * One document per login ("session family"). The refresh token rotates on
 * every use; only the SHA-256 of the current and previous token is stored.
 * Presenting the previous token after the grace window means the token was
 * copied, so the whole session is revoked (refresh-token reuse detection).
 */
export interface SessionDocument {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  previousTokenHash: string | null;
  /** users.tokenVersion at login; a mismatch on refresh ends the session. */
  tokenVersion: number;
  createdAt: Date;
  lastRotatedAt: Date;
  /** Absolute expiry; rotation does not extend it. TTL-indexed. */
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  userAgent: string | null;
  ip: string | null;
}

export interface AccessTokenClaims {
  userId: ObjectId;
  sessionId: string;
  tokenVersion: number;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface LoginResult extends IssuedTokens {
  user: UserDto;
}

export interface ClientMeta {
  ip: string;
  userAgent: string | undefined;
}
