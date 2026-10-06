import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { FICHA, type FichaAnswers } from '@sanithelp/shared';
import { TEMPLATES_DIR, addTemplatePages, drawX } from './questionnaires.js';

type Mark = { kind: 'x'; x: number; y: number } | { kind: 'circle'; x: number; y: number; w: number; h: number };
interface FichaCoord {
  page: number;
  options?: Mark[];
  box?: { x0: number; x1: number; top: number; bottom: number };
  cells?: { city: { x: number; y: number; maxW: number }; department: { x: number; y: number; maxW: number } };
  less?: { x: number; y: number };
  more?: { x: number; y: number };
  num?: { x: number; y: number };
}
interface Header { page: number; dateY: number; ddX: number; mmX: number; aaaaX: number; idX: number; idY: number }

let cache: { ficha: Record<string, FichaCoord>; header: Record<string, Header> } | null = null;
const data = () => (cache ??= JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, 'coords.json'), 'utf8')));

const INK = rgb(0.05, 0.05, 0.35);

function fitText(page: PDFPage, font: PDFFont, text: string, x: number, baselineTop: number, maxW: number, size = 10) {
  let s = size;
  while (s > 6 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  page.drawText(text, { x, y: page.getHeight() - baselineTop, size: s, font, color: INK });
}
function centered(page: PDFPage, font: PDFFont, text: string, cx: number, baselineTop: number, size = 10) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y: page.getHeight() - baselineTop, size, font, color: INK });
}

export interface FichaPdfInput {
  data: FichaAnswers;
  /** fecha de aplicación ISO yyyy-mm-dd */
  date: string;
  document: string;
}

/** Superpone las respuestas de la ficha sobre la plantilla oficial «Ficha de datos generales». */
export async function fichaInto(doc: PDFDocument, inp: FichaPdfInput): Promise<void> {
  const pages = await addTemplatePages(doc, 'ficha');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { ficha, header } = data();

  const h = header['ficha']!;
  const p1 = pages[h.page - 1]!;
  const [yyyy, mm, dd] = inp.date.split('-');
  centered(p1, font, dd!, h.ddX, h.dateY);
  centered(p1, font, mm!, h.mmX, h.dateY);
  centered(p1, font, yyyy!, h.aaaaX, h.dateY);
  p1.drawText(inp.document, { x: h.idX, y: p1.getHeight() - h.idY - 2, size: 11, font, color: INK });

  for (const q of FICHA) {
    const c = ficha[String(q.n)];
    const v = inp.data[String(q.n)];
    if (!c || v === undefined) continue;
    const page = pages[c.page - 1]!;
    switch (q.type) {
      case 'single': {
        const i = q.options.indexOf(String(v));
        const m = c.options?.[i];
        if (!m) break;
        if (m.kind === 'x') drawX(page, m.x, m.y, 4.5);
        else page.drawEllipse({ x: m.x, y: page.getHeight() - m.y, xScale: m.w / 2, yScale: m.h / 2, borderColor: INK, borderWidth: 1.4 });
        break;
      }
      case 'text': {
        const b = c.box;
        if (b) fitText(page, font, String(v), b.x0 + 4, b.bottom - (b.bottom - b.top - 10) / 2 - 2, b.x1 - b.x0 - 8);
        break;
      }
      case 'number': {
        if (q.n === 3 && c.box) fitText(page, font, String(v), c.box.x0 + 4, c.box.bottom - (c.box.bottom - c.box.top - 10) / 2 - 2, c.box.x1 - c.box.x0 - 8);
        else if (c.num) centered(page, font, String(v), c.num.x, c.num.y);
        break;
      }
      case 'place': {
        const p = v as { city: string; department: string };
        if (c.cells) {
          fitText(page, font, p.city, c.cells.city.x, c.cells.city.y, c.cells.city.maxW);
          fitText(page, font, p.department, c.cells.department.x, c.cells.department.y, c.cells.department.maxW);
        }
        break;
      }
      case 'years': {
        const y = v as { lessThanYear: boolean; years?: number };
        if (y.lessThanYear && c.less) drawX(page, c.less.x, c.less.y, 4.5);
        else if (!y.lessThanYear && c.more) centered(page, font, String(y.years ?? ''), c.more.x, c.more.y + 3.5);
        break;
      }
    }
  }
}

export async function fichaPdf(inp: FichaPdfInput): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  await fichaInto(doc, inp);
  return doc;
}
