import { eq } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { appSettings } from './db/schema.js';

/** Lee un ajuste general; si no existe, devuelve el valor por defecto (los valores guardados se mezclan sobre él si son objetos). */
export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (!row) return fallback;
  if (row.value && typeof row.value === 'object' && !Array.isArray(row.value) && fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
    return { ...(fallback as object), ...(row.value as object) } as T;
  }
  return row.value as T;
}

export async function putSetting(db: Db, key: string, value: unknown, actorId: string | null): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date(), updatedBy: actorId } });
}

export interface SecuritySettings {
  /** Días que un equipo queda recordado tras la verificación en dos pasos (0 = nunca se recuerda). */
  trustedDeviceDays: number;
}
export const DEFAULT_SECURITY: SecuritySettings = { trustedDeviceDays: 14 };
