import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  ACROFOBIA_ANXIETY_SCALE,
  ACROFOBIA_AVOID_SCALE,
  ACROFOBIA_ITEMS,
  CLQ_ITEMS,
  CLQ_LEVELS,
  CLQ_SCALE,
  CONSENT_OCC_BLOCKS,
  CONSENT_OCC_HEADER,
  CONSENT_OCC_OPTIONS,
  CONSENT_OCC_PROFESSIONAL,
  CONSENT_OCC_TITLE,
} from '@sanithelp/shared';
import { ACRO_BANDS } from '@sanithelp/scoring';
import type { AcrofobiaRecord, ClqRecord } from '../results/ocupacionales.js';
import type { ConsentPdfInput } from './consent.js';
import { TEMPLATES_DIR } from './questionnaires.js';
import type { Professional } from './expediente.js';
import { SIGNATURE_BLOCK_H, drawSignatureBlock, drawSignatureIn, embedSignature } from './firma.js';
import { brandDocument, defaultStyle, type PdfStyle } from './brand.js';

const INK = rgb(0.1, 0.18, 0.26);
const MUTED = rgb(0.35, 0.42, 0.47);
const W = 595.28;
const H = 841.89;
const M = 50;
const pad = (n: number) => String(n).padStart(2, '0');
const dmy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Quita lo que la fuente estándar no puede dibujar (conserva la raya, las comillas y los caracteres Latin-1). */
const safe = (t: string) => t.replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, '');

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

/** Cursor de escritura que salta de página cuando se acaba el espacio. */
class Writer {
  pg!: PDFPage;
  y = 0;
  constructor(readonly doc: PDFDocument, readonly font: PDFFont, readonly bold: PDFFont, readonly onPage?: (pg: PDFPage) => void, readonly topOffset = 0) {
    this.newPage();
  }
  newPage() {
    this.pg = this.doc.addPage([W, H]);
    this.y = H - M - this.topOffset;
    this.onPage?.(this.pg);
  }
  ensure(h: number) {
    if (this.y - h < 60) this.newPage();
  }
  line(t: string, x = M, size = 10, f = this.font, color = INK) {
    this.pg.drawText(safe(t), { x, y: this.y, size, font: f, color });
  }
  para(t: string, size = 10, f = this.font, x = M, gap = 4, color = INK) {
    const lines = wrap(f, t, size, W - M - x);
    for (const l of lines) {
      this.ensure(size + 4);
      this.line(l, x, size, f, color);
      this.y -= size + 3;
    }
    this.y -= gap;
  }
  gap(h: number) {
    this.y -= h;
  }
}

const footer = (pages: PDFPage[], font: PDFFont, professional: Professional, generatedAt: Date) => {
  const pro = [professional.name && `Profesional responsable: ${professional.name}`, professional.document && `Documento: ${professional.document}`, professional.registry && `Registro profesional: ${professional.registry}`].filter(Boolean).join(' · ');
  const stamp = `Confidencial — uso exclusivo del profesional responsable · Generado el ${dmy(generatedAt)} ${hm(generatedAt)}`;
  for (const p of pages) {
    if (pro) p.drawText(safe(pro), { x: M, y: 30, size: 7, font, color: MUTED });
    p.drawText(safe(stamp), { x: M, y: 20, size: 7, font, color: MUTED });
  }
};

/** Líneas centradas en un recuadro (x, y = esquina inferior izquierda). */
function centered(page: PDFPage, font: PDFFont, lines: string[], box: { x: number; y: number; w: number; h: number }, size: number) {
  const lh = size + 2;
  let y = box.y + box.h / 2 + (lines.length * lh) / 2 - size + 1;
  for (const l of lines) {
    const t = safe(l);
    page.drawText(t, { x: box.x + (box.w - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color: INK });
    y -= lh;
  }
}

/** Encabezado del documento controlado: logo, título y proceso, y la tabla de código, versión, fecha y página (n de N). */
async function drawOccupationalHeader(doc: PDFDocument, page: PDFPage, font: PDFFont, bold: PDFFont, n: number, total: number): Promise<void> {
  const x0 = M;
  const w = W - 2 * M;
  const h = 62;
  const y0 = H - 30 - h;
  const logoW = 92;
  const rightW = 130;
  const labelW = 60;
  const line = { thickness: 0.9, color: INK };
  page.drawRectangle({ x: x0, y: y0, width: w, height: h, borderColor: INK, borderWidth: 0.9 });
  page.drawLine({ start: { x: x0 + logoW, y: y0 }, end: { x: x0 + logoW, y: y0 + h }, ...line });
  const rx = x0 + w - rightW;
  page.drawLine({ start: { x: rx, y: y0 }, end: { x: rx, y: y0 + h }, ...line });
  page.drawLine({ start: { x: rx + labelW, y: y0 }, end: { x: rx + labelW, y: y0 + h }, ...line });
  for (let i = 1; i < 4; i++) page.drawLine({ start: { x: rx, y: y0 + (h * i) / 4 }, end: { x: x0 + w, y: y0 + (h * i) / 4 }, ...line });
  page.drawLine({ start: { x: x0 + logoW, y: y0 + h / 2 }, end: { x: rx, y: y0 + h / 2 }, ...line });
  // Logo
  try {
    const logo = await doc.embedPng(fs.readFileSync(path.join(TEMPLATES_DIR, 'logo_sanithelp.png')));
    const k = Math.min((logoW - 16) / logo.width, (h - 14) / logo.height);
    page.drawImage(logo, { x: x0 + (logoW - logo.width * k) / 2, y: y0 + (h - logo.height * k) / 2, width: logo.width * k, height: logo.height * k });
  } catch {
    centered(page, bold, ['SanitHelp'], { x: x0, y: y0, w: logoW, h }, 11);
  }
  // Título y proceso
  const mid = { x: x0 + logoW, w: w - logoW - rightW };
  centered(page, bold, wrap(bold, CONSENT_OCC_HEADER.title, 9, mid.w - 14), { x: mid.x, y: y0 + h / 2, w: mid.w, h: h / 2 }, 9);
  centered(page, bold, [CONSENT_OCC_HEADER.process], { x: mid.x, y: y0, w: mid.w, h: h / 2 }, 9);
  // Código, versión, fecha, página
  const rows: [string, string][] = [['Código:', CONSENT_OCC_HEADER.code], ['Versión:', CONSENT_OCC_HEADER.version], ['Fecha:', CONSENT_OCC_HEADER.date], ['Página:', `${n} de ${total}`]];
  rows.forEach(([k, v], i) => {
    const y = y0 + h - (h * (i + 1)) / 4;
    page.drawText(k, { x: rx + 4, y: y + 5, size: 8.5, font: bold, color: INK });
    page.drawText(safe(v), { x: rx + labelW + 5, y: y + 5, size: 8.5, font, color: INK });
  });
}

/**
 * Consentimiento de evaluación psicológica ocupacional con los datos de la persona, su decisión y la constancia electrónica.
 * Se redacta con el texto que la persona vio en pantalla (el documento no tiene plantilla escaneada como el de la batería);
 * lleva el mismo encabezado del documento controlado en cada página.
 */
export async function occupationalConsentInto(doc: PDFDocument, inp: ConsentPdfInput & { company: string }): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const firstPage = doc.getPageCount();
  const w = new Writer(doc, font, bold, undefined, 66);
  w.y -= 4;
  // Fecha de diligenciamiento (AAAA MM DD) a la derecha, como en el formato
  const d = inp.decidedAt;
  const lbl = 'FECHA DE DILIGENCIAMIENTO';
  w.pg.drawText(lbl, { x: W - M - bold.widthOfTextAtSize(lbl, 10.5), y: w.y, size: 10.5, font: bold, color: INK });
  w.gap(24);
  const boxes: [string, number][] = [[String(d.getFullYear()), 46], [pad(d.getMonth() + 1), 34], [pad(d.getDate()), 34]];
  let bx = W - M - boxes.reduce((a, [, bw]) => a + bw, 0) - 12;
  for (const [t, bw] of boxes) {
    w.pg.drawRectangle({ x: bx, y: w.y - 4, width: bw, height: 18, borderColor: INK, borderWidth: 0.9 });
    w.pg.drawText(t, { x: bx + (bw - font.widthOfTextAtSize(t, 10)) / 2, y: w.y + 1, size: 10, font, color: INK });
    bx += bw + 6;
  }
  w.gap(28);
  const title = 'DATOS DE IDENTIFICACIÓN DEL PACIENTE';
  const tw = bold.widthOfTextAtSize(title, 11);
  w.pg.drawText(title, { x: (W - tw) / 2, y: w.y, size: 11, font: bold, color: INK });
  w.pg.drawLine({ start: { x: (W - tw) / 2, y: w.y - 2 }, end: { x: (W + tw) / 2, y: w.y - 2 }, thickness: 0.8, color: INK });
  w.gap(24);
  const field = (label: string, value: string, x: number, wide: number) => {
    w.pg.drawText(label, { x, y: w.y, size: 10.5, font: bold, color: INK });
    const lx = x + bold.widthOfTextAtSize(label, 10.5) + 4;
    w.pg.drawLine({ start: { x: lx, y: w.y - 2 }, end: { x: lx + wide, y: w.y - 2 }, thickness: 0.6, color: INK });
    w.pg.drawText(safe(value), { x: lx + 2, y: w.y + 1, size: 10, font, color: INK });
  };
  field('Nombres:', inp.names, M, 165);
  field('Apellidos:', inp.surnames, 290, 160);
  w.gap(24);
  field('N° de Identificación:', inp.document, M, 150);
  w.gap(24);
  for (const b of CONSENT_OCC_BLOCKS) {
    const text = b.text.replace('{empresa}', inp.company || '________________');
    if (b.kind === 'h') {
      w.gap(4);
      w.ensure(24);
      w.para(text, 10.5, bold, M, 2);
    } else if (b.kind === 'li') w.para(`•  ${text}`, 10, font, M + 12, 1);
    else w.para(text, 10, font, M, 5);
  }
  w.gap(8);
  w.ensure(110);
  w.para('Habiendo recibido información clara, suficiente y comprensible sobre la naturaleza, finalidad y alcance de la evaluación, manifiesto que:', 10, font, M, 6);
  const auth = inp.decision === 'authorized';
  w.para(`[${auth ? 'X' : ' '}]  ${CONSENT_OCC_OPTIONS.authorize}`, 10, auth ? bold : font, M, 2);
  w.para(`[${auth ? ' ' : 'X'}]  ${CONSENT_OCC_OPTIONS.decline}`, 10, auth ? font : bold, M, 8);
  w.ensure(80);
  w.line('CONSTANCIA ELECTRÓNICA', M, 9, bold);
  w.gap(12);
  w.line(`${auth ? 'Autorizó en línea' : 'No autorizó en línea'} · ${dmy(inp.decidedAt)} ${hm(inp.decidedAt)} · N.° identificación: ${inp.document}`, M, 9);
  w.gap(11);
  w.line(`${inp.version}`, M, 8, font, MUTED);
  w.gap(11);
  w.line(`Huella digital del texto: ${inp.textHash.slice(0, 32)}`, M, 8, font, MUTED);
  if (inp.revokedAt) {
    w.gap(12);
    w.line(`REVOCADO el ${dmy(inp.revokedAt)}`, M, 9, bold, rgb(0.65, 0.05, 0.05));
  }
  w.gap(20);
  w.ensure(130);
  w.para('EXISTE LA POSIBILIDAD DE REVOCAR EL CONSENTIMIENTO EN CUALQUIER MOMENTO, EN TAL CASO DEBE INFORMAR SU DECISIÓN AL PROFESIONAL DE LA SALUD.', 8.5, bold, M, 10);
  w.para('DECLARACIÓN DEL PROFESIONAL DE LA SALUD', 10.5, bold, M, 4);
  const pr = inp.professional;
  w.para(`Yo, ${pr?.name ?? '____________________________________________'}, profesional responsable, certifico que:`, 10, font, M, 3);
  for (const t of CONSENT_OCC_PROFESSIONAL) w.para(`•  ${t}`, 10, font, M + 12, 1);
  w.gap(10);
  const sig = await embedSignature(doc, pr);
  w.ensure(sig ? 130 : 60);
  if (sig) {
    drawSignatureIn(w.pg, sig, { x: M, y: w.y - 46, w: 200, h: 46 });
    w.gap(50);
  }
  w.line('Firma del profesional de la salud responsable: ____________________________________', M, 10);
  w.gap(13);
  if (pr?.signed && pr.name) {
    const at = inp.signedAt ?? new Date();
    w.line(`Firmado electrónicamente · ${dmy(at)} ${hm(at)}`, M, 9, font);
    w.gap(12);
  }
  w.line(`N.° identificación: ${pr?.document ?? '________________________'}`, M, 10);
  w.gap(13);
  w.line(`Registro profesional: ${pr?.registry ?? '________________________'}`, M, 10);
  const mine = doc.getPages().slice(firstPage);
  for (let i = 0; i < mine.length; i++) await drawOccupationalHeader(doc, mine[i]!, font, bold, i + 1, mine.length);
}

const level = (l: string) => l;

/** Informe individual de la Acrofobia de Cohen: dos escalas con su nivel y el registro de respuestas por situación. */
export async function buildAcrofobiaReport(rec: AcrofobiaRecord, professional: Professional, generatedAt: Date, style: PdfStyle = defaultStyle('acrofobia')): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, undefined, 52);
  const r = rec.result;
  w.line('Documento confidencial para la psicóloga responsable. No constituye un diagnóstico clínico.', M, 8.5, font, MUTED);
  w.gap(18);
  w.line(`Nombre: ${rec.fullName}`);
  w.line(`Documento: ${rec.document}`, 330);
  w.gap(14);
  w.line(`Fecha de aplicación: ${rec.date.split('-').reverse().join('/')}`);
  w.gap(24);

  w.line('Resultados por escala', M, 11, bold, style.accent);
  w.gap(16);
  const heads = ['Escala', 'Puntaje', 'Máximo', 'Nivel'];
  const xs = [M, M + 150, M + 205, M + 255, M + 320];
  heads.forEach((h, i) => w.pg.drawText(h, { x: xs[i]!, y: w.y, size: 8.5, font: bold, color: INK }));
  w.gap(5);
  w.pg.drawLine({ start: { x: M, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.6, color: MUTED });
  w.gap(14);
  for (const [key, name, max] of [['anxiety', 'Parte I · Ansiedad', 120], ['avoidance', 'Parte II · Evitación', 40]] as const) {
    const s = r[key];
    const ranges = ACRO_BANDS[key].map((b) => `${b.level} ${b.from}-${b.to}`).join(' · ');
    w.pg.drawText(safe(name), { x: xs[0]!, y: w.y, size: 9.5, font: bold, color: INK });
    w.pg.drawText(String(s.total), { x: xs[1]!, y: w.y, size: 10, font: bold, color: INK });
    w.pg.drawText(String(max), { x: xs[2]!, y: w.y, size: 9.5, font, color: INK });
    w.pg.drawText(safe(level(s.level)), { x: xs[3]!, y: w.y, size: 10, font: bold, color: INK });
    w.gap(11);
    for (const l of wrap(font, ranges, 7.5, W - M - xs[0]!)) {
      w.pg.drawText(l, { x: xs[0]!, y: w.y, size: 7.5, font, color: MUTED });
      w.gap(9);
    }
    w.gap(8);
  }
  if (r.anxiety.answered < 20 || r.avoidance.answered < 20) w.para('Atención: hay situaciones sin respuesta; los puntajes son parciales.', 9, bold, M, 6, rgb(0.65, 0.05, 0.05));
  w.gap(8);

  w.ensure(60);
  w.line('Registro de respuestas por situación', M, 11, bold, style.accent);
  w.gap(16);
  const cx = [M, M + 24, M + 400, M + 450];
  ['N.°', 'Situación', 'Ansiedad', 'Evitación'].forEach((h, i) => w.pg.drawText(h, { x: cx[i]!, y: w.y, size: 8.5, font: bold, color: INK }));
  w.gap(5);
  w.pg.drawLine({ start: { x: M, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.6, color: MUTED });
  w.gap(12);
  r.items.forEach((it, i) => {
    const lines = wrap(font, ACROFOBIA_ITEMS[i]!, 8.5, 365);
    w.ensure(lines.length * 10 + 6);
    w.pg.drawText(String(it.n), { x: cx[0]!, y: w.y, size: 8.5, font, color: INK });
    lines.forEach((l, k) => w.pg.drawText(l, { x: cx[1]!, y: w.y - k * 10, size: 8.5, font, color: INK }));
    w.pg.drawText(safe(it.anxiety === undefined ? '—' : String(it.anxiety)), { x: cx[2]!, y: w.y, size: 8.5, font, color: INK });
    w.pg.drawText(safe(it.avoidance === undefined ? '—' : `${it.avoidance}`), { x: cx[3]!, y: w.y, size: 8.5, font, color: INK });
    w.gap(lines.length * 10 + 3);
  });
  w.gap(6);
  w.para(`Escala de ansiedad: ${ACROFOBIA_ANXIETY_SCALE.map((s, i) => `${i} = ${s}`).join('; ')}.`, 7.5, font, M, 2, MUTED);
  w.para(`Escala de evitación: ${ACROFOBIA_AVOID_SCALE.map((s, i) => `${i} = ${s}`).join('; ')}.`, 7.5, font, M, 2, MUTED);

  w.ensure(SIGNATURE_BLOCK_H + 10);
  await drawSignatureBlock(doc, w.pg, professional, w.y, M, font);
  await brandDocument(doc, style, professional, generatedAt, { font, bold }, M);
  doc.setTitle('Acrofobia Cohen');
  doc.setProducer('Sanithelp');
  return doc.save();
}

/** Hoja de respuestas del CLQ con el puntaje y la interpretación marcada por la psicóloga (solo se genera cuando ya la marcó). */
export async function buildClqReport(rec: ClqRecord, professional: Professional, generatedAt: Date, style: PdfStyle = defaultStyle('claustrofobia')): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, undefined, 52);
  w.line('Documento confidencial para la psicóloga responsable. No constituye un diagnóstico clínico.', M, 8.5, font, MUTED);
  w.gap(18);
  w.line(`Nombre: ${rec.fullName}`);
  w.line(`Documento: ${rec.document}`, 330);
  w.gap(14);
  w.line(`Fecha de aplicación: ${rec.date.split('-').reverse().join('/')}`);
  w.gap(24);
  w.line('RESULTADOS TEST', M, 11, bold, style.accent);
  w.gap(16);
  w.line(`Puntaje total CLQ: ${rec.result.total} de ${rec.result.max}`, M, 11, bold);
  w.gap(18);
  w.line('Interpretación (marcada por la psicóloga):', M, 10, font);
  w.gap(15);
  for (const [k, label] of CLQ_LEVELS) {
    w.line(`[${rec.level === k ? 'X' : ' '}]  ${label}`, M + 10, 10, rec.level === k ? bold : font);
    w.gap(14);
  }
  if (rec.markedAt) {
    w.line(`Marcada el ${rec.markedAt.split('-').reverse().join('/')}`, M + 10, 8, font, MUTED);
    w.gap(12);
  }
  if (rec.result.answered < CLQ_ITEMS.length) w.para('Atención: hay situaciones sin respuesta; el puntaje es parcial.', 9, bold, M, 6, rgb(0.65, 0.05, 0.05));
  w.gap(10);

  w.ensure(60);
  w.line('Registro de respuestas', M, 11, bold, style.accent);
  w.gap(16);
  const cx = [M, M + 24, M + 440];
  ['N.°', 'Situación', 'Respuesta'].forEach((h, i) => w.pg.drawText(h, { x: cx[i]!, y: w.y, size: 8.5, font: bold, color: INK }));
  w.gap(5);
  w.pg.drawLine({ start: { x: M, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.6, color: MUTED });
  w.gap(12);
  CLQ_ITEMS.forEach((t, i) => {
    const lines = wrap(font, t, 8.5, 400);
    w.ensure(lines.length * 10 + 6);
    const a = rec.answers[i + 1];
    w.pg.drawText(String(i + 1), { x: cx[0]!, y: w.y, size: 8.5, font, color: INK });
    lines.forEach((l, k) => w.pg.drawText(l, { x: cx[1]!, y: w.y - k * 10, size: 8.5, font, color: INK }));
    w.pg.drawText(a === undefined ? '—' : String(a), { x: cx[2]!, y: w.y, size: 9, font: bold, color: INK });
    w.gap(lines.length * 10 + 3);
  });
  w.gap(6);
  w.para(`Escala: ${CLQ_SCALE.map((s, i) => `${i} = ${s}`).join('; ')}.`, 7.5, font, M, 2, MUTED);

  w.ensure(SIGNATURE_BLOCK_H + 10);
  await drawSignatureBlock(doc, w.pg, professional, w.y, M, font);
  await brandDocument(doc, style, professional, generatedAt, { font, bold }, M);
  doc.setTitle('CLQ Claustrofobia');
  doc.setProducer('Sanithelp');
  return doc.save();
}
