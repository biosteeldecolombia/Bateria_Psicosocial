// Plantillas de los correos que envía la plataforma. Los textos son informativos (no son los documentos legales de consentimiento).
import type { MailMessage } from './mailer.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f3f6f8;font-family:Segoe UI,Arial,sans-serif;color:#17324d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b5c7a;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:700">Sanithelp · Evaluaciones Psicométricas</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:14px 24px;background:#eef3f6;color:#5a7083;font-size:12px">Mensaje automático de Sanithelp S.A.S. Tus datos se tratan conforme a la Ley 1581 de 2012. Si no esperabas este correo, ignóralo.</td></tr>
</table></td></tr></table></body></html>`;
}

const box = (rows: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f3f8fb;border:1px solid #d3e3ec;border-radius:10px;width:100%">${rows
    .map(([k, v]) => `<tr><td style="padding:10px 14px;color:#5a7083;font-size:13px;width:130px">${esc(k)}</td><td style="padding:10px 14px;font-size:17px;font-weight:700;font-family:Consolas,monospace">${esc(v)}</td></tr>`)
    .join('')}</table>`;

/** Credencial de la campaña, para responder desde el celular antes o durante la visita. */
export function campaignAccessEmail(o: { to: string; companyName: string; campaignName: string; username: string; password: string; url: string }): MailMessage {
  const subject = `Tus evaluaciones con Sanithelp · ${o.companyName}`;
  const text = [
    'Hola,',
    '',
    'Puedes responder tus evaluaciones desde tu celular o computador.',
    `Empresa: ${o.companyName}`,
    `Campaña: ${o.campaignName}`,
    '',
    `1. Abre: ${o.url}`,
    `2. Usuario: ${o.username}`,
    `3. Contraseña: ${o.password}`,
    '4. Después te pediremos tu documento y tu nombre. Al empezar recibirás un código personal para continuar si te interrumpes: guárdalo.',
    '',
    'Sanithelp S.A.S.',
  ].join('\n');
  const html = layout(
    'Responde tus evaluaciones desde tu celular',
    `<p style="margin:0 0 8px">Empresa: <strong>${esc(o.companyName)}</strong><br>Campaña: <strong>${esc(o.campaignName)}</strong></p>
<p style="margin:12px 0 4px">Ingresa con esta credencial:</p>${box([['Usuario', o.username], ['Contraseña', o.password]])}
<p style="margin:16px 0"><a href="${esc(o.url)}" style="background:#0b5c7a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block">Abrir la plataforma</a></p>
<p style="margin:0;color:#5a7083;font-size:14px">Después te pediremos tu documento y tu nombre. Al empezar recibirás un <strong>código personal</strong> para continuar si te interrumpes; guárdalo.</p>`,
  );
  return { to: o.to, subject, text, html };
}

/** Código personal para retomar el cuestionario (las personas suelen no guardarlo). */
export function resumeCodeEmail(o: { to: string; campaignName: string; code: string; url: string }): MailMessage {
  const subject = 'Tu código para continuar tus evaluaciones';
  const text = `Hola,\n\nTu código personal para continuar tu cuestionario (${o.campaignName}) es: ${o.code}\n\nIngresa a ${o.url} con la credencial de tu empresa, elige «Retomar» y escribe tu documento y este código.\n\nSanithelp S.A.S.`;
  const html = layout('Tu código para continuar', `<p style="margin:0 0 8px">Si te interrumpes, podrás retomar tu cuestionario (<strong>${esc(o.campaignName)}</strong>) con este código:</p>${box([['Código personal', o.code]])}<p style="margin:0;color:#5a7083;font-size:14px">Ingresa con la credencial de tu empresa, elige <strong>Retomar</strong> y escribe tu documento y este código.</p>`);
  return { to: o.to, subject, text, html };
}

/** Código de un solo uso para la verificación en dos pasos del personal. */
export function otpEmail(o: { to: string; code: string; minutes: number }): MailMessage {
  const subject = `Código de verificación: ${o.code}`;
  const text = `Tu código de verificación de Sanithelp es ${o.code}. Vence en ${o.minutes} minutos. Si no fuiste tú, cambia tu contraseña.`;
  const html = layout('Tu código de verificación', `${box([['Código', o.code]])}<p style="margin:0;color:#5a7083;font-size:14px">Vence en ${o.minutes} minutos. Si no intentaste ingresar, cambia tu contraseña y avisa al administrador.</p>`);
  return { to: o.to, subject, text, html };
}

export function testEmail(to: string): MailMessage {
  return { to, subject: 'Prueba de correo · Sanithelp', text: 'El envío de correo de Sanithelp funciona correctamente.', html: layout('Prueba de correo', '<p style="margin:0">El envío de correo de Sanithelp funciona correctamente.</p>') };
}

/** Resumen diario de pendientes para el personal. */
export function digestEmail(o: { to: string; name: string; lines: string[] }): MailMessage {
  return {
    to: o.to,
    subject: 'Resumen de pendientes · Sanithelp',
    text: `Hola ${o.name},\n\n${o.lines.map((l) => `• ${l}`).join('\n')}`,
    html: layout(`Hola ${o.name}, esto te falta`, `<ul style="padding-left:18px;margin:0">${o.lines.map((l) => `<li style="margin:6px 0">${esc(l)}</li>`).join('')}</ul>`),
  };
}
