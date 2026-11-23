// cubejs is written as `(function(){...}).call(this)`, which breaks when bundled as an ES module
// (`this` is undefined). Point it at globalThis instead. Safe to run repeatedly.
import fs from 'fs';
for (const f of ['cube.js', 'solve.js']) {
  const p = new URL(`../node_modules/cubejs/lib/${f}`, import.meta.url);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  const t = s.replaceAll('.call(this);', '.call(globalThis);');
  if (t !== s) fs.writeFileSync(p, t);
}
