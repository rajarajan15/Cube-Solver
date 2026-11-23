// Reduced-cube (3x3) helpers: turn a reduced 4x4 into a Kociemba facelet string and
// check its parities so we know which parity fixes are needed.
import { FACES } from './cube.js';

const N = 4;
const R3 = [0, 1, 1, 2];

// Kociemba corner / edge facelet tables (U=0..8, R=9.., F=18.., D=27.., L=36.., B=45..)
const f = (face, n) => FACES.indexOf(face) * 9 + (n - 1);
const cornerFacelet = [
  ['U', 9, 'R', 1, 'F', 3], ['U', 7, 'F', 1, 'L', 3], ['U', 1, 'L', 1, 'B', 3], ['U', 3, 'B', 1, 'R', 3],
  ['D', 3, 'F', 9, 'R', 7], ['D', 1, 'L', 9, 'F', 7], ['D', 7, 'B', 9, 'L', 7], ['D', 9, 'R', 9, 'B', 7],
].map((a) => [f(a[0], a[1]), f(a[2], a[3]), f(a[4], a[5])]);
const edgeFacelet = [
  ['U', 6, 'R', 2], ['U', 8, 'F', 2], ['U', 4, 'L', 2], ['U', 2, 'B', 2],
  ['D', 6, 'R', 8], ['D', 2, 'F', 8], ['D', 4, 'L', 8], ['D', 8, 'B', 8],
  ['F', 6, 'R', 4], ['F', 4, 'L', 6], ['B', 6, 'L', 4], ['B', 4, 'R', 6],
].map((a) => [f(a[0], a[1]), f(a[2], a[3])]);
const cornerColor = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const edgeColor = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

// colorToFace: array colour -> face letter (the face whose centre has that colour)
// Returns the 54-char string, or null if the reduction is not clean.
export function to3x3(state, colorToFace) {
  const out = new Array(54).fill(null);
  for (let fi = 0; fi < 6; fi++) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const letter = colorToFace[state[fi * 16 + r * N + c]];
        const idx = fi * 9 + R3[r] * 3 + R3[c];
        if (out[idx] === null) out[idx] = letter;
        else if (out[idx] !== letter) return null;
      }
    }
  }
  return out.join('');
}

function parity(perm) {
  let p = 0;
  const seen = new Array(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let j = i, len = 0;
    while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
    p ^= (len - 1) & 1;
  }
  return p;
}

// Returns {valid, twist, flip, cornerParity, edgeParity} or {valid:false}
export function check3x3(str) {
  const cp = [], co = [], ep = [], eo = [];
  for (let i = 0; i < 8; i++) {
    const fl = cornerFacelet[i].map((k) => str[k]);
    let ori = 0;
    for (; ori < 3; ori++) if (fl[ori] === 'U' || fl[ori] === 'D') break;
    if (ori === 3) return { valid: false };
    const c1 = fl[(ori + 1) % 3], c2 = fl[(ori + 2) % 3];
    let found = -1;
    for (let j = 0; j < 8; j++) if (cornerColor[j][1] === c1 && cornerColor[j][2] === c2) found = j;
    if (found < 0) return { valid: false };
    cp.push(found); co.push(ori);
  }
  for (let i = 0; i < 12; i++) {
    const a = str[edgeFacelet[i][0]], b = str[edgeFacelet[i][1]];
    let found = -1, ori = 0;
    for (let j = 0; j < 12; j++) {
      if (a === edgeColor[j][0] && b === edgeColor[j][1]) { found = j; ori = 0; }
      else if (a === edgeColor[j][1] && b === edgeColor[j][0]) { found = j; ori = 1; }
    }
    if (found < 0) return { valid: false };
    ep.push(found); eo.push(ori);
  }
  if (new Set(cp).size !== 8 || new Set(ep).size !== 12) return { valid: false };
  const twist = co.reduce((a, b) => a + b, 0) % 3;
  const flip = eo.reduce((a, b) => a + b, 0) % 2;
  return { valid: true, twist, flip, cornerParity: parity(cp), edgeParity: parity(ep) };
}
