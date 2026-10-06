import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { GROUPING_FIELDS, INTERVENTION_LEVELS, INTRA_LEVELS, STRESS_LEVELS, domainTables, filterRows, groupValues, summaryTotal, type GroupingField } from '@sanithelp/scoring';
import { campaigns, companies, participants } from '../db/schema.js';
import { audit } from '../auth/service.js';
import { loadRecords } from '../results/service.js';

/** Campos de agrupación que la empresa puede usar: ninguno identifica a una persona (no se ofrece cargo ni documento). */
const COMPANY_FIELDS: GroupingField[] = ['TIPO DE CARGO', 'Dpto/Area/Secc', 'Sexo', 'ESTADO_CIVIL', 'NIVEL_ESTUDIOS', 'TIPO_CONTRATO', 'FORMATOINTRAL_TIPOCARGO'];

/**
 * Reportes para la EMPRESA CLIENTE: solo agregados y anónimos.
 *  - Nunca se devuelven nombres, documentos ni filas individuales.
 *  - Un grupo con menos personas que el mínimo de la empresa (por defecto 5) se oculta.
 */
export const companyRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  const only = app.requireReady('company');

  async function ownCampaign(companyId: string | null, id: string) {
    if (!companyId || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))).limit(1);
    return c ?? null;
  }
  const minOf = async (companyId: string) => (await db.select({ m: companies.minGroupSize }).from(companies).where(eq(companies.id, companyId)).limit(1))[0]?.m ?? 5;

  app.get('/company/campaigns', { preHandler: only }, async (req) => {
    const companyId = req.auth!.user.companyId;
    if (!companyId) return [];
    const rows = await db.select().from(campaigns).where(eq(campaigns.companyId, companyId)).orderBy(desc(campaigns.createdAt));
    const out = [];
    for (const c of rows) {
      const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(participants).where(and(eq(participants.campaignId, c.id), eq(participants.status, 'completed')));
      out.push({ id: c.id, name: c.name, status: c.status, completed: n?.n ?? 0 });
    }
    return { min: await minOf(companyId), campaigns: out };
  });

  /** Resumen agregado. Con `field` y `value` filtra por grupo; si el grupo es menor al mínimo, se oculta. */
  app.get('/company/campaigns/:id/report', { preHandler: only }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.auth!.user;
    const c = await ownCampaign(user.companyId, id);
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const min = await minOf(c.companyId);
    const q = req.query as { field?: string; value?: string };
    const field = COMPANY_FIELDS.includes(q.field as GroupingField) ? (q.field as GroupingField) : null;
    const value = q.value ?? '*';
    const all = (await loadRecords(db, crypto, c.id)).map((r) => r.row);
    const rows = filterRows(all, field, value);
    await audit(db, user.id, 'company.report_viewed', { type: 'campaign', id: c.id });
    const base = { min, field, value, fields: COMPANY_FIELDS, levels: { intra: INTRA_LEVELS, stress: STRESS_LEVELS }, interventionLevels: INTERVENTION_LEVELS };
    if (rows.length < min) {
      return { ...base, suppressed: true, message: `Hay menos de ${min} personas en este grupo; por confidencialidad no se muestran resultados.` };
    }
    // Opciones de grupo: los grupos pequeños se agrupan bajo «Otros» sin revelar su tamaño
    const options = field ? groupValues(all, field) : [];
    const visible = options.filter((o) => o.people >= min);
    return { ...base, suppressed: false, people: rows.length, summary: summaryTotal(rows), tables: domainTables(rows), groups: visible.map((o) => ({ value: o.value, people: o.people })), hiddenGroups: options.length - visible.length };
  });

  app.get('/company/campaigns/:id/groups', { preHandler: only }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await ownCampaign(req.auth!.user.companyId, id);
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const min = await minOf(c.companyId);
    const f = (req.query as { field?: string }).field as GroupingField;
    if (!COMPANY_FIELDS.includes(f)) return { fields: COMPANY_FIELDS, values: [], hidden: 0 };
    const all = (await loadRecords(db, crypto, c.id)).map((r) => r.row);
    const vals = groupValues(all, f);
    return { fields: COMPANY_FIELDS, values: vals.filter((v) => v.people >= min), hidden: vals.filter((v) => v.people < min).length };
  });

  void GROUPING_FIELDS;
};
