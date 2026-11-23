import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cube3D from './Cube3D.jsx';
import CubeNet from './CubeNet.jsx';
import { applyAlg, invertAlg, isSolved, FACES, getGeometry } from '../engine/cube.js';
import { describeMove } from '../notation.js';
import { COLORS, COLOR_NAMES } from '../colors.js';
import { randomScramble } from '../patterns.js';

const FACE_LABEL = { U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back' };
const tokensOf = (alg) => (alg.trim() ? alg.trim().split(/\s+/) : []);
const sameState = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// move token for the selected layer: depth 0 = outer, 1 = next layer in, …; wide = outer through depth
function layerToken(face, depth, wide) {
  if (wide) { const d = Math.max(depth, 1); return d === 1 ? face + 'w' : `${d + 1}${face}w`; }
  return depth === 0 ? face : `${depth + 1}${face}`;
}

// Play arena: the user turns the cube themselves. "Help" asks the solver for just the next
// formula from the exact current state, shows where it leads, and tracks the user's progress.
export default function Arena({ N, start, request, onExit, onFullSolution }) {
  const geo = getGeometry(N);
  const maxDepth = Math.ceil(N / 2) - 1;
  const [base, setBase] = useState(start); // position "Reset" goes back to
  const [cur, setCur] = useState(start);
  const curRef = useRef(start);
  const histRef = useRef([]); // [{token, from}]
  const [moveCount, setMoveCount] = useState(0);
  const [sel, setSel] = useState({ face: 'F', depth: 0, wide: false });
  const selRef = useRef(sel);
  selRef.current = sel;
  const [anim, setAnim] = useState(null);
  const animId = useRef(0);
  const [view, setView] = useState('3d');
  const [hint, setHint] = useState(null);
  const [stageInfo, setStageInfo] = useState(null); // {stages, stage} from the last hint
  const [showMe, setShowMe] = useState(false);
  const hintReq = useRef(0);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const solvedNow = isSolved(cur, N);

  const apply = useCallback((token) => {
    const from = curRef.current;
    const to = applyAlg(from, token, N);
    curRef.current = to;
    histRef.current = [...histRef.current, { token, from }];
    setCur(to);
    setMoveCount(histRef.current.length);
    setAnim({ id: ++animId.current, token, from });
    setStartedAt((t) => t ?? Date.now());
  }, [N]);

  const undo = useCallback(() => {
    const h = histRef.current;
    if (!h.length) return;
    const last = h[h.length - 1];
    const from = curRef.current;
    histRef.current = h.slice(0, -1);
    curRef.current = last.from;
    setCur(last.from);
    setMoveCount(histRef.current.length);
    setAnim({ id: ++animId.current, token: invertAlg(last.token, N), from });
  }, [N]);

  const restartFrom = (state) => {
    curRef.current = state;
    histRef.current = [];
    setBase(state); setCur(state); setMoveCount(0); setAnim(null);
    setHint(null); setShowMe(false); setStageInfo(null); setStartedAt(null);
    hintReq.current++;
  };
  const scramble = () => restartFrom(applyAlg(curRef.current, randomScramble(N), N));

  const turnSelected = (dir, forceWide = false) => {
    const s = selRef.current;
    const wide = N > 2 && (s.wide || forceWide);
    apply(layerToken(s.face, s.depth, wide) + (dir < 0 ? "'" : ''));
  };
  const pickFace = (i) => setSel((s) => ({ ...s, face: FACES[geo.faceOf[i]] }));

  // ---- help (one formula at a time) ----
  const askHelp = async () => {
    const from = curRef.current;
    const id = ++hintReq.current;
    setShowMe(false);
    setHint({ loading: true });
    const res = await request({ kind: 'hint', N, state: from, colorNames: COLOR_NAMES });
    if (id !== hintReq.current) return;
    if (!res.ok) { setHint({ error: (res.errors && res.errors[0]) || 'Could not work out a hint.' }); return; }
    if (res.solved) { setHint({ solved: true }); return; }
    const tokens = tokensOf(res.step.alg);
    const states = [from];
    let s = from;
    for (const t of tokens) { s = applyAlg(s, t, N); states.push(s); }
    setHint({ ...res, tokens, states });
    setStageInfo({ stages: res.stages, stage: res.step.stage });
  };

  // how far along the current formula the cube is (-1 = the cube has left the formula's path)
  const progress = useMemo(() => {
    if (!hint || !hint.states) return null;
    for (let j = hint.states.length - 1; j >= 0; j--) if (sameState(cur, hint.states[j])) return j;
    return -1;
  }, [hint, cur]);
  const hintDone = hint && hint.tokens && progress === hint.tokens.length;
  const offTrack = progress === -1;

  // "Show me": play the rest of the formula
  useEffect(() => {
    if (!showMe || !hint || !hint.tokens) return undefined;
    if (progress < 0 || progress >= hint.tokens.length) { setShowMe(false); return undefined; }
    const t = setTimeout(() => apply(hint.tokens[progress]), 520);
    return () => clearTimeout(t);
  }, [showMe, hint, progress, apply]);

  // timer
  useEffect(() => {
    if (!startedAt || solvedNow) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, solvedNow]);
  const [solvedAt, setSolvedAt] = useState(null);
  useEffect(() => { setSolvedAt(solvedNow && startedAt ? Date.now() : null); }, [solvedNow, startedAt]);

  // keyboard
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); turnSelected(k === 'ArrowRight' ? 1 : -1, e.shiftKey); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => ({ ...s, depth: Math.max(0, Math.min(maxDepth, s.depth + (k === 'ArrowDown' ? 1 : -1))) }));
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (k === 'Backspace') { e.preventDefault(); undo(); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && k.length === 1 && 'URFDLB'.includes(k.toUpperCase())) setSel((s) => ({ ...s, face: k.toUpperCase() }));
    else if (k === 'h' || k === 'H' || k === '?') { if (!hint || !hint.loading) askHelp(); }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const selToken = layerToken(sel.face, sel.depth, N > 2 && sel.wide);
  const depthNames = N === 3 ? ['Outer', 'Middle'] : ['Outer', 'Inner', 'Inner 2'];
  const elapsed = startedAt ? (solvedAt || now) - startedAt : 0;
  const centreColour = (f) => {
    const v = cur[FACES.indexOf(f) * N * N + Math.floor(N / 2) * N + Math.floor(N / 2)];
    return v >= 0 ? COLORS[v].hex : 'transparent';
  };
  const stageKeys = stageInfo ? Object.keys(stageInfo.stages).map(Number).filter((k) => k < 9).sort((a, b) => a - b) : [];

  return (
    <div className="arena">
      <div className="toolbar">
        <button className="ghost" onClick={onExit}>← Edit cube</button>
        <div className="arena-stats">
          <span><b>{moveCount}</b> moves</span>
          <span>⏱ {clock(elapsed)}</span>
        </div>
        <button className="ghost" onClick={() => onFullSolution(curRef.current)}>Full solution</button>
      </div>

      {solvedNow && moveCount > 0 && (
        <div className="card celebrate">
          <div className="confetti" aria-hidden="true">🎉</div>
          <b>Solved!</b> {moveCount} moves in {clock(elapsed)}.
          <div className="row"><button onClick={scramble}>Scramble again</button><button onClick={() => restartFrom(base)}>Try again</button></div>
        </div>
      )}

      {stageKeys.length > 0 && (
        <div className="stage-track" aria-label="Progress through the method">
          {stageKeys.map((k) => (
            <span key={k} className={`stage-dot ${k < stageInfo.stage ? 'done' : k === stageInfo.stage ? 'now' : ''}`} title={stageInfo.stages[k][0]}>
              {k < stageInfo.stage ? '✓' : k}
            </span>
          ))}
          <span className="stage-name">{stageInfo.stages[stageInfo.stage]?.[0]}</span>
        </div>
      )}

      <div className="card arena-stage">
        <div className="seg view-seg">
          <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>3D</button>
          <button className={view === 'net' ? 'on' : ''} onClick={() => setView('net')}>Flat</button>
        </div>
        {view === '3d'
          ? <Cube3D N={N} state={cur} anim={anim} next={selToken} duration={showMe ? 420 : 260} onPick={pickFace} trackpad maxHeight={420} />
          : <CubeNet N={N} state={cur} onPaint={pickFace} className="small pick" />}

        <div className="turnpad">
          <div className="facepick" role="radiogroup" aria-label="Face to turn">
            {FACES.map((f) => (
              <button key={f} role="radio" aria-checked={sel.face === f} className={sel.face === f ? 'on' : ''} onClick={() => setSel((s) => ({ ...s, face: f }))} title={FACE_LABEL[f]}>
                <i style={{ background: centreColour(f) }} />{f}
              </button>
            ))}
          </div>
          {N > 2 && (
            <div className="layerpick">
              {Array.from({ length: maxDepth + 1 }, (_, d) => (
                <button key={d} className={sel.depth === d ? 'on' : ''} onClick={() => setSel((s) => ({ ...s, depth: d }))}>{depthNames[d]}</button>
              ))}
              <button className={sel.wide ? 'on' : ''} onClick={() => setSel((s) => ({ ...s, wide: !s.wide }))} title="Turn the outer layers together">Wide</button>
            </div>
          )}
          <div className="turns">
            <button className="turn" onClick={() => turnSelected(-1)} aria-label={`Turn ${selToken} counter-clockwise`}>↺ <code>{selToken}'</code></button>
            <button className="turn" onClick={() => turnSelected(1)} aria-label={`Turn ${selToken} clockwise`}><code>{selToken}</code> ↻</button>
          </div>
          <div className="row">
            <button onClick={undo} disabled={!moveCount}>Undo</button>
            <button onClick={() => restartFrom(base)} disabled={!moveCount}>Reset</button>
            <button onClick={scramble}>Scramble</button>
          </div>
          <p className="keys muted">
            Click a sticker to pick its face · <kbd>←</kbd><kbd>→</kbd> turn · {N > 2 && <><kbd>↑</kbd><kbd>↓</kbd> layer · <kbd>Shift</kbd> wide · </>}
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>H</kbd> help
          </p>
        </div>
      </div>

      <div className="card helpcard">
        {!hint && (
          <>
            <b>Stuck?</b> <span className="muted">Help gives you just the next formula from where your cube is now, and shows where it leads. Do it yourself or let it play.</span>
            <button className="helpbtn" onClick={askHelp}>💡 Help me with the next step</button>
          </>
        )}
        {hint && hint.loading && <div className="thinking"><span className="spinner" /> Working out the next formula…</div>}
        {hint && hint.error && <><div className="issues card">⚠ {hint.error}</div><button className="helpbtn" onClick={askHelp}>Try again</button></>}
        {hint && hint.solved && <div className="okbox card">✓ The cube is already solved. Scramble it to practise!</div>}
        {hint && hint.tokens && (
          <>
            <div className="hint-head">
              <span className="pill">{hint.stages[hint.step.stage]?.[0]}</span>
              <span className="muted">≈ {hint.remainingSteps} formula{hint.remainingSteps === 1 ? '' : 's'} to go</span>
            </div>
            <h4>{hint.step.title}</h4>
            <p className="hint-text">{hint.step.text}</p>
            <div className="alg">
              {hint.tokens.map((t, k) => (
                <span key={k} className={`tok ${progress > k ? 'done' : progress === k ? 'cur' : ''}`}>{t}</span>
              ))}
            </div>
            {offTrack ? (
              <div className="status warn">Your cube has left this formula's path. Undo back to it, or ask for a fresh formula from here.</div>
            ) : hintDone ? (
              <div className="status good">✓ Formula done! Carry on yourself, or get the next one.</div>
            ) : (
              <div className="status">Next: <code>{hint.tokens[progress]}</code> — {describeMove(hint.tokens[progress], N)}</div>
            )}
            <div className="row">
              {!hintDone && !offTrack && (
                <button className="primary" onClick={() => setShowMe(!showMe)}>{showMe ? 'Pause' : '▶ Show me'}</button>
              )}
              <button className={hintDone || offTrack ? 'primary' : ''} onClick={askHelp}>{offTrack ? 'Help from here' : 'Next formula'}</button>
            </div>
            {!hintDone && (
              <div className="preview">
                <div className="muted">After this formula your cube will look like this:</div>
                <CubeNet N={N} state={hint.states[hint.states.length - 1]} labels={false} className="tiny" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
