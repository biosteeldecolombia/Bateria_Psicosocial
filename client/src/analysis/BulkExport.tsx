import { useEffect, useState } from 'react';
import { api, ApiError, getCsrf } from '../api';

/** Descarga un archivo pequeño (PDF individual) comprobando primero el estado de la respuesta. */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'x-csrf-token': getCsrf() } });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo descargar el archivo.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

interface Job {
  id: string;
  status: string;
  done: number;
  total: number;
}

/** Exportación masiva: ZIP con un PDF por persona. Pide contraseña y código MFA; el archivo se descarga una sola vez. */
export function BulkExport({ campaignId, reason, areas, onClose }: { campaignId: string; reason: string; areas: { value: string; people: number }[]; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [scope, setScope] = useState<'completed' | 'all'>('completed');
  const [form, setForm] = useState('');
  const [area, setArea] = useState('');
  const [error, setError] = useState('');
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!job || ['done', 'failed', 'expired'].includes(job.status)) return;
    const t = setTimeout(async () => {
      try {
        setJob(await api<Job>('GET', `/api/exports/${job.id}`));
      } catch {
        setError('Se perdió la conexión con el servidor.');
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [job]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api<{ id: string }>('POST', `/api/campaigns/${campaignId}/exports`, { password, code, scope, form, area, justification: reason });
      setPassword('');
      setCode('');
      setJob({ id: r.id, status: 'queued', done: 0, total: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la exportación.');
    }
  };

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="bx-t">
      <div className="modal wide">
        <h2 id="bx-t">Descargar expedientes en PDF</h2>
        {!job ? (
          <form onSubmit={start} noValidate>
            <p className="muted">Genera un ZIP con un PDF por persona (consentimiento, ficha y cuestionarios, con el aspecto de las plantillas oficiales). Por seguridad, confirma tu identidad.</p>
            <div className="two">
              <div>
                <label htmlFor="bx-s">Incluir</label>
                <select id="bx-s" value={scope} onChange={(e) => setScope(e.target.value as 'completed' | 'all')}>
                  <option value="completed">Solo quienes completaron la batería</option>
                  <option value="all">Todos (incluye quienes no autorizaron o siguen en curso)</option>
                </select>
              </div>
              <div>
                <label htmlFor="bx-f">Forma intralaboral</label>
                <select id="bx-f" value={form} onChange={(e) => setForm(e.target.value)}>
                  <option value="">Ambas</option>
                  <option value="A">Forma A (jefaturas y profesionales)</option>
                  <option value="B">Forma B (auxiliares y operarios)</option>
                </select>
              </div>
            </div>
            <label htmlFor="bx-a">Área</label>
            <select id="bx-a" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas</option>
              {areas.map((v) => <option key={v.value} value={v.value}>{v.value} — {v.people}</option>)}
            </select>
            <p className="hint">Cada expediente pesa unos 5 MB. En campañas grandes conviene descargar por área o por forma para obtener archivos más manejables.</p>
            <label htmlFor="bx-p">Tu contraseña</label>
            <input id="bx-p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label htmlFor="bx-c">Código de tu aplicación de autenticación (6 dígitos)</label>
            <input id="bx-c" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <p className="hint">Si acabas de iniciar sesión, espera a que cambie el código de tu aplicación.</p>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="row-between" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
              <button className="btn" disabled={!password || code.length < 6}>Generar ZIP</button>
            </div>
          </form>
        ) : (
          <div role="status" aria-live="polite">
            {(job.status === 'queued' || job.status === 'running') && (
              <>
                <p>Generando… {job.done} de {job.total || '…'} expedientes</p>
                <progress max={Math.max(job.total, 1)} value={job.done} aria-label="Progreso de la exportación" style={{ width: '100%' }} />
                <p className="hint">Puedes seguir usando la aplicación; el archivo se prepara en segundo plano.</p>
              </>
            )}
            {job.status === 'done' && (
              <>
                <div className="alert ok">Listo: {job.done} expedientes. El archivo se puede descargar <strong>una sola vez</strong> y caduca en 30 minutos.</div>
                <a className="btn" href={`/api/exports/${job.id}/download`} onClick={() => setTimeout(onClose, 1500)}>Descargar ZIP</a>
              </>
            )}
            {(job.status === 'failed' || job.status === 'expired') && (
              <div className="alert error" role="alert">{job.status === 'expired' ? 'El archivo ya fue descargado o caducó.' : 'No se pudo generar el archivo. Intenta de nuevo.'}</div>
            )}
            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="btn secondary" onClick={onClose} style={{ marginTop: '0.75rem' }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
