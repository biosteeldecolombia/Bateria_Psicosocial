import { useEffect, useMemo, useState } from 'react';
import {
  ACROFOBIA_ITEMS,
  CLQ_ITEMS,
  CLQ_LEVELS,
  FORMATOS,
  FORMATO_GENERAL,
  type FormatoConcept,
  type FormatoData,
  type FormatoKind,
} from '@sanithelp/shared';
import { api, ApiError } from '../api';
import { downloadFile } from './BulkExport';
import { ScoreBar } from './Reports';
import { Loading } from '../BrandLoader';

interface AcroTest {
  type: 'acrofobia';
  anxiety: { total: number; level: string; answered: number };
  avoidance: { total: number; level: string; answered: number };
  items: { n: number; anxiety?: number; avoidance?: number }[];
}
interface ClqTest {
  type: 'clq';
  total: number;
  max: number;
  level: string | null;
  answers: (number | null)[];
}
interface FormatoResponse {
  kind: FormatoKind;
  participantId: string;
  person: { document: string; fullName: string };
  prefill: Record<string, string>;
  test: AcroTest | ClqTest;
  saved: { data: FormatoData; savedAt: string } | null;
}

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const snapshot = (v: Record<string, string>, f: Record<string, string>, c: string | null, q: string | null) => JSON.stringify([v, f, c, q]);

/**
 * Formato de evaluación psicológica ocupacional: a la izquierda los resultados del cuestionario de la persona; a la derecha,
 * el panel donde la psicóloga diligencia el formato según su entrevista (considerando esas respuestas) y descarga el PDF con su firma.
 */
export function FormatoView({ kind, participantId, qs, onBack }: { kind: FormatoKind; participantId: string; qs: (e?: string) => string; onBack: () => void }) {
  const spec = FORMATOS[kind];
  const [data, setData] = useState<FormatoResponse | null>(null);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [factors, setFactors] = useState<Record<string, string>>({});
  const [concept, setConcept] = useState<FormatoConcept | null>(null);
  const [clqLevel, setClqLevel] = useState<string | null>(null);
  const [savedSnap, setSavedSnap] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let off = false;
    api<FormatoResponse>('GET', `/api/participants/${participantId}/formatos/${kind}${qs()}`)
      .then((r) => {
        if (off) return;
        // Lo guardado manda; lo que falta se precarga desde la ficha.
        const v: Record<string, string> = {};
        for (const g of FORMATO_GENERAL) v[`general.${g.id}`] = r.saved?.data.values[`general.${g.id}`] ?? r.prefill[g.id] ?? '';
        for (const [k, val] of Object.entries(r.saved?.data.values ?? {})) if (!k.startsWith('general.')) v[k] = val;
        const lv = r.test.type === 'clq' ? r.test.level : null;
        setData(r);
        setValues(v);
        setFactors(r.saved?.data.factors ?? {});
        setConcept(r.saved?.data.concept ?? null);
        setClqLevel(lv);
        setSavedSnap(r.saved ? snapshot(v, r.saved.data.factors, r.saved.data.concept, lv) : null);
        setSavedAt(r.saved?.savedAt ?? null);
      })
      .catch((e) => !off && setError(e instanceof ApiError ? e.message : 'No se pudo cargar el formato.'));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, kind]);

  const dirty = useMemo(() => snapshot(values, factors, concept, clqLevel) !== savedSnap, [values, factors, concept, clqLevel, savedSnap]);

  if (error) return <><button className="btn secondary" onClick={onBack}>Volver</button><div className="alert error" role="alert" style={{ marginTop: '1rem' }}>{error}</div></>;
  if (!data) return <Loading />;

  const set = (k: string, v: string) => setValues((all) => ({ ...all, [k]: v }));
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api('PUT', `/api/participants/${participantId}/formatos/${kind}${qs()}`, { values, factors, concept, ...(kind === 'confinados' && clqLevel ? { clqLevel } : {}) });
      setSavedSnap(snapshot(values, factors, concept, clqLevel));
      setSavedAt(new Date().toISOString());
      setMsg('Formato guardado ✓');
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'No se pudo guardar el formato.');
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setDl(true);
    setMsg('');
    try {
      await downloadFile(`/api/participants/${participantId}/formatos/${kind}/pdf${qs()}`, `Formato_${spec.headerTitle.replace(/\s+/g, '_')}_${data.person.document}.pdf`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setDl(false);
    }
  };

  const textarea = (key: string, label: string, rows = 2) => (
    <div key={key}>
      <label htmlFor={`fm-${key}`}>{label}</label>
      <textarea id={`fm-${key}`} rows={rows} maxLength={2000} value={values[key] ?? ''} onChange={(e) => set(key, e.target.value)} style={{ width: '100%' }} />
    </div>
  );

  const test = data.test;
  return (
    <>
      <div className="row-between">
        <button className="btn secondary" onClick={onBack}>← Volver al listado</button>
        <span className="muted">{savedAt ? `Guardado el ${fmtDateTime(savedAt)}` : 'Aún sin guardar'}</span>
      </div>
      <h3 style={{ margin: '1rem 0 0.25rem' }}>{spec.tabLabel.replace('Formato · ', 'Formato de evaluación · ')}</h3>
      <p className="muted">{data.person.fullName} · Documento {data.person.document}</p>
      <div className="formato-grid">
        <section aria-label="Resultados del cuestionario">
          <h4>Resultados del cuestionario</h4>
          {test.type === 'acrofobia' ? (
            <>
              <ScoreBar label="Ansiedad" value={test.anxiety.total} min={0} max={120} text={`${test.anxiety.total} de 120 · ${test.anxiety.level}`} />
              <ScoreBar label="Evitación" value={test.avoidance.total} min={0} max={40} text={`${test.avoidance.total} de 40 · ${test.avoidance.level}`} />
              <div className="scroll" tabIndex={0} role="region" aria-label="Respuestas por situación (desplázala con las flechas del teclado)">
                <table className="table">
                  <caption className="sr-only">Respuestas del cuestionario de Acrofobia</caption>
                  <thead><tr><th scope="col">N.°</th><th scope="col">Situación</th><th scope="col">Ansiedad (0-6)</th><th scope="col">Evitación (0-2)</th></tr></thead>
                  <tbody>
                    {test.items.map((it) => <tr key={it.n}><td>{it.n}</td><td>{ACROFOBIA_ITEMS[it.n - 1]}</td><td><strong>{it.anxiety ?? '—'}</strong></td><td><strong>{it.avoidance ?? '—'}</strong></td></tr>)}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <ScoreBar label="Puntaje CLQ" value={test.total} min={0} max={test.max} text={`${test.total} de ${test.max}`} />
              <p className="muted">El CLQ no trae puntos de corte: la interpretación la marcas tú en el panel.</p>
              <div className="scroll" tabIndex={0} role="region" aria-label="Respuestas por situación (desplázala con las flechas del teclado)">
                <table className="table">
                  <caption className="sr-only">Respuestas del test CLQ</caption>
                  <thead><tr><th scope="col">N.°</th><th scope="col">Situación</th><th scope="col">Malestar (0-4)</th></tr></thead>
                  <tbody>
                    {CLQ_ITEMS.map((t, i) => <tr key={i}><td>{i + 1}</td><td>{t}</td><td><strong>{test.answers[i] ?? '—'}</strong></td></tr>)}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <aside className="formato-panel" aria-label="Formato de evaluación psicológica ocupacional">
          <h4>Formato de evaluación</h4>
          <p className="muted">Diligéncialo según tu entrevista con la persona, considerando también sus respuestas.</p>

          <fieldset className="plain"><legend><strong>Datos generales</strong></legend>
            {FORMATO_GENERAL.map((g) => (
              <div key={g.id}>
                <label htmlFor={`fm-general.${g.id}`}>{g.label}</label>
                <input id={`fm-general.${g.id}`} type="text" maxLength={2000} value={values[`general.${g.id}`] ?? ''} onChange={(e) => set(`general.${g.id}`, e.target.value)} />
              </div>
            ))}
          </fieldset>

          <fieldset className="plain"><legend><strong>Examen mental</strong></legend>
            {spec.mental.map((f) => textarea(`mental.${f.id}`, f.label))}
          </fieldset>

          <fieldset className="plain"><legend><strong>{spec.cognitiveTitle.charAt(0) + spec.cognitiveTitle.slice(1).toLowerCase()}</strong></legend>
            {spec.cognitive.map((f) => textarea(`cognitive.${f.id}`, f.label))}
          </fieldset>

          <fieldset className="plain"><legend><strong>Factores de riesgo psicológico</strong></legend>
            {spec.factors.map((f) => (
              <div key={f.id} className="row-between" role="radiogroup" aria-label={f.label} style={{ margin: '0.35rem 0' }}>
                <span>{f.label}</span>
                <span>
                  {(['yes', 'no'] as const).map((o) => (
                    <label key={o} className="check" style={{ display: 'inline-flex', marginLeft: '0.75rem' }}>
                      <input type="radio" name={`fm-f-${f.id}`} checked={factors[f.id] === o} onChange={() => setFactors((all) => ({ ...all, [f.id]: o }))} /> {o === 'yes' ? 'Sí' : 'No'}
                    </label>
                  ))}
                </span>
              </div>
            ))}
          </fieldset>

          {spec.observation && (
            <fieldset className="plain"><legend><strong>Observación conductual</strong></legend>
              {textarea('observation', 'Durante la evaluación se observa', 4)}
            </fieldset>
          )}

          {spec.clqResult && test.type === 'clq' && (
            <fieldset className="plain"><legend><strong>Resultados del test</strong></legend>
              <p>Puntaje total CLQ: <strong>{test.total}</strong></p>
              {CLQ_LEVELS.map(([k, label]) => (
                <label key={k} className="check opt"><input type="radio" name="fm-clq" checked={clqLevel === k} onChange={() => setClqLevel(k)} /> {label.replace('claustrophobia', 'claustrofobia')}</label>
              ))}
            </fieldset>
          )}

          <fieldset className="plain"><legend><strong>Concepto psicológico ocupacional</strong></legend>
            {(['apto', 'apto_rec', 'no_apto'] as const).map((k) => (
              <label key={k} className="check opt"><input type="radio" name="fm-concept" checked={concept === k} onChange={() => setConcept(k)} /> {spec.concept[k]}</label>
            ))}
          </fieldset>

          <p className="status" role="status" aria-live="polite">{msg || (dirty ? 'Hay cambios sin guardar.' : '')}</p>
          <div className="formato-actions">
            <button className="btn" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar formato'}</button>
            <button className="btn secondary" disabled={dl || dirty || !savedAt} title={dirty || !savedAt ? 'Guarda primero el formato' : undefined} onClick={() => void download()}>{dl ? 'Generando…' : 'Descargar PDF con firma'}</button>
          </div>
        </aside>
      </div>
    </>
  );
}
