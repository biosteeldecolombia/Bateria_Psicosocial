import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { CLQ_LEVELS, FORMATOS, FORMATO_GENERAL, FORMATO_HEADER, FORMATO_VALIDITY, type ClqLevel, type FormatoData, type FormatoKind } from '@sanithelp/shared';
import type { Professional } from './expediente.js';
import { drawSignatureIn, embedSignature } from './firma.js';
import { TEMPLATES_DIR } from './questionnaires.js';

const W = 612;
const H = 792;
const X0 = 90; // margen izquierdo del contenido (como en el formato)
const X1 = W - 90;
const BLUE = rgb(0.31, 0.52, 0.8);
const INK = rgb(0.05, 0.05, 0.05);
const FILL = rgb(0.05, 0.12, 0.45); // lo diligenciado por la psicóloga se distingue del texto fijo

const safe = (t: string) => t.replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, '');

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\r?\n/)) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxW && cur) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

export interface FormatoPdfInput {
  kind: FormatoKind;
  data: FormatoData;
  /** Datos precargados que la psicóloga no modificó (se usan si el campo quedó vacío). */
  prefill: { nombre: string; edad: string; cargo: string; empresa: string; fecha: string };
  /** CLQ: puntaje total y nivel marcado por la psicóloga (solo espacios confinados). */
  clq?: { total: number; level: ClqLevel | null };
  professional: Professional;
}

/** Formato de evaluación psicológica ocupacional diligenciado, con el encabezado del formato y la firma de la psicóloga responsable. */
export async function buildFormatoPdf(inp: FormatoPdfInput): Promise<Uint8Array> {
  const spec = FORMATOS[inp.kind];
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.TimesRoman);
  const bodyBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const bodyItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];
  let pg!: PDFPage;
  let y = 0;
  const newPage = () => {
    pg = doc.addPage([W, H]);
    pages.push(pg);
    y = H - 152;
  };
  const ensure = (h: number) => {
    if (y - h < 56) newPage();
  };
  newPage();

  const text = (t: string, x: number, size = 11, f = body, color = INK) => pg.drawText(safe(t), { x, y, size, font: f, color });
  const heading = (t: string) => {
    ensure(34);
    y -= 8;
    text(t, X0, 11, bodyBold);
    y -= 19;
  };
  /** «Etiqueta: valor» con el valor (de la psicóloga) en otro color y ajuste de línea. */
  const field = (label: string, value: string) => {
    const lw = body.widthOfTextAtSize(`${safe(label)}: `, 11);
    const lines = value ? wrap(body, value, 11, X1 - X0 - lw) : [''];
    ensure(lines.length * 14 + 6);
    text(`${label}:`, X0);
    lines.forEach((l, i) => {
      if (l) pg.drawText(safe(l), { x: X0 + lw, y: y - i * 14, size: 11, font: body, color: FILL });
    });
    y -= lines.length * 14 + 8;
  };
  const para = (t: string, f = body, size = 11) => {
    for (const l of wrap(f, t, size, X1 - X0)) {
      ensure(15);
      text(l, X0, size, f);
      y -= 14.5;
    }
    y -= 6;
  };
  const v = (key: string, fallback = '') => inp.data.values[key] ?? fallback;

  // --- Datos generales (tabla) ---
  heading('DATOS GENERALES');
  const labelW = 150;
  const cellW = X1 - X0 - labelW;
  for (const g of FORMATO_GENERAL) {
    const value = v(`general.${g.id}`, (inp.prefill as Record<string, string>)[g.id] ?? '');
    const lines = value ? wrap(sans, value, 8.5, cellW - 8) : [''];
    const rh = Math.max(14, lines.length * 11 + 4);
    ensure(rh + 2);
    pg.drawRectangle({ x: X0, y: y - rh + 11, width: labelW, height: rh, borderColor: rgb(0.45, 0.45, 0.45), borderWidth: 0.6 });
    pg.drawRectangle({ x: X0 + labelW, y: y - rh + 11, width: cellW, height: rh, borderColor: rgb(0.45, 0.45, 0.45), borderWidth: 0.6 });
    pg.drawText(safe(g.label.toUpperCase()), { x: X0 + 4, y: y + 0.5, size: 9, font: bodyBold, color: INK });
    lines.forEach((l, i) => pg.drawText(safe(l), { x: X0 + labelW + 4, y: y - i * 11 + 0.5, size: 8.5, font: sans, color: FILL }));
    y -= rh;
  }
  y -= 22;

  if (spec.note) {
    ensure(40);
    const nw = bodyBold.widthOfTextAtSize('Nota : ', 11);
    text('Nota :', X0, 11, bodyBold);
    const lines = wrap(bodyItalic, spec.note, 11, X1 - X0 - nw);
    lines.forEach((l, i) => pg.drawText(safe(l), { x: X0 + nw, y: y - i * 14.5, size: 11, font: bodyItalic, color: INK }));
    y -= lines.length * 14.5 + 14;
  }

  heading('CRITERIO DE EVALUACIÓN');
  para(spec.criteria);

  heading('EXAMEN MENTAL');
  for (const f of spec.mental) field(f.label, v(`mental.${f.id}`));

  heading(spec.cognitiveTitle);
  for (const f of spec.cognitive) field(f.label, v(`cognitive.${f.id}`));

  heading('FACTORES DE RIESGO PSICOLÓGICO');
  for (const f of spec.factors) {
    ensure(20);
    const a = inp.data.factors[f.id];
    text(`${f.label}:  Sí ( ${a === 'yes' ? 'X' : ' '} )   No ( ${a === 'no' ? 'X' : ' '} )`, X0);
    y -= 20;
  }

  if (spec.observation) {
    heading('OBSERVACIÓN CONDUCTUAL');
    text('Durante la evaluación se observa:', X0);
    y -= 15;
    const obs = v('observation');
    if (obs) {
      for (const l of wrap(body, obs, 11, X1 - X0)) {
        ensure(15);
        pg.drawText(safe(l), { x: X0, y, size: 11, font: body, color: FILL });
        y -= 14.5;
      }
    } else {
      for (let i = 0; i < 3; i++) {
        pg.drawLine({ start: { x: X0, y: y - 2 }, end: { x: X0 + 262, y: y - 2 }, thickness: 0.6, color: INK });
        y -= 14;
      }
    }
    y -= 6;
  }

  if (spec.clqResult) {
    heading('RESULTADOS TEST');
    ensure(24);
    const lbl = 'Puntaje Total CLQ: ';
    text(lbl, X0);
    if (inp.clq) pg.drawText(String(inp.clq.total), { x: X0 + body.widthOfTextAtSize(lbl, 11), y, size: 11, font: bodyBold, color: FILL });
    else pg.drawLine({ start: { x: X0 + body.widthOfTextAtSize(lbl, 11), y: y - 2 }, end: { x: X0 + 150, y: y - 2 }, thickness: 0.6, color: INK });
    y -= 26;
    ensure(80);
    text('Interpretación:', X0, 11, bodyBold);
    y -= 18;
    for (const [k, label] of CLQ_LEVELS) {
      text(`[ ${inp.clq?.level === k ? 'X' : ' '} ] ${label.replace('claustrophobia', 'claustrofobia')}`, X0);
      y -= 19;
    }
    y -= 4;
  }

  // --- Concepto, validez y firma: se mantienen juntos ---
  ensure(300);
  heading('CONCEPTO PSICOLÓGICO OCUPACIONAL');
  for (const [k, label] of [['apto', spec.concept.apto], ['apto_rec', spec.concept.apto_rec], ['no_apto', spec.concept.no_apto]] as const) {
    text(`${label}   ( ${inp.data.concept === k ? 'X' : ' '} )`, X0);
    y -= 20;
  }
  y -= 8;
  heading('NOTA DE VALIDEZ');
  para(FORMATO_VALIDITY);
  y -= 8;
  ensure(120);
  const sig = await embedSignature(doc, inp.professional);
  text('Firma Psicólogo:', X0);
  const sx = X0 + body.widthOfTextAtSize('Firma Psicólogo: ', 11);
  if (sig) drawSignatureIn(pg, sig, { x: sx, y: y - 22, w: 180, h: 54 });
  else pg.drawLine({ start: { x: sx, y: y - 2 }, end: { x: sx + 180, y: y - 2 }, thickness: 0.6, color: INK });
  y -= sig ? 40 : 22;
  if (inp.professional.name) {
    pg.drawText(safe(inp.professional.name), { x: sx, y, size: 10, font: body, color: FILL });
    y -= 16;
  }
  text('Tarjeta Profesional:', X0);
  if (inp.professional.registry) pg.drawText(safe(inp.professional.registry), { x: X0 + body.widthOfTextAtSize('Tarjeta Profesional: ', 11), y, size: 11, font: body, color: FILL });
  y -= 18;
  if (inp.professional.document) {
    text('Documento:', X0);
    pg.drawText(safe(inp.professional.document), { x: X0 + body.widthOfTextAtSize('Documento: ', 11), y, size: 11, font: body, color: FILL });
  }

  // --- Marco azul y encabezado en cada página (con «Página n de N») ---
  let logo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(path.join(TEMPLATES_DIR, 'logo_sanithelp.png')));
  } catch {
    logo = null;
  }
  pages.forEach((p, i) => {
    p.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: BLUE, borderWidth: 2.6 });
    const hx = 40;
    const hw = W - 80;
    const hh = 90;
    const hy = H - 36 - hh;
    const line = { thickness: 0.6, color: rgb(0.45, 0.45, 0.45) };
    p.drawRectangle({ x: hx, y: hy, width: hw, height: hh, borderColor: rgb(0.45, 0.45, 0.45), borderWidth: 0.6 });
    const c1 = hx + 94;
    const c2 = hx + hw - 158;
    const c3 = c2 + 87;
    p.drawLine({ start: { x: c1, y: hy }, end: { x: c1, y: hy + hh }, ...line });
    p.drawLine({ start: { x: c2, y: hy }, end: { x: c2, y: hy + hh }, ...line });
    p.drawLine({ start: { x: c3, y: hy }, end: { x: c3, y: hy + hh }, ...line });
    p.drawLine({ start: { x: c1, y: hy + hh / 2 }, end: { x: c2, y: hy + hh / 2 }, ...line });
    for (let r = 1; r < 4; r++) p.drawLine({ start: { x: c2, y: hy + (hh * r) / 4 }, end: { x: hx + hw, y: hy + (hh * r) / 4 }, ...line });
    if (logo) {
      const k = Math.min(66 / logo.width, 36 / logo.height);
      p.drawImage(logo, { x: hx + (94 - logo.width * k) / 2, y: hy + (hh - logo.height * k) / 2, width: logo.width * k, height: logo.height * k });
    }
    const mid = (t: string, yy: number, f = sansBold) => p.drawText(t, { x: c1 + (c2 - c1 - f.widthOfTextAtSize(t, 9)) / 2, y: yy, size: 9, font: f, color: INK });
    mid(FORMATO_HEADER.line1, hy + hh - 22);
    mid(spec.headerTitle, hy + hh - 42);
    mid(FORMATO_HEADER.process, hy + 19);
    const rows: [string, string][] = [['Código:', FORMATO_HEADER.code], ['Versión:', FORMATO_HEADER.version], ['Fecha:', FORMATO_HEADER.date], ['Página:', `${i + 1} de ${pages.length}`]];
    rows.forEach(([k, val], r) => {
      const yy = hy + hh - (hh * (r + 1)) / 4 + 8;
      p.drawText(k, { x: c2 + 7, y: yy, size: 9, font: sansBold, color: INK });
      p.drawText(val, { x: c3 + 7, y: yy, size: 9, font: sans, color: INK });
    });
  });

  doc.setTitle(`Evaluación psicológica ocupacional · ${spec.headerTitle}`);
  doc.setProducer('Sanithelp');
  return doc.save();
}
