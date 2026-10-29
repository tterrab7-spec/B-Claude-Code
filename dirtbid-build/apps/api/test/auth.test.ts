import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, makeApp, uniq, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('magic link auth', () => {
  it('issues a link, verifies it, exposes /me, and rejects reuse', async () => {
    const email = `${uniq('owner')}@example.com`;
    const req = await ctx.app.inject({ method: 'POST', url: '/v1/auth/magic-link', payload: { email, redirectTo: '/app' } });
    expect(req.statusCode).toBe(202);
    const { devLink } = req.json();
    expect(devLink).toContain('/auth/verify?token=');
    expect(ctx.sent.at(-1)?.to).toBe(email);
    const token = new URL(devLink).searchParams.get('token')!;

    const verify = await ctx.app.inject({ method: 'GET', url: `/v1/auth/verify?token=${token}` });
    expect(verify.statusCode).toBe(200);
    const body = verify.json();
    expect(body.user.email).toBe(email);
    expect(body.redirectTo).toBe('/app');
    expect(verify.cookies.find((c) => c.name === 'db_session')).toBeTruthy();

    const me = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(body.token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.roles).toContain('landowner');

    const reuse = await ctx.app.inject({ method: 'GET', url: `/v1/auth/verify?token=${token}` });
    expect(reuse.statusCode).toBe(400);

    const logout = await ctx.app.inject({ method: 'POST', url: '/v1/auth/logout', headers: auth(body.token) });
    expect(logout.statusCode).toBe(204);
    const after = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(body.token) });
    expect(after.statusCode).toBe(401);
  });

  it('never reveals whether an email exists and rejects garbage tokens', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/auth/magic-link', payload: { email: `${uniq('nobody')}@example.com` } });
    expect(r.statusCode).toBe(202);
    const bad = await ctx.app.inject({ method: 'GET', url: '/v1/auth/verify?token=not-a-real-token' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('validation');
  });

  it('requires auth on protected routes', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('unauthorized');
  });
});
