import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import { forbidden, unauthorized } from './errors.js';

export type Role = 'landowner' | 'homeowner' | 'builder' | 'investor' | 'staff' | 'admin';

export interface Principal {
  id: string;
  email: string;
  roles: string[];
  organizationIds: string[];
  sessionId: string;
}

export const isStaff = (p: Principal | null | undefined): boolean => !!p && (p.roles.includes('staff') || p.roles.includes('admin'));
export const isAdmin = (p: Principal | null | undefined): boolean => !!p && p.roles.includes('admin');

export function requireAuth(p: Principal | null | undefined): Principal {
  if (!p) throw unauthorized();
  return p;
}

export function requireStaff(p: Principal | null | undefined): Principal {
  const u = requireAuth(p);
  if (!isStaff(u)) throw forbidden('Staff access required');
  return u;
}

export function requireOrgMember(p: Principal | null | undefined, organizationId: string | null | undefined): Principal {
  const u = requireAuth(p);
  if (isStaff(u)) return u;
  if (!organizationId || !u.organizationIds.includes(organizationId)) throw forbidden('Not a member of this organization');
  return u;
}

/**
 * Single chokepoint for project access. A principal can read a project when
 * they are staff, the owner, a member of the owning organization, or listed in
 * project_members. Write access additionally requires one of: staff, owner,
 * org member, or project role gc/owner.
 */
export async function canAccessProject(db: Db, p: Principal | null | undefined, projectId: string, mode: 'read' | 'write' = 'read'): Promise<typeof schema.projects.$inferSelect> {
  const u = requireAuth(p);
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
  if (!project) throw forbidden('No access to this project');
  if (isStaff(u)) return project;
  if (project.ownerUserId === u.id) return project;
  if (project.organizationId && u.organizationIds.includes(project.organizationId)) return project;
  const [member] = await db.select().from(schema.projectMembers).where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, u.id))).limit(1);
  if (member && (mode === 'read' || member.role === 'gc' || member.role === 'owner')) return project;
  throw forbidden('No access to this project');
}

export async function loadPrincipal(db: Db, userId: string, sessionId: string): Promise<Principal | null> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return null;
  const memberships = await db.select({ organizationId: schema.orgMembers.organizationId }).from(schema.orgMembers).where(eq(schema.orgMembers.userId, userId));
  return { id: user.id, email: user.email, roles: user.roles, organizationIds: memberships.map((m) => m.organizationId), sessionId };
}
