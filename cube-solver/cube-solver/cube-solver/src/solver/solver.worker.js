import { handleRequest, warmUp } from './index.js';

// Request: {id, kind: 'solve'|'hint', N, state, target?, recipe?, colorNames}
// Reply:   {id, res, ms}
self.onmessage = (e) => {
  const { id, ...msg } = e.data;
  const t0 = Date.now();
  let res;
  try { res = handleRequest(msg); } catch (err) { res = { ok: false, errors: ['Solver error: ' + err.message] }; }
  self.postMessage({ id, res, ms: Date.now() - t0 });
};
self.postMessage({ ready: true });
warmUp(); // build the 3x3 tables as soon as the worker starts
