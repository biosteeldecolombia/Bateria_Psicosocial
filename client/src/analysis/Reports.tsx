import { useState, type ReactNode } from 'react';

/** Etiquetas de la descripción del patrón DISC (en el orden en que se muestran). */
export const DISC_PATTERN_LABELS: [string, string][] = [
  ['emociones', 'Emociones'],
  ['meta', 'Meta'],
  ['juzga', 'Juzga a los demás por'],
  ['influye', 'Influye en los demás mediante'],
  ['valor', 'Su valor para la organización'],
  ['abusa', 'Abusa de'],
  ['presion', 'Bajo presión'],
  ['teme', 'Teme'],
  ['eficaz', 'Sería más eficaz si'],
];

/** Barra de puntaje con su valor escrito (nunca solo color). `min` y `max` son los extremos de la escala. */
export function ScoreBar({ label, value, min, max, text }: { label: string; value: number; min: number; max: number; text: string }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="scorebar">
      <span className="scorebar-label">{label}</span>
      <span className="scorebar-track" role="img" aria-label={`${label}: ${text}`}>
        <span className="scorebar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="scorebar-text">{text}</span>
    </div>
  );
}

/**
 * Fila de una persona con su informe desplegable debajo. `cells` son las celdas de datos; el informe se muestra
 * al pulsar «Ver informe» y ocupa todo el ancho de la tabla.
 */
export function ReportRow({ cells, actions, colSpan, children }: { cells: ReactNode; actions: ReactNode; colSpan: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        {cells}
        <td className="actions">
          <button className="btn secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Ocultar informe' : 'Ver informe'}</button>{' '}
          {actions}
        </td>
      </tr>
      {open && (
        <tr className="report-row">
          <td colSpan={colSpan}>
            <div className="report">{children}</div>
          </td>
        </tr>
      )}
    </>
  );
}
