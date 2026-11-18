import nodemailer from 'nodemailer';
import type { Config } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** Falso cuando no hay correo configurado: las funciones que dependen de él se ocultan o avisan. */
  enabled: boolean;
  provider: 'none' | 'graph' | 'smtp' | 'brevo';
  from: string | null;
  send(msg: MailMessage): Promise<void>;
}

/** Token de aplicación de Microsoft Graph (flujo «client credentials»), con caché hasta poco antes de vencer. */
function graphTokenProvider(cfg: Config) {
  let cached: { token: string; exp: number } | null = null;
  return async () => {
    if (cached && cached.exp - 60_000 > Date.now()) return cached.token;
    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.MS_TENANT_ID!)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.MS_CLIENT_ID!, client_secret: cfg.MS_CLIENT_SECRET!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !j.access_token) throw new Error(`Microsoft rechazó las llaves (${res.status}). Revisa tenant, id de aplicación y secreto.`);
    cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3000) * 1000 };
    return cached.token;
  };
}

export function createMailer(cfg: Config): Mailer {
  if (cfg.MAIL_PROVIDER === 'graph') {
    const token = graphTokenProvider(cfg);
    return {
      enabled: true,
      provider: 'graph',
      from: cfg.MAIL_FROM!,
      async send(m) {
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.MAIL_FROM!)}/sendMail`, {
          method: 'POST',
          headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message: { subject: m.subject, body: { contentType: 'HTML', content: m.html }, toRecipients: [{ emailAddress: { address: m.to } }] }, saveToSentItems: true }),
        });
        if (!res.ok) throw new Error(`Microsoft Graph respondió ${res.status} al enviar. Revisa el permiso Mail.Send y el buzón remitente.`);
      },
    };
  }
  if (cfg.MAIL_PROVIDER === 'brevo') {
    return {
      enabled: true,
      provider: 'brevo',
      from: cfg.MAIL_FROM!,
      async send(m) {
        let res: Response;
        try {
          res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': cfg.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sender: { name: cfg.MAIL_FROM_NAME, email: cfg.MAIL_FROM! }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
            signal: AbortSignal.timeout(15_000),
          });
        } catch {
          throw new Error('No se pudo conectar con Brevo (tiempo agotado).');
        }
        if (res.status === 401) throw new Error('Brevo rechazó la llave de API. Revisa BREVO_API_KEY.');
        if (!res.ok) throw new Error(`Brevo respondió ${res.status}. Revisa que el remitente ${cfg.MAIL_FROM} esté verificado en Brevo (Remitentes y dominios).`);
      },
    };
  }
  if (cfg.MAIL_PROVIDER === 'smtp') {
    const transport = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_PORT === 465,
      requireTLS: cfg.SMTP_PORT !== 465,
      auth: { user: cfg.SMTP_USER!, pass: cfg.SMTP_PASSWORD! },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return {
      enabled: true,
      provider: 'smtp',
      from: cfg.MAIL_FROM!,
      async send(m) {
        try {
          await transport.sendMail({ from: { name: cfg.MAIL_FROM_NAME, address: cfg.MAIL_FROM! }, to: m.to, subject: m.subject, text: m.text, html: m.html });
        } catch (e) {
          const err = e as { code?: string; responseCode?: number; message: string };
          if (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET')
            throw new Error('No se pudo conectar al servidor SMTP (tiempo agotado). Es probable que el hosting bloquee el puerto 587; usa Microsoft Graph (docs/CORREO_OUTLOOK.md, opción A).');
          if (err.responseCode === 535 || err.code === 'EAUTH')
            throw new Error('Outlook rechazó el usuario o la contraseña de aplicación. Revisa que «SMTP autenticado» esté activo en el buzón.');
          throw new Error(`No se pudo enviar por SMTP: ${err.message}`);
        }
      },
    };
  }
  return {
    enabled: false,
    provider: 'none',
    from: null,
    send: async () => {
      throw new Error('El envío de correo no está configurado.');
    },
  };
}
