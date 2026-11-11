import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { downloadFile } from './analysis/BulkExport';
import { Icon } from './icons';
import { EmptyState, useAction } from './ui';
import { Loading } from './BrandLoader';

interface Row {
  id: number;
  at: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  meta: Record<string, unknown>;
  actor: { id: string; name: string; username: string; role: string | null } | null;
}
interface Alert {
  key: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  count: number;
  firstAt: string;
  lastAt: string;
  filter: { category?: string; actor?: string; ip?: string; action?: string };
}
interface Locked { id: string; name: string; username: string; role: string; until: string; attempts: number }
interface Filters { from: string; to: string; actor: string; category: string; action: string; ip: string }

const EMPTY: Filters = { from: '', to: '', actor: '', category: '', action: '', ip: '' };

const CATEGORIES: [string, string][] = [
  ['auth', 'Ingresos y seguridad'],
  ['results', 'Consulta de resultados'],
  ['pdf', 'Descargas de documentos'],
  ['user', 'Cuentas de usuario'],
  ['company', 'Empresas'],
  ['campaign', 'Campañas'],
  ['participant', 'Participantes'],
  ['participants', 'Listados de participantes'],
  ['consent', 'Consentimientos'],
  ['profile', 'Perfil y firma'],
  ['audit', 'Auditoría'],
];

const ROLES: Record<string, string> = { admin: 'Administrador', psychologist: 'Psicóloga', assistant: 'Auxiliar administrativo', company: 'Empresa cliente', collaborator: 'Credencial de campaña' };

/** Nombre en español de cada acción registrada (si aparece una nueva, se muestra su código). */
const ACTIONS: Record<string, string> = {
  'auth.login': 'Inició sesión',
  'auth.logout': 'Cerró sesión',
  'auth.logout_all': 'Cerró sesión en todos los dispositivos',
  'auth.login_failed': 'Intento de ingreso fallido',
  'auth.login_failed_unknown': 'Intento de ingreso con un usuario inexistente',
  'auth.login_blocked': 'Intento de ingreso con la cuenta en espera',
  'auth.login_inactive': 'Intento de ingreso con una cuenta desactivada',
  'auth.locked': 'Cuenta bloqueada por intentos fallidos',
  'auth.mfa_enabled': 'Activó la verificación en dos pasos',
  'auth.mfa_verified': 'Verificación en dos pasos correcta',
  'auth.mfa_failed': 'Código de verificación incorrecto',
  'auth.mfa_blocked': 'Verificación rechazada: cuenta en espera',
  'auth.recovery_code_used': 'Usó un código de recuperación',
  'results.viewed': 'Consultó el registro individual',
  'results.summary': 'Consultó el resumen de resultados',
  'results.domains': 'Consultó dominios y dimensiones',
  'results.exported': 'Exportó resultados (CSV)',
  'results.individual_viewed': 'Abrió el informe individual',
  'results.disc_viewed': 'Consultó los resultados DISC',
  'results.valanti_viewed': 'Consultó los resultados VALANTI',
  'results.pf16_viewed': 'Consultó el 16PF',
  'results.acrofobia_viewed': 'Consultó los resultados de Acrofobia',
  'results.claustrofobia_viewed': 'Consultó los resultados del CLQ',
  'results.claustrofobia_marked': 'Marcó la interpretación del CLQ',
  'results.formato_viewed': 'Abrió el formato de evaluación ocupacional',
  'results.formato_saved': 'Guardó el formato de evaluación ocupacional',
  'results.admin_access': 'Acceso del administrador a información clínica',
  'results.assistant_access': 'Acceso del auxiliar a documentos',
  'pdf.individual': 'Descargó un expediente en PDF',
  'pdf.disc': 'Descargó el informe DISC',
  'pdf.valanti': 'Descargó el informe VALANTI',
  'pdf.pf16': 'Descargó la hoja del 16PF',
  'pdf.acrofobia': 'Descargó el informe de Acrofobia',
  'pdf.claustrofobia': 'Descargó el informe del CLQ',
  'pdf.formato': 'Descargó el formato de evaluación ocupacional',
  'pdf.bulk_requested': 'Solicitó descarga masiva (ZIP)',
  'pdf.bulk_denied': 'Descarga masiva rechazada (reconfirmación fallida)',
  'pdf.bulk_ready': 'Descarga masiva lista',
  'pdf.bulk_downloaded': 'Descargó el ZIP de expedientes',
  'user.created': 'Creó una cuenta',
  'user.updated': 'Editó una cuenta',
  'user.password_reset': 'Restableció una contraseña',
  'user.activated': 'Activó una cuenta',
  'user.deactivated': 'Desactivó una cuenta',
  'user.unlocked': 'Desbloqueó una cuenta',
  'user.companies_updated': 'Cambió las empresas de una cuenta',
  'user.signature_viewed': 'Vio la firma de una psicóloga',
  'user.signature_set_by_admin': 'Cargó la firma de una psicóloga',
  'user.signature_removed_by_admin': 'Quitó la firma de una psicóloga',
  'company.created': 'Creó una empresa',
  'company.updated': 'Editó una empresa',
  'company.activated': 'Activó una empresa',
  'company.deactivated': 'Desactivó una empresa',
  'company.deleted': 'Eliminó una empresa',
  'company.report_viewed': 'Una empresa consultó sus reportes',
  'campaign.created': 'Creó una campaña',
  'campaign.renamed': 'Renombró una campaña',
  'campaign.responsible_changed': 'Cambió la responsable de una campaña',
  'campaign.closed': 'Cerró una campaña',
  'campaign.reopened': 'Reabrió una campaña',
  'campaign.deleted': 'Eliminó una campaña',
  'campaign.access_viewed': 'Vio el usuario y la contraseña de una campaña',
  'campaign.access_regenerated': 'Generó una contraseña nueva de campaña',
  'participants.listed': 'Consultó el listado de participantes',
  'participant.started': 'Una persona inició la evaluación',
  'participant.resumed': 'Una persona retomó su avance',
  'participant.resume_failed': 'Código personal incorrecto al retomar',
  'participant.resume_locked': 'Retomar bloqueado por intentos fallidos',
  'participant.submitted': 'Una persona envió sus respuestas',
  'participant.code_reset': 'Entregó un código personal nuevo',
  'participant.rectified': 'Corrigió datos de una persona',
  'participant.erased': 'Suprimió los datos de una persona',
  'participant.purged_retention': 'Suprimió por plazo de retención',
  'participant.instrument_reopened': 'Reabrió una prueba para repetirla',
  'participant.form_changed': 'Cambió la forma A/B de una persona',
  'consent.authorized': 'Una persona autorizó el consentimiento',
  'consent.declined': 'Una persona no autorizó el consentimiento',
  'profile.updated': 'Actualizó su perfil profesional',
  'profile.signature_set': 'Cargó su firma',
  'profile.signature_removed': 'Quitó su firma',
  'audit.exported': 'Exportó la auditoría (CSV)',
};

const SEVERITY: Record<Alert['severity'], { label: string; icon: 'octagon' | 'triangle' | 'dot'; cls: string }> = {
  high: { label: 'Alta', icon: 'octagon', cls: 'error' },
  medium: { label: 'Media', icon: 'triangle', cls: 'warn' },
  low: { label: 'Baja', icon: 'dot', cls: 'ok' },
};

const fmtAt = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' });
const fmtShort = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
const params = (f: Filters, extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v)).toString();
const waitLabel = (iso: string) => {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
  return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
};
/** Resumen corto del detalle de un movimiento (sin repetir la IP, que tiene su propia columna). */
const summary = (meta: Record<string, unknown>) =>
  Object.entries(meta)
    .filter(([k]) => k !== 'ip')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');

/** Auditoría: alertas de actividad sospechosa, cuentas bloqueadas y todos los movimientos de todas las cuentas, con filtros. */
export function Audit() {
  const act = useAction();
  const [hours, setHours] = useState(24);
  const [alerts, setAlerts] = useState<{ alerts: Alert[]; locked: Locked[] } | null>(null);
  const [alertErr, setAlertErr] = useState('');
  const [form, setForm] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [rows, setRows] = useState<Row[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await api<{ alerts: Alert[]; locked: Locked[] }>('GET', `/api/admin/audit/alerts?hours=${hours}`));
      setAlertErr('');
    } catch (e) {
      setAlertErr(e instanceof ApiError ? e.message : 'No se pudieron cargar las alertas.');
    }
  }, [hours]);
  useEffect(() => { void loadAlerts(); }, [loadAlerts]);

  const loadRows = useCallback(async (f: Filters, before?: number) => {
    setLoading(true);
    setError('');
    try {
      const r = await api<{ rows: Row[]; nextBefore: number | null }>('GET', `/api/admin/audit?${params(f, { limit: '50', ...(before ? { before: String(before) } : {}) })}`);
      setRows((all) => (before ? [...all, ...r.rows] : r.rows));
      setNext(r.nextBefore);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la auditoría.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void loadRows(applied); }, [applied, loadRows]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setApplied(form);
  };
  const jump = (filter: Alert['filter']) => {
    const f = { ...EMPTY, ...filter };
    setForm(f);
    setApplied(f);
    window.requestAnimationFrame(() => logRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const hasFilters = Object.values(applied).some(Boolean);

  return (
    <>
      <div className="page-head">
        <h1>Auditoría</h1>
        <p className="muted">Todos los movimientos de todas las cuentas. El registro es de solo inserción: nadie puede modificarlo ni borrarlo.</p>
      </div>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}

      <section className="panel pad" aria-labelledby="au-al">
        <div className="panel-head">
          <h2 id="au-al" className="panel-title"><Icon name="shield" size={20} /> Alertas de actividad sospechosa</h2>
          <div className="field" style={{ minWidth: 0 }}>
            <label htmlFor="au-h" className="sr-only">Período de las alertas</label>
            <select id="au-h" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={24}>Últimas 24 horas</option>
              <option value={72}>Últimos 3 días</option>
              <option value={168}>Últimos 7 días</option>
            </select>
          </div>
        </div>
        {alertErr && <div className="alert error" role="alert">{alertErr}</div>}
        {!alerts && !alertErr ? <Loading /> : alerts && (
          <>
            {alerts.locked.length > 0 && (
              <div className="alert error" role="status">
                <strong><Icon name="lock" size={16} /> Cuentas bloqueadas en este momento ({alerts.locked.length})</strong>
                <ul className="list" style={{ marginTop: '0.5rem' }}>
                  {alerts.locked.map((u) => (
                    <li key={u.id} className="row-between" style={{ padding: '0.25rem 0' }}>
                      <span>{u.name || u.username} <span className="muted">({ROLES[u.role] ?? u.role} · {u.attempts} intentos · espera {waitLabel(u.until)} más)</span></span>
                      <button className="btn secondary sm" disabled={act.busy} onClick={() => void act.run(async () => {
                        if (!window.confirm(`¿Desbloquear la cuenta de ${u.name || u.username}? Hazlo solo si confirmaste que fue la propia persona.`)) return;
                        await api('POST', `/api/admin/users/${u.id}/unlock`);
                        await Promise.all([loadAlerts(), loadRows(applied)]);
                      })}>Desbloquear</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {alerts.alerts.length === 0 ? (
              <EmptyState icon="shield" text="Sin alertas en este período: no se detectó actividad sospechosa." />
            ) : (
              <ul className="list">
                {alerts.alerts.map((a) => (
                  <li key={a.key} className={`alert ${SEVERITY[a.severity].cls}`} style={{ margin: '0.5rem 0', listStyle: 'none' }}>
                    <div className="row-between">
                      <span><Icon name={SEVERITY[a.severity].icon} size={16} /> <strong>Severidad {SEVERITY[a.severity].label}:</strong> {a.title}</span>
                      <button className="btn secondary sm" onClick={() => jump(a.filter)}>Ver movimientos</button>
                    </div>
                    <p className="muted" style={{ margin: '0.25rem 0 0', fontWeight: 400 }}>{a.detail} {fmtShort(a.firstAt)}{a.firstAt !== a.lastAt ? ` – ${fmtShort(a.lastAt)}` : ''}.</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted" style={{ marginBottom: 0 }}>Tras varios intentos fallidos la cuenta espera antes de aceptar otro: 30 s al 3.º, 1 min al 4.º y desde el 5.º 15 min, que se duplican en cada intento (máximo 24 h). La credencial compartida de una campaña espera 15 min tras 5 intentos.</p>
          </>
        )}
      </section>

      <section className="panel pad" aria-labelledby="au-log" style={{ marginTop: '1rem' }} ref={logRef}>
        <h2 id="au-log" className="panel-title"><Icon name="clipboard" size={20} /> Movimientos</h2>
        <form className="toolbar" onSubmit={search} aria-label="Filtros de la auditoría">
          <div className="field"><label htmlFor="au-from">Desde</label><input id="au-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div>
          <div className="field"><label htmlFor="au-to">Hasta</label><input id="au-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
          <div className="field grow"><label htmlFor="au-actor">Persona (nombre o correo)</label><input id="au-actor" type="search" value={form.actor} onChange={(e) => setForm({ ...form, actor: e.target.value })} autoComplete="off" /></div>
          <div className="field">
            <label htmlFor="au-cat">Tipo de movimiento</label>
            <select id="au-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Todos</option>
              {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="au-act">Acción (código)</label><input id="au-act" type="search" placeholder="login_failed" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} autoComplete="off" /></div>
          <div className="field"><label htmlFor="au-ip">IP</label><input id="au-ip" type="search" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} autoComplete="off" /></div>
          <div className="field" style={{ minWidth: 0 }}>
            <button className="btn"><Icon name="search" /> Buscar</button>
          </div>
          {(hasFilters || Object.values(form).some(Boolean)) && (
            <div className="field" style={{ minWidth: 0 }}><button type="button" className="btn secondary" onClick={() => { setForm(EMPTY); setApplied(EMPTY); }}>Limpiar</button></div>
          )}
          <div className="field" style={{ minWidth: 0 }}>
            <button type="button" className="btn secondary" disabled={csvBusy} onClick={async () => { setCsvBusy(true); try { await downloadFile(`/api/admin/audit.csv?${params(applied)}`, 'Auditoria.csv'); } catch (e) { setError((e as Error).message); } finally { setCsvBusy(false); } }}>{csvBusy ? 'Generando…' : 'Descargar CSV'}</button>
          </div>
        </form>
        {error && <div className="alert error" role="alert">{error}</div>}
        {loading && rows.length === 0 ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon="clipboard" text="No hay movimientos que coincidan con los filtros." />
        ) : (
          <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
            <table className="table">
              <caption className="sr-only">Movimientos de todas las cuentas, del más reciente al más antiguo</caption>
              <thead><tr><th scope="col">Fecha y hora</th><th scope="col">Cuenta</th><th scope="col">Movimiento</th><th scope="col">IP</th><th scope="col">Detalle</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtAt(r.at)}</td>
                    <td>{r.actor ? <><strong>{r.actor.name}</strong><br /><span className="muted">{r.actor.role ? ROLES[r.actor.role] ?? r.actor.role : ''}</span></> : <span className="muted">Sin sesión</span>}</td>
                    <td>{ACTIONS[r.action] ?? r.action}<br /><code className="muted">{r.action}</code></td>
                    <td>{r.ip ? <code>{r.ip}</code> : <span className="muted">—</span>}</td>
                    <td className="muted" style={{ maxWidth: '22rem', overflowWrap: 'anywhere' }}>{summary(r.meta) || '—'}{r.targetType ? <><br />{r.targetType}{r.targetId ? ` · ${r.targetId.slice(0, 8)}…` : ''}</> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next !== null && <div style={{ textAlign: 'center', marginTop: '0.75rem' }}><button className="btn secondary" disabled={loading} onClick={() => void loadRows(applied, next)}>{loading ? 'Cargando…' : 'Cargar más'}</button></div>}
      </section>
    </>
  );
}
