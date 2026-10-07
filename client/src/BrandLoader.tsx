/** Nombre del producto (encabezado, login y título de la pestaña). */
export const PRODUCT_NAME = 'Sanithelp Evaluaciones Psicométricas';

/**
 * Logo completo de Sanithelp, tal cual (sin fondo ni recuadro). El archivo trae mucho margen transparente:
 * se recorta con CSS para que el logo ocupe el ancho disponible.
 */
export function LogoFull({ label = 'Sanithelp' }: { label?: string }) {
  return (
    <div className="logo-full">
      <img src="/brand/logo_sanithelp_completo.webp" alt={label} width="400" height="400" />
    </div>
  );
}

/**
 * Indicador de carga con el icono de Sanithelp (sin fondo): late suavemente dentro de un aro que gira.
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

/** Pantalla de carga inicial: logo, nombre del producto y una barra que avanza. */
export function Splash({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="auth-stage">
      <Backdrop tone="light" />
      <div className="splash" role="status" aria-live="polite">
        <LogoFull />
        <p className="splash-name">{PRODUCT_NAME}</p>
        <p className="splash-label">{label}</p>
        <span className="splash-bar" aria-hidden="true"><span /></span>
      </div>
    </div>
  );
}

/** Fondo animado (manchas de color de la marca que se desplazan despacio). «auto» sigue el tema elegido; en alto contraste no hay manchas. */
export function Backdrop({ tone = 'dark' }: { tone?: 'dark' | 'light' | 'auto' }) {
  return (
    <div className={`backdrop backdrop-${tone}`} aria-hidden="true">
      <span className="blob blob-a" />
      <span className="blob blob-b" />
      <span className="blob blob-c" />
    </div>
  );
}

/**
 * Banner de bienvenida con el mismo fluido animado del ingreso. `as` es el elemento del título:
 * «h1» cuando es el título de la página; «p» cuando la página ya tiene su propio h1.
 */
export function PageHero({ title, lead, as = 'p', compact = false, eyebrow = PRODUCT_NAME }: { title: string; lead?: string; as?: 'h1' | 'h2' | 'p'; compact?: boolean; eyebrow?: string }) {
  const Title = as;
  return (
    <div className={`login-hero page-hero${compact ? ' compact' : ''}`}>
      <span className="hero-blob hb1" aria-hidden="true" />
      <span className="hero-blob hb2" aria-hidden="true" />
      <span className="hero-blob hb3" aria-hidden="true" />
      <p className="hero-eyebrow">{eyebrow}</p>
      <Title className="hero-title">{title}</Title>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}
