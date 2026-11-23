// Piece-level view of a cube (corners, edges/wings, centres) plus validation of a
// user-entered colouring. Works for 2x2, 3x3 and 4x4; the size is read from the state length.
import { FACES, getGeometry, cross, dot } from './cube.js';
import { check3x3 } from './cube3.js';

export const FACE_NAMES = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];
const HALF_NAME = [['left', 'right'], ['bottom', 'top'], ['back', 'front']];
const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];

// N from a state array (6*N*N stickers)
export const sizeOf = (state) => Math.round(Math.sqrt(state.length / 6));

const cache = new Map();

export function getPieces(N = 4) {
  if (cache.has(N)) return cache.get(N);
  const geo = getGeometry(N);
  const M = geo.M;
  const byPos = new Map();
  for (let i = 0; i < geo.size; i++) {
    const k = geo.pos[i].join(',');
    if (!byPos.has(k)) byPos.set(k, []);
    byPos.get(k).push(i);
  }
  const corners = [], wings = [], edges = [], centers = [];
  for (const st of byPos.values()) {
    const p = geo.pos[st[0]];
    const outer = p.filter((v) => Math.abs(v) === M).length;
    if (outer === 3) {
      // clockwise order seen from outside, starting with the sticker on the U/D face
      const ord = st.slice();
      const [a, b, c] = ord.map((i) => geo.nrm[i]);
      if (dot(cross(a, b), c) > 0) { const t = ord[1]; ord[1] = ord[2]; ord[2] = t; }
      const u = ord.findIndex((i) => geo.nrm[i][1] !== 0);
      corners.push({ pos: p, stickers: [ord[u], ord[(u + 1) % 3], ord[(u + 2) % 3]] });
    } else if (outer === 2) {
      const axis = p.findIndex((v) => Math.abs(v) !== M);
      const piece = { pos: p, axis, stickers: st.slice().sort((x, y) => x - y), half: p[axis] > 0 ? 1 : 0 };
      if (N === 4) wings.push(piece); else edges.push(piece);
    } else if (outer === 1) {
      centers.push({ pos: p, sticker: st[0], face: geo.faceOf[st[0]] });
    }
  }
  // corners in Kociemba order: URF UFL ULB UBR DFR DLF DBL DRB
  const wantKey = [[1, 1, 1], [-1, 1, 1], [-1, 1, -1], [1, 1, -1], [1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1]]
    .map((s) => s.map((v) => v * M).join(','));
  corners.sort((a, b) => wantKey.indexOf(a.pos.join(',')) - wantKey.indexOf(b.pos.join(',')));
  corners.forEach((c, i) => { c.name = CORNER_NAMES[i]; c.id = i; });

  // 4x4 wings: each has a partner (the other half of the same edge)
  wings.sort((a, b) => a.stickers[0] - b.stickers[0]);
  wings.forEach((w, i) => { w.id = i; });
  const wingAt = new Map(wings.map((w) => [w.pos.join(','), w]));
  for (const w of wings) {
    const q = w.pos.slice(); q[w.axis] = -q[w.axis];
    w.partner = wingAt.get(q.join(',')).id;
    w.slot = w.pos.map((v, i) => (i === w.axis ? 0 : v)).join(',');
    w.name = edgeName(w.stickers.map((s) => FACES[geo.faceOf[s]])) + ' edge, ' + HALF_NAME[w.axis][w.half] + ' half';
  }
  const slotIds = [...new Set(wings.map((w) => w.slot))];
  wings.forEach((w) => { w.slotId = slotIds.indexOf(w.slot); });

  // 3x3 edges
  edges.sort((a, b) => a.stickers[0] - b.stickers[0]);
  edges.forEach((e, i) => { e.id = i; e.name = edgeName(e.stickers.map((s) => FACES[geo.faceOf[s]])) + ' edge'; });

  centers.sort((a, b) => a.sticker - b.sticker);
  centers.forEach((c, i) => {
    c.id = i;
    const r = geo.rowOf[c.sticker], col = geo.colOf[c.sticker];
    c.name = N === 4 ? `${FACE_NAMES[c.face]} face, ${r < N / 2 ? 'top' : 'bottom'}-${col < N / 2 ? 'left' : 'right'}` : `${FACE_NAMES[c.face]} centre`;
  });
  const wingOfSticker = new Int16Array(geo.size).fill(-1);
  wings.forEach((w) => w.stickers.forEach((s) => { wingOfSticker[s] = w.id; }));
  const centerOfSticker = new Int16Array(geo.size).fill(-1);
  centers.forEach((c) => { centerOfSticker[c.sticker] = c.id; });
  const res = { N, geo, corners, wings, edges, centers, wingOfSticker, centerOfSticker };
  cache.set(N, res);
  return res;
}

function edgeName(letters) {
  const order = 'UDFBRL';
  return letters.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('');
}

// handedness of a 4x4 wing piece: sign((n_c x n_d) . p) with c < d (colour order)
export function wingInfo(state, w) {
  const { geo } = getPieces(4);
  let [s1, s2] = w.stickers;
  let c = state[s1], d = state[s2];
  if (c > d) { [s1, s2] = [s2, s1]; [c, d] = [d, c]; }
  const sign = dot(cross(geo.nrm[s1], geo.nrm[s2]), w.pos) > 0 ? 1 : 0;
  return { c, d, sign, key: (c * 6 + d) * 2 + sign };
}

export function cornerColors(state, c) {
  return c.stickers.map((s) => state[s]);
}

// Opposite colours derived from the corners; null if the corners make no sense.
export function deriveOpposites(state) {
  const { corners } = getPieces(sizeOf(state));
  const nb = Array.from({ length: 6 }, () => new Set());
  for (const c of corners) {
    const col = cornerColors(state, c);
    if (col.some((x) => x < 0 || x > 5)) return null;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) nb[col[i]].add(col[j]);
  }
  const opp = [];
  for (let c = 0; c < 6; c++) {
    if (nb[c].size !== 4) return null;
    const o = [0, 1, 2, 3, 4, 5].filter((x) => x !== c && !nb[c].has(x));
    if (o.length !== 1) return null;
    opp[c] = o[0];
  }
  for (let c = 0; c < 6; c++) if (opp[opp[c]] !== c) return null;
  return opp;
}

// scheme[f] = colour that face f has when solved, if the cubie in corner slot `slot`
// (its clockwise colours starting at rotation `rot`) is treated as the URF corner.
export function schemeFromCorner(state, opp, slot, rot) {
  const { corners } = getPieces(sizeOf(state));
  const col = cornerColors(state, corners[slot]);
  const x = col[rot % 3], y = col[(rot + 1) % 3], z = col[(rot + 2) % 3];
  return [x, y, z, opp[x], opp[y], opp[z]]; // FACES order: U R F D L B
}

// All 24 colour layouts consistent with the corners (no duplicates).
export function allSchemes(state, opp) {
  const out = [], seen = new Set();
  for (let slot = 0; slot < 8; slot++) for (let rot = 0; rot < 3; rot++) {
    const s = schemeFromCorner(state, opp, slot, rot);
    const k = s.join('');
    if (!seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out;
}

function sameCycle(a, b) {
  for (let r = 0; r < 3; r++) if (a[0] === b[r] && a[1] === b[(r + 1) % 3] && a[2] === b[(r + 2) % 3]) return r;
  return -1;
}

// Returns {ok, errors, opp, scheme}. Error messages are written for the person entering the cube.
export function validate(state, colorNames) {
  const N = sizeOf(state);
  const errors = [];
  const name = (c) => (colorNames ? colorNames[c] : `colour ${c}`);
  const { geo, corners, wings, edges } = getPieces(N);
  const per = N * N;
  const counts = new Array(6).fill(0);
  for (const v of state) if (v >= 0 && v < 6) counts[v]++;
  if (state.some((v) => v < 0 || v > 5)) errors.push('Some stickers are not coloured yet.');
  else counts.forEach((n, c) => { if (n !== per) errors.push(`${name(c)} appears ${n} times (it must be exactly ${per}).`); });
  if (errors.length) return { ok: false, errors };

  const opp = deriveOpposites(state);
  if (!opp) {
    errors.push('The corner pieces do not form a real cube (each colour must touch exactly 4 other colours). Check the corner stickers.');
    return { ok: false, errors };
  }
  // 3x3: the centres are fixed, so they decide the colour layout
  let scheme = schemeFromCorner(state, opp, 0, 0);
  if (N === 3) {
    const cs = [0, 1, 2, 3, 4, 5].map((f) => state[f * 9 + 4]);
    const legal = allSchemes(state, opp).some((s) => s.every((v, i) => v === cs[i]));
    if (!legal) {
      errors.push('The centre stickers (the middle of each face) do not match the corners. Check that each centre has the right colour and that opposite faces are opposite colours.');
      return { ok: false, errors };
    }
    scheme = cs;
  }
  const expected = corners.map((c) => c.stickers.map((s) => scheme[geo.faceOf[s]]));
  const found = new Array(8).fill(-1);
  corners.forEach((c, slot) => {
    const col = cornerColors(state, c);
    for (let t = 0; t < 8; t++) {
      if (sameCycle(col, expected[t]) >= 0) {
        if (found[t] !== -1) errors.push(`The corner at ${c.name} duplicates the corner at ${corners[found[t]].name}.`);
        found[t] = slot;
        return;
      }
    }
    errors.push(`The corner at ${c.name} (${col.map(name).join('/')}) can't exist on a real cube (or its colours are in mirror order).`);
  });
  if (errors.length) return { ok: false, errors };

  if (N === 4) {
    // every colour pair must appear on exactly two wings with opposite handedness
    const byPair = new Map();
    for (const w of wings) {
      const info = wingInfo(state, w);
      if (info.c === info.d || opp[info.c] === info.d) {
        errors.push(`The edge piece at ${w.name} (${name(info.c)}/${name(info.d)}) can't exist.`);
        continue;
      }
      const k = info.c * 6 + info.d;
      if (!byPair.has(k)) byPair.set(k, []);
      byPair.get(k).push({ w, info });
    }
    if (!errors.length) {
      for (const [k, list] of byPair) {
        const c = Math.floor(k / 6), d = k % 6;
        if (list.length !== 2) errors.push(`There are ${list.length} ${name(c)}/${name(d)} edge halves (there must be 2).`);
        else if (list[0].info.sign === list[1].info.sign) {
          errors.push(`The two ${name(c)}/${name(d)} edge halves (${list[0].w.name} and ${list[1].w.name}) are not a possible pair — one of them is probably entered wrongly.`);
        }
      }
      if (byPair.size !== 12) errors.push('The edge pieces do not form the 12 expected colour pairs.');
    }
    if (errors.length) return { ok: false, errors };
  }

  if (N === 3) {
    const seen = new Map();
    for (const e of edges) {
      let [c, d] = e.stickers.map((s) => state[s]);
      if (c === d || opp[c] === d) { errors.push(`The ${e.name} (${name(c)}/${name(d)}) can't exist on a real cube.`); continue; }
      if (c > d) [c, d] = [d, c];
      const k = c * 6 + d;
      if (seen.has(k)) errors.push(`There are two ${name(c)}/${name(d)} edges (the ${seen.get(k)} and the ${e.name}). One of them is entered wrongly.`);
      else seen.set(k, e.name);
    }
    if (errors.length) return { ok: false, errors };
  }

  // corner twist (needs to be a multiple of 3)
  let twist = 0;
  corners.forEach((c) => {
    const col = cornerColors(state, c);
    twist += col.findIndex((x) => x === scheme[0] || x === scheme[3]);
  });
  if (twist % 3 !== 0) {
    errors.push('One corner looks twisted in place — that cannot happen on a real cube. Re-check the corner stickers.');
    return { ok: false, errors };
  }

  if (N === 3) {
    const letter = {};
    scheme.forEach((c, f) => { letter[c] = FACES[f]; });
    const chk = check3x3(Array.from(state, (v) => letter[v]).join(''));
    if (!chk.valid) errors.push('The pieces do not form a real 3×3. Re-check the stickers.');
    else if (chk.flip) errors.push('One edge looks flipped in place — that cannot happen on a real 3×3. Re-check the edge stickers.');
    else if (chk.cornerParity !== chk.edgeParity) errors.push('Two pieces look swapped — that cannot happen on a real 3×3. Usually two edges or two corners were entered the wrong way round.');
    if (errors.length) return { ok: false, errors };
  }
  return { ok: true, errors: [], opp, scheme };
}
