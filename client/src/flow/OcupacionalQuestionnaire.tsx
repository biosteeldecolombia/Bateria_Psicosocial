import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACROFOBIA_ANXIETY_SCALE,
  ACROFOBIA_AVOID_SCALE,
  ACROFOBIA_COUNT,
  ACROFOBIA_INSTRUCTIONS,
  ACROFOBIA_ITEMS,
  ACROFOBIA_TITLE,
  CLQ_INSTRUCTIONS,
  CLQ_ITEMS,
  CLQ_SCALE,
  CLQ_TITLE,
} from '@sanithelp/shared';
import { api, ApiError } from '../api';
import type { FlowState } from './Flow';
import { Loading } from '../BrandLoader';
import { AnswerModePicker, ScaleInput, resolveMode, useAnswerMode } from './ScaleInput';

type Kind = 'acrofobia' | 'claustrofobia';

interface Part {
  heading: string;
  instructions: readonly string[];
  items: readonly string[];
  scale: readonly string[];
  /** Número de respuesta guardada = offset + posición (desde 1). */
  offset: number;
}

const CONFIG: Record<Kind, { title: string; intro: readonly string[]; parts: Part[] }> = {
  acrofobia: {
    title: ACROFOBIA_TITLE,
    intro: ACROFOBIA_INSTRUCTIONS.anxiety,
    parts: [
      { heading: 'Parte I · Ansiedad', instructions: ACROFOBIA_INSTRUCTIONS.anxiety, items: ACROFOBIA_ITEMS, scale: ACROFOBIA_ANXIETY_SCALE, offset: 0 },
      { heading: 'Parte II · Evitación', instructions: ACROFOBIA_INSTRUCTIONS.avoid, items: ACROFOBIA_ITEMS, scale: ACROFOBIA_AVOID_SCALE, offset: ACROFOBIA_COUNT },
    ],
  },
  claustrofobia: {
    title: CLQ_TITLE,
    intro: CLQ_INSTRUCTIONS,
    parts: [{ heading: 'Situaciones', instructions: CLQ_INSTRUCTIONS, items: CLQ_ITEMS, scale: CLQ_SCALE, offset: 0 }],
  },
};

const PER_PAGE = 10;

/** Cuestionarios de una respuesta por situación en una escala corta: Acrofobia (Cohen) y Claustrofobia (CLQ). */
export function OcupacionalQuestionnaire({ kind, onDone }: { kind: Kind; onDone: (s: FlowState) => void }) {
  const cfg = CONFIG[kind];
  // Páginas: cada una con su parte y el rango de situaciones (índices desde 0).
  const pages = useMemo(
    () => cfg.parts.flatMap((part, pi) => Array.from({ length: Math.ceil(part.items.length / PER_PAGE) }, (_, k) => ({ pi, from: k * PER_PAGE, to: Math.min((k + 1) * PER_PAGE, part.items.length) }))),
    [cfg],
  );
  const total = cfg.parts.reduce((a, p) => a + p.items.length, 0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(0);
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<'' | 'saving' | 'saved'>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [answerMode, setAnswerMode] = useAnswerMode();
  const url = `/api/participation/questionnaires/${kind}`;

  const keysOf = (pg: (typeof pages)[number]) => Array.from({ length: pg.to - pg.from }, (_, k) => cfg.parts[pg.pi]!.offset + pg.from + k + 1);

  useEffect(() => {
    api<{ data: { answers: Record<string, number> } }>('GET', url)
      .then((r) => {
        const a = Object.fromEntries(Object.entries(r.data.answers).map(([k, v]) => [Number(k), v]));
        setAnswers(a);
        if (Object.keys(a).length) {
          setStarted(true);
          // Se retoma en la primera página con preguntas sin responder.
          const i = pages.findIndex((pg) => keysOf(pg).some((n) => a[n] === undefined));
          setPage(Math.max(0, i));
        }
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el cuestionario.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaved('saving');
      try {
        await api('PUT', url, { answers, complete: false });
        setSaved('saved');
      } catch {
        setSaved('');
      }
    }, 700);
    return () => window.clearTimeout(timer.current);
  }, [answers, loaded, url]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [page, started]);

  const choose = (n: number, v: number) => {
    dirty.current = true;
    setAnswers((all) => ({ ...all, [n]: v }));
    setMissing((m) => {
      const s = new Set(m);
      s.delete(n);
      return s;
    });
  };

  if (error && !loaded) return <div className="alert error" role="alert">{error}</div>;
  if (!loaded) return <Loading />;

  if (!started) {
    return (
      <section className="card" aria-labelledby="t">
        <h1 id="t" ref={titleRef} tabIndex={-1}>{cfg.title}</h1>
        <h2>Instrucciones</h2>
        {kind === 'acrofobia' ? (
          <>
            <p>El cuestionario tiene dos partes con las mismas 20 situaciones relacionadas con las alturas.</p>
            {[...ACROFOBIA_INSTRUCTIONS.anxiety, ...ACROFOBIA_INSTRUCTIONS.avoid].map((p, i) => <p key={i}>{p}</p>)}
          </>
        ) : cfg.intro.map((p, i) => <p key={i}>{p}</p>)}
        <button className="btn block" onClick={() => setStarted(true)}>Comenzar</button>
      </section>
    );
  }

  const pg = pages[page]!;
  const part = cfg.parts[pg.pi]!;
  const numbers = keysOf(pg);
  const answered = Object.keys(answers).length;
  const isLast = page === pages.length - 1;

  const next = async () => {
    const miss = numbers.filter((n) => answers[n] === undefined);
    setMissing(new Set(miss));
    if (miss.length) {
      setError(`Falta responder ${miss.length} pregunta(s) de esta página.`);
      window.requestAnimationFrame(() => (window.document.querySelector(`#o${miss[0]} input`) as HTMLElement | null)?.focus());
      return;
    }
    setError('');
    if (!isLast) {
      setPage(page + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    try {
      onDone(await api<FlowState>('PUT', url, { answers, complete: true }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="t">
      <h1 id="t" ref={titleRef} tabIndex={-1} className="small-title">{cfg.title}</h1>
      <div className="progress">
        <progress max={total} value={answered} aria-label="Progreso del cuestionario" />
        <span>{answered} de {total} respondidas · Página {page + 1} de {pages.length}</span>
      </div>
      <AnswerModePicker mode={answerMode} onChange={setAnswerMode} />
      {cfg.parts.length > 1 && <h2>{part.heading}</h2>}
      <p className="section-note">{part.instructions.join(' ')}</p>
      {numbers.map((n) => {
        const idx = n - part.offset;
        return (
          <fieldset className={`item${missing.has(n) ? ' missing' : ''}`} id={`o${n}`} key={n}>
            <legend><span className="qn">{idx}.</span> {part.items[idx - 1]}</legend>
            <ScaleInput name={`o${n}`} labels={part.scale.map((label, v) => `${v} · ${label}`)} value={answers[n]} onChange={(v) => choose(n, v)} mode={resolveMode(answerMode, page, part.scale.length)} />
            {missing.has(n) && <p className="field-error">Responde esta pregunta.</p>}
          </fieldset>
        );
      })}
      <p className="status" role="status" aria-live="polite">{saved === 'saving' ? 'Guardando…' : saved === 'saved' ? 'Avance guardado ✓' : ''}</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="nav">
        <button className="btn secondary" disabled={page === 0 || busy} onClick={() => { setError(''); setPage(page - 1); window.scrollTo({ top: 0 }); }}>Anterior</button>
        <button className="btn" disabled={busy} onClick={() => void next()}>{isLast ? (busy ? 'Guardando…' : 'Terminar cuestionario') : 'Siguiente'}</button>
      </div>
    </section>
  );
}
