import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, getCsrf } from '../api';
import { BulkExport, downloadFile } from './BulkExport';
import { Icon, type IconName } from '../icons';
import { DISC_PATTERN_LABELS, ReportRow, ScoreBar } from './Reports';
import { Loading } from '../BrandLoader';
import { FormatoView } from './Formato';
import { RowMenu } from '../ui';

/** Niveles con color Y texto Y símbolo (nunca solo color). */
const LEVEL_ICON: IconName[] = ['check', 'circle', 'half', 'triangle', 'octagon'];
export function Level({ text, index }: { text: string; index: number }) {
  if (index < 0) return <span className="lvl lvx">— {text}</span>;
  return (
    <span className={`lvl lv${index}`}>
      <Icon name={LEVEL_ICON[index]!} size={14} /> {text}
    </span>
  );
}
const levelIndex = (levels: readonly string[], v: unknown) => levels.findIndex((l) => l.toLowerCase() === String(v).toLowerCase());

interface Summary {
  people: number;
  intra: Counts;
  extra: Counts;
  total: Counts;
  stress: Counts;
  percent: Record<'intra' | 'extra' | 'total' | 'stress', number[]>;
  average: Record<'intra' | 'extra' | 'total' | 'stress', number | null>;
}
interface Counts {
  counts: number[];
  invalid: number;
  total: number;
}
interface DomainTable {
  title: string;
  levels: string[];
  rows: { label: string; kind: string; counts: number[]; invalid: number; intervention: number; interventionText: string }[];
}
interface Participant {
  id: string;
  document: string;
  fullName: string;
  status: string;
  consent: string | null;
  form: string | null;
  formManual?: boolean;
  progress: { ficha: boolean; intralaboral: boolean; extralaboral: boolean; estres: boolean; disc: boolean; discOutdated?: boolean; valanti: boolean; pf16: boolean; acrofobia?: boolean; claustrofobia?: boolean };
  submittedAt: string | null;
}

const STATUS: Record<string, string> = { in_progress: 'En curso', completed: 'Completó', declined: 'No autorizó', revoked: 'Revocó' };
const CONSENT: Record<string, string> = { authorized: 'Autorizó', declined: 'No autorizó', revoked: 'Revocó' };

type Tab = 'participants' | 'summary' | 'group' | 'domains' | 'register' | 'disc' | 'valanti' | 'pf16' | 'acrofobia' | 'claustrofobia';
const TABS: [Tab, string][] = [
  ['participants', 'Participantes'],
  ['summary', 'Resumen total'],
  ['group', 'Resumen por grupo'],
  ['domains', 'Dominios y dimensiones'],
  ['register', 'Registro individual'],
  ['disc', 'DISC'],
  ['valanti', 'VALANTI'],
  ['pf16', '16PF'],
  ['acrofobia', 'Acrofobia'],
  ['claustrofobia', 'Claustrofobia'],
];

/** `isAdmin`: debe escribir el motivo del acceso (administrador y auxiliar). `limited`: auxiliar administrativo, solo listado y descargas. */
export function Analysis({ campaignId, campaignName, assessments, isAdmin, limited = false, onClose }: { campaignId: string; campaignName: string; assessments: string[]; isAdmin: boolean; limited?: boolean; onClose: () => void }) {
  const hasPsy = assessments.includes('psychosocial');
  const hasDisc = assessments.includes('disc');
  const hasValanti = assessments.includes('valanti');
  const hasPf16 = assessments.includes('pf16');
  const hasAcro = assessments.includes('acrofobia');
  const hasClq = assessments.includes('claustrofobia');
  const tabs = TABS.filter(([k]) => limited ? k === 'participants' : (k === 'disc' ? hasDisc : k === 'valanti' ? hasValanti : k === 'pf16' ? hasPf16 : k === 'acrofobia' ? hasAcro : k === 'claustrofobia' ? hasClq : k === 'participants' || hasPsy));
  const [tab, setTab] = useState<Tab>(hasPsy && !limited ? 'summary' : 'participants');
  const [reason, setReason] = useState('');
  const [reasonOk, setReasonOk] = useState(!isAdmin);

  const q = (extra = '') => {
    const p = new URLSearchParams(extra);
    if (isAdmin) p.set('justification', reason);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex(([k]) => k === tab);
    if (e.key === 'ArrowRight') setTab(tabs[(i + 1) % tabs.length]![0]);
    if (e.key === 'ArrowLeft') setTab(tabs[(i + tabs.length - 1) % tabs.length]![0]);
  };

  return (
    <section className="card" aria-labelledby="an-t" style={{ marginTop: '1rem' }}>
      <div className="row-between">
        <h2 id="an-t" style={{ margin: 0 }}>Análisis de resultados · {campaignName}</h2>
        <button className="btn secondary" onClick={onClose}>Cerrar análisis</button>
      </div>
      <p className="muted">Información clínica confidencial para el profesional responsable. Cada consulta queda registrada en la auditoría.</p>
      {isAdmin && !reasonOk && (
        <form className="alert ok" onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 10) setReasonOk(true); }}>
          <label htmlFor="why">Motivo del acceso a resultados clínicos (se registra)</label>
          <input id="why" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn" disabled={reason.trim().length < 10} style={{ marginTop: '0.5rem' }}>Continuar</button>
        </form>
      )}
      {reasonOk && (
        <>
          <div role="tablist" aria-label="Secciones del análisis" className="tabs" onKeyDown={onKey}>
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {tab === 'participants' && <Participants campaignId={campaignId} qs={q} reason={reason} hasPsy={hasPsy} limited={limited} assessments={assessments} />}
            {tab === 'summary' && <SummaryView campaignId={campaignId} qs={q} />}
            {tab === 'group' && <GroupView campaignId={campaignId} qs={q} kind="summary" />}
            {tab === 'domains' && <GroupView campaignId={campaignId} qs={q} kind="domains" />}
            {tab === 'register' && <Register campaignId={campaignId} qs={q} />}
            {tab === 'disc' && <DiscView campaignId={campaignId} qs={q} />}
            {tab === 'valanti' && <ValantiView campaignId={campaignId} qs={q} />}
            {tab === 'pf16' && <Pf16View campaignId={campaignId} qs={q} />}
            {tab === 'acrofobia' && <AcrofobiaView campaignId={campaignId} qs={q} />}
            {tab === 'claustrofobia' && <ClaustrofobiaView campaignId={campaignId} qs={q} />}
          </div>
        </>
      )}
    </section>
  );
}

function useLoad<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!url) return;
    let off = false;
    setLoading(true);
    setError('');
    api<T>('GET', url)
      .then((d) => !off && setData(d))
      .catch((e) => !off && setError(e instanceof ApiError ? e.message : 'No se pudo cargar.'))
      .finally(() => !off && setLoading(false));
    return () => { off = true; };
  }, [url]);
  return { data, error, loading };
}

/** Derechos del titular: corregir datos o suprimirlos, a solicitud de la persona. */
function RightsForm({ person, mode, onClose, onDone }: { person: Participant; mode: 'edit' | 'erase'; onClose: () => void; onDone: () => void }) {
  const [names, setNames] = useState('');
  const [surnames, setSurnames] = useState('');
  const [document, setDocument] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'edit') {
        const body = { ...(names && { names }), ...(surnames && { surnames }), ...(document && { document }) };
        await api('PATCH', `/api/participants/${person.id}`, body);
      } else {
        await api('POST', `/api/participants/${person.id}/erase`, { password });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="alert" onSubmit={submit} noValidate aria-label={mode === 'edit' ? 'Corregir datos' : 'Suprimir datos'}>
      {mode === 'edit' ? (
        <>
          <strong>Corregir datos de {person.fullName}</strong>
          <p className="muted">Escribe solo lo que cambia; lo que dejes vacío se conserva.</p>
          <label htmlFor="rn">Nombres</label>
          <input id="rn" value={names} onChange={(e) => setNames(e.target.value)} autoComplete="off" />
          <label htmlFor="rs">Apellidos</label>
          <input id="rs" value={surnames} onChange={(e) => setSurnames(e.target.value)} autoComplete="off" />
          <label htmlFor="rd">Documento</label>
          <input id="rd" value={document} onChange={(e) => setDocument(e.target.value)} autoComplete="off" />
        </>
      ) : (
        <>
          <strong>Suprimir los datos de {person.fullName}</strong>
          <p>Se borran sus respuestas, su ficha y sus datos personales, y deja de contar en los resultados. <strong>No se puede deshacer.</strong> Solo se conserva la constancia del consentimiento (revocada) y el registro de auditoría.</p>
          <label htmlFor="rp">Tu contraseña, para confirmar</label>
          <input id="rp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className={mode === 'erase' ? 'btn danger' : 'btn'} disabled={busy || (mode === 'erase' ? !password : !names && !surnames && !document)}>{mode === 'edit' ? 'Guardar cambios' : 'Suprimir definitivamente'}</button>{' '}
      <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
    </form>
  );
}

/** Pruebas que se pueden repetir, según lo que la persona ya respondió. */
function repeatOptions(p: Participant): { id: string; label: string }[] {
  const pr = p.progress;
  return [
    pr.intralaboral && p.form ? { id: `intra_${p.form}`, label: `Batería · Intralaboral (forma ${p.form})` } : null,
    pr.extralaboral ? { id: 'extra', label: 'Batería · Extralaboral' } : null,
    pr.estres ? { id: 'stress', label: 'Batería · Estrés' } : null,
    pr.disc || pr.discOutdated ? { id: 'disc', label: pr.discOutdated ? 'DISC (respuestas antiguas, por repetir)' : 'DISC' } : null,
    pr.valanti ? { id: 'valanti', label: 'VALANTI' } : null,
    pr.pf16 ? { id: 'pf16', label: '16PF' } : null,
    pr.acrofobia ? { id: 'acrofobia', label: 'Acrofobia (Cohen)' } : null,
    pr.claustrofobia ? { id: 'claustrofobia', label: 'Claustrofobia (CLQ)' } : null,
  ].filter((o): o is { id: string; label: string } => o !== null);
}

/** La psicóloga elige qué prueba debe responder de nuevo la persona; se borran solo esas respuestas. */
function RepeatForm({ person, onClose, onDone }: { person: Participant; onClose: () => void; onDone: (m: string) => void }) {
  const options = repeatOptions(person);
  const [instrument, setInstrument] = useState('');
  const [why, setWhy] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('POST', `/api/participants/${person.id}/reopen`, { instrument, reason: why, password });
      onDone(`Se reabrió «${options.find((o) => o.id === instrument)?.label}» de ${person.fullName}. Para responderla de nuevo, la persona entra con la credencial de la campaña y retoma con su documento y su código personal (si lo perdió, usa «Nuevo código»).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reabrir la prueba.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="alert" onSubmit={submit} noValidate aria-label="Repetir una prueba">
      <strong>Repetir una prueba de {person.fullName}</strong>
      <p className="muted">Se borran las respuestas de la prueba que elijas; las demás se conservan. La participación vuelve a «En curso» y la persona debe responderla de nuevo y volver a enviar.</p>
      {options.length === 0 ? <p>Esta persona todavía no tiene pruebas respondidas.</p> : (
        <fieldset className="plain">
          <legend><strong>¿Qué prueba debe repetir?</strong></legend>
          {options.map((o) => (
            <label key={o.id} className="check opt"><input type="radio" name={`rep-${person.id}`} checked={instrument === o.id} onChange={() => setInstrument(o.id)} /> {o.label}</label>
          ))}
        </fieldset>
      )}
      <label htmlFor={`rr-${person.id}`}>Motivo (queda en la auditoría)</label>
      <input id={`rr-${person.id}`} value={why} onChange={(e) => setWhy(e.target.value)} autoComplete="off" placeholder="Ej. La persona no entendió las instrucciones" />
      <label htmlFor={`rpw-${person.id}`}>Tu contraseña, para confirmar</label>
      <input id={`rpw-${person.id}`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="btn" disabled={busy || !instrument || why.trim().length < 10 || !password}>{busy ? 'Reabriendo…' : 'Reabrir la prueba'}</button>{' '}
      <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
    </form>
  );
}

/** La psicóloga fija la forma intralaboral (A o B) cuando difiere de la que resulta de la pregunta 14. */
function FormSwitch({ person, onClose, onDone }: { person: Participant; onClose: () => void; onDone: (m: string) => void }) {
  const next = person.form === 'A' ? 'B' : 'A';
  const [why, setWhy] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ needsIntra: boolean; status: string }>('POST', `/api/participants/${person.id}/form`, { form: next, reason: why, password });
      onDone(`${person.fullName} quedó en la forma ${next}.${r.needsIntra ? ` Debe responder el intralaboral de la forma ${next}: entra con la credencial de la campaña y retoma con su documento y su código personal (si lo perdió, usa «Nuevo código»).` : ''}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la forma.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="alert" onSubmit={submit} noValidate aria-label="Cambiar la forma">
      <strong>Cambiar a la forma {next} · {person.fullName}</strong>
      <p className="muted">Hoy está en la forma {person.form}{person.formManual ? ' (fijada a mano)' : ' (según la pregunta 14 de la ficha)'}. Se conservan todas las respuestas; si todavía no tiene completo el intralaboral de la forma {next}, la participación vuelve a «En curso» para que lo responda. Los resultados se calculan con la forma {next}.</p>
      <label htmlFor={`fm-${person.id}`}>Motivo (queda en la auditoría)</label>
      <input id={`fm-${person.id}`} value={why} onChange={(e) => setWhy(e.target.value)} autoComplete="off" placeholder="Ej. Su cargo real es operativo, aunque marcó jefatura" />
      <label htmlFor={`fpw-${person.id}`}>Tu contraseña, para confirmar</label>
      <input id={`fpw-${person.id}`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="btn" disabled={busy || why.trim().length < 10 || !password}>{busy ? 'Guardando…' : `Pasar a la forma ${next}`}</button>{' '}
      <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
    </form>
  );
}

/** `hasPsy`: la forma A/B solo existe en la batería psicosocial; sin ella no se muestra. */
function Participants({ campaignId, qs, reason, hasPsy, limited, assessments }: { campaignId: string; qs: (e?: string) => string; reason: string; hasPsy: boolean; limited: boolean; assessments: string[] }) {
  const [tick, setTick] = useState(0);
  const [bulk, setBulk] = useState(false);
  const [pdfErr, setPdfErr] = useState('');
  // El auxiliar no consulta los grupos de resultados (el filtro por área del ZIP queda sin opciones).
  const areas = useLoad<{ values: { value: string; people: number }[] }>(limited ? null : `/api/campaigns/${campaignId}/groups${qs('field=Dpto%2FArea%2FSecc')}`);
  const { data, error, loading } = useLoad<Participant[]>(`/api/campaigns/${campaignId}/participants?t=${tick}`);
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const [rights, setRights] = useState<{ person: Participant; mode: 'edit' | 'erase' } | null>(null);
  const [repeat, setRepeat] = useState<Participant | null>(null);
  const [formFor, setFormFor] = useState<Participant | null>(null);
  const [notice, setNotice] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  const rows = data ?? [];
  const count = (f: (p: Participant) => boolean) => rows.filter(f).length;
  return (
    <>
      <ul className="kpis">
        <li><strong>{rows.length}</strong> con acceso iniciado</li>
        <li><strong>{count((p) => p.status === 'completed')}</strong> completaron</li>
        <li><strong>{count((p) => p.status === 'in_progress')}</strong> en curso</li>
        <li><strong>{count((p) => p.status === 'declined')}</strong> no autorizaron</li>
      </ul>
      <div className="row-between">
        <span />
        <button className="btn" onClick={() => setBulk(true)} disabled={rows.length === 0}>Descargar expedientes (ZIP)</button>
      </div>
      {pdfErr && <div className="alert error" role="alert">{pdfErr}</div>}
      {bulk && <BulkExport campaignId={campaignId} reason={reason} areas={areas.data?.values ?? []} onClose={() => setBulk(false)} />}
      {code && (
        <div className="alert ok" role="status">
          Nuevo código para <strong>{code.name}</strong>: <span className="big-code" style={{ fontSize: '1.3rem', display: 'inline-block', margin: 0 }}>{code.code}</span>
          <p>Entrégaselo a la persona; no se volverá a mostrar.</p>
          <button className="btn secondary" onClick={() => setCode(null)}>Ya lo entregué</button>
        </div>
      )}
      {notice && <div className="alert ok" role="status">{notice} <button className="btn secondary" onClick={() => setNotice('')}>Entendido</button></div>}
      {repeat && <RepeatForm key={repeat.id} person={repeat} onClose={() => setRepeat(null)} onDone={(m) => { setRepeat(null); setNotice(m); setTick((t) => t + 1); }} />}
      {formFor && <FormSwitch key={formFor.id} person={formFor} onClose={() => setFormFor(null)} onDone={(m) => { setFormFor(null); setNotice(m); setTick((t) => t + 1); }} />}
      {rights && <RightsForm key={rights.person.id + rights.mode} {...rights} onClose={() => setRights(null)} onDone={() => { setRights(null); setTick((t) => t + 1); }} />}
      {rows.length === 0 ? <p className="muted">Todavía nadie ha iniciado esta campaña.</p> : (
        <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
          <table className="table">
            <caption className="sr-only">Participantes de la campaña</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Nombre</th><th scope="col">Estado</th><th scope="col">Consentimiento</th>{hasPsy && !limited && <th scope="col">Forma</th>}<th scope="col">Avance</th><th scope="col">Acción</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.document}</td>
                  <td>{p.fullName}</td>
                  <td>{STATUS[p.status] ?? p.status}</td>
                  <td>{p.consent ? CONSENT[p.consent] : 'Pendiente'}</td>
                  {hasPsy && !limited && (
                  <td>
                    {p.form ? (
                      <div role="group" aria-label={`Forma de ${p.fullName}`} style={{ display: 'inline-flex', gap: 2 }}>
                        {(['A', 'B'] as const).map((f) => (
                          <button key={f} type="button" className={p.form === f ? 'btn' : 'btn secondary'} aria-pressed={p.form === f} disabled={p.status === 'revoked' || p.status === 'declined'} title={p.form === f ? `Forma ${f}` : `Pasar a la forma ${f}`} onClick={() => { if (p.form !== f) { setRepeat(null); setRights(null); setFormFor(p); } }}>{f}</button>
                        ))}
                      </div>
                    ) : '—'}
                    {p.formManual && <div className="muted">manual</div>}
                  </td>
                  )}
                  <td>{[p.progress.ficha && 'Ficha', p.progress.intralaboral && 'Intra', p.progress.extralaboral && 'Extra', p.progress.estres && 'Estrés', p.progress.disc && 'DISC', p.progress.discOutdated && 'DISC (por repetir)', p.progress.valanti && 'VALANTI', p.progress.pf16 && '16PF', p.progress.acrofobia && 'Acrofobia', p.progress.claustrofobia && 'CLQ'].filter(Boolean).join(' · ') || '—'}</td>
                  <td>
                    {p.consent && (
                      <button className="btn secondary" onClick={async () => { setPdfErr(''); try { await downloadFile(`/api/participants/${p.id}/expediente.pdf${qs()}`, `Expediente_${p.document}.pdf`); } catch (e) { setPdfErr((e as Error).message); } }}>PDF</button>
                    )}{' '}
                    {limited && p.status === 'completed' && (() => {
                      // Informes en PDF de las pruebas que la persona respondió (el auxiliar descarga, no ve resultados)
                      const docs: { label: string; path: string; name: string }[] = [];
                      const add = (ok: boolean, label: string, path: string, name: string) => { if (ok) docs.push({ label, path, name }); };
                      add(assessments.includes('disc') && !!p.progress.disc, 'Informe DISC', 'disc.pdf', `DISC_${p.document}.pdf`);
                      add(assessments.includes('valanti') && !!p.progress.valanti, 'Informe VALANTI', 'valanti.pdf', `VALANTI_${p.document}.pdf`);
                      add(assessments.includes('pf16') && !!p.progress.pf16, 'Hoja de respuestas 16PF', 'pf16.pdf', `16PF_${p.document}.pdf`);
                      add(assessments.includes('acrofobia') && !!p.progress.acrofobia, 'Informe de Acrofobia', 'acrofobia.pdf', `Acrofobia_${p.document}.pdf`);
                      add(assessments.includes('acrofobia') && !!p.progress.acrofobia, 'Formato · Trabajo en alturas', 'formatos/alturas/pdf', `Formato_alturas_${p.document}.pdf`);
                      add(assessments.includes('claustrofobia') && !!p.progress.claustrofobia, 'Informe CLQ', 'claustrofobia.pdf', `CLQ_${p.document}.pdf`);
                      add(assessments.includes('claustrofobia') && !!p.progress.claustrofobia, 'Formato · Espacios confinados', 'formatos/confinados/pdf', `Formato_confinados_${p.document}.pdf`);
                      if (!docs.length) return null;
                      return (
                        <RowMenu
                          label={`Informes en PDF de ${p.fullName}`}
                          items={docs.map((d) => ({ label: d.label, icon: 'folder' as const, onSelect: async () => { setPdfErr(''); try { await downloadFile(`/api/participants/${p.id}/${d.path}${qs()}`, d.name); } catch (e) { setPdfErr((e as Error).message); } } }))}
                        />
                      );
                    })()}
                    {!limited && p.status === 'in_progress' && (
                      <button className="btn secondary" onClick={async () => { const r = await api<{ resumeCode: string }>('POST', `/api/participants/${p.id}/reset-code`); setCode({ name: p.fullName, code: r.resumeCode }); setTick((t) => t + 1); }}>Nuevo código</button>
                    )}{' '}
                    {!limited && p.status !== 'revoked' && (
                      <>
                        {p.consent === 'authorized' && repeatOptions(p).length > 0 && <><button className="btn secondary" onClick={() => { setRights(null); setFormFor(null); setRepeat(p); }}>Repetir prueba</button>{' '}</>}
                        <button className="btn secondary" onClick={() => { setRepeat(null); setFormFor(null); setRights({ person: p, mode: 'edit' }); }}>Corregir</button>{' '}
                        <button className="btn secondary" onClick={() => { setRepeat(null); setFormFor(null); setRights({ person: p, mode: 'erase' }); }}>Suprimir</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function SummaryTables({ s, levels }: { s: Summary; levels: { intra: string[]; stress: string[] } }) {
  const block = (title: string, c: Counts, pct: number[], lv: string[], avg: number | null) => (
    <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)" key={title}>
      <table className="table">
        <caption>{title}{avg !== null && <span className="muted"> · puntaje transformado promedio: {avg}</span>}</caption>
        <thead><tr><th scope="col">Nivel</th><th scope="col">Personas</th><th scope="col">%</th></tr></thead>
        <tbody>
          {lv.map((l, i) => (
            <tr key={l}><th scope="row"><Level text={l} index={i} /></th><td>{c.counts[i]}</td><td>{pct[i]} %</td></tr>
          ))}
          <tr><th scope="row">Inválidos</th><td>{c.invalid}</td><td></td></tr>
          <tr><th scope="row">Total encuestas</th><td>{c.total}</td><td></td></tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="grid">
      {block('Riesgo intralaboral', s.intra, s.percent.intra, levels.intra, s.average.intra)}
      {block('Riesgo extralaboral', s.extra, s.percent.extra, levels.intra, s.average.extra)}
      {block('Riesgo total (intra + extralaboral)', s.total, s.percent.total, levels.intra, s.average.total)}
      {block('Síntomas de estrés', s.stress, s.percent.stress, levels.stress, s.average.stress)}
    </div>
  );
}

function SummaryView({ campaignId, qs }: { campaignId: string; qs: (e?: string) => string }) {
  const { data, error, loading } = useLoad<{ levels: { intra: string[]; stress: string[] }; summary: Summary }>(`/api/campaigns/${campaignId}/summary${qs()}`);
  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  if (!data) return null;
  return (
    <>
      <p><strong>Personas evaluadas:</strong> {data.summary.people}</p>
      {data.summary.people === 0 ? <p className="muted">Aún no hay baterías completadas en esta campaña.</p> : <SummaryTables s={data.summary} levels={data.levels} />}
    </>
  );
}

function GroupView({ campaignId, qs, kind }: { campaignId: string; qs: (e?: string) => string; kind: 'summary' | 'domains' }) {
  const [field, setField] = useState('');
  const [value, setValue] = useState('*');
  const fields = useLoad<{ fields: string[] }>(`/api/campaigns/${campaignId}/groups${qs()}`);
  const values = useLoad<{ values: { value: string; people: number }[] }>(field ? `/api/campaigns/${campaignId}/groups${qs(`field=${encodeURIComponent(field)}`)}` : null);
  const ep = field ? `field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}` : '';
  const res = useLoad<{ people: number; levels?: { intra: string[]; stress: string[] }; summary?: Summary; tables?: DomainTable[] }>(`/api/campaigns/${campaignId}/${kind}${qs(ep)}`);

  return (
    <>
      <p className="muted">{kind === 'summary' ? 'Distribución de personas por nivel de riesgo para el grupo que elijas.' : 'Personas por nivel en cada dominio y dimensión, con el nivel de intervención requerido (regla del libro: nivel de riesgo más alto presente en el grupo).'}</p>
      <div className="two">
        <div>
          <label htmlFor="gf">Grupo deseado (característica)</label>
          <select id="gf" value={field} onChange={(e) => { setField(e.target.value); setValue('*'); }}>
            <option value="">Todas las personas</option>
            {(fields.data?.fields ?? []).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="gv">Categoría</label>
          <select id="gv" value={value} onChange={(e) => setValue(e.target.value)} disabled={!field}>
            <option value="*">Todas (*)</option>
            {(values.data?.values ?? []).map((v) => <option key={v.value} value={v.value}>{v.value || '(sin dato)'} — {v.people}</option>)}
          </select>
        </div>
      </div>
      {res.error && <div className="alert error" role="alert">{res.error}</div>}
      {res.data && (
        <>
          <p><strong>Número de personas:</strong> {kind === 'summary' ? res.data.summary?.people : res.data.people}</p>
          {kind === 'summary' && res.data.summary && res.data.levels && res.data.summary.people > 0 && <SummaryTables s={res.data.summary} levels={res.data.levels} />}
          {kind === 'domains' && res.data.people > 0 && res.data.tables?.map((t) => <DomainTableView key={t.title} t={t} />)}
          {res.data.people === 0 && <p className="muted">No hay personas en este grupo.</p>}
        </>
      )}
    </>
  );
}

export function DomainTableView({ t }: { t: DomainTable }) {
  return (
    <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
      <table className="table dom">
        <caption>{t.title}</caption>
        <thead>
          <tr>
            <th scope="col">Dimensión</th>
            {t.levels.map((l, i) => <th scope="col" key={l}><Level text={l} index={i} /></th>)}
            <th scope="col">Nivel de intervención requerido</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.label} className={r.kind !== 'dimension' ? 'strong' : ''}>
              <th scope="row">{r.label}</th>
              {r.counts.map((n, i) => <td key={i}>{n}</td>)}
              <td><span className={`iv iv${r.intervention}`}>{r.interventionText}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RegisterData {
  headers: string[];
  rows: (string | number | null)[][];
  participantIds: string[];
}
type Scale = 'D' | 'I' | 'S' | 'C';
interface DiscPattern {
  nombre: string;
  descripcion: (Record<string, string> & { observaciones: string[] }) | null;
}
interface DiscPerson {
  participantId: string;
  person: { document: string; fullName: string };
  date: string;
  scores: Record<Scale, number>;
  segments: Record<Scale, number>;
  code: string;
  pattern: DiscPattern;
  keyValidated: boolean;
}

const DISC_NAMES: Record<Scale, string> = { D: 'Dominancia', I: 'Influencia', S: 'Estabilidad', C: 'Cumplimiento' };
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Botón de descarga de un PDF con su mensaje de error. */
function PdfButton({ url, name, label, onError }: { url: string; name: string; label: string; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn secondary" disabled={busy} onClick={async () => { onError(''); setBusy(true); try { await downloadFile(url, name); } catch (e) { onError((e as Error).message); } finally { setBusy(false); } }}>{busy ? 'Generando…' : label}</button>
  );
}

/** DISC: perfil individual de cada persona que completó la prueba, con el informe desplegable. */
function DiscView({ campaignId, qs }: { campaignId: string; qs: (e?: string) => string }) {
  const { data, error, loading } = useLoad<{ people: DiscPerson[] }>(`/api/campaigns/${campaignId}/disc${qs()}`);
  const [dlErr, setDlErr] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  const people = data?.people ?? [];
  const scales = ['D', 'I', 'S', 'C'] as const;
  return (
    <>
      {people.some((p) => !p.keyValidated) && (
        <div className="alert error" role="status">Resultados PROVISIONALES: la clave de calificación del DISC aún no ha sido validada.</div>
      )}
      {dlErr && <div className="alert error" role="alert">{dlErr}</div>}
      {people.length === 0 ? <p className="muted">Todavía nadie ha completado el DISC.</p> : (
        <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
          <table className="table">
            <caption className="sr-only">Perfil DISC por persona: puntaje (segmento)</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Nombre</th>{scales.map((s) => <th key={s} scope="col">{s}</th>)}<th scope="col">Patrón de perfil</th><th scope="col"><span className="sr-only">Informe</span></th></tr></thead>
            <tbody>
              {people.map((p) => (
                <ReportRow
                  key={p.participantId}
                  colSpan={4 + scales.length}
                  cells={<>
                    <td>{p.person.document}</td>
                    <td>{p.person.fullName}</td>
                    {scales.map((s) => <td key={s}>{signed(p.scores[s])} <span className="muted">(seg. {p.segments[s]})</span></td>)}
                    <td>{p.pattern.nombre}</td>
                  </>}
                  actions={<PdfButton url={`/api/participants/${p.participantId}/disc.pdf${qs()}`} name={`DISC_${p.person.document}.pdf`} label="Informe PDF" onError={setDlErr} />}
                >
                  <h3>Informe DISC · {p.person.fullName}</h3>
                  <p className="muted">Aplicado el {fmtDate(p.date)}. Puntaje de cada escala = palabras MÁS − palabras MENOS que puntúan en ella (de −28 a +28). Código de segmentos D-I-S-C: <strong>{p.code}</strong>.{!p.keyValidated && ' Resultado provisional.'}</p>
                  {scales.map((s) => <ScoreBar key={s} label={`${s} · ${DISC_NAMES[s]}`} value={p.scores[s]} min={-28} max={28} text={`${signed(p.scores[s])} (segmento ${p.segments[s]})`} />)}
                  <h4>Patrón de perfil: {p.pattern.nombre}</h4>
                  {p.pattern.descripcion ? (
                    <>
                      <dl className="report-dl">
                        {DISC_PATTERN_LABELS.map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{p.pattern.descripcion![k]}</dd></div>)}
                      </dl>
                      {p.pattern.descripcion.observaciones.length > 0 && (
                        <>
                          <h4>Observaciones</h4>
                          {p.pattern.descripcion.observaciones.map((o, i) => <p key={i}>{o}</p>)}
                        </>
                      )}
                    </>
                  ) : (
                    <p className="muted">La hoja oficial de corrección no incluye una descripción para este patrón. Se interpreta con los puntajes y segmentos de cada escala.</p>
                  )}
                </ReportRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** 16PF: quién lo completó, hoja de respuestas (en pantalla y en PDF) y exportación para la corrección en la plataforma del editor. */
interface AcroPerson {
  participantId: string;
  person: { document: string; fullName: string };
  date: string;
  anxiety: { total: number; level: string; answered: number };
  avoidance: { total: number; level: string; answered: number };
  items: { n: number; anxiety?: number; avoidance?: number }[];
}

/** Acrofobia de Cohen: puntaje y nivel de las escalas de ansiedad (0 a 120) y evitación (0 a 40) por persona. */
function AcrofobiaView({ campaignId, qs }: { campaignId: string; qs: (e?: string) => string }) {
  const { data, error, loading } = useLoad<{ people: AcroPerson[] }>(`/api/campaigns/${campaignId}/acrofobia${qs()}`);
  const [dlErr, setDlErr] = useState('');
  const [formato, setFormato] = useState<string | null>(null);
  if (formato) return <FormatoView kind="alturas" participantId={formato} qs={qs} onBack={() => setFormato(null)} />;
  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  const people = data?.people ?? [];
  return (
    <>
      {dlErr && <div className="alert error" role="alert">{dlErr}</div>}
      {people.length === 0 ? <p className="muted">Todavía nadie ha completado la Acrofobia.</p> : (
        <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
          <table className="table">
            <caption className="sr-only">Acrofobia de Cohen por persona</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Nombre</th><th scope="col">Ansiedad (0-120)</th><th scope="col">Evitación (0-40)</th><th scope="col">Fecha</th><th scope="col"><span className="sr-only">Informe</span></th></tr></thead>
            <tbody>
              {people.map((p) => (
                <ReportRow
                  key={p.participantId}
                  colSpan={6}
                  cells={<>
                    <td>{p.person.document}</td>
                    <td>{p.person.fullName}</td>
                    <td><strong>{p.anxiety.total}</strong> · {p.anxiety.level}</td>
                    <td><strong>{p.avoidance.total}</strong> · {p.avoidance.level}</td>
                    <td>{fmtDate(p.date)}</td>
                  </>}
                  actions={<><button className="btn" onClick={() => setFormato(p.participantId)}>Formato de evaluación</button> <PdfButton url={`/api/participants/${p.participantId}/acrofobia.pdf${qs()}`} name={`Acrofobia_${p.person.document}.pdf`} label="Informe PDF" onError={setDlErr} /></>}
                >
                  <h3>Acrofobia de Cohen · {p.person.fullName}</h3>
                  <p className="muted">Aplicado el {fmtDate(p.date)}. Ansiedad: {p.anxiety.answered} de 20 respondidas; evitación: {p.avoidance.answered} de 20.</p>
                  <ScoreBar label="Ansiedad" value={p.anxiety.total} min={0} max={120} text={`${p.anxiety.total} de 120 · ${p.anxiety.level}`} />
                  <ScoreBar label="Evitación" value={p.avoidance.total} min={0} max={40} text={`${p.avoidance.total} de 40 · ${p.avoidance.level}`} />
                  <ol className="pf-grid" aria-label="Respuestas por situación (ansiedad / evitación)">
                    {p.items.map((it) => <li key={it.n}><span className="muted">{it.n}</span> <strong>{it.anxiety ?? '-'} / {it.avoidance ?? '-'}</strong></li>)}
                  </ol>
                </ReportRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const CLQ_LEVEL_OPTIONS: [string, string][] = [['low', 'Bajo nivel de claustrofobia'], ['moderate', 'Nivel moderado de claustrofobia'], ['high', 'Alto nivel de claustrofobia']];
interface ClqPerson {
  participantId: string;
  person: { document: string; fullName: string };
  date: string;
  total: number;
  max: number;
  level: string | null;
  markedAt: string | null;
}

/** Una fila del CLQ: la psicóloga marca la interpretación y, ya guardada, se habilita el PDF. */
function ClqRow({ p, qs, onSaved, onError, onFormato }: { p: ClqPerson; qs: (e?: string) => string; onSaved: () => void; onError: (m: string) => void; onFormato: () => void }) {
  const [level, setLevel] = useState(p.level ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = level !== (p.level ?? '');
  const save = async () => {
    onError('');
    setBusy(true);
    try {
      await api('PUT', `/api/participants/${p.participantId}/claustrofobia${qs()}`, { level });
      onSaved();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'No se pudo guardar la interpretación.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr>
      <td>{p.person.document}</td>
      <td>{p.person.fullName}</td>
      <td><strong>{p.total}</strong> de {p.max}</td>
      <td>
        <fieldset className="plain" aria-label={`Interpretación del CLQ de ${p.person.fullName}`}>
          {CLQ_LEVEL_OPTIONS.map(([k, label]) => (
            <label key={k} className="check opt"><input type="radio" name={`clq-${p.participantId}`} checked={level === k} onChange={() => setLevel(k)} /> {label}</label>
          ))}
        </fieldset>
      </td>
      <td>{p.markedAt ? `Marcada el ${fmtDate(p.markedAt)}` : 'Pendiente'}</td>
      <td className="actions">
        <button className="btn" onClick={onFormato}>Formato de evaluación</button>{' '}
        <button className="btn" disabled={busy || !level || !dirty} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar interpretación'}</button>{' '}
        {p.level && !dirty ? <PdfButton url={`/api/participants/${p.participantId}/claustrofobia.pdf${qs()}`} name={`CLQ_${p.person.document}.pdf`} label="Descargar PDF" onError={onError} /> : <button className="btn secondary" disabled title="Guarda primero la interpretación">Descargar PDF</button>}
      </td>
    </tr>
  );
}

/** Claustrofobia (CLQ): el formato no trae puntos de corte; la psicóloga marca el nivel y luego descarga el PDF. */
function ClaustrofobiaView({ campaignId, qs }: { campaignId: string; qs: (e?: string) => string }) {
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useLoad<{ people: ClqPerson[] }>(`/api/campaigns/${campaignId}/claustrofobia${qs(`t=${tick}`)}`);
  const [dlErr, setDlErr] = useState('');
  const [formato, setFormato] = useState<string | null>(null);
  if (formato) return <FormatoView kind="confinados" participantId={formato} qs={qs} onBack={() => { setFormato(null); setTick((t) => t + 1); }} />;
  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  const people = data?.people ?? [];
  return (
    <>
      <p className="muted">El CLQ no trae puntos de corte: se muestra el puntaje total y la interpretación la marca la psicóloga. El PDF se habilita al guardarla.</p>
      {dlErr && <div className="alert error" role="alert">{dlErr}</div>}
      {people.length === 0 ? <p className="muted">Todavía nadie ha completado el CLQ.</p> : (
        <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
          <table className="table">
            <caption className="sr-only">CLQ de Claustrofobia por persona</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Nombre</th><th scope="col">Puntaje total</th><th scope="col">Interpretación</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {people.map((p) => <ClqRow key={`${p.participantId}-${p.level}`} p={p} qs={qs} onSaved={() => setTick((t) => t + 1)} onError={setDlErr} onFormato={() => setFormato(p.participantId)} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Pf16View({ campaignId, qs }: { campaignId: string; qs: (e?: string) => string }) {
  const { data, error, loading } = useLoad<{ people: { participantId: string; person: { document: string; fullName: string }; date: string; answered: number; answers: string }[] }>(`/api/campaigns/${campaignId}/pf16${qs()}`);
  const [dlErr, setDlErr] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  const people = data?.people ?? [];
  return (
    <>
      {dlErr && <div className="alert error" role="alert">{dlErr}</div>}
      <div className="row-between">
        <span />
        <PdfButton url={`/api/campaigns/${campaignId}/pf16.csv${qs()}`} name="Respuestas16PF.csv" label="Descargar respuestas (CSV)" onError={setDlErr} />
      </div>
      {people.length === 0 ? <p className="muted">Todavía nadie ha completado el 16PF.</p> : (
        <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
          <table className="table">
            <caption className="sr-only">Personas que completaron el 16PF</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Nombre</th><th scope="col">Respondidas</th><th scope="col">Fecha</th><th scope="col"><span className="sr-only">Informe</span></th></tr></thead>
            <tbody>
              {people.map((p) => (
                <ReportRow
                  key={p.participantId}
                  colSpan={5}
                  cells={<>
                    <td>{p.person.document}</td>
                    <td>{p.person.fullName}</td>
                    <td>{p.answered}</td>
                    <td>{fmtDate(p.date)}</td>
                  </>}
                  actions={<PdfButton url={`/api/participants/${p.participantId}/pf16.pdf${qs()}`} name={`16PF_${p.person.document}.pdf`} label="Hoja PDF" onError={setDlErr} />}
                >
                  <h3>Hoja de respuestas 16PF · {p.person.fullName}</h3>
                  <p className="muted">Aplicado el {fmtDate(p.date)}. {p.answered} de {p.answers.length} cuestiones respondidas. Sin calificar.</p>
                  <ol className="pf-grid" aria-label="Respuestas por cuestión">
                    {p.answers.split('').map((a, i) => <li key={i}><span className="muted">{i + 1}</span> <strong>{a}</strong></li>)}
                  </ol>
                </ReportRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const VALANTI_COLS = ['Verdad', 'Rectitud', 'Paz', 'Amor', 'No violencia'] as const;
interface ValantiPerson {
  participantId: string;
  person: { document: string; fullName: string };
  date: string;
  total: Record<string, number>;
  part1: Record<string, number>;
  part2: Record<string, number>;
  standard: Record<string, number>;
  distance: Record<string, number>;
  band: Record<string, string>;
  stars: Record<string, string>;
  interpretation: Record<string, string>;
  mostImportant: { value: string; area: string }[];
  leastImportant: { value: string; area: string }[];
  norm: Record<string, { mean: number; sd: number }>;
  normValidated: boolean;
  normLabel: string;
}

/** VALANTI: perfil de valores de cada persona que completó la prueba, con el informe desplegable. */
function ValantiView({ campaignId, qs }: { campaignId: string; qs: (e?: string) => string }) {
  const { data, error, loading } = useLoad<{ people: ValantiPerson[] }>(`/api/campaigns/${campaignId}/valanti${qs()}`);
  const [dlErr, setDlErr] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  const people = data?.people ?? [];
  const names = (l: { value: string; area: string }[]) => l.map((m) => `${m.value.toUpperCase()} (área ${m.area})`).join(' y ');
  return (
    <>
      {people.some((p) => !p.normValidated) && (
        <div className="alert error" role="status">Puntajes estándar PROVISIONALES: la norma ({people[0]?.normLabel}) aún no ha sido validada.</div>
      )}
      {dlErr && <div className="alert error" role="alert">{dlErr}</div>}
      {people.length === 0 ? <p className="muted">Todavía nadie ha completado el VALANTI.</p> : (
        <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
          <table className="table">
            <caption className="sr-only">Perfil VALANTI por persona: puntaje directo (estándar)</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Nombre</th>{VALANTI_COLS.map((v) => <th key={v} scope="col">{v}</th>)}<th scope="col">Más importante</th><th scope="col"><span className="sr-only">Informe</span></th></tr></thead>
            <tbody>
              {people.map((p) => (
                <ReportRow
                  key={p.participantId}
                  colSpan={4 + VALANTI_COLS.length}
                  cells={<>
                    <td>{p.person.document}</td>
                    <td>{p.person.fullName}</td>
                    {VALANTI_COLS.map((v) => <td key={v}>{p.total[v]} <span className="muted">({Math.round(p.standard[v]!)})</span></td>)}
                    <td>{p.mostImportant.map((m) => m.value).join(', ')}</td>
                  </>}
                  actions={<PdfButton url={`/api/participants/${p.participantId}/valanti.pdf${qs()}`} name={`VALANTI_${p.person.document}.pdf`} label="Informe PDF" onError={setDlErr} />}
                >
                  <h3>Informe VALANTI · {p.person.fullName}</h3>
                  <p className="muted">Aplicado el {fmtDate(p.date)}. {!p.normValidated && 'Puntaje estándar provisional. '}<strong>Valor más importante:</strong> {names(p.mostImportant)}. <strong>Valor menos importante:</strong> {names(p.leastImportant)}.</p>
                  <div className="scroll" tabIndex={0} role="region" aria-label="Detalle del puntaje (desplázala con las flechas del teclado)">
                    <table className="table">
                      <thead><tr><th scope="col">Valor</th><th scope="col">Parte 1</th><th scope="col">Parte 2</th><th scope="col">Directo</th><th scope="col">Media</th><th scope="col">Desv.</th><th scope="col">Estándar</th><th scope="col">Banda</th><th scope="col">Distancia</th></tr></thead>
                      <tbody>
                        {VALANTI_COLS.map((v) => (
                          <tr key={v}>
                            <th scope="row">{v}</th><td>{p.part1[v]}</td><td>{p.part2[v]}</td><td><strong>{p.total[v]}</strong></td>
                            <td>{p.norm[v]!.mean.toFixed(2)}</td><td>{p.norm[v]!.sd.toFixed(2)}</td><td><strong>{Math.round(p.standard[v]!)}</strong></td><td>{p.band[v]} <span className="muted">{p.stars[v]}</span></td><td>{signed(Math.round(p.distance[v]!))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {VALANTI_COLS.map((v) => <ScoreBar key={v} label={v} value={p.standard[v]!} min={20} max={80} text={`${Math.round(p.standard[v]!)} (50 = promedio de la norma)`} />)}
                  <h4>Interpretación de los valores</h4>
                  <dl className="report-dl">
                    {VALANTI_COLS.map((v) => <div key={v}><dt>{v} ({p.total[v]}, {p.band[v]})</dt><dd>{p.interpretation[v]}</dd></div>)}
                  </dl>
                </ReportRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Register({ campaignId, qs }: { campaignId: string; qs: (e?: string) => string }) {
  const { data, error, loading } = useLoad<RegisterData>(`/api/campaigns/${campaignId}/results${qs()}`);
  const [report, setReport] = useState<string | null>(null);
  const [dlErr, setDlErr] = useState('');
  const [filter, setFilter] = useState('');

  const download = useCallback(async () => {
    setDlErr('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/results.csv${qs()}`, { credentials: 'same-origin', headers: { 'x-csrf-token': getCsrf() } });
      if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo descargar');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'DatosRPS.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlErr((e as Error).message);
    }
  }, [campaignId, qs]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  if (!data) return null;
  const idx = (h: string) => data.headers.indexOf(h);
  const cols = [
    ['Id', 'Id'], ['Nombres', 'Nombres'], ['Tipo de cargo', 'TIPO DE CARGO'], ['Área', 'Dpto/Area/Secc'], ['Forma', 'FORMATOINTRAL_TIPOCARGO'],
    ['Intralaboral', 'RIESGO INTRALABORAL'], ['Extralaboral', 'RIESGO EXTRALABORAL'], ['Total', 'RIESGO TOTAL (INTRA+EXTRA LABORAL)'], ['Estrés', 'NIVEL DE ESTRÉS'],
  ] as const;
  const levelCols = new Set(['RIESGO INTRALABORAL', 'RIESGO EXTRALABORAL', 'RIESGO TOTAL (INTRA+EXTRA LABORAL)', 'NIVEL DE ESTRÉS']);
  const intraL = ['Sin riesgo o riesgo despreciable', 'Riesgo bajo', 'Riesgo medio', 'Riesgo alto', 'Riesgo muy alto'];
  const stressL = ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'];
  const rows = data.rows.map((r, i) => ({ r, id: data.participantIds[i]! })).filter(({ r }) => !filter || JSON.stringify(r.slice(0, 24)).toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="row-between">
        <div style={{ flex: 1, maxWidth: '24rem' }}>
          <label htmlFor="flt">Buscar (nombre, documento, área, cargo…)</label>
          <input id="flt" type="text" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <button className="btn" onClick={() => void download()}>Descargar DatosRPS.csv ({data.headers.length} columnas)</button>
      </div>
      {dlErr && <div className="alert error" role="alert">{dlErr}</div>}
      <p className="muted">{rows.length} de {data.rows.length} personas. La descarga contiene las {data.headers.length} columnas de la hoja DatosRPS del libro oficial (datos generales, puntajes transformados y niveles de cada dimensión y dominio).</p>
      <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)">
        <table className="table">
          <caption className="sr-only">Registro individual de resultados</caption>
          <thead><tr>{cols.map(([l]) => <th scope="col" key={l}>{l}</th>)}<th scope="col">Informe</th></tr></thead>
          <tbody>
            {rows.map(({ r, id }) => (
              <tr key={id}>
                {cols.map(([l, h]) => {
                  const v = r[idx(h)];
                  if (levelCols.has(h)) {
                    const L = h === 'NIVEL DE ESTRÉS' ? stressL : intraL;
                    return <td key={l}><Level text={String(v)} index={levelIndex(L, v)} /></td>;
                  }
                  return <td key={l}>{String(v ?? '')}</td>;
                })}
                <td><button className="btn secondary" onClick={() => setReport(id)}>Ver informe</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report && <Report id={report} qs={qs} onClose={() => setReport(null)} />}
    </>
  );
}

interface ReportData {
  form: string;
  person: { document: string; fullName: string };
  scores: {
    intralaboral: { transformed: number | null; level: string };
    extralaboral: { transformed: number | null; level: string };
    total: { transformed: number | null; level: string };
    stress: { transformed: number | null; level: string };
  };
  blocks: { title: string; rows: { label: string; kind: string; level: string; levelIndex: number; intervention: string }[] }[];
}
function Report({ id, qs, onClose }: { id: string; qs: (e?: string) => string; onClose: () => void }) {
  const { data, error } = useLoad<ReportData>(`/api/participants/${id}/report${qs()}`);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="rp-t" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="row-between">
          <h2 id="rp-t" style={{ margin: 0 }}>Informe individual</h2>
          <button className="btn secondary" autoFocus onClick={onClose}>Cerrar</button>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        {!data && !error && <Loading />}
        {data && (
          <>
            <p><strong>{data.person.fullName}</strong> · Documento {data.person.document} · Forma {data.form}</p>
            <ul className="kpis">
              <li>Intralaboral: <Level text={data.scores.intralaboral.level} index={levelIndex(['Sin riesgo o riesgo despreciable', 'Riesgo bajo', 'Riesgo medio', 'Riesgo alto', 'Riesgo muy alto'], data.scores.intralaboral.level)} /> ({data.scores.intralaboral.transformed ?? '—'})</li>
              <li>Extralaboral: <Level text={data.scores.extralaboral.level} index={levelIndex(['Sin riesgo o riesgo despreciable', 'Riesgo bajo', 'Riesgo medio', 'Riesgo alto', 'Riesgo muy alto'], data.scores.extralaboral.level)} /> ({data.scores.extralaboral.transformed ?? '—'})</li>
              <li>Total: <Level text={data.scores.total.level} index={levelIndex(['Sin riesgo o riesgo despreciable', 'Riesgo bajo', 'Riesgo medio', 'Riesgo alto', 'Riesgo muy alto'], data.scores.total.level)} /> ({data.scores.total.transformed ?? '—'})</li>
              <li>Estrés: <Level text={data.scores.stress.level} index={levelIndex(['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'], data.scores.stress.level)} /> ({data.scores.stress.transformed ?? '—'})</li>
            </ul>
            {data.blocks.map((b) => (
              <div className="scroll" tabIndex={0} role="region" aria-label="Tabla (desplázala con las flechas del teclado)" key={b.title}>
                <table className="table">
                  <caption>{b.title}</caption>
                  <thead><tr><th scope="col">Dimensión</th><th scope="col">Nivel</th><th scope="col">Intervención</th></tr></thead>
                  <tbody>
                    {b.rows.map((r) => (
                      <tr key={r.label} className={r.kind !== 'dimension' ? 'strong' : ''}>
                        <th scope="row">{r.label}</th>
                        <td><Level text={r.level || 'No evaluado'} index={r.levelIndex} /></td>
                        <td>{r.intervention}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p className="hint">El software calcula la pre-evaluación; la aplicación e interpretación clínica corresponden al profesional con licencia en SST.</p>
          </>
        )}
      </div>
    </div>
  );
}
