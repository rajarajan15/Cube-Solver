// Offline search: commutators [X,Y] that act as a pure 3-cycle on centers or on wings.
import fs from 'fs';
import { getGeometry, movePerm } from '../src/engine/cube.js';
import { getPieces } from '../src/engine/pieces.js';

const N = 4, geo = getGeometry(N), P = getPieces();
const FL = ['U', 'R', 'F', 'D', 'L', 'B'];
const sfx = (t) => (t === 1 ? '' : t === 2 ? '2' : "'");
const base = [];
for (const F of FL) for (const t of [1, 2, 3]) {
  base.push({ name: F + sfx(t), perm: movePerm(geo, F, 0, 0, t) });
  base.push({ name: '2' + F + sfx(t), perm: movePerm(geo, F, 1, 1, t) });
  base.push({ name: F + 'w' + sfx(t), perm: movePerm(geo, F, 0, 1, t) });
}
const inv = (p) => { const q = new Uint8Array(p.length); for (let i = 0; i < p.length; i++) q[p[i]] = i; return q; };
const comp = (a, b) => { const r = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) r[i] = b[a[i]]; return r; }; // a then b
const bname = base.map((b) => b.name);
const faceKey = (n) => n.replace(/[0-9'w]/g, '');
const layerKey = (n) => (n.includes('w') ? 'w' : /^2/.test(n) ? 'i' : 'o') + faceKey(n);
// sequences up to length 3, skipping immediate same-face-layer repeats
const seqs = [{ s: [], perm: Uint8Array.from({ length: 96 }, (_, i) => i), name: '' }];
let frontier = seqs.slice();
for (let len = 1; len <= 3; len++) {
  const next = [];
  for (const q of frontier) for (let b = 0; b < base.length; b++) {
    if (q.s.length && layerKey(bname[q.s[q.s.length - 1]]) === layerKey(bname[b])) continue;
    const e = { s: [...q.s, b], perm: comp(q.perm, base[b].perm), name: (q.name + ' ' + bname[b]).trim() };
    next.push(e);
  }
  for (const e of next) seqs.push(e); frontier = next;
}
seqs.forEach((q) => { q.inv = inv(q.perm); q.len = q.s.length; });
console.log('sequences', seqs.length);

const centerSt = P.centers.map((c) => c.sticker);
const wingSt = P.wings.map((w) => w.stickers);
const found = { wing: new Map(), center: new Map() };
const invAlg = (q) => q.s.slice().reverse().map((b) => { const n = bname[b]; return n.endsWith("'") ? n.slice(0, -1) : n.endsWith('2') ? n : n + "'"; });

function test(X, Y) {
  const e = (i) => Y.inv[X.inv[Y.perm[X.perm[i]]]];
  let cMoved = 0, cm = [];
  for (let k = 0; k < 24; k++) { const i = centerSt[k]; if (e(i) !== i) { cMoved++; cm.push(k); if (cMoved > 3) break; } }
  if (cMoved === 0) { // wing core candidate
    const moved = [];
    for (let w = 0; w < 24; w++) {
      const [a, b] = wingSt[w];
      const ea = e(a), eb = e(b);
      if (ea === a && eb === b) continue;
      const w2 = P.wingOfSticker[ea];
      if (w2 < 0 || P.wingOfSticker[eb] !== w2) return;
      moved.push(w);
      if (moved.length > 3) return;
    }
    if (moved.length !== 3) return;
    // corners fixed?
    let cf = true;
    for (const c of P.corners) for (const s of c.stickers) if (e(s) !== s) cf = false;
    const alg = [...X.s.map((b) => bname[b]), ...Y.s.map((b) => bname[b]), ...invAlg(X), ...invAlg(Y)].join(' ');
    const k = moved.join(',') + '>' + moved.map((w) => P.wingOfSticker[e(wingSt[w][0])]).join(',');
    const rec = { alg, len: X.len * 2 + Y.len * 2, cornersFixed: cf };
    const old = found.wing.get(k);
    if (!old || rec.len < old.len) found.wing.set(k, rec);
  } else if (cMoved === 3) {
    const moved = cm;
    for (const k of moved) { // must be a 3-cycle among centers
      const j = P.centerOfSticker[e(centerSt[k])];
      if (j < 0 || !moved.includes(j)) return;
    }
    const alg = [...X.s.map((b) => bname[b]), ...Y.s.map((b) => bname[b]), ...invAlg(X), ...invAlg(Y)].join(' ');
    const k = moved.join(',') + '>' + moved.map((c) => P.centerOfSticker[e(centerSt[c])]).join(',');
    const rec = { alg, len: X.len * 2 + Y.len * 2 };
    const old = found.center.get(k);
    if (!old || rec.len < old.len) found.center.set(k, rec);
  }
}
const short = seqs.filter((q) => q.len <= 2 && q.len >= 1), single = seqs.filter((q) => q.len === 1), all = seqs.filter((q) => q.len >= 1);
console.time('search');
for (const X of all) for (const Y of single) test(X, Y);
for (const X of short) for (const Y of short) test(X, Y);
console.timeEnd('search');
const out = {};
for (const t of ['wing', 'center']) {
  const arr = [...found[t].values()].sort((a, b) => a.len - b.len);
  console.log(t, 'distinct effects', arr.length, 'shortest', arr.slice(0, 8).map((r) => r.len + ':' + r.alg + (r.cornersFixed ? ' [cf]' : '')));
  out[t] = arr;
}
fs.writeFileSync(new URL('./cores_raw.json', import.meta.url), JSON.stringify(out));
