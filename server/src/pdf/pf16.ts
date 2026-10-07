import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PF16_ITEMS, PF16_LETTERS } from '@sanithelp/shared';
import type { IndividualRecord } from '../results/individual.js';
import type { Professional } from './expediente.js';

const INK = rgb(0.1, 0.18, 0.26);
const MUTED = rgb(0.35, 0.42, 0.47);
const pad = (n: number) => String(n).padStart(2, '0');
const safe = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022]/g, '');

/**
 * Hoja de respuestas del 16PF: cuadrícula con las opciones A, B y C de cada cuestión y la elegida rellena.
 * NO incluye puntajes: la calificación se hace con las plantillas y baremos del editor (TEA).
 */
export async function buildPf16Sheet(rec: IndividualRecord, professional: Professional, generatedAt: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 792;
  const H = 612;
  const M = 30;
  const page = doc.addPage([W, H]);

  page.drawText('16PF · Hoja de respuestas', { x: M, y: H - M - 4, size: 15, font: bold, color: INK });
  page.drawText(safe(`Nombre: ${rec.fullName}   Documento: ${rec.document}   Fecha de aplicación: ${rec.date.split('-').reverse().join('/')}`), { x: M, y: H - M - 22, size: 9.5, font, color: INK });
  page.drawText(`Respondidas: ${Object.keys(rec.answers).length} de ${PF16_ITEMS.length}. Hoja de respuestas sin calificar; la calificación requiere las plantillas y baremos del editor.`, { x: M, y: H - M - 36, size: 8, font, color: MUTED });

  const rows = 16;
  const cols = Math.ceil(PF16_ITEMS.length / rows);
  const colW = (W - 2 * M) / cols;
  const top = H - M - 56;
  const rowH = (top - 50) / rows;
  PF16_ITEMS.forEach((_, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = M + col * colW;
    const y = top - row * rowH;
    page.drawText(String(i + 1), { x, y, size: 7, font: bold, color: INK });
    const chosen = rec.answers[i + 1];
    PF16_LETTERS.forEach((L, k) => {
      const cx = x + 20 + k * 10;
      page.drawCircle({ x: cx + 3, y: y + 2.5, size: 3.6, borderColor: INK, borderWidth: 0.5, color: chosen === k ? INK : undefined });
      if (chosen !== k) page.drawText(L, { x: cx + 1.4, y: y + 0.8, size: 4.2, font, color: MUTED });
    });
  });

  const pro = [professional.name && `Profesional responsable: ${professional.name}`, professional.document && `Documento: ${professional.document}`, professional.registry && `Registro profesional: ${professional.registry}`].filter(Boolean).join(' · ');
  if (pro) page.drawText(safe(pro), { x: M, y: 30, size: 7, font, color: MUTED });
  page.drawText(`Confidencial — uso exclusivo del profesional responsable · Generado el ${pad(generatedAt.getDate())}/${pad(generatedAt.getMonth() + 1)}/${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`, { x: M, y: 20, size: 7, font, color: MUTED });
  doc.setTitle('16PF · Hoja de respuestas');
  doc.setProducer('Sanithelp');
  return doc.save();
}
