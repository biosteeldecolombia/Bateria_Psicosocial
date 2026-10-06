import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { MeResponse } from '@sanithelp/shared';
import { api } from './api';
import { Analysis } from './analysis/Analysis';
import { Icon, type IconName } from './icons';
import { EmptyState, Modal, RowMenu, SecretModal, StatusBadge, useAction, type Secret } from './ui';
import { Users, type UserRow } from './Users';

interface Company { id: string; name: string; code: string; nit: string | null; minGroupSize: number; active: boolean }
interface Campaign { id: string; companyId: string; name: string; status: 'open' | 'closed'; companyName: string; accessUsername: string | null; createdAt: string }

type TabKey = 'inicio' | 'empresas' | 'campanas' | 'usuarios' | 'perfil';

/** Datos profesionales de la psicóloga: salen en el consentimiento de cada expediente en PDF. */
function ProfileCard({ onSaved }: { onSaved: () => void }) {
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
  if (!loaded) return <p className="muted" role="status">Cargando…</p>;
  return (
    <section className="panel pad" aria-labelledby="pf" style={{ maxWidth: '40rem' }}>
      <h2 id="pf" className="panel-title"><Icon name="user" size={20} /> Mi perfil profesional</h2>
      <p className="muted">Estos datos aparecen en el consentimiento informado de cada expediente en PDF.</p>
      {!saved && <div className="alert error" role="status">Completa estos datos para poder descargar expedientes en PDF.</div>}
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => { await api('PUT', '/api/profile', { professionalDocument: doc, professionalRegistry: reg }); setSaved(true); onSaved(); });
        }}
      >
        <label htmlFor="pd">Documento de identidad</label>
        <input id="pd" type="text" autoComplete="off" value={doc} onChange={(e) => { setDoc(e.target.value); setSaved(false); }} />
        <label htmlFor="pr">Registro o licencia profesional (SST o psicología)</label>
        <input id="pr" type="text" autoComplete="off" value={reg} onChange={(e) => { setReg(e.target.value); setSaved(false); }} />
        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" disabled={act.busy || !doc || !reg}><Icon name="check" /> {saved ? 'Guardado' : 'Guardar'}</button>
        </div>
      </form>
    </section>
  );
}

function CompanyForm({ onDone, onClose }: { onDone: () => Promise<void>; onClose: () => void }) {
  const act = useAction();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [nit, setNit] = useState('');
  const [min, setMin] = useState(5);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      await api('POST', '/api/admin/companies', { name, code, ...(nit.trim() ? { nit: nit.trim() } : {}), minGroupSize: min });
      await onDone();
      onClose();
    });
  };
  return (
    <Modal title="Nueva empresa" icon="building" onClose={onClose}>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div>
            <label htmlFor="co-n">Nombre</label>
            <input id="co-n" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="co-c">Código corto (letras, números o guion)</label>
            <input id="co-c" type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ACME" />
          </div>
          <div>
            <label htmlFor="co-t">NIT (opcional)</label>
            <input id="co-t" type="text" value={nit} onChange={(e) => setNit(e.target.value)} />
          </div>
          <div>
            <label htmlFor="co-m">Tamaño mínimo de grupo en reportes</label>
            <select id="co-m" value={min} onChange={(e) => setMin(Number(e.target.value))}>
              {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} personas</option>)}
            </select>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={act.busy || name.trim().length < 2 || code.length < 2}><Icon name="check" /> Crear empresa</button>
        </div>
      </form>
    </Modal>
  );
}

function CampaignForm({ companies, initialCompany, onDone, onSecret, onClose }: { companies: Company[]; initialCompany: string; onDone: () => Promise<void>; onSecret: (s: Secret) => void; onClose: () => void }) {
  const act = useAction();
  const [companyId, setCompanyId] = useState(initialCompany || companies[0]?.id || '');
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      const r = await api<{ username: string; password: string }>('POST', '/api/campaigns', { companyId, name });
      await onDone();
      onClose();
      onSecret({ title: 'Credencial de la campaña creada', ...r });
    });
  };
  return (
    <Modal title="Nueva campaña" icon="clipboard" size="sm" onClose={onClose}>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      {companies.length === 0 ? <p className="muted">Aún no tienes empresas asignadas. Pídele al administrador que te asigne una.</p> : (
        <form onSubmit={submit} noValidate>
          <label htmlFor="cm-c">Empresa</label>
          <select id="cm-c" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
          <label htmlFor="cm-n">Nombre de la campaña</label>
          <input id="cm-n" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ronda 2026" />
          <p className="muted">Se genera la credencial que entregas a los colaboradores; todos la comparten y se identifican con su documento.</p>
          <div className="dialog-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button className="btn" disabled={act.busy || name.trim().length < 2 || !companyId}><Icon name="check" /> Crear y generar credencial</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function Management({ me }: { me: MeResponse }) {
  const isAdmin = me.role === 'admin';
  const tabs: { key: TabKey; label: string; icon: IconName }[] = [
    { key: 'inicio', label: 'Inicio', icon: 'home' },
    { key: 'empresas', label: 'Empresas', icon: 'building' },
    { key: 'campanas', label: 'Campañas', icon: 'clipboard' },
    ...(isAdmin ? [{ key: 'usuarios' as const, label: 'Usuarios', icon: 'users' as const }] : [{ key: 'perfil' as const, label: 'Mi perfil', icon: 'user' as const }]),
  ];
  const fromHash = (): TabKey => {
    const h = window.location.hash.replace('#/', '') as TabKey;
    return tabs.some((t) => t.key === h) ? h : 'inicio';
  };

  const [tab, setTabState] = useState<TabKey>(fromHash);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [analysis, setAnalysis] = useState<Campaign | null>(null);
  const [profileDone, setProfileDone] = useState(true);
  const [newCompany, setNewCompany] = useState(false);
  const [newCampaign, setNewCampaign] = useState(false);
  const [newUser, setNewUser] = useState(false);
  const [coFilter, setCoFilter] = useState('');
  const [stFilter, setStFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const act = useAction();

  const setTab = useCallback((k: TabKey) => {
    setTabState(k);
    setAnalysis(null);
    window.history.replaceState(null, '', `#/${k}`);
  }, []);
  useEffect(() => {
    const h = () => setTabState(fromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const [co, ca] = await Promise.all([api<Company[]>('GET', '/api/companies'), api<Campaign[]>('GET', '/api/campaigns')]);
    setCompanies(co);
    setCampaigns(ca);
    setLoaded(true);
  }, []);
  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUsers(await api<UserRow[]>('GET', '/api/admin/users'));
    setUsersLoaded(true);
  }, [isAdmin]);
  const checkProfile = useCallback(() => {
    if (me.role !== 'psychologist') return;
    api<{ professionalDocument: string; professionalRegistry: string }>('GET', '/api/profile')
      .then((r) => setProfileDone(!!r.professionalDocument && !!r.professionalRegistry))
      .catch(() => undefined);
  }, [me.role]);
  useEffect(() => {
    void load().catch(() => setLoaded(true));
    void loadUsers().catch(() => setUsersLoaded(true));
    checkProfile();
  }, [load, loadUsers, checkProfile]);

  const goCampaigns = (companyId = '') => { setCoFilter(companyId); setStFilter(''); setTab('campanas'); };
  const activeCompanies = companies.filter((c) => c.active);
  const openCampaigns = campaigns.filter((c) => c.status === 'open');
  const activeUsers = users.filter((u) => u.active);
  const campaignsOf = (id: string) => campaigns.filter((c) => c.companyId === id);

  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === tab);
    if (e.key === 'ArrowRight') setTab(tabs[(i + 1) % tabs.length]!.key);
    if (e.key === 'ArrowLeft') setTab(tabs[(i + tabs.length - 1) % tabs.length]!.key);
  };

  const kpis: { key: TabKey; icon: IconName; value: number; label: string; hint: string; add?: { label: string; onClick: () => void } }[] = [
    { key: 'empresas', icon: 'building', value: activeCompanies.length, label: isAdmin ? 'Empresas activas' : 'Empresas asignadas', hint: 'Ver empresas', add: isAdmin ? { label: 'Nueva empresa', onClick: () => setNewCompany(true) } : undefined },
    { key: 'campanas', icon: 'clipboard', value: openCampaigns.length, label: 'Campañas abiertas', hint: `${campaigns.length} en total`, add: { label: 'Nueva campaña', onClick: () => setNewCampaign(true) } },
    ...(isAdmin ? [{ key: 'usuarios' as const, icon: 'users' as const, value: activeUsers.length, label: 'Usuarios activos', hint: `${users.length} cuentas`, add: { label: 'Nueva cuenta', onClick: () => { setTab('usuarios'); setNewUser(true); } } }] : []),
  ];

  const shownCampaigns = campaigns.filter((c) => (!coFilter || c.companyId === coFilter) && (!stFilter || c.status === stFilter));
  const shownCompanies = companies.filter((c) => showInactive || c.active);

  return (
    <div className="staff">
      <nav className="appnav" aria-label="Secciones">
        <div role="tablist" aria-label="Secciones de gestión" onKeyDown={onKey}>
          {tabs.map((t) => (
            <button key={t.key} role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls="staff-panel" tabIndex={tab === t.key ? 0 : -1} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} /> {t.label}
              {t.key === 'perfil' && !profileDone && <span className="dot-alert" role="img" aria-label="Pendiente" />}
            </button>
          ))}
        </div>
        {tab === 'empresas' && isAdmin && <button className="btn" onClick={() => setNewCompany(true)}><Icon name="plus" /> Nueva empresa</button>}
        {tab === 'campanas' && !analysis && <button className="btn" onClick={() => setNewCampaign(true)}><Icon name="plus" /> Nueva campaña</button>}
        {tab === 'usuarios' && <button className="btn" onClick={() => setNewUser(true)}><Icon name="plus" /> Nueva cuenta</button>}
      </nav>

      <div role="tabpanel" id="staff-panel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {act.error && <div className="alert error" role="alert">{act.error}</div>}

        {tab === 'inicio' && (
          <>
            <div className="page-head">
              <h1>Hola, {me.fullName}</h1>
              <p className="muted">Resumen de tu operación. Haz clic en una tarjeta para ver el detalle.</p>
            </div>
            {me.role === 'psychologist' && !profileDone && (
              <div className="alert error banner" role="status">
                <span>Completa tu perfil profesional para poder descargar expedientes en PDF.</span>
                <button className="btn secondary sm" onClick={() => setTab('perfil')}>Completar perfil <Icon name="arrow" /></button>
              </div>
            )}
            <div className="kpi-grid">
              {kpis.map((k) => (
                <article className="kpi" key={k.key}>
                  <button className="kpi-main" onClick={() => (k.key === 'campanas' ? goCampaigns() : setTab(k.key))}>
                    <span className="kpi-icon"><Icon name={k.icon} size={24} /></span>
                    <span className="kpi-value">{loaded ? k.value : '–'}</span>
                    <span className="kpi-label">{k.label}</span>
                    <span className="kpi-hint">{k.hint} <Icon name="arrow" size={14} /></span>
                  </button>
                  {k.add && <button className="kpi-add" aria-label={k.add.label} title={k.add.label} onClick={k.add.onClick}><Icon name="plus" size={20} /></button>}
                </article>
              ))}
            </div>

            <div className="home-grid">
              <section className="panel pad" aria-labelledby="h-camp">
                <div className="panel-head">
                  <h2 id="h-camp" className="panel-title"><Icon name="clipboard" size={20} /> Campañas recientes</h2>
                  <button className="btn secondary sm" onClick={() => goCampaigns()}>Ver todas</button>
                </div>
                {campaigns.length === 0 ? <EmptyState icon="clipboard" text="Todavía no hay campañas.">{companies.length > 0 && <button className="btn" onClick={() => setNewCampaign(true)}><Icon name="plus" /> Crear campaña</button>}</EmptyState> : (
                  <ul className="list">
                    {campaigns.slice(0, 6).map((c) => (
                      <li key={c.id}>
                        <button className="list-item" onClick={() => { setTab('campanas'); setAnalysis(c); }}>
                          <span><strong>{c.name}</strong><br /><span className="muted">{c.companyName}</span></span>
                          <StatusBadge on={c.status === 'open'} onText="Abierta" offText="Cerrada" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="panel pad" aria-labelledby="h-co">
                <div className="panel-head">
                  <h2 id="h-co" className="panel-title"><Icon name="building" size={20} /> Empresas</h2>
                  <button className="btn secondary sm" onClick={() => setTab('empresas')}>Ver todas</button>
                </div>
                {activeCompanies.length === 0 ? <EmptyState icon="building" text={isAdmin ? 'Aún no hay empresas.' : 'Aún no tienes empresas asignadas.'}>{isAdmin && <button className="btn" onClick={() => setNewCompany(true)}><Icon name="plus" /> Crear empresa</button>}</EmptyState> : (
                  <ul className="list">
                    {activeCompanies.slice(0, 6).map((c) => (
                      <li key={c.id}>
                        <button className="list-item" onClick={() => goCampaigns(c.id)}>
                          <span><strong>{c.name}</strong><br /><span className="muted">{c.code}</span></span>
                          <span className="chip">{campaignsOf(c.id).length} {campaignsOf(c.id).length === 1 ? "campaña" : "campañas"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}

        {tab === 'empresas' && (
          <>
            <div className="page-head row-between">
              <div>
                <h1>Empresas</h1>
                <p className="muted">{isAdmin ? 'Todas las empresas registradas.' : 'Las empresas que tienes asignadas.'}</p>
              </div>
              <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inactivas</label>
            </div>
            {!loaded ? <p className="muted" role="status">Cargando…</p> : shownCompanies.length === 0 ? (
              <EmptyState icon="building" text={isAdmin ? 'Aún no hay empresas.' : 'Aún no tienes empresas asignadas. Pídele al administrador que te asigne una.'}>
                {isAdmin && <button className="btn" onClick={() => setNewCompany(true)}><Icon name="plus" /> Crear empresa</button>}
              </EmptyState>
            ) : (
              <div className="card-grid">
                {shownCompanies.map((c) => {
                  const cps = campaignsOf(c.id);
                  const team = users.filter((u) => u.role === 'psychologist' && u.companies.some((x) => x.id === c.id));
                  return (
                    <article className="panel pad co-card" key={c.id}>
                      <div className="panel-head">
                        <h2 className="panel-title"><Icon name="building" size={20} /> {c.name}</h2>
                        <StatusBadge on={c.active} onText="Activa" offText="Inactiva" />
                      </div>
                      <dl className="facts">
                        <div><dt>Código</dt><dd><code>{c.code}</code></dd></div>
                        <div><dt>NIT</dt><dd>{c.nit || '—'}</dd></div>
                        <div><dt>Grupo mínimo</dt><dd>{c.minGroupSize} personas</dd></div>
                        <div><dt>Campañas</dt><dd>{cps.length} ({cps.filter((x) => x.status === 'open').length} abiertas)</dd></div>
                        {isAdmin && <div><dt>Psicólogas</dt><dd>{team.length ? team.map((u) => u.fullName).join(', ') : 'Sin asignar'}</dd></div>}
                      </dl>
                      <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
                        <button className="btn secondary sm" onClick={() => goCampaigns(c.id)}>Ver campañas <Icon name="arrow" /></button>
                        <button className="btn sm" onClick={() => { setCoFilter(c.id); setNewCampaign(true); }}><Icon name="plus" /> Campaña</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'campanas' && (analysis ? (
          <>
            <button className="btn secondary sm" style={{ marginBottom: '0.75rem' }} onClick={() => setAnalysis(null)}><Icon name="back" /> Volver a campañas</button>
            <Analysis key={analysis.id} campaignId={analysis.id} campaignName={`${analysis.companyName} · ${analysis.name}`} isAdmin={isAdmin} onClose={() => setAnalysis(null)} />
          </>
        ) : (
          <>
            <div className="page-head">
              <h1>Campañas</h1>
              <p className="muted">Cada campaña es una ronda de aplicación con su credencial de acceso para los colaboradores.</p>
            </div>
            <div className="toolbar">
              <div className="field">
                <label htmlFor="f-co">Empresa</label>
                <select id="f-co" value={coFilter} onChange={(e) => setCoFilter(e.target.value)}>
                  <option value="">Todas las empresas</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-st">Estado</label>
                <select id="f-st" value={stFilter} onChange={(e) => setStFilter(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="open">Abiertas</option>
                  <option value="closed">Cerradas</option>
                </select>
              </div>
            </div>
            {!loaded ? <p className="muted" role="status">Cargando…</p> : shownCampaigns.length === 0 ? (
              <EmptyState icon="clipboard" text="No hay campañas que coincidan.">{companies.length > 0 && <button className="btn" onClick={() => setNewCampaign(true)}><Icon name="plus" /> Nueva campaña</button>}</EmptyState>
            ) : (
              <div className="panel table-wrap">
                <table className="table">
                  <caption className="sr-only">Campañas y su credencial de acceso</caption>
                  <thead><tr><th scope="col">Empresa</th><th scope="col">Campaña</th><th scope="col">Usuario de acceso</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                  <tbody>
                    {shownCampaigns.map((c) => (
                      <tr key={c.id}>
                        <td>{c.companyName}</td>
                        <td><strong>{c.name}</strong></td>
                        <td><code>{c.accessUsername}</code></td>
                        <td><StatusBadge on={c.status === 'open'} onText="Abierta" offText="Cerrada" /></td>
                        <td className="actions">
                          <button className="btn sm" onClick={() => setAnalysis(c)}><Icon name="chart" /> Resultados</button>
                          <RowMenu
                            label={`Más acciones para ${c.name}`}
                            items={[
                              {
                                label: 'Nueva contraseña de acceso', icon: 'key', onSelect: () => void act.run(async () => {
                                  if (!window.confirm('Se generará una contraseña nueva y la anterior dejará de funcionar. ¿Continuar?')) return;
                                  const r = await api<{ username: string; password: string }>('POST', `/api/campaigns/${c.id}/regenerate-access`);
                                  setSecret({ title: `Nueva contraseña para ${c.name}`, ...r });
                                }),
                              },
                              {
                                label: c.status === 'open' ? 'Cerrar campaña' : 'Reabrir campaña', icon: c.status === 'open' ? 'lock' : 'refresh', onSelect: () => void act.run(async () => {
                                  await api('POST', `/api/campaigns/${c.id}/status`, { status: c.status === 'open' ? 'closed' : 'open' });
                                  await load();
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
          </>
        ))}

        {tab === 'usuarios' && isAdmin && (
          <>
            <div className="page-head">
              <h1>Usuarios</h1>
              <p className="muted">Cuentas de personas con su rol, empresas asignadas y permisos. Las credenciales de colaboradores se gestionan en cada campaña.</p>
            </div>
            <Users
              rows={users}
              loaded={usersLoaded}
              companies={companies}
              reload={async () => { await Promise.all([loadUsers(), load()]); }}
              onSecret={(title, username, password) => setSecret({ title, username, password })}
              openNew={newUser}
              onCloseNew={() => setNewUser(false)}
            />
          </>
        )}

        {tab === 'perfil' && me.role === 'psychologist' && (
          <>
            <div className="page-head"><h1>Mi perfil</h1></div>
            <ProfileCard onSaved={checkProfile} />
          </>
        )}
      </div>

      {newCompany && <CompanyForm onDone={load} onClose={() => setNewCompany(false)} />}
      {newCampaign && <CampaignForm companies={activeCompanies} initialCompany={coFilter} onDone={load} onSecret={setSecret} onClose={() => setNewCampaign(false)} />}
      {secret && <SecretModal s={secret} onClose={() => setSecret(null)} />}
    </div>
  );
}
