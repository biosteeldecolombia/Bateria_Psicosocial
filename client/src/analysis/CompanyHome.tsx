import { useEffect, useState } from 'react';
import type { MeResponse } from '@sanithelp/shared';
import { api, ApiError } from '../api';
import { DomainTableView, SummaryTables } from './Analysis';
import { PageHero } from '../BrandLoader';

interface Camp {
  id: string;
  name: string;
  status: string;
  completed: number;
}
interface Report {
  min: number;
  suppressed: boolean;
  message?: string;
  people?: number;
  fields: string[];
  groups?: { value: string; people: number }[];
  hiddenGroups?: number;
  levels: { intra: string[]; stress: string[] };
  summary?: Parameters<typeof SummaryTables>[0]['s'];
  tables?: Parameters<typeof DomainTableView>[0]['t'][];
}

/** Vista de la empresa cliente: solo resultados agregados y anónimos (mínimo de personas por grupo). */
export function CompanyHome({ me }: { me: MeResponse }) {
  const [camps, setCamps] = useState<{ min: number; campaigns: Camp[] } | null>(null);
  const [campaign, setCampaign] = useState('');
  const [field, setField] = useState('');
  const [value, setValue] = useState('*');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ min: number; campaigns: Camp[] }>('GET', '/api/company/campaigns')
      .then((r) => {
        setCamps(r);
        setCampaign(r.campaigns[0]?.id ?? '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar.'));
  }, []);

  useEffect(() => {
    if (!campaign) return;
    const p = new URLSearchParams();
    if (field) {
      p.set('field', field);
      p.set('value', value);
    }
    setError('');
    api<Report>('GET', `/api/company/campaigns/${campaign}/report${p.toString() ? `?${p}` : ''}`)
      .then(setReport)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el reporte.'));
  }, [campaign, field, value]);

  return (
    <>
    <PageHero title={`Hola, ${me.fullName}`} lead="Resultados agregados y anónimos de tu organización." />
    <section className="card" aria-labelledby="t">
      <h1 id="t">Reporte de factores de riesgo psicosocial</h1>
      <p className="muted">Aquí ves resultados <strong>agregados y anónimos</strong> de tu organización. Por confidencialidad no se muestran respuestas ni datos de personas, y los grupos con menos de {camps?.min ?? 5} personas se ocultan.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      {camps && camps.campaigns.length === 0 && <p className="muted">Todavía no hay campañas de aplicación para tu empresa.</p>}
      {camps && camps.campaigns.length > 0 && (
        <div className="two">
          <div>
            <label htmlFor="cc">Campaña</label>
            <select id="cc" value={campaign} onChange={(e) => { setCampaign(e.target.value); setField(''); setValue('*'); }}>
              {camps.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.completed} personas</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cf">Ver por grupo</label>
            <select id="cf" value={field} onChange={(e) => { setField(e.target.value); setValue('*'); }}>
              <option value="">Toda la organización</option>
              {(report?.fields ?? []).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      )}
      {field && report && (
        <div style={{ maxWidth: '24rem' }}>
          <label htmlFor="cv">Categoría</label>
          <select id="cv" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="*">Todas</option>
            {(report.groups ?? []).map((g) => <option key={g.value} value={g.value}>{g.value || '(sin dato)'}</option>)}
          </select>
          {!!report.hiddenGroups && <p className="hint">{report.hiddenGroups} grupo(s) con menos de {report.min} personas no se muestran.</p>}
        </div>
      )}
      {report?.suppressed && <div className="alert ok" role="status">{report.message}</div>}
      {report && !report.suppressed && report.summary && report.tables && (
        <>
          <p><strong>Personas evaluadas:</strong> {report.people}</p>
          <SummaryTables s={report.summary} levels={report.levels} />
          <h2>Dominios y dimensiones</h2>
          {report.tables.map((t) => <DomainTableView key={t.title} t={t} />)}
        </>
      )}
    </section>
    </>
  );
}
