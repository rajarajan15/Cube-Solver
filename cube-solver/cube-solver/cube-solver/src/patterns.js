// Pattern presets per cube size. Each is a short move recipe applied to a solved cube.
export const PRESETS = {
  2: [],
  3: [
    { id: 'checker', name: 'Checkerboard', alg: 'U2 D2 R2 L2 F2 B2' },
    { id: 'cubeincube', name: 'Cube in cube', alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U" },
    { id: 'sixspot', name: 'Six spots', alg: "U D' R L' F B' U D'" },
    { id: 'superflip', name: 'Superflip', alg: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2" },
  ],
  4: [
    { id: 'checker', name: 'Checkerboard', alg: 'U2 D2 R2 L2 F2 B2' },
    { id: 'cubeincube', name: 'Cube in cube', alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U" },
    { id: 'sixspot', name: 'Six spots', alg: "U D' R L' F B' U D'" },
    { id: 'crosses', name: 'Crosses', alg: "2U 2D' 2R 2L' 2F 2B' 2U 2D'" },
  ],
};

// Random-scramble move sets per size
export const SCRAMBLE_MOVES = {
  2: ['U', 'R', 'F'],
  3: ['U', 'R', 'F', 'D', 'L', 'B'],
  4: ['U', 'R', 'F', 'D', 'L', 'B', 'Rw', 'Uw', 'Fw', 'Lw', 'Dw', 'Bw', '2R', '2U', '2F', '2L', '2D', '2B'],
};
export const SCRAMBLE_LENGTH = { 2: 20, 3: 30, 4: 60 };

export function randomScramble(N) {
  const mv = SCRAMBLE_MOVES[N];
  const out = [];
  let last = '';
  while (out.length < SCRAMBLE_LENGTH[N]) {
    const m = mv[Math.floor(Math.random() * mv.length)];
    if (m === last) continue;
    last = m;
    out.push(m + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out.join(' ');
}
