import React from 'react';
import { COLORS, EMPTY } from '../colors.js';

// grid placement of each face in the unfolded net: U R F D L B -> [col,row]
const PLACE = { 0: [2, 1], 1: [3, 2], 2: [2, 2], 3: [2, 3], 4: [1, 2], 5: [4, 2] };
const LABEL = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];

// Flat net of an NxN cube. Editable when onPaint is given.
export default function CubeNet({ state, N = 4, onPaint, labels = true, className = '' }) {
  return (
    <div className={`net ${className}`} style={{ '--n': N }}>
      {[0, 1, 2, 3, 4, 5].map((f) => (
        <div key={f} className="face" style={{ gridColumn: PLACE[f][0], gridRow: PLACE[f][1] }}>
          {labels && <div className="face-label">{LABEL[f]}</div>}
          <div className="face-grid" style={{ gridTemplateColumns: `repeat(${N}, var(--s))` }}>
            {Array.from({ length: N * N }, (_, k) => {
              const i = f * N * N + k;
              const v = state[i];
              const style = v === EMPTY || v === undefined ? undefined : { background: COLORS[v].hex };
              const cls = `sticker ${style ? '' : 'empty'}`;
              return onPaint ? (
                <button key={k} className={cls} style={style} onClick={() => onPaint(i)} aria-label={`${LABEL[f]} sticker ${k + 1}`} />
              ) : (
                <div key={k} className={cls} style={style} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
