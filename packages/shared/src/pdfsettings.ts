// Ajustes editables de los PDF que genera la plataforma (código y versión del formato, títulos, colores, pie de página).
// Se guardan en la base de datos para que puedan cambiarse desde el panel sin tocar el código.

export const PDF_DOC_KINDS = [
  { key: 'disc', label: 'Informe DISC', defaultTitle: 'Informe DISC · Perfil de comportamiento' },
  { key: 'valanti', label: 'Informe VALANTI', defaultTitle: 'Informe VALANTI · Valores y actitudes' },
  { key: 'pf16', label: '16PF · Hoja de respuestas', defaultTitle: '16PF · Hoja de respuestas' },
  { key: 'acrofobia', label: 'Informe de Acrofobia (Cohen)', defaultTitle: 'Informe de acrofobia · Cuestionario de Cohen' },
  { key: 'claustrofobia', label: 'Informe de Claustrofobia (CLQ)', defaultTitle: 'Informe de claustrofobia · CLQ' },
] as const;
export type PdfDocKind = (typeof PDF_DOC_KINDS)[number]['key'];

export interface PdfDocSetting {
  /** Código del formato en el sistema documental (p. ej. FP-PS-XX). Vacío = «POR ASIGNAR». */
  code: string;
  version: string;
  title: string;
}

export interface PdfSettings {
  /** Color principal (encabezados, barras, títulos de sección), en hexadecimal #RRGGBB. */
  accent: string;
  /** Color secundario (fondos suaves, líneas). */
  accentSoft: string;
  showLogo: boolean;
  /** Texto del pie de todas las páginas (a la izquierda). */
  footer: string;
  docs: Record<PdfDocKind, PdfDocSetting>;
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  accent: '#0B5C7A',
  accentSoft: '#E3F0F5',
  showLogo: true,
  footer: 'Confidencial — uso exclusivo del profesional responsable',
  docs: Object.fromEntries(PDF_DOC_KINDS.map((d) => [d.key, { code: '', version: '01', title: d.defaultTitle }])) as Record<PdfDocKind, PdfDocSetting>,
};

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Mezcla lo guardado sobre los valores por defecto, descartando lo inválido. */
export function mergePdfSettings(raw: unknown): PdfSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PdfSettings>;
  const docs = { ...DEFAULT_PDF_SETTINGS.docs };
  for (const d of PDF_DOC_KINDS) {
    const v = (r.docs as Record<string, Partial<PdfDocSetting>> | undefined)?.[d.key];
    if (v) docs[d.key] = { code: typeof v.code === 'string' ? v.code.slice(0, 30) : docs[d.key].code, version: typeof v.version === 'string' && v.version ? v.version.slice(0, 10) : docs[d.key].version, title: typeof v.title === 'string' && v.title.trim() ? v.title.slice(0, 120) : docs[d.key].title };
  }
  return {
    accent: isHexColor(r.accent) ? r.accent : DEFAULT_PDF_SETTINGS.accent,
    accentSoft: isHexColor(r.accentSoft) ? r.accentSoft : DEFAULT_PDF_SETTINGS.accentSoft,
    showLogo: typeof r.showLogo === 'boolean' ? r.showLogo : true,
    footer: typeof r.footer === 'string' && r.footer.trim() ? r.footer.slice(0, 160) : DEFAULT_PDF_SETTINGS.footer,
    docs,
  };
}
