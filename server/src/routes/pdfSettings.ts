import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DEFAULT_PDF_SETTINGS, PDF_DOC_KINDS, isHexColor, mergePdfSettings, type PdfDocKind } from '@sanithelp/shared';
import { audit } from '../auth/service.js';
import { buildStylePreview, styleFor } from '../pdf/brand.js';
import { getSetting, putSetting } from '../settings.js';

const kinds = PDF_DOC_KINDS.map((d) => d.key) as [PdfDocKind, ...PdfDocKind[]];
const docSchema = z.object({ code: z.string().trim().max(30), version: z.string().trim().min(1).max(10), title: z.string().trim().min(2).max(120) });
const bodySchema = z.object({
  accent: z.string().refine(isHexColor),
  accentSoft: z.string().refine(isHexColor),
  showLogo: z.boolean(),
  footer: z.string().trim().min(2).max(160),
  docs: z.object(Object.fromEntries(kinds.map((k) => [k, docSchema])) as Record<PdfDocKind, typeof docSchema>),
});

/** Formatos PDF: código, versión, título, colores y pie de los documentos que genera la plataforma, editables sin tocar el código. */
export const pdfSettingsRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.appCtx;
  const guard = app.requirePerm('templates.edit');

  app.get('/admin/pdf-settings', { preHandler: guard }, async () => ({
    settings: mergePdfSettings(await getSetting<unknown>(db, 'pdf', {})),
    defaults: DEFAULT_PDF_SETTINGS,
    kinds: PDF_DOC_KINDS,
  }));

  app.put('/admin/pdf-settings', { preHandler: guard }, async (req, reply) => {
    const body = bodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Revisa los datos: los colores deben ser #RRGGBB y cada formato necesita título y versión.' });
    await putSetting(db, 'pdf', body.data, req.auth!.user.id);
    // En la auditoría queda qué códigos y versiones quedaron vigentes (no son datos personales).
    await audit(db, req.auth!.user.id, 'settings.pdf_updated', undefined, { docs: Object.fromEntries(kinds.map((k) => [k, `${body.data.docs[k].code || 'sin código'} v${body.data.docs[k].version}`])) });
    return { ok: true, settings: mergePdfSettings(body.data) };
  });

  /** Hoja de ejemplo con el estilo guardado (o con el borrador enviado en la consulta) para ver el resultado antes de guardar. */
  app.post('/admin/pdf-settings/preview', { preHandler: guard }, async (req, reply) => {
    const q = req.body as { kind?: string; settings?: unknown } | null;
    const kind = (kinds as string[]).includes(q?.kind ?? '') ? (q!.kind as PdfDocKind) : 'disc';
    const source = q?.settings ? mergePdfSettings(q.settings) : mergePdfSettings(await getSetting<unknown>(db, 'pdf', {}));
    const bytes = await buildStylePreview(styleFor(source, kind));
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', 'inline; filename="vista_previa.pdf"').header('Cache-Control', 'no-store');
    return Buffer.from(bytes);
  });
};
