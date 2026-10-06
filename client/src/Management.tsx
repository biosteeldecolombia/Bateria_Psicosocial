import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MeResponse } from '@sanithelp/shared';
import { api, ApiError } from './api';
import { Analysis } from './analysis/Analysis';

interface Company { id: string; name: string; code: string }
interface Campaign { id: string; name: string; status: 'open' | 'closed'; companyName: string; accessUsername: string | null }
interface Secret { title: string; username: string; password: string }

function SecretBox({ s, onClose }: { s: Secret; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Usuario: ${s.username}\nContraseña: ${s.password}`;
  return (
    <div className="alert ok" role="status">
      <strong>{s.title}</strong>
      <p>Anótala o cópiala ahora: <strong>no se volverá a mostrar</strong>.</p>
      <p className="big-code" style={{ fontSize: '1.2rem' }}>Usuario: {s.username}<br />Contraseña: {s.password}</p>
      <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined)}>{copied ? 'Copiado' : 'Copiar'}</button>{' '}
      <button className="btn secondary" onClick={onClose}>Ya la guardé</button>
    </div>
  );
}

function useAction() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar.');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

/** Datos profesionales de la psicóloga: salen en el consentimiento de cada expediente en PDF. */
function ProfileCard() {
  const [doc, setDoc] = useState('');
  const [reg, setReg] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const act = useAction();
  useEffect(() => {
    api<{ professionalDocument: string; professionalRegistry: string }>('GET', '/api/profile')
      .then((r) => { setDoc(r.professionalDocument); setReg(r.professionalRegistry); setSaved(!!r.professionalDocument && !!r.professionalRegistry); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);
  if (!loaded) return null;
  return (
    <section className="card" aria-labelledby="pf" style={{ marginTop: '1rem' }}>
      <h2 id="pf">Mi perfil profesional</h2>
      {!saved && <div className="alert error" role="status">Completa estos datos para poder descargar expedientes en PDF: aparecen en el consentimiento informado.</div>}
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => { await api('PUT', '/api/profile', { professionalDocument: doc, professionalRegistry: reg }); setSaved(true); });
        }}
      >
        <label htmlFor="pd">Documento de identidad</label>
        <input id="pd" type="text" autoComplete="off" value={doc} onChange={(e) => { setDoc(e.target.value); setSaved(false); }} />
        <label htmlFor="pr">Registro o licencia profesional (SST / psicología)</label>
        <input id="pr" type="text" autoComplete="off" value={reg} onChange={(e) => { setReg(e.target.value); setSaved(false); }} />
        <button className="btn" disabled={act.busy || !doc || !reg}>{saved ? 'Guardado' : 'Guardar'}</button>
      </form>
    </section>
  );
}

export function Management({ me }: { me: MeResponse }) {
  const isAdmin = me.role === 'admin';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [analysis, setAnalysis] = useState<Campaign | null>(null);
  const act = useAction();

  const [companyId, setCompanyId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [coName, setCoName] = useState('');
  const [coCode, setCoCode] = useState('');
  const [uRole, setURole] = useState<'psychologist' | 'admin' | 'company'>('psychologist');
  const [uEmail, setUEmail] = useState('');
  const [uName, setUName] = useState('');
  const [uCompanies, setUCompanies] = useState<string[]>([]);
  const [uRegistry, setURegistry] = useState('');
  const [uDocument, setUDocument] = useState('');

  const load = useCallback(async () => {
    const [co, ca] = await Promise.all([api<Company[]>('GET', '/api/companies'), api<Campaign[]>('GET', '/api/campaigns')]);
    setCompanies(co);
    setCampaigns(ca);
    setCompanyId((cur) => cur || co[0]?.id || '');
  }, []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const createCampaign = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      const r = await api<{ username: string; password: string }>('POST', '/api/campaigns', { companyId, name: campaignName });
      setSecret({ title: 'Credencial de la campaña creada', ...r });
      setCampaignName('');
      await load();
    });
  };
  const createCompany = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      await api('POST', '/api/admin/companies', { name: coName, code: coCode, minGroupSize: 5 });
      setCoName('');
      setCoCode('');
      await load();
    });
  };
  const createUser = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      const r = await api<{ username: string; password: string }>('POST', '/api/admin/users', {
        role: uRole,
        username: uEmail,
        fullName: uName,
        ...(uRole === 'company' ? { companyId: uCompanies[0] } : {}),
        ...(uRole === 'psychologist' ? { assignedCompanyIds: uCompanies, ...(uRegistry ? { professionalRegistry: uRegistry } : {}), ...(uDocument ? { professionalDocument: uDocument } : {}) } : {}),
      });
      setSecret({ title: `Cuenta creada (${uRole === 'psychologist' ? 'psicóloga' : uRole === 'admin' ? 'administrador' : 'empresa cliente'})`, username: r.username, password: r.password });
      setUEmail('');
      setUName('');
      setUCompanies([]);
      setURegistry('');
      setUDocument('');
    });
  };

  return (
    <>
      <section className="card" aria-labelledby="t">
        <h1 id="t">Hola, {me.fullName}</h1>
        <p className="muted">Aquí creas la credencial que entregas a los colaboradores de cada empresa. Todos los colaboradores de una campaña usan la misma credencial y se identifican con su documento.</p>
        {act.error && <div className="alert error" role="alert">{act.error}</div>}
        {secret && <SecretBox s={secret} onClose={() => setSecret(null)} />}
      </section>

      {me.role === 'psychologist' && <ProfileCard />}

      <section className="card" aria-labelledby="c1" style={{ marginTop: '1rem' }}>
        <h2 id="c1">Nueva campaña (ronda de aplicación)</h2>
        {companies.length === 0 ? (
          <p className="muted">{isAdmin ? 'Primero crea una empresa (abajo).' : 'Aún no tienes empresas asignadas. Pídele al administrador que te asigne una.'}</p>
        ) : (
          <form onSubmit={createCampaign} noValidate>
            <label htmlFor="cc">Empresa</label>
            <select id="cc" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
            <label htmlFor="cn">Nombre de la campaña</label>
            <input id="cn" type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ej. Ronda 2026" />
            <button className="btn block" disabled={act.busy || campaignName.trim().length < 2}>Crear campaña y generar credencial</button>
          </form>
        )}
      </section>

      <section className="card" aria-labelledby="c2" style={{ marginTop: '1rem' }}>
        <h2 id="c2">Campañas</h2>
        {campaigns.length === 0 ? <p className="muted">Todavía no hay campañas.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <caption className="sr-only">Campañas y su credencial de acceso</caption>
              <thead><tr><th scope="col">Empresa</th><th scope="col">Campaña</th><th scope="col">Usuario de acceso</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.companyName}</td>
                    <td>{c.name}</td>
                    <td><code>{c.accessUsername}</code></td>
                    <td>{c.status === 'open' ? '● Abierta' : '■ Cerrada'}</td>
                    <td>
                      <button className="btn" onClick={() => setAnalysis(c)}>Ver resultados</button>{' '}
                      <button className="btn secondary" disabled={act.busy} onClick={() => act.run(async () => {
                        if (!window.confirm('Se generará una contraseña nueva y la anterior dejará de funcionar. ¿Continuar?')) return;
                        const r = await api<{ username: string; password: string }>('POST', `/api/campaigns/${c.id}/regenerate-access`);
                        setSecret({ title: `Nueva contraseña para ${c.name}`, ...r });
                      })}>Nueva contraseña</button>{' '}
                      <button className="btn secondary" disabled={act.busy} onClick={() => act.run(async () => {
                        await api('POST', `/api/campaigns/${c.id}/status`, { status: c.status === 'open' ? 'closed' : 'open' });
                        await load();
                      })}>{c.status === 'open' ? 'Cerrar' : 'Reabrir'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {analysis && <Analysis key={analysis.id} campaignId={analysis.id} campaignName={`${analysis.companyName} · ${analysis.name}`} isAdmin={isAdmin} onClose={() => setAnalysis(null)} />}

      {isAdmin && (
        <>
          <section className="card" aria-labelledby="a1" style={{ marginTop: '1rem' }}>
            <h2 id="a1">Nueva empresa</h2>
            <form onSubmit={createCompany} noValidate>
              <label htmlFor="en">Nombre</label>
              <input id="en" type="text" value={coName} onChange={(e) => setCoName(e.target.value)} />
              <label htmlFor="ec">Código corto (letras, números o guion)</label>
              <input id="ec" type="text" value={coCode} onChange={(e) => setCoCode(e.target.value.toUpperCase())} placeholder="ACME" />
              <button className="btn block" disabled={act.busy || coName.trim().length < 2 || coCode.length < 2}>Crear empresa</button>
            </form>
          </section>

          <section className="card" aria-labelledby="a2" style={{ marginTop: '1rem' }}>
            <h2 id="a2">Nueva cuenta de persona</h2>
            <p className="muted">Para psicólogas, administradores o empresas cliente. La contraseña la genera el sistema; si se pierde, se restablece desde aquí.</p>
            <form onSubmit={createUser} noValidate>
              <label htmlFor="ur">Rol</label>
              <select id="ur" value={uRole} onChange={(e) => { setURole(e.target.value as typeof uRole); setUCompanies([]); }}>
                <option value="psychologist">Psicóloga</option>
                <option value="admin">Administrador</option>
                <option value="company">Empresa cliente (solo reportes)</option>
              </select>
              <label htmlFor="ue">Correo (será su usuario)</label>
              <input id="ue" type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
              <label htmlFor="un">Nombre completo</label>
              <input id="un" type="text" value={uName} onChange={(e) => setUName(e.target.value)} />
              {uRole === 'psychologist' && (
                <>
                  <label htmlFor="ud">N.° de identificación de la profesional (aparece en el consentimiento)</label>
                  <input id="ud" type="text" value={uDocument} onChange={(e) => setUDocument(e.target.value)} />
                  <label htmlFor="ur">Registro / licencia profesional</label>
                  <input id="ur" type="text" value={uRegistry} onChange={(e) => setURegistry(e.target.value)} />
                </>
              )}
              {uRole !== 'admin' && (
                <fieldset style={{ border: 0, padding: 0, margin: '1rem 0 0' }}>
                  <legend style={{ fontWeight: 700 }}>{uRole === 'psychologist' ? 'Empresas que atiende' : 'Empresa'}</legend>
                  {companies.map((c) => (
                    <label className="check" key={c.id}>
                      <input
                        type={uRole === 'company' ? 'radio' : 'checkbox'}
                        name="uco"
                        checked={uCompanies.includes(c.id)}
                        onChange={(e) => setUCompanies(uRole === 'company' ? [c.id] : e.target.checked ? [...uCompanies, c.id] : uCompanies.filter((x) => x !== c.id))}
                      />{' '}
                      {c.name}
                    </label>
                  ))}
                </fieldset>
              )}
              <button className="btn block" disabled={act.busy || !uEmail || uName.trim().length < 2 || (uRole === 'company' && !uCompanies.length)}>Crear cuenta</button>
            </form>
          </section>
        </>
      )}
    </>
  );
}
