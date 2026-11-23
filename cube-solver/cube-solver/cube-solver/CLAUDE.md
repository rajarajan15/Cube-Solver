# CLAUDE.md — Cube Solver (2x2, 3x3, 4x4)

Context for working on this project in Claude Code. Read this before changing anything.

## What this is
A React + Vite web app. The user paints their scrambled **4x4** on an unfolded net, the app validates it,
solves it, and shows the solution as:
- **Learn** mode: stages with formulas and plain-English explanations,
- **Fast** mode: one merged move list,
- a step-through **player** with an animated, draggable **3D cube** (three.js) and a flat net view.

A second mode, **Make a pattern**, takes the current cube and a target pattern (preset or painted) and
gives moves to reach the pattern (solve the cube, then apply the pattern recipe / reverse of the target's solution).

A **Play arena** page (`#/arena`) lets the user turn the 3D cube themselves (click sticker = pick face, arrow keys
turn / pick layer, trackpad rotates view) and ask **Help** for just the next formula from the current state.

Sizes 2x2, 3x3, 4x4 are enabled; 5x5 and 6x6 are locked "soon" cards. 2x2/3x3 (and the 4x4's last stage in Learn/Help)
use a layer-by-layer method in `solver/beginner.js`. Pages use hash routes: `#/` editor, `#/solution`, `#/arena`.
Eight UI themes (CSS variables on `[data-theme]`); sticker colours never change with the theme.

Owner/user: a junior full-stack developer (React, Node). Keep code plain JS (no TypeScript), simple, readable.

## Commands
- `npm install` — also runs `scripts/patch-cubejs.mjs` (postinstall, see "cubejs patch").
- `npm run dev` — Vite dev server. `npm run build` — production build. `npm test` — solver stress test, all sizes
  (`node scripts/test.mjs [count] [size]`). `npm run test:all` — every test script below.
- `node scripts/test-validate.mjs` — validation accepts real cubes, rejects broken ones.
- `node scripts/test-hints.mjs` — arena Help: repeated next-step hints (with stray user moves) reach solved.
- `node scripts/test-edge.mjs` — edge cases (solved, 1 move, parity-only states).
- `node scripts/test-pattern.mjs` — pattern transforms for every size and preset.
- `node scripts/ui-smoke.mjs [url] [shotDir]` — headless Chrome/Edge (puppeteer-core) drives editor → solution → arena →
  help → keyboard → themes for every size. Needs `npm run build` + `npx vite preview --port 4173` running.
- Regenerate macros (rarely needed): `node scripts/findCores.mjs` then `node scripts/buildMacros.mjs`.

## File map
```
index.html, vite.config.js (base './', worker format 'es')
src/main.jsx            entry
src/App.jsx             pages (hash routes), size N, one editor board per size {cube,target,recipe,history}, run()
src/colors.js           6 colours (index 0..5 = White, Yellow, Red, Orange, Blue, Green), DEFAULT_SCHEME, EMPTY=-1
src/patterns.js         PRESETS[N], randomScramble(N)
src/notation.js         describeMove(token, N) -> plain-English text
src/useSolver.js        request({kind:'solve'|'hint', N, state, target, recipe, colorNames}) via Web Worker; main-thread
                        fallback (also when the worker crashes mid-request)
src/components/CubeNet.jsx   flat net (editable if onPaint given)
src/components/Cube3D.jsx    three.js 3D cube, move animation, layer highlight slab, drag-rotate
src/components/Solution.jsx  Learn/Fast tabs, player (3D/Flat), step cards; stage headings come from result.stages
src/components/Arena.jsx     play arena: user turns, keyboard, undo/reset/scramble, Help (one formula) + progress tracking
src/components/SizePicker.jsx  size cards with CSS-3D mini cubes
src/components/ThemePicker.jsx useTheme() + picker; THEMES list (colours themselves live in styles.css)
src/engine/cube.js      geometry, move permutations, parse/format/simplify/invert notation
src/engine/pieces.js    getPieces(N): corners / wings (4x4) / edges (3x3) / centres; validate() for any size (N from state length)
src/engine/cube3.js     4x4 -> 3x3 facelets (Kociemba order) + parity/twist checks
src/solver/index.js     entry: solveCube(N), transform(N, A, B) for patterns, nextStep(N) for Help, handleRequest(msg)
src/solver/solve4x4.js  4x4 reduction (centres, edges, parity) + stage 4 via beginner.js; STAGES4
src/solver/beginner.js  layer-by-layer method for 3x3 / 2x2 (also the 4x4's projected 3x3); SUBSTAGES
src/solver/kociemba.js  cubejs wrapper (initKociemba, solve3x3 with a ≤3-move pre-search)
src/solver/macroTable.js GENERATED big table of 3-cycle macros (do not edit by hand)
src/solver/solver.worker.js  worker wrapper around handleRequest (also warms up cubejs)
scripts/                search/generation + tests (see Commands)
```

## Core model (src/engine/cube.js) — important conventions
- State = `Int8Array(96)` of colour indices (0..5). Faces in order **U R F D L B**, each 4x4 row-major;
  index = `face*16 + row*4 + col`. Net orientation is the standard Kociemba one: U has Back edge at the top,
  D has Front edge at the top, L/F/R/B upright. The UI instructions to the user rely on this exactly.
- Each sticker has a 3D position (doubled integer coords: -3,-1,1,3) and a normal. x=right, y=up, z=toward viewer.
- Moves are **real rigid rotations**: `{face, d0, d1, turns}` = layers d0..d1 counted from `face`, `turns` clockwise
  quarter turns seen from outside that face. `movePerm()` returns `perm[i]` = destination of sticker i;
  applying is `out[perm[i]] = state[i]`.
- Notation parsed: `R`, `R'`, `R2`, `Rw` (outer 2 layers), `3Rw`, `2R` (only 2nd layer), `x y z` (whole cube;
  they physically rotate the stickers, consistent with real cube rotations).
- `simplifyAlg` merges/cancels moves per axis (layer-wise), formats back to tokens. `invertAlg`, `formatMoves`,
  `isSolved`, `solvedState(scheme)` exist too.
- Verified against cubing.js (npm `cubing`) for effects of long algorithms — the engine matches it.

## Validation (src/engine/pieces.js)
`validate(state)` checks: 16 stickers per colour; corners form a legal set (derives opposite colours from corners,
checks chirality, no duplicates); every wing (edge half) is a legal colour pair; the two wings of each pair have
opposite handedness (invariant `sign((n_c × n_d)·pos)`); corner twist sum ≡ 0 mod 3. Returns friendly error strings.
A 4x4 has no fixed centres, so "solved" depends on a colour scheme chosen from the corners (24 possible
orientations, `schemeFromCorner`). There is **no** global parity constraint on a 4x4 beyond corner twist.

## Solver pipeline (src/solver/solve4x4.js)
Reduction method. All steps are verified by simulation; the whole result is replayed before returning.
1. **Centres** (`centerPhase`): greedy. Candidates = plain move sequences (len ≤3, scored by centre colours) and
   3-cycle macros from `macroTable.center`. Picks best gain/cost. Tries the 3 colour schemes with fewest wrong centres.
2. **Edge pairing** (`edgePhase`): repeatedly pick an unpaired twin pair and bring one wing next to the other with a
   wing 3-cycle macro (`macroTable.wing`), never breaking paired edges or centres. Twins in the same slot always look
   "paired" (either orientation); a flipped pair is the OLL-parity case.
3. **Parity** (`parityPhase`): convert to 3x3 facelets, check flip/permutation parity, then apply
   - OLL parity: `Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'` (flips parity; also shuffles some
     top-layer pieces — fine, the 3x3 stage solves them),
   - PLL parity: `2R2 U2 2R2 Uw2 2R2 Uw2`.
   (An earlier-given PLL formula `Rw2 U2 Rw2 Uw2 Rw2 U2 Rw2` was WRONG — it breaks centres. Do not use it.)
4. **3x3 stage**: Learn/Help steps = `beginnerSolve` on the reduced cube projected to 3x3 (rows/cols 0,1,3; outer
   turns only, so the tokens are valid 4x4 moves). Fast = stages 1–3 + Kociemba (`solve3x3`), simplified.
Output (all sizes): `{ok, N, scheme, steps[{kind,stage,title,text,alg}], stages{num:[title,desc]}, fastAlg, learnLength, fastLength}`.
4x4 typical: Learn ~250 moves / 34 steps, Fast ~155, ~1.5 s. `pickScheme(A)` = fewest wrong centres.

## Layer-by-layer solver (src/solver/beginner.js)
Bottom layer on D, last layer on U. 3x3: cross (IDA* per edge with single-piece distance tables), bottom corners
(search ≤3 macros of U-turns + "(Y U Y' U') ×r" per slot), middle edges (U-turns + 8 insert algs), then BFS over
U-turns + one formula per stage: top cross (F R U R' U' F'), top face (Sune / Anti-Sune), top corners (A-perm ±),
top edges (U-perm ±). 2x2: bottom corners, top face, top corners. Each step = U setup turns + one formula, verified.
2x2 scheme = orientation with most bottom corners already solved; 3x3 scheme = centres.

`transform(N, A, B, {recipe})` (solver/index.js): solve A with `defaultScheme(A)`, then the preset `recipe` or the
reverse of B's solution (stage 9 = BUILD_STAGE). `nextStep(N, state)` = first step of a fresh solve (used by Help).
`schemeOf()` in App.jsx mirrors `defaultScheme` so the solver isn't pulled into the main bundle — keep them in sync.

## Macro table (generated)
`scripts/findCores.mjs` searches commutators `[X,Y]` (≤3 moves × single, ≤2 × ≤2) over 54 base moves
(outer / inner-slice / wide, ×3 turns) that act as a **pure 3-cycle** of centres, or of wings with centres untouched.
`scripts/buildMacros.mjs` runs Dijkstra over ordered position triples to produce, for **every** 3-cycle (4048 per type),
the shortest `setup + core + setup⁻¹` (avg ~9 moves, max 12). Output: `src/solver/macroTable.js`
(`{wing: {"a,b,c": alg}, center: {...}}`; key = canonical rotation with smallest index first; cycle a→b→c→a means the
piece at a moves to b). Indices are `getPieces().wings[i].id` / `centers[i].id`.
`scripts/cores_raw.json` is the raw search output used by buildMacros.

## UI notes
- `App.jsx`: modes `solve` / `pattern`; in pattern mode a `cur`/`tgt` switch edits one of two cubes with a shared
  palette/net; target presets use the current cube's scheme (`schemeOf`). `recipe` is cleared when the target is painted.
- Solving runs in a Web Worker (`useSolver` → `solver.worker.js`); messages `{id,kind,N,state,target,recipe,colorNames}`.
- `Arena.jsx`: hint progress = the furthest precomputed formula state equal to the current cube (so R R matches R2;
  -1 = off track). Keyboard handled by one window listener through a ref.
- `Solution.jsx`: builds a token list per mode; precomputes a state per token; sets an `anim` object on ±1 steps so
  `Cube3D` animates from the previous state. Learn steps keep per-step simplified algs; Fast uses one globally
  simplified alg.
- `Cube3D.jsx` (any N): N³ black cubies + 6N² sticker planes, raycast sticker picking (`onPick`), `trackpad` wheel/pinch, + one translucent "next move" slab; layer rotation via a pivot
  group; WebGL failure falls back to a message (Flat view still works). Views: Front/Back/From below + drag.
- Styling: single `styles.css`, mobile-first. All UI colours are theme variables (`--bg --card --accent …`); add a theme
  with a `[data-theme]` block plus an entry in `ThemePicker.jsx`. Net sticker size `--s` depends on `--n`.

## Gotchas
- **cubejs patch**: cubejs wraps its code in `.call(this)`, which breaks when bundled as an ES module
  (`Cannot read properties of undefined (reading 'Cube')`). `scripts/patch-cubejs.mjs` (postinstall) rewrites it to
  `.call(globalThis)`. If cubejs is reinstalled without running postinstall, run `node scripts/patch-cubejs.mjs`.
- cubejs `solve()` is not shortest and returns a 14-move "solution" for an already-solved cube — hence the short
  pre-search in `solve3x3`.
- `three` must be installed (`npm install three`). The 3D view is the only user of it.
- Macros/parity algs are only valid for N=4 and this exact move/net convention. Changing face orientation or move
  direction in `cube.js` invalidates `macroTable.js` and the UI instructions.
- Windows path with OneDrive in the user's setup; avoid scripts that assume `/tmp` or Linux paths.

## Ideas / not done yet
- Highlight offending stickers in red when validation fails (error text names pieces like "DF edge" but nothing glows).
- 5x5/6x6 (centres need a different strategy,
  edges need more wing groups; macro generation approach should extend but `pieces.js` is 4x4-only).
- Shorter solutions (e.g. smarter centre/edge choices, trying more schemes, lowering Kociemba depth).
- Camera-based colour input, saving/sharing states.

## Working agreement with the user
Make small targeted changes and list exactly which files changed (the user applies updates by copying files and
cannot reinstall packages often). Mention any new dependency explicitly. Run `npm test` and `npm run build` after
solver or engine changes.
