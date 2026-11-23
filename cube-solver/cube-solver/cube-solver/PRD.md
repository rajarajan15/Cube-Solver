# PRD — Cube Solver (4×4 first)

| | |
|---|---|
| Status | v1.0 built (4×4 only); this document captures the current product and frames the next changes |
| Last updated | 2026-11-14 |
| Tech | React 19 + Vite 8, plain JavaScript, three.js, cubejs, Web Worker |
| Companion docs | `CLAUDE.md` (engineering context, conventions, gotchas), `README.md` (quick start) |

---

## 1. Summary

Cube Solver is a mobile-first web app for people who own a physical **4×4 Rubik's-style cube**. The user copies
their scrambled cube onto an on-screen unfolded net, the app checks that the colouring is physically possible,
solves it, and teaches the solution:

- **Learn** mode: the solution split into stages (centres → edges → parity → 3×3 finish), each step with its
  formula and a plain-English explanation.
- **Fast** mode: a single merged, cancelled move list.
- A step-through **player** with an animated, draggable **3D cube** and a flat net view.

A second feature, **Make a pattern**, takes the user's current cube plus a target pattern (preset or painted)
and produces the moves that turn one into the other.

Everything runs in the browser. No backend, no accounts, no network calls after load.

## 2. Problem & goals

**Problem.** 4×4 cubes are much harder than 3×3: there are no fixed centres, edges come in two halves, and
"parity" cases appear that cannot exist on a 3×3. Most online solvers are 3×3-only, expect awkward input, or
give a wall of moves with no explanation.

**Goals**
1. A user can enter any real 4×4 state on a phone in a few minutes and get a correct solution every time.
2. Invalid input is caught *before* solving, with an error a non-expert can act on.
3. The solution is followable on a physical cube: one move at a time, animated, with plain-English descriptions.
4. The solution teaches the reduction method, not just a move list.

**Non-goals (for now)**
- Move-optimal solutions (no practical optimal 4×4 solver exists; ~150–180 moves is acceptable).
- Sizes other than 4×4 (shown as "soon" placeholders).
- Accounts, server storage, sharing, camera input.

## 3. Users

| Persona | Need |
|---|---|
| **Stuck owner** — has a scrambled 4×4, can't solve it | Get it back to solved, step by step, on a phone held next to the cube |
| **Learner** — knows 3×3, learning 4×4 | Understand the stages and see why parity happens |
| **Pattern maker** — wants checkerboard / cube-in-cube etc. | Moves from *their* current cube to the pattern, without solving first by hand |

Primary device: phone, portrait (UI tested at 390×844). Desktop works with the same single-column layout (max 560 px).

## 4. Current product — functional requirements (as built)

Status key: ✅ done · ⚠ done with known limitations (see §8)

### 4.1 Cube entry (editor)
| ID | Requirement | Status |
|---|---|---|
| E1 | Unfolded net in Kociemba orientation (U top; L F R B row; D bottom), 96 tappable stickers | ✅ |
| E2 | Palette of 6 colours (White, Yellow, Red, Orange, Blue, Green) + eraser; live count badge per colour (green at 16, red over 16) | ✅ |
| E3 | Tap a sticker to paint it with the selected colour | ✅ (tap only, no drag-paint) |
| E4 | Undo (last 50 edits), Solved, Clear, Random (60 random moves incl. wide/slice) | ✅ |
| E5 | Presets: Checkerboard, Cube in cube, Six spots, Crosses | ✅ |
| E6 | Orientation instructions shown above the net (how to hold the cube and read each face) | ✅ |
| E7 | Size chips 2×2–6×6; only 4×4 enabled, others "soon" | ✅ |
| E8 | No persistence — a page refresh loses the entered cube | ⚠ |

### 4.2 Validation
Runs live on every edit (`validate()` in `src/engine/pieces.js`); the Solve button re-checks before solving.

| ID | Check | Message style |
|---|---|---|
| V1 | Every sticker coloured; each colour exactly 16 | "Red appears 15 times (it must be exactly 16)." |
| V2 | Corners form a real cube (each colour touches exactly 4 others; opposites consistent) | "The corner pieces do not form a real cube…" |
| V3 | Each corner exists, no duplicates, not mirrored | "The corner at UFL (…) can't exist…" |
| V4 | Each edge half is a legal colour pair; 12 pairs × 2 halves; the two halves have opposite handedness | "The two Red/Blue edge halves (…) are not a possible pair…" |
| V5 | Corner twist sum ≡ 0 mod 3 | "One corner looks twisted in place…" |
| V6 | Show up to 6 errors; green "valid and solvable" box when OK | ⚠ errors are text only — offending stickers are not highlighted |

There is no global permutation-parity constraint on a 4×4 beyond corner twist, so any state passing V1–V5 is solvable.

### 4.3 Solving
| ID | Requirement | Status |
|---|---|---|
| S1 | Solve any valid 4×4 state; result is replayed in simulation and only returned if it ends solved | ✅ |
| S2 | Runs in a Web Worker so the UI stays responsive; falls back to the main thread if Workers fail | ✅ |
| S3 | Colour scheme chosen automatically from the corners (cube has no fixed centres); tries the 3 schemes with fewest wrong centres and keeps the cheapest | ✅ |
| S4 | Stages: 1 Centres · 2 Edge pairing · 3 Parity (OLL and/or PLL, only if needed) · 4 3×3 finish | ✅ |
| S5 | Output: `{ok, scheme, steps[], fastAlg, learnLength, fastLength}` or `{ok:false, errors[]}` | ✅ |
| S6 | Typical length ~160 moves, solved in ~1–2 s | ⚠ see §6 measured baseline |

### 4.4 Solution view
| ID | Requirement | Status |
|---|---|---|
| P1 | Learn tab: steps grouped by stage, each with title, explanation, clickable move tokens, "Show" button | ✅ |
| P2 | Fast tab: one simplified move list | ✅ |
| P3 | Player: start / back / play-pause / next / end, scrubber, "n / total" counter, autoplay at 700 ms per move | ✅ (speed fixed) |
| P4 | 3D view: animated layer turns, translucent highlight of the next move's layer, drag to rotate, Front / Back / From-below presets | ✅ |
| P5 | Flat view (net) of the current state; automatic fallback message when WebGL is unavailable | ✅ |
| P6 | "Next move" line with plain-English description of the move | ✅ |
| P7 | Notation legend (U R F D L B, ', 2, Rw, 3Rw, 2R, x y z) | ✅ |
| P8 | Copy moves to clipboard (Learn = all step algs, Fast = merged alg) | ✅ |
| P9 | "← Edit cube" returns to the editor with the cube still entered | ✅ |

### 4.5 Make a pattern
| ID | Requirement | Status |
|---|---|---|
| M1 | Mode switch "Solve a cube" / "Make a pattern" | ✅ |
| M2 | Two cubes (Current / Target) sharing palette and net; each shows ✓/⚠ validity | ✅ |
| M3 | Target presets are built in the *current cube's* colour scheme so they are reachable | ✅ |
| M4 | "Copy current cube → target" | ✅ |
| M5 | Output = solve current cube (stages 1–4) + build pattern (stage 5). If target came from a preset and wasn't repainted, stage 5 is the short preset recipe; otherwise it is the inverse of the target's solution | ✅ |
| M6 | Clear error if current and target use different colour layouts / mirror images | ✅ |
| M7 | Result verified: applying the merged moves to Current must equal Target exactly | ✅ |

## 5. Architecture

```
index.html → src/main.jsx → App.jsx  (editor state, mode, history, run())
                              ├─ components/CubeNet.jsx     flat net (editable / read-only)
                              ├─ components/Solution.jsx    Learn/Fast, player, step cards
                              │     └─ components/Cube3D.jsx  three.js cube + animation
                              └─ useSolver.js → solver/solver.worker.js → solver/solve4x4.js
                                                                            ├─ solver/macroTable.js (generated)
                                                                            ├─ engine/cube.js   (moves, notation)
                                                                            ├─ engine/pieces.js (pieces, validate)
                                                                            ├─ engine/cube3.js  (3×3 facelets, parity)
                                                                            └─ cubejs           (Kociemba 3×3)
```

- **State model:** `Int8Array(96)`, faces U R F D L B, row-major 4×4, values 0–5 (−1 = empty). Moves are real
  rigid rotations derived from 3D sticker positions, so the engine is size-generic; the solver, `pieces.js` and the
  macro table are 4×4-specific. Full conventions are in `CLAUDE.md` — changing face orientation or move direction
  invalidates `macroTable.js` and the on-screen instructions.
- **Solver method:** reduction. Centres by greedy search over ≤3-move sequences plus 3-cycle macros; edges by wing
  3-cycle macros; parity by fixed OLL/PLL algorithms; finish with ≤3-move exhaustive search, else cubejs Kociemba.
- **Macro table:** generated offline (`scripts/findCores.mjs` → `scripts/cores_raw.json` → `scripts/buildMacros.mjs`
  → `src/solver/macroTable.js`, ~320 KB). Covers all 4,048 centre and 4,048 wing 3-cycles; avg ~9, max 12 moves.
- **Worker protocol:** request `{id, state, target, recipe, colorNames}` → response `{id, res, ms}`; worker posts
  `{ready:true}` on start and warms up Kociemba tables.
- **Dependencies:** `react`, `react-dom`, `three`, `cubejs` (patched at postinstall by `scripts/patch-cubejs.mjs`),
  `vite`, `@vitejs/plugin-react`; dev: `puppeteer-core` (UI smoke test).

## 6. Non-functional requirements & measured baseline

Measured 2026-11-14 on the owner's Windows machine (Node, `npm test` with 30 scrambles, `npm run build`):

| Area | Requirement | Baseline |
|---|---|---|
| Correctness | 100% of valid states solved and verified | 30/30 random; all 10 edge cases × 2 schemes pass |
| Solution length | ≤ ~180 moves (Fast) | avg 158, max 180 (Learn avg 164) |
| Solve time | UI never freezes; typical solve ≤ 2 s | avg 1.9 s, max 6.2 s per solve (Node, includes first-call Kociemba init) |
| Parity frequency | — | OLL parity 18/30, PLL parity 17/30 (expected ~50% each) |
| Bundle | Loads on mobile | main JS 775 KB (210 KB gzip, mostly three.js); solver chunk 349 KB (79 KB gzip); worker 359 KB |
| Layout | Usable at 360–430 px wide, portrait | Mobile-first CSS, sticker size from viewport (`--s`) |
| Offline | Works with no network after load | Yes (no network calls) |
| Code style | Plain JS, no TypeScript, simple and readable | Yes |

## 7. Testing

| Command | What it covers |
|---|---|
| `npm test` (`scripts/test.mjs [count]`) | Random 50-move scrambles over 3 schemes; reports solved count, lengths, parity counts, timings |
| `node scripts/test-edge.mjs` | Solved, 1 move, slice-only, wide-only, Sune, OLL-only, PLL-only, both parities, 2-centre swap, wing swap |
| `node scripts/ui-smoke.mjs [url]` | Headless Chrome: Random → Solve → player → Fast. **Hardcodes `/usr/bin/google-chrome` and `/tmp`** — needs path edits on Windows |
| `npm run build` | Production build must succeed |

Gap: there is no automated test for `transform4x4` / Make-a-pattern (`CLAUDE.md` mentions `scripts/test-pattern.mjs`,
but that file is not in the project), and no test for `validate()` rejecting bad input.

## 8. Known issues & gaps found during review

Ordered roughly by user impact.

1. **No error highlighting.** Validation names a piece ("the corner at UFL") but nothing on the net glows; users
   must find it themselves. (`App.jsx`, `pieces.js`)
2. **Short scrambles give long solutions.** A 4-move centre swap (`2R 2U 2R' 2U'`) solves in 75 moves; a 4-move wing
   swap in 89; a 7-move Sune in 14. The greedy centre/edge phases and Kociemba don't exploit near-solved states.
3. **Worker failure can hang the UI.** If the worker errors after a request is sent, `useSolver` clears the worker
   ref but never resolves the pending promise, so the button stays on "Working…" forever. (`src/useSolver.js`)
4. **No persistence.** Refreshing the page or an accidental back-swipe loses a carefully entered cube.
5. **Tap-only painting.** 96 individual taps; no drag-to-paint or "fill face" shortcut.
6. **Fixed playback speed** (700 ms/move); no speed control. Player Back button and counter use the raw `index`
   rather than the clamped value (harmless today, fragile).
7. **Fast mode has no stage markers**, so users can't tell where centres end and edges begin.
8. **Stage 4 is a computer 3×3 solution** — doesn't teach a human 3×3 method.
9. **Solve time up to ~6 s** on slower states; no progress indication beyond "Working…".
10. **Docs drift.** `CLAUDE.md` lists `scripts/test-pattern.mjs` and multiple `scripts/ui-*.mjs`; only `ui-smoke.mjs` exists.
    _(Fixed in release 2: `test-pattern.mjs` added; `ui-smoke.mjs` now finds Chrome/Edge on Windows. Item 3 is also fixed.)_
11. **Dead code** to tidy: `SOLVED_CORNER_FACES`, `wantC` (pieces.js); unused `gain` (solve4x4.js); `void parseAlg; void formatMoves`
    (Solution.jsx); `invAlg`, `sstate` (buildMacros.mjs).
12. **Repository setup.** The project has no git repository of its own — the enclosing repo root is the user's home
    folder (`C:/Users/Pranavarul`), so `git status` lists the whole profile. Recommend `git init` inside `cube-solver/`.
13. `vite` and `@vitejs/plugin-react` sit in `dependencies` rather than `devDependencies` (no runtime effect).

## 9. Roadmap / candidate changes

From `CLAUDE.md` "Ideas" plus the review above. Priority is a proposal for discussion.

| Pri | Item | Notes |
|---|---|---|
| P1 | Highlight offending stickers in red on validation failure | Have `validate()` return sticker indices alongside messages; `CubeNet` gets an `errorStickers` prop |
| P1 | Fix worker-failure hang | Reject/resolve all pending requests in `onerror`, fall back to main thread |
| P1 | Persist the editor state (localStorage) | Current + target cubes, mode, recipe |
| P2 | Drag-to-paint and "fill face" | Pointer events on the net |
| P2 | Playback speed control; stage markers in Fast mode | `Solution.jsx` |
| P2 | Shorter solutions | Try more schemes, pair edges with smarter choices, short search before macros, lower Kociemba depth |
| P2 | Pattern-mode test script | Restore `scripts/test-pattern.mjs` |
| P3 | Beginner-method 3×3 stage (cross, F2L, OLL, PLL) | Teaching value for Learn mode |
| P3 | 2×2 and 3×3 support | Can reuse the 3×3 stage / cubejs; needs size-aware `pieces.js` and UI |
| P3 | 5×5 / 6×6 | New centre strategy, more wing groups, macro generation per size |
| P3 | Camera colour input; share/save a state (URL) | |

## 10. Upcoming changes (to be filled in)

### Release 2 (2026-11-14) — play arena, step-by-step help, 2×2 & 3×3, themes

| # | Change | Acceptance criteria | Status |
|---|---|---|---|
| 1 | **Play arena** (own page, `#/arena`), opened from the editor ("Solve it yourself") or the solution page | Starts from the entered cube. The user turns the 3D cube: click a sticker selects its face, **← / →** turn counter-/clockwise, **↑ / ↓** choose layer (outer / middle / inner), **Shift** = wide turn, **Ctrl+Z** / Backspace undo, **H** help. Trackpad drag or two-finger swipe rotates the view, pinch zooms. On-screen face / layer / turn buttons do the same on touch. Undo, Reset, Scramble, move counter, timer, "Solved!" celebration | ✅ |
| 2 | **Help = one formula at a time** | "Help" computes only the next formula (~6–12 moves) from the cube's *current* state, including after the user's own moves. Shows stage, title, explanation, the formula, a preview net of the state it leads to, and live progress (done moves struck through). "Show me" plays the rest. Going off the formula's path is detected ("Help from here"). "Next formula" continues | ✅ |
| 3 | Full solution screen kept | Learn / Fast / player unchanged in behaviour. "Full solution" in the arena solves from the arena's current position | ✅ |
| 4 | **2×2 and 3×3** in editor, solution and arena | Validation (incl. 3×3 centres, flipped edge, swapped pieces). Learn = layer-by-layer method (3×3: 7 stages, 2×2: 3 stages). Fast = Kociemba (3×3) / merged (2×2). Pattern mode works for all sizes (3×3 presets incl. Superflip) | ✅ |
| 5 | 4×4 last stage taught step by step | Stage 4 Learn/Help use the layer-by-layer 3×3 method (so 4×4 Learn ≈ 250 moves); Fast still uses Kociemba (≈ 155) | ✅ |
| 6 | **Themes** | Midnight, Daylight, Ocean, Sunset, Forest, Neon, Paper, High contrast. Picker in the header, remembered per browser, defaults to the OS light/dark preference | ✅ |
| 7 | **Size picker redesign** | Cards with CSS-3D mini cubes. The selected one spins, the cube under the pointer tilts toward it, difficulty dots, 5×5/6×6 locked "soon". Keyboard ←/→ between sizes | ✅ |
| 8 | Worker-crash hang fixed (§8 item 3) | Pending requests fall back to the main thread | ✅ |

Measured after release 2 (20 scrambles each): 2×2 learn 37 / fast 35 moves, 3×3 learn 111 (17 steps) / fast 22,
4×4 learn 252 (34 steps) / fast 155; all solved. Hints average 6–7 moves (max ~18). Headless UI test passes on all three sizes.

### Next (to be filled in)

| # | Change | Acceptance criteria | Files | Status |
|---|---|---|---|---|
| 1 | | | | |

## 11. Constraints & working agreement

- Plain JavaScript, simple and readable; no TypeScript.
- Small, targeted changes; list exactly which files changed (the owner applies updates by copying files).
- Call out any new dependency explicitly — reinstalling packages is costly for the owner.
- After any solver or engine change, run `npm test` and `npm run build`.
- Don't hand-edit `src/solver/macroTable.js`; regenerate it with the scripts.
- Windows + OneDrive paths; avoid scripts that assume `/tmp` or Linux paths.
- Never use the PLL parity formula `Rw2 U2 Rw2 Uw2 Rw2 U2 Rw2` — it breaks centres.

## 12. Glossary

- **Reduction method** — turn a 4×4 into a "big 3×3" by solving centres and pairing edges, then solve as a 3×3.
- **Wing** — one half of a 4×4 edge; 24 wings form 12 edge pairs.
- **OLL parity** — a single edge pair appears flipped, impossible on a 3×3.
- **PLL parity** — two edge pairs need swapping with no matching corner swap.
- **3-cycle macro** — setup moves + commutator + undo setup, cycling exactly three pieces.
- **Scheme** — which colour belongs on which face; chosen from the corners since 4×4 centres aren't fixed.
- **Kociemba** — the two-phase 3×3 algorithm (via `cubejs`) used for the final stage.
