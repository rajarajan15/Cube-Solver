// Layer-by-layer ("beginner") method for a 3x3 or 2x2, also used for the last stage of the 4x4.
// Every step is a short formula that a person can follow:
//   3x3: bottom cross, bottom corners, middle layer, top cross, top face, top corners, top edges
//   2x2: bottom layer, top face, top layer
// The bottom layer is built on the D face (whatever colour it has); the last layer is U.
// Each step is found by a small search over known formulas (plus top-layer turns) and is
// verified on the simulated cube.
import { getGeometry, movePerm, parseAlg, applyPerm, FACES, simplifyAlg } from '../engine/cube.js';
import { getPieces } from '../engine/pieces.js';

// ---- composed permutations for whole formulas ---------------------------------------------
const permCache = new Map();
export function algPerm(alg, N) {
  const key = N + '|' + alg;
  let p = permCache.get(key);
  if (p) return p;
  const geo = getGeometry(N);
  p = Uint8Array.from({ length: geo.size }, (_, i) => i);
  for (const mv of parseAlg(alg, N)) {
    const q = movePerm(geo, mv.face, mv.d0, mv.d1, mv.turns);
    const r = new Uint8Array(geo.size);
    for (let i = 0; i < geo.size; i++) r[i] = q[p[i]];
    p = r;
  }
  permCache.set(key, p);
  return p;
}
const count = (alg) => (alg.trim() ? alg.trim().split(/\s+/).length : 0);
const macro = (alg, label, extra = {}) => ({ alg, label: label || alg, len: count(alg), ...extra });
const U_TURNS = ['U', "U'", 'U2'].map((a) => macro(a, a, { isU: true }));

// four bottom/middle slots, as [front face, right face]
const SLOTS = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];

const CORNER_MACROS = SLOTS.flatMap(([X, Y]) => {
  const out = [];
  for (const base of [`${Y} U ${Y}' U'`, `${X}' U' ${X} U`]) {
    for (let r = 1; r <= 5; r++) out.push(macro(Array(r).fill(base).join(' '), r === 1 ? `(${base})` : `(${base}) ×${r}`));
  }
  return out;
});
const MIDDLE_MACROS = SLOTS.flatMap(([X, Y]) => [
  macro(`U ${Y} U' ${Y}' U' ${X}' U ${X}`),
  macro(`U' ${X}' U ${X} U ${Y} U' ${Y}'`),
]);
const LL_CROSS = [macro("F R U R' U' F'")];
const LL_FACE = [macro("R U R' U R U2 R'", 'Sune'), macro("R U2 R' U' R U' R'", 'Anti-Sune')];
const LL_CORNERS = [macro("R' F R' B2 R F' R' B2 R2", 'corner 3-cycle'), macro("R2 B2 R F R' B2 R F' R", 'corner 3-cycle (reverse)')];
const LL_EDGES = [macro("R2 U R U R' U' R' U' R' U R'", 'edge 3-cycle'), macro("R U' R U R U R U' R' U' R2", 'edge 3-cycle (reverse)')];

export const SUBSTAGES = {
  3: [
    ['cross', 'Bottom cross', 'Make a cross on the bottom face, each edge matching the centre beside it.'],
    ['corners', 'Bottom corners', 'Drop the four bottom corners in, so the whole bottom layer is finished.'],
    ['middle', 'Middle layer', 'Insert the four middle-layer edges without breaking the bottom.'],
    ['llcross', 'Top cross', 'Make a cross of the top colour (edges only — corners come next).'],
    ['llface', 'Top face', 'Twist the top corners until the whole top face is one colour.'],
    ['llcorners', 'Top corners', 'Move the top corners so each sits between its matching side colours.'],
    ['lledges', 'Top edges', 'Cycle the last edges into place — the cube is solved.'],
  ],
  2: [
    ['corners', 'Bottom layer', 'Put the four bottom corners in place, colours matching on every side.'],
    ['llface', 'Top face', 'Twist the top corners until the whole top face is one colour.'],
    ['llcorners', 'Top layer', 'Move the top corners into place — the cube is solved.'],
  ],
};

function makeCtx(N, scheme, names) {
  const geo = getGeometry(N), P = getPieces(N), M = geo.M;
  const ctx = { N, geo, P, M, scheme, names };
  ctx.cn = (c) => (names ? names[c] : `colour ${c}`);
  ctx.ok = (s, stickers) => stickers.every((i) => s[i] === scheme[geo.faceOf[i]]);
  ctx.run = (s, alg) => applyPerm(s, algPerm(alg, N));
  ctx.dCorners = P.corners.filter((c) => c.pos[1] === -M);
  ctx.uCorners = P.corners.filter((c) => c.pos[1] === M);
  ctx.dEdges = P.edges.filter((e) => e.pos[1] === -M);
  ctx.mEdges = P.edges.filter((e) => e.pos[1] === 0);
  ctx.uEdges = P.edges.filter((e) => e.pos[1] === M);
  ctx.nSolved = (s, list) => list.reduce((n, p) => n + (ctx.ok(s, p.stickers) ? 1 : 0), 0);
  ctx.crossOK = (s) => ctx.nSolved(s, ctx.dEdges) === ctx.dEdges.length;
  ctx.bottomOK = (s) => ctx.crossOK(s) && ctx.nSolved(s, ctx.dCorners) === 4;
  ctx.solved = (s) => { for (let i = 0; i < s.length; i++) if (s[i] !== scheme[geo.faceOf[i]]) return false; return true; };
  ctx.pieceColours = (p) => p.stickers.map((i) => ctx.cn(scheme[geo.faceOf[i]])).join('/');
  return ctx;
}

// ---- searches ------------------------------------------------------------------------------
// Shortest sequence of up to `depth` macros that raises score() while keeping ok() true.
function greedy(ctx, state, macros, score, ok, depth) {
  const base = score(state);
  let best = null;
  const seq = [];
  const rec = (s, d, len) => {
    if (seq.length) {
      const g = score(s) - base;
      if (g > 0 && ok(s) && (!best || len < best.len || (len === best.len && g > best.gain))) best = { seq: seq.slice(), len, gain: g, state: s };
    }
    if (d === 0 || (best && len >= best.len)) return;
    const last = seq[seq.length - 1];
    for (const m of macros) {
      if (last && ((last.isU && m.isU) || last === m)) continue;
      seq.push(m);
      rec(ctx.run(s, m.alg), d - 1, len + m.len);
      seq.pop();
    }
  };
  rec(state, depth, 0);
  return best;
}

// Breadth-first search over macros until goal() holds.
function bfs(ctx, state, macros, goal, maxDepth) {
  if (goal(state)) return [];
  const key = (s) => String.fromCharCode(...s);
  const seen = new Set([key(state)]);
  let frontier = [{ s: state, seq: [] }];
  for (let d = 1; d <= maxDepth; d++) {
    const next = [];
    for (const node of frontier) {
      const last = node.seq[node.seq.length - 1];
      for (const m of macros) {
        if (last && last.isU && m.isU) continue;
        const s2 = ctx.run(node.s, m.alg);
        const k = key(s2);
        if (seen.has(k)) continue;
        seen.add(k);
        const seq = [...node.seq, m];
        if (goal(s2)) return seq;
        next.push({ s: s2, seq });
      }
    }
    frontier = next;
  }
  return null;
}

// split a macro sequence into steps: each step = top-layer setup turns + one formula
function chunk(seq) {
  const out = [];
  let pre = [];
  for (const m of seq) {
    if (m.isU) pre.push(m);
    else { out.push([...pre, m]); pre = []; }
  }
  if (pre.length) { if (out.length) out[out.length - 1].push(...pre); else out.push(pre); }
  return out;
}
const algOf = (ctx, parts) => {
  const a = parts.map((m) => m.alg).join(' ');
  return ctx.N === 2 ? a : simplifyAlg(a, ctx.N);
};
const describe = (parts) => parts.map((m) => (m.isU ? `turn the top (${m.alg})` : m.label)).join(', then ');

// ---- stages --------------------------------------------------------------------------------
const OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

function crossStage(ctx, state) {
  const { geo, scheme, N } = ctx;
  const D = scheme[3];
  const moves = FACES.flatMap((f) => [f, f + '2', f + "'"]).map((name) => ({ name, face: name[0], perm: algPerm(name, N) }));
  const targets = ctx.dEdges.map((e) => {
    const hD = e.stickers.find((i) => geo.faceOf[i] === 3);
    const hS = e.stickers.find((i) => i !== hD);
    // distance table: where the D-coloured sticker of this edge is -> moves to bring it home
    const dist = new Int8Array(geo.size).fill(-1);
    dist[hD] = 0;
    const q = [hD];
    while (q.length) {
      const p = q.shift();
      for (const m of moves) { const n = m.perm[p]; if (dist[n] < 0) { dist[n] = dist[p] + 1; q.push(n); } }
    }
    return { e, hD, X: scheme[geo.faceOf[hS]], dist };
  });
  const locate = (s, t) => {
    for (const e of ctx.P.edges) {
      const [a, b] = e.stickers;
      if (s[a] === D && s[b] === t.X) return a;
      if (s[b] === D && s[a] === t.X) return b;
    }
    throw new Error('cross edge not found');
  };
  const search = (locs, tables, maxDepth) => {
    const path = [];
    const h = (ls) => { let m = 0; for (let k = 0; k < ls.length; k++) { const d = tables[k][ls[k]]; if (d > m) m = d; } return m; };
    const dfs = (ls, g, last) => {
      const hh = h(ls);
      if (hh === 0) return true;
      if (hh > g) return false;
      for (const m of moves) {
        if (m.face === last || (OPP[m.face] === last && 'URF'.includes(m.face))) continue;
        path.push(m.name);
        if (dfs(ls.map((l) => m.perm[l]), g - 1, m.face)) return true;
        path.pop();
      }
      return false;
    };
    for (let d = 0; d <= maxDepth; d++) if (dfs(locs, d, '')) return path.join(' ');
    return null;
  };
  let cur = state;
  const steps = [];
  for (let guard = 0; guard < 6; guard++) {
    const placed = targets.filter((t) => ctx.ok(cur, t.e.stickers));
    if (placed.length === 4) break;
    let best = null;
    for (const t of targets) {
      if (placed.includes(t)) continue;
      const alg = search([...placed.map((p) => p.hD), locate(cur, t)], [...placed.map((p) => p.dist), t.dist], 9);
      if (alg !== null && (!best || count(alg) < count(best.alg))) best = { alg, t };
    }
    if (!best) throw new Error('cross search failed');
    cur = ctx.run(cur, best.alg);
    steps.push({
      title: `${ctx.cn(D)}/${ctx.cn(best.t.X)} edge`,
      text: `Bring the ${ctx.cn(D)}/${ctx.cn(best.t.X)} edge down next to the ${ctx.cn(best.t.X)} centre, with ${ctx.cn(D)} facing down. Edges already in the cross stay where they are.`,
      alg: best.alg,
    });
  }
  if (!ctx.crossOK(cur)) throw new Error('cross not solved');
  return { state: cur, steps };
}

function cornerStage(ctx, state) {
  const ok = ctx.N === 3 ? ctx.crossOK : () => true;
  const score = (s) => ctx.nSolved(s, ctx.dCorners);
  let cur = state;
  const steps = [];
  for (let guard = 0; guard < 8 && score(cur) < 4; guard++) {
    const before = ctx.dCorners.filter((c) => ctx.ok(cur, c.stickers));
    const r = greedy(ctx, cur, [...U_TURNS, ...CORNER_MACROS], score, ok, 3);
    if (!r) throw new Error('corner stage got stuck');
    const fresh = ctx.dCorners.filter((c) => !before.includes(c) && ctx.ok(r.state, c.stickers));
    const what = fresh.map((c) => ctx.pieceColours(c)).join(' and ');
    steps.push({
      title: `${what} corner`,
      text: `Put the ${what} corner into the bottom layer: ${describe(r.seq)}. The 4-move trigger is repeated until the corner drops in with its colours matching the sides.`,
      alg: algOf(ctx, r.seq),
    });
    cur = r.state;
  }
  if (score(cur) !== 4) throw new Error('bottom corners not solved');
  return { state: cur, steps };
}

function middleStage(ctx, state) {
  const score = (s) => ctx.nSolved(s, ctx.mEdges);
  let cur = state;
  const steps = [];
  for (let guard = 0; guard < 8 && score(cur) < 4; guard++) {
    const before = ctx.mEdges.filter((e) => ctx.ok(cur, e.stickers));
    const r = greedy(ctx, cur, [...U_TURNS, ...MIDDLE_MACROS], score, ctx.bottomOK, 3);
    if (!r) throw new Error('middle layer got stuck');
    const fresh = ctx.mEdges.filter((e) => !before.includes(e) && ctx.ok(r.state, e.stickers));
    const what = fresh.map((e) => ctx.pieceColours(e)).join(' and ');
    steps.push({
      title: `${what} edge`,
      text: `Insert the ${what} edge into the middle layer between its two centres. Line it up by turning the top first; the formula takes it down without breaking the bottom.${r.seq.filter((m) => !m.isU).length > 1 ? ' (The first formula pops a wrong piece out so the edge can go in.)' : ''}`,
      alg: algOf(ctx, r.seq),
    });
    cur = r.state;
  }
  if (score(cur) !== 4) throw new Error('middle layer not solved');
  return { state: cur, steps };
}

function lastLayerStage(ctx, state, macros, goal, maxDepth, textFor) {
  const seq = bfs(ctx, state, [...U_TURNS, ...macros], goal, maxDepth);
  if (!seq) throw new Error('last layer search failed');
  let cur = state;
  const steps = [];
  for (const parts of chunk(seq)) {
    const alg = algOf(ctx, parts);
    steps.push({ ...textFor(cur, parts), alg });
    cur = ctx.run(cur, parts.map((m) => m.alg).join(' '));
  }
  return { state: cur, steps };
}

// ---- main ----------------------------------------------------------------------------------
// state: Int8Array for N=2 or N=3, solved according to `scheme` (colour per face U R F D L B).
// Returns { state, steps: [{sub, title, text, alg}] }.
export function beginnerSolve(state, scheme, names, N) {
  const ctx = makeCtx(N, scheme, names);
  const U = ctx.cn(scheme[0]);
  const topUp = (s) => { for (let k = 0; k < N * N; k++) if (s[k] !== scheme[0]) return false; return true; };
  const edgesUp = (s) => ctx.uEdges.every((e) => s[e.stickers.find((i) => ctx.geo.faceOf[i] === 0)] === scheme[0]);
  const cornersPlaced = (s) => ['', 'U', 'U2', "U'"].some((a) => ctx.nSolved(a ? ctx.run(s, a) : s, ctx.uCorners) === 4);

  let cur = state;
  const steps = [];
  const add = (sub, r) => { cur = r.state; steps.push(...r.steps.map((s) => ({ ...s, sub }))); };

  if (N === 3) add('cross', crossStage(ctx, cur));
  add('corners', cornerStage(ctx, cur));
  if (N === 3) {
    add('middle', middleStage(ctx, cur));
    add('llcross', lastLayerStage(ctx, cur, LL_CROSS, edgesUp, 7, (s, parts) => {
      const up = ctx.uEdges.filter((e) => s[e.stickers.find((i) => ctx.geo.faceOf[i] === 0)] === scheme[0]);
      const shape = up.length === 0 ? 'a dot (no top edges)' : up.length === 4 ? 'a cross' : (up[0].pos[0] === -up[1].pos[0] && up[0].pos[2] === -up[1].pos[2]) ? 'a line' : 'an L shape';
      return {
        title: 'Top cross',
        text: parts.some((m) => !m.isU)
          ? `The top shows ${shape} of ${U}. ${parts[0].isU ? 'Turn the top to hold it as shown, then do' : 'Do'} F R U R' U' F' to move towards the ${U} cross.`
          : 'Turn the top layer.',
      };
    }));
  }
  add('llface', lastLayerStage(ctx, cur, LL_FACE, topUp, 8, (s, parts) => {
    const named = parts.filter((m) => !m.isU).map((m) => `${m.label} (${m.alg})`).join(', ');
    return {
      title: 'Twist the top corners',
      text: named
        ? `${parts[0].isU ? 'Turn the top so the corners line up as shown, then do' : 'Do'} ${named}. It twists the top corners; repeat until the whole top is ${U}.`
        : 'Turn the top layer.',
    };
  }));
  if (N === 3) {
    add('llcorners', lastLayerStage(ctx, cur, LL_CORNERS, cornersPlaced, 6, (s, parts) => ({
      title: 'Place the top corners',
      text: parts.some((m) => !m.isU)
        ? 'Cycle three top corners with the corner 3-cycle (A-perm). Turn the top first if needed so the corner that is already right stays put.'
        : 'Turn the top layer so the corners line up with the sides.',
    })));
    add('lledges', lastLayerStage(ctx, cur, LL_EDGES, ctx.solved, 7, (s, parts) => ({
      title: 'Place the top edges',
      text: parts.some((m) => !m.isU)
        ? 'Cycle three top edges with the edge 3-cycle (U-perm) until every edge matches the centre beside it.'
        : 'Turn the top layer to line everything up.',
    })));
  } else {
    add('llcorners', lastLayerStage(ctx, cur, LL_CORNERS, ctx.solved, 7, (s, parts) => ({
      title: 'Place the top corners',
      text: parts.some((m) => !m.isU)
        ? 'Cycle three top corners with the corner 3-cycle (A-perm), turning the top first where shown, until every side is one colour.'
        : 'Turn the top layer to line everything up.',
    })));
  }
  if (!ctx.solved(cur)) throw new Error('beginner method did not finish');
  return { state: cur, steps };
}
