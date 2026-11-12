import { useCallback, useEffect, useMemo, useState } from 'react';
import { WORKFLOW_OWNERS, WORKFLOW_STAGES, type MeResponse, type WorkflowStage } from '@sanithelp/shared';
import { api } from './api';
import { Icon, type IconName } from './icons';
import { EmptyState, Modal, useAction } from './ui';
import { Loading } from './BrandLoader';

interface Person { id: string; name: string }
export interface BoardCampaign {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  status: 'open' | 'closed';
  stage: WorkflowStage;
  stageChangedAt: string;
  createdAt: string;
  responsibleName: string | null;
  owners: { application: Person | null; evaluation: Person | null; delivery: Person | null };
  stats: { started: number; completed: number; inProgress: number; declined: number };
  review: { pending: number; in_review: number; evaluated: number };
  daysSinceCreated: number;
  daysInStage: number;
  durationDays: number;
  avgMinutes: number | null;
}
interface Task { kind: 'in_progress' | 'close' | 'review' | 'mark_evaluated' | 'deliver'; campaignId: string; campaignName: string; companyName: string; count: number; text: string }
interface Alert { key: string; severity: 'info' | 'warn'; text: string; campaignId?: string }

const TASK_ICON: Record<Task['kind'], IconName> = { in_progress: 'users', close: 'lock', review: 'clipboard', mark_evaluated: 'check', deliver: 'arrow' };
const STAGE_ICON: Record<WorkflowStage, IconName> = { created: 'plus', in_progress: 'users', finished: 'lock', in_evaluation: 'clipboard', evaluated: 'check', delivered: 'arrow' };

/** «90» → «1 h 30 min»; «3000» → «2 d 2 h». */
export function fmtMinutes(m: number | null | undefined): string {
  if (m == null) return '—';
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h${Math.round(m % 60) ? ` ${Math.round(m % 60)} min` : ''}`;
  return `${Math.floor(m / 1440)} d${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} h` : ''}`;
}
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const instrumentLabel = (id: string) => (id.startsWith('intra') ? `Intralaboral ${id.slice(-1).toUpperCase()}` : ({ extra: 'Extralaboral', stress: 'Estrés', disc: 'DISC', valanti: 'VALANTI', pf16: '16PF', acrofobia: 'Acrofobia (Cohen)', claustrofobia: 'Claustrofobia (CLQ)', ficha: 'Ficha de datos' } as Record<string, string>)[id] ?? id);

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="wf-progress" role="img" aria-label={`${label}: ${done} de ${total}`}>
      <div className="wf-bar"><span style={{ width: `${pct}%` }} /></div>
      <small>{done}/{total} {label}</small>
    </div>
  );
}

function CampaignCard({ c, onOpen }: { c: BoardCampaign; onOpen: () => void }) {
  const toReview = c.review.pending + c.review.in_review;
  return (
    <article className="wf-card">
      <h3>{c.name}</h3>
      <p className="muted">{c.companyName}</p>
      {c.stage === 'created' || c.stage === 'in_progress' ? <Progress done={c.stats.completed} total={c.stats.started} label="terminaron" /> : <Progress done={c.review.evaluated} total={c.stats.completed} label="evaluadas" />}
      <ul className="wf-meta">
        {c.stats.inProgress > 0 && <li><Icon name="users" size={14} /> {c.stats.inProgress} respondiendo</li>}
        {toReview > 0 && (c.stage === 'finished' || c.stage === 'in_evaluation') && <li className="warn"><Icon name="clipboard" size={14} /> {toReview} por evaluar</li>}
        <li><Icon name="refresh" size={14} /> {c.daysInStage === 0 ? 'hoy' : `hace ${c.daysInStage} d`} en esta etapa</li>
        {c.avgMinutes != null && <li><Icon name="chart" size={14} /> promedio {fmtMinutes(c.avgMinutes)} por persona</li>}
      </ul>
      <p className="wf-owners muted"><small>
        {(['application', 'evaluation', 'delivery'] as const).map((k) => c.owners[k]?.name ?? '—').join(' · ')}
      </small></p>
      <button className="btn secondary sm" onClick={onOpen}>Ver detalle <Icon name="arrow" size={14} /></button>
    </article>
  );
}

function DetailModal({ c, perms, onClose, onChanged, onOpenResults }: { c: BoardCampaign; perms: string[]; onClose: () => void; onChanged: () => void; onOpenResults: () => void }) {
  const manage = perms.includes('workflow.manage');
  const act = useAction();
  const [data, setData] = useState<{ timeline: { stage: string; label: string; at: string; actorName: string | null; note: string | null; minutesInStage: number }[]; times: { total: { n: number; avgMinutes: number | null; medianMinutes: number | null; maxMinutes: number | null }; byInstrument: { instrument: string; n: number; avgMinutes: number | null; medianMinutes: number | null; maxMinutes: number | null }[] } } | null>(null);
  const [opts, setOpts] = useState<{ owners: Record<string, string | null>; options: { id: string; name: string; role: string }[] } | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<WorkflowStage>(c.stage);
  const [note, setNote] = useState('');
  const load = useCallback(async () => {
    const [d, o] = await Promise.all([api('GET', `/api/workflow/campaigns/${c.id}`), api('GET', `/api/campaigns/${c.id}/owner-options`)]);
    setData(d);
    setOpts(o);
    setOwners({ application: o.owners.application ?? '', evaluation: o.owners.evaluation ?? '', delivery: o.owners.delivery ?? '' });
  }, [c.id]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  return (
    <Modal title={`${c.companyName} · ${c.name}`} icon="clipboard" size="lg" onClose={onClose}>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      {!data || !opts ? <Loading /> : (
        <>
          <h3 className="sub">Recorrido de la campaña</h3>
          <ol className="wf-timeline">
            {data.timeline.map((t, i) => (
              <li key={i} className={i === data.timeline.length - 1 ? 'now' : ''}>
                <strong>{t.label}</strong>
                <span className="muted"> · {fmtDate(t.at)}{t.actorName ? ` · ${t.actorName}` : ''}</span>
                <br /><small>{i === data.timeline.length - 1 ? 'Lleva ' : 'Duró '}{fmtMinutes(t.minutesInStage)}{t.note ? ` — ${t.note}` : ''}</small>
              </li>
            ))}
          </ol>

          <h3 className="sub">Cuánto tardan las personas</h3>
          {data.times.total.n === 0 ? <p className="muted">Aún nadie ha terminado todo.</p> : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Tiempos de respuesta</caption>
                <thead><tr><th scope="col">Evaluación</th><th scope="col">Personas</th><th scope="col">Promedio</th><th scope="col">Mediana</th><th scope="col">Máximo</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Todo el proceso (de empezar a enviar)</th><td>{data.times.total.n}</td><td>{fmtMinutes(data.times.total.avgMinutes)}</td><td>{fmtMinutes(data.times.total.medianMinutes)}</td><td>{fmtMinutes(data.times.total.maxMinutes)}</td></tr>
                  {data.times.byInstrument.map((r) => <tr key={r.instrument}><th scope="row">{instrumentLabel(r.instrument)}</th><td>{r.n}</td><td>{fmtMinutes(r.avgMinutes)}</td><td>{fmtMinutes(r.medianMinutes)}</td><td>{fmtMinutes(r.maxMinutes)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted"><small>Los tiempos incluyen las pausas: si una persona se interrumpe y retoma, ese tiempo cuenta.</small></p>

          {manage && (
            <>
              <h3 className="sub">Responsables por proceso</h3>
              <div className="form-grid">
                {WORKFLOW_OWNERS.map((o) => (
                  <div key={o.key}>
                    <label htmlFor={`own-${o.key}`}>{o.label}</label>
                    <select id={`own-${o.key}`} value={owners[o.key] ?? ''} onChange={(e) => setOwners({ ...owners, [o.key]: e.target.value })}>
                      <option value="">Sin asignar (según su rol)</option>
                      {opts.options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="btn secondary" disabled={act.busy} onClick={() => void act.run(async () => {
                  await api('PUT', `/api/campaigns/${c.id}/owners`, Object.fromEntries(Object.entries(owners).map(([k, v]) => [k, v || null])));
                  await load();
                  onChanged();
                })}><Icon name="check" /> Guardar responsables</button>
              </div>

              <h3 className="sub">Cambiar de etapa</h3>
              <div className="form-grid">
                <div>
                  <label htmlFor="wf-stage">Etapa</label>
                  <select id="wf-stage" value={stage} onChange={(e) => setStage(e.target.value as WorkflowStage)}>
                    {WORKFLOW_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="wf-note">Nota (opcional)</label>
                  <input id="wf-note" type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Informe enviado a RR. HH." />
                </div>
              </div>
              <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="btn" disabled={act.busy || stage === c.stage} onClick={() => void act.run(async () => {
                  await api('POST', `/api/campaigns/${c.id}/stage`, { stage, note: note || undefined });
                  onChanged();
                  onClose();
                })}><Icon name="arrow" /> Mover a «{WORKFLOW_STAGES.find((s) => s.key === stage)?.label}»</button>
                <button className="btn secondary" onClick={onOpenResults}><Icon name="chart" /> Abrir resultados</button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/** Tablero del flujo de trabajo: dónde está cada campaña, qué le falta a quien entra y cuánto tarda cada paso. */
export function Workflow({ me, onOpenCampaign }: { me: MeResponse; onOpenCampaign: (campaignId: string) => void }) {
  const [board, setBoard] = useState<{ campaigns: BoardCampaign[]; tasks: Task[] } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<BoardCampaign | null>(null);
  const [showDelivered, setShowDelivered] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, n] = await Promise.all([api('GET', '/api/workflow/board'), api<{ items: Alert[] }>('GET', '/api/notifications')]);
      setBoard(b);
      setAlerts(n.items);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 120_000);
    return () => clearInterval(t);
  }, [load]);

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => (board?.campaigns ?? []).filter((c) => !term || c.name.toLowerCase().includes(term) || c.companyName.toLowerCase().includes(term)), [board, term]);

  if (error) return <div className="alert error" role="alert">{error}</div>;
  if (!board) return <Loading />;
  const stages = WORKFLOW_STAGES.filter((s) => showDelivered || s.key !== 'delivered');

  return (
    <>
      <div className="page-head">
        <h1>Flujo de trabajo</h1>
        <p className="muted">Dónde está cada campaña, qué te falta por hacer y cuánto tiempo toma cada paso.</p>
      </div>

      <section className="panel pad" aria-labelledby="wf-mine">
        <h2 id="wf-mine" className="panel-title"><Icon name="check" size={20} /> Tus pendientes</h2>
        {alerts.length > 0 && (
          <ul className="wf-alerts" aria-label="Alertas">
            {alerts.map((a) => <li key={a.key} className={a.severity}><Icon name={a.severity === 'warn' ? 'alert' : 'help'} size={16} /> {a.text}{a.campaignId && <button className="btn secondary sm" onClick={() => onOpenCampaign(a.campaignId!)}>Abrir</button>}</li>)}
          </ul>
        )}
        {board.tasks.length === 0 ? <EmptyState icon="check" text="No tienes nada pendiente por ahora." /> : (
          <ul className="list">
            {board.tasks.map((t) => (
              <li key={`${t.campaignId}-${t.kind}`}>
                <button className="list-item" onClick={() => (t.kind === 'review' || t.kind === 'mark_evaluated' ? onOpenCampaign(t.campaignId) : setOpen(board.campaigns.find((c) => c.id === t.campaignId) ?? null))}>
                  <span><Icon name={TASK_ICON[t.kind]} size={18} /> <strong>{t.companyName} · {t.campaignName}</strong><br /><span className="muted">{t.text}</span></span>
                  <span className="chip">{t.kind === 'review' ? 'Revisar' : t.kind === 'close' ? 'Cerrar' : t.kind === 'deliver' ? 'Entregar' : t.kind === 'mark_evaluated' ? 'Marcar evaluada' : 'Seguir'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="toolbar" style={{ marginTop: '1rem' }}>
        <div className="field grow">
          <label htmlFor="wf-q">Buscar campaña o empresa</label>
          <div className="search"><Icon name="search" /><input id="wf-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={showDelivered} onChange={(e) => setShowDelivered(e.target.checked)} /> Mostrar entregadas</label>
      </div>

      <div className="wf-board" role="list" aria-label="Campañas por etapa">
        {stages.map((s) => {
          const items = shown.filter((c) => c.stage === s.key);
          return (
            <section className="wf-col" key={s.key} role="listitem" aria-labelledby={`wf-h-${s.key}`}>
              <header>
                <h2 id={`wf-h-${s.key}`}><Icon name={STAGE_ICON[s.key]} size={16} /> {s.label} <span className="chip">{items.length}</span></h2>
                <small className="muted">{s.hint}</small>
              </header>
              {items.length === 0 ? <p className="muted wf-empty">Sin campañas</p> : items.map((c) => <CampaignCard key={c.id} c={c} onOpen={() => setOpen(c)} />)}
            </section>
          );
        })}
      </div>

      {open && <DetailModal key={open.id} c={open} perms={me.permissions} onClose={() => setOpen(null)} onChanged={() => void load()} onOpenResults={() => { const id = open.id; setOpen(null); onOpenCampaign(id); }} />}
    </>
  );
}
