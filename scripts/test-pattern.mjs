// "Make a pattern" test: random cube -> each preset (recipe) and -> a random painted target.
// node scripts/test-pattern.mjs
import { applyAlg, solvedState } from '../src/engine/cube.js';
import { transform, defaultScheme } from '../src/solver/index.js';
import { PRESETS, randomScramble } from '../src/patterns.js';

let failed = 0;
const same = (a, b) => a.every((v, i) => v === b[i]);
for (const N of [2, 3, 4]) {
  const base = [0, 2, 5, 1, 3, 4];
  const A = applyAlg(solvedState(base, N), randomScramble(N), N);
  const scheme = defaultScheme(A, N);
  const targets = PRESETS[N].map((p) => ({ name: p.name, B: applyAlg(solvedState(scheme, N), p.alg, N), recipe: p.alg }));
  targets.push({ name: 'random target', B: applyAlg(solvedState(base, N), randomScramble(N), N), recipe: null });
  for (const t of targets) {
    const r = transform(N, A, t.B, { recipe: t.recipe });
    const good = r.ok && same(applyAlg(A, r.fastAlg, N), t.B) && same(applyAlg(A, r.steps.map((s) => s.alg).join(' '), N), t.B);
    if (!good) failed++;
    console.log(`${N}x${N} ${t.name.padEnd(14)} ${good ? `ok learn ${r.learnLength} fast ${r.fastLength}` : 'FAIL ' + (r.errors || '')}`);
  }
}
process.exit(failed ? 1 : 0);
