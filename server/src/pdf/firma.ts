import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Professional } from './expediente.js';

/** Incrusta la imagen de firma de la psicóloga responsable, o null si no cargó una (o el archivo no se puede leer). */
export async function embedSignature(doc: PDFDocument, professional: Professional | undefined): Promise<PDFImage | null> {
  const s = professional?.signature;
  if (!s) return null;
  try {
    return s.mime === 'image/png' ? await doc.embedPng(s.bytes) : await doc.embedJpg(s.bytes);
  } catch {
    return null;
  }
}

/**
 * Dibuja la firma dentro de un recuadro (x, y = esquina inferior izquierda) conservando la proporción y alineada a la izquierda.
 * Devuelve el alto realmente usado.
 */
export function drawSignatureIn(page: PDFPage, img: PDFImage, box: { x: number; y: number; w: number; h: number }): number {
  const k = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * k;
  const h = img.height * k;
  page.drawImage(img, { x: box.x, y: box.y + (box.h - h), width: w, height: h });
  return h;
}

/**
 * Bloque de firma al final de un informe: imagen, línea y nombre con registro. Ocupa `SIGNATURE_BLOCK_H` puntos desde `top`
 * (coordenada y del borde superior del bloque). No dibuja nada si la psicóloga no cargó su firma.
 */
export const SIGNATURE_BLOCK_H = 78;
export async function drawSignatureBlock(doc: PDFDocument, page: PDFPage, professional: Professional | undefined, top: number, x: number, font: PDFFont): Promise<void> {
  const img = await embedSignature(doc, professional);
  if (!img || !professional) return;
  drawSignatureIn(page, img, { x, y: top - 50, w: 170, h: 48 });
  page.drawLine({ start: { x, y: top - 54 }, end: { x: x + 200, y: top - 54 }, thickness: 0.6, color: rgb(0.35, 0.42, 0.47) });
  const who = [professional.name, professional.registry && `Reg. ${professional.registry}`].filter(Boolean).join(' · ');
  if (who) page.drawText(who.replace(/[^\x20-\x7E -ÿ]/g, ''), { x, y: top - 65, size: 8, font, color: rgb(0.1, 0.18, 0.26) });
}
