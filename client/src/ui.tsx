import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from './api';
import { Icon, type IconName } from './icons';

/** Casilla maestra «Seleccionar todas»: marca o desmarca todo el grupo y queda a medias cuando hay solo algunas marcadas. */
export function SelectAll({ total, selected, onChange, label = 'Seleccionar todas' }: { total: number; selected: number; onChange: (all: boolean) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);
  if (total < 2) return null;
  return (
    <label className="check" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
      <input ref={ref} type="checkbox" checked={selected === total} onChange={(e) => onChange(e.target.checked)} /> {label} <span className="muted" style={{ fontWeight: 400 }}>({selected} de {total})</span>
    </label>
  );
}

/** Ejecuta una acción asíncrona mostrando error y estado de ocupado. */
export function useAction() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar.');
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, busy, run, setError };
}

/** Cierra una ventana flotante (panel o menú) al pulsar o tocar fuera de los elementos indicados. */
export function useDismissOutside(open: boolean, refs: RefObject<HTMLElement | null>[], onClose: () => void) {
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (refsRef.current.some((r) => r.current?.contains(t))) return;
      closeRef.current();
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, [open]);
}

/**
 * Ventana flotante centrada. Cierra con Esc o al hacer clic fuera; devuelve el foco al cerrar.
 * `dismissOnOutside={false}` la deja cerrar solo con sus botones o Esc (para datos que no se pueden recuperar).
 */
export function Modal({ title, onClose, children, size = 'md', icon, dismissOnOutside = true }: { title: string; onClose: () => void; children: ReactNode; size?: 'sm' | 'md' | 'lg'; icon?: IconName; dismissOnOutside?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-x)');
    (first ?? ref.current)?.focus();
    const h = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', h);
    return () => {
      document.removeEventListener('keydown', h);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => dismissOnOutside && e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog ${size}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="dialog-head">
          <h2 id={id}>{icon && <Icon name={icon} size={20} />} {title}</h2>
          <button className="icon-btn modal-x" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

export interface Secret { title: string; username: string; password: string; /** Se puede volver a consultar con la llave. */ view?: boolean }

/** Botón que copia un texto al portapapeles y avisa «Copiado». */
export function CopyButton({ text, label = 'Copiar', size = 'md' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button type="button" className={`btn secondary${size === 'sm' ? ' sm' : ''}`} onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined)} aria-live="polite">
      <Icon name={copied ? 'check' : 'copy'} size={size === 'sm' ? 14 : 18} /> {copied ? 'Copiado' : label}
    </button>
  );
}

/** Usuario y contraseña con botones de copia. Se pueden volver a consultar con el icono de la llave. */
export function SecretModal({ s, onClose }: { s: Secret; onClose: () => void }) {
  const text = `Usuario: ${s.username}
Contraseña: ${s.password}`;
  return (
    <Modal title={s.title} icon="key" size="sm" onClose={onClose}>
      <dl className="secret secret-copy">
        <dt>Usuario</dt>
        <dd>{s.username}</dd>
        <dd className="secret-act"><CopyButton text={s.username} size="sm" /></dd>
        <dt>Contraseña</dt>
        <dd>{s.password}</dd>
        <dd className="secret-act"><CopyButton text={s.password} size="sm" /></dd>
      </dl>
      <div className="dialog-actions">
        <CopyButton text={text} label="Copiar usuario y contraseña" />
        <button className="btn" onClick={onClose}>Listo</button>
      </div>
    </Modal>
  );
}

export interface MenuItem { label: string; icon: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean }

/** Menú desplegable de acciones de una fila. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  // `anchor`: rectángulo del botón de tres puntos al abrir. `place`: posición final del menú, ya ajustada a la ventana.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setAnchor(null);
    setPlace(null);
  }, []);
  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !(t as HTMLElement).closest?.('.menu')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (close(), btn.current?.focus());
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor, close]);
  // Se mide el menú ya dibujado (invisible) y se ubica pegado al botón: debajo si cabe y, si no, encima; sin salirse por los lados.
  useLayoutEffect(() => {
    if (!anchor || !menu.current) return;
    const { width, height } = menu.current.getBoundingClientRect();
    const gap = 6;
    const edge = 8;
    const below = anchor.bottom + gap;
    const top = below + height <= window.innerHeight - edge ? below : Math.max(edge, anchor.top - gap - height);
    const left = Math.min(Math.max(edge, anchor.right - width), window.innerWidth - width - edge);
    setPlace({ top, left });
  }, [anchor]);
  return (
    <>
      <button
        ref={btn}
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={() => (anchor ? close() : setAnchor(btn.current!.getBoundingClientRect()))}
      >
        <Icon name="more" />
      </button>
      {anchor &&
        // En el <body>: dentro de una tarjeta con efecto de vidrio (backdrop-filter) un menú «fixed» se ubicaría respecto a la tarjeta.
        createPortal(
          <div ref={menu} className="menu" role="menu" style={{ top: place?.top ?? 0, left: place?.left ?? 0, visibility: place ? 'visible' : 'hidden' }}>
            {items.map((it) => (
              <button key={it.label} role="menuitem" className={`menu-item${it.danger ? ' danger' : ''}`} disabled={it.disabled} onClick={() => { close(); it.onSelect(); }}>
                <Icon name={it.icon} /> {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Estado con icono y texto (nunca solo color). */
export function StatusBadge({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return (
    <span className={`badge ${on ? 'on' : 'off'}`}>
      <Icon name={on ? 'dot' : 'ring'} size={12} /> {on ? onText : offText}
    </span>
  );
}

export function EmptyState({ icon, text, children }: { icon: IconName; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <p>{text}</p>
      {children}
    </div>
  );
}
