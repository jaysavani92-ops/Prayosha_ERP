import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Collections } from '../../src/database/collections.js';
import { createTestApp, login, seedUser, type TestContext } from '../helpers/test-app.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp({ AUTH_MAX_FAILED_LOGINS: '3' });
  await seedUser(ctx, { username: 'engineer', role: 'site_engineer' });
  await seedUser(ctx, { username: 'owner', role: 'owner' });
});
afterAll(() => ctx.close());

const loginRequest = (payload: unknown) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: payload as Record<string, unknown> });

describe('POST /api/v1/auth/login', () => {
  it('returns an access token, user and an httpOnly refresh cookie', async () => {
    const response = await loginRequest({ username: 'Engineer ', password: 'correct-horse-battery' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.tokenType).toBe('Bearer');
    expect(body.data.user).toMatchObject({ username: 'engineer', role: 'site_engineer' });
    expect(body.data.user).not.toHaveProperty('passwordHash');
    const cookie = response.cookies.find((c) => c.name === 'prayosha_rt');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' });
  });

  it('uses the same response for unknown users and wrong passwords', async () => {
    const unknown = await loginRequest({ username: 'nobody', password: 'whatever-password' });
    const wrong = await loginRequest({ username: 'owner', password: 'wrong-password' });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it.each([
    [{ username: { $ne: null }, password: 'x' }],
    [{ username: 'owner', password: { $gt: '' } }],
    [{ username: 'owner', password: 'x', $where: '1' }],
    [{ username: 'owner', password: 'x', role: 'owner' }],
  ])('rejects operator injection / unknown fields %o with 400', async (payload) => {
    const response = await loginRequest(payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('locks the account after repeated failures and keeps it locked for the right password', async () => {
    await seedUser(ctx, { username: 'victim', role: 'site_engineer' });
    for (let i = 0; i < 3; i++) {
      expect((await loginRequest({ username: 'victim', password: 'bad-password' })).statusCode).toBe(401);
    }
    const locked = await loginRequest({ username: 'victim', password: 'correct-horse-battery' });
    expect(locked.statusCode).toBe(423);
    expect(locked.json().error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    ctx.clock.advance(901);
    expect((await loginRequest({ username: 'victim', password: 'correct-horse-battery' })).statusCode).toBe(
      200,
    );
  });

  it('rejects disabled accounts only after the correct password', async () => {
    await seedUser(ctx, { username: 'former', role: 'site_engineer', status: 'disabled' });
    expect((await loginRequest({ username: 'former', password: 'bad-password' })).statusCode).toBe(401);
    const response = await loginRequest({ username: 'former', password: 'correct-horse-battery' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('access tokens', () => {
  it('authenticates /me and rejects missing or malformed tokens', async () => {
    const session = await login(ctx.app, 'engineer');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: session.auth });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.username).toBe('engineer');
    for (const authorization of [undefined, 'Bearer', 'Bearer abc', `Basic ${session.accessToken}`]) {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: authorization ? { authorization } : {},
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('stops working immediately when the user is disabled', async () => {
    const user = await seedUser(ctx, { username: 'to.disable', role: 'site_engineer' });
    const session = await login(ctx.app, 'to.disable');
    const owner = await login(ctx.app, 'owner');
    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${user._id.toHexString()}`,
      headers: owner.auth,
      payload: { status: 'disabled' },
    });
    expect(patch.statusCode).toBe(200);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: session.auth });
    expect(me.statusCode).toBe(401);
  });
});

describe('refresh token rotation', () => {
  const refresh = (cookie: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { prayosha_rt: cookie } });

  it('rotates the refresh token on every use', async () => {
    const session = await login(ctx.app, 'engineer');
    const first = await refresh(session.refreshCookie);
    expect(first.statusCode).toBe(200);
    const next = first.cookies.find((c) => c.name === 'prayosha_rt')?.value;
    expect(next).toBeDefined();
    expect(next).not.toBe(session.refreshCookie);
    expect((await refresh(next!)).statusCode).toBe(200);
  });

  it('treats reuse of an old token as theft and revokes the session', async () => {
    const session = await login(ctx.app, 'engineer');
    const rotated = (await refresh(session.refreshCookie)).cookies.find(
      (c) => c.name === 'prayosha_rt',
    )!.value;
    ctx.clock.advance(30); // beyond the concurrent-refresh grace window
    const replay = await refresh(session.refreshCookie);
    expect(replay.statusCode).toBe(401);
    // The legitimate holder of the newest token is signed out too.
    expect((await refresh(rotated)).statusCode).toBe(401);
    const sessions = await ctx.db
      .collection(Collections.sessions)
      .find({ revokedReason: 'refresh_token_reuse' })
      .toArray();
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('tolerates two tabs refreshing at the same moment', async () => {
    const session = await login(ctx.app, 'engineer');
    const rotated = (await refresh(session.refreshCookie)).cookies.find(
      (c) => c.name === 'prayosha_rt',
    )!.value;
    expect((await refresh(session.refreshCookie)).statusCode).toBe(401); // loser of the race
    expect((await refresh(rotated)).statusCode).toBe(200); // session survives
  });

  it('logout revokes the session and clears the cookie', async () => {
    const session = await login(ctx.app, 'engineer');
    const logout = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { prayosha_rt: session.refreshCookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies.find((c) => c.name === 'prayosha_rt')?.value).toBe('');
    expect((await refresh(session.refreshCookie)).statusCode).toBe(401);
  });

  it('ends all sessions when the password changes', async () => {
    await seedUser(ctx, { username: 'changer', role: 'site_engineer' });
    const a = await login(ctx.app, 'changer');
    const b = await login(ctx.app, 'changer');
    const change = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/auth/password',
      headers: a.auth,
      payload: { currentPassword: 'correct-horse-battery', newPassword: 'a-brand-new-password' },
    });
    expect(change.statusCode).toBe(204);
    expect((await refresh(b.refreshCookie)).statusCode).toBe(401);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: b.auth })).statusCode,
    ).toBe(401);
    await expect(login(ctx.app, 'changer', 'a-brand-new-password')).resolves.toBeDefined();
  });
});

describe('HTTP hardening', () => {
  it('sets security headers and echoes a valid request id', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'proxy-generated-id-123' },
    });
    expect(response.headers['x-request-id']).toBe('proxy-generated-id-123');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('replaces malformed request ids', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'bad id\n' },
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows only configured CORS origins', async () => {
    const preflight = (origin: string) =>
      ctx.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: { origin, 'access-control-request-method': 'POST' },
      });
    expect((await preflight('https://app.prayosha.test')).headers['access-control-allow-origin']).toBe(
      'https://app.prayosha.test',
    );
    expect((await preflight('https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns the standard error envelope for unknown routes and bad JSON', async () => {
    const notFound = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json().error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
    const badJson = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"username":',
    });
    expect(badJson.statusCode).toBe(400);
    expect(badJson.json().error.code).toBe('BAD_REQUEST');
  });

  it('rejects oversized bodies with 413', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'owner', password: 'x'.repeat(2_000_000) },
    });
    expect(response.statusCode).toBe(413);
  });
});

describe('login rate limiting', () => {
  it('returns 429 after the per-IP login limit', async () => {
    const limited = await createTestApp({ RATE_LIMIT_LOGIN_MAX: '2' });
    try {
      const attempt = () =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { username: 'x.y', password: 'nope' },
        });
      await attempt();
      await attempt();
      const third = await attempt();
      expect(third.statusCode).toBe(429);
      expect(third.json().error.code).toBe('RATE_LIMITED');
      expect(third.headers['retry-after']).toBeDefined();
    } finally {
      await limited.close();
    }
  });
});
