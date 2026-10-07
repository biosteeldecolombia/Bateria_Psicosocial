import { useEffect, useState } from 'react';
import { CONSENT_BLOCKS, CONSENT_DATE, CONSENT_DECISION_LEAD, CONSENT_OPTIONS, CONSENT_TITLE, CONSENT_VERSION } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import type { FlowState } from './Flow';

interface ConsentInfo {
  version: string;
  hash: string;
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
    if (choice === 'declined' && !window.confirm('Si no autorizas, no podrás responder la batería. ¿Confirmas tu decisión?')) return;
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
      <p className="muted">Código {CONSENT_VERSION} · Versión vigente al {CONSENT_DATE}. Lee el documento completo antes de decidir.</p>
      {info && (
        <dl className="idbox">
          <div><dt>Fecha de diligenciamiento</dt><dd>{today}</dd></div>
          <div><dt>Nombres y apellidos</dt><dd>{info.fullName}</dd></div>
          <div><dt>N.° de identificación</dt><dd>{info.document}</dd></div>
        </dl>
      )}
      <div className="doc" role="region" aria-label="Texto del consentimiento informado" tabIndex={0}>
        <p><strong>{CONSENT_TITLE}</strong></p>
        {CONSENT_BLOCKS.map((b, i) =>
          b.kind === 'h' ? <h2 key={i}>{b.text}</h2> : b.kind === 'li' ? <ul key={i}><li>{b.text}</li></ul> : <p key={i}>{b.text}</p>,
        )}
        {info?.addenda.map((a) => (
          <div key={a.id}>
            <h2>{a.title}</h2>
            {a.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
          </div>
        ))}
      </div>
      <fieldset className="plain">
        <legend><strong>{CONSENT_DECISION_LEAD}</strong></legend>
        <label className="check opt"><input type="radio" name="consent" checked={choice === 'authorized'} onChange={() => setChoice('authorized')} /> {CONSENT_OPTIONS.authorize}</label>
        <label className="check opt"><input type="radio" name="consent" checked={choice === 'declined'} onChange={() => setChoice('declined')} /> {CONSENT_OPTIONS.decline}</label>
      </fieldset>
      <p className="hint">Puedes revocar tu consentimiento en cualquier momento informando tu decisión al profesional responsable del proceso.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="btn block" disabled={!choice || busy || !info} onClick={submit}>{busy ? 'Guardando…' : 'Continuar'}</button>
    </section>
  );
}
