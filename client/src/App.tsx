import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { MeResponse } from '@sanithelp/shared';
import { api, ApiError, getMe, setCsrf } from './api';
import { A11yPanel } from './A11yPanel';
import { Help } from './Help';
import { PrefsProvider, usePrefs } from './prefs';
import { Management } from './Management';
import { Participation } from './Participation';
import { CompanyHome } from './analysis/CompanyHome';
import { Icon } from './icons';
import { Backdrop, LogoFull, PRODUCT_NAME, Splash } from './BrandLoader';
import { CopyButton } from './ui';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', psychologist: 'Psicóloga', assistant: 'Auxiliar administrativo', collaborator: 'Colaborador', company: 'Empresa cliente' };

function Shell({ me, onLogout, wide, children }: { me: MeResponse | null; onLogout?: () => void; wide?: boolean; children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  return (
    <>
      <Backdrop tone="auto" />
      <a className="skip-link" href="#contenido" onClick={() => mainRef.current?.focus()}>Saltar al contenido</a>
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${PRODUCT_NAME}: inicio`}>
          <img src="/brand/logo_sanithelp_icono.webp" alt="" width="42" height="42" />
          <span>{PRODUCT_NAME}</span>
        </a>
        {me && <span className="who"><Icon name="user" size={16} /> {me.fullName} · {ROLE_LABEL[me.role]}</span>}
        {me && <Help role={me.role} />}
        <A11yPanel />
        {me && onLogout && <button className="btn secondary" onClick={onLogout}><Icon name="logout" /> Cerrar sesión</button>}
      </header>
      <main id="contenido" tabIndex={-1} ref={mainRef} className={wide ? 'wide' : undefined}>
        {children}
        <p className="footer">
          Instrumento oficial Mintrabajo (Res. 2404/2019) · Datos sensibles — Ley 1581/2012 · Sanithelp S.A.S.
        </p>
      </main>
    </>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return msg ? <div className="alert error" role="alert">{msg}</div> : null;
}

function useSubmit(fn: () => Promise<void>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, submit };
}

function Login({ onMe }: { onMe: (m: MeResponse) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, submit } = useSubmit(async () => onMe(await api('POST', '/api/auth/login', { username, password })));
  return (
    <div className="auth-stage">
      <Backdrop />
      <div className="login-split">
        <section className="login-form-side" aria-labelledby="login-t">
          <LogoFull />
          <h2 id="login-t">Ingresar</h2>
          <p className="sub">Con el usuario y la contraseña que te entregó Sanithelp</p>
          <form onSubmit={submit} noValidate aria-busy={busy}>
            <ErrorBox msg={error} />
            <label htmlFor="u">Usuario</label>
            <div className="pill-field">
              <Icon name="user" size={20} />
              <input id="u" type="text" autoComplete="username" placeholder="Tu usuario" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <label htmlFor="p">Contraseña</label>
            <div className="pill-field">
              <Icon name="lock" size={20} />
              <input id="p" type="password" autoComplete="current-password" placeholder="Tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn pill block" disabled={busy || !username || !password}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {busy ? 'Ingresando…' : 'Ingresar'}
              {!busy && <Icon name="arrow" size={18} />}
            </button>
          </form>
          <p className="login-help">¿Problemas para ingresar? Escribe a la psicóloga responsable o a Sanithelp.</p>
        </section>
        <div className="login-hero">
          <span className="hero-blob hb1" aria-hidden="true" />
          <span className="hero-blob hb2" aria-hidden="true" />
          <span className="hero-blob hb3" aria-hidden="true" />
          <p className="hero-welcome">Bienvenidos.</p>
          <h1><span className="eyebrow">Sanithelp</span> Evaluaciones Psicométricas</h1>
          <p className="lead">Si vas a responder las evaluaciones, ingresa con la credencial de tu empresa; después te identificarás con tu documento.</p>
        </div>
      </div>
    </div>
  );
}

interface MfaMethods { totp: boolean; email: boolean; current: 'totp' | 'email' | null; trustedDeviceDays: number }

function useMfaMethods() {
  const [m, setM] = useState<MfaMethods | null>(null);
  useEffect(() => { api<MfaMethods>('GET', '/api/auth/mfa/methods').then(setM).catch(() => setM({ totp: true, email: false, current: null, trustedDeviceDays: 0 })); }, []);
  return m;
}

/** Casilla para no volver a pedir el segundo paso en este equipo durante unos días. */
function RememberDevice({ days, value, onChange }: { days: number; value: boolean; onChange: (v: boolean) => void }) {
  if (days <= 0) return null;
  return <label className="check"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> Confiar en este equipo durante {days} {days === 1 ? 'día' : 'días'} (no pedir el código otra vez)</label>;
}

function MfaSetup({ onMe }: { onMe: () => void }) {
  const methods = useMfaMethods();
  const [method, setMethod] = useState<'totp' | 'email'>('email');
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  // Si el correo está disponible es la opción por defecto (más cómoda); si no, la aplicación.
  useEffect(() => { if (methods && !methods.email) setMethod('totp'); }, [methods]);
  useEffect(() => {
    if (method === 'totp' && !setup) api('POST', '/api/auth/mfa/setup').then(setSetup).catch((e) => setLoadErr(e.message));
  }, [method, setup]);
  const sendCode = useSubmit(async () => { await api('POST', '/api/auth/mfa/email/send'); setSent(true); });
  const enable = useSubmit(async () => setCodes((await api('POST', '/api/auth/mfa/enable', { code, method, remember })).recoveryCodes));

  if (codes) {
    return (
      <section className="card narrow" aria-labelledby="t">
        <h1 id="t">Guarda tus códigos de recuperación</h1>
        <p>Si pierdes acceso a tu correo o a tu teléfono podrás entrar con uno de estos códigos (cada uno sirve una sola vez).</p>
        <ul className="codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <p><CopyButton text={codes.join('\n')} label="Copiar los códigos" /></p>
        <button className="btn block" onClick={onMe}>Ya los guardé, continuar</button>
      </section>
    );
  }
  if (!methods) return <section className="card narrow"><Splash /></section>;
  return (
    <section className="card narrow" aria-labelledby="t">
      <h1 id="t">Activa la verificación en dos pasos</h1>
      <p className="muted">Es obligatoria para tu rol. Elige cómo prefieres recibir el código:</p>
      {methods.email && (
        <div className="seg" role="group" aria-label="Método de verificación">
          <label><input type="radio" name="mfam" checked={method === 'email'} onChange={() => setMethod('email')} /><span>Código por correo</span></label>
          <label><input type="radio" name="mfam" checked={method === 'totp'} onChange={() => setMethod('totp')} /><span>Aplicación de autenticación</span></label>
        </div>
      )}
      <ErrorBox msg={loadErr} />
      {method === 'email' ? (
        <form onSubmit={enable.submit} noValidate>
          <p className="muted">Te enviamos un código de 6 dígitos a tu correo cada vez que ingreses desde un equipo nuevo. Sin instalar nada.</p>
          <ErrorBox msg={sendCode.error || enable.error} />
          <button type="button" className="btn secondary block" disabled={sendCode.busy} onClick={(e) => void sendCode.submit(e as unknown as FormEvent)}>{sent ? 'Reenviar código' : 'Enviarme el código'}</button>
          {sent && <div className="alert ok" role="status">Revisa tu correo (y el spam). El código vence en 10 minutos.</div>}
          <label htmlFor="m">Código de 6 dígitos</label>
          <input id="m" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          <RememberDevice days={methods.trustedDeviceDays} value={remember} onChange={setRemember} />
          <button className="btn block" disabled={enable.busy || code.length < 6}>Activar</button>
        </form>
      ) : (
        setup && (
          <>
            <p className="muted">Escanea el código con una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, Authy…).</p>
            <img className="qr" src={setup.qrDataUrl} alt="Código QR para la aplicación de autenticación" width="220" height="220" />
            <p className="hint">¿No puedes escanear? Escribe esta clave en la aplicación: <code>{setup.secret}</code></p>
            <form onSubmit={enable.submit} noValidate>
              <ErrorBox msg={enable.error} />
              <label htmlFor="m">Código de 6 dígitos</label>
              <input id="m" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              <RememberDevice days={methods.trustedDeviceDays} value={remember} onChange={setRemember} />
              <button className="btn block" disabled={enable.busy || code.length < 6}>Activar</button>
            </form>
          </>
        )
      )}
    </section>
  );
}

function MfaVerify({ onMe }: { onMe: (m: MeResponse) => void }) {
  const methods = useMfaMethods();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [remember, setRemember] = useState(true);
  const verify = useSubmit(async () => onMe(await api('POST', '/api/auth/mfa/verify', { code, remember })));
  const send = useSubmit(async () => { await api('POST', '/api/auth/mfa/email/send'); setSent(true); });
  const emailOnly = methods?.current === 'email';
  return (
    <section className="card narrow" aria-labelledby="t">
      <h1 id="t">Verificación en dos pasos</h1>
      <p className="muted">{emailOnly ? 'Te enviaremos un código a tu correo.' : 'Escribe el código de tu aplicación de autenticación'}{methods?.email && !emailOnly ? ', o pide que te lo enviemos por correo' : ''}. También sirve un código de recuperación.</p>
      <form onSubmit={verify.submit} noValidate>
        <ErrorBox msg={verify.error || send.error} />
        {methods?.email && (
          <button type="button" className={emailOnly && !sent ? 'btn block' : 'btn secondary block'} disabled={send.busy} onClick={(e) => void send.submit(e as unknown as FormEvent)}>{sent ? 'Reenviar código por correo' : 'Enviarme un código por correo'}</button>
        )}
        {sent && <div className="alert ok" role="status">Te enviamos un código. Revisa tu correo (y el spam); vence en 10 minutos.</div>}
        <label htmlFor="m">Código</label>
        <input id="m" type="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        {methods && <RememberDevice days={methods.trustedDeviceDays} value={remember} onChange={setRemember} />}
        <button className="btn block" disabled={verify.busy || code.length < 6}>Verificar</button>
      </form>
    </section>
  );
}

function Footer({ me, onLogoutAll }: { me: MeResponse; onLogoutAll: () => void }) {
  return (
    <p className="muted session-note">
      Tu sesión se cierra tras {me.idleMinutes} minutos sin actividad.{' '}
      {me.role !== 'collaborator' && <button className="btn secondary sm" onClick={onLogoutAll}><Icon name="logout" size={16} /> Cerrar sesión en todos los dispositivos</button>}
    </p>
  );
}

function SessionWarning({ me, onExtend, onExpired }: { me: MeResponse; onExtend: () => void; onExpired: () => void }) {
  const [left, setLeft] = useState(Infinity);
  useEffect(() => {
    const tick = () => setLeft(Math.round((new Date(me.expiresAt).getTime() - Date.now()) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [me.expiresAt]);
  useEffect(() => {
    if (left <= 0) onExpired();
  }, [left, onExpired]);
  if (left > 120) return null;
  return (
    <div className="modal-back">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="sw-t" aria-describedby="sw-d">
        <h2 id="sw-t">Tu sesión está por cerrarse</h2>
        <p id="sw-d">Por inactividad se cerrará en {Math.max(left, 0)} segundos. Si estás respondiendo, tu avance guardado no se pierde.</p>
        <button className="btn" autoFocus onClick={onExtend}>Seguir conectado</button>
      </div>
    </div>
  );
}

function Inner() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const { adopt, setAuthed } = usePrefs();
  useEffect(() => setAuthed(me?.status === 'ready'), [me?.status, setAuthed]);

  const accept = useCallback((m: MeResponse | null) => {
    setMe(m);
    if (m) {
      setCsrf(m.csrfToken);
      if (m.status === 'ready' && Object.keys(m.preferences).length) adopt(m.preferences);
    }
  }, [adopt]);

  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    getMe().then((m) => acceptRef.current(m)).catch(() => acceptRef.current(null)).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api('POST', '/api/auth/logout').catch(() => undefined);
    setCsrf('');
    setMe(null);
  };
  const logoutAll = async () => {
    await api('POST', '/api/auth/logout-all').catch(() => undefined);
    setCsrf('');
    setMe(null);
  };
  const expired = useCallback(() => {
    setCsrf('');
    setMe(null);
    setNotice('Tu sesión se cerró por inactividad. Ingresa de nuevo para continuar.');
  }, []);
  const extend = () => api<MeResponse>('POST', '/api/auth/keepalive').then(accept).catch(expired);
  const refresh = () => getMe().then(accept).catch(() => accept(null));

  if (loading) return <Shell me={null}><Splash /></Shell>;

  let body: ReactNode;
  if (!me) body = <>{notice && <div className="alert ok" role="status">{notice}</div>}<Login onMe={(m) => { setNotice(''); accept(m); }} /></>;
  else if (me.status === 'mfa_setup') body = <MfaSetup onMe={refresh} />;
  else if (me.status === 'mfa_required') body = <MfaVerify onMe={accept} />;
  else if (me.role === 'collaborator') body = <><Participation me={me} onMe={accept} /><Footer me={me} onLogoutAll={logoutAll} /></>;
  else if (me.role === 'admin' || me.role === 'psychologist' || me.role === 'assistant') body = <><Management me={me} /><Footer me={me} onLogoutAll={logoutAll} /></>;
  else body = <><CompanyHome me={me} /><Footer me={me} onLogoutAll={logoutAll} /></>;

  return (
    <Shell me={me} onLogout={me ? logout : undefined} wide={!!me && me.status === 'ready' && (me.role === 'admin' || me.role === 'psychologist' || me.role === 'assistant')}>
      {body}
      {me && <SessionWarning me={me} onExtend={extend} onExpired={expired} />}
    </Shell>
  );
}

export function App() {
  return (
    <PrefsProvider>
      <Inner />
    </PrefsProvider>
  );
}
