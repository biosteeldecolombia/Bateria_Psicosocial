import { useEffect, useId, useRef, useState } from 'react';
import type { Preferences } from '@sanithelp/shared';
import { usePrefs } from './prefs';
import { Icon } from './icons';
import { useDismissOutside } from './ui';

function Segmented<T extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="seg">
        {options.map(([v, label]) => (
          <label key={v}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="range">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={format(value)} />
        <output htmlFor={id}>{format(value)}</output>
      </div>
    </div>
  );
}

export function A11yPanel() {
  const { prefs, setPrefs, reset } = usePrefs();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useDismissOutside(open, [panelRef, btnRef], () => setOpen(false));
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => setPrefs({ ...prefs, [k]: v });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        btnRef.current?.focus();
      }
      if (e.altKey && e.key.toLowerCase() === 'a') setOpen((o) => !o); // atajo: Alt + A
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button ref={btnRef} className="btn secondary a11y-btn" aria-expanded={open} aria-controls="a11y-panel" onClick={() => setOpen((o) => !o)} aria-keyshortcuts="Alt+A">
        <Icon name="accessibility" /> Accesibilidad
      </button>
      {open && (
        <section ref={panelRef} id="a11y-panel" className="a11y-panel" aria-labelledby="a11y-title">
          <h2 id="a11y-title">Accesibilidad</h2>
          <p className="hint">Tus preferencias se guardan. Cierra con Esc o pulsando fuera.</p>
          <Segmented legend="Tema" name="theme" value={prefs.theme} onChange={(v) => set('theme', v)} options={[['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro'], ['contrast', 'Alto contraste']]} />
          <Segmented legend="Tipo de letra" name="font" value={prefs.font} onChange={(v) => set('font', v)} options={[['system', 'Del sistema'], ['atkinson', 'Atkinson (baja visión)'], ['lexend', 'Lexend'], ['dyslexic', 'OpenDyslexic (dislexia)'], ['serif', 'Con serifa']]} />
          <Slider label="Tamaño del texto" value={prefs.textScale} min={100} max={200} step={10} format={(n) => `${n} %`} onChange={(v) => set('textScale', v)} />
          <Slider label="Interlineado" value={prefs.lineHeight} min={1.2} max={2.4} step={0.1} format={(n) => n.toFixed(1)} onChange={(v) => set('lineHeight', v)} />
          <Slider label="Espacio entre letras" value={prefs.letterSpacing} min={0} max={0.2} step={0.02} format={(n) => `${n.toFixed(2)} em`} onChange={(v) => set('letterSpacing', v)} />
          <Slider label="Espacio entre palabras" value={prefs.wordSpacing} min={0} max={0.5} step={0.05} format={(n) => `${n.toFixed(2)} em`} onChange={(v) => set('wordSpacing', v)} />
          <label className="check"><input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => set('reduceMotion', e.target.checked)} /> Quitar animaciones</label>
          <label className="check"><input type="checkbox" checked={prefs.focusReading} onChange={(e) => set('focusReading', e.target.checked)} /> Lectura enfocada (una pregunta a la vez)</label>
          <button className="btn secondary" onClick={reset}>Restablecer</button>
        </section>
      )}
    </>
  );
}
