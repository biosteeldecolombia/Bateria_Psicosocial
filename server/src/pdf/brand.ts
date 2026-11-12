import fs from 'node:fs';
import path from 'node:path';
import { rgb, type RGB, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { DEFAULT_PDF_SETTINGS, mergePdfSettings, type PdfDocKind, type PdfSettings } from '@sanithelp/shared';
import { TEMPLATES_DIR } from './questionnaires.js';
import type { Professional } from './expediente.js';

/** Identidad visual común de los PDF de Sanithelp: logo, código y versión del formato arriba a la derecha, colores y pie de página. */
export interface PdfStyle {
  kind: PdfDocKind;
  accent: RGB;
  soft: RGB;
  showLogo: boolean;
  footer: string;
  title: string;
  /** Código del formato en el sistema documental; vacío = «POR ASIGNAR». */
  code: string;
  version: string;
}

/** Alto reservado arriba de cada página para el encabezado (el contenido empieza por debajo). */
export const HEADER_H = 84;

const INK = rgb(0.1, 0.18, 0.26);
const MUTED = rgb(0.35, 0.42, 0.47);
const pad = (n: number) => String(n).padStart(2, '0');
const safe = (t: string) => t.replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, '');

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function styleFor(settings: PdfSettings | unknown, kind: PdfDocKind): PdfStyle {
  const s = mergePdfSettings(settings);
  const d = s.docs[kind];
  return { kind, accent: hexToRgb(s.accent), soft: hexToRgb(s.accentSoft), showLogo: s.showLogo, footer: s.footer, title: d.title, code: d.code.trim(), version: d.version };
}

export const defaultStyle = (kind: PdfDocKind) => styleFor(DEFAULT_PDF_SETTINGS, kind);

let logoBytes: Uint8Array | null | undefined;
function logo(): Uint8Array | null {
  if (logoBytes === undefined) {
    try {
      logoBytes = fs.readFileSync(path.join(TEMPLATES_DIR, 'logo_sanithelp.png'));
    } catch {
      logoBytes = null;
    }
  }
  return logoBytes;
}

/** Encabezado de una página: logo y título a la izquierda; a la derecha el cuadro documental (Formato, Versión y Página). */
async function drawHeader(doc: PDFDocument, page: PDFPage, st: PdfStyle, font: PDFFont, bold: PDFFont, n: number, total: number, M: number) {
  const { width: W, height: H } = page.getSize();
  const top = H - 22;
  const h = 56;
  page.drawRectangle({ x: M, y: top - h, width: W - 2 * M, height: h, color: st.soft });
  page.drawRectangle({ x: M, y: top - h, width: 4, height: h, color: st.accent });
  let tx = M + 16;
  const bytes = st.showLogo ? logo() : null;
  if (bytes) {
    try {
      const img = await doc.embedPng(bytes);
      const k = Math.min(70 / img.width, 38 / img.height);
      page.drawImage(img, { x: M + 14, y: top - h / 2 - (img.height * k) / 2, width: img.width * k, height: img.height * k });
      tx = M + 14 + img.width * k + 14;
    } catch {
      /* sin logo */
    }
  }
  // Cuadro documental (obligatorio): Formato / Versión / Página, arriba a la derecha
  const bw = 138;
  const bx = W - M - bw - 8;
  const rows: [string, string][] = [['Formato', st.code || 'POR ASIGNAR'], ['Versión', st.version], ['Página', `${n} de ${total}`]];
  page.drawRectangle({ x: bx, y: top - h + 6, width: bw, height: h - 12, color: rgb(1, 1, 1), borderColor: st.accent, borderWidth: 0.9 });
  rows.forEach(([k, v], i) => {
    const y = top - 19 - i * 13.5;
    page.drawText(`${k}:`, { x: bx + 7, y, size: 8, font: bold, color: MUTED });
    const missing = k === 'Formato' && !st.code;
    page.drawText(safe(v), { x: bx + 52, y, size: 8.5, font: bold, color: missing ? rgb(0.72, 0.1, 0.1) : INK });
  });
  const maxW = bx - tx - 12;
  const words = safe(st.title).split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (bold.widthOfTextAtSize(next, 12.5) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  lines.slice(0, 2).forEach((l, i, arr) => page.drawText(l, { x: tx, y: top - h / 2 + (arr.length === 1 ? -4 : 6 - i * 15), size: 12.5, font: bold, color: st.accent }));
  page.drawText('Sanithelp S.A.S. · Evaluaciones psicométricas', { x: tx, y: top - h + 9, size: 7, font, color: MUTED });
  page.drawLine({ start: { x: M, y: top - h - 4 }, end: { x: W - M, y: top - h - 4 }, thickness: 1.2, color: st.accent });
}

/**
 * Aplica la identidad común a todas las páginas ya dibujadas: encabezado (logo + Formato/Versión/Página) y pie con
 * los datos de la profesional y la fecha de generación. Llamar al final, cuando ya se conoce el total de páginas.
 */
export async function brandDocument(doc: PDFDocument, st: PdfStyle, professional: Professional, generatedAt: Date, fonts: { font: PDFFont; bold: PDFFont }, M = 40) {
  const pages = doc.getPages();
  const pro = [professional.name && `Profesional responsable: ${professional.name}`, professional.document && `Documento: ${professional.document}`, professional.registry && `Registro profesional: ${professional.registry}`].filter(Boolean).join(' · ');
  const stamp = `${st.footer} · Generado el ${pad(generatedAt.getDate())}/${pad(generatedAt.getMonth() + 1)}/${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    await drawHeader(doc, p, st, fonts.font, fonts.bold, i + 1, pages.length, M);
    const { width: W } = p.getSize();
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: st.accent });
    if (pro) p.drawText(safe(pro), { x: M, y: 30, size: 7, font: fonts.font, color: MUTED });
    p.drawText(safe(stamp), { x: M, y: 20, size: 7, font: fonts.font, color: MUTED });
  }
}

/** Título de sección con una barra de color a la izquierda. Devuelve el alto usado. */
export function sectionTitle(page: PDFPage, text: string, x: number, y: number, st: PdfStyle, bold: PDFFont, size = 11.5): number {
  page.drawRectangle({ x, y: y - 3, width: 3.5, height: size + 3, color: st.accent });
  page.drawText(safe(text), { x: x + 10, y, size, font: bold, color: st.accent });
  return size + 8;
}

/** Hoja de ejemplo para la vista previa del editor de formatos: muestra encabezado, secciones, viñetas y una gráfica con el estilo vigente. */
export async function buildStylePreview(st: PdfStyle): Promise<Uint8Array> {
  const { PDFDocument: Doc, StandardFonts } = await import('pdf-lib');
  const doc = await Doc.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 40;
  const pg = doc.addPage([W, H]);
  let y = H - M - HEADER_H - 16;
  y -= sectionTitle(pg, 'Datos de la persona', M, y, st, bold) + 6;
  pg.drawText('Nombre: Persona de ejemplo     Documento: 1234567890     Fecha: 01/01/2026', { x: M, y, size: 10, font, color: INK });
  y -= 30;
  y -= sectionTitle(pg, 'Resultados (gráfica de ejemplo)', M, y, st, bold) + 8;
  for (const [label, v] of [['Escala A', 0.82], ['Escala B', 0.55], ['Escala C', 0.3]] as const) {
    pg.drawText(label, { x: M, y, size: 10, font: bold, color: INK });
    pg.drawRectangle({ x: 150, y: y - 4, width: 300, height: 14, color: st.soft });
    pg.drawRectangle({ x: 150, y: y - 4, width: 300 * v, height: 14, color: st.accent });
    y -= 24;
  }
  y -= 12;
  y -= sectionTitle(pg, 'Observaciones', M, y, st, bold) + 6;
  for (const b of ['Los textos de cada formato se conservan tal cual.', 'El código y la versión salen arriba a la derecha.', 'Los colores y el pie se cambian desde Formatos PDF.']) {
    pg.drawCircle({ x: M + 4, y: y + 3, size: 2, color: st.accent });
    pg.drawText(b, { x: M + 14, y, size: 10, font, color: INK });
    y -= 15;
  }
  await brandDocument(doc, st, { name: 'Psicóloga de ejemplo', document: '00000000', registry: 'REG-0000' }, new Date(), { font, bold }, M);
  doc.setTitle(`Vista previa · ${st.title}`);
  doc.setProducer('Sanithelp');
  return doc.save();
}
