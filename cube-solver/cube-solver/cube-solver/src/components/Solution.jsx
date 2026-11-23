import React, { useEffect, useMemo, useRef, useState } from 'react';
import CubeNet from './CubeNet.jsx';
import Cube3D from './Cube3D.jsx';
import { applyAlg, invertAlg } from '../engine/cube.js';
import { describeMove } from '../notation.js';

const tokensOf = (alg) => (alg.trim() ? alg.trim().split(/\s+/) : []);

export default function Solution({ start, result, onBack, onArena }) {
  const N = result.N || 4;
  const [mode, setMode] = useState('learn');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const topRef = useRef(null);
  const [view, setView] = useState('3d');
  const [anim, setAnim] = useState(null);
  const prevIdx = useRef(0);
  const animId = useRef(0);
  const stageKeys = Object.keys(result.stages || {}).map(Number).sort((a, b) => a - b);

  const seq = useMemo(() => {
    if (mode === 'fast') return { tokens: tokensOf(result.fastAlg), starts: [] };
    const tokens = [], starts = [];
    result.steps.forEach((s) => { starts.push(tokens.length); tokens.push(...tokensOf(s.alg)); });
    return { tokens, starts };
  }, [mode, result]);

  const states = useMemo(() => {
    const out = [start];
    let cur = start;
    for (const t of seq.tokens) { cur = applyAlg(cur, t, N); out.push(cur); }
    return out;
  }, [seq, start, N]);

  useEffect(() => { setIndex(0); setPlaying(false); }, [mode]);
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setIndex((i) => {
      if (i >= seq.tokens.length) { setPlaying(false); return i; }
      return i + 1;
    }), 700);
    return () => clearInterval(id);
  }, [playing, seq]);

  const total = seq.tokens.length;
  const safe = Math.min(index, total);
  useEffect(() => {
    const p = prevIdx.current;
    prevIdx.current = safe;
    if (view === '3d' && Math.abs(safe - p) === 1 && states[p]) {
      const token = safe > p ? seq.tokens[p] : invertAlg(seq.tokens[safe], N);
      setAnim({ id: ++animId.current, token, from: states[p] });
    } else setAnim(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe]);
  const jump = (i) => { setPlaying(false); setIndex(i); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const current = safe > 0 ? seq.tokens[safe - 1] : null;
  const next = safe < total ? seq.tokens[safe] : null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(mode === 'fast' ? result.fastAlg : result.steps.map((s) => s.alg).join(' ')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  return (
    <div className="solution">
      <div className="toolbar">
        <button className="ghost" onClick={onBack}>← Edit cube</button>
        <div className="seg">
          <button className={mode === 'learn' ? 'on' : ''} onClick={() => setMode('learn')}>Learn</button>
          <button className={mode === 'fast' ? 'on' : ''} onClick={() => setMode('fast')}>Fast</button>
        </div>
      </div>

      <div className="summary">
        {mode === 'learn'
          ? <>Step-by-step: <b>{result.learnLength}</b> moves in <b>{result.steps.length}</b> steps.</>
          : <>One merged list: <b>{result.fastLength}</b> moves{N === 2 ? ' (cancelled and combined)' : ' (a shorter computer-found route)'}.</>}
      </div>

      {result.pattern && (
        <div className="card muted-card">
          <b>Two parts.</b> Part 1 solves your cube. Part 2 then turns the solved cube into your target pattern.
        </div>
      )}

      {onArena && !result.pattern && (
        <button className="arena-cta" onClick={onArena}>
          <span className="arena-cta-icon">🎮</span>
          <span><b>Solve it yourself</b><small>Turn the cube in the play arena. Ask for help one formula at a time.</small></span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      <div ref={topRef} className="player card">
        <div className="seg view-seg">
          <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>3D</button>
          <button className={view === 'net' ? 'on' : ''} onClick={() => setView('net')}>Flat</button>
        </div>
        {view === '3d'
          ? <Cube3D N={N} state={states[safe]} anim={anim} next={next} duration={playing ? 460 : 380} />
          : <CubeNet N={N} state={states[safe]} labels={false} className="small" />}
        <div className="now">
          {safe === 0 && <span>Start position. Hold the cube as you entered it (Up on top, Front towards you).</span>}
          {current && <span>Just did <code>{current}</code>{safe === total ? (result.pattern ? ' — pattern complete! 🎉' : ' — solved! 🎉') : ''}</span>}
        </div>
        {next && <div className="next">Next: <code>{next}</code> — {describeMove(next, N)}</div>}
        <input type="range" min="0" max={total} value={safe} onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }} />
        <div className="controls">
          <button onClick={() => jump(0)} aria-label="Start">⏮</button>
          <button onClick={() => { setPlaying(false); setIndex(Math.max(0, safe - 1)); }} aria-label="Back">◀</button>
          <button className="primary" onClick={() => { if (safe >= total) setIndex(0); setPlaying(!playing); }}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={() => { setPlaying(false); setIndex(Math.min(total, safe + 1)); }} aria-label="Next">▶</button>
          <button onClick={() => jump(total)} aria-label="End">⏭</button>
        </div>
        <div className="counter">{safe} / {total}</div>
      </div>

      <details className="card legend">
        <summary>What do the letters mean?</summary>
        <ul>
          <li><b>U R F D L B</b> = Up, Right, Front, Down, Left, Back face. A letter alone turns that face's <i>outer layer</i> clockwise, as if you looked straight at it.</li>
          <li><b>'</b> (prime) = counter-clockwise. <b>2</b> = half turn.</li>
          {N >= 3 && <li><b>Rw</b> (also written r) = the right <i>two</i> layers together.{N >= 4 && <> <b>3Rw</b> = three layers.</>}</li>}
          {N === 3 && <li><b>2R</b> = only the middle layer, turned the same way as R.</li>}
          {N >= 4 && <li><b>2R</b> = only the second layer from the right face (an inner slice), turned like R. <b>2L</b>, <b>2U</b>, … work the same way.</li>}
          <li><b>x y z</b> = rotate the whole cube like R, U, F.</li>
        </ul>
      </details>

      {mode === 'learn' ? (
        <div className="steps">
          {stageKeys.map((st) => {
            const items = result.steps.map((s, i) => ({ s, i })).filter((x) => x.s.stage === st);
            if (!items.length) return null;
            return (
              <section key={st} className="stage">
                <h3>{result.stages[st][0]}</h3>
                <p className="muted">{result.stages[st][1]}</p>
                {items.map(({ s, i }) => {
                  const toks = tokensOf(s.alg);
                  const from = seq.starts[i];
                  const active = safe > from && safe <= from + toks.length;
                  return (
                    <div key={i} className={`step card ${active ? 'active' : ''}`}>
                      <div className="step-head">
                        <b>{s.title}</b>
                        <button className="mini" onClick={() => jump(from)}>Show</button>
                      </div>
                      <p>{s.text}</p>
                      <div className="alg">
                        {toks.map((t, k) => (
                          <span key={k} className={`tok ${safe === from + k + 1 ? 'cur' : ''}`} onClick={() => jump(from + k + 1)}>{t}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="alg big">
            {seq.tokens.map((t, k) => (
              <span key={k} className={`tok ${safe === k + 1 ? 'cur' : ''}`} onClick={() => jump(k + 1)}>{t}</span>
            ))}
          </div>
        </div>
      )}
      <button className="ghost wide" onClick={copy}>{copied ? 'Copied ✓' : 'Copy moves'}</button>
    </div>
  );
}
