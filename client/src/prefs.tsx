import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_PREFERENCES, type Preferences } from '@sanithelp/shared';
import { api } from './api';

const KEY = 'sanithelp.prefs';

function readLocal(): Preferences {
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function apply(p: Preferences) {
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  el.dataset.font = p.font;
  el.dataset.motion = p.reduceMotion ? 'reduce' : 'auto';
  el.dataset.focus = p.focusReading ? 'on' : 'off';
  el.style.setProperty('--text-scale', String(p.textScale / 100));
  el.style.setProperty('--line-height', String(p.lineHeight));
  el.style.setProperty('--letter-spacing', `${p.letterSpacing}em`);
  el.style.setProperty('--word-spacing', `${p.wordSpacing}em`);
}

interface Ctx {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
  /** Al iniciar sesión, las preferencias guardadas en el perfil reemplazan las locales. */
  adopt: (p: Preferences) => void;
  reset: () => void;
  setAuthed: (v: boolean) => void;
}
const PrefsCtx = createContext<Ctx>(null as never);
export const usePrefs = () => useContext(PrefsCtx);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<Preferences>(readLocal);
  const authedRef = useRef(false);
  useEffect(() => apply(prefs), [prefs]);

  const store = useCallback((p: Preferences) => {
    setState(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* sin almacenamiento local: se aplica igual en esta sesión */
    }
  }, []);
  const setPrefs = useCallback(
    (p: Preferences) => {
      store(p);
      if (authedRef.current) void api('PUT', '/api/auth/preferences', p).catch(() => undefined);
    },
    [store],
  );
  const setAuthed = useCallback((v: boolean) => {
    authedRef.current = v;
  }, []);
  const reset = useCallback(() => setPrefs(DEFAULT_PREFERENCES), [setPrefs]);

  // Las funciones son estables: cambiar las preferencias no debe re-disparar efectos que dependan de ellas.
  const value = useMemo<Ctx>(() => ({ prefs, setPrefs, adopt: store, reset, setAuthed }), [prefs, setPrefs, store, reset, setAuthed]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}
