import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { CARGO_OPTIONS } from '@sanithelp/shared';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psyA: Client;
let psyB: Client;
let companyId: string;
let idB: string;

/** PNG válido de 240 × 80 con trazos oscuros (un garabato que simula una firma). */
function fakeSignaturePng(): Buffer {
  const w = 240;
  const h = 80;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const on = Math.abs(y - (40 + 25 * Math.sin(x / 9))) < 2.5;
      const o = row + 1 + x * 4;
      raw[o] = on ? 20 : 255;
      raw[o + 1] = on ? 20 : 255;
      raw[o + 2] = on ? 90 : 255;
      raw[o + 3] = on ? 255 : 0;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dataUrl = (b: Buffer, mime = 'image/png') => `data:${mime};base64,${b.toString('base64')}`;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  companyId = (await admin.call('POST', '/api/admin/companies', { name: 'Empresa Firma', code: 'FIR1', minGroupSize: 5 })).json.id;
  const mk = async (user: string, name: string, doc: string) => {
    const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: `${user}@sanithelp.test`, fullName: name, assignedCompanyIds: [companyId], professionalRegistry: `Reg ${doc}`, professionalDocument: doc });
    return { id: u.json.id as string, client: (await loginStaffReady(env, `${user}@sanithelp.test`, u.json.password)).client };
  };
  psyA = (await mk('fa', 'Ana Firmas', '1111111')).client;
  const b = await mk('fb', 'Beatriz Firmas', '2222222');
  psyB = b.client;
  idB = b.id;
}, 120_000);
afterAll(async () => {
  await env?.stop();
});

const ficha = {
  '1': 'Ana Prueba', '2': 'Masculino', '3': 1990, '4': 'Soltero (a)', '5': 'Profesional completo', '6': 'Técnico',
  '7': { city: 'Barranquilla', department: 'Atlántico' }, '8': '3', '9': 'Propia', '10': 2,
  '11': { city: 'Barranquilla', department: 'Atlántico' }, '12': { lessThanYear: false, years: 4 }, '13': 'Operario',
  '14': CARGO_OPTIONS[3], '15': { lessThanYear: true }, '16': 'Mantenimiento', '17': 'Término indefinido', '18': 8, '19': 'Fijo (diario, semanal, quincenal o mensual)',
};
const pdf = (c: Client, url: string) => env.app.inject({ method: 'GET', url, headers: { origin: 'http://localhost:3000', cookie: c.cookie, 'x-csrf-token': c.csrf } });

describe('firma de la psicóloga', () => {
  it('carga solo PNG/JPG reales, se guarda cifrada y se puede quitar', async () => {
    const png = fakeSignaturePng();
    expect((await psyA.call('PUT', '/api/profile/signature', { image: 'hola' })).status).toBe(400);
    expect((await psyA.call('PUT', '/api/profile/signature', { image: dataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.repeat(5)), 'image/png') })).status).toBe(400); // cabecera falsa
    expect((await psyA.call('PUT', '/api/profile/signature', { image: dataUrl(png, 'image/jpeg') })).status).toBe(400); // tipo que no coincide
    expect((await psyA.call('PUT', '/api/profile/signature', { image: dataUrl(png, 'image/svg+xml') })).status).toBe(400);
    expect((await psyA.call('PUT', '/api/profile/signature', { image: dataUrl(png) })).status).toBe(200);
    expect((await psyA.call('GET', '/api/profile')).json.signature).toBe(dataUrl(png));
    const raw = await env.pool.query("SELECT signature_enc FROM users WHERE signature_enc IS NOT NULL");
    expect(raw.rows).toHaveLength(1);
    expect(raw.rows[0].signature_enc).not.toContain(png.toString('base64').slice(0, 40));
    // Solo la psicóloga carga su firma
    expect((await admin.call('PUT', '/api/profile/signature', { image: dataUrl(png) })).status).toBeGreaterThanOrEqual(400);
    expect((await psyB.call('GET', '/api/profile')).json.signature).toBeNull();
  });

  it('la campaña tiene responsable: quien la crea, o la que elija el administrador', async () => {
    const camp = await psyA.call('POST', '/api/campaigns', { companyId, name: 'Ronda firma', assessments: ['acrofobia'] });
    const id = camp.json.id as string;
    const list = (await psyA.call('GET', '/api/campaigns')).json as { id: string; responsibleName: string | null }[];
    expect(list.find((c) => c.id === id)!.responsibleName).toBe('Ana Firmas');
    const opts = (await admin.call('GET', `/api/campaigns/${id}/responsibles`)).json;
    expect(opts.options.map((o: { name: string }) => o.name).sort()).toEqual(['Ana Firmas', 'Beatriz Firmas']);
    expect(opts.options.find((o: { name: string; hasSignature: boolean }) => o.name === 'Ana Firmas').hasSignature).toBe(true);
    expect((await admin.call('PATCH', `/api/campaigns/${id}`, { responsibleId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect((await admin.call('PATCH', `/api/campaigns/${id}`, { responsibleId: idB })).status).toBe(200);
    expect(((await admin.call('GET', '/api/campaigns')).json as { id: string; responsibleName: string }[]).find((c) => c.id === id)!.responsibleName).toBe('Beatriz Firmas');
    expect((await admin.call('PATCH', `/api/campaigns/${id}`, { name: 'Ronda firma 2' })).status).toBe(200); // renombrar sigue funcionando
    expect((await admin.call('PATCH', `/api/campaigns/${id}`, {})).status).toBe(404);
  });

  it('el expediente lleva la firma de la responsable de la campaña (no la de quien lo descarga)', async () => {
    const png = fakeSignaturePng();
    const mkCampaign = async (responsible: Client) => {
      const camp = await responsible.call('POST', '/api/campaigns', { companyId, name: `Firma ${Math.random()}`, assessments: ['claustrofobia'] });
      const cl = newClient(env);
      await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
      await cl.call('POST', '/api/participation/start', { document: String(Math.floor(1e7 + Math.random() * 9e7)), names: 'Ana', surnames: 'Prueba' });
      const consent = await cl.call('GET', '/api/participation/consent');
      await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash });
      await cl.call('PUT', '/api/participation/ficha', { data: ficha, complete: true });
      const p = (await responsible.call('GET', `/api/campaigns/${camp.json.id}/participants`)).json[0] as { id: string };
      return { campaignId: camp.json.id as string, participantId: p.id };
    };
    const a = await mkCampaign(psyA); // responsable A (con firma)
    const b = await mkCampaign(psyB); // responsable B (sin firma)
    const withSig = await pdf(psyA, `/api/participants/${a.participantId}/expediente.pdf`);
    const noSig = await pdf(psyB, `/api/participants/${b.participantId}/expediente.pdf`);
    expect(withSig.statusCode, withSig.body).toBe(200);
    expect(noSig.statusCode, noSig.body).toBe(200);
    expect(withSig.rawPayload.length - noSig.rawPayload.length).toBeGreaterThan(png.length / 2);

    // El administrador descarga el expediente de la campaña de A: sale la firma de A, no se queda sin ella.
    const byAdmin = await pdf(admin, `/api/participants/${a.participantId}/expediente.pdf?justification=Soporte%20tecnico%20caso%2077`);
    expect(byAdmin.statusCode, byAdmin.body).toBe(200);
    expect(byAdmin.rawPayload.length - noSig.rawPayload.length).toBeGreaterThan(png.length / 2);

    // Al quitar la firma, los documentos nuevos salen sin ella
    expect((await psyA.call('DELETE', '/api/profile/signature')).status).toBe(200);
    const after = await pdf(psyA, `/api/participants/${a.participantId}/expediente.pdf`);
    expect(withSig.rawPayload.length - after.rawPayload.length).toBeGreaterThan(png.length / 2);
  });
});
