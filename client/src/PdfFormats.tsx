import { useCallback, useEffect, useRef, useState } from 'react';
import { PDF_DOC_KINDS, type PdfDocKind, type PdfSettings } from '@sanithelp/shared';
import { api, getCsrf } from './api';
import { Icon } from './icons';
import { useAction } from './ui';
import { Loading } from './BrandLoader';

/**
 * Formatos PDF: código y versión de cada documento (van arriba a la derecha), título, colores y pie de página.
 * Los textos de los documentos auditados (consentimiento, ficha, cuestionarios) no se editan aquí.
 */
export function PdfFormats() {
  const act = useAction();
  const [s, setS] = useState<PdfSettings | null>(null);
  const [saved, setSaved] = useState('');
  const [previewKind, setPreviewKind] = useState<PdfDocKind>('disc');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const urlRef = useRef('');

  const load = useCallback(async () => {
    const r = await api<{ settings: PdfSettings }>('GET', '/api/admin/pdf-settings');
    setS(r.settings);
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const preview = async () => {
    if (!s) return;
    setPreviewBusy(true);
    try {
      const res = await fetch('/api/admin/pdf-settings/preview', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrf() }, body: JSON.stringify({ kind: previewKind, settings: s }) });
      if (!res.ok) throw new Error('No se pudo generar la vista previa.');
      const url = URL.createObjectURL(await res.blob());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPreviewUrl(url);
    } catch (e) {
      act.setError((e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  if (!s) return <Loading />;
  const setDoc = (k: PdfDocKind, patch: Partial<PdfSettings['docs'][PdfDocKind]>) => { setSaved(''); setS({ ...s, docs: { ...s.docs, [k]: { ...s.docs[k], ...patch } } }); };
  const missing = PDF_DOC_KINDS.filter((d) => !s.docs[d.key].code.trim());

  return (
    <>
      <div className="page-head">
        <h1>Formatos PDF</h1>
        <p className="muted">Código, versión y apariencia de los documentos que genera la plataforma. El código y la versión salen arriba a la derecha de cada página, junto al logo.</p>
      </div>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      {saved && <div className="alert ok" role="status">{saved}</div>}
      {missing.length > 0 && <div className="alert error" role="status">{missing.length === 1 ? 'Falta el código de un formato' : `Faltan los códigos de ${missing.length} formatos`}: mientras no los asignes, el PDF dice «POR ASIGNAR» (así no se inventa un código documental).</div>}

      <section className="panel pad" aria-labelledby="pf-docs">
        <h2 id="pf-docs" className="panel-title"><Icon name="clipboard" size={20} /> Documentos</h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Código, versión y título de cada formato PDF</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Código del formato</th><th scope="col">Versión</th><th scope="col">Título en el encabezado</th></tr></thead>
            <tbody>
              {PDF_DOC_KINDS.map((d) => (
                <tr key={d.key}>
                  <th scope="row">{d.label}</th>
                  <td><input type="text" aria-label={`Código de ${d.label}`} placeholder="p. ej. FP-PS-XX" maxLength={30} value={s.docs[d.key].code} onChange={(e) => setDoc(d.key, { code: e.target.value.toUpperCase() })} /></td>
                  <td><input type="text" aria-label={`Versión de ${d.label}`} style={{ width: '5rem' }} maxLength={10} value={s.docs[d.key].version} onChange={(e) => setDoc(d.key, { version: e.target.value })} /></td>
                  <td><input type="text" aria-label={`Título de ${d.label}`} maxLength={120} value={s.docs[d.key].title} onChange={(e) => setDoc(d.key, { title: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel pad" aria-labelledby="pf-look" style={{ marginTop: '1rem' }}>
        <h2 id="pf-look" className="panel-title"><Icon name="edit" size={20} /> Apariencia</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="pf-c1">Color principal</label>
            <div className="color-row"><input id="pf-c1" type="color" value={s.accent} onChange={(e) => { setSaved(''); setS({ ...s, accent: e.target.value.toUpperCase() }); }} /> <code>{s.accent}</code></div>
          </div>
          <div>
            <label htmlFor="pf-c2">Color de fondos suaves</label>
            <div className="color-row"><input id="pf-c2" type="color" value={s.accentSoft} onChange={(e) => { setSaved(''); setS({ ...s, accentSoft: e.target.value.toUpperCase() }); }} /> <code>{s.accentSoft}</code></div>
          </div>
          <div>
            <label htmlFor="pf-ft">Texto del pie de página</label>
            <input id="pf-ft" type="text" maxLength={160} value={s.footer} onChange={(e) => { setSaved(''); setS({ ...s, footer: e.target.value }); }} />
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={s.showLogo} onChange={(e) => { setSaved(''); setS({ ...s, showLogo: e.target.checked }); }} /> Mostrar el logo de Sanithelp en el encabezado</label>
        <div className="dialog-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <button className="btn" disabled={act.busy} onClick={() => void act.run(async () => { await api('PUT', '/api/admin/pdf-settings', s); await load(); setSaved('Formatos guardados. Se aplican a los PDF que generes desde ahora.'); })}><Icon name="check" /> Guardar</button>
          <span className="inline-actions">
            <label htmlFor="pf-pk" className="sr-only">Formato de la vista previa</label>
            <select id="pf-pk" value={previewKind} onChange={(e) => setPreviewKind(e.target.value as PdfDocKind)} style={{ width: 'auto' }}>
              {PDF_DOC_KINDS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <button className="btn secondary" disabled={previewBusy} onClick={() => void preview()}><Icon name="eye" /> {previewBusy ? 'Generando…' : 'Vista previa (sin guardar)'}</button>
          </span>
        </div>
        {previewUrl && <iframe className="pdf-preview" title="Vista previa del formato" src={previewUrl} />}
      </section>

      <section className="panel pad" aria-labelledby="pf-note" style={{ marginTop: '1rem' }}>
        <h2 id="pf-note" className="panel-title"><Icon name="shield" size={20} /> Qué no se cambia aquí</h2>
        <p className="muted">El consentimiento informado, la ficha de datos generales y los cuestionarios conservan su texto exacto (documentos auditados por el abogado): cualquier cambio de texto exige una nueva versión y se hace en el código. Aquí solo se ajusta la identidad visual y los datos documentales de los informes de evaluación.</p>
      </section>
    </>
  );
}
