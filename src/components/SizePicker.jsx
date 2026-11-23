import React from 'react';
import { COLORS, DEFAULT_SCHEME } from '../colors.js';

export const SIZE_INFO = [
  { n: 2, name: 'Pocket', note: 'Quick warm-up', level: 1 },
  { n: 3, name: 'Classic', note: 'The original', level: 2 },
  { n: 4, name: 'Big cube', note: 'Centres + parity', level: 3 },
  { n: 5, name: 'Bigger', note: 'Coming soon', level: 4, soon: true },
  { n: 6, name: 'Huge', note: 'Coming soon', level: 5, soon: true },
];

// A tiny cube drawn with CSS 3D transforms (no WebGL), in the default colour scheme.
function MiniCube({ n }) {
  return (
    <div className="mini-cube" style={{ '--n': n }}>
      {['U', 'R', 'F', 'D', 'L', 'B'].map((f, i) => (
        <div key={f} className={`mf mf-${f}`}>
          {Array.from({ length: n * n }, (_, k) => <span key={k} style={{ background: COLORS[DEFAULT_SCHEME[i]].hex }} />)}
        </div>
      ))}
    </div>
  );
}

// Size selector: cards with spinning mini cubes that tilt towards the pointer.
export default function SizePicker({ value, onChange }) {
  const enabled = SIZE_INFO.filter((s) => !s.soon).map((s) => s.n);
  const tilt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty('--ry', `${-40 + px * 70}deg`);
    e.currentTarget.style.setProperty('--rx', `${-26 - py * 40}deg`);
  };
  const untilt = (e) => { e.currentTarget.style.removeProperty('--ry'); e.currentTarget.style.removeProperty('--rx'); };
  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = enabled.indexOf(value) + (e.key === 'ArrowRight' ? 1 : -1);
    if (i >= 0 && i < enabled.length) onChange(enabled[i]);
  };
  return (
    <div className="size-rail" role="radiogroup" aria-label="Cube size" onKeyDown={onKey}>
      {SIZE_INFO.map((s) => (
        <button
          key={s.n}
          role="radio"
          aria-checked={value === s.n}
          aria-disabled={s.soon || undefined}
          tabIndex={value === s.n ? 0 : -1}
          className={`size-card ${value === s.n ? 'on' : ''} ${s.soon ? 'soon' : ''}`}
          onClick={() => !s.soon && onChange(s.n)}
          onPointerMove={s.soon ? undefined : tilt}
          onPointerLeave={untilt}
          title={s.soon ? 'Coming soon' : `${s.n}×${s.n} ${s.name}`}
        >
          {s.soon && <span className="soon-badge">soon</span>}
          <div className="mini-stage"><MiniCube n={s.n} /></div>
          <div className="size-label">{s.n}×{s.n}</div>
          <div className="size-name">{s.name}</div>
          <div className="size-level" aria-label={`difficulty ${s.level} of 5`}>
            {[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= s.level ? 'on' : ''} />)}
          </div>
        </button>
      ))}
    </div>
  );
}
