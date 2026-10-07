import { useEffect, useRef, useState } from 'react';
import { DISC_GROUPS, DISC_INSTRUCTIONS, DISC_TITLE, decodeDisc, encodeDisc } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import type { FlowState } from './Flow';

const PER_PAGE = 7;
type Pick = { mas?: number; menos?: number };

/** DISC: en cada grupo de cuatro palabras se elige la que MÁS y la que MENOS representa a la persona. */
export function DiscQuestionnaire({ onDone }: { onDone: (s: FlowState) => void }) {
  const [picks, setPicks] = useState<Record<number, Pick>>({});
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
  const pages = Math.ceil(DISC_GROUPS.length / PER_PAGE);

  useEffect(() => {
    api<{ data: { answers: Record<string, number> } }>('GET', '/api/participation/questionnaires/disc')
      .then((r) => {
        const p: Record<number, Pick> = {};
        for (const [k, v] of Object.entries(r.data.answers)) {
          const [mas, menos] = decodeDisc(v);
          p[Number(k)] = { mas, menos };
        }
        // Se retoma en la primera página con grupos sin completar.
        const first = DISC_GROUPS.findIndex((_, i) => !p[i + 1]);
        setPicks(p);
        if (Object.keys(p).length) {
          setStarted(true);
          setPage(Math.max(0, Math.floor((first < 0 ? 0 : first) / PER_PAGE)));
        }
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el cuestionario.'));
  }, []);

  const complete = (p: Pick) => p.mas !== undefined && p.menos !== undefined;
  const payload = () => Object.fromEntries(Object.entries(picks).filter(([, p]) => complete(p)).map(([g, p]) => [g, encodeDisc(p.mas!, p.menos!)]));

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaved('saving');
      try {
        await api('PUT', '/api/participation/questionnaires/disc', { answers: payload(), complete: false });
        setSaved('saved');
      } catch {
        setSaved('');
      }
    }, 700);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, loaded]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [page, started]);

  const choose = (group: number, kind: 'mas' | 'menos', idx: number) => {
    dirty.current = true;
    setPicks((all) => {
      const cur = { ...(all[group] ?? {}) };
      cur[kind] = idx;
      // Una misma palabra no puede ser MÁS y MENOS a la vez.
      const other = kind === 'mas' ? 'menos' : 'mas';
      if (cur[other] === idx) delete cur[other];
      return { ...all, [group]: cur };
    });
    setMissing((m) => {
      const s = new Set(m);
      s.delete(group);
      return s;
    });
  };

  if (error && !loaded) return <div className="alert error" role="alert">{error}</div>;
  if (!loaded) return <p role="status">Cargando…</p>;

  if (!started) {
    return (
      <section className="card" aria-labelledby="t">
        <h1 id="t" ref={titleRef} tabIndex={-1}>{DISC_TITLE}</h1>
        <h2>Instrucciones</h2>
        {DISC_INSTRUCTIONS.map((p, i) => <p key={i}>{p}</p>)}
        <button className="btn block" onClick={() => setStarted(true)}>Comenzar</button>
      </section>
    );
  }

  const from = page * PER_PAGE;
  const groups = DISC_GROUPS.map((g, i) => ({ g, n: i + 1 })).slice(from, from + PER_PAGE);
  const answered = Object.values(picks).filter(complete).length;
  const isLast = page === pages - 1;

  const next = async () => {
    const miss = groups.filter(({ n }) => !complete(picks[n] ?? {})).map(({ n }) => n);
    setMissing(new Set(miss));
    if (miss.length) {
      setError(`Falta responder ${miss.length} grupo(s) de esta página: marca una palabra MÁS y otra MENOS.`);
      window.requestAnimationFrame(() => (window.document.querySelector(`#g${miss[0]} input`) as HTMLElement | null)?.focus());
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
      onDone(await api<FlowState>('PUT', '/api/participation/questionnaires/disc', { answers: payload(), complete: true }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="t">
      <h1 id="t" ref={titleRef} tabIndex={-1} className="small-title">{DISC_TITLE}</h1>
      <div className="progress">
        <progress max={DISC_GROUPS.length} value={answered} aria-label="Progreso del cuestionario" />
        <span>{answered} de {DISC_GROUPS.length} grupos · Página {page + 1} de {pages}</span>
      </div>
      <p className="section-note">En cada grupo elige una palabra como MÁS (la que mejor te describe) y otra diferente como MENOS (la que menos te describe).</p>
      {groups.map(({ g, n }) => {
        const p = picks[n] ?? {};
        return (
          <fieldset className={`item${missing.has(n) ? ' missing' : ''}`} id={`g${n}`} key={n}>
            <legend><span className="qn">Grupo {n}</span></legend>
            <table className="table">
              <thead><tr><th scope="col">Palabra</th><th scope="col">MÁS</th><th scope="col">MENOS</th></tr></thead>
              <tbody>
                {g.map((word, idx) => (
                  <tr key={word}>
                    <th scope="row">{word}</th>
                    <td><input type="radio" name={`mas${n}`} aria-label={`Más: ${word}`} checked={p.mas === idx} onChange={() => choose(n, 'mas', idx)} /></td>
                    <td><input type="radio" name={`menos${n}`} aria-label={`Menos: ${word}`} checked={p.menos === idx} onChange={() => choose(n, 'menos', idx)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {missing.has(n) && <p className="field-error">Marca una palabra MÁS y otra MENOS.</p>}
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
