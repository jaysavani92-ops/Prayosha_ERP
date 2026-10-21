import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, login, seedUser, type LoggedIn, type TestContext } from '../helpers/test-app.js';

let ctx: TestContext;
let owner: LoggedIn;
let manager: LoggedIn;
let engineer: LoggedIn;

beforeAll(async () => {
  ctx = await createTestApp();
  await seedUser(ctx, { username: 'owner', role: 'owner' });
  await seedUser(ctx, { username: 'manager', role: 'general_manager' });
  await seedUser(ctx, { username: 'engineer', role: 'site_engineer' });
  [owner, manager, engineer] = await Promise.all([
    login(ctx.app, 'owner'),
    login(ctx.app, 'manager'),
    login(ctx.app, 'engineer'),
  ]);
});
afterAll(() => ctx.close());

const createUser = (
  session: LoggedIn,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/users',
    headers: { ...session.auth, ...headers },
    payload,
  });

describe('POST /api/v1/users', () => {
  it('creates a user and never returns credentials', async () => {
    const response = await createUser(manager, {
      username: 'New.Engineer',
      displayName: 'New Engineer',
      role: 'site_engineer',
      password: 'site-password-1',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      username: 'new.engineer',
      role: 'site_engineer',
      status: 'active',
    });
    expect(JSON.stringify(response.json())).not.toMatch(/password/i);
    await expect(login(ctx.app, 'new.engineer', 'site-password-1')).resolves.toBeDefined();
  });

  it('enforces permissions and privilege boundaries', async () => {
    const payload = {
      username: 'someone',
      displayName: 'S',
      role: 'site_engineer',
      password: 'password-123',
    };
    expect((await createUser(engineer, payload)).statusCode).toBe(403);
    expect(
      (await createUser(manager, { ...payload, username: 'fake.owner', role: 'owner' })).statusCode,
    ).toBe(403);
    expect((await createUser(owner, { ...payload, username: 'real.owner', role: 'owner' })).statusCode).toBe(
      201,
    );
  });

  it('validates input', async () => {
    const bad = await createUser(owner, { username: 'x', displayName: '', role: 'king', password: 'short' });
    expect(bad.statusCode).toBe(400);
    const paths = bad.json().error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['/username', '/displayName', '/role', '/password']));
    const same = await createUser(owner, {
      username: 'samepass',
      displayName: 'S',
      role: 'site_engineer',
      password: 'samepass',
    });
    expect(same.statusCode).toBe(400);
  });

  it('returns 409 for duplicate usernames', async () => {
    const payload = { username: 'dup.user', displayName: 'D', role: 'accountant', password: 'password-123' };
    expect((await createUser(owner, payload)).statusCode).toBe(201);
    const second = await createUser(owner, payload);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('CONFLICT');
  });

  it('replays the original response for a repeated Idempotency-Key', async () => {
    const payload = {
      username: 'idem.user',
      displayName: 'I',
      role: 'store_keeper',
      password: 'password-123',
    };
    const headers = { 'idempotency-key': 'create-idem-user-0001' };
    const first = await createUser(owner, payload, headers);
    const retry = await createUser(owner, payload, headers);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.json()).toEqual(first.json());
    const reused = await createUser(owner, { ...payload, role: 'accountant' }, headers);
    expect(reused.statusCode).toBe(422);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('GET /api/v1/users', () => {
  it('paginates with an opaque cursor and filters by role', async () => {
    const first = await ctx.app.inject({ method: 'GET', url: '/api/v1/users?limit=2', headers: owner.auth });
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.data).toHaveLength(2);
    expect(body.page.nextCursor).toEqual(expect.any(String));
    const second = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/users?limit=2&cursor=${encodeURIComponent(body.page.nextCursor as string)}`,
      headers: owner.auth,
    });
    const ids = [...body.data, ...second.json().data].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(ids.length);

    const owners = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/users?role=owner',
      headers: owner.auth,
    });
    expect(owners.json().data.every((u: { role: string }) => u.role === 'owner')).toBe(true);
  });

  it('rejects unbounded or unknown query parameters', async () => {
    for (const query of ['limit=1000', 'sort=passwordHash', 'role[$ne]=owner', 'cursor=%7B%7D']) {
      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/users?${query}`,
        headers: owner.auth,
      });
      expect(response.statusCode, query).toBe(400);
    }
  });

  it('is not available to staff', async () => {
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/users', headers: engineer.auth })).statusCode,
    ).toBe(403);
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('prevents changing your own role or status', async () => {
    const me = (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: manager.auth })).json()
      .data;
    const self = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${me.id as string}`,
      headers: manager.auth,
      payload: { role: 'owner' },
    });
    expect(self.statusCode).toBe(403);
  });

  it('does not let a general manager modify an owner', async () => {
    const target = await seedUser(ctx, { username: 'protected.owner', role: 'owner' });
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${target._id.toHexString()}`,
      headers: manager.auth,
      payload: { status: 'disabled' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('invalidates tokens on role change', async () => {
    const user = await seedUser(ctx, { username: 'promoted', role: 'site_engineer' });
    const session = await login(ctx.app, 'promoted');
    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${user._id.toHexString()}`,
      headers: owner.auth,
      payload: { role: 'project_manager', displayName: 'Promoted PM' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data).toMatchObject({ role: 'project_manager', displayName: 'Promoted PM' });
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: session.auth })).statusCode,
    ).toBe(401);
  });

  it('returns 404 for unknown ids and 400 for malformed ids or empty bodies', async () => {
    const call = (id: string, payload: Record<string, unknown>) =>
      ctx.app.inject({ method: 'PATCH', url: `/api/v1/users/${id}`, headers: owner.auth, payload });
    expect((await call('65f000000000000000000000', { displayName: 'X' })).statusCode).toBe(404);
    expect((await call('not-an-id', { displayName: 'X' })).statusCode).toBe(400);
    expect((await call('65f000000000000000000000', {})).statusCode).toBe(400);
  });
});

describe('UsersService last-owner guard', () => {
  it('refuses to disable or demote the last active owner (race backstop)', async () => {
    const { UsersService } = await import('../../src/modules/users/users.service.js');
    const { UsersRepository } = await import('../../src/modules/users/users.repository.js');
    const { NoopAuthStateCache } = await import('../../src/modules/users/auth-state-cache.js');
    const { FastTestHasher } = await import('../helpers/fakes.js');
    const solo = await createTestApp();
    try {
      const only = await seedUser(solo, { username: 'only.owner', role: 'owner' });
      const service = new UsersService(
        new UsersRepository(solo.db, 5000),
        new FastTestHasher(),
        new NoopAuthStateCache(),
        solo.clock,
      );
      // An owner principal whose own account was disabled concurrently.
      const { ObjectId } = await import('mongodb');
      const actor = { userId: new ObjectId(), role: 'owner' as const, sessionId: 'x' };
      await expect(service.updateUser(actor, only._id, { status: 'disabled' })).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATE',
      });
      await expect(service.updateUser(actor, only._id, { role: 'general_manager' })).rejects.toMatchObject({
        statusCode: 409,
      });
      await expect(service.updateUser(actor, only._id, { displayName: 'Fine' })).resolves.toMatchObject({
        displayName: 'Fine',
      });
    } finally {
      await solo.close();
    }
  });
});

describe('PUT /api/v1/users/:id/password', () => {
  it('resets the password and signs the user out', async () => {
    const user = await seedUser(ctx, { username: 'forgot.pin', role: 'supervisor' });
    const session = await login(ctx.app, 'forgot.pin');
    const reset = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/users/${user._id.toHexString()}/password`,
      headers: manager.auth,
      payload: { newPassword: 'reset-by-admin-1' },
    });
    expect(reset.statusCode).toBe(204);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: session.auth })).statusCode,
    ).toBe(401);
    await expect(login(ctx.app, 'forgot.pin', 'reset-by-admin-1')).resolves.toBeDefined();
  });
});
