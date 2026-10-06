import type { FastifyPluginAsync } from 'fastify';
import { desc, eq, inArray } from 'drizzle-orm';
import { createCompanySchema, createUserSchema, updateUserSchema, MFA_ROLES } from '@sanithelp/shared';
import { auditLog, companies, psychologistCompanies, users } from '../db/schema.js';
import { audit, revokeUserSessions } from '../auth/service.js';
import { generateTempPassword, hashPassword, validatePasswordPolicy } from '../security/passwords.js';

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

  /** Cuentas de personas (no incluye las credenciales compartidas de colaboradores), con sus empresas asignadas. Solo administrador. */
  app.get('/admin/users', { preHandler: app.requireReady('admin') }, async () => {
    const rows = await db.select().from(users).where(inArray(users.role, ['admin', 'psychologist', 'company'])).orderBy(users.createdAt);
    const cos = await db.select({ id: companies.id, name: companies.name, code: companies.code }).from(companies);
    const coById = new Map(cos.map((c) => [c.id, c]));
    const links = await db.select().from(psychologistCompanies);
    const safe = (enc: string | null) => {
      if (!enc) return '';
      try {
        return crypto.decrypt(enc);
      } catch {
        return '';
      }
    };
    return rows.map((u) => {
      const ids = u.role === 'psychologist' ? links.filter((l) => l.userId === u.id).map((l) => l.companyId) : u.companyId ? [u.companyId] : [];
      return {
        id: u.id,
        role: u.role,
        username: safe(u.usernameEnc),
        fullName: safe(u.fullNameEnc),
        professionalRegistry: safe(u.professionalRegistryEnc),
        professionalDocument: safe(u.professionalDocumentEnc),
        active: u.active,
        mfaRequired: MFA_ROLES.includes(u.role),
        mfaEnabled: u.mfaEnabled,
        locked: !!u.lockedUntil && u.lockedUntil > new Date(),
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        companies: ids.map((id) => coById.get(id)).filter((c): c is NonNullable<typeof c> => !!c),
      };
    });
  });

  /** Reemplaza las empresas que atiende una psicóloga. Solo administrador. */
  app.put('/admin/users/:id/companies', { preHandler: app.requireReady('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ids = (req.body as { companyIds?: unknown })?.companyIds;
    if (!uuidParam(id) || !Array.isArray(ids) || !ids.every(uuidParam)) return reply.code(400).send({ error: 'Datos inválidos' });
    const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
    if (!target || target.role !== 'psychologist') return reply.code(404).send({ error: 'Psicóloga no encontrada' });
    const unique = [...new Set(ids as string[])];
    if (unique.length) {
      const found = await db.select({ id: companies.id }).from(companies).where(inArray(companies.id, unique));
      if (found.length !== unique.length) return reply.code(400).send({ error: 'Empresa inexistente.' });
    }
    await db.transaction(async (tx) => {
      await tx.delete(psychologistCompanies).where(eq(psychologistCompanies.userId, id));
      if (unique.length) await tx.insert(psychologistCompanies).values(unique.map((companyId) => ({ userId: id, companyId })));
    });
    await audit(db, req.auth!.user.id, 'user.companies_updated', { type: 'user', id }, { count: unique.length });
    return { ok: true };
  });

  /**
   * Edita los datos, el rol y las empresas de una cuenta de persona. Solo administrador.
   * Cambiar el rol o el usuario cierra las sesiones abiertas de esa cuenta.
   */
  app.put('/admin/users/:id', { preHandler: app.requireReady('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateUserSchema.safeParse(req.body);
    if (!uuidParam(id) || !body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const input = body.data;
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target || target.role === 'collaborator') return reply.code(404).send({ error: 'Usuario no encontrado' });
    const isSelf = target.id === req.auth!.user.id;
    const newRole = input.role ?? target.role;
    if (isSelf && newRole !== target.role) return reply.code(400).send({ error: 'No puedes cambiar tu propio rol.' });

    const set: Partial<typeof users.$inferInsert> = {};
    let revoke = false;
    if (input.fullName !== undefined) set.fullNameEnc = crypto.encrypt(input.fullName);
    if (input.username !== undefined && input.username !== crypto.decrypt(target.usernameEnc)) {
      const blind = crypto.blindIndex(input.username);
      const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.usernameBlind, blind)).limit(1);
      if (dup && dup.id !== id) return reply.code(409).send({ error: 'Ya existe un usuario con ese identificador.' });
      set.usernameBlind = blind;
      set.usernameEnc = crypto.encrypt(input.username);
      revoke = true;
    }
    if (input.professionalRegistry !== undefined) set.professionalRegistryEnc = input.professionalRegistry ? crypto.encrypt(input.professionalRegistry) : null;
    if (input.professionalDocument !== undefined) set.professionalDocumentEnc = input.professionalDocument ? crypto.encrypt(input.professionalDocument) : null;
    if (newRole !== target.role) {
      set.role = newRole;
      revoke = true;
    }

    let companyId: string | null = newRole === 'company' ? (input.companyId ?? target.companyId) : null;
    if (newRole === 'company' && !companyId) return reply.code(400).send({ error: 'La empresa es obligatoria para este rol.' });
    const wanted = newRole === 'psychologist' ? input.assignedCompanyIds : undefined;
    const check = [...new Set([...(companyId ? [companyId] : []), ...(wanted ?? [])])];
    if (check.length) {
      const found = await db.select({ id: companies.id }).from(companies).where(inArray(companies.id, check));
      if (found.length !== check.length) return reply.code(400).send({ error: 'Empresa inexistente.' });
    }
    set.companyId = companyId;

    await db.transaction(async (tx) => {
      if (Object.keys(set).length) await tx.update(users).set(set).where(eq(users.id, id));
      if (newRole !== 'psychologist') await tx.delete(psychologistCompanies).where(eq(psychologistCompanies.userId, id));
      else if (wanted) {
        await tx.delete(psychologistCompanies).where(eq(psychologistCompanies.userId, id));
        const unique = [...new Set(wanted)];
        if (unique.length) await tx.insert(psychologistCompanies).values(unique.map((companyId2) => ({ userId: id, companyId: companyId2 })));
      }
    });
    if (revoke && !isSelf) await revokeUserSessions(db, id);
    await audit(db, req.auth!.user.id, 'user.updated', { type: 'user', id }, { fields: Object.keys(input), roleChanged: newRole !== target.role });
    return { ok: true };
  });

  /**
   * Restablece la contraseña de una cuenta de persona y cierra sus sesiones. Solo administrador.
   * Si el cuerpo trae `password`, se usa esa (validada con la política); si no, se genera una.
   */
  app.post('/admin/users/:id/reset-password', { preHandler: app.requireReady('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuidParam(id)) return reply.code(400).send({ error: 'Identificador inválido' });
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target || target.role === 'collaborator') return reply.code(404).send({ error: 'Usuario no encontrado' });
    const chosen = (req.body as { password?: unknown } | null)?.password;
    let password: string;
    if (chosen === undefined || chosen === '') password = generateTempPassword(14);
    else {
      if (typeof chosen !== 'string' || chosen.length > 200) return reply.code(400).send({ error: 'Contraseña inválida.' });
      const username = crypto.decrypt(target.usernameEnc);
      const policy = validatePasswordPolicy(chosen, target.role, [username.split('@')[0] ?? '', crypto.decrypt(target.fullNameEnc)]);
      if (policy) return reply.code(400).send({ error: policy });
      password = chosen;
    }
    await db.update(users).set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null }).where(eq(users.id, id));
    await revokeUserSessions(db, id);
    await audit(db, req.auth!.user.id, 'user.password_reset', { type: 'user', id }, { chosenByAdmin: chosen !== undefined && chosen !== '' });
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
