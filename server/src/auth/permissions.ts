import { defaultMatrix, PERMISSION_KEYS, PERMISSIONS, roleCan, isConfigurableRole, type PermissionKey, type PermissionMatrix } from '@sanithelp/shared';
import type { Db } from '../db/client.js';
import { rolePermissions } from '../db/schema.js';

const TTL_MS = 10_000;

/** Matriz de permisos por rol: valores por defecto + los cambios guardados por el administrador. Se guarda en memoria unos segundos. */
class PermissionStore {
  private cache: PermissionMatrix | null = null;
  private loadedAt = 0;
  constructor(private db: Db) {}

  invalidate() {
    this.cache = null;
  }

  async matrix(): Promise<PermissionMatrix> {
    if (this.cache && Date.now() - this.loadedAt < TTL_MS) return this.cache;
    const m = defaultMatrix();
    for (const r of await this.db.select().from(rolePermissions)) {
      if (!isConfigurableRole(r.role) || !PERMISSION_KEYS.includes(r.permission as PermissionKey)) continue;
      if (PERMISSIONS.find((p) => p.key === r.permission)?.adminOnly) continue; // nunca se conceden a otros roles
      m[r.role][r.permission as PermissionKey] = r.granted;
    }
    this.cache = m;
    this.loadedAt = Date.now();
    return m;
  }

  async listFor(role: string): Promise<PermissionKey[]> {
    const m = await this.matrix();
    return PERMISSION_KEYS.filter((k) => roleCan(m, role as never, k));
  }
}

const stores = new WeakMap<Db, PermissionStore>();
export function permissionStore(db: Db): PermissionStore {
  let s = stores.get(db);
  if (!s) {
    s = new PermissionStore(db);
    stores.set(db, s);
  }
  return s;
}
