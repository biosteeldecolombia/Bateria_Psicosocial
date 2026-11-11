import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Icon } from './icons';
import { useAction } from './ui';
import { Loading } from './BrandLoader';

/** Reduce la imagen de la firma (máx. 800 × 300) y la devuelve como PNG o, si pesa demasiado, JPEG. */
async function prepareSignature(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('No se pudo leer la imagen. Usa un archivo PNG o JPG.'));
      i.src = url;
    });
    const k = Math.min(1, 800 / img.width, 300 / img.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const png = c.toDataURL('image/png');
    if (png.length < 500_000) return png;
    // Fondo blanco para el JPEG (no admite transparencia)
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Ver, cargar, reemplazar y quitar la imagen de la firma de una psicóloga.
 * `base` es la ruta del servidor: `/api/profile` (la propia psicóloga) o `/api/admin/users/:id` (el administrador).
 */
export function SignatureEditor({ base, idPrefix }: { base: string; idPrefix: string }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const act = useAction();
  const load = useCallback(
    () =>
      api<{ signature: string | null }>('GET', `${base}/signature`)
        .then((r) => { setCurrent(r.signature); setLoaded(true); })
        .catch(() => setLoaded(true)),
    [base],
  );
  useEffect(() => { void load(); }, [load]);
  if (!loaded) return <Loading />;
  const shown = preview ?? current;
  return (
    <div>
      {act.error && <div className="alert error" role="alert">{act.error}</div>}
      {shown ? (
        <div style={{ background: '#fff', border: '1px solid var(--line, #ccd)', borderRadius: 8, padding: 8, display: 'inline-block', margin: '0.5rem 0' }}>
          <img src={shown} alt={preview ? 'Vista previa de la nueva firma' : 'Firma guardada'} style={{ maxWidth: '100%', maxHeight: 120, display: 'block' }} />
        </div>
      ) : <p className="muted">Todavía no hay una firma cargada.</p>}
      <div>
        <label htmlFor={`${idPrefix}-f`}>{current ? 'Reemplazar la imagen' : 'Imagen de la firma (PNG o JPG)'}</label>
        <input id={`${idPrefix}-f`} type="file" accept="image/png,image/jpeg" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void act.run(async () => { setPreview(await prepareSignature(file)); });
        }} />
      </div>
      <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn" disabled={act.busy || !preview} onClick={() => void act.run(async () => { await api('PUT', `${base}/signature`, { image: preview }); setPreview(null); await load(); })}><Icon name="check" /> Guardar firma</button>
        {current && !preview && (
          <button type="button" className="btn secondary" disabled={act.busy} onClick={() => { if (window.confirm('¿Quitar esta firma? Los documentos nuevos saldrán sin ella.')) void act.run(async () => { await api('DELETE', `${base}/signature`); await load(); }); }}>Quitar firma</button>
        )}
        {preview && <button type="button" className="btn secondary" onClick={() => setPreview(null)}>Cancelar</button>}
      </div>
    </div>
  );
}
