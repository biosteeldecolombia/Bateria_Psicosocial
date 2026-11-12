import { useCallback, useEffect, useState } from 'react';
import type { PermissionDef, PermissionKey } from '@sanithelp/shared';
import { api } from './api';
import { Icon } from './icons';
import { useAction } from './ui';
import { Loading } from './BrandLoader';

type Matrix = Record<string, Record<string, boolean>>;
interface RolesResponse { permissions: PermissionDef[]; roles: string[]; matrix: Matrix; defaults: Matrix }

const ROLE_NAME: Record<string, string> = { psychologist: 'Psicóloga', assistant: 'Auxiliar administrativo', company: 'Empresa cliente' };

/**
 * Matriz de roles y permisos: el administrador decide qué ve y qué hace cada rol.
 * El administrador siempre tiene todo; los permisos de administración no se pueden conceder a otros roles.
 */
export function RolesMatrix() {
  const act = useAction();
  const [data, setData] = useState<RolesResponse | null>(null);
  const [draft, setDraft] = useState<Matrix>({});
  const [saved, setSaved] = useState('');
  const load = useCallback(async () => {
    const r = await api<RolesResponse>('GET', '/api/admin/roles');
    setData(r);
    setDraft(JSON.parse(JSON.stringify(r.matrix)));
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  if (!data) return <Loading />;

  const dirty = (role: string) => data.permissions.some((p) => !p.adminOnly && draft[role]?.[p.key] !== data.matrix[role]?.[p.key]);
  const differsFromDefault = (role: string, key: PermissionKey) => draft[role]?.[key] !== data.defaults[role]?.[key];
  const groups = [...new Set(data.permissions.map((p) => p.group))];

  return (
    <section aria-labelledby="rm-t">
      <h2 id="rm-t" className="sub">Roles y permisos</h2>
      <p className="muted">Marca lo que puede hacer cada rol. Los cambios se aplican en cuanto los guardas. El administrador siempre tiene todos los permisos. Lo marcado con un punto es distinto del valor por defecto.</p>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      {saved && <div className="alert ok" role="status">{saved}</div>}
      <div className="panel table-wrap">
        <table className="table perm-matrix">
          <caption className="sr-only">Permisos de cada rol</caption>
          <thead>
            <tr>
              <th scope="col">Permiso</th>
              <th scope="col">Administrador</th>
              {data.roles.map((r) => <th scope="col" key={r}>{ROLE_NAME[r] ?? r}</th>)}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr className="group-row"><th colSpan={2 + data.roles.length} scope="colgroup">{g}</th></tr>
              {data.permissions.filter((p) => p.group === g).map((p) => (
                <tr key={p.key}>
                  <th scope="row"><span>{p.label}</span><br /><small className="muted">{p.description}</small></th>
                  <td><span className="perm-lock" title="El administrador siempre lo tiene"><Icon name="check" size={16} /><span className="sr-only">Sí, siempre</span></span></td>
                  {data.roles.map((r) => (
                    <td key={r}>
                      {p.adminOnly ? <span className="muted" title="Solo el administrador"><Icon name="lock" size={14} /><span className="sr-only">Solo administrador</span></span> : (
                        <label className="perm-cell">
                          <input type="checkbox" checked={!!draft[r]?.[p.key]} onChange={(e) => { setSaved(''); setDraft({ ...draft, [r]: { ...draft[r], [p.key]: e.target.checked } }); }} />
                          <span className="sr-only">{ROLE_NAME[r]}: {p.label}</span>
                          {differsFromDefault(r, p.key) && <span className="perm-diff" title="Distinto del valor por defecto" aria-label="Distinto del valor por defecto" />}
                        </label>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="dialog-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        {data.roles.map((r) => (
          <span key={r} className="inline-actions">
            <button className="btn" disabled={act.busy || !dirty(r)} onClick={() => void act.run(async () => {
              await api('PUT', `/api/admin/roles/${r}`, { permissions: draft[r] });
              await load();
              setSaved(`Permisos de «${ROLE_NAME[r]}» guardados. Sus sesiones abiertas los ven en segundos.`);
            })}><Icon name="check" /> Guardar {ROLE_NAME[r]}</button>
            <button className="btn secondary" disabled={act.busy} onClick={() => void act.run(async () => {
              if (!window.confirm(`¿Volver a los permisos por defecto de «${ROLE_NAME[r]}»?`)) return;
              await api('DELETE', `/api/admin/roles/${r}`);
              await load();
              setSaved(`«${ROLE_NAME[r]}» volvió a sus permisos por defecto.`);
            })}>Restablecer</button>
          </span>
        ))}
      </div>
    </section>
  );
}
