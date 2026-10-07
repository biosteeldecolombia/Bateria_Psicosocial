import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ApiError } from './api';
import { Icon, type IconName } from './icons';

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

export interface Secret { title: string; username: string; password: string }

/** Credenciales entregadas una sola vez, en el centro de la pantalla. No se cierra al pulsar fuera: la contraseña no se vuelve a mostrar. */
export function SecretModal({ s, onClose }: { s: Secret; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Usuario: ${s.username}\nContraseña: ${s.password}`;
  return (
    <Modal title={s.title} icon="key" size="sm" onClose={onClose} dismissOnOutside={false}>
      <p className="muted" style={{ marginTop: 0 }}>Cópiala o anótala ahora: <strong>no se volverá a mostrar</strong>.</p>
      <dl className="secret">
        <dt>Usuario</dt>
        <dd>{s.username}</dd>
        <dt>Contraseña</dt>
        <dd>{s.password}</dd>
      </dl>
      <div className="dialog-actions">
        <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined)}>
          <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button className="btn" onClick={onClose}>Ya la guardé</button>
      </div>
    </Modal>
  );
}

export interface MenuItem { label: string; icon: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean }

/** Menú desplegable de acciones de una fila. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setPos(null), []);
  useEffect(() => {
    if (!pos) return;
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
  }, [pos, close]);
  return (
    <>
      <button
        ref={btn}
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={() => {
          const r = btn.current!.getBoundingClientRect();
          setPos(pos ? null : { top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
      >
        <Icon name="more" />
      </button>
      {pos && (
        <div className="menu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" className={`menu-item${it.danger ? ' danger' : ''}`} disabled={it.disabled} onClick={() => { close(); it.onSelect(); }}>
              <Icon name={it.icon} /> {it.label}
            </button>
          ))}
        </div>
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
