import { useEffect, useState } from 'react';
import type { ConsentBlock } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import { ConsentHeader, type ConsentHeaderData } from './ConsentHeader';
import type { FlowState } from './Flow';

interface ConsentInfo {
  version: string;
  date: string;
  hash: string;
  /** Documentos que aplican a la campaña (batería psicosocial y/o evaluación ocupacional) y opciones de decisión. */
  docs: { id: string; title: string; blocks: ConsentBlock[]; header: ConsentHeaderData | null }[];
  options: { lead: string; authorize: string; decline: string };
  company: string;
  addenda: { id: string; title: string; paragraphs: string[] }[];
  fullName: string;
  document: string;
}

/** Consentimiento informado FP-PS-CI. Nada más se muestra antes de decidir. */
export function Consent({ onDone }: { onDone: (s: FlowState) => void }) {
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [choice, setChoice] = useState<'authorized' | 'declined' | ''>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ConsentInfo>('GET', '/api/participation/consent').then(setInfo).catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el documento.'));
  }, []);

  const today = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const submit = async () => {
    if (!info || !choice) return;
    if (choice === 'declined' && !window.confirm('Si no autorizas, no podrás responder las pruebas. ¿Confirmas tu decisión?')) return;
    setBusy(true);
    setError('');
    try {
      onDone(await api<FlowState>('POST', '/api/participation/consent', { decision: choice, hash: info.hash }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar tu decisión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="t">
      <h1 id="t">Consentimiento informado</h1>
      <p className="muted">{info ? `Código ${info.version} · Versión vigente al ${info.date}.` : ''} Lee el documento completo antes de decidir.</p>
      {info && (
        <dl className="idbox">
          <div><dt>Fecha de diligenciamiento</dt><dd>{today}</dd></div>
          <div><dt>Nombres y apellidos</dt><dd>{info.fullName}</dd></div>
          <div><dt>N.° de identificación</dt><dd>{info.document}</dd></div>
        </dl>
      )}
      <div className="doc" role="region" aria-label="Texto del consentimiento informado" tabIndex={0}>
        {info?.docs.map((d) => (
          <div key={d.id}>
            {d.header && <ConsentHeader header={d.header} />}
            <p><strong>{d.title}</strong></p>
            {d.blocks.map((b, i) => {
              const text = b.text.replace('{empresa}', info.company || '________________');
              return b.kind === 'h' ? <h2 key={i}>{text}</h2> : b.kind === 'li' ? <ul key={i}><li>{text}</li></ul> : <p key={i}>{text}</p>;
            })}
          </div>
        ))}
        {info?.addenda.map((a) => (
          <div key={a.id}>
            <h2>{a.title}</h2>
            {a.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
          </div>
        ))}
      </div>
      <fieldset className="plain">
        <legend><strong>{info?.options.lead ?? 'Manifiesto que:'}</strong></legend>
        <label className="check opt"><input type="radio" name="consent" checked={choice === 'authorized'} onChange={() => setChoice('authorized')} disabled={!info} /> {info?.options.authorize}</label>
        <label className="check opt"><input type="radio" name="consent" checked={choice === 'declined'} onChange={() => setChoice('declined')} disabled={!info} /> {info?.options.decline}</label>
      </fieldset>
      <p className="hint">Puedes revocar tu consentimiento en cualquier momento informando tu decisión al profesional responsable del proceso.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="btn block" disabled={!choice || busy || !info} onClick={submit}>{busy ? 'Guardando…' : 'Continuar'}</button>
    </section>
  );
}
