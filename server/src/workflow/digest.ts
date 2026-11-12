import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';
import type { Mailer } from '../mail/mailer.js';
import { digestEmail } from '../mail/templates.js';
import { getSetting, putSetting } from '../settings.js';
import { buildAlerts, loadAlertSettings } from './service.js';

/** Líneas del resumen de pendientes de una persona (las mismas alertas que ve en pantalla). */
export async function digestLines(db: Db, crypto: Crypto, actor: { id: string; role: string }): Promise<string[]> {
  return (await buildAlerts(db, crypto, actor)).map((a) => a.text);
}

/** Envía el resumen a una persona. Sin pendientes no se envía nada, salvo que se fuerce (prueba). */
export async function runDigestNow(db: Db, crypto: Crypto, mailer: Mailer, userId: string, force = false): Promise<boolean> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.active || !mailer.enabled) return false;
  const lines = await digestLines(db, crypto, u);
  if (!lines.length && !force) return false;
  const name = crypto.decrypt(u.fullNameEnc);
  await mailer.send(digestEmail({ to: crypto.decrypt(u.usernameEnc), name, lines: lines.length ? lines : ['No tienes pendientes. ¡Todo al día!'] }));
  return true;
}

const bogotaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const bogotaHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false }).format(new Date()));

/** Resumen diario (7 a. m. hora de Colombia) para quienes tienen pendientes, si el administrador lo activó. */
export async function runDailyDigest(db: Db, crypto: Crypto, mailer: Mailer, log: (m: string) => void = () => undefined): Promise<number> {
  if (!mailer.enabled) return 0;
  const settings = await loadAlertSettings(db);
  if (!settings.dailyEmail || bogotaHour() < 7) return 0;
  const today = bogotaDay();
  if ((await getSetting<{ day?: string }>(db, 'digest_last', {})).day === today) return 0;
  await putSetting(db, 'digest_last', { day: today }, null); // primero se marca: si falla un envío no se repite en bucle
  const staff = await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ['admin', 'psychologist', 'assistant']), eq(users.active, true)));
  let sent = 0;
  for (const s of staff) {
    try {
      if (await runDigestNow(db, crypto, mailer, s.id)) sent++;
    } catch (e) {
      log(`Resumen diario: no se pudo enviar (${(e as Error).message})`);
    }
  }
  return sent;
}

export function startDigestScheduler(db: Db, crypto: Crypto, mailer: Mailer, log: (m: string) => void): () => void {
  const t = setInterval(() => void runDailyDigest(db, crypto, mailer, log).catch((e) => log(`Resumen diario: ${(e as Error).message}`)), 30 * 60_000);
  t.unref();
  return () => clearInterval(t);
}
