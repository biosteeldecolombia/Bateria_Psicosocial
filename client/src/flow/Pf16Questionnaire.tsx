import { useEffect, useRef, useState } from 'react';
import { PF16_INSTRUCTIONS, PF16_ITEMS, PF16_LETTERS, PF16_TITLE } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import type { FlowState } from './Flow';
import { Loading } from '../BrandLoader';

const PER_PAGE = 20;
const PAGES = Math.ceil(PF16_ITEMS.length / PER_PAGE);

/** 16PF: cada cuestión tiene tres alternativas (A, B, C). */
export function Pf16Questionnaire({ onDone }: { onDone: (s: FlowState) => void }) {
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

  useEffect(() => {
    api<{ data: { answers: Record<string, number> } }>('GET', '/api/participation/questionnaires/pf16')
      .then((r) => {
        const a = Object.fromEntries(Object.entries(r.data.answers).map(([k, v]) => [Number(k), v]));
        setAnswers(a);
        if (Object.keys(a).length) {
          setStarted(true);
          const first = PF16_ITEMS.findIndex((_, i) => a[i + 1] === undefined);
          setPage(Math.max(0, Math.floor((first < 0 ? 0 : first) / PER_PAGE)));
        }
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el cuestionario.'));
  }, []);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaved('saving');
      try {
        await api('PUT', '/api/participation/questionnaires/pf16', { answers, complete: false });
        setSaved('saved');
      } catch {
        setSaved('');
      }
    }, 700);
    return () => window.clearTimeout(timer.current);
  }, [answers, loaded]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [page, started]);

  const choose = (n: number, k: number) => {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [n]: k }));
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
        <h1 id="t" ref={titleRef} tabIndex={-1}>{PF16_TITLE}</h1>
        <h2>Instrucciones</h2>
        {PF16_INSTRUCTIONS.map((p, i) => <p key={i}>{p}</p>)}
        <button className="btn block" onClick={() => setStarted(true)}>Comenzar</button>
      </section>
    );
  }

  const from = page * PER_PAGE;
  const items = PF16_ITEMS.map((it, i) => ({ it, n: i + 1 })).slice(from, from + PER_PAGE);
  const answered = Object.keys(answers).length;
  const isLast = page === PAGES - 1;

  const next = async () => {
    const miss = items.filter(({ n }) => answers[n] === undefined).map(({ n }) => n);
    setMissing(new Set(miss));
    if (miss.length) {
      setError(`Falta responder ${miss.length} cuestión(es) de esta página.`);
      window.requestAnimationFrame(() => (window.document.querySelector(`#p${miss[0]} input`) as HTMLElement | null)?.focus());
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
      onDone(await api<FlowState>('PUT', '/api/participation/questionnaires/pf16', { answers, complete: true }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="t">
      <h1 id="t" ref={titleRef} tabIndex={-1} className="small-title">{PF16_TITLE}</h1>
      <div className="progress">
        <progress max={PF16_ITEMS.length} value={answered} aria-label="Progreso del cuestionario" />
        <span>{answered} de {PF16_ITEMS.length} respondidas · Página {page + 1} de {PAGES}</span>
      </div>
      {items.map(({ it: [stem, opts], n }) => (
        <fieldset className={`item${missing.has(n) ? ' missing' : ''}`} id={`p${n}`} key={n}>
          <legend><span className="qn">{n}.</span> {stem}</legend>
          <div className="seg wrap">
            {opts.map((text, k) => (
              <label key={k}>
                <input type="radio" name={`p${n}`} checked={answers[n] === k} onChange={() => choose(n, k)} />
                <span>{PF16_LETTERS[k]}. {text}</span>
              </label>
            ))}
          </div>
          {missing.has(n) && <p className="field-error">Responde esta cuestión.</p>}
        </fieldset>
      ))}
      <p className="status" role="status" aria-live="polite">{saved === 'saving' ? 'Guardando…' : saved === 'saved' ? 'Avance guardado ✓' : ''}</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="nav">
        <button className="btn secondary" disabled={page === 0 || busy} onClick={() => { setError(''); setPage(page - 1); window.scrollTo({ top: 0 }); }}>Anterior</button>
        <button className="btn" disabled={busy} onClick={() => void next()}>{isLast ? (busy ? 'Guardando…' : 'Terminar cuestionario') : 'Siguiente'}</button>
      </div>
    </section>
  );
}
