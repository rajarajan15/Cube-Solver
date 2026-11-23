// Thin wrapper around cubejs (Kociemba two-phase 3x3 solver).
import Cube from 'cubejs';

let ready = false;
export function initKociemba() {
  if (!ready) { Cube.initSolver(); ready = true; }
}

// Kociemba returns long-ish solutions even for tiny scrambles (14 moves for a solved cube),
// so try a quick exhaustive search of up to 3 moves first.
const MOVES18 = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, f + '2', f + "'"]);
const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

export function solve3x3(facelets) {
  initKociemba();
  const root = Cube.fromString(facelets);
  if (root.asString() === SOLVED) return '';
  const dfs = (cube, depth, last, path) => {
    if (depth === 0) return cube.asString() === SOLVED ? path : null;
    for (const m of MOVES18) {
      if (m[0] === last) continue;
      const c = new Cube(cube);
      c.move(m);
      const r = dfs(c, depth - 1, m[0], path.concat(m));
      if (r) return r;
    }
    return null;
  };
  for (let d = 1; d <= 3; d++) {
    const r = dfs(root, d, '', []);
    if (r) return r.join(' ');
  }
  return root.solve().trim();
}
