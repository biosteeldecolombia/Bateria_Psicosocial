import { useEffect, useRef, useState } from 'react';
import { FICHA, FICHA_INTRO, validateFicha, type FichaAnswers, type FichaQuestion } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import type { FlowState } from './Flow';
import { Loading } from '../BrandLoader';

type Errors = Record<number, string>;

/** Quita de la copia a guardar las respuestas que aún no son válidas (p. ej. un año a medio escribir). */
function savable(data: FichaAnswers): FichaAnswers {
  const errs = validateFicha(data, false);
  return Object.fromEntries(Object.entries(data).filter(([k]) => !errs[Number(k)]));
}

export function Ficha({ onDone }: { onDone: (s: FlowState) => void }) {
  const [data, setData] = useState<FichaAnswers>({});
  const [document, setDocument] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState<'' | 'saving' | 'saved'>('');
  const [busy, setBusy] = useState(false);
  const [topError, setTopError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  useEffect(() => {
    api<{ data: FichaAnswers; document: string }>('GET', '/api/participation/ficha')
      .then((r) => {
        setData(r.data);
        setDocument(r.document);
        setLoaded(true);
      })
      .catch((e) => setTopError(e instanceof ApiError ? e.message : 'No se pudo cargar la ficha.'));
  }, []);

  // Guardado automático (borrador cifrado en el servidor)
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaved('saving');
      try {
        await api('PUT', '/api/participation/ficha', { data: savable(data), complete: false });
        setSaved('saved');
      } catch {
        setSaved('');
      }
    }, 800);
    return () => window.clearTimeout(timer.current);
  }, [data, loaded]);

  const set = (n: number, v: FichaAnswers[string] | undefined) => {
    dirty.current = true;
    setData((d) => {
      const next = { ...d };
      if (v === undefined || v === '') delete next[String(n)];
      else next[String(n)] = v;
      return next;
    });
    setErrors((e) => {
      const { [n]: _drop, ...rest } = e;
      return rest;
    });
  };

  const finish = async () => {
    const errs = validateFicha(data, true);
    setErrors(errs);
    const first = Object.keys(errs).map(Number).sort((a, b) => a - b)[0];
    if (first !== undefined) {
      setTopError(`Hay ${Object.keys(errs).length} pregunta(s) por completar o corregir.`);
      window.document.getElementById(`q${first}`)?.scrollIntoView({ block: 'center' });
      (window.document.querySelector(`#q${first} input`) as HTMLElement | null)?.focus();
      return;
    }
    setTopError('');
    setBusy(true);
    try {
      onDone(await api<FlowState>('PUT', '/api/participation/ficha', { data, complete: true }));
    } catch (e) {
      setTopError(e instanceof ApiError ? e.message : 'No se pudo guardar la ficha.');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return topError ? <p role="status">{topError}</p> : <Loading />;

  return (
    <section className="card" aria-labelledby="t">
      <h1 id="t">Ficha de datos generales</h1>
      {FICHA_INTRO.map((p) => <p key={p} className="muted">{p}</p>)}
      <dl className="idbox"><div><dt>Número de identificación del respondiente (ID)</dt><dd>{document}</dd></div></dl>
      <form onSubmit={(e) => { e.preventDefault(); void finish(); }} noValidate>
        {FICHA.map((q) => <Question key={q.n} q={q} value={data[String(q.n)]} error={errors[q.n]} onChange={(v) => set(q.n, v)} />)}
        <p className="status" role="status" aria-live="polite">{saved === 'saving' ? 'Guardando…' : saved === 'saved' ? 'Avance guardado ✓' : ''}</p>
        {topError && <div className="alert error" role="alert">{topError}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y continuar'}</button>
      </form>
    </section>
  );
}

function Question({ q, value, error, onChange }: { q: FichaQuestion; value: FichaAnswers[string] | undefined; error?: string; onChange: (v: FichaAnswers[string] | undefined) => void }) {
  const errId = `e${q.n}`;
  const head = <span><span className="qn">{q.n}.</span> {q.label}</span>;
  const err = error ? <p className="field-error" id={errId} role="alert">{error}</p> : null;
  const common = { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errId : undefined } as const;
  const txt = (v: unknown) => (typeof v === 'string' ? v : '');

  return (
    <div className="q" id={`q${q.n}`}>
      {q.type === 'single' ? (
        <fieldset className="plain" {...common}>
          <legend>{head}</legend>
          <div className="seg wrap">
            {q.options.map((o) => (
              <label key={o}>
                <input type="radio" name={`f${q.n}`} checked={value === o} onChange={() => onChange(o)} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          {err}
        </fieldset>
      ) : q.type === 'place' ? (
        <fieldset className="plain" {...common}>
          <legend>{head}</legend>
          <div className="two">
            <div><label htmlFor={`c${q.n}`}>Ciudad / municipio</label><input id={`c${q.n}`} type="text" value={txt((value as { city?: string } | undefined)?.city)} onChange={(e) => onChange({ city: e.target.value, department: txt((value as { department?: string } | undefined)?.department) })} /></div>
            <div><label htmlFor={`d${q.n}`}>Departamento</label><input id={`d${q.n}`} type="text" value={txt((value as { department?: string } | undefined)?.department)} onChange={(e) => onChange({ city: txt((value as { city?: string } | undefined)?.city), department: e.target.value })} /></div>
          </div>
          {err}
        </fieldset>
      ) : q.type === 'years' ? (
        <fieldset className="plain" {...common}>
          <legend>{head}</legend>
          <label className="check"><input type="radio" name={`y${q.n}`} checked={(value as { lessThanYear?: boolean } | undefined)?.lessThanYear === true} onChange={() => onChange({ lessThanYear: true })} /> {q.lessThanYear}</label>
          <label className="check">
            <input type="radio" name={`y${q.n}`} checked={(value as { lessThanYear?: boolean } | undefined)?.lessThanYear === false} onChange={() => onChange({ lessThanYear: false })} /> {q.moreThanYear}
          </label>
          {(value as { lessThanYear?: boolean } | undefined)?.lessThanYear === false && (
            <>
              <label htmlFor={`n${q.n}`}>Años</label>
              <input id={`n${q.n}`} type="text" inputMode="numeric" className="short" value={String((value as { years?: number }).years ?? '')} onChange={(e) => onChange({ lessThanYear: false, ...(e.target.value === '' ? {} : { years: Number(e.target.value.replace(/\D/g, '')) }) })} />
            </>
          )}
          {err}
        </fieldset>
      ) : (
        <div {...common}>
          <label htmlFor={`i${q.n}`}>{head}</label>
          {q.type === 'number' ? (
            <div className="inline">
              <input id={`i${q.n}`} type="text" inputMode="numeric" className="short" value={typeof value === 'number' ? String(value) : ''} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined} onChange={(e) => { const t = e.target.value.replace(/\D/g, ''); onChange(t === '' ? undefined : Number(t)); }} />
              {q.suffix && <span>{q.suffix}</span>}
            </div>
          ) : (
            <input id={`i${q.n}`} type="text" maxLength={q.max} value={txt(value)} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined} onChange={(e) => onChange(e.target.value)} />
          )}
          {err}
        </div>
      )}
    </div>
  );
}
