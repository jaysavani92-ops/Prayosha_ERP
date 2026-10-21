import { SignJWT, UnsecuredJWT } from 'jose';
import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { Argon2PasswordHasher } from '../../src/modules/users/password-hasher.js';
import { MutableClock } from '../helpers/fakes.js';
import { testConfig } from '../helpers/test-app.js';

const claims = { userId: new ObjectId(), sessionId: new ObjectId().toHexString(), tokenVersion: 3 };

describe('TokenService', () => {
  it('issues tokens it can verify', async () => {
    const clock = new MutableClock();
    const service = new TokenService(testConfig().auth, clock);
    const { token, expiresAt } = await service.issueAccessToken(claims);
    expect(expiresAt.getTime() - clock.now().getTime()).toBe(900_000);
    const verified = await service.verifyAccessToken(token);
    expect(verified.userId.equals(claims.userId)).toBe(true);
    expect(verified.tokenVersion).toBe(3);
  });

  it('rejects expired tokens', async () => {
    const clock = new MutableClock();
    const service = new TokenService(testConfig().auth, clock);
    const { token } = await service.issueAccessToken(claims);
    clock.advance(900 + 6); // past exp plus the 5s clock tolerance
    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects unsigned (alg=none) and foreign-key tokens', async () => {
    const service = new TokenService(testConfig().auth, new MutableClock());
    const unsigned = new UnsecuredJWT({ sid: 'x', tv: 0 }).setSubject(claims.userId.toHexString()).encode();
    await expect(service.verifyAccessToken(unsigned)).rejects.toMatchObject({ statusCode: 401 });
    const forged = await new SignJWT({ sid: 'x', tv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId.toHexString())
      .setIssuer('prayosha-api')
      .setAudience('prayosha-clients')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('attacker-secret-attacker-secret-attacker'));
    await expect(service.verifyAccessToken(forged)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('accepts tokens signed with the previous secret during rotation', async () => {
    const clock = new MutableClock();
    const oldSecret = 'old-secret-old-secret-old-secret-old-secret';
    const before = new TokenService(testConfig({ JWT_ACCESS_SECRET: oldSecret }).auth, clock);
    const { token } = await before.issueAccessToken(claims);
    const after = new TokenService(
      testConfig({
        JWT_ACCESS_SECRET: 'new-secret-new-secret-new-secret-new-secret',
        JWT_ACCESS_SECRET_PREVIOUS: oldSecret,
      }).auth,
      clock,
    );
    await expect(after.verifyAccessToken(token)).resolves.toMatchObject({ tokenVersion: 3 });
    const withoutPrevious = new TokenService(
      testConfig({ JWT_ACCESS_SECRET: 'new-secret-new-secret-new-secret-new-secret' }).auth,
      clock,
    );
    await expect(withoutPrevious.verifyAccessToken(token)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('Argon2PasswordHasher', () => {
  it('hashes with argon2id and verifies', async () => {
    const hasher = new Argon2PasswordHasher({ concurrency: 2, queueLimit: 10 });
    const hash = await hasher.hash('s3cret-passphrase');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    await expect(hasher.verify(hash, 's3cret-passphrase')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong')).resolves.toBe(false);
    await expect(hasher.verify('not-a-hash', 'x')).resolves.toBe(false);
  });
});
