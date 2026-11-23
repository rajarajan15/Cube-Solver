import React, { useEffect, useMemo, useState } from 'react';
import CubeNet from './components/CubeNet.jsx';
import Solution from './components/Solution.jsx';
import Arena from './components/Arena.jsx';
import SizePicker from './components/SizePicker.jsx';
import ThemePicker, { useTheme } from './components/ThemePicker.jsx';
import { COLORS, COLOR_NAMES, DEFAULT_SCHEME, EMPTY } from './colors.js';
import { PRESETS, randomScramble } from './patterns.js';
import { applyAlg, solvedState } from './engine/cube.js';
import { validate, allSchemes, getPieces } from './engine/pieces.js';
import { useSolver } from './useSolver.js';

// ---- pages: #/ (editor), #/solution, #/arena — so the browser Back button works ----
const readPage = () => {
  const h = window.location.hash;
  return h === '#/solution' ? 'solution' : h === '#/arena' ? 'arena' : 'edit';
};
function usePage() {
  const [page, setPage] = useState(readPage);
  useEffect(() => {
    const on = () => setPage(readPage());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p) => { window.location.hash = p === 'edit' ? '#/' : `#/${p}`; };
  return [page, go];
}

const fresh = (N) => ({ cube: solvedState(DEFAULT_SCHEME, N), target: solvedState(DEFAULT_SCHEME, N), recipe: null, history: [] });

// Colour layout the solver will use for this cube (so a target pattern matches it).
// Mirrors defaultScheme() in solver/index.js without loading the solver into the main bundle.
function schemeOf(cube, N) {
  try {
    const v = validate(cube);
    if (!v.ok) return DEFAULT_SCHEME;
    if (N === 3) return [0, 1, 2, 3, 4, 5].map((f) => cube[f * 9 + 4]);
    const P = getPieces(N);
    let best = null;
    for (const scheme of allSchemes(cube, v.opp)) {
      let score = 0;
      if (N === 4) { for (const c of P.centers) if (cube[c.sticker] === scheme[c.face]) score++; }
      else for (const c of P.corners) if (c.pos[1] < 0 && c.stickers.every((i) => cube[i] === scheme[P.geo.faceOf[i]])) score++;
      if (!best || score > best.score) best = { scheme, score };
    }
    return best.scheme;
  } catch { return DEFAULT_SCHEME; }
}

const SIZE_KEY = 'cube-solver-size';

export default function App() {
  const [theme, setTheme] = useTheme();
  const [page, go] = usePage();
  const [N, setN] = useState(() => {
    try { const v = Number(localStorage.getItem(SIZE_KEY)); return [2, 3, 4].includes(v) ? v : 4; } catch { return 4; }
  });
  const [boards, setBoards] = useState({}); // one editor board per size
  const board = boards[N] || fresh(N);
  const setBoard = (fn) => setBoards((b) => ({ ...b, [N]: fn(b[N] || fresh(N)) }));
  const { cube, target, recipe, history } = board;

  const [mode, setMode] = useState('solve'); // solve | pattern
  const [editing, setEditing] = useState('cur'); // cur | tgt
  const [brush, setBrush] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [result, setResult] = useState(null); // {res, start}
  const [arena, setArena] = useState(null); // {N, start, key}
  const request = useSolver();

  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  useEffect(() => { try { localStorage.setItem(SIZE_KEY, String(N)); } catch { /* ignore */ } }, [N]);

  const which = mode === 'pattern' ? editing : 'cur';
  const edited = which === 'cur' ? cube : target;
  const checkCur = useMemo(() => validate(cube, COLOR_NAMES), [cube]);
  const checkTgt = useMemo(() => validate(target, COLOR_NAMES), [target]);
  const check = which === 'cur' ? checkCur : checkTgt;
  const counts = useMemo(() => {
    const c = new Array(6).fill(0);
    for (const v of edited) if (v >= 0) c[v]++;
    return c;
  }, [edited]);
  const curScheme = useMemo(() => schemeOf(cube, N), [cube, N]);
  const schemeForEdited = which === 'tgt' ? curScheme : DEFAULT_SCHEME;
  const per = N * N;

  const put = (key, next, newRecipe = null) => {
    setBoard((b) => ({
      ...b,
      history: [...b.history.slice(-50), { key, prev: key === 'cur' ? b.cube : b.target, recipe: b.recipe }],
      ...(key === 'cur' ? { cube: next } : { target: next, recipe: newRecipe }),
    }));
    setProblems([]);
  };
  const paint = (i) => {
    if (edited[i] === brush) return;
    const next = Int8Array.from(edited); next[i] = brush; put(which, next);
  };
  const undo = () => setBoard((b) => {
    const h = b.history[b.history.length - 1];
    if (!h) return b;
    return { ...b, history: b.history.slice(0, -1), ...(h.key === 'cur' ? { cube: h.prev } : { target: h.prev, recipe: h.recipe }) };
  });
  const switchMode = (m) => { setMode(m); setEditing('cur'); setProblems([]); };
  const changeSize = (n) => { setN(n); setEditing('cur'); setProblems([]); };
  const usePreset = (p) => put(which, applyAlg(solvedState(schemeForEdited, N), p.alg, N), which === 'tgt' ? p.alg : null);

  const run = async () => {
    setProblems([]);
    if (!checkCur.ok) { setEditing('cur'); setProblems(checkCur.errors); return; }
    if (mode === 'pattern' && !checkTgt.ok) { setEditing('tgt'); setProblems(checkTgt.errors); return; }
    setBusy(true);
    const res = await request({ kind: 'solve', N, state: cube, target: mode === 'pattern' ? target : null, recipe, colorNames: COLOR_NAMES });
    setBusy(false);
    if (res.ok) { setResult({ res, start: cube }); go('solution'); } else setProblems(res.errors);
  };

  const openArena = (state, n) => { setArena({ N: n, start: state, key: Date.now() }); go('arena'); };
  const playYourself = () => {
    setProblems([]);
    if (!checkCur.ok) { setEditing('cur'); setProblems(checkCur.errors); return; }
    openArena(cube, N);
  };
  // "Full solution" from the arena: solve the arena's current position
  const fullFrom = async (state, n) => {
    setBusy(true);
    const res = await request({ kind: 'solve', N: n, state, colorNames: COLOR_NAMES });
    setBusy(false);
    if (res.ok) { setResult({ res, start: state }); go('solution'); }
  };

  const shown = page === 'solution' && result ? 'solution' : page === 'arena' && arena ? 'arena' : 'edit';

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo" aria-hidden="true"><i /><i /><i /><i /></span>
          <h1>Cube Solver</h1>
        </div>
        <ThemePicker theme={theme} onChange={setTheme} />
      </header>

      {shown === 'solution' && (
        <Solution key={result.res.fastAlg + result.start.join('')} start={result.start} result={result.res}
          onBack={() => go('edit')} onArena={() => openArena(result.start, result.res.N || 4)} />
      )}

      {shown === 'arena' && (
        <Arena key={arena.key} N={arena.N} start={arena.start} request={request}
          onExit={() => go('edit')} onFullSolution={(s) => fullFrom(s, arena.N)} />
      )}

      {shown === 'edit' && (
        <main>
          <SizePicker value={N} onChange={changeSize} />

          <div className="seg modeseg">
            <button className={mode === 'solve' ? 'on' : ''} onClick={() => switchMode('solve')}>Solve a cube</button>
            <button className={mode === 'pattern' ? 'on' : ''} onClick={() => switchMode('pattern')}>Make a pattern</button>
          </div>

          <section className="card help">
            {mode === 'solve' ? (
              <><b>1. Enter your {N}×{N}.</b> Pick a colour, then tap stickers (or start from a pattern below). </>
            ) : (
              <><b>Make a pattern.</b> Enter your <i>current</i> cube, then switch to <i>Target pattern</i> and pick a preset or paint it. Hold the cube the same way for both, and the target must use the same colours. </>
            )}
            Hold the cube with one face as <i>Front</i> and another on <i>Up</i>, and copy each face as you see it:
            <ul>
              <li><b>Up</b>: look from above, with the Back edge at the top of the grid.</li>
              <li><b>Down</b>: look from below, with the Front edge at the top.</li>
              <li><b>Left / Front / Right / Back</b>: as you see them, Up edge on top.</li>
              {N === 3 && <li>The centre stickers never move, so they decide which colour each face ends up.</li>}
            </ul>
          </section>

          {mode === 'pattern' && (
            <div className="seg editseg">
              <button className={editing === 'cur' ? 'on' : ''} onClick={() => setEditing('cur')}>Current cube {checkCur.ok ? '✓' : '⚠'}</button>
              <button className={editing === 'tgt' ? 'on' : ''} onClick={() => setEditing('tgt')}>Target pattern {checkTgt.ok ? '✓' : '⚠'}</button>
            </div>
          )}

          {PRESETS[N].length > 0 && (
            <div className="presets">
              <span className="muted">{which === 'tgt' ? 'Target presets:' : 'Start from a pattern:'}</span>
              {PRESETS[N].map((p) => <button key={p.id} className="mini" onClick={() => usePreset(p)}>{p.name}</button>)}
            </div>
          )}

          <div className="palette">
            {COLORS.map((c, i) => (
              <button key={c.name} className={`swatch ${brush === i ? 'sel' : ''}`} style={{ background: c.hex }} onClick={() => setBrush(i)} aria-label={c.name}>
                <span className={`cnt ${counts[i] === per ? 'ok' : counts[i] > per ? 'bad' : ''}`}>{counts[i]}</span>
              </button>
            ))}
            <button className={`swatch eraser ${brush === EMPTY ? 'sel' : ''}`} onClick={() => setBrush(EMPTY)} aria-label="Erase">✕</button>
          </div>
          <div className="brushname">
            {mode === 'pattern' && <b>{which === 'cur' ? 'Editing: current cube' : 'Editing: target pattern'} · </b>}
            Painting with: <b>{brush === EMPTY ? 'eraser' : COLOR_NAMES[brush]}</b> <span className="muted">(each colour needs exactly {per})</span>
          </div>

          <CubeNet N={N} state={edited} onPaint={paint} />

          <div className="row">
            <button onClick={undo} disabled={!history.length}>Undo</button>
            <button onClick={() => put(which, solvedState(schemeForEdited, N))}>Solved</button>
            <button onClick={() => put(which, new Int8Array(6 * per).fill(EMPTY))}>Clear</button>
            <button onClick={() => put(which, applyAlg(solvedState(schemeForEdited, N), randomScramble(N), N))}>Random</button>
          </div>
          {mode === 'pattern' && which === 'tgt' && (
            <div className="row"><button className="wideb" onClick={() => put('tgt', Int8Array.from(cube))}>Copy current cube → target</button></div>
          )}

          {(problems.length > 0 || !check.ok) && (
            <div className="card issues">
              {(problems.length ? problems : check.errors).slice(0, 6).map((e, i) => <div key={i}>⚠ {e}</div>)}
            </div>
          )}
          {check.ok && !problems.length && <div className="card okbox">✓ {mode === 'pattern' ? (which === 'cur' ? 'Current cube' : 'Target pattern') : 'This cube'} is valid and solvable.</div>}

          <button className="solve" onClick={run} disabled={busy}>
            {busy ? 'Working…' : mode === 'pattern' ? 'Show me how to get there' : 'Solve my cube'}
          </button>
          {mode === 'solve' && (
            <button className="arena-cta" onClick={playYourself} disabled={busy}>
              <span className="arena-cta-icon">🎮</span>
              <span><b>Solve it yourself</b><small>Turn the cube in the play arena and ask for help one formula at a time.</small></span>
              <span aria-hidden="true">→</span>
            </button>
          )}
        </main>
      )}

      {busy && shown !== 'edit' && <div className="toast"><span className="spinner" /> Working…</div>}
      <footer>2×2 · 3×3 · 4×4 · layer-by-layer and reduction solvers · 5×5 and 6×6 coming later</footer>
    </div>
  );
}
