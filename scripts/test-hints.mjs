// Play-arena "Help" test: keep asking for the next formula and applying it until solved.
// Also mixes in a few random "user" moves between hints to check the help adapts.
// node scripts/test-hints.mjs [count]
import { applyAlg, solvedState, isSolved } from '../src/engine/cube.js';
import { nextStep } from '../src/solver/index.js';
import { randomScramble, SCRAMBLE_MOVES } from '../src/patterns.js';

const COUNT = Number(process.argv[2] || 5);
let failed = 0;
for (const N of [2, 3, 4]) {
  const lens = [], counts = [];
  for (let i = 0; i < COUNT; i++) {
    let s = applyAlg(solvedState([0, 2, 5, 1, 3, 4], N), randomScramble(N), N);
    let n = 0, ok = false;
    for (; n < 400; n++) {
      if (n === 3 || n === 7) { // the user wanders off and does their own moves
        const mv = SCRAMBLE_MOVES[N];
        s = applyAlg(s, mv[n % mv.length] + ' ' + mv[(n + 1) % mv.length] + "'", N);
      }
      const r = nextStep(N, s);
      if (!r.ok) { console.log(`${N}x${N} hint failed:`, r.errors); break; }
      if (r.solved) { ok = isSolved(s, N); break; }
      lens.push(r.step.alg.split(' ').length);
      s = applyAlg(s, r.step.alg, N);
    }
    if (!ok) failed++;
    counts.push(n);
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`${N}x${N}: ${COUNT - failed} ok, hints per solve avg ${avg(counts)}, moves per hint avg ${avg(lens)} max ${Math.max(...lens)}`);
}
process.exit(failed ? 1 : 0);
