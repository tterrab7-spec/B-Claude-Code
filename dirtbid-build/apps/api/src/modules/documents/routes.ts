import { and, desc, eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { notFound, validation } from '../../lib/errors.js';
import { canAccessProject, requireAuth } from '../../lib/policy.js';
import { randomToken } from '../../lib/ids.js';

const projectIdParam = z.object({ id: z.uuid() });
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

/**
 * Documents: metadata lives in Postgres; bytes live in S3 (presigned PUT) or, in
 * development, on local disk through PUT /documents/:id/upload. The S3 client is
 * loaded lazily so it stays an optional dependency.
 */
export async function documentRoutes(app: App): Promise<void> {
  app.post('/documents/presign', { schema: { tags: ['documents'], body: z.object({ projectId: z.uuid(), fileName: z.string().min(1).max(200), contentType: z.string().min(3).max(120), category: z.string().max(60).default('general'), sizeBytes: z.number().int().positive().optional() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    const project = await canAccessProject(app.db, p, req.body.projectId, 'write');
    const key = `projects/${project.id}/${req.body.category}/${Date.now()}-${randomToken(6)}-${safe(req.body.fileName)}`;
    const [doc] = await app.db.insert(schema.documents).values({ projectId: project.id, organizationId: project.organizationId, uploadedByUserId: p.id, category: req.body.category, fileName: req.body.fileName, contentType: req.body.contentType, storageKey: key, sizeBytes: req.body.sizeBytes }).returning();
    if (app.cfg.s3Bucket) {
      const s3: any = await import('@aws-sdk/client-s3' as string).catch(() => null);
      const presigner: any = await import('@aws-sdk/s3-request-presigner' as string).catch(() => null);
      if (!s3 || !presigner) throw validation('S3_BUCKET is set but @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner are not installed');
      const client = new s3.S3Client({ region: app.cfg.awsRegion });
      const uploadUrl = await presigner.getSignedUrl(client, new s3.PutObjectCommand({ Bucket: app.cfg.s3Bucket, Key: key, ContentType: req.body.contentType }), { expiresIn: 900 });
      return { uploadUrl, documentId: doc!.id, key, method: 'PUT' };
    }
    return { uploadUrl: `/v1/documents/${doc!.id}/upload`, documentId: doc!.id, key, method: 'PUT' };
  });

  // Accept any content type as a raw buffer for uploads (JSON keeps its own parser).
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.put('/documents/:id/upload', { schema: { tags: ['documents'], params: z.object({ id: z.uuid() }) }, bodyLimit: 25 * 1024 * 1024 }, async (req) => {
    const [doc] = await app.db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).limit(1);
    if (!doc || !doc.projectId) throw notFound('Document');
    await canAccessProject(app.db, req.principal, doc.projectId, 'write');
    const buf: Buffer = Buffer.isBuffer(req.body) ? req.body : typeof req.body === 'string' ? Buffer.from(req.body) : Buffer.alloc(0);
    const target = path.join(app.cfg.localUploadDir, doc.storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buf);
    const [updated] = await app.db.update(schema.documents).set({ status: 'uploaded', sizeBytes: buf.length }).where(eq(schema.documents.id, doc.id)).returning();
    return { document: updated };
  });

  app.post('/documents/:id/complete', { schema: { tags: ['documents'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const body = z.object({ sizeBytes: z.number().int().positive().optional() }).parse(req.body ?? {});
    const [doc] = await app.db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).limit(1);
    if (!doc || !doc.projectId) throw notFound('Document');
    await canAccessProject(app.db, req.principal, doc.projectId, 'write');
    const [updated] = await app.db.update(schema.documents).set({ status: 'uploaded', sizeBytes: body.sizeBytes ?? doc.sizeBytes }).where(eq(schema.documents.id, doc.id)).returning();
    return { document: updated };
  });

  app.get('/projects/:id/documents', { schema: { tags: ['documents'], params: projectIdParam, querystring: z.object({ category: z.string().optional() }) } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.documents).where(and(eq(schema.documents.projectId, req.params.id), req.query.category ? eq(schema.documents.category, req.query.category) : undefined)).orderBy(desc(schema.documents.createdAt)) };
  });

  app.get('/projects/:id/updates', { schema: { tags: ['documents'], params: projectIdParam } }, async (req) => {
    const p = requireAuth(req.principal);
    await canAccessProject(app.db, p, req.params.id, 'read');
    const rows = await app.db.select().from(schema.projectUpdates).where(eq(schema.projectUpdates.projectId, req.params.id)).orderBy(desc(schema.projectUpdates.createdAt));
    const isInternal = p.roles.some((r) => ['staff', 'admin', 'builder'].includes(r));
    return { items: rows.filter((u) => u.visibility !== 'internal' || isInternal) };
  });

  app.post('/projects/:id/updates', { schema: { tags: ['documents'], params: projectIdParam, body: z.object({ body: z.string().min(1).max(10000), photoDocumentIds: z.array(z.uuid()).default([]), visibility: z.enum(['owner', 'investor', 'internal']).default('owner') }) } }, async (req, reply) => {
    const p = requireAuth(req.principal);
    const project = await canAccessProject(app.db, p, req.params.id, 'write');
    const [u] = await app.db.insert(schema.projectUpdates).values({ projectId: project.id, organizationId: project.organizationId, authorUserId: p.id, ...req.body }).returning();
    reply.status(201);
    return { update: u };
  });
}
