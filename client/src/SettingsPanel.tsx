import { useCallback, useEffect, useState } from 'react';
import { ALERT_RULES, type AlertSettings } from '@sanithelp/shared';
import { api } from './api';
import { Icon } from './icons';
import { useAction } from './ui';
import { Loading } from './BrandLoader';

interface SettingsResponse { alerts: AlertSettings; security: { trustedDeviceDays: number }; mail: { enabled: boolean; provider: string; from: string | null } }

const UNIT: Record<string, string> = { days: 'días', hours: 'horas', count: 'o más' };
const ROLES_OF = (r: (typeof ALERT_RULES)[number]) => (r.roles === 'admin+psychologist' ? 'Administrador y psicóloga' : 'Auxiliar administrativo');

/** Configuración: alertas y notificaciones parametrizables, seguridad de la verificación y estado del correo. */
export function SettingsPanel() {
  const act = useAction();
  const [s, setS] = useState<SettingsResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertSettings | null>(null);
  const [days, setDays] = useState(14);
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const r = await api<SettingsResponse>('GET', '/api/settings');
    setS(r);
    setAlerts(r.alerts);
    setDays(r.security.trustedDeviceDays);
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  if (!s || !alerts) return <Loading />;

  return (
    <>
      <div className="page-head">
        <h1>Configuración</h1>
        <p className="muted">Cuándo avisar, a quién y con qué umbral. Las alertas salen en «Flujo de trabajo» y, si lo activas, también por correo cada mañana.</p>
      </div>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      {msg && <div className="alert ok" role="status">{msg}</div>}

      <section className="panel pad" aria-labelledby="st-al">
        <h2 id="st-al" className="panel-title"><Icon name="alert" size={20} /> Alertas y notificaciones</h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Reglas de alerta</caption>
            <thead><tr><th scope="col">Activa</th><th scope="col">Aviso</th><th scope="col">Para</th><th scope="col">Avisar cuando haya</th></tr></thead>
            <tbody>
              {ALERT_RULES.map((r) => (
                <tr key={r.key}>
                  <td><input type="checkbox" aria-label={`Activar: ${r.label}`} checked={alerts.enabled[r.key] !== false} onChange={(e) => setAlerts({ ...alerts, enabled: { ...alerts.enabled, [r.key]: e.target.checked } })} /></td>
                  <th scope="row"><span>{r.label}</span><br /><small className="muted">Ej.: «{r.template.replace('{n}', '10').replace('{days}', String(alerts.threshold[r.key] ?? r.defaultThreshold))}»</small></th>
                  <td>{ROLES_OF(r)}</td>
                  <td>
                    <input type="number" min={0} max={1000} style={{ width: '5.5rem' }} aria-label={`Umbral de ${r.label}`} value={alerts.threshold[r.key] ?? r.defaultThreshold} onChange={(e) => setAlerts({ ...alerts, threshold: { ...alerts.threshold, [r.key]: Math.max(0, Number(e.target.value) || 0) } })} /> <span className="muted">{UNIT[r.unit ?? 'count']}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="check" style={{ marginTop: '0.75rem' }}>
          <input type="checkbox" checked={alerts.dailyEmail} disabled={!s.mail.enabled} onChange={(e) => setAlerts({ ...alerts, dailyEmail: e.target.checked })} />
          Enviar cada mañana (7:00, hora de Colombia) un resumen de pendientes por correo{!s.mail.enabled && ' — requiere configurar el correo'}
        </label>
        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" disabled={act.busy} onClick={() => void act.run(async () => { await api('PUT', '/api/settings/alerts', alerts); await load(); setMsg('Alertas guardadas.'); })}><Icon name="check" /> Guardar alertas</button>
          <button className="btn secondary" disabled={act.busy || !s.mail.enabled} onClick={() => void act.run(async () => { await api('POST', '/api/settings/digest-test'); setMsg('Te enviamos el resumen de prueba a tu correo.'); })}>Enviarme el resumen ahora</button>
        </div>
      </section>

      <section className="panel pad" aria-labelledby="st-sec" style={{ marginTop: '1rem' }}>
        <h2 id="st-sec" className="panel-title"><Icon name="shield" size={20} /> Verificación en dos pasos</h2>
        <label htmlFor="st-days">Recordar el equipo después de verificar (días)</label>
        <input id="st-days" type="number" min={0} max={60} style={{ width: '6rem' }} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        <p className="muted">En un equipo recordado no se vuelve a pedir el código. Pon 0 para pedirlo siempre. Al restablecer una contraseña se olvidan los equipos de esa cuenta.</p>
        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" disabled={act.busy} onClick={() => void act.run(async () => { await api('PUT', '/api/settings/security', { trustedDeviceDays: days }); await load(); setMsg('Seguridad guardada.'); })}><Icon name="check" /> Guardar</button>
        </div>
      </section>

      <section className="panel pad" aria-labelledby="st-mail" style={{ marginTop: '1rem' }}>
        <h2 id="st-mail" className="panel-title"><Icon name="key" size={20} /> Correo (Outlook)</h2>
        {s.mail.enabled ? (
          <>
            <p><span className="badge on"><Icon name="dot" size={12} /> Conectado</span> Los correos salen desde <strong>{s.mail.from}</strong> ({s.mail.provider === 'graph' ? 'Microsoft Graph' : 'SMTP'}).</p>
            <label htmlFor="st-to">Enviar un correo de prueba a</label>
            <input id="st-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn secondary" disabled={act.busy || !to} onClick={() => void act.run(async () => { await api('POST', '/api/admin/mail/test', { to }); setMsg(`Enviamos una prueba a ${to}.`); })}>Enviar prueba</button>
            </div>
          </>
        ) : (
          <>
            <p><span className="badge off"><Icon name="ring" size={12} /> Sin configurar</span> Para enviar credenciales, códigos y alertas por correo hay que cargar las llaves de Outlook como variables del servicio. La guía paso a paso está en <code>docs/CORREO_OUTLOOK.md</code>.</p>
          </>
        )}
      </section>
    </>
  );
}
