import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { VALANTI_PAIRS, VALANTI_VALUES } from '@sanithelp/shared';
import { VALANTI_NORM, VALANTI_NORM_LABEL } from '@sanithelp/scoring';
import type { ValantiRecord } from '../results/valanti.js';
import type { Professional } from './expediente.js';

const INK = rgb(0.1, 0.18, 0.26);
const MUTED = rgb(0.35, 0.42, 0.47);
const BAR = rgb(0.3, 0.39, 0.58);
const pad = (n: number) => String(n).padStart(2, '0');

/** Quita lo que la fuente estándar no puede dibujar (conserva la raya, las comillas y los caracteres Latin-1). */
const safe = (t: string) => t.replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, '');

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

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Informe individual VALANTI para la psicóloga: directo, estándar con la norma nacional, banda e interpretación de cada valor. */
export async function buildValantiReport(rec: ValantiRecord, professional: Professional, generatedAt: Date): Promise<Uint8Array> {
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

  const r = rec.result;
  text('Informe VALANTI · Perfil de valores', M, 16, bold);
  y -= 22;
  text('Documento confidencial para la psicóloga responsable. No constituye un diagnóstico clínico.', M, 8.5, font, MUTED);
  y -= 16;

  if (!r.normValidated) {
    const msg = `PUNTAJES ESTÁNDAR PROVISIONALES: la norma (${VALANTI_NORM_LABEL}) aún no ha sido validada por la psicóloga responsable.`;
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
  text(`Parejas respondidas: ${r.pairsAnswered} de ${VALANTI_PAIRS.length}`, 330);
  y -= 26;

  // Tabla de puntajes
  text('Puntajes por valor', M, 11, bold);
  y -= 16;
  const cols = [M, M + 82, M + 124, M + 166, M + 210, M + 250, M + 292, M + 340, M + 440];
  const heads = ['Valor', 'Parte 1', 'Parte 2', 'Directo', 'Media', 'Desv.', 'Estándar', 'Banda', 'Distancia'];
  heads.forEach((h, i) => pg.drawText(h, { x: cols[i]!, y, size: 8.5, font: bold, color: INK }));
  y -= 5;
  pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: MUTED });
  y -= 13;
  for (const v of VALANTI_VALUES) {
    const row = [v, r.part1[v], r.part2[v], r.total[v], VALANTI_NORM[v].mean.toFixed(2), VALANTI_NORM[v].sd.toFixed(2), Math.round(r.standard[v]), `${r.band[v]} ${r.stars[v]}`, signed(Math.round(r.distance[v]))];
    row.forEach((c, i) => pg.drawText(safe(String(c)), { x: cols[i]!, y, size: 9, font: i === 3 || i === 6 ? bold : font, color: INK }));
    y -= 15;
  }
  y -= 8;
  const most = r.mostImportant.map((m) => `${m.value.toUpperCase()} (área ${m.area})`).join(' y ');
  const least = r.leastImportant.map((m) => `${m.value.toUpperCase()} (área ${m.area})`).join(' y ');
  for (const t of [`Valor más importante: ${most}.`, `Valor menos importante: ${least}.`]) {
    for (const l of wrap(bold, t, 10, W - 2 * M)) {
      text(l, M, 10, bold);
      y -= 13;
    }
  }
  y -= 12;

  // Barras del puntaje estándar (20 a 80, centro 50)
  text('Perfil valorativo (puntaje estándar; la línea marca 50 = promedio de la norma)', M, 11, bold);
  y -= 20;
  const x0 = 170;
  const barW = 320;
  const toX = (s: number) => x0 + ((Math.max(20, Math.min(80, s)) - 20) / 60) * barW;
  for (const v of VALANTI_VALUES) {
    text(v, M, 10, bold);
    pg.drawRectangle({ x: x0, y: y - 4, width: barW, height: 14, color: rgb(0.95, 0.96, 0.97) });
    pg.drawRectangle({ x: x0, y: y - 4, width: toX(r.standard[v]) - x0, height: 14, color: BAR });
    pg.drawLine({ start: { x: toX(50), y: y - 6 }, end: { x: toX(50), y: y + 12 }, thickness: 1, color: rgb(0.8, 0.1, 0.1) });
    pg.drawText(String(Math.round(r.standard[v])), { x: x0 + barW + 8, y, size: 9, font, color: INK });
    y -= 22;
  }
  y -= 14;

  // Interpretación
  ensure(60);
  text('Interpretación de los valores', M, 11, bold);
  y -= 16;
  for (const v of VALANTI_VALUES) {
    const lines = wrap(font, r.interpretation[v], 9, W - 2 * M);
    ensure(lines.length * 11 + 20);
    text(`${v.toUpperCase()} (directo ${r.total[v]}, ${r.band[v]})`, M, 9.5, bold);
    y -= 12;
    lines.forEach((l, i) => pg.drawText(l, { x: M, y: y - i * 11, size: 9, font, color: INK }));
    y -= lines.length * 11 + 6;
  }
  y -= 10;

  // Registro de respuestas
  const per = 10;
  ensure(30 + per * 12);
  text('Registro de respuestas (puntos de la frase A · frase B)', M, 11, bold);
  y -= 6;
  const colW = (W - 2 * M) / 3;
  const startY = y;
  VALANTI_PAIRS.forEach((_, i) => {
    const col = Math.floor(i / per);
    const row = i % per;
    const yy = startY - 14 - row * 12;
    const a = rec.answers[i + 1];
    pg.drawText(safe(`${i + 1}. ${a === undefined ? '— · —' : `${a} · ${3 - a}`}`), { x: M + col * colW, y: yy, size: 8.5, font, color: INK });
  });

  const pro = [professional.name && `Profesional responsable: ${professional.name}`, professional.document && `Documento: ${professional.document}`, professional.registry && `Registro profesional: ${professional.registry}`].filter(Boolean).join(' · ');
  const stamp = `Confidencial — uso exclusivo del profesional responsable · Generado el ${pad(generatedAt.getDate())}/${pad(generatedAt.getMonth() + 1)}/${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`;
  for (const p of pages) {
    if (pro) p.drawText(safe(pro), { x: M, y: 30, size: 7, font, color: MUTED });
    p.drawText(safe(stamp), { x: M, y: 20, size: 7, font, color: MUTED });
  }
  doc.setTitle('Informe VALANTI');
  doc.setProducer('Sanithelp');
  return doc.save();
}
