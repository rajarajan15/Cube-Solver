import { parseAlg } from './engine/cube.js';

const FACE = { U: 'top (Up)', R: 'right', F: 'front', D: 'bottom (Down)', L: 'left', B: 'back' };

// Plain-English description of one move token such as "Rw'" or "2U2" on an NxN cube.
export function describeMove(token, N = 4) {
  try {
    const [m] = parseAlg(token, N);
    const dir = m.turns === 1 ? 'clockwise' : m.turns === 3 ? 'counter-clockwise' : 'a half turn (180°)';
    const seen = `as if you were looking straight at the ${FACE[m.face]} face`;
    if (m.d0 === 0 && m.d1 === N - 1) {
      const axis = { R: 'x', U: 'y', F: 'z' }[m.face] || m.face;
      return `${axis}: rotate the whole cube ${dir}, the same way the ${FACE[m.face]} face turns.`;
    }
    let layers;
    if (m.d0 === 0 && m.d1 === 0) layers = `Turn the outer ${FACE[m.face]} layer`;
    else if (m.d0 === 0 && m.d1 === 1) layers = `Turn the outer two layers on the ${FACE[m.face]} side together`;
    else if (m.d0 === m.d1 && N === 3) layers = `Turn only the middle layer, the same way as the ${FACE[m.face]} face`;
    else if (m.d0 === m.d1) layers = `Turn only the second layer from the ${FACE[m.face]} face (an inner slice)`;
    else layers = `Turn ${m.d1 + 1} layers on the ${FACE[m.face]} side together`;
    return `${layers} ${dir}, ${seen}.`;
  } catch { return ''; }
}
