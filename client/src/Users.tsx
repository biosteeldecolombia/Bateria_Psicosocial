import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

interface Company { id: string; name: string; code: string }
interface UserRow {
  id: string;
  role: 'admin' | 'psychologist' | 'company';
  username: string;
  fullName: string;
  professionalRegistry: string;
  professionalDocument: string;
  active: boolean;
  mfaRequired: boolean;
  mfaEnabled: boolean;
  locked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  companies: Company[];
}

const ROLE_LABEL: Record<UserRow['role'], string> = { admin: 'Administrador', psychologist: 'Psicóloga', company: 'Empresa cliente' };

/** Permisos de cada rol, tal como los aplica el servidor. */
const PERMISSIONS: Record<UserRow['role'], string[]> = {
  admin: [
    'Crear y administrar empresas y cuentas de personas',
    'Ver todas las empresas, campañas y resultados',
    'Restablecer contraseñas, activar o desactivar cuentas',
    'Consultar el registro de auditoría',
    'Exportar expedientes y gestionar derechos de titulares',
  ],
  psychologist: [
    'Crear campañas y credenciales solo en sus empresas asignadas',
    'Ver resultados y exportar expedientes de sus empresas',
    'Gestionar derechos de titulares de sus empresas',
    'Editar su perfil profesional (documento y registro)',
  ],
  company: ['Ver únicamente los reportes agregados de su empresa', 'Sin acceso a respuestas individuales ni a la gestión de campañas'],
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca');

export function Users({ companies, onSecret }: { companies: Company[]; onSecret: (title: string, username: string, password: string) => void }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api<UserRow[]>('GET', '/api/admin/users'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar.');
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar.');
    } finally {
      setBusy(false);
    }
  };

  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (u) =>
      (!roleFilter || u.role === roleFilter) &&
      (!term || u.fullName.toLowerCase().includes(term) || u.username.toLowerCase().includes(term) || u.companies.some((c) => c.name.toLowerCase().includes(term))),
  );

  return (
    <section className="card" aria-labelledby="usr" style={{ marginTop: '1rem' }}>
      <h2 id="usr">Usuarios disponibles</h2>
      <p className="muted">Cuentas de personas con su rol, empresas asignadas y permisos. Las credenciales de colaboradores se gestionan en cada campaña.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ flex: '1 1 14rem' }}>
          <label htmlFor="uq">Buscar por nombre, correo o empresa</label>
          <input id="uq" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ flex: '0 1 12rem' }}>
          <label htmlFor="urf">Rol</label>
          <select id="urf" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="admin">Administrador</option>
            <option value="psychologist">Psicóloga</option>
            <option value="company">Empresa cliente</option>
          </select>
        </div>
      </div>
      {!loaded ? <p className="muted">Cargando…</p> : shown.length === 0 ? <p className="muted">No hay usuarios que coincidan.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <caption className="sr-only">Usuarios, roles, empresas asignadas y estado</caption>
            <thead>
              <tr><th scope="col">Nombre</th><th scope="col">Usuario (correo)</th><th scope="col">Rol</th><th scope="col">Empresas</th><th scope="col">Estado</th><th scope="col">Último ingreso</th><th scope="col">Acciones</th></tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td>{u.fullName || '—'}</td>
                    <td><code>{u.username || '—'}</code></td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.role === 'admin' ? 'Todas' : u.companies.length ? u.companies.map((c) => c.name).join(', ') : <span className="muted">Sin asignar</span>}</td>
                    <td>
                      {u.active ? '● Activa' : '■ Desactivada'}
                      {u.locked && <><br />🔒 Bloqueada temporalmente</>}
                      {u.mfaRequired && <><br /><span className="muted">MFA: {u.mfaEnabled ? 'configurado' : 'pendiente'}</span></>}
                    </td>
                    <td>{fmt(u.lastLoginAt)}</td>
                    <td>
                      <button className="btn secondary" aria-expanded={open === u.id} onClick={() => setOpen(open === u.id ? null : u.id)}>{open === u.id ? 'Ocultar' : 'Detalle'}</button>{' '}
                      <button className="btn secondary" disabled={busy} onClick={() => run(async () => {
                        if (!window.confirm(`Se generará una contraseña nueva para ${u.fullName || u.username} y se cerrarán sus sesiones. ¿Continuar?`)) return;
                        const r = await api<{ password: string }>('POST', `/api/admin/users/${u.id}/reset-password`);
                        onSecret(`Nueva contraseña para ${u.fullName || u.username}`, u.username, r.password);
                      })}>Restablecer contraseña</button>{' '}
                      <button className="btn secondary" disabled={busy} onClick={() => run(async () => {
                        if (u.active && !window.confirm(`¿Desactivar la cuenta de ${u.fullName || u.username}? Se cerrarán sus sesiones.`)) return;
                        await api('POST', `/api/admin/users/${u.id}/active`, { active: !u.active });
                        await load();
                      })}>{u.active ? 'Desactivar' : 'Activar'}</button>
                    </td>
                  </tr>
                  {open === u.id && (
                    <tr>
                      <td colSpan={7}>
                        <p><strong>Creada:</strong> {fmt(u.createdAt)}</p>
                        {u.role === 'psychologist' && (
                          <p><strong>Documento:</strong> {u.professionalDocument || 'Pendiente'} · <strong>Registro profesional:</strong> {u.professionalRegistry || 'Pendiente'}</p>
                        )}
                        <p><strong>Permisos del rol {ROLE_LABEL[u.role]}:</strong></p>
                        <ul>{PERMISSIONS[u.role].map((p) => <li key={p}>{p}</li>)}</ul>
                        {u.role === 'psychologist' && (
                          editing === u.id ? (
                            <fieldset style={{ border: 0, padding: 0, margin: '0.5rem 0' }}>
                              <legend style={{ fontWeight: 700 }}>Empresas que atiende</legend>
                              {companies.map((c) => (
                                <label className="check" key={c.id}>
                                  <input type="checkbox" checked={draft.includes(c.id)} onChange={(e) => setDraft(e.target.checked ? [...draft, c.id] : draft.filter((x) => x !== c.id))} /> {c.name}
                                </label>
                              ))}
                              <button className="btn" disabled={busy} onClick={() => run(async () => {
                                await api('PUT', `/api/admin/users/${u.id}/companies`, { companyIds: draft });
                                setEditing(null);
                                await load();
                              })}>Guardar empresas</button>{' '}
                              <button className="btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
                            </fieldset>
                          ) : (
                            <button className="btn secondary" onClick={() => { setDraft(u.companies.map((c) => c.id)); setEditing(u.id); }}>Editar empresas asignadas</button>
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
