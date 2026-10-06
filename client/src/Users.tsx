import { useState, type FormEvent } from 'react';
import { api } from './api';
import { Icon } from './icons';
import { EmptyState, Modal, RowMenu, StatusBadge, useAction } from './ui';

export interface Company { id: string; name: string; code: string }
export interface UserRow {
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

export const ROLE_LABEL: Record<UserRow['role'], string> = { admin: 'Administrador', psychologist: 'Psicóloga', company: 'Empresa cliente' };

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
const nameOf = (u: UserRow) => u.fullName || u.username;

function CompanyPicker({ role, companies, value, onChange, name }: { role: UserRow['role']; companies: Company[]; value: string[]; onChange: (v: string[]) => void; name: string }) {
  if (role === 'admin') return <p className="muted">El administrador accede a todas las empresas.</p>;
  return (
    <fieldset className="plain" style={{ marginTop: '1rem' }}>
      <legend>{role === 'psychologist' ? 'Empresas que atiende' : 'Empresa'}</legend>
      <div className="checks">
        {companies.map((c) => (
          <label className="check" key={c.id}>
            <input
              type={role === 'company' ? 'radio' : 'checkbox'}
              name={name}
              checked={value.includes(c.id)}
              onChange={(e) => onChange(role === 'company' ? [c.id] : e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))}
            />{' '}
            {c.name}
          </label>
        ))}
        {companies.length === 0 && <p className="muted">Primero crea una empresa.</p>}
      </div>
    </fieldset>
  );
}

function PermissionList({ role }: { role: UserRow['role'] }) {
  return (
    <ul className="perm-list" aria-label={`Permisos del rol ${ROLE_LABEL[role]}`}>
      {PERMISSIONS[role].map((p) => <li key={p}><Icon name="check" size={16} /> {p}</li>)}
    </ul>
  );
}

function UserForm({ companies, user, onDone, onSecret, onClose }: { companies: Company[]; user: UserRow | null; onDone: () => Promise<void>; onSecret: (title: string, username: string, password: string) => void; onClose: () => void }) {
  const act = useAction();
  const [role, setRole] = useState<UserRow['role']>(user?.role ?? 'psychologist');
  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [doc, setDoc] = useState(user?.professionalDocument ?? '');
  const [reg, setReg] = useState(user?.professionalRegistry ?? '');
  const [ids, setIds] = useState<string[]>(user?.companies.map((c) => c.id) ?? []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      const extra = {
        ...(role === 'company' ? { companyId: ids[0] } : {}),
        ...(role === 'psychologist' ? { assignedCompanyIds: ids, professionalRegistry: reg, professionalDocument: doc } : {}),
      };
      if (user) {
        await api('PUT', `/api/admin/users/${user.id}`, { role, username, fullName, ...extra });
        await onDone();
        onClose();
      } else {
        const r = await api<{ username: string; password: string }>('POST', '/api/admin/users', {
          role, username, fullName,
          ...(role === 'psychologist' ? { assignedCompanyIds: ids, ...(reg ? { professionalRegistry: reg } : {}), ...(doc ? { professionalDocument: doc } : {}) } : {}),
          ...(role === 'company' ? { companyId: ids[0] } : {}),
        });
        await onDone();
        onClose();
        onSecret(`Cuenta creada: ${ROLE_LABEL[role]}`, r.username, r.password);
      }
    });
  };

  return (
    <Modal title={user ? `Editar a ${nameOf(user)}` : 'Nueva cuenta'} icon={user ? 'edit' : 'user'} size="lg" onClose={onClose}>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div>
            <label htmlFor="uf-role">Rol</label>
            <select id="uf-role" value={role} onChange={(e) => { setRole(e.target.value as UserRow['role']); setIds([]); }}>
              <option value="psychologist">Psicóloga</option>
              <option value="admin">Administrador</option>
              <option value="company">Empresa cliente (solo reportes)</option>
            </select>
          </div>
          <div>
            <label htmlFor="uf-name">Nombre completo</label>
            <input id="uf-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="uf-mail">Correo (es su usuario)</label>
            <input id="uf-mail" type="email" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          {role === 'psychologist' && (
            <>
              <div>
                <label htmlFor="uf-doc">N.° de identificación profesional</label>
                <input id="uf-doc" type="text" value={doc} onChange={(e) => setDoc(e.target.value)} />
              </div>
              <div>
                <label htmlFor="uf-reg">Registro o licencia profesional</label>
                <input id="uf-reg" type="text" value={reg} onChange={(e) => setReg(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <CompanyPicker role={role} companies={companies} value={ids} onChange={setIds} name="uf-co" />
        <h3 className="sub">Permisos del rol</h3>
        <PermissionList role={role} />
        {user && <p className="muted">Si cambias el rol o el correo, se cerrarán las sesiones abiertas de esta cuenta.</p>}
        <div className="dialog-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={act.busy || fullName.trim().length < 2 || username.trim().length < 3 || (role === 'company' && !ids.length)}>
            <Icon name="check" /> {user ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordForm({ user, onSecret, onClose }: { user: UserRow; onSecret: (title: string, username: string, password: string) => void; onClose: () => void }) {
  const act = useAction();
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  return (
    <Modal title={`Definir contraseña de ${nameOf(user)}`} icon="lock" size="sm" onClose={onClose}>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api('POST', `/api/admin/users/${user.id}/reset-password`, { password: pwd });
            onClose();
            onSecret(`Contraseña definida para ${nameOf(user)}`, user.username, pwd);
          });
        }}
      >
        <label htmlFor="pw-new">Nueva contraseña</label>
        <input id="pw-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar contraseña</label>
        <p className="muted">Mínimo 12 caracteres, sin palabras comunes ni el nombre o correo de la persona. Se cerrarán sus sesiones.</p>
        <div className="dialog-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={act.busy || pwd.length < 12}><Icon name="check" /> Guardar contraseña</button>
        </div>
      </form>
    </Modal>
  );
}

export function Users({ rows, loaded, companies, reload, onSecret, openNew, onCloseNew }: {
  rows: UserRow[];
  loaded: boolean;
  companies: Company[];
  reload: () => Promise<void>;
  onSecret: (title: string, username: string, password: string) => void;
  openNew: boolean;
  onCloseNew: () => void;
}) {
  const act = useAction();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [pwdUser, setPwdUser] = useState<UserRow | null>(null);

  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (u) =>
      (!roleFilter || u.role === roleFilter) &&
      (!statusFilter || (statusFilter === 'active') === u.active) &&
      (!term || u.fullName.toLowerCase().includes(term) || u.username.toLowerCase().includes(term) || u.companies.some((c) => c.name.toLowerCase().includes(term))),
  );

  return (
    <>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      <div className="toolbar">
        <div className="field grow">
          <label htmlFor="uq">Buscar</label>
          <div className="search"><Icon name="search" /><input id="uq" type="search" placeholder="Nombre, correo o empresa" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="field">
          <label htmlFor="urf">Rol</label>
          <select id="urf" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Todos los roles</option>
            <option value="admin">Administrador</option>
            <option value="psychologist">Psicóloga</option>
            <option value="company">Empresa cliente</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="usf">Estado</label>
          <select id="usf" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="active">Activas</option>
            <option value="inactive">Desactivadas</option>
          </select>
        </div>
      </div>

      {!loaded ? <p className="muted" role="status">Cargando…</p> : shown.length === 0 ? <EmptyState icon="users" text="No hay usuarios que coincidan." /> : (
        <div className="panel table-wrap">
          <table className="table">
            <caption className="sr-only">Usuarios, roles, empresas asignadas y estado</caption>
            <thead>
              <tr><th scope="col">Nombre</th><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Empresas</th><th scope="col">Estado</th><th scope="col">Último ingreso</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.fullName || '—'}</strong></td>
                  <td><code>{u.username || '—'}</code></td>
                  <td><span className="chip"><Icon name={u.role === 'admin' ? 'shield' : u.role === 'psychologist' ? 'user' : 'building'} size={14} /> {ROLE_LABEL[u.role]}</span></td>
                  <td>{u.role === 'admin' ? 'Todas' : u.companies.length ? u.companies.map((c) => c.name).join(', ') : <span className="muted">Sin asignar</span>}</td>
                  <td>
                    <StatusBadge on={u.active} onText="Activa" offText="Desactivada" />
                    {u.locked && <span className="badge warn"><Icon name="lock" size={12} /> Bloqueada</span>}
                    {u.mfaRequired && !u.mfaEnabled && <span className="badge warn"><Icon name="shield" size={12} /> MFA pendiente</span>}
                  </td>
                  <td>{fmt(u.lastLoginAt)}</td>
                  <td className="actions">
                    <button className="btn secondary sm" onClick={() => setEdit(u)}><Icon name="edit" /> Editar</button>
                    <RowMenu
                      label={`Más acciones para ${nameOf(u)}`}
                      items={[
                        { label: 'Definir contraseña', icon: 'lock', onSelect: () => setPwdUser(u) },
                        {
                          label: 'Generar contraseña nueva', icon: 'refresh', onSelect: () => void act.run(async () => {
                            if (!window.confirm(`Se generará una contraseña nueva para ${nameOf(u)} y se cerrarán sus sesiones. ¿Continuar?`)) return;
                            const r = await api<{ password: string }>('POST', `/api/admin/users/${u.id}/reset-password`);
                            onSecret(`Nueva contraseña para ${nameOf(u)}`, u.username, r.password);
                          }),
                        },
                        {
                          label: u.active ? 'Desactivar cuenta' : 'Activar cuenta', icon: 'power', danger: u.active, onSelect: () => void act.run(async () => {
                            if (u.active && !window.confirm(`¿Desactivar la cuenta de ${nameOf(u)}? Se cerrarán sus sesiones.`)) return;
                            await api('POST', `/api/admin/users/${u.id}/active`, { active: !u.active });
                            await reload();
                          }),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openNew && <UserForm companies={companies} user={null} onDone={reload} onSecret={onSecret} onClose={onCloseNew} />}
      {edit && <UserForm key={edit.id} companies={companies} user={edit} onDone={reload} onSecret={onSecret} onClose={() => setEdit(null)} />}
      {pwdUser && <PasswordForm user={pwdUser} onSecret={onSecret} onClose={() => setPwdUser(null)} />}
    </>
  );
}
