import { useEffect, useMemo, useRef, useState } from 'react';
import { applicableItems, type Gate, type Item, type QuestionnaireDef } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import { usePrefs } from '../prefs';
import type { FlowState } from './Flow';
import { Loading } from '../BrandLoader';

type Gates = { clients?: boolean; boss?: boolean };
interface Page {
  headings: string[];
  items: Item[];
  gate?: Gate;
}

/** Divide el cuestionario en páginas siguiendo los encabezados de sección del instrumento. */
function buildPages(def: QuestionnaireDef, focus: boolean): Page[] {
  const starts = new Set<number>([1, ...def.headings.map((h) => h.before), ...def.gates.map((g) => g.first)]);
  if (!def.headings.length) for (let n = 9; n <= def.items.length; n += 8) starts.add(n);
  const sorted = [...starts].sort((a, b) => a - b);
  const pages: Page[] = [];
  sorted.forEach((s, i) => {
    const end = (sorted[i + 1] ?? def.items.length + 1) - 1;
    const items = def.items.filter((it) => it.n >= s && it.n <= end);
    if (!items.length) return;
    const gate = def.gates.find((g) => s >= g.first && end <= g.last);
    pages.push({ headings: def.headings.filter((h) => h.before === s).map((h) => h.text), items, gate });
  });
  if (!focus) return pages;
  // Lectura enfocada: una pregunta por pantalla (las compuertas siguen mostrándose antes de sus preguntas).
  return pages.flatMap((p) =>
    p.gate ? [{ ...p, items: [] }, ...p.items.map((it) => ({ headings: p.headings, items: [it], gate: p.gate }))] : p.items.map((it, i) => ({ headings: i === 0 ? p.headings : [], items: [it], gate: undefined })),
  );
}

export function Questionnaire({ id, def, onDone }: { id: string; def: QuestionnaireDef; onDone: (s: FlowState) => void }) {
  const { prefs } = usePrefs();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [gates, setGates] = useState<Gates>({});
  const [loaded, setLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [gateMissing, setGateMissing] = useState(false);
  const [saved, setSaved] = useState<'' | 'saving' | 'saved'>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const pages = useMemo(() => buildPages(def, prefs.focusReading), [def, prefs.focusReading]);
  const applicable = useMemo(() => applicableItems(def, gates), [def, gates]);
  const answeredCount = applicable.filter((it) => answers[it.n] !== undefined).length;

  useEffect(() => {
    api<{ data: { answers: Record<string, number>; gates: Gates } }>('GET', `/api/participation/questionnaires/${id}`)
      .then((r) => {
        const a = Object.fromEntries(Object.entries(r.data.answers).map(([k, v]) => [Number(k), v]));
        setAnswers(a);
        setGates(r.data.gates);
        if (Object.keys(a).length) setStarted(true);
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el cuestionario.'));
  }, [id]);

  // Al volver a entrar, se retoma en la primera página con preguntas por responder.
  const resumed = useRef(false);
  useEffect(() => {
    if (!loaded || resumed.current || !started) return;
    resumed.current = true;
    const i = pages.findIndex((p) => (p.gate && gates[p.gate.key] === undefined) || visibleItems(p, gates).some((it) => answers[it.n] === undefined));
    setPageIdx(i < 0 ? 0 : i);
  }, [loaded, started, pages, gates, answers]);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaved('saving');
      try {
        await api('PUT', `/api/participation/questionnaires/${id}`, { answers, gates, complete: false });
        setSaved('saved');
      } catch {
        setSaved('');
      }
    }, 700);
    return () => window.clearTimeout(timer.current);
  }, [answers, gates, loaded, id]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [pageIdx, started]);

  const setAnswer = (n: number, v: number) => {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [n]: v }));
    setMissing((m) => {
      const s = new Set(m);
      s.delete(n);
      return s;
    });
  };
  const setGate = (key: Gate['key'], v: boolean) => {
    dirty.current = true;
    setGates((g) => ({ ...g, [key]: v }));
    setGateMissing(false);
  };

  if (error && !loaded) return <div className="alert error" role="alert">{error}</div>;
  if (!loaded) return <Loading />;

  if (!started) {
    return (
      <section className="card" aria-labelledby="t">
        <h1 id="t" ref={titleRef} tabIndex={-1}>{def.title}</h1>
        <h2>Instrucciones</h2>
        {def.instructions.map((p, i) => <p key={i}>{p}</p>)}
        <p className="hint">En esta versión digital, haz clic en la opción que elijas. Puedes cambiarla mientras no cierres el cuestionario. Tu avance se guarda automáticamente.</p>
        <button className="btn block" onClick={() => setStarted(true)}>Comenzar</button>
      </section>
    );
  }

  const page = pages[pageIdx]!;
  const isLast = pageIdx === pages.length - 1;
  const shown = visibleItems(page, gates);

  const validatePage = (): boolean => {
    const miss = shown.filter((it) => answers[it.n] === undefined).map((it) => it.n);
    const gateMiss = !!page.gate && gates[page.gate.key] === undefined;
    setMissing(new Set(miss));
    setGateMissing(gateMiss);
    if (miss.length || gateMiss) {
      setError(gateMiss ? 'Responde la pregunta Sí / No para continuar.' : `Falta responder ${miss.length} pregunta(s) de esta página.`);
      const target = gateMiss ? 'gate' : `it${miss[0]}`;
      window.requestAnimationFrame(() => (window.document.querySelector(`#${target} input`) as HTMLElement | null)?.focus());
      return false;
    }
    setError('');
    return true;
  };

  const next = async () => {
    if (!validatePage()) return;
    if (!isLast) {
      setPageIdx(pageIdx + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    try {
      onDone(await api<FlowState>('PUT', `/api/participation/questionnaires/${id}`, { answers, gates, complete: true }));
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.data?.missing) && e.data.missing.length) {
        const first = e.data.missing[0] as number;
        setPageIdx(Math.max(0, pages.findIndex((p) => p.items.some((it) => it.n === first))));
        setMissing(new Set<number>(e.data.missing));
      }
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="t">
      <h1 id="t" ref={titleRef} tabIndex={-1} className="small-title">{def.title}</h1>
      <div className="progress">
        <progress max={applicable.length} value={answeredCount} aria-label="Progreso del cuestionario" />
        <span>{answeredCount} de {applicable.length} respondidas · Página {pageIdx + 1} de {pages.length}</span>
      </div>
      {page.headings.map((h) => <p key={h} className="section-note">{h}</p>)}
      {page.gate && (
        <fieldset className="item" id="gate" aria-describedby={gateMissing ? 'gate-err' : undefined}>
          <legend>{page.gate.prompt}</legend>
          <div className="seg wrap">
            <label><input type="radio" name="gate" checked={gates[page.gate.key] === true} onChange={() => setGate(page.gate!.key, true)} /><span>Sí</span></label>
            <label><input type="radio" name="gate" checked={gates[page.gate.key] === false} onChange={() => setGate(page.gate!.key, false)} /><span>No</span></label>
          </div>
          {gateMissing && <p className="field-error" id="gate-err">Selecciona Sí o No.</p>}
          {gates[page.gate.key] === false && <p className="hint">Como respondiste «No», pasa a la siguiente sección.</p>}
        </fieldset>
      )}
      {shown.map((it) => (
        <fieldset className={`item${missing.has(it.n) ? ' missing' : ''}`} id={`it${it.n}`} key={it.n} aria-describedby={missing.has(it.n) ? `er${it.n}` : undefined}>
          <legend><span className="qn">{it.n}.</span> {it.t}</legend>
          <div className="seg wrap scale">
            {def.scale.map((label, idx) => (
              <label key={label}>
                <input type="radio" name={`it${it.n}`} checked={answers[it.n] === idx} onChange={() => setAnswer(it.n, idx)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {missing.has(it.n) && <p className="field-error" id={`er${it.n}`}>Responde esta pregunta.</p>}
        </fieldset>
      ))}
      <p className="status" role="status" aria-live="polite">{saved === 'saving' ? 'Guardando…' : saved === 'saved' ? 'Avance guardado ✓' : ''}</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="nav">
        <button className="btn secondary" disabled={pageIdx === 0 || busy} onClick={() => { setError(''); setPageIdx(pageIdx - 1); window.scrollTo({ top: 0 }); }}>Anterior</button>
        <button className="btn" disabled={busy} onClick={() => void next()}>{isLast ? (busy ? 'Guardando…' : 'Terminar cuestionario') : 'Siguiente'}</button>
      </div>
    </section>
  );
}

function visibleItems(p: Page, gates: Gates): Item[] {
  return p.gate && gates[p.gate.key] !== true ? [] : p.items;
}
