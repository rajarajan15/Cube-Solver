import React, { useEffect, useRef, useState } from 'react';

// [id, name, background, card, accent] — the colours themselves live in styles.css
export const THEMES = [
  ['midnight', 'Midnight', '#0f1115', '#181b22', '#6c8cff'],
  ['daylight', 'Daylight', '#f4f6fb', '#ffffff', '#3d5afe'],
  ['ocean', 'Ocean', '#06202b', '#0b2f3d', '#2ec4d6'],
  ['sunset', 'Sunset', '#1f1027', '#2c1736', '#ff8a4c'],
  ['forest', 'Forest', '#0e1a12', '#15261b', '#7bd389'],
  ['neon', 'Neon', '#0a0614', '#140c26', '#ff3df2'],
  ['paper', 'Paper', '#f3ecdf', '#fbf6ec', '#b0532a'],
  ['contrast', 'High contrast', '#000000', '#0d0d0d', '#ffe600'],
];
const KEY = 'cube-solver-theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem(KEY); if (THEMES.some((x) => x[0] === t)) return t; } catch { /* ignore */ }
    try { if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'daylight'; } catch { /* ignore */ }
    return 'midnight';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const t = THEMES.find((x) => x[0] === theme);
    if (meta && t) meta.setAttribute('content', t[2]);
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme];
}

export default function ThemePicker({ theme, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const cur = THEMES.find((t) => t[0] === theme) || THEMES[0];
  return (
    <div className="theme-picker" ref={ref}>
      <button className="theme-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" title="Change theme">
        <span className="theme-dot" style={{ background: `linear-gradient(135deg, ${cur[2]} 50%, ${cur[4]} 50%)` }} />
        {cur[1]}
      </button>
      {open && (
        <div className="theme-pop" role="menu">
          {THEMES.map(([id, name, bg, card, accent]) => (
            <button key={id} role="menuitemradio" aria-checked={theme === id} className={`theme-tile ${theme === id ? 'on' : ''}`}
              onClick={() => { onChange(id); setOpen(false); }}>
              <span className="theme-prev" style={{ background: bg }}>
                <span style={{ background: card }} /><span style={{ background: accent }} />
              </span>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
