import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { campaigns, psychologistCompanies } from '../db/schema.js';

/** Empresas que un usuario de personal puede gestionar. Administrador: todas. Psicóloga: las asignadas. */
export async function allowedCompanyIds(db: Db, userId: string, role: string): Promise<string[] | 'all'> {
  if (role === 'admin') return 'all';
  return (await db.select({ id: psychologistCompanies.companyId }).from(psychologistCompanies).where(eq(psychologistCompanies.userId, userId))).map((r) => r.id);
}

/** Campaña gestionable por el usuario, o null (el llamador responde 404 sin revelar su existencia). */
export async function manageableCampaign(db: Db, userId: string, role: string, campaignId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return null;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c) return null;
  const ids = await allowedCompanyIds(db, userId, role);
  return ids === 'all' || ids.includes(c.companyId) ? c : null;
}
