import { useEffect, useRef, useState } from 'react';
import type { Role } from '@sanithelp/shared';

interface Topic { title: string; body: string[] }

const COLLABORATOR: Topic[] = [
  { title: '¿Cómo empiezo?', body: ['Escribe tu número de documento, tus nombres y tus apellidos. Al terminar se te mostrará un código personal (XXXX-XXXX).', 'Anótalo: es la única forma de retomar tu avance si cierras la página o se interrumpe la conexión. No se vuelve a mostrar.'] },
  { title: 'Perdí mi código', body: ['Pídele a la psicóloga responsable que te genere uno nuevo. No podrás retomar sin él.'] },
  { title: '¿Quién ve mis respuestas?', body: ['Solo la psicóloga responsable de la evaluación. Tu empresa nunca ve tus respuestas ni tus resultados: solo recibe cifras agrupadas y anónimas.', 'Al final no se te muestran resultados; la psicóloga los entrega según el procedimiento acordado.'] },
  { title: 'Puedo pausar', body: ['Tus respuestas se guardan a medida que avanzas. Puedes salir y retomar con tu documento y tu código personal.', 'Por seguridad, la sesión se cierra tras 30 minutos sin actividad.'] },
  { title: 'Accesibilidad', body: ['El botón «Accesibilidad» (o Alt + A) permite cambiar tema, tipo de letra, tamaño, espaciado y activar la lectura de una pregunta a la vez.'] },
];

const PSYCHOLOGIST: Topic[] = [
  { title: 'Primeros pasos', body: ['1) Completa «Mi perfil profesional» (documento y registro): salen en el consentimiento de cada expediente.', '2) Crea una campaña para tu empresa: se genera la credencial que entregas a todos los colaboradores.', '3) Cuando respondan, abre «Ver resultados».'] },
  { title: 'Análisis de resultados', body: ['Sigue la estructura del libro de Excel de la Batería: «Resumen total» (ResTOT), «Resumen por grupo» (ResTOT2), «Dominios y dimensiones» (TD_DomDim, con el nivel de intervención) y «Registro individual» (DatosRPS, 101 columnas).', 'El cálculo replica el libro oficial: se verificó contra 1.400 casos.'] },
  { title: 'Expedientes en PDF', body: ['«PDF» descarga el expediente de una persona (consentimiento, ficha y cuestionarios con las casillas marcadas, sobre las plantillas oficiales).', '«Descargar expedientes (ZIP)» exige tu contraseña y un código MFA, y el archivo se descarga una sola vez en 30 minutos. Para campañas grandes filtra por área o forma.'] },
  { title: 'Código perdido, corregir o suprimir', body: ['«Nuevo código» entrega un código personal nuevo a quien perdió el suyo (solo mientras no haya enviado).', '«Corregir» rectifica nombres, apellidos o documento. «Suprimir» borra respuestas y datos personales de forma definitiva (pide tu contraseña).'] },
  { title: 'Casos que requieren tu criterio', body: ['Personas con inválidos o con discrepancia entre cargo y forma aparecen señaladas. Ante un nivel alto o muy alto en estrés o riesgo, sigue el protocolo de intervención de la Batería.'] },
];

const ADMIN: Topic[] = [
  { title: 'Qué haces aquí', body: ['Creas empresas, cuentas de psicólogas y de empresa cliente, y campañas. Las contraseñas las genera el sistema y se muestran una sola vez; si alguien la olvida, la restableces.', 'Asigna cada psicóloga a sus empresas: solo verá las asignadas.'] },
  { title: 'Acceso a información clínica', body: ['Por mínimo privilegio, para ver respuestas o resultados debes escribir el motivo (mínimo 10 caracteres). Queda en la auditoría.'] },
  { title: 'Seguridad', body: ['El administrador y la psicóloga usan verificación en dos pasos (app de autenticación). Guarda los códigos de recuperación en un lugar seguro.'] },
];

const COMPANY: Topic[] = [
  { title: 'Qué ves', body: ['Resultados agregados y anónimos de tu organización: distribución por nivel de riesgo, por dominios y dimensiones, y por grupo.', 'Por confidencialidad no se muestran respuestas ni datos de personas, y los grupos con menos personas que el mínimo se ocultan.'] },
  { title: 'Cómo leer los niveles', body: ['Los niveles van de «sin riesgo» a «riesgo muy alto». La interpretación y las acciones de intervención las define la psicóloga responsable.'] },
];

const BY_ROLE: Record<Role, Topic[]> = { collaborator: COLLABORATOR, psychologist: PSYCHOLOGIST, admin: ADMIN, company: COMPANY };

/** Ayuda contextual por rol. Cierra con Esc; atajo Alt + H. */
export function Help({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        btnRef.current?.focus();
      }
      if (e.altKey && e.key.toLowerCase() === 'h') setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button ref={btnRef} className="btn secondary a11y-btn" aria-expanded={open} aria-controls="help-panel" aria-keyshortcuts="Alt+H" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">?</span> Ayuda
      </button>
      {open && (
        <section id="help-panel" className="a11y-panel" aria-labelledby="help-title">
          <h2 id="help-title">Ayuda</h2>
          <p className="hint">Cierra con Esc.</p>
          {BY_ROLE[role].map((t) => (
            <details key={t.title}>
              <summary>{t.title}</summary>
              {t.body.map((p) => <p key={p}>{p}</p>)}
            </details>
          ))}
          <p className="hint">¿Algo no funciona? Escribe a la psicóloga responsable o a Sanithelp.</p>
        </section>
      )}
    </>
  );
}
