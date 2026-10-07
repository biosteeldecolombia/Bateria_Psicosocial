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
  const staff = app.requireReady('admin', 'psychologist');
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  /** Datos de la profesional para la declaración del consentimiento: quien genera (si es psicóloga) o la asignada a la empresa. */
  async function professionalFor(actor: typeof users.$inferSelect, companyId: string): Promise<Professional> {
    let u: typeof users.$inferSelect | undefined = actor.role === 'psychologist' ? actor : undefined;
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
    return {
      name: crypto.decrypt(u.fullNameEnc),
      document: u.professionalDocumentEnc ? crypto.decrypt(u.professionalDocumentEnc) : undefined,
      registry: u.professionalRegistryEnc ? crypto.decrypt(u.professionalRegistryEnc) : undefined,
      signed: u.id === actor.id,
    };
  }

  // ---------- Individual ----------
  app.get('/participants/:id/expediente.pdf', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(db, req, reply, p.campaignId);
    if (!c) return;
    const [data] = await loadExpedientes(db, crypto, [id]);
    const bytes = await buildExpediente(data!, await professionalFor(req.auth!.user, p.companyId), new Date());
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
    const bytes = await buildDiscReport(rec, await professionalFor(req.auth!.user, p.companyId), new Date());
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
    const bytes = await buildValantiReport(rec, await professionalFor(req.auth!.user, p.companyId), new Date());
    await audit(db, req.auth!.user.id, 'pdf.valanti', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="VALANTI_${rec.document}.pdf"`)
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
    const bytes = await buildPf16Sheet(rec, await professionalFor(req.auth!.user, p.companyId), new Date());
    await audit(db, req.auth!.user.id, 'pdf.pf16', { type: 'participant', id });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="16PF_${rec.document}.pdf"`)
      .send(Buffer.from(bytes));
  });

  // ---------- Masiva ----------
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
      const professional = await professionalFor(actor!, camp!.companyId);

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
      const generatedAt = new Date();
      const campSlug = slug(camp!.name);
      const worker = new PdfWorker();
      try {
        for (let i = 0; i < rows.length; i += 25) {
          const batch = await loadExpedientes(db, crypto, rows.slice(i, i + 25).map((r) => r.id));
          for (const e of batch) {
            const bytes = await worker.build(e, professional, generatedAt);
            zip.append(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { name: `${e.document}_${campSlug}.pdf` });
            done++;
            // contrapresión: no dejar más de unos pocos PDF en cola hacia el disco
            while (done - written > 6) await new Promise((r) => setTimeout(r, 20));
          }
          await db.update(exportJobs).set({ done }).where(eq(exportJobs.id, jobId));
        }
      } finally {
        await worker.close();
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
