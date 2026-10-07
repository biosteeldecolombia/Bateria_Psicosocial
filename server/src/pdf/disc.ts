import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DISC_GROUPS, DISC_SCALES, decodeDisc, type DiscScale } from '@sanithelp/shared';
import { DISC_PATTERNS } from '@sanithelp/scoring';
import type { DiscRecord } from '../results/disc.js';
import type { Professional } from './expediente.js';

const NAMES: Record<DiscScale, string> = { D: 'Dominancia', I: 'Influencia', S: 'Estabilidad', C: 'Cumplimiento' };
const BAR: Record<DiscScale, [number, number, number]> = { D: [0.78, 0.22, 0.2], I: [0.9, 0.62, 0.1], S: [0.25, 0.62, 0.35], C: [0.25, 0.4, 0.75] };
const INK = rgb(0.1, 0.18, 0.26);
const MUTED = rgb(0.35, 0.42, 0.47);
const pad = (n: number) => String(n).padStart(2, '0');

/** Quita lo que la fuente estándar no puede dibujar (p. ej. la «ʼ» tipográfica) para que el PDF no falle. */
const safe = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022]/g, '');

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of safe(text).split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Informe individual DISC para la psicóloga. Marca como PROVISIONAL el resultado mientras la clave no esté validada. */
export async function buildDiscReport(rec: DiscRecord, professional: Professional, generatedAt: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 40;
  const pages: PDFPage[] = [];
  const page = () => {
    const p = doc.addPage([W, H]);
    pages.push(p);
    return p;
  };
  let pg = page();
  let y = H - M;
  const text = (t: string, x: number, size = 10, f = font, color = INK) => pg.drawText(safe(t), { x, y, size, font: f, color });
  const ensure = (h: number) => {
    if (y - h < 60) {
      pg = page();
      y = H - M;
    }
  };

  text('Informe DISC · Perfil de comportamiento', M, 16, bold);
  y -= 22;
  text('Documento confidencial para la psicóloga responsable. No constituye un diagnóstico clínico.', M, 8.5, font, MUTED);
  y -= 16;

  const r = rec.result;
  if (!r.keyValidated) {
    const msg = 'RESULTADO PROVISIONAL: la clave de calificación (qué escala puntúa cada palabra) aún no ha sido validada por la psicóloga responsable. No usar para decisiones hasta validarla.';
    const lines = wrap(bold, msg, 9, W - 2 * M - 16);
    const h = lines.length * 12 + 10;
    pg.drawRectangle({ x: M, y: y - h + 8, width: W - 2 * M, height: h, color: rgb(1, 0.95, 0.8), borderColor: rgb(0.85, 0.6, 0.1), borderWidth: 1 });
    lines.forEach((l, i) => pg.drawText(l, { x: M + 8, y: y - 4 - i * 12, size: 9, font: bold, color: rgb(0.45, 0.28, 0) }));
    y -= h + 8;
  }

  text('Participante', M, 11, bold);
  y -= 15;
  text(`Nombre: ${rec.fullName}`, M);
  text(`Documento: ${rec.document}`, 330);
  y -= 14;
  text(`Fecha de aplicación: ${rec.date.split('-').reverse().join('/')}`, M);
  text(`Grupos respondidos: ${r.groupsAnswered} de ${DISC_GROUPS.length}`, 330);
  y -= 26;

  // Puntajes y barras (−28 a +28)
  text('Perfil (puntaje relativo: +1 por cada MÁS, −1 por cada MENOS)', M, 11, bold);
  y -= 22;
  const x0 = 200;
  const barW = 300;
  const mid = x0 + barW / 2;
  const scale = (barW / 2) / 28;
  for (const s of DISC_SCALES) {
    text(`${s} · ${NAMES[s]}`, M, 10, bold);
    pg.drawRectangle({ x: x0, y: y - 4, width: barW, height: 16, color: rgb(0.95, 0.96, 0.97) });
    const v = r.scores[s];
    const [cr, cg, cb] = BAR[s];
    if (v !== 0) pg.drawRectangle({ x: v > 0 ? mid : mid + v * scale, y: y - 4, width: Math.abs(v) * scale, height: 16, color: rgb(cr, cg, cb) });
    pg.drawLine({ start: { x: mid, y: y - 6 }, end: { x: mid, y: y + 14 }, thickness: 0.8, color: MUTED });
    text(`${v > 0 ? '+' : ''}${v}  (seg. ${r.segments[s]})`, x0 + barW + 8, 9);
    y -= 24;
  }
  text('-28', x0 - 8, 7.5, font, MUTED);
  text('0', mid - 2, 7.5, font, MUTED);
  text('+28', x0 + barW - 8, 7.5, font, MUTED);
  y -= 22;

  // Patrón
  if (r.dominant.length === 1) {
    const d = r.dominant[0]!;
    const pat = DISC_PATTERNS[d];
    text(`Escala dominante: ${d} · ${NAMES[d]} — Patrón «${pat.nombre}»`, M, 11, bold);
    y -= 16;
    const rows: [string, string][] = [['Emociones', pat.emociones], ['Meta', pat.meta], ['Juzga a los demás por', pat.juzga], ['Influye en los demás mediante', pat.influye], ['Su valor para la organización', pat.valor], ['Abusa de', pat.abusa], ['Bajo presión', pat.presion], ['Teme', pat.teme], ['Sería más eficaz si', pat.eficaz]];
    for (const [k, v] of rows) {
      const lines = wrap(font, v, 9.5, W - 2 * M - 170);
      ensure(lines.length * 12 + 6);
      text(k, M, 9.5, bold);
      lines.forEach((l, i) => pg.drawText(l, { x: M + 165, y: y - i * 12, size: 9.5, font, color: INK }));
      y -= lines.length * 12 + 4;
    }
  } else {
    text(`Empate en la escala más alta: ${r.dominant.join(', ')}. Se interpreta el perfil completo; no se asigna un solo patrón.`, M, 10, bold);
    y -= 16;
  }
  y -= 12;

  // Registro de respuestas
  ensure(80);
  text('Registro de respuestas', M, 11, bold);
  y -= 6;
  const colW = (W - 2 * M) / 2;
  const per = Math.ceil(DISC_GROUPS.length / 2);
  const startY = y;
  for (let i = 0; i < DISC_GROUPS.length; i++) {
    const col = i < per ? 0 : 1;
    const row = col === 0 ? i : i - per;
    const yy = startY - 14 - row * 12;
    if (yy < 60) continue;
    const v = rec.answers[i + 1];
    const [mas, menos] = v === undefined ? [-1, -1] : decodeDisc(v);
    const w = DISC_GROUPS[i]!;
    pg.drawText(safe(`${i + 1}. MAS: ${w[mas] ?? '—'} · MENOS: ${w[menos] ?? '—'}`), { x: M + col * colW, y: yy, size: 8, font, color: INK });
  }

  // Pie
  const pro = [professional.name && `Profesional responsable: ${professional.name}`, professional.document && `Documento: ${professional.document}`, professional.registry && `Registro profesional: ${professional.registry}`].filter(Boolean).join(' · ');
  const stamp = `Confidencial — uso exclusivo del profesional responsable · Generado el ${pad(generatedAt.getDate())}/${pad(generatedAt.getMonth() + 1)}/${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`;
  for (const p of pages) {
    if (pro) p.drawText(safe(pro), { x: M, y: 30, size: 7, font, color: MUTED });
    p.drawText(safe(stamp), { x: M, y: 20, size: 7, font, color: MUTED });
  }
  doc.setTitle('Informe DISC');
  doc.setProducer('Sanithelp');
  return doc.save();
}
