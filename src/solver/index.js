// One entry point for every cube size: full solutions, pattern transforms and
// "next step" hints for the play arena. Used by the worker and by the main-thread fallback.
import { applyAlg, solvedState, simplifyAlg, invertAlg, formatMoves, parseAlg, FACES } from '../engine/cube.js';
import { validate, allSchemes, getPieces } from '../engine/pieces.js';
import { solve4x4, pickScheme as pickScheme4, STAGES4 } from './solve4x4.js';
import { initKociemba, solve3x3 } from './kociemba.js';
import { beginnerSolve, SUBSTAGES } from './beginner.js';

export const BUILD_STAGE = 9;
const BUILD_META = ['Part 2 · Build your pattern', 'The cube is solved at this point. These steps now create your target pattern.'];
const algLen = (a) => (a.trim() ? a.trim().split(/\s+/).length : 0);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function stagesFor(N) {
  if (N === 4) return STAGES4;
  return Object.fromEntries(SUBSTAGES[N].map(([, t, d], i) => [i + 1, [`Stage ${i + 1} · ${t}`, d]]));
}

const matches = (state, scheme, N) => state.every((v, i) => v === scheme[Math.floor(i / (N * N))]);

// 2x2: the colour layout that already has the most bottom corners in place
function bestScheme2(state, opp) {
  const { corners, geo } = getPieces(2);
  const down = corners.filter((c) => c.pos[1] < 0);
  let best = null;
  for (const s of allSchemes(state, opp)) {
    const n = down.filter((c) => c.stickers.every((i) => state[i] === s[geo.faceOf[i]])).length;
    if (!best || n > best.n) best = { s, n };
  }
  return best.s;
}

// Colour layout the solver will aim for (so a target pattern can use the same one).
export function defaultScheme(state, N) {
  const v = validate(state);
  if (!v.ok) return null;
  if (N === 4) return pickScheme4(state);
  if (N === 3) return [0, 1, 2, 3, 4, 5].map((f) => state[f * 9 + 4]);
  return bestScheme2(state, v.opp);
}

function solveSmall(state, N, opts) {
  const names = opts.colorNames;
  const val = validate(state, names);
  if (!val.ok) return { ok: false, errors: val.errors };
  try {
    let scheme;
    if (N === 3) {
      scheme = [0, 1, 2, 3, 4, 5].map((f) => state[f * 9 + 4]);
      if (opts.scheme && opts.scheme.join() !== scheme.join()) {
        return { ok: false, errors: ['The two cubes have different centre colours. Hold both the same way (same colour on top and in front).'] };
      }
    } else {
      const cands = allSchemes(state, val.opp);
      if (opts.scheme && !cands.some((c) => c.join() === opts.scheme.join())) {
        return { ok: false, errors: ['This cube uses a different colour layout (or mirror image) than the other cube, so one cannot be turned into the other.'] };
      }
      scheme = opts.scheme || bestScheme2(state, val.opp);
    }
    const r = beginnerSolve(state, scheme, names, N);
    const stageOf = Object.fromEntries(SUBSTAGES[N].map(([k], i) => [k, i + 1]));
    const steps = r.steps.map((s) => ({ kind: s.sub, stage: stageOf[s.sub], title: s.title, text: s.text, alg: formatMoves(parseAlg(s.alg, N), N) }));
    const learnAlg = steps.map((s) => s.alg).join(' ');
    if (!matches(applyAlg(state, learnAlg, N), scheme, N)) throw new Error('verification of step-by-step solution failed');
    let fastAlg = simplifyAlg(learnAlg, N);
    if (N === 3) {
      const letter = {};
      scheme.forEach((c, f) => { letter[c] = FACES[f]; });
      fastAlg = simplifyAlg(solve3x3(Array.from(state, (v) => letter[v]).join('')), 3);
    }
    if (!matches(applyAlg(state, fastAlg, N), scheme, N)) fastAlg = learnAlg;
    return { ok: true, N, scheme, steps, stages: stagesFor(N), fastAlg, learnLength: algLen(learnAlg), fastLength: algLen(fastAlg) };
  } catch (e) {
    return { ok: false, errors: ['Solver error: ' + e.message] };
  }
}

export function solveCube(N, state, opts = {}) {
  if (N === 4) return solve4x4(state, opts);
  if (N === 3 || N === 2) return solveSmall(state, N, opts);
  return { ok: false, errors: [`${N}×${N} is not supported yet.`] };
}

// Moves that turn cube A into pattern B: solve A, then undo the solution of B
// (or apply B's known preset recipe when the target came from a preset).
export function transform(N, A, B, opts = {}) {
  const names = opts.colorNames;
  const va = validate(A, names), vb = validate(B, names);
  if (!va.ok) return { ok: false, errors: ['Current cube: ' + va.errors[0]] };
  if (!vb.ok) return { ok: false, errors: ['Target pattern: ' + vb.errors[0]] };
  const scheme = defaultScheme(A, N);
  const ra = solveCube(N, A, { colorNames: names, scheme });
  if (!ra.ok) return { ok: false, errors: ra.errors };
  const rb = solveCube(N, B, { colorNames: names, scheme });
  if (!rb.ok) return { ok: false, errors: rb.errors.map((e) => 'Target pattern: ' + e) };

  let part2 = null, fast2 = null;
  if (opts.recipe && same(applyAlg(solvedState(scheme, N), opts.recipe, N), B)) {
    const alg = formatMoves(parseAlg(opts.recipe, N), N);
    part2 = [{ kind: 'build', stage: BUILD_STAGE, alg, title: 'Make the pattern', text: 'The cube is solved, so this short formula turns it into your pattern.' }];
    fast2 = alg;
  }
  if (!part2) {
    part2 = rb.steps.slice().reverse().map((st) => ({
      kind: 'build', stage: BUILD_STAGE, alg: invertAlg(st.alg, N),
      title: 'Build the pattern: ' + st.title.charAt(0).toLowerCase() + st.title.slice(1),
      text: 'This is the reverse of a solving step for your target pattern. Doing it backwards makes the pattern appear.',
    }));
    fast2 = invertAlg(rb.fastAlg, N);
  }
  const steps = [...ra.steps, ...part2];
  const learnAlg = steps.map((x) => x.alg).join(' ');
  if (!same(applyAlg(A, learnAlg, N), B)) return { ok: false, errors: ['Solver error: result did not match the target pattern.'] };
  let fastAlg = simplifyAlg(ra.fastAlg + ' ' + fast2, N);
  if (!same(applyAlg(A, fastAlg, N), B)) fastAlg = simplifyAlg(learnAlg, N);
  return {
    ok: true, N, scheme, steps, stages: { ...ra.stages, [BUILD_STAGE]: BUILD_META },
    fastAlg, learnLength: algLen(learnAlg), fastLength: algLen(fastAlg), pattern: true,
  };
}

// The next formula from this exact state (the arena's Help button).
export function nextStep(N, state, opts = {}) {
  const r = solveCube(N, state, opts);
  if (!r.ok) return r;
  if (!r.steps.length) return { ok: true, solved: true, stages: r.stages };
  return { ok: true, solved: false, step: r.steps[0], stages: r.stages, remainingSteps: r.steps.length, remainingMoves: r.learnLength };
}

// Request shape: {kind: 'solve'|'hint', N, state, target?, recipe?, colorNames}
export function handleRequest(msg) {
  const { kind = 'solve', N = 4, state, target, recipe, colorNames } = msg;
  const A = Int8Array.from(state);
  if (kind === 'hint') return nextStep(N, A, { colorNames });
  if (target) return transform(N, A, Int8Array.from(target), { colorNames, recipe });
  return solveCube(N, A, { colorNames });
}

export function warmUp() { initKociemba(); }
