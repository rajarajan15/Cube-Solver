export const COLORS = [
  { name: 'White', hex: '#f4f4f2' },
  { name: 'Yellow', hex: '#ffd400' },
  { name: 'Red', hex: '#d7263d' },
  { name: 'Orange', hex: '#ff7f11' },
  { name: 'Blue', hex: '#1d5fd6' },
  { name: 'Green', hex: '#1fa04b' },
];
export const COLOR_NAMES = COLORS.map((c) => c.name);
// face order U R F D L B -> white, red, green, yellow, orange, blue
export const DEFAULT_SCHEME = [0, 2, 5, 1, 3, 4];
export const EMPTY = -1;
