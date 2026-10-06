import type { ReactNode } from 'react';

/** Iconos de línea (trazo 1.75), heredan el color del texto. Sin dependencias externas. */
const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5" />,
  building: <path d="M4 20.5V4.5h10v16M14 9.5h6v11M2.5 20.5h19M7.5 8h3M7.5 12h3M7.5 16h3" />,
  clipboard: <path d="M9 4h6v3H9zM7 5.5H5.5v15h13v-15H17M8.5 12h7M8.5 16h5" />,
  users: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.5 2.4 3.5 5.2" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16zM13.5 6.5l4 4" />,
  key: <path d="M14.5 9.5a4.5 4.5 0 1 1-1.3 3.2L4 13v-2.5h2V9h2l1.5-1.5M16.5 9.5h.01" />,
  power: <path d="M12 3v8M6.8 6.3a7.5 7.5 0 1 0 10.4 0" />,
  search: <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.8-4.8" />,
  eye: <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  copy: <path d="M9 9h10.5v11H9zM5.5 15H4.5v-11H15v1.5" />,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  more: <path d="M12 5.5h.01M12 12h.01M12 18.5h.01" strokeWidth="3" />,
  shield: <path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6z" />,
  lock: <path d="M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12.5 16V8M17 16v-8" />,
  refresh: <path d="M19.5 8A8 8 0 0 0 5.5 7M4.5 4v3.5H8M4.5 16A8 8 0 0 0 18.5 17M19.5 20v-3.5H16" />,
  logout: <path d="M10 4.5H5v15h5M15 8l4 4-4 4M19 12H9.5" />,
  accessibility: <path d="M12 6.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM5 8.5l7 1.5 7-1.5M12 10v4.5M9 21l3-6.5 3 6.5" />,
  help: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.8h.01" />,
  circle: <circle cx="12" cy="12" r="7.5" />,
  half: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5a7.5 7.5 0 0 0 0 15z" fill="currentColor" />
    </>
  ),
  triangle: <path d="M12 4 21 19.5H3z M12 10v4.5M12 17h.01" />,
  octagon: <path d="M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7zM12 8v5M12 16h.01" />,
  dot: <circle cx="12" cy="12" r="4.5" fill="currentColor" />,
  ring: <circle cx="12" cy="12" r="5" />,
  alert: <path d="M12 4 21 19.5H3zM12 10v4.5M12 17h.01" />,
  folder: <path d="M3 6.5h6l2 2.5h10v10.5H3z" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
