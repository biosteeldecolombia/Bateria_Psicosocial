import { and, eq, inArray, or } from 'drizzle-orm';
import { FORMATOS, FORMATO_KINDS, type FormatoKind } from '@sanithelp/shared';
import type { Db } from '../db/client.js';
import { auditLog, campaigns, companies, consents, manualResults, participants, questionnaireAnswers } from '../db/schema.js';
import { allowedCompanyIds, assistantScope } from '../auth/access.js';
import { formatoInstrument } from '../results/formatos.js';

export interface FormatoNote { campaignId: string; campaignName: string; companyName: string; kind: FormatoKind; count: number }

/**
 * Avisos de formatos de evaluación (alturas / espacios confinados):
 *  - psicóloga / administrador: cuántos faltan por diligenciar (personas que ya completaron el cuestionario), por campaña;
 *  - auxiliar: cuáles ya están listos para descargar y todavía no ha descargado ella, por campaña.
 */
export async function formatoNotes(db: Db, actor: { id: string; role: string }): Promise<{ pending: FormatoNote[]; ready: FormatoNote[] }> {
  const isAssistant = actor.role === 'assistant';
  const ids = await allowedCompanyIds(db, actor.id, actor.role);
  const extraIds = isAssistant ? (await assistantScope(db, actor.id)).campaignIds : [];
  const companyIds = ids === 'all' ? [] : ids;
  const camps = companyIds.length || extraIds.length
    ? (await db.select().from(campaigns).where(or(...(companyIds.length ? [inArray(campaigns.companyId, companyIds)] : []), ...(extraIds.length ? [inArray(campaigns.id, extraIds)] : [])))).filter((c) => FORMATO_KINDS.some((k) => c.assessments.includes(FORMATOS[k].assessment)))
    : [];
  if (!camps.length) return { pending: [], ready: [] };
  const companyName = new Map((await db.select({ id: companies.id, name: companies.name }).from(companies)).map((c) => [c.id, c.name]));
  const parts = await db.select({ id: participants.id, campaignId: participants.campaignId }).from(participants).where(and(inArray(participants.campaignId, camps.map((c) => c.id)), eq(participants.status, 'completed')));
  if (!parts.length) return { pending: [], ready: [] };
  const pids = parts.map((p) => p.id);
  const campOf = new Map(parts.map((p) => [p.id, p.campaignId]));
  const noConsent = new Set((await db.select().from(consents).where(inArray(consents.participantId, pids))).filter((c) => c.revokedAt || c.decision !== 'authorized').map((c) => c.participantId));
  const answered = await db.select({ participantId: questionnaireAnswers.participantId, instrument: questionnaireAnswers.instrument }).from(questionnaireAnswers).where(and(inArray(questionnaireAnswers.participantId, pids), inArray(questionnaireAnswers.instrument, FORMATO_KINDS.map((k) => FORMATOS[k].assessment)), eq(questionnaireAnswers.complete, true)));
  const saved = new Map((await db.select({ participantId: manualResults.participantId, instrument: manualResults.instrument, updatedAt: manualResults.updatedAt }).from(manualResults).where(and(inArray(manualResults.participantId, pids), inArray(manualResults.instrument, FORMATO_KINDS.map(formatoInstrument))))).map((m) => [`${m.participantId}:${m.instrument}`, m.updatedAt]));
  // Descargas previas de esta persona (para no avisar de lo que ya bajó)
  const downloaded = new Map<string, Date>();
  if (isAssistant && saved.size) {
    for (const a of await db.select({ targetId: auditLog.targetId, meta: auditLog.meta, at: auditLog.at }).from(auditLog).where(and(eq(auditLog.actorId, actor.id), eq(auditLog.action, 'pdf.formato'), inArray(auditLog.targetId, pids)))) {
      const key = `${a.targetId}:${formatoInstrument(String(a.meta.kind) as FormatoKind)}`;
      if (!downloaded.has(key) || downloaded.get(key)! < a.at) downloaded.set(key, a.at);
    }
  }
  const pending = new Map<string, number>();
  const ready = new Map<string, number>();
  for (const a of answered) {
    if (noConsent.has(a.participantId)) continue;
    const kind = FORMATO_KINDS.find((k) => FORMATOS[k].assessment === a.instrument)!;
    const campaignId = campOf.get(a.participantId)!;
    if (!camps.find((c) => c.id === campaignId)!.assessments.includes(a.instrument)) continue;
    const key = `${a.participantId}:${formatoInstrument(kind)}`;
    const at = saved.get(key);
    const bucket = `${campaignId}|${kind}`;
    if (!at) {
      if (!isAssistant) pending.set(bucket, (pending.get(bucket) ?? 0) + 1);
    } else if (isAssistant && !(downloaded.get(key) && downloaded.get(key)! >= at)) {
      ready.set(bucket, (ready.get(bucket) ?? 0) + 1);
    }
  }
  const list = (m: Map<string, number>) =>
    [...m.entries()].map(([bucket, count]) => {
      const [campaignId, kind] = bucket.split('|') as [string, FormatoKind];
      const c = camps.find((x) => x.id === campaignId)!;
      return { campaignId, campaignName: c.name, companyName: companyName.get(c.companyId) ?? '', kind, count };
    });
  return { pending: list(pending), ready: list(ready) };
}
