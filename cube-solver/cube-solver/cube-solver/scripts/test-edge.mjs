import { applyAlg, solvedState, isSolved } from '../src/engine/cube.js';
import { solve4x4, OLL_PARITY_ALG, PLL_PARITY_ALG } from '../src/solver/solve4x4.js';
const cases = {
  solved: '', oneMove: "R", sliceOnly: "2R", wideOnly: "Rw' Uw2", sune: "R U R' U R U2 R'",
  oll: OLL_PARITY_ALG, pll: PLL_PARITY_ALG, both: OLL_PARITY_ALG + ' ' + PLL_PARITY_ALG,
  twoCenters: "2R 2U 2R' 2U'", wingSwapish: "Rw U2 Rw' U2",
};
for (const [name, alg] of Object.entries(cases)) {
  for (const scheme of [[0,1,2,3,4,5],[4,2,1,5,3,0]]) {
    const s = applyAlg(solvedState(scheme), alg);
    const r = solve4x4(s);
    console.log(name.padEnd(12), r.ok ? `ok moves=${r.fastLength} steps=${r.steps.length} ${r.steps.map(x=>x.kind[0]).join('')}` : 'FAIL ' + r.errors);
  }
}
