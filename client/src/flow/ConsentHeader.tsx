export interface ConsentHeaderData {
  title: string;
  process: string;
  code: string;
  version: string;
  date: string;
}

/** Encabezado del documento controlado: logo, título y proceso, código, versión y fecha. */
export function ConsentHeader({ header }: { header: ConsentHeaderData }) {
  const cell = { border: '1px solid currentColor', padding: '0.3rem 0.5rem' } as const;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 1rem', fontSize: '0.85rem' }} aria-label="Encabezado del documento">
      <tbody>
        <tr>
          <td rowSpan={2} style={{ ...cell, textAlign: 'center', width: '22%' }}>
            <img src="/brand/logo_sanithelp_completo.webp" alt="SanitHelp" style={{ maxWidth: '100%', maxHeight: 64, objectFit: 'contain' }} />
          </td>
          <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{header.title}</td>
          <td style={cell}><strong>Código:</strong> {header.code}<br /><strong>Versión:</strong> {header.version}</td>
        </tr>
        <tr>
          <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{header.process}</td>
          <td style={cell}><strong>Fecha:</strong> {header.date}</td>
        </tr>
      </tbody>
    </table>
  );
}
