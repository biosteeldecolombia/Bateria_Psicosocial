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
  const [form, setForm] = useState({ fullName: '', username: '', role: 'psychologist' as UserRow['role'], registry: '', document: '', companyIds: [] as string[] });
  const [pwdFor, setPwdFor] = useState<string | null>(null);
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);

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
                        {editing === u.id ? (
                          <form
                            noValidate
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(async () => {
                                await api('PUT', `/api/admin/users/${u.id}`, {
                                  fullName: form.fullName,
                                  username: form.username,
                                  role: form.role,
                                  ...(form.role === 'company' ? { companyId: form.companyIds[0] } : {}),
                                  ...(form.role === 'psychologist' ? { assignedCompanyIds: form.companyIds, professionalRegistry: form.registry, professionalDocument: form.document } : {}),
                                });
                                setEditing(null);
                                await load();
                              });
                            }}
                          >
                            <label htmlFor={`en-${u.id}`}>Nombre completo</label>
                            <input id={`en-${u.id}`} type="text" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                            <label htmlFor={`eu-${u.id}`}>Usuario (correo)</label>
                            <input id={`eu-${u.id}`} type="email" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                            <label htmlFor={`er-${u.id}`}>Rol y permisos</label>
                            <select id={`er-${u.id}`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRow['role'], companyIds: [] })}>
                              <option value="admin">Administrador</option>
                              <option value="psychologist">Psicóloga</option>
                              <option value="company">Empresa cliente (solo reportes)</option>
                            </select>
                            <ul>{PERMISSIONS[form.role].map((p) => <li key={p}>{p}</li>)}</ul>
                            {form.role === 'psychologist' && (
                              <>
                                <label htmlFor={`ed-${u.id}`}>N.° de identificación de la profesional</label>
                                <input id={`ed-${u.id}`} type="text" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
                                <label htmlFor={`eg-${u.id}`}>Registro / licencia profesional</label>
                                <input id={`eg-${u.id}`} type="text" value={form.registry} onChange={(e) => setForm({ ...form, registry: e.target.value })} />
                              </>
                            )}
                            {form.role !== 'admin' && (
                              <fieldset style={{ border: 0, padding: 0, margin: '1rem 0 0' }}>
                                <legend style={{ fontWeight: 700 }}>{form.role === 'psychologist' ? 'Empresas que atiende' : 'Empresa'}</legend>
                                {companies.map((c) => (
                                  <label className="check" key={c.id}>
                                    <input
                                      type={form.role === 'company' ? 'radio' : 'checkbox'}
                                      name={`eco-${u.id}`}
                                      checked={form.companyIds.includes(c.id)}
                                      onChange={(e) => setForm({ ...form, companyIds: form.role === 'company' ? [c.id] : e.target.checked ? [...form.companyIds, c.id] : form.companyIds.filter((x) => x !== c.id) })}
                                    /> {c.name}
                                  </label>
                                ))}
                              </fieldset>
                            )}
                            <p className="muted">Si cambias el rol o el usuario, se cerrarán las sesiones abiertas de esa cuenta.</p>
                            <button className="btn" disabled={busy || form.fullName.trim().length < 2 || form.username.trim().length < 3 || (form.role === 'company' && !form.companyIds.length)}>Guardar cambios</button>{' '}
                            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
                          </form>
                        ) : (
                          <button className="btn secondary" onClick={() => {
                            setForm({ fullName: u.fullName, username: u.username, role: u.role, registry: u.professionalRegistry, document: u.professionalDocument, companyIds: u.companies.map((c) => c.id) });
                            setEditing(u.id);
                          }}>Editar datos, rol y empresas</button>
                        )}
                        {pwdFor === u.id ? (
                          <form
                            noValidate
                            style={{ marginTop: '1rem' }}
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(async () => {
                                await api('POST', `/api/admin/users/${u.id}/reset-password`, { password: pwd });
                                onSecret(`Contraseña definida para ${u.fullName || u.username}`, u.username, pwd);
                                setPwd('');
                                setPwdFor(null);
                              });
                            }}
                          >
                            <label htmlFor={`pw-${u.id}`}>Nueva contraseña (la defines tú)</label>
                            <input id={`pw-${u.id}`} type={show ? 'text' : 'password'} autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
                            <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar contraseña</label>
                            <p className="muted">Mínimo 12 caracteres, sin palabras comunes ni el nombre o correo de la persona. Se cerrarán sus sesiones.</p>
                            <button className="btn" disabled={busy || pwd.length < 12}>Guardar contraseña</button>{' '}
                            <button type="button" className="btn secondary" onClick={() => { setPwd(''); setPwdFor(null); }}>Cancelar</button>
                          </form>
                        ) : (
                          <button className="btn secondary" style={{ marginTop: '1rem' }} onClick={() => { setPwd(''); setPwdFor(u.id); }}>Definir contraseña manualmente</button>
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
