// 4x4 solver using the reduction method:
//   1) centers  2) pair the edges  3) fix parity if needed  4) solve it like a 3x3
// Centers and edges are solved with 3-cycle "macros" (setup + commutator + undo) from macroTable.js;
// every macro is verified on the simulated cube, so a returned solution is always checked.
import macros from './macroTable.js';
import { initKociemba, solve3x3 } from './kociemba.js';
import { beginnerSolve, SUBSTAGES } from './beginner.js';
import { getGeometry, movePerm, solvedState, applyAlg, parseAlg, simplifyAlg, isSolved, formatMoves, invertAlg } from '../engine/cube.js';
import { getPieces, validate, deriveOpposites, schemeFromCorner, wingInfo } from '../engine/pieces.js';
import { to3x3, check3x3 } from '../engine/cube3.js';

const N = 4;
const FL = ['U', 'R', 'F', 'D', 'L', 'B'];
export const OLL_PARITY_ALG = "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'";
export const PLL_PARITY_ALG = "2R2 U2 2R2 Uw2 2R2 Uw2";

export { initKociemba };

// ---- base moves & their effect on the 24 centre slots --------------------------------------
const sfx = (t) => (t === 1 ? '' : t === 2 ? '2' : "'");
let baseCache = null;
function getBase() {
  if (baseCache) return baseCache;
  const geo = getGeometry(N), P = getPieces();
  const list = [];
  for (const F of FL) for (const t of [1, 2, 3]) {
    list.push({ name: F + sfx(t), layer: 'o' + F, perm: movePerm(geo, F, 0, 0, t) });
    list.push({ name: '2' + F + sfx(t), layer: 'i' + F, perm: movePerm(geo, F, 1, 1, t) });
    list.push({ name: F + 'w' + sfx(t), layer: 'w' + F, perm: movePerm(geo, F, 0, 1, t) });
  }
  for (const b of list) b.cp = P.centers.map((c) => P.centerOfSticker[b.perm[c.sticker]]);
  baseCache = list;
  return list;
}

const keyOf = (a, b, c) => {
  if (a < b && a < c) return `${a},${b},${c}`;
  if (b < a && b < c) return `${b},${c},${a}`;
  return `${c},${a},${b}`;
};

const lenCache = new Map();
function macroLen(type, k) {
  const id = type + k;
  let v = lenCache.get(id);
  if (v === undefined) { v = simplifyAlg(macros[type][k]).split(' ').length; lenCache.set(id, v); }
  return v;
}

const colorName = (names, c) => (names ? names[c] : `colour ${c}`);

// ------------------------------------------------------------------------------------------
function centerPhase(state, scheme, names) {
  const P = getPieces();
  const base = getBase();
  const target = P.centers.map((c) => scheme[c.face]);
  const centerKeys = Object.keys(macros.center).map((k) => ({ k, t: k.split(',').map(Number) }));
  let cur = state;
  const steps = [];
  let cost = 0;
  const colorsOf = (s) => P.centers.map((c) => s[c.sticker]);
  const score = (col) => { let n = 0; for (let i = 0; i < 24; i++) if (col[i] === target[i]) n++; return n; };

  // candidate plain-move sequences (length 1..3), centre effect only
  for (let guard = 0; guard < 60; guard++) {
    const col = colorsOf(cur);
    const have = score(col);
    if (have === 24) break;
    let best = null;
    const consider = (gain, len, make) => {
      if (gain <= 0) return;
      const ratio = gain / len;
      if (!best || ratio > best.ratio + 1e-9 || (Math.abs(ratio - best.ratio) < 1e-9 && gain > best.gain)) best = { ratio, gain, len, make };
    };
    // plain moves
    const apply1 = (c, m) => { const o = new Array(24); for (let i = 0; i < 24; i++) o[base[m].cp[i]] = c[i]; return o; };
    for (let m1 = 0; m1 < base.length; m1++) {
      const c1 = apply1(col, m1);
      consider(score(c1) - have, 1, () => base[m1].name);
      for (let m2 = 0; m2 < base.length; m2++) {
        if (base[m2].layer === base[m1].layer) continue;
        const c2 = apply1(c1, m2);
        consider(score(c2) - have, 2, () => base[m1].name + ' ' + base[m2].name);
        for (let m3 = 0; m3 < base.length; m3++) {
          if (base[m3].layer === base[m2].layer) continue;
          const c3 = apply1(c2, m3);
          const g = score(c3) - have;
          if (g >= 3) consider(g, 3, () => base[m1].name + ' ' + base[m2].name + ' ' + base[m3].name);
        }
      }
    }
    // 3-cycle macros
    for (const { k, t } of centerKeys) {
      const [a, b, c] = t;
      const len = macroLen('center', k);
      for (const [s, t2, r] of [[a, b, c], [a, c, b]]) {
        // piece at s -> t2, t2 -> r, r -> s
        const gain = (col[s] === target[t2] ? 0 : 0);
        void gain;
        const before = (col[s] === target[s] ? 1 : 0) + (col[t2] === target[t2] ? 1 : 0) + (col[r] === target[r] ? 1 : 0);
        const after = (col[r] === target[s] ? 1 : 0) + (col[s] === target[t2] ? 1 : 0) + (col[t2] === target[r] ? 1 : 0);
        if (after - before > 0) {
          consider(after - before, len, () => macros.center[keyOf(s, t2, r)] + '|' + [s, t2, r].join(','));
        }
      }
    }
    if (!best) throw new Error('centre solver got stuck');
    const made = best.make();
    let alg = made, cycle = null;
    if (made.includes('|')) { const [x, y] = made.split('|'); alg = x; cycle = y.split(',').map(Number); }
    alg = simplifyAlg(alg);
    const next = applyAlg(cur, alg);
    const after = score(colorsOf(next));
    if (after < have + best.gain) throw new Error('centre prediction mismatch');
    if (cycle) {
      const col2 = colorsOf(cur);
      steps.push({
        kind: 'center', alg,
        title: 'Move centre pieces',
        text: `3-cycle of centre pieces: ${colorName(names, col2[cycle[0]])} from the ${P.centers[cycle[0]].name} goes to the ${P.centers[cycle[1]].name}, that one goes to the ${P.centers[cycle[2]].name}, and the last one comes back to the first spot.`,
        gain: best.gain,
      });
    } else {
      steps.push({ kind: 'center', alg, title: 'Slice moves', text: `Quick moves that put ${best.gain} centre piece${best.gain > 1 ? 's' : ''} in place.`, gain: best.gain });
    }
    cost += alg.split(' ').length;
    cur = next;
  }
  if (score(colorsOf(cur)) !== 24) throw new Error('centres not solved');
  return { state: cur, steps, cost };
}

// ------------------------------------------------------------------------------------------
function edgeStatus(state) {
  const P = getPieces();
  const info = P.wings.map((w) => wingInfo(state, w));
  const slotPieces = new Map();
  P.wings.forEach((w) => { if (!slotPieces.has(w.slotId)) slotPieces.set(w.slotId, []); slotPieces.get(w.slotId).push(w.id); });
  const pairPos = new Map(); // colour-pair key -> positions
  P.wings.forEach((w) => {
    const k = info[w.id].c * 6 + info[w.id].d;
    if (!pairPos.has(k)) pairPos.set(k, []);
    pairPos.get(k).push(w.id);
  });
  const unpaired = [];
  for (const [k, pos] of pairPos) {
    if (P.wings[pos[0]].partner !== pos[1]) unpaired.push({ k, pos, c: Math.floor(k / 6), d: k % 6 });
  }
  return { info, unpaired };
}

const algLen = (a) => (a.trim() ? a.trim().split(/\s+/).length : 0);

function edgePhase(state, names) {
  const P = getPieces();
  let cur = state;
  const steps = [];
  let cost = 0;
  for (let guard = 0; guard < 30; guard++) {
    const { unpaired } = edgeStatus(cur);
    if (!unpaired.length) break;
    let best = null;
    for (const u of unpaired) {
      const [pa, pb] = u.pos;
      for (const [x, y] of [[pa, pb], [pb, pa]]) {
        // move the wing at y next to the wing at x
        const q = P.wings[x].partner, yp = P.wings[y].partner;
        const key = keyOf(y, q, yp);
        const len = macroLen('wing', key);
        // piece at y -> q, q -> yp, yp -> y
        if (!best || len < best.len) best = { len, key, y, q, yp, u };
      }
    }
    best.alg = simplifyAlg(macros.wing[best.key]);
    const next = applyAlg(cur, best.alg);
    const after = edgeStatus(next).unpaired.length;
    if (after >= unpaired.length) throw new Error('edge pairing made no progress');
    steps.push({
      kind: 'edge', alg: best.alg, title: 'Pair up edge pieces',
      text: `Join the two ${colorName(names, best.u.c)}/${colorName(names, best.u.d)} edge halves: the one at the ${P.wings[best.y].name} moves next to its partner at the ${P.wings[P.wings[best.q].partner].name}.`,
    });
    cost += best.len;
    cur = next;
  }
  if (edgeStatus(cur).unpaired.length) throw new Error('edges not paired');
  return { state: cur, steps, cost };
}

// ------------------------------------------------------------------------------------------
function reduce(state, c2f) {
  const s = to3x3(state, c2f);
  return s ? { facelets: s, chk: check3x3(s) } : null;
}

function parityPhase(state, c2f) {
  const steps = [];
  let cur = state;
  let r = reduce(cur, c2f);
  if (!r || !r.chk.valid) throw new Error('reduced cube is not a valid 3x3');
  if (r.chk.twist !== 0) throw new Error('twisted corner');
  if (r.chk.flip === 1) {
    cur = applyAlg(cur, OLL_PARITY_ALG);
    steps.push({
      kind: 'parity', alg: OLL_PARITY_ALG, title: 'OLL parity fix',
      text: 'One edge pair would be flipped on a 3x3, which is impossible, so the 4x4 has "OLL parity". This formula flips one edge pair (it also shuffles a few top-layer pieces, which the next step handles).',
    });
    r = reduce(cur, c2f);
    if (!r || !r.chk.valid) throw new Error('OLL parity alg broke the reduction');
  }
  if (r.chk.cornerParity !== r.chk.edgeParity) {
    cur = applyAlg(cur, PLL_PARITY_ALG);
    steps.push({
      kind: 'parity', alg: PLL_PARITY_ALG, title: 'PLL parity fix',
      text: 'Two edge pairs would need swapping with no matching corner swap, which is impossible on a 3x3, so the 4x4 has "PLL parity". This formula swaps two edge pairs.',
    });
    r = reduce(cur, c2f);
    if (!r || !r.chk.valid) throw new Error('PLL parity alg broke the reduction');
  }
  if (r.chk.flip !== 0 || r.chk.cornerParity !== r.chk.edgeParity) throw new Error('parity still wrong');
  return { state: cur, steps, facelets: r.facelets };
}

// reduced 4x4 -> 3x3 (take rows/cols 0, 1, 3 of every face)
const PICK = [0, 1, 3];
function project3(s4) {
  const out = new Int8Array(54);
  for (let f = 0; f < 6; f++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[f * 9 + r * 3 + c] = s4[f * 16 + PICK[r] * 4 + PICK[c]];
  return out;
}

export const STAGES4 = {
  1: ['Stage 1 · Centres', 'Build a solid 2×2 block of one colour in the middle of every face.'],
  2: ['Stage 2 · Pair the edges', 'Join the two matching edge pieces so each edge looks like a single 3×3 edge.'],
  3: ['Stage 3 · Parity fix', 'Only needed on 4×4: fixes a flipped or swapped edge pair that a 3×3 could never have.'],
  4: ['Stage 4 · Finish like a 3×3', 'Centres and edges are grouped, so only outer-layer turns are needed. From here it is the layer-by-layer 3×3 method.'],
};

// ------------------------------------------------------------------------------------------
export function solve4x4(state, opts = {}) {
  const names = opts.colorNames;
  const val = validate(state, names);
  if (!val.ok) return { ok: false, errors: val.errors };
  try {
    const P = getPieces();
    const opp = deriveOpposites(state);
    // try every consistent orientation of the colour scheme, keep the cheapest centre solution
    let best = null;
    const tried = new Set();
    const cands = [];
    for (let slot = 0; slot < 8; slot++) {
      for (let rot = 0; rot < 3; rot++) {
        const scheme = schemeFromCorner(state, opp, slot, rot);
        const key = scheme.join('');
        if (tried.has(key)) continue;
        tried.add(key);
        let wrong = 0;
        for (const c of P.centers) if (state[c.sticker] !== scheme[c.face]) wrong++;
        cands.push({ scheme, wrong });
      }
    }
    cands.sort((a, b) => a.wrong - b.wrong);
    let pool = cands.slice(0, opts.schemeTries ?? 3);
    if (opts.scheme) {
      pool = cands.filter((c) => c.scheme.join('') === opts.scheme.join(''));
      if (!pool.length) return { ok: false, errors: ['This cube uses a different colour layout (or mirror image) than the other cube, so one cannot be turned into the other.'] };
    }
    for (const { scheme, wrong } of pool) {
      let res;
      try { res = centerPhase(state, scheme, names); } catch (e) { continue; }
      if (!best || res.cost < best.res.cost) best = { scheme, res, wrong };
    }
    if (!best) throw new Error('could not solve centres');
    const { scheme } = best;
    const c2f = {};
    scheme.forEach((c, f) => { c2f[c] = FL[f]; });

    const steps = [];
    const centerRes = best.res;
    let cur = centerRes.state;
    steps.push(...centerRes.steps.map((s) => ({ ...s, stage: 1 })));

    const edgeRes = edgePhase(cur, names);
    cur = edgeRes.state;
    steps.push(...edgeRes.steps.map((s) => ({ ...s, stage: 2 })));

    const par = parityPhase(cur, c2f);
    cur = par.state;
    steps.push(...par.steps.map((s) => ({ ...s, stage: 3 })));

    // Stage 4, Learn: the layer-by-layer 3x3 method on the reduced cube (outer turns only,
    // so the same move tokens work on the 4x4). Fast: a short computer (Kociemba) solution.
    const reducedSteps = steps.map((s) => s.alg).join(' ');
    const sub = Object.fromEntries(SUBSTAGES[3].map(([k, t]) => [k, t]));
    const lbl = beginnerSolve(project3(cur), scheme, names, 3);
    for (const st of lbl.steps) {
      steps.push({ kind: 'reduced', stage: 4, alg: st.alg, title: `${sub[st.sub]}: ${st.title}`, text: st.text });
      cur = applyAlg(cur, st.alg);
    }
    if (!isSolved(cur)) throw new Error('final state is not solved');
    for (let f = 0; f < 6; f++) if (cur[f * 16] !== scheme[f]) throw new Error('scheme mismatch');

    initKociemba();
    const learnAlg = steps.map((s) => s.alg).join(' ');
    const fastAlg = simplifyAlg(reducedSteps + ' ' + solve3x3(par.facelets));
    // verify both answers from scratch
    if (!isSolved(applyAlg(state, learnAlg))) throw new Error('verification of step-by-step solution failed');
    if (!isSolved(applyAlg(state, fastAlg))) throw new Error('verification of simplified solution failed');
    // make sure every step alg is canonical text
    steps.forEach((s) => { s.alg = formatMoves(parseAlg(s.alg, N), N); });
    return { ok: true, N, scheme, steps, stages: STAGES4, fastAlg, learnLength: algLen(learnAlg), fastLength: algLen(fastAlg) };
  } catch (e) {
    return { ok: false, errors: ['Solver error: ' + e.message] };
  }
}

// Best colour layout for a (valid) cube: the one that needs the fewest centre changes.
export function pickScheme(state) {
  const val = validate(state);
  if (!val.ok) return null;
  const P = getPieces();
  const opp = deriveOpposites(state);
  let best = null;
  for (let slot = 0; slot < 8; slot++) for (let rot = 0; rot < 3; rot++) {
    const scheme = schemeFromCorner(state, opp, slot, rot);
    let wrong = 0;
    for (const c of P.centers) if (state[c.sticker] !== scheme[c.face]) wrong++;
    if (!best || wrong < best.wrong) best = { scheme, wrong };
  }
  return best.scheme;
}
