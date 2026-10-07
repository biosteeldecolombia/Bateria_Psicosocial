/** Nombre del producto (encabezado, login y título de la pestaña). */
export const PRODUCT_NAME = 'Sanithelp Evaluaciones Psicométricas';

/**
 * Indicador de carga con el icono de Sanithelp: late suavemente dentro de un aro que gira.
 * Se anuncia a los lectores de pantalla como estado; las animaciones se quitan con «Quitar animaciones» o la preferencia del sistema.
 */
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader-mark" aria-hidden="true">
        <span className="loader-ring" />
        <img src="/brand/logo_sanithelp_icono.webp" alt="" width="40" height="40" />
      </span>
      <span className="loader-label">{label}</span>
    </div>
  );
}

/** Pantalla de carga inicial: logo grande con ondas, el nombre del producto y el estado. */
export function Splash({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="auth-stage">
      <Backdrop />
      <div className="splash" role="status" aria-live="polite">
        <span className="hero-mark" aria-hidden="true">
          <span className="hero-wave" />
          <span className="hero-wave hero-wave-2" />
          <img src="/brand/logo_sanithelp_icono.webp" alt="" width="96" height="96" />
        </span>
        <p className="splash-name">{PRODUCT_NAME}</p>
        <p className="muted">{label}</p>
      </div>
    </div>
  );
}

/** Fondo animado de las pantallas de ingreso (manchas de color de la marca que se desplazan despacio). */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span className="blob blob-a" />
      <span className="blob blob-b" />
      <span className="blob blob-c" />
    </div>
  );
}
