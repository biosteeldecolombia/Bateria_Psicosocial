import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import type { QuestionnaireId } from '@sanithelp/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Carpeta de plantillas: desarrollo (src/pdf) o compilado (dist). */
export const TEMPLATES_DIR = [path.resolve(here, '../../assets/pdf-templates'), path.resolve(here, '../assets/pdf-templates'), path.resolve(process.cwd(), 'assets/pdf-templates')].find((p) => fs.existsSync(path.join(p, 'coords.json')))!;

export const TEMPLATE_FILE: Record<string, string> = {
  intra_A: 'intralaboral_A.pdf',
  intra_B: 'intralaboral_B.pdf',
  extra: 'extralaboral.pdf',
  stress: 'estres.pdf',
  ficha: 'ficha.pdf',
  consent: 'consentimiento.pdf',
};

interface ItemCoord { page: number; y: number; xs: number[] }
interface GateCoord { page: number; x: number; ySi: number; yNo: number }
interface HeaderCoord { page: number; dateY: number; ddX: number; mmX: number; aaaaX: number; idX: number; idY: number }
interface Coords {
  intra_A: Record<string, ItemCoord>;
  intra_B: Record<string, ItemCoord>;
  extra: Record<string, ItemCoord>;
  stress: Record<string, ItemCoord>;
  header: Record<string, HeaderCoord | null>;
  gates: Record<string, Record<string, GateCoord>>;
}
let coordsCache: Coords | null = null;
export const coords = (): Coords => (coordsCache ??= JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, 'coords.json'), 'utf8')) as Coords);

/** Plantillas analizadas UNA sola vez (analizar ~5 MB por persona agotaba la memoria en exportaciones masivas). */
const templateCache = new Map<string, Promise<PDFDocument>>();
const templateDoc = (name: keyof typeof TEMPLATE_FILE) => {
  let d = templateCache.get(name);
  if (!d) {
    d = PDFDocument.load(fs.readFileSync(path.join(TEMPLATES_DIR, TEMPLATE_FILE[name]!)));
    templateCache.set(name, d);
  }
  return d;
};

/** Copia las páginas de una plantilla al documento de salida y las devuelve para dibujar sobre ellas. */
export async function addTemplatePages(out: PDFDocument, name: keyof typeof TEMPLATE_FILE, indices?: number[]): Promise<PDFPage[]> {
  const src = await templateDoc(name);
  const copied = await out.copyPages(src, indices ?? src.getPageIndices());
  return copied.map((p) => out.addPage(p));
}

export async function loadTemplate(name: keyof typeof TEMPLATE_FILE): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  await addTemplatePages(out, name);
  return out;
}

const INK = rgb(0.05, 0.05, 0.35);

/** Marca «X» centrada en (x, y) con y medida desde arriba, como en las plantillas. */
export function drawX(page: PDFPage, x: number, yTop: number, size = 5.5) {
  const y = page.getHeight() - yTop;
  const o = { thickness: 1.6, color: INK };
  page.drawLine({ start: { x: x - size, y: y - size }, end: { x: x + size, y: y + size }, ...o });
  page.drawLine({ start: { x: x - size, y: y + size }, end: { x: x + size, y: y - size }, ...o });
}

export interface QuestionnairePdfInput {
  id: QuestionnaireId;
  /** índice de opción 0-based por ítem */
  answers: Record<number, number>;
  gates: { clients?: boolean; boss?: boolean };
  /** fecha de aplicación (ISO yyyy-mm-dd) y documento del respondiente */
  date: string;
  document: string;
}

/** Añade al documento `out` el cuestionario con fecha, ID y respuestas marcadas sobre la plantilla oficial. */
export async function questionnaireInto(out: PDFDocument, inp: QuestionnairePdfInput): Promise<void> {
  const pages = await addTemplatePages(out, inp.id);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const c = coords();
  const h = c.header[inp.id];
  if (h) {
    const p = pages[h.page - 1]!;
    const [yyyy, mm, dd] = inp.date.split('-');
    const centered = (t: string, cx: number) => p.drawText(t, { x: cx - font.widthOfTextAtSize(t, 10) / 2, y: p.getHeight() - h.dateY, size: 10, font, color: INK });
    centered(dd!, h.ddX);
    centered(mm!, h.mmX);
    centered(yyyy!, h.aaaaX);
    p.drawText(inp.document, { x: h.idX, y: p.getHeight() - h.idY - 2, size: 10, font, color: INK });
  }
  const items = c[inp.id];
  for (const [n, idx] of Object.entries(inp.answers)) {
    const it = items[n];
    const x = it?.xs[idx];
    if (!it || x === undefined) continue;
    drawX(pages[it.page - 1]!, x, it.y);
  }
  // Compuertas Sí / No
  for (const [key, g] of Object.entries(c.gates[inp.id] ?? {})) {
    const v = inp.gates[key as 'clients' | 'boss'];
    if (v === undefined) continue;
    drawX(pages[g.page - 1]!, g.x, v ? g.ySi : g.yNo, 4.5);
  }
}

export async function questionnairePdf(inp: QuestionnairePdfInput): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  await questionnaireInto(out, inp);
  return out;
}
