import { ObjectId } from 'mongodb';
import type { AppConfig } from '../../config/env.js';
import { AppError, ErrorCode, Errors } from '../../common/errors/app-error.js';
import type { Principal } from '../../common/types/principal.js';
import { addSeconds, type Clock } from '../../common/utils/clock.js';
import { randomToken, sha256Hex } from '../../common/utils/crypto.js';
import type { Logger } from '../../observability/logger.js';
import type { Metrics } from '../../observability/metrics.js';
import type { AuthStateCache } from '../users/auth-state-cache.js';
import type { PasswordHasher } from '../users/password-hasher.js';
import type { UsersRepository } from '../users/users.repository.js';
import { toUserDto, type UserDto } from '../users/users.types.js';
import type { SessionsRepository } from './auth.repository.js';
import type { ClientMeta, IssuedTokens, LoginResult, SessionDocument } from './auth.types.js';
import type { TokenService } from './token.service.js';

/**
 * Two tabs refreshing at the same moment both present the same token; the
 * loser sees a "previous" token. Within this window that is treated as a
 * benign race (401, client retries with the new cookie) instead of theft.
 */
const REFRESH_REUSE_GRACE_MS = 10_000;

const invalidCredentials = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid username or password');
const sessionInvalid = () =>
  new AppError(401, ErrorCode.SESSION_INVALID, 'Session expired; please sign in again');

export class AuthService {
  constructor(
    private readonly deps: {
      config: AppConfig['auth'];
      users: UsersRepository;
      sessions: SessionsRepository;
      hasher: PasswordHasher;
      tokens: TokenService;
      authStateCache: AuthStateCache;
      clock: Clock;
      logger: Logger;
      metrics: Metrics;
    },
  ) {}

  async login(username: string, password: string, meta: ClientMeta): Promise<LoginResult> {
    const { users, hasher, clock, config, metrics } = this.deps;
    const now = clock.now();
    const user = await users.findByUsernameWithCredentials(username);

    if (!user) {
      await hasher.verifyAgainstDummy(password);
      metrics.authEvents.inc({ event: 'login_failed' });
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      metrics.authEvents.inc({ event: 'login_locked' });
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
      throw new AppError(423, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts; try again later', {
        headers: { 'retry-after': String(retryAfter) },
      });
    }

    if (!(await hasher.verify(user.passwordHash, password))) {
      const { locked } = await users.recordFailedLogin(user._id, {
        maxAttempts: config.maxFailedLogins,
        lockUntil: addSeconds(now, config.lockoutSeconds),
        now,
      });
      metrics.authEvents.inc({ event: locked ? 'account_locked' : 'login_failed' });
      if (locked)
        this.deps.logger.warn({ userId: user._id.toHexString() }, 'Account locked after failed logins');
      throw invalidCredentials();
    }

    // Checked only after the password, so status is not revealed to guessers.
    if (user.status !== 'active') {
      metrics.authEvents.inc({ event: 'login_disabled' });
      throw new AppError(
        403,
        ErrorCode.ACCOUNT_DISABLED,
        'This account is disabled; contact an administrator',
      );
    }

    await users.recordSuccessfulLogin(user._id, now);
    const tokens = await this.startSession(user._id, user.tokenVersion, meta, now);
    metrics.authEvents.inc({ event: 'login_succeeded' });
    return { ...tokens, user: toUserDto({ ...user, lastLoginAt: now }) };
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const { sessions, users, clock, tokens, metrics, logger } = this.deps;
    const now = clock.now();
    const presentedHash = sha256Hex(refreshToken);
    const nextToken = randomToken();
    const session = await sessions.rotate(presentedHash, sha256Hex(nextToken), now);

    if (!session) {
      const reused = await sessions.findByPreviousTokenHash(presentedHash);
      if (reused && reused.revokedAt === null) {
        if (now.getTime() - reused.lastRotatedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
          await sessions.revoke(reused._id, 'refresh_token_reuse', now);
          metrics.authEvents.inc({ event: 'refresh_token_reuse' });
          logger.warn(
            { userId: reused.userId.toHexString(), sessionId: reused._id.toHexString() },
            'Refresh token reuse detected; session revoked',
          );
        }
      }
      throw sessionInvalid();
    }

    const state = await users.findAuthState(session.userId);
    if (!state || state.status !== 'active' || state.tokenVersion !== session.tokenVersion) {
      await sessions.revoke(session._id, 'user_state_changed', now);
      throw sessionInvalid();
    }

    const access = await tokens.issueAccessToken({
      userId: session.userId,
      sessionId: session._id.toHexString(),
      tokenVersion: state.tokenVersion,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: nextToken,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.deps.sessions.revokeByTokenHash(sha256Hex(refreshToken), 'logout', this.deps.clock.now());
  }

  async me(principal: Principal): Promise<UserDto> {
    const user = await this.deps.users.findById(principal.userId);
    if (!user) throw Errors.unauthenticated();
    return toUserDto(user);
  }

  /** Self-service change. Ends every session, including the current one. */
  async changePassword(principal: Principal, currentPassword: string, newPassword: string): Promise<void> {
    const { users, hasher, clock, sessions, authStateCache } = this.deps;
    const profile = await users.findById(principal.userId);
    if (!profile) throw Errors.unauthenticated();
    const user = await users.findByUsernameWithCredentials(profile.username);
    if (!user || !(await hasher.verify(user.passwordHash, currentPassword))) throw invalidCredentials();
    if (newPassword.toLowerCase() === user.username)
      throw Errors.badRequest('Password must not equal the username');
    const now = clock.now();
    await users.setPassword(user._id, await hasher.hash(newPassword), now);
    await sessions.revokeAllForUser(user._id, 'password_changed', now);
    await authStateCache.invalidate(user._id);
  }

  private async startSession(
    userId: ObjectId,
    tokenVersion: number,
    meta: ClientMeta,
    now: Date,
  ): Promise<IssuedTokens> {
    const refreshToken = randomToken();
    const session: SessionDocument = {
      _id: new ObjectId(),
      userId,
      tokenHash: sha256Hex(refreshToken),
      previousTokenHash: null,
      tokenVersion,
      createdAt: now,
      lastRotatedAt: now,
      expiresAt: addSeconds(now, this.deps.config.refreshTokenTtlSeconds),
      revokedAt: null,
      revokedReason: null,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
      ip: meta.ip.slice(0, 64),
    };
    await this.deps.sessions.create(session);
    const access = await this.deps.tokens.issueAccessToken({
      userId,
      sessionId: session._id.toHexString(),
      tokenVersion,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }
}
