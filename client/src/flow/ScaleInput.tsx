import { useCallback, useEffect, useState } from 'react';

/**
 * Formas de responder una escala. Todas guardan el MISMO valor (el índice de la opción) y muestran siempre el texto exacto de la
 * opción elegida; solo cambia cómo se ve. «auto» alterna la forma de una página a otra para que no se sienta repetitivo.
 */
export type AnswerMode = 'auto' | 'buttons' | 'compact' | 'slider' | 'stars' | 'meter' | 'faces';
type Concrete = Exclude<AnswerMode, 'auto'>;

export const ANSWER_MODES: { key: AnswerMode; label: string }[] = [
  { key: 'auto', label: 'Variada (recomendada)' },
  { key: 'buttons', label: 'Botones con texto' },
  { key: 'compact', label: 'Escala numerada' },
  { key: 'slider', label: 'Deslizador' },
  { key: 'stars', label: 'Estrellas' },
  { key: 'meter', label: 'Medidor' },
  { key: 'faces', label: 'Caritas' },
];

const KEY = 'sanithelp.answerMode';
// La primera página usa botones (se aprende cómo responder) y luego se alterna.
const CYCLE: Concrete[] = ['buttons', 'stars', 'slider', 'compact', 'meter'];
const FACES: Record<number, string[]> = { 3: ['😀', '😐', '😞'], 4: ['😀', '🙂', '🙁', '😞'], 5: ['😀', '🙂', '😐', '🙁', '😞'] };

export function useAnswerMode(): [AnswerMode, (m: AnswerMode) => void] {
  const [mode, setMode] = useState<AnswerMode>(() => {
    try {
      const v = localStorage.getItem(KEY) as AnswerMode | null;
      return v && ANSWER_MODES.some((m) => m.key === v) ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  const set = useCallback((m: AnswerMode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* sin almacenamiento local: vale solo para esta visita */
    }
  }, []);
  return [mode, set];
}

/** Forma concreta para una página: la elegida, o una de la rotación si es «auto». */
export function resolveMode(mode: AnswerMode, pageIdx: number, count: number): Concrete {
  let m: Concrete = mode === 'auto' ? CYCLE[pageIdx % CYCLE.length]! : mode;
  if (m === 'faces' && !FACES[count]) m = 'compact';
  if ((m === 'stars' || m === 'meter') && count > 7) m = 'compact';
  return m;
}

export function AnswerModePicker({ mode, onChange }: { mode: AnswerMode; onChange: (m: AnswerMode) => void }) {
  return (
    <div className="mode-picker">
      <label htmlFor="answer-mode">Forma de responder</label>
      <select id="answer-mode" value={mode} onChange={(e) => onChange(e.target.value as AnswerMode)}>
        {ANSWER_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
    </div>
  );
}

/** Escala de respuesta de una pregunta. `labels[i]` es el texto exacto de la opción i (0 = primera). */
export function ScaleInput({ name, labels, value, onChange, mode }: { name: string; labels: readonly string[]; value: number | undefined; onChange: (v: number) => void; mode: Concrete }) {
  const n = labels.length;
  const chosen = value !== undefined ? labels[value] : undefined;

  if (mode === 'buttons') {
    return (
      <div className="seg wrap scale">
        {labels.map((label, idx) => (
          <label key={idx}>
            <input type="radio" name={name} checked={value === idx} onChange={() => onChange(idx)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (mode === 'slider') return <Slider name={name} labels={labels} value={value} onChange={onChange} />;

  // Escalas de opciones visuales (numeradas, estrellas, medidor, caritas): todas son radios con el texto exacto como nombre accesible.
  const reversed = mode === 'stars' || mode === 'meter'; // más estrellas = la primera opción (p. ej. «Siempre»)
  const order = labels.map((_, i) => i);
  if (reversed) order.reverse();
  const glyph = (idx: number, pos: number) => {
    if (mode === 'compact') return String(idx + 1);
    if (mode === 'faces') return FACES[n]![idx]!;
    const filled = value !== undefined && pos <= order.indexOf(value);
    return mode === 'stars' ? (filled ? '★' : '☆') : <span className={`meter-dot${filled ? ' on' : ''}`} aria-hidden="true" />;
  };
  return (
    <div className={`scale-visual mode-${mode}`}>
      <div className="scale-row" role="presentation">
        {order.map((idx, pos) => (
          <label key={idx} className={value === idx ? 'sel' : ''}>
            <input type="radio" name={name} checked={value === idx} onChange={() => onChange(idx)} />
            <span className="glyph" aria-hidden="true">{glyph(idx, pos)}</span>
            <span className="sr-only">{labels[idx]}</span>
          </label>
        ))}
      </div>
      <div className="scale-ends" aria-hidden="true">
        <span>{mode === 'compact' ? `1 = ${labels[0]}` : labels[order[0]!]}</span>
        <span>{mode === 'compact' ? `${n} = ${labels[n - 1]}` : labels[order[n - 1]!]}</span>
      </div>
      <p className="scale-picked" aria-live="polite">{chosen ? <>Elegiste: <strong>{chosen}</strong></> : <span className="muted">Toca una opción</span>}</p>
    </div>
  );
}

function Slider({ name, labels, value, onChange }: { name: string; labels: readonly string[]; value: number | undefined; onChange: (v: number) => void }) {
  const n = labels.length;
  const [touched, setTouched] = useState(value !== undefined);
  useEffect(() => setTouched(value !== undefined), [value]);
  const shown = value ?? Math.floor((n - 1) / 2);
  const commit = (v: number) => {
    setTouched(true);
    onChange(v);
  };
  return (
    <div className="scale-visual mode-slider">
      <input
        type="range"
        name={name}
        min={0}
        max={n - 1}
        step={1}
        value={shown}
        className={touched ? '' : 'unset'}
        aria-valuetext={touched ? labels[shown] : 'Sin responder'}
        onChange={(e) => commit(Number(e.target.value))}
        onClick={(e) => commit(Number(e.currentTarget.value))}
      />
      <div className="scale-ends" aria-hidden="true">
        <span>{labels[0]}</span>
        <span>{labels[n - 1]}</span>
      </div>
      <p className="scale-picked" aria-live="polite">{touched ? <>Elegiste: <strong>{labels[shown]}</strong></> : <span className="muted">Mueve el control o tócalo para elegir</span>}</p>
    </div>
  );
}
