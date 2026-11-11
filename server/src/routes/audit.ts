import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, gte, ilike, inArray, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { auditLog, users } from '../db/schema.js';
import { audit, revokeUserSessions } from '../auth/service.js';

const uuidParam = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Evitar inyección de fórmulas al abrir el CSV en Excel. */
const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Hora de Colombia (UTC-5) de una fecha: se usa para los filtros por día y para detectar accesos fuera de horario. */
const colombiaStart = (day: string) => new Date(`${day}T00:00:00-05:00`);
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

type Severity = 'high' | 'medium' | 'low';
interface Alert {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  count: number;
  firstAt: string;
  lastAt: string;
  /** Filtros con los que el administrador ve los movimientos que originaron la alerta. */
  filter: { category?: string; actor?: string; ip?: string; action?: string };
}

/**
 * Auditoría (solo administrador): todos los movimientos de todas las cuentas con filtros, CSV y alertas de actividad sospechosa
 * (intentos fallidos de ingreso, adivinación de contraseñas, descargas inusuales, accesos nuevos o fuera de horario).
 * El registro es de solo inserción (lo garantiza la base de datos).
 */
export const auditRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  const adminOnly = app.requireReady('admin');

  const safe = (enc: string | null) => {
    if (!enc) return '';
    try {
      return crypto.decrypt(enc);
    } catch {
      return '';
    }
  };

  /** Cuentas con nombre, correo y rol descifrados (se usa para mostrar y para filtrar por persona). */
  async function accounts() {
    const rows = await db.select({ id: users.id, role: users.role, usernameEnc: users.usernameEnc, fullNameEnc: users.fullNameEnc, active: users.active, lockedUntil: users.lockedUntil, failedAttempts: users.failedAttempts }).from(users);
    return new Map(rows.map((u) => [u.id, { id: u.id, role: u.role, username: safe(u.usernameEnc), name: safe(u.fullNameEnc), active: u.active, lockedUntil: u.lockedUntil, failedAttempts: u.failedAttempts }]));
  }

  /** Condiciones SQL a partir de los filtros de la consulta. Devuelve null si el filtro por persona no coincide con nadie. */
  async function conditions(q: Record<string, string | undefined>, acc: Awaited<ReturnType<typeof accounts>>): Promise<SQL[] | null> {
    const c: SQL[] = [];
    if (isDay(q.from)) c.push(gte(auditLog.at, colombiaStart(q.from)));
    if (isDay(q.to)) c.push(lt(auditLog.at, new Date(colombiaStart(q.to).getTime() + 24 * 3600_000)));
    if (q.category && /^[a-z_]{2,30}$/.test(q.category)) c.push(like(auditLog.action, `${q.category}.%`));
    if (q.action && q.action.trim()) c.push(ilike(auditLog.action, `%${escapeLike(q.action.trim().slice(0, 60))}%`));
    if (q.ip && q.ip.trim()) c.push(sql`${auditLog.meta}->>'ip' = ${q.ip.trim().slice(0, 64)}`);
    if (q.actor && q.actor.trim()) {
      const needle = q.actor.trim().toLowerCase();
      const ids = [...acc.values()].filter((u) => u.name.toLowerCase().includes(needle) || u.username.toLowerCase().includes(needle)).map((u) => u.id);
      if (!ids.length) return null;
      c.push(inArray(auditLog.actorId, ids));
    }
    return c;
  }

  const view = (r: typeof auditLog.$inferSelect, acc: Awaited<ReturnType<typeof accounts>>) => {
    const a = r.actorId ? acc.get(r.actorId) : undefined;
    return {
      id: r.id,
      at: r.at,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      ip: typeof r.meta?.ip === 'string' ? r.meta.ip : null,
      meta: r.meta,
      actor: r.actorId ? { id: r.actorId, name: a?.name || 'Cuenta eliminada', username: a?.username ?? '', role: a?.role ?? null } : null,
    };
  };

  /** Movimientos, del más reciente al más antiguo. Paginación por cursor (`before` = id del último movimiento recibido). */
  app.get('/admin/audit', { preHandler: adminOnly }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit ?? 50) || 50, 1), 200);
    const acc = await accounts();
    const c = await conditions(q, acc);
    if (c === null) return { rows: [], nextBefore: null };
    if (q.before && /^\d{1,15}$/.test(q.before)) c.push(lt(auditLog.id, Number(q.before)));
    const rows = await db.select().from(auditLog).where(c.length ? and(...c) : undefined).orderBy(desc(auditLog.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    return { rows: page.map((r) => view(r, acc)), nextBefore: rows.length > limit ? page[page.length - 1]!.id : null };
  });

  /** Descarga CSV con los mismos filtros (hasta 5.000 movimientos). */
  app.get('/admin/audit.csv', { preHandler: adminOnly }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const acc = await accounts();
    const c = await conditions(q, acc);
    const rows = c === null ? [] : await db.select().from(auditLog).where(c.length ? and(...c) : undefined).orderBy(desc(auditLog.id)).limit(5000);
    const head = ['Fecha (UTC)', 'Cuenta', 'Correo', 'Rol', 'Acción', 'Objeto', 'Identificador', 'IP', 'Detalle'];
    const lines = [head.join(';'), ...rows.map((r) => {
      const v = view(r, acc);
      return [v.at.toISOString(), v.actor?.name ?? '(sin sesión)', v.actor?.username ?? '', v.actor?.role ?? '', v.action, v.targetType ?? '', v.targetId ?? '', v.ip ?? '', JSON.stringify(v.meta)].map(csvCell).join(';');
    })];
    await audit(db, req.auth!.user.id, 'audit.exported', undefined, { rows: rows.length, filters: Object.keys(q).filter((k) => q[k]) });
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="Auditoria.csv"')
      .send('\uFEFF' + lines.join('\r\n'));
  });

  /** Alertas de actividad sospechosa en las últimas `hours` horas (por defecto 24) y cuentas bloqueadas en este momento. */
  app.get('/admin/audit/alerts', { preHandler: adminOnly }, async (req) => {
    const hours = Math.min(Math.max(Number((req.query as { hours?: string }).hours ?? 24) || 24, 1), 168);
    const since = new Date(Date.now() - hours * 3600_000);
    const acc = await accounts();
    const events = await db
      .select()
      .from(auditLog)
      .where(and(gte(auditLog.at, since), or(like(auditLog.action, 'auth.%'), like(auditLog.action, 'pdf.%'), like(auditLog.action, 'results.%'), eq(auditLog.action, 'user.updated'))))
      .orderBy(auditLog.id)
      .limit(30_000);
    const ip = (e: (typeof events)[number]) => (typeof e.meta?.ip === 'string' ? e.meta.ip : null);
    const name = (id: string | null) => (id ? acc.get(id)?.name || 'Cuenta eliminada' : '(usuario inexistente)');
    const span = (list: typeof events) => ({ firstAt: list[0]!.at.toISOString(), lastAt: list[list.length - 1]!.at.toISOString() });
    const alerts: Alert[] = [];
    const group = <K,>(list: typeof events, key: (e: (typeof events)[number]) => K | null) => {
      const m = new Map<K, typeof events>();
      for (const e of list) {
        const k = key(e);
        if (k !== null) m.set(k, [...(m.get(k) ?? []), e]);
      }
      return m;
    };

    // --- Intentos fallidos de ingreso ---
    const FAIL = new Set(['auth.login_failed', 'auth.mfa_failed', 'auth.locked', 'auth.login_failed_unknown', 'auth.login_blocked', 'auth.mfa_blocked', 'auth.login_inactive']);
    const failed = events.filter((e) => FAIL.has(e.action));
    for (const [addr, list] of group(failed, ip)) {
      if (list.length < 5) continue;
      const targets = new Set(list.map((e) => e.actorId ?? `u:${String(e.meta?.ref ?? '')}`));
      const spraying = targets.size >= 3;
      alerts.push({
        key: `ip:${addr}`,
        severity: spraying || list.length >= 15 ? 'high' : 'medium',
        title: spraying ? `Posible adivinación de contraseñas desde ${addr}` : `${list.length} intentos fallidos de ingreso desde ${addr}`,
        detail: `${list.length} intentos fallidos en ${hours} h sobre ${targets.size} ${targets.size === 1 ? 'cuenta' : 'cuentas distintas'}.`,
        count: list.length,
        ...span(list),
        filter: { ip: addr },
      });
    }
    for (const [id, list] of group(failed, (e) => e.actorId)) {
      const locked = list.some((e) => e.action === 'auth.locked');
      const tries = list.filter((e) => e.action === 'auth.login_failed' || e.action === 'auth.mfa_failed' || e.action === 'auth.locked').length;
      if (!locked && tries < 3) continue;
      alerts.push({
        key: `acct:${id}`,
        severity: locked ? 'high' : 'medium',
        title: locked ? `Cuenta bloqueada por intentos fallidos: ${name(id)}` : `${tries} intentos fallidos en la cuenta de ${name(id)}`,
        detail: `${tries} intentos fallidos en ${hours} h${locked ? '; la cuenta quedó en espera (puede desbloquearla abajo si fue la propia persona)' : ''}.`,
        count: list.length,
        ...span(list),
        filter: { actor: acc.get(id)?.username || name(id) },
      });
    }
    const unknown = failed.filter((e) => e.action === 'auth.login_failed_unknown');
    if (unknown.length >= 5) {
      alerts.push({ key: 'unknown', severity: 'medium', title: 'Intentos de ingreso con usuarios que no existen', detail: `${unknown.length} intentos en ${hours} h con ${new Set(unknown.map((e) => e.meta?.ref)).size} nombres de usuario distintos.`, count: unknown.length, ...span(unknown), filter: { action: 'login_failed_unknown' } });
    }

    // --- Ingreso desde una IP nueva (cuentas del personal con historial previo) ---
    const logins = events.filter((e) => e.action === 'auth.login' && e.actorId && ip(e) && acc.get(e.actorId)?.role !== 'collaborator');
    if (logins.length) {
      const past = await db
        .select({ actorId: auditLog.actorId, meta: auditLog.meta })
        .from(auditLog)
        .where(and(eq(auditLog.action, 'auth.login'), gte(auditLog.at, new Date(since.getTime() - 90 * 24 * 3600_000)), lt(auditLog.at, since), inArray(auditLog.actorId, [...new Set(logins.map((e) => e.actorId!))])))
        .limit(50_000);
      const seen = new Map<string, Set<string>>();
      for (const p of past) if (p.actorId && typeof p.meta?.ip === 'string') seen.set(p.actorId, (seen.get(p.actorId) ?? new Set()).add(p.meta.ip));
      for (const [k, list] of group(logins, (e) => `${e.actorId}|${ip(e)}`)) {
        const [id, addr] = k.split('|') as [string, string];
        if (!seen.has(id) || seen.get(id)!.has(addr)) continue;
        alerts.push({ key: `newip:${k}`, severity: 'low', title: `Ingreso desde una IP nueva: ${name(id)}`, detail: `Primer ingreso de esta cuenta desde ${addr} en los últimos 90 días.`, count: list.length, ...span(list), filter: { actor: acc.get(id)?.username || name(id), category: 'auth' } });
      }
    }

    // --- Descargas ---
    const bulkDenied = events.filter((e) => e.action === 'pdf.bulk_denied');
    for (const [id, list] of group(bulkDenied, (e) => e.actorId)) {
      alerts.push({ key: `bulkdenied:${id}`, severity: list.length >= 3 ? 'high' : 'medium', title: `Descarga masiva rechazada (contraseña o código incorrectos): ${name(id)}`, detail: `${list.length} ${list.length === 1 ? 'intento' : 'intentos'} de reconfirmación fallidos en ${hours} h.`, count: list.length, ...span(list), filter: { actor: acc.get(id)?.username || name(id), action: 'bulk_denied' } });
    }
    for (const [id, list] of group(events.filter((e) => e.action === 'pdf.bulk_requested'), (e) => e.actorId)) {
      if (list.length < 3) continue;
      alerts.push({ key: `bulk:${id}`, severity: 'medium', title: `Varias descargas masivas de expedientes: ${name(id)}`, detail: `${list.length} exportaciones ZIP solicitadas en ${hours} h.`, count: list.length, ...span(list), filter: { actor: acc.get(id)?.username || name(id), action: 'bulk_requested' } });
    }
    const downloads = events.filter((e) => e.action.startsWith('pdf.') && !e.action.startsWith('pdf.bulk'));
    for (const [k, list] of group(downloads, (e) => (e.actorId ? `${e.actorId}|${Math.floor(e.at.getTime() / 600_000)}` : null))) {
      if (list.length < 40) continue;
      const id = k.split('|')[0]!;
      alerts.push({ key: `dl:${k}`, severity: 'high', title: `Descargas inusualmente altas: ${name(id)}`, detail: `${list.length} documentos descargados en 10 minutos.`, count: list.length, ...span(list), filter: { actor: acc.get(id)?.username || name(id), category: 'pdf' } });
    }

    // --- Accesos a información clínica fuera de horario (22:00 a 05:00, hora de Colombia) ---
    const offHours = events.filter((e) => (e.action.startsWith('results.') || e.action.startsWith('pdf.')) && e.actorId && ((e.at.getUTCHours() + 19) % 24 >= 22 || (e.at.getUTCHours() + 19) % 24 < 5));
    for (const [id, list] of group(offHours, (e) => e.actorId)) {
      alerts.push({ key: `off:${id}`, severity: 'low', title: `Acceso a resultados o documentos fuera de horario: ${name(id)}`, detail: `${list.length} movimientos entre las 10 p. m. y las 5 a. m. (hora de Colombia).`, count: list.length, ...span(list), filter: { actor: acc.get(id)?.username || name(id) } });
    }

    // --- Cambios de rol ---
    for (const e of events.filter((x) => x.action === 'user.updated' && x.meta?.roleChanged === true)) {
      alerts.push({ key: `role:${e.id}`, severity: 'medium', title: `Cambio de rol de una cuenta (hecho por ${name(e.actorId)})`, detail: `Cuenta modificada: ${e.targetId ? name(e.targetId) : 'desconocida'}.`, count: 1, firstAt: e.at.toISOString(), lastAt: e.at.toISOString(), filter: { action: 'user.updated' } });
    }

    const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity] || b.lastAt.localeCompare(a.lastAt));
    const now = Date.now();
    const locked = [...acc.values()]
      .filter((u) => u.active && u.lockedUntil && u.lockedUntil.getTime() > now)
      .map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, until: u.lockedUntil!.toISOString(), attempts: u.failedAttempts }));
    return { hours, since: since.toISOString(), alerts, locked };
  });

  /** Quita la espera de una cuenta bloqueada por intentos fallidos. */
  app.post('/admin/users/:id/unlock', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuidParam(id)) return reply.code(400).send({ error: 'Identificador inválido' });
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!u) return reply.code(404).send({ error: 'Usuario no encontrado' });
    await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, id));
    await audit(db, req.auth!.user.id, 'user.unlocked', { type: 'user', id });
    return { ok: true };
  });

  void revokeUserSessions;
};
