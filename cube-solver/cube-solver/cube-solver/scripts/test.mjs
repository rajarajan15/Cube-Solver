// Solver stress test.  node scripts/test.mjs [count] [size]   (default: 20 scrambles each of 2x2, 3x3, 4x4)
import { applyAlg, solvedState } from '../src/engine/cube.js';
import { solveCube } from '../src/solver/index.js';
import { randomScramble } from '../src/patterns.js';

const COUNT = Number(process.argv[2] || 20);
const SIZES = process.argv[3] ? [Number(process.argv[3])] : [2, 3, 4];
const SCHEMES = [[0, 1, 2, 3, 4, 5], [3, 1, 0, 5, 2, 4], [5, 4, 3, 2, 1, 0]];
const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '-');
const sameAll = (s, N) => s.every((v, i) => v === s[Math.floor(i / (N * N)) * N * N]);
let failed = 0;

for (const N of SIZES) {
  let ok = 0;
  const learn = [], fast = [], steps = [], times = [], fails = [];
  for (let i = 0; i < COUNT; i++) {
    const alg = randomScramble(N);
    const s = applyAlg(solvedState(SCHEMES[i % 3], N), alg, N);
    const t0 = Date.now();
    const r = solveCube(N, s);
    times.push(Date.now() - t0);
    const good = r.ok
      && sameAll(applyAlg(s, r.steps.map((x) => x.alg).join(' '), N), N)
      && sameAll(applyAlg(s, r.fastAlg, N), N);
    if (good) { ok++; learn.push(r.learnLength); fast.push(r.fastLength); steps.push(r.steps.length); }
    else fails.push({ alg, errors: r.errors });
  }
  failed += fails.length;
  console.log(`${N}x${N}: solved ${ok}/${COUNT}  learn avg ${avg(learn)} (max ${Math.max(...learn)}) in ${avg(steps)} steps  fast avg ${avg(fast)}  avg ms ${avg(times)} max ms ${Math.max(...times)}`);
  if (fails.length) console.log(JSON.stringify(fails.slice(0, 3), null, 1));
}
process.exit(failed ? 1 : 0);
