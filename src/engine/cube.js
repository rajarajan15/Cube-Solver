// Generic NxN cube model. Stickers live in 3D; every move is a rigid rotation,
// so the same code works for any size (4x4 is the first one enabled in the UI).
//
// Face order / net layout (same as the Kociemba facelet convention):
//   U R F D L B, each face stored row-major (row 0 = top row of the net).
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const NORMAL = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};
const AXIS_OF = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
const POSITIVE = { R: true, U: true, F: true, L: false, D: false, B: false };
const AXIS_FACES = [['R', 'L'], ['U', 'D'], ['F', 'B']];

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export { cross, dot };

const geoCache = new Map();

export function getGeometry(N) {
  if (geoCache.has(N)) return geoCache.get(N);
  const M = N - 1; // coordinates are doubled so they stay integers: -M, -M+2, ... M
  const size = 6 * N * N;
  const pos = new Array(size), nrm = new Array(size), faceOf = new Int8Array(size);
  const rowOf = new Int8Array(size), colOf = new Int8Array(size);
  const lookup = new Map();
  const key = (p, n) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
  for (let f = 0; f < 6; f++) {
    const L = FACES[f];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = f * N * N + r * N + c;
        const a = 2 * c - M, b = M - 2 * r;
        let p;
        if (L === 'U') p = [a, M, 2 * r - M];
        else if (L === 'R') p = [M, b, M - 2 * c];
        else if (L === 'F') p = [a, b, M];
        else if (L === 'D') p = [a, -M, M - 2 * r];
        else if (L === 'L') p = [-M, b, 2 * c - M];
        else p = [M - 2 * c, b, -M];
        pos[i] = p; nrm[i] = NORMAL[L]; faceOf[i] = f; rowOf[i] = r; colOf[i] = c;
        lookup.set(key(p, NORMAL[L]), i);
      }
    }
  }
  const geo = { N, M, size, pos, nrm, faceOf, rowOf, colOf, lookup, key, moveCache: new Map() };
  geoCache.set(N, geo);
  return geo;
}

// clockwise (seen from outside the face with normal n) quarter turn of a vector
function rotCw(v, n) {
  const d = dot(v, n), c = cross(n, v);
  return [d * n[0] - c[0], d * n[1] - c[1], d * n[2] - c[2]];
}

// A move = {face, d0, d1, turns}: layers d0..d1 counted from `face`, `turns` clockwise quarter turns.
// Returns perm: perm[i] = where sticker i ends up.
export function movePerm(geo, face, d0, d1, turns) {
  const ck = `${face}${d0}${d1}${turns}`;
  const hit = geo.moveCache.get(ck);
  if (hit) return hit;
  const n = NORMAL[face];
  const perm = new Uint8Array(geo.size);
  for (let i = 0; i < geo.size; i++) {
    const depth = (geo.M - dot(geo.pos[i], n)) / 2;
    if (depth >= d0 && depth <= d1) {
      let v = geo.pos[i], w = geo.nrm[i];
      for (let t = 0; t < turns; t++) { v = rotCw(v, n); w = rotCw(w, n); }
      perm[i] = geo.lookup.get(geo.key(v, w));
    } else perm[i] = i;
  }
  geo.moveCache.set(ck, perm);
  return perm;
}

export function applyPerm(state, perm) {
  const out = new Int8Array(state.length);
  for (let i = 0; i < perm.length; i++) out[perm[i]] = state[i];
  return out;
}

const TOKEN = /^(\d*)([URFDLB])(w?)(2'|'2|2|')?$/;
const ROT = /^([xyz])(2'|'2|2|')?$/;
const turnsOf = (s) => (s === undefined || s === '' ? 1 : s === "'" ? 3 : 2);

export function parseAlg(str, N = 4) {
  const out = [];
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    let m = TOKEN.exec(tok);
    if (m) {
      const k = m[1] ? parseInt(m[1], 10) : null;
      let d0 = 0, d1 = 0;
      if (m[3]) { d1 = (k ?? 2) - 1; } else { d0 = d1 = (k ?? 1) - 1; }
      if (d1 > N - 1) throw new Error(`Bad move ${tok} for ${N}x${N}`);
      out.push({ face: m[2], d0, d1, turns: turnsOf(m[4]) });
      continue;
    }
    m = ROT.exec(tok);
    if (m) { out.push({ face: { x: 'R', y: 'U', z: 'F' }[m[1]], d0: 0, d1: N - 1, turns: turnsOf(m[2]) }); continue; }
    throw new Error(`Unknown move "${tok}"`);
  }
  return out;
}

export function applyAlg(state, alg, N = 4) {
  const geo = getGeometry(N);
  const moves = typeof alg === 'string' ? parseAlg(alg, N) : alg;
  let s = state;
  for (const mv of moves) s = applyPerm(s, movePerm(geo, mv.face, mv.d0, mv.d1, mv.turns));
  return s;
}

export function solvedState(scheme = [0, 1, 2, 3, 4, 5], N = 4) {
  const s = new Int8Array(6 * N * N);
  for (let f = 0; f < 6; f++) s.fill(scheme[f], f * N * N, (f + 1) * N * N);
  return s;
}

// ---- notation helpers -------------------------------------------------------
// Atom = one layer turned by `ang` quarter turns about the +axis direction.
function atomsOf(mv, N) {
  const axis = AXIS_OF[mv.face], pos = POSITIVE[mv.face];
  const ang = pos ? (4 - mv.turns) % 4 : mv.turns % 4;
  const out = [];
  for (let d = mv.d0; d <= mv.d1; d++) out.push({ axis, layer: pos ? N - 1 - d : d, ang });
  return out;
}

const suffix = (t) => (t === 1 ? '' : t === 2 ? '2' : "'");

function formatRun(axis, ang, N) {
  const [P, Q] = AXIS_FACES[axis];
  const tokens = [];
  for (const q of [1, 2, 3]) {
    let i = 0;
    while (i < N) {
      if (ang[i] !== q) { i++; continue; }
      let j = i;
      while (j + 1 < N && ang[j + 1] === q) j++;
      const len = j - i + 1, tp = (4 - q) % 4;
      if (len === N) tokens.push('xyz'[axis] + suffix(tp));
      else if (j === N - 1) tokens.push((len === 1 ? P : len === 2 ? P + 'w' : len + P + 'w') + suffix(tp));
      else if (i === 0) tokens.push((len === 1 ? Q : len === 2 ? Q + 'w' : len + Q + 'w') + suffix(q));
      else {
        for (let l = i; l <= j; l++) {
          const dp = N - 1 - l, dn = l;
          tokens.push(dp <= dn ? `${dp + 1}${P}${suffix(tp)}` : `${dn + 1}${Q}${suffix(q)}`);
        }
      }
      i = j + 1;
    }
  }
  return tokens;
}

// Merge/cancel moves. Moves on the same axis commute, so a run of them is summed per layer;
// runs that cancel to nothing are dropped so their neighbours can merge too.
export function simplifyAlg(alg, N = 4) {
  const moves = typeof alg === 'string' ? parseAlg(alg, N) : alg;
  const stack = [];
  for (const mv of moves) {
    for (const a of atomsOf(mv, N)) {
      let top = stack[stack.length - 1];
      if (!top || top.axis !== a.axis) { top = { axis: a.axis, ang: new Array(N).fill(0) }; stack.push(top); }
      top.ang[a.layer] = (top.ang[a.layer] + a.ang) % 4;
      if (top.ang.every((v) => v === 0)) stack.pop();
    }
  }
  return stack.flatMap((r) => formatRun(r.axis, r.ang, N)).join(' ');
}

// Group atoms of one move into one-token-per-move for display (no merging)
export function formatMoves(moves, N = 4) {
  return moves.map((mv) => {
    const L = mv.face;
    if (mv.d0 === 0 && mv.d1 === N - 1) return ({ R: 'x', U: 'y', F: 'z' }[L] ?? L) + suffix(mv.turns);
    if (mv.d0 === 0 && mv.d1 === 0) return L + suffix(mv.turns);
    if (mv.d0 === 0) return (mv.d1 === 1 ? '' : mv.d1 + 1) + L + 'w' + suffix(mv.turns);
    return `${mv.d0 + 1}${L}${suffix(mv.turns)}`;
  }).join(' ');
}

export function invertAlg(alg, N = 4) {
  const moves = typeof alg === 'string' ? parseAlg(alg, N) : alg;
  return formatMoves(moves.slice().reverse().map((m) => ({ ...m, turns: (4 - m.turns) % 4 })), N);
}

export function algLength(alg, N = 4) {
  return alg.trim() ? alg.trim().split(/\s+/).length : 0;
}

export function isSolved(state, N = 4) {
  for (let f = 0; f < 6; f++) {
    const c = state[f * N * N];
    for (let k = 1; k < N * N; k++) if (state[f * N * N + k] !== c) return false;
  }
  return true;
}
