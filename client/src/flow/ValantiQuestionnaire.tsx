import { useEffect, useRef, useState } from 'react';
import { VALANTI_INSTRUCTIONS, VALANTI_PAIRS, VALANTI_PART1_COUNT, VALANTI_TITLE } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import type { FlowState } from './Flow';
import { Loading } from '../BrandLoader';

/** Páginas: parte 1 completa (preguntas 1 a 9) y parte 2 en dos páginas. */
const PAGES: [number, number][] = [[1, VALANTI_PART1_COUNT], [VALANTI_PART1_COUNT + 1, 20], [21, VALANTI_PAIRS.length]];
/** Puntos de la frase A; la B recibe 3 menos. */
const CHOICES = [3, 2, 1, 0];

/** VALANTI: en cada pareja de frases se reparten 3 puntos. */
export function ValantiQuestionnaire({ onDone }: { onDone: (s: FlowState) => void }) {
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
    api<{ data: { answers: Record<string, number> } }>('GET', '/api/participation/questionnaires/valanti')
      .then((r) => {
        const a = Object.fromEntries(Object.entries(r.data.answers).map(([k, v]) => [Number(k), v]));
        setAnswers(a);
        if (Object.keys(a).length) {
          setStarted(true);
          // Se retoma en la primera página con preguntas sin responder.
          const i = PAGES.findIndex(([f, l]) => Array.from({ length: l - f + 1 }, (_, k) => f + k).some((n) => a[n] === undefined));
          setPage(Math.max(0, i));
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
        await api('PUT', '/api/participation/questionnaires/valanti', { answers, complete: false });
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

  const choose = (n: number, a: number) => {
    dirty.current = true;
    setAnswers((all) => ({ ...all, [n]: a }));
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
        <h1 id="t" ref={titleRef} tabIndex={-1}>{VALANTI_TITLE}</h1>
        <h2>Instrucciones</h2>
        {[...VALANTI_INSTRUCTIONS.part1, ...VALANTI_INSTRUCTIONS.part2].map((p, i) => <p key={i}>{p}</p>)}
        <button className="btn block" onClick={() => setStarted(true)}>Comenzar</button>
      </section>
    );
  }

  const [first, last] = PAGES[page]!;
  const numbers = Array.from({ length: last - first + 1 }, (_, k) => first + k);
  const answered = Object.keys(answers).length;
  const isLast = page === PAGES.length - 1;
  const part1 = first <= VALANTI_PART1_COUNT;

  const next = async () => {
    const miss = numbers.filter((n) => answers[n] === undefined);
    setMissing(new Set(miss));
    if (miss.length) {
      setError(`Falta responder ${miss.length} pregunta(s) de esta página.`);
      window.requestAnimationFrame(() => (window.document.querySelector(`#v${miss[0]} input`) as HTMLElement | null)?.focus());
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
      onDone(await api<FlowState>('PUT', '/api/participation/questionnaires/valanti', { answers, complete: true }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="t">
      <h1 id="t" ref={titleRef} tabIndex={-1} className="small-title">{VALANTI_TITLE}</h1>
      <div className="progress">
        <progress max={VALANTI_PAIRS.length} value={answered} aria-label="Progreso del cuestionario" />
        <span>{answered} de {VALANTI_PAIRS.length} respondidas · Página {page + 1} de {PAGES.length}</span>
      </div>
      <p className="section-note">{(part1 ? VALANTI_INSTRUCTIONS.part1 : VALANTI_INSTRUCTIONS.part2)[0]}</p>
      {numbers.map((n) => {
        const [fa, fb] = VALANTI_PAIRS[n - 1]!;
        return (
          <fieldset className={`item${missing.has(n) ? ' missing' : ''}`} id={`v${n}`} key={n}>
            <legend><span className="qn">{n}.</span> Reparte 3 puntos entre estas dos frases</legend>
            <p><strong>A.</strong> {fa}</p>
            <p><strong>B.</strong> {fb}</p>
            <div className="seg wrap scale">
              {CHOICES.map((a) => (
                <label key={a}>
                  <input type="radio" name={`v${n}`} checked={answers[n] === a} onChange={() => choose(n, a)} />
                  <span>A {a} · B {3 - a}</span>
                </label>
              ))}
            </div>
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
