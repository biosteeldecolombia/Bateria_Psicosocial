import { useCallback, useEffect, useRef, useState } from 'react';
import { QUESTIONNAIRES, type QuestionnaireId } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import { Consent } from './Consent';
import { Ficha } from './Ficha';
import { Questionnaire } from './Questionnaire';

export interface FlowState {
  status: 'in_progress' | 'completed' | 'declined' | 'revoked';
  consent: 'authorized' | 'declined' | 'revoked' | null;
  ficha: { complete: boolean };
  form: 'A' | 'B' | null;
  questionnaires: { id: QuestionnaireId; complete: boolean; answered: number; total: number }[];
  canSubmit: boolean;
}

const STEP_LABEL: Record<string, string> = {
  consent: 'Consentimiento',
  ficha: 'Datos generales',
  intra_A: 'Intralaboral',
  intra_B: 'Intralaboral',
  extra: 'Extralaboral',
  stress: 'Estrés',
  submit: 'Envío',
};

/** Flujo del colaborador: consentimiento → ficha → cuestionarios → envío. Nunca muestra puntajes. */
export function Flow({ onLeave }: { onLeave: () => void }) {
  const [state, setState] = useState<FlowState | null>(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api<FlowState>('GET', '/api/participation/state'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu avance.');
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Al cambiar de paso, el foco va al título para que los lectores de pantalla lo anuncien.
  const stepKey = state ? `${state.consent}-${state.ficha.complete}-${state.questionnaires.map((q) => +q.complete).join('')}-${state.status}` : '';
  useEffect(() => {
    titleRef.current?.focus();
  }, [stepKey]);

  if (error) return <div className="alert error" role="alert">{error}</div>;
  if (!state) return <p role="status">Cargando tu avance…</p>;

  if (submitted || state.status === 'completed') {
    return (
      <section className="card narrow" aria-labelledby="t">
        <h1 id="t" tabIndex={-1} ref={titleRef as never}>¡Gracias por responder!</h1>
        <p>Hemos recibido tus respuestas. La información es confidencial y será analizada por la psicóloga responsable.</p>
        <p className="muted">Por la confidencialidad del proceso, en esta aplicación no se muestran resultados. Si tienes dudas, comunícate con el profesional responsable.</p>
        <button className="btn block" onClick={onLeave}>Terminar</button>
      </section>
    );
  }
  if (state.status === 'declined') {
    return (
      <section className="card narrow" aria-labelledby="t">
        <h1 id="t" tabIndex={-1} ref={titleRef as never}>Gracias</h1>
        <p>Registramos que no autorizaste la aplicación de la batería. Respetamos tu decisión y no se mostrará ningún cuestionario.</p>
        <p className="muted">Si cambias de opinión, informa al profesional responsable del proceso.</p>
        <button className="btn block" onClick={onLeave}>Terminar</button>
      </section>
    );
  }
  if (state.status === 'revoked' || state.consent === 'revoked') {
    return (
      <section className="card narrow" aria-labelledby="t">
        <h1 id="t" tabIndex={-1} ref={titleRef as never}>Consentimiento revocado</h1>
        <p>Tu consentimiento fue revocado. Ya no es posible continuar con la aplicación.</p>
        <button className="btn block" onClick={onLeave}>Terminar</button>
      </section>
    );
  }

  const nextQ = state.questionnaires.find((q) => !q.complete);
  const steps: { key: string; done: boolean }[] = [
    { key: 'consent', done: state.consent === 'authorized' },
    { key: 'ficha', done: state.ficha.complete },
    ...(state.form ? state.questionnaires.map((q) => ({ key: q.id, done: q.complete })) : [{ key: 'intra_A', done: false }, { key: 'extra', done: false }, { key: 'stress', done: false }]),
    { key: 'submit', done: false },
  ];
  const currentKey = state.consent !== 'authorized' ? 'consent' : !state.ficha.complete ? 'ficha' : nextQ ? nextQ.id : 'submit';

  return (
    <>
      <nav aria-label="Progreso">
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.key} className={s.done ? 'done' : s.key === currentKey ? 'current' : ''} aria-current={s.key === currentKey ? 'step' : undefined}>
              <span className="n" aria-hidden="true">{s.done ? '✓' : i + 1}</span> {STEP_LABEL[s.key]}
              {s.done && <span className="sr-only"> (completado)</span>}
            </li>
          ))}
        </ol>
      </nav>
      <div tabIndex={-1} ref={titleRef} className="sr-only" style={{ outline: 'none' }}>Paso: {STEP_LABEL[currentKey]}</div>
      {currentKey === 'consent' && <Consent onDone={setState} />}
      {currentKey === 'ficha' && <Ficha onDone={setState} />}
      {nextQ && state.consent === 'authorized' && state.ficha.complete && <Questionnaire key={nextQ.id} id={nextQ.id} def={QUESTIONNAIRES[nextQ.id]} onDone={setState} />}
      {currentKey === 'submit' && <Submit state={state} onSubmitted={() => setSubmitted(true)} />}
    </>
  );
}

function Submit({ state, onSubmitted }: { state: FlowState; onSubmitted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className="card narrow" aria-labelledby="t">
      <h1 id="t">Revisión final</h1>
      <p>Completaste todas las secciones:</p>
      <ul>
        <li>Consentimiento informado</li>
        <li>Ficha de datos generales</li>
        {state.questionnaires.map((q) => <li key={q.id}>{QUESTIONNAIRES[q.id].title.replace(' — ', ' · ')}</li>)}
      </ul>
      <p className="muted">Al enviar no podrás cambiar tus respuestas.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button
        className="btn block"
        disabled={busy || !state.canSubmit}
        onClick={async () => {
          if (!window.confirm('¿Enviar tus respuestas? Después no podrás modificarlas.')) return;
          setBusy(true);
          try {
            await api('POST', '/api/participation/submit');
            onSubmitted();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'No se pudo enviar. Intenta de nuevo.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Enviando…' : 'Enviar respuestas'}
      </button>
    </section>
  );
}
