// Validation test: real cubes must pass, broken ones must be rejected.  node scripts/test-validate.mjs
import { applyAlg, solvedState } from '../src/engine/cube.js';
import { validate, getPieces } from '../src/engine/pieces.js';
import { randomScramble } from '../src/patterns.js';

let failed = 0;
const expect = (label, state, ok) => {
  const v = validate(state);
  if (v.ok !== ok) { failed++; console.log(`FAIL ${label}: expected ${ok ? 'valid' : 'invalid'}`, v.errors); }
};
for (const N of [2, 3, 4]) {
  const base = solvedState([0, 2, 5, 1, 3, 4], N);
  for (let i = 0; i < 10; i++) expect(`${N}x${N} random scramble`, applyAlg(base, randomScramble(N), N), true);
  const P = getPieces(N);
  // twist one corner in place
  const tw = Int8Array.from(base); const [a, b, c] = P.corners[0].stickers; [tw[a], tw[b], tw[c]] = [base[b], base[c], base[a]];
  expect(`${N}x${N} twisted corner`, tw, false);
  // swap two stickers of different colours
  const sw = Int8Array.from(base); [sw[0], sw[N * N]] = [sw[N * N], sw[0]];
  expect(`${N}x${N} swapped stickers`, sw, false);
  // empty sticker
  const em = Int8Array.from(base); em[5] = -1;
  expect(`${N}x${N} empty sticker`, em, false);
  if (N === 3) {
    const fl = Int8Array.from(base); const [x, y] = P.edges[0].stickers; [fl[x], fl[y]] = [base[y], base[x]];
    expect('3x3 flipped edge', fl, false);
    // swap the side stickers of the DF and DR edges: two edges swapped, nothing else -> impossible
    const e1 = P.edges.find((e) => e.pos[1] === -2 && e.pos[2] === 2), e2 = P.edges.find((e) => e.pos[1] === -2 && e.pos[0] === 2);
    const pure = Int8Array.from(base);
    const fD1 = e1.stickers.find((i) => i >= 27 && i < 36), fS1 = e1.stickers.find((i) => i !== fD1);
    const fD2 = e2.stickers.find((i) => i >= 27 && i < 36), fS2 = e2.stickers.find((i) => i !== fD2);
    [pure[fS1], pure[fS2]] = [base[fS2], base[fS1]];
    expect('3x3 two edges swapped', pure, false);
    const cen = Int8Array.from(base); [cen[4], cen[13]] = [base[13], base[4]];
    expect('3x3 centres swapped', cen, false);
  }
}
console.log(failed ? `${failed} validation checks failed` : 'all validation checks passed');
process.exit(failed ? 1 : 0);
