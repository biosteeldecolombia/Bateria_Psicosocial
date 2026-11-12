import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CONFIGURABLE_ROLES, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, PERMISSION_KEYS, defaultMatrix, isConfigurableRole, type PermissionKey } from '@sanithelp/shared';
import { rolePermissions } from '../db/schema.js';
import { audit } from '../auth/service.js';
import { permissionStore } from '../auth/permissions.js';

const bodySchema = z.object({ permissions: z.record(z.string(), z.boolean()) });

/** Roles y permisos: el administrador decide qué puede ver y hacer cada rol (psicóloga, auxiliar, empresa cliente). */
export const rolesRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.appCtx;
  const store = permissionStore(db);
  const guard = app.requirePerm('roles.manage');

  app.get('/admin/roles', { preHandler: guard }, async () => ({
    permissions: PERMISSIONS,
    roles: CONFIGURABLE_ROLES,
    matrix: await store.matrix(),
    defaults: defaultMatrix(),
  }));

  /** Guarda los permisos de un rol. Solo se almacenan las diferencias con los valores por defecto. */
  app.put('/admin/roles/:role', { preHandler: guard }, async (req, reply) => {
    const { role } = req.params as { role: string };
    const body = bodySchema.safeParse(req.body);
    if (!isConfigurableRole(role) || !body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const actor = req.auth!.user;
    const rows: { role: string; permission: string; granted: boolean; updatedBy: string }[] = [];
    for (const key of PERMISSION_KEYS) {
      const def = PERMISSIONS.find((p) => p.key === key)!;
      if (def.adminOnly) continue;
      const wanted = body.data.permissions[key];
      if (wanted === undefined) continue;
      if (wanted !== DEFAULT_ROLE_PERMISSIONS[role].includes(key as PermissionKey)) rows.push({ role, permission: key, granted: wanted, updatedBy: actor.id });
    }
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.role, role));
      if (rows.length) await tx.insert(rolePermissions).values(rows);
    });
    store.invalidate();
    await audit(db, actor.id, 'role.permissions_updated', { type: 'role', id: role }, { changes: rows.length, granted: rows.filter((r) => r.granted).map((r) => r.permission), revoked: rows.filter((r) => !r.granted).map((r) => r.permission) });
    return { ok: true, matrix: await store.matrix() };
  });

  /** Vuelve a los permisos por defecto de un rol. */
  app.delete('/admin/roles/:role', { preHandler: guard }, async (req, reply) => {
    const { role } = req.params as { role: string };
    if (!isConfigurableRole(role)) return reply.code(400).send({ error: 'Datos inválidos' });
    await db.delete(rolePermissions).where(eq(rolePermissions.role, role));
    store.invalidate();
    await audit(db, req.auth!.user.id, 'role.permissions_reset', { type: 'role', id: role });
    return { ok: true, matrix: await store.matrix() };
  });

};
