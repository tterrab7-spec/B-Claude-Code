import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createProjectWithBudget, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('documents and updates', () => {
  it('presigns a local upload, stores bytes, lists by category and filters internal updates', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`, ['builder']);
    const { project } = await createProjectWithBudget(ctx.app, owner.token);
    const h = auth(owner.token);
    const pre = (await ctx.app.inject({ method: 'POST', url: '/v1/documents/presign', headers: h, payload: { projectId: project.id, fileName: 'framing 1.jpg', contentType: 'image/jpeg', category: 'photo' } })).json();
    expect(pre.uploadUrl).toContain(`/v1/documents/${pre.documentId}/upload`);
    const up = await ctx.app.inject({ method: 'PUT', url: pre.uploadUrl, headers: { ...h, 'content-type': 'image/jpeg' }, payload: Buffer.from('fake-jpeg-bytes') });
    expect(up.statusCode).toBe(200);
    expect(up.json().document).toMatchObject({ status: 'uploaded', sizeBytes: 15 });
    const docs = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/documents?category=photo`, headers: h })).json().items;
    expect(docs).toHaveLength(1);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/updates`, headers: h, payload: { body: 'Framing 60% complete', photoDocumentIds: [pre.documentId], visibility: 'investor' } });
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/updates`, headers: h, payload: { body: 'Sub is late again', visibility: 'internal' } });
    const viewer = await userWithToken(ctx.app, `${uniq('lp')}@example.com`, ['investor']);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/members`, headers: h, payload: { userId: viewer.id, role: 'investor' } });
    const lp = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/updates`, headers: auth(viewer.token) })).json().items;
    expect(lp).toHaveLength(1);
    const mine = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/updates`, headers: h })).json().items;
    expect(mine).toHaveLength(2);
  });
});
