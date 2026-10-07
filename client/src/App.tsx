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
import { Backdrop, PRODUCT_NAME, Splash } from './BrandLoader';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', psychologist: 'Psicóloga', collaborator: 'Colaborador', company: 'Empresa cliente' };

function Shell({ me, onLogout, wide, children }: { me: MeResponse | null; onLogout?: () => void; wide?: boolean; children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  return (
    <>
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
      <section className="login-card" aria-labelledby="t">
        <span className="hero-mark" aria-hidden="true">
          <span className="hero-wave" />
          <span className="hero-wave hero-wave-2" />
          <img src="/brand/logo_sanithelp_icono.webp" alt="" width="96" height="96" />
        </span>
        <h1 id="t"><span className="eyebrow">Sanithelp</span> Evaluaciones Psicométricas</h1>
        <p className="muted lead">Ingresa con el usuario y la contraseña que te entregó Sanithelp. Si vas a responder las evaluaciones, es la credencial de tu empresa; después te identificarás con tu documento.</p>
        <form onSubmit={submit} noValidate aria-busy={busy}>
          <ErrorBox msg={error} />
          <label htmlFor="u">Usuario</label>
          <input id="u" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <label htmlFor="p">Contraseña</label>
          <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn block" disabled={busy || !username || !password}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </div>
  );
}

function MfaSetup({ onMe }: { onMe: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [loadErr, setLoadErr] = useState('');
  useEffect(() => {
    api('POST', '/api/auth/mfa/setup').then(setSetup).catch((e) => setLoadErr(e.message));
  }, []);
  const { error, busy, submit } = useSubmit(async () => setCodes((await api('POST', '/api/auth/mfa/enable', { code })).recoveryCodes));

  if (codes) {
    return (
      <section className="card narrow" aria-labelledby="t">
        <h1 id="t">Guarda tus códigos de recuperación</h1>
        <p>Si pierdes tu teléfono podrás entrar con uno de estos códigos (cada uno sirve una sola vez). <strong>No se volverán a mostrar.</strong></p>
        <ul className="codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <button className="btn block" onClick={onMe}>Ya los guardé, continuar</button>
      </section>
    );
  }
  return (
    <section className="card narrow" aria-labelledby="t">
      <h1 id="t">Activa la verificación en dos pasos</h1>
      <p className="muted">Es obligatoria para tu rol. Escanea el código con una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, Authy…).</p>
      <ErrorBox msg={loadErr} />
      {setup && (
        <>
          <img className="qr" src={setup.qrDataUrl} alt="Código QR para la aplicación de autenticación" width="220" height="220" />
          <p className="hint">¿No puedes escanear? Escribe esta clave en la aplicación: <code>{setup.secret}</code></p>
          <form onSubmit={submit} noValidate>
            <ErrorBox msg={error} />
            <label htmlFor="m">Código de 6 dígitos</label>
            <input id="m" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn block" disabled={busy || code.length < 6}>Activar</button>
          </form>
        </>
      )}
    </section>
  );
}

function MfaVerify({ onMe }: { onMe: (m: MeResponse) => void }) {
  const [code, setCode] = useState('');
  const { error, busy, submit } = useSubmit(async () => onMe(await api('POST', '/api/auth/mfa/verify', { code })));
  return (
    <section className="card narrow" aria-labelledby="t">
      <h1 id="t">Verificación en dos pasos</h1>
      <p className="muted">Escribe el código de tu aplicación de autenticación, o un código de recuperación.</p>
      <form onSubmit={submit} noValidate>
        <ErrorBox msg={error} />
        <label htmlFor="m">Código</label>
        <input id="m" type="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn block" disabled={busy || code.length < 6}>Verificar</button>
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
  else if (me.role === 'admin' || me.role === 'psychologist') body = <><Management me={me} /><Footer me={me} onLogoutAll={logoutAll} /></>;
  else body = <><CompanyHome me={me} /><Footer me={me} onLogoutAll={logoutAll} /></>;

  return (
    <Shell me={me} onLogout={me ? logout : undefined} wide={!!me && me.status === 'ready' && (me.role === 'admin' || me.role === 'psychologist')}>
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
