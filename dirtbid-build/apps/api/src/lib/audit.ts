import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';

export async function audit(db: Db, entry: { actorUserId?: string | null; action: string; entityType: string; entityId?: string | null; data?: Record<string, unknown>; ipAddress?: string }): Promise<void> {
  await db.insert(schema.auditLog).values({ actorUserId: entry.actorUserId ?? null, action: entry.action, entityType: entry.entityType, entityId: entry.entityId ?? null, data: entry.data, ipAddress: entry.ipAddress });
}
