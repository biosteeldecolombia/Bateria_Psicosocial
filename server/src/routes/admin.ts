import type { FastifyPluginAsync } from 'fastify';
import { desc, eq, inArray } from 'drizzle-orm';
import { createCompanySchema, createUserSchema, MFA_ROLES } from '@sanithelp/shared';
import { auditLog, companies, psychologistCompanies, users } from '../db/schema.js';
import { audit, revokeUserSessions } from '../auth/service.js';
import { generateTempPassword, hashPassword } from '../security/passwords.js';

const uuidParam = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Gestión de empresas y de cuentas de personas (administrador, psicóloga, empresa).
 * Las contraseñas las define y restablece el administrador: no hay cambio autogestionado.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;

  app.post('/admin/companies', { preHandler: app.requireReady('admin') }, async (req, reply) => {
    const body = createCompanySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const [dup] = await db.select({ id: companies.id }).from(companies).where(eq(companies.code, body.data.code)).limit(1);
    if (dup) return reply.code(409).send({ error: 'Ya existe una empresa con ese código.' });
    const [row] = await db.insert(companies).values(body.data).returning();
    await audit(db, req.auth!.user.id, 'company.created', { type: 'company', id: row!.id });
    return reply.code(201).send(row);
  });

  app.get('/companies', { preHandler: app.requireReady('admin', 'psychologist') }, async (req) => {
    const actor = req.auth!.user;
    if (actor.role === 'admin') return db.select().from(companies).orderBy(companies.name);
    const ids = (await db.select({ id: psychologistCompanies.companyId }).from(psychologistCompanies).where(eq(psychologistCompanies.userId, actor.id))).map((r) => r.id);
    if (!ids.length) return [];
    return db.select().from(companies).where(inArray(companies.id, ids)).orderBy(companies.name);
  });

  app.post('/admin/users', { preHandler: app.requireReady('admin') }, async (req, reply) => {
    const body = createUserSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const input = body.data;
    if (input.role === 'company' && !input.companyId) return reply.code(400).send({ error: 'La empresa es obligatoria para este rol.' });
    if (input.companyId) {
      const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, input.companyId)).limit(1);
      if (!c) return reply.code(400).send({ error: 'Empresa inexistente.' });
    }
    const blind = crypto.blindIndex(input.username);
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.usernameBlind, blind)).limit(1);
    if (dup) return reply.code(409).send({ error: 'Ya existe un usuario con ese identificador.' });

    const password = generateTempPassword(14);
    const [row] = await db
      .insert(users)
      .values({
        role: input.role,
        usernameBlind: blind,
        usernameEnc: crypto.encrypt(input.username),
        fullNameEnc: crypto.encrypt(input.fullName),
        professionalRegistryEnc: input.professionalRegistry ? crypto.encrypt(input.professionalRegistry) : null,
        professionalDocumentEnc: input.professionalDocument ? crypto.encrypt(input.professionalDocument) : null,
        companyId: input.companyId ?? null,
        passwordHash: await hashPassword(password),
      })
      .returning({ id: users.id });

    if (input.role === 'psychologist' && input.assignedCompanyIds?.length) {
      await db.insert(psychologistCompanies).values(input.assignedCompanyIds.map((companyId) => ({ userId: row!.id, companyId })));
    }
    await audit(db, req.auth!.user.id, 'user.created', { type: 'user', id: row!.id }, { role: input.role, mfaRequired: MFA_ROLES.includes(input.role) });
    // La contraseña se muestra una sola vez; no se guarda en claro.
    return reply.code(201).send({ id: row!.id, username: input.username, password });
  });

  /** Restablece la contraseña de una cuenta de persona y cierra sus sesiones. Solo administrador. */
  app.post('/admin/users/:id/reset-password', { preHandler: app.requireReady('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuidParam(id)) return reply.code(400).send({ error: 'Identificador inválido' });
    const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
    if (!target || target.role === 'collaborator') return reply.code(404).send({ error: 'Usuario no encontrado' });
    const password = generateTempPassword(14);
    await db.update(users).set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null }).where(eq(users.id, id));
    await revokeUserSessions(db, id);
    await audit(db, req.auth!.user.id, 'user.password_reset', { type: 'user', id });
    return { password };
  });

  app.post('/admin/users/:id/active', { preHandler: app.requireReady('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const active = (req.body as { active?: unknown })?.active;
    if (!uuidParam(id) || typeof active !== 'boolean') return reply.code(400).send({ error: 'Datos inválidos' });
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!target || target.id === req.auth!.user.id) return reply.code(404).send({ error: 'Usuario no encontrado' });
    await db.update(users).set({ active }).where(eq(users.id, id));
    if (!active) await revokeUserSessions(db, id);
    await audit(db, req.auth!.user.id, active ? 'user.activated' : 'user.deactivated', { type: 'user', id });
    return { ok: true };
  });

  app.get('/admin/audit', { preHandler: app.requireReady('admin') }, async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 100) || 100, 500);
    return db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit);
  });
};
