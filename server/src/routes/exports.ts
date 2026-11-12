import type { FastifyPluginAsync } from 'fastify';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { ZipArchive } from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { campaigns, exportJobs, fichaAnswers, participants, psychologistCompanies, users } from '../db/schema.js';
import { audit, checkTotp } from '../auth/service.js';
import { clinicalAccess } from '../auth/clinical.js';
import { verifyPassword } from '../security/passwords.js';
import { buildExpediente, loadExpedientes, type Professional } from '../pdf/expediente.js';
import { PdfWorker } from '../pdf/pool.js';
import { buildDiscReport } from '../pdf/disc.js';
import { loadDisc } from '../results/disc.js';
import { buildValantiReport } from '../pdf/valanti.js';
import { loadValanti } from '../results/valanti.js';
import { loadAcrofobia, loadClq } from '../results/ocupacionales.js';
import { buildAcrofobiaReport, buildClqReport } from '../pdf/ocupacionales.js';
import { buildFormatoPdf } from '../pdf/formatos.js';
import { loadFormatoContext } from '../results/formatos.js';
import { FORMATOS, FORMATO_KINDS, type FormatoKind } from '@sanithelp/shared';
import { buildPf16Sheet } from '../pdf/pf16.js';
import { loadIndividual } from '../results/individual.js';

const EXPORT_DIR = path.join(os.tmpdir(), 'sanithelp-exports');
const TTL_MS = 30 * 60_000;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'campana';

/**
 * Descarga de las respuestas en PDF con el aspecto de las plantillas oficiales.
 *  - Individual: un expediente por persona, inmediato.
 *  - Masiva: trabajo en segundo plano (ZIP con un PDF por persona), con reconfirmación de contraseña y MFA,
 *    archivo temporal de un solo uso con caducidad corta. Todo queda en la auditoría.
 */
export const exportRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  // Documentos y expedientes: administrador, psicóloga y auxiliar administrativo (este último, solo de lo que se le asignó y con motivo).
  const staff = app.requireReady('admin', 'psychologist', 'assistant');
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  /**
   * Datos de la profesional para el consentimiento y los informes: la responsable de la campaña (con su firma);
   * si la campaña no tiene, quien genera (si es psicóloga) o la asignada a la empresa.
   */
  async function professionalFor(actor: typeof users.$inferSelect, campaign: { companyId: string; responsibleUserId: string | null }): Promise<Professional> {
    const companyId = campaign.companyId;
    let u: typeof users.$inferSelect | undefined;
    if (campaign.responsibleUserId) {
      const [r] = await db.select().from(users).where(and(eq(users.id, campaign.responsibleUserId), eq(users.active, true))).limit(1);
      u = r;
    }
    if (!u && actor.role === 'psychologist') u = actor;
    if (!u) {
      const rows = await db
        .select({ u: users })
        .from(psychologistCompanies)
        .innerJoin(users, eq(users.id, psychologistCompanies.userId))
        .where(and(eq(psychologistCompanies.companyId, companyId), eq(users.active, true)))
        .limit(1);
      u = rows[0]?.u;
    }
    if (!u) {
      throw Object.assign(new Error('La empresa no tiene una psicóloga activa asignada. Asígnale una en Usuarios para que sus datos queden en el consentimiento y en el expediente.'), { statusCode: 409 });
    }
    if (!u.professionalDocumentEnc || !u.professionalRegistryEnc) {
      throw Object.assign(new Error('La psicóloga responsable debe completar su documento y su registro profesional en «Mi perfil» antes de generar el expediente (aparecen en el consentimiento).'), { statusCode: 409 });
    }
    const sig = u.signatureEnc ? (JSON.parse(crypto.decrypt(u.signatureEnc)) as { mime: 'image/png' | 'image/jpeg'; b64: string }) : null;
    return {
      name: crypto.decrypt(u.fullNameEnc),
      document: u.professionalDocumentEnc ? crypto.decrypt(u.professionalDocumentEnc) : undefined,
      registry: u.professionalRegistryEnc ? crypto.decrypt(u.professionalRegistryEnc) : undefined,
      signed: u.id === actor.id,
      signature: sig ? { bytes: Buffer.from(sig.b64, 'base64'), mime: sig.mime } : undefined,
    };
  }

  /** Para los informes de las evaluaciones individuales: el dato profesional es solo el pie de página, no debe impedir el informe. */
  async function professionalOptional(actor: typeof users.$inferSelect, campaign: { companyId: string; responsibleUserId: string | null }): Promise<Professional> {
    try {
      return await professionalFor(actor, campaign);
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 409) return actor.role === 'psychologist' ? { name: crypto.decrypt(actor.fullNameEnc), signed: false } : {};
      throw e;
    }
  }

  // ---------- Individual ----------
  app.get('/participants/:id/expediente.pdf', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    const [data] = await loadExpedientes(db, crypto, [id]);
    const bytes = await buildExpediente(data!, await professionalFor(req.auth!.user, c), new Date());
    await audit(db, req.auth!.user.id, 'pdf.individual', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="Expediente_${data!.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  /** Informe DISC individual en PDF. */
  app.get('/participants/:id/disc.pdf', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    const [rec] = await loadDisc(db, crypto, c.id, id);
    if (!rec) return reply.code(404).send({ error: 'Esta persona aún no tiene resultados DISC.' });
    const bytes = await buildDiscReport(rec, await professionalOptional(req.auth!.user, c), new Date());
    await audit(db, req.auth!.user.id, 'pdf.disc', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="DISC_${rec.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  /** Informe VALANTI individual en PDF. */
  app.get('/participants/:id/valanti.pdf', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    const [rec] = await loadValanti(db, crypto, c.id, id);
    if (!rec) return reply.code(404).send({ error: 'Esta persona aún no tiene resultados VALANTI.' });
    const bytes = await buildValantiReport(rec, await professionalOptional(req.auth!.user, c), new Date());
    await audit(db, req.auth!.user.id, 'pdf.valanti', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="VALANTI_${rec.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  /** Informe de la Acrofobia de Cohen en PDF. */
  app.get('/participants/:id/acrofobia.pdf', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    const [rec] = await loadAcrofobia(db, crypto, c.id, id);
    if (!rec) return reply.code(404).send({ error: 'Esta persona aún no tiene resultados de Acrofobia.' });
    const bytes = await buildAcrofobiaReport(rec, await professionalOptional(req.auth!.user, c), new Date());
    await audit(db, req.auth!.user.id, 'pdf.acrofobia', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="Acrofobia_${rec.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  /**
   * Formato de evaluación psicológica ocupacional (alturas / espacios confinados) ya diligenciado por la psicóloga,
   * con el encabezado del formato y la firma de la psicóloga responsable de la campaña.
   */
  app.get('/participants/:id/formatos/:kind/pdf', { preHandler: staff }, async (req, reply) => {
    const { id, kind } = req.params as { id: string; kind: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p || !(FORMATO_KINDS as readonly string[]).includes(kind)) return reply.code(404).send({ error: 'Participante o formato no encontrado' });
    const k = kind as FormatoKind;
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    if (!c.assessments.includes(FORMATOS[k].assessment)) return reply.code(404).send({ error: 'Esta campaña no aplica ese formato.' });
    const ctx = await loadFormatoContext(db, crypto, p, k);
    if (!ctx.record) return reply.code(404).send({ error: 'Esta persona aún no completa el cuestionario.' });
    if (!ctx.saved) return reply.code(409).send({ error: 'Guarda primero el formato para descargarlo.' });
    const clq = k === 'confinados' ? { total: (ctx.record as { result: { total: number } }).result.total, level: (ctx.record as { level: 'low' | 'moderate' | 'high' | null }).level } : undefined;
    const bytes = await buildFormatoPdf({ kind: k, data: ctx.saved.data, prefill: ctx.prefill, clq, professional: await professionalFor(req.auth!.user, c) });
    await audit(db, req.auth!.user.id, 'pdf.formato', { type: 'participant', id }, { kind: k });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="Formato_${k}_${ctx.person.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  /** Hoja del CLQ en PDF: solo cuando la psicóloga ya marcó la interpretación. */
  app.get('/participants/:id/claustrofobia.pdf', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    const [rec] = await loadClq(db, crypto, c.id, id);
    if (!rec) return reply.code(404).send({ error: 'Esta persona aún no tiene el CLQ completo.' });
    if (!rec.level) return reply.code(409).send({ error: 'Marca primero la interpretación del CLQ (bajo, moderado o alto) para descargar el PDF.' });
    const bytes = await buildClqReport(rec, await professionalOptional(req.auth!.user, c), new Date());
    await audit(db, req.auth!.user.id, 'pdf.claustrofobia', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="CLQ_${rec.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  /** Hoja de respuestas del 16PF en PDF (sin calificar). */
  app.get('/participants/:id/pf16.pdf', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    const [rec] = await loadIndividual(db, crypto, c.id, 'pf16', id);
    if (!rec) return reply.code(404).send({ error: 'Esta persona aún no completó el 16PF.' });
    const bytes = await buildPf16Sheet(rec, await professionalOptional(req.auth!.user, c), new Date());
    await audit(db, req.auth!.user.id, 'pdf.pf16', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="16PF_${rec.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  // ---------- Masiva ----------
  /**
   * Documentos de las evaluaciones distintas a la batería psicosocial, por persona. Los formatos solo salen si la psicóloga ya
   * los diligenció (y el CLQ si ya marcó la interpretación); lo que falta se anota en `pending`.
   */
  async function extraDocsFor(camp: typeof campaigns.$inferSelect, ids: string[], professional: Professional, generatedAt: Date) {
    type Doc = { name: string; bytes: Uint8Array };
    const kinds = camp.assessments.filter((a) => a !== 'psychosocial');
    const by = new Map<string, { docs: Doc[]; pending: string[] }>();
    const result = { enabled: kinds.length > 0, get: (id: string) => by.get(id) };
    if (!result.enabled || !ids.length) return result;
    const entry = (id: string) => {
      let e = by.get(id);
      if (!e) by.set(id, (e = { docs: [], pending: [] }));
      return e;
    };
    const wanted = new Set(ids);
    if (kinds.includes('disc')) for (const r of await loadDisc(db, crypto, camp.id)) if (wanted.has(r.participantId)) entry(r.participantId).docs.push({ name: `Informe_DISC_${r.document}.pdf`, bytes: await buildDiscReport(r, professional, generatedAt) });
    if (kinds.includes('valanti')) for (const r of await loadValanti(db, crypto, camp.id)) if (wanted.has(r.participantId)) entry(r.participantId).docs.push({ name: `Informe_VALANTI_${r.document}.pdf`, bytes: await buildValantiReport(r, professional, generatedAt) });
    if (kinds.includes('pf16')) for (const r of await loadIndividual(db, crypto, camp.id, 'pf16')) if (wanted.has(r.participantId)) entry(r.participantId).docs.push({ name: `Hoja_16PF_${r.document}.pdf`, bytes: await buildPf16Sheet(r, professional, generatedAt) });
    const parts = kinds.some((k) => k === 'acrofobia' || k === 'claustrofobia') ? await db.select().from(participants).where(inArray(participants.id, ids)) : [];
    const partOf = new Map(parts.map((p) => [p.id, p]));
    if (kinds.includes('acrofobia')) {
      for (const r of await loadAcrofobia(db, crypto, camp.id)) {
        if (!wanted.has(r.participantId)) continue;
        const e = entry(r.participantId);
        e.docs.push({ name: `Informe_Acrofobia_${r.document}.pdf`, bytes: await buildAcrofobiaReport(r, professional, generatedAt) });
        const ctx = await loadFormatoContext(db, crypto, partOf.get(r.participantId)!, 'alturas');
        if (ctx.saved) e.docs.push({ name: `Formato_Alturas_${r.document}.pdf`, bytes: await buildFormatoPdf({ kind: 'alturas', data: ctx.saved.data, prefill: ctx.prefill, professional }) });
        else e.pending.push('Formato de evaluación · Trabajo en alturas (pendiente de la psicóloga)');
      }
    }
    if (kinds.includes('claustrofobia')) {
      for (const r of await loadClq(db, crypto, camp.id)) {
        if (!wanted.has(r.participantId)) continue;
        const e = entry(r.participantId);
        if (r.level) e.docs.push({ name: `Informe_CLQ_${r.document}.pdf`, bytes: await buildClqReport(r, professional, generatedAt) });
        else e.pending.push('Informe CLQ (falta la interpretación de la psicóloga)');
        const ctx = await loadFormatoContext(db, crypto, partOf.get(r.participantId)!, 'confinados');
        if (ctx.saved) e.docs.push({ name: `Formato_EspaciosConfinados_${r.document}.pdf`, bytes: await buildFormatoPdf({ kind: 'confinados', data: ctx.saved.data, prefill: ctx.prefill, clq: { total: r.result.total, level: r.level }, professional }) });
        else e.pending.push('Formato de evaluación · Espacios confinados (pendiente de la psicóloga)');
      }
    }
    return result;
  }

  let running = false;
  const queue: string[] = [];

  async function runJob(jobId: string) {
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId)).limit(1);
    if (!job) return;
    const file = path.join(EXPORT_DIR, `${jobId}.zip`);
    try {
      await db.update(exportJobs).set({ status: 'running' }).where(eq(exportJobs.id, jobId));
      const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, job.campaignId)).limit(1);
      const [actor] = await db.select().from(users).where(eq(users.id, job.requestedBy)).limit(1);
      // kind = "zip|<estado>|<forma>|<área>"  (estado: completed | all; forma y área opcionales)
      const [, status = 'completed', formF = '', areaF = ''] = job.kind.split('|');
      const conds = [eq(participants.campaignId, job.campaignId), ...(status === 'all' ? [] : [eq(participants.status, 'completed' as const)]), ...(formF === 'A' || formF === 'B' ? [eq(participants.form, formF)] : [])];
      let rows = await db.select({ id: participants.id }).from(participants).where(and(...conds));
      if (areaF) {
        // el área vive cifrada en la ficha: se filtra descifrando solo la pregunta 16
        const fich = rows.length ? await db.select({ id: fichaAnswers.participantId, d: fichaAnswers.dataEnc }).from(fichaAnswers).where(inArray(fichaAnswers.participantId, rows.map((r) => r.id))) : [];
        const keep = new Set(fich.filter((f) => String((JSON.parse(crypto.decrypt(f.d)) as Record<string, unknown>)['16'] ?? '') === areaF).map((f) => f.id));
        rows = rows.filter((r) => keep.has(r.id));
      }
      await db.update(exportJobs).set({ total: rows.length }).where(eq(exportJobs.id, jobId));
      const professional = await professionalFor(actor!, camp!);
      const generatedAt = new Date();
      // Campañas con evaluaciones distintas a la batería: además del expediente, un informe por prueba y los formatos ya diligenciados.
      const withExtras = camp!.assessments.some((a) => a !== 'psychosocial');

      const out = fs.createWriteStream(file);
      const zip = new ZipArchive({ zlib: { level: 1 } });
      const closed = new Promise<void>((resolve, reject) => {
        out.on('close', resolve);
        out.on('error', reject);
        zip.on('error', reject);
      });
      zip.pipe(out);
      let done = 0;
      let written = 0;
      zip.on('entry', () => written++);
      const campSlug = slug(camp!.name);
      const worker = new PdfWorker();
      const pendingNotes: string[] = [];
      try {
        for (let i = 0; i < rows.length; i += 25) {
          const batchIds = rows.slice(i, i + 25).map((r) => r.id);
          const batch = await loadExpedientes(db, crypto, batchIds);
          const extras = await extraDocsFor(camp!, batchIds, professional, generatedAt);
          for (const e of batch) {
            const bytes = await worker.build(e, professional, generatedAt);
            const own = extras.get(e.participantId);
            if (!withExtras) {
              zip.append(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { name: `${e.document}_${campSlug}.pdf` });
            } else {
              // Una carpeta por persona: expediente (consentimiento y ficha) + informes + formatos listos
              const dir = `${e.document}_${campSlug}`;
              zip.append(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { name: `${dir}/Expediente_${e.document}.pdf` });
              for (const d of own?.docs ?? []) zip.append(Buffer.from(d.bytes.buffer, d.bytes.byteOffset, d.bytes.byteLength), { name: `${dir}/${d.name}` });
              for (const n of own?.pending ?? []) pendingNotes.push(`${e.document} · ${e.fullName}: ${n}`);
            }
            done++;
            // contrapresión: no dejar más de unos pocos PDF en cola hacia el disco
            while (done - written > 6) await new Promise((r) => setTimeout(r, 20));
          }
          await db.update(exportJobs).set({ done }).where(eq(exportJobs.id, jobId));
        }
      } finally {
        await worker.close();
      }
      if (pendingNotes.length) {
        zip.append(Buffer.from(['Documentos que todavía no están disponibles (la psicóloga debe diligenciarlos o marcar la interpretación):', '', ...pendingNotes, ''].join('\r\n'), 'utf8'), { name: 'PENDIENTES.txt' });
      }
      await zip.finalize();
      await closed;
      await db.update(exportJobs).set({ status: 'done', done, filePath: file, expiresAt: new Date(Date.now() + TTL_MS) }).where(eq(exportJobs.id, jobId));
      await audit(db, job.requestedBy, 'pdf.bulk_ready', { type: 'campaign', id: job.campaignId }, { people: done });
    } catch (err) {
      fs.rmSync(file, { force: true });
      await db.update(exportJobs).set({ status: 'failed', error: 'No se pudo generar el archivo.' }).where(eq(exportJobs.id, jobId));
      app.log.error({ err: (err as Error).message }, 'Fallo en exportación masiva');
    }
  }
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length) await runJob(queue.shift()!);
    } finally {
      running = false;
    }
  }

  // Limpieza: los archivos caducan a los 30 minutos
  const sweep = async () => {
    const old = await db.select().from(exportJobs).where(and(eq(exportJobs.status, 'done'), lt(exportJobs.expiresAt, new Date())));
    for (const j of old) {
      if (j.filePath) fs.rmSync(j.filePath, { force: true });
      await db.update(exportJobs).set({ status: 'expired', filePath: null }).where(eq(exportJobs.id, j.id));
    }
  };
  const timer = setInterval(() => void sweep().catch(() => undefined), 5 * 60_000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
  // Trabajos que quedaron «en curso» por un reinicio
  await db.update(exportJobs).set({ status: 'failed', error: 'Interrumpido por reinicio del servicio.' }).where(inArray(exportJobs.status, ['queued', 'running']));

  app.post('/campaigns/:id/exports', { preHandler: staff, config: { rateLimit: { max: app.appCtx.cfg.NODE_ENV === 'test' ? 1000 : 3, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { password?: unknown; code?: unknown; scope?: unknown; form?: unknown; area?: unknown; justification?: unknown };
    const c = await clinicalAccess(db, req, reply, id, typeof b.justification === 'string' ? b.justification : undefined);
    if (!c) return;
    const user = req.auth!.user;
    // Reconfirmación: contraseña y código MFA vigentes
    if (typeof b.password !== 'string' || typeof b.code !== 'string' || !(await verifyPassword(user.passwordHash, b.password))) {
      await audit(db, user.id, 'pdf.bulk_denied', { type: 'campaign', id: c.id });
      return reply.code(403).send({ error: 'Confirma tu contraseña y el código de tu aplicación de autenticación.' });
    }
    const step = user.mfaSecretEnc ? checkTotp(crypto.decrypt(user.mfaSecretEnc), crypto.decrypt(user.usernameEnc), b.code, user.mfaLastStep) : null;
    if (step === null) {
      await audit(db, user.id, 'pdf.bulk_denied', { type: 'campaign', id: c.id });
      return reply.code(403).send({ error: 'Confirma tu contraseña y el código de tu aplicación de autenticación.' });
    }
    await db.update(users).set({ mfaLastStep: step }).where(eq(users.id, user.id));
    const [open] = await db.select({ id: exportJobs.id }).from(exportJobs).where(and(eq(exportJobs.requestedBy, user.id), inArray(exportJobs.status, ['queued', 'running']))).limit(1);
    if (open) return reply.code(409).send({ error: 'Ya tienes una exportación en curso. Espera a que termine.' });
    const form = b.form === 'A' || b.form === 'B' ? b.form : '';
    const area = typeof b.area === 'string' ? b.area.replace(/\|/g, ' ').slice(0, 120) : '';
    const kind = ['zip', b.scope === 'all' ? 'all' : 'completed', form, area].join('|');
    const [job] = await db.insert(exportJobs).values({ campaignId: c.id, requestedBy: user.id, kind }).returning({ id: exportJobs.id });
    await audit(db, user.id, 'pdf.bulk_requested', { type: 'campaign', id: c.id }, { scope: b.scope === 'all' ? 'all' : 'completed', form: form || null, area: area ? 'filtrada' : null });
    queue.push(job!.id);
    void pump();
    return reply.code(202).send({ id: job!.id });
  });

  const ownJob = async (req: { auth: { user: { id: string } } | null }, id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [j] = await db.select().from(exportJobs).where(eq(exportJobs.id, id)).limit(1);
    return j && j.requestedBy === req.auth!.user.id ? j : null;
  };

  app.get('/exports/:id', { preHandler: staff }, async (req, reply) => {
    const j = await ownJob(req as never, (req.params as { id: string }).id);
    if (!j) return reply.code(404).send({ error: 'Exportación no encontrada' });
    return { id: j.id, status: j.status, total: j.total, done: j.done, error: j.error, expiresAt: j.expiresAt };
  });

  /** Descarga de un solo uso: el archivo se borra al terminar. */
  app.get('/exports/:id/download', { preHandler: staff }, async (req, reply) => {
    const j = await ownJob(req as never, (req.params as { id: string }).id);
    if (!j || j.status !== 'done' || !j.filePath || j.downloadedAt || (j.expiresAt && j.expiresAt < new Date()) || !fs.existsSync(j.filePath)) {
      return reply.code(404).send({ error: 'La descarga ya no está disponible. Genera una nueva exportación.' });
    }
    await db.update(exportJobs).set({ downloadedAt: new Date(), status: 'expired' }).where(eq(exportJobs.id, j.id));
    await audit(db, req.auth!.user.id, 'pdf.bulk_downloaded', { type: 'campaign', id: j.campaignId }, { people: j.done });
    const stream = fs.createReadStream(j.filePath);
    stream.on('close', () => fs.rmSync(j.filePath!, { force: true }));
    return reply.header('Content-Type', 'application/zip').header('Content-Disposition', 'attachment; filename="Expedientes.zip"').send(stream);
  });
};
