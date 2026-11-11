import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assistantCampaigns, assistantCompanies, campaigns, psychologistCompanies } from '../db/schema.js';

/**
 * Empresas completas que un usuario de personal puede gestionar.
 * Administrador: todas. Psicóloga: las asignadas. Auxiliar administrativo: las empresas completas que se le asignaron
 * (además puede tener campañas sueltas: ver `assistantScope`).
 */
export async function allowedCompanyIds(db: Db, userId: string, role: string): Promise<string[] | 'all'> {
  if (role === 'admin') return 'all';
  if (role === 'assistant') return (await assistantScope(db, userId)).companyIds;
  return (await db.select({ id: psychologistCompanies.companyId }).from(psychologistCompanies).where(eq(psychologistCompanies.userId, userId))).map((r) => r.id);
}

/** Lo que se le asignó a un auxiliar administrativo: empresas completas y campañas sueltas. */
export async function assistantScope(db: Db, userId: string): Promise<{ companyIds: string[]; campaignIds: string[] }> {
  const [cos, cas] = await Promise.all([
    db.select({ id: assistantCompanies.companyId }).from(assistantCompanies).where(eq(assistantCompanies.userId, userId)),
    db.select({ id: assistantCampaigns.campaignId }).from(assistantCampaigns).where(eq(assistantCampaigns.userId, userId)),
  ]);
  return { companyIds: cos.map((r) => r.id), campaignIds: cas.map((r) => r.id) };
}

/** Campaña gestionable por el usuario, o null (el llamador responde 404 sin revelar su existencia). */
export async function manageableCampaign(db: Db, userId: string, role: string, campaignId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return null;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c) return null;
  if (role === 'assistant') {
    const scope = await assistantScope(db, userId);
    return scope.companyIds.includes(c.companyId) || scope.campaignIds.includes(c.id) ? c : null;
  }
  const ids = await allowedCompanyIds(db, userId, role);
  return ids === 'all' || ids.includes(c.companyId) ? c : null;
}
