import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';
import type { AppConfig } from '../../config/env.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { Clock } from '../../common/utils/clock.js';
import type { AccessTokenClaims } from './auth.types.js';

const ALGORITHM = 'HS256';

/**
 * Short-lived HS256 access tokens. Secret rotation: set the new secret as
 * JWT_ACCESS_SECRET and the old one as JWT_ACCESS_SECRET_PREVIOUS for at least
 * ACCESS_TOKEN_TTL_SECONDS, then remove the previous secret.
 */
export class TokenService {
  private readonly current: Uint8Array;
  private readonly previous: Uint8Array | undefined;

  constructor(
    private readonly config: AppConfig['auth'],
    private readonly clock: Clock,
  ) {
    const encoder = new TextEncoder();
    this.current = encoder.encode(config.accessSecret);
    this.previous = config.accessSecretPrevious ? encoder.encode(config.accessSecretPrevious) : undefined;
  }

  async issueAccessToken(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const expiresAtSeconds = issuedAt + this.config.accessTokenTtlSeconds;
    const token = await new SignJWT({ sid: claims.sessionId, tv: claims.tokenVersion })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(claims.userId.toHexString())
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.current);
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      return await this.verifyWith(this.current, token);
    } catch (error) {
      if (this.previous && error instanceof joseErrors.JWSSignatureVerificationFailed) {
        try {
          return await this.verifyWith(this.previous, token);
        } catch {
          // fall through to the generic error
        }
      }
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Invalid or expired access token');
    }
  }

  private async verifyWith(key: Uint8Array, token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
      issuer: this.config.issuer,
      audience: this.config.audience,
      currentDate: this.clock.now(),
      clockTolerance: 5,
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    const { sub, sid, tv } = payload;
    if (
      typeof sub !== 'string' ||
      !/^[a-f0-9]{24}$/.test(sub) ||
      typeof sid !== 'string' ||
      typeof tv !== 'number' ||
      !Number.isInteger(tv)
    ) {
      throw new Error('Malformed claims');
    }
    return { userId: new ObjectId(sub), sessionId: sid, tokenVersion: tv };
  }
}
