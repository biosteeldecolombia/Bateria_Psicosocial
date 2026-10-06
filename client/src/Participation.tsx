import { useState } from 'react';
import type { MeResponse } from '@sanithelp/shared';
import { api, ApiError } from './api';
import { Flow } from './flow/Flow';

/** Pantalla del colaborador: se identifica con documento y nombre, o retoma con documento + código personal. */
export function Participation({ me, onMe }: { me: MeResponse; onMe: (m: MeResponse) => void }) {
  const [mode, setMode] = useState<'start' | 'resume'>('start');
  const [document, setDocument] = useState('');
  const [names, setNames] = useState('');
  const [surnames, setSurnames] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<{ code: string; me: MeResponse } | null>(null);
  const [noted, setNoted] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (newCode) {
    return (
      <section className="card narrow" aria-labelledby="t">
        <h1 id="t">Anota tu código personal</h1>
        <p>Con este código podrás <strong>retomar tu avance</strong> si cierras la página o cambias de equipo. Solo tú lo conoces y <strong>no se volverá a mostrar</strong>.</p>
        <p className="big-code" aria-label={`Tu código es ${newCode.code.split('').join(' ')}`}>{newCode.code}</p>
        <label className="check">
          <input type="checkbox" checked={noted} onChange={(e) => setNoted(e.target.checked)} /> Ya anoté mi código en un lugar seguro
        </label>
        <button className="btn block" disabled={!noted} onClick={() => { const m = newCode.me; setNewCode(null); onMe(m); }}>Continuar</button>
      </section>
    );
  }

  if (me.participant) {
    return <Flow onLeave={() => run(async () => onMe(await api('POST', '/api/participation/leave')))} />;
  }

  return (
    <section className="card narrow" aria-labelledby="t">
      <h1 id="t">Identifícate</h1>
      <p className="muted">{me.campaignName ? `Aplicación: ${me.campaignName}. ` : ''}Tu información es confidencial y solo la ve la psicóloga responsable.</p>
      <div className="seg" role="group" aria-label="¿Qué quieres hacer?">
        <label><input type="radio" name="mode" checked={mode === 'start'} onChange={() => { setMode('start'); setError(''); }} /><span>Es mi primera vez</span></label>
        <label><input type="radio" name="mode" checked={mode === 'resume'} onChange={() => { setMode('resume'); setError(''); }} /><span>Retomar mi avance</span></label>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (mode === 'start') {
              const r = await api<{ resumeCode: string; me: MeResponse }>('POST', '/api/participation/start', { document, names, surnames });
              setNewCode({ code: r.resumeCode, me: r.me });
            } else {
              onMe(await api('POST', '/api/participation/resume', { document, code }));
            }
          });
        }}
      >
        {error && <div className="alert error" role="alert">{error}</div>}
        <label htmlFor="doc">Número de documento de identidad</label>
        <input id="doc" type="text" inputMode="numeric" autoComplete="off" value={document} onChange={(e) => setDocument(e.target.value)} />
        {mode === 'start' ? (
          <>
            <label htmlFor="nm">Nombres</label>
            <input id="nm" type="text" autoComplete="off" value={names} onChange={(e) => setNames(e.target.value)} />
            <label htmlFor="sn">Apellidos</label>
            <input id="sn" type="text" autoComplete="off" value={surnames} onChange={(e) => setSurnames(e.target.value)} />
          </>
        ) : (
          <>
            <label htmlFor="cd">Código personal</label>
            <input id="cd" type="text" autoComplete="off" aria-describedby="cdh" value={code} onChange={(e) => setCode(e.target.value)} />
            <p id="cdh" className="hint">El que se te mostró la primera vez, con formato XXXX-XXXX.</p>
          </>
        )}
        <button className="btn block" disabled={busy || !document || (mode === 'start' ? (!names || !surnames) : !code)}>{mode === 'start' ? 'Empezar' : 'Retomar'}</button>
      </form>
    </section>
  );
}
