import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { addTemplatePages, drawX } from './questionnaires.js';

const INK = rgb(0.05, 0.05, 0.35);

export interface ConsentPdfInput {
  names: string;
  surnames: string;
  document: string;
  decision: 'authorized' | 'declined';
  decidedAt: Date;
  version: string;
  textHash: string;
  revokedAt?: Date | null;
  /** Datos del profesional responsable (perfil de la psicóloga). Si faltan, los renglones quedan en blanco. */
  professional?: { name?: string; document?: string; registry?: string };
}

const pad = (n: number) => String(n).padStart(2, '0');
const dmy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function fit(page: PDFPage, font: PDFFont, text: string, x: number, baselineTop: number, maxW: number, size = 10) {
  let s = size;
  while (s > 5.5 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  page.drawText(text, { x, y: page.getHeight() - baselineTop, size: s, font, color: INK });
}

/** Superpone los datos y la constancia electrónica sobre el consentimiento oficial FP-PS-CI v01 (se descarta la 3.ª página, en blanco). */
export async function consentInto(doc: PDFDocument, inp: ConsentPdfInput): Promise<void> {
  const [p1, p2] = (await addTemplatePages(doc, 'consent', [0, 1])) as [PDFPage, PDFPage]; // la 3.ª página de la plantilla está en blanco
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Página 1: fecha de diligenciamiento e identificación
  const d = inp.decidedAt;
  const center = (t: string, x0: number, x1: number, y: number) => p1.drawText(t, { x: (x0 + x1) / 2 - font.widthOfTextAtSize(t, 10) / 2, y: p1.getHeight() - y, size: 10, font, color: INK });
  center(pad(d.getDate()), 63.9, 86.0, 181.5);
  center(pad(d.getMonth() + 1), 94.4, 116.5, 181.5);
  center(String(d.getFullYear()), 124.9, 158.3, 181.5);
  fit(p1, font, inp.names, 112, 227.5, 228);
  fit(p1, font, inp.surnames, 66, 239.2, 228);
  fit(p1, font, inp.document, 160, 250.5, 160);

  // Página 2: decisión
  drawX(p2, 68.2, inp.decision === 'authorized' ? 329.8 : 354.5, 4);
  // En lugar de la firma y la huella física se deja la constancia de aceptación electrónica
  const stamp = inp.decision === 'authorized' ? 'Aceptación electrónica' : 'Decisión registrada electrónicamente';
  fit(p2, font, stamp, 162, 432.5, 140, 9);
  fit(p2, font, inp.document, 166, 444, 120);
  fit(p2, font, `${dmy(d)} ${hm(d)}`, 72, 467, 200);
  const lines = [
    'CONSTANCIA ELECTRÓNICA',
    inp.decision === 'authorized' ? 'Autorizó en línea' : 'No autorizó en línea',
    `${dmy(d)} ${hm(d)}`,
    inp.version,
    'Huella digital del texto:',
    inp.textHash.slice(0, 16),
    inp.textHash.slice(16, 32),
  ];
  lines.forEach((t, i) => p2.drawText(t, { x: 372, y: p2.getHeight() - (418 + i * 8.6), size: i === 0 ? 4.9 : 5.8, font: i === 0 ? bold : font, color: INK }));
  if (inp.revokedAt) p2.drawText(`REVOCADO el ${dmy(inp.revokedAt)}`, { x: 372, y: p2.getHeight() - 470, size: 6.5, font: bold, color: rgb(0.65, 0.05, 0.05) });

  // Declaración del profesional responsable (si hay datos en su perfil)
  const pr = inp.professional;
  if (pr?.name) fit(p2, font, pr.name, 83, 530.5, 262);
  if (pr?.document) fit(p2, font, pr.document, 160, 622.5, 140);
  if (pr?.registry) fit(p2, font, pr.registry, 161, 634, 145);
}

export async function consentPdf(inp: ConsentPdfInput): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  await consentInto(doc, inp);
  return doc;
}
