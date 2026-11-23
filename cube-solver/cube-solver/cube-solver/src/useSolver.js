import { useEffect, useRef, useCallback } from 'react';

// Runs the solver in a Web Worker so the UI never freezes. If the worker can't start or
// crashes, every waiting request (and every later one) is answered on the main thread instead,
// so the UI can never get stuck on "Working…".
//   const request = useSolver();
//   const res = await request({ kind: 'solve' | 'hint', N, state, target, recipe, colorNames });
const onMainThread = (msg) => import('./solver/index.js').then(
  ({ handleRequest }) => new Promise((resolve) => setTimeout(() => {
    try { resolve(handleRequest(msg)); } catch (e) { resolve({ ok: false, errors: ['Solver error: ' + e.message] }); }
  }, 30)),
);

export function useSolver() {
  const workerRef = useRef(null);
  const pending = useRef(new Map()); // id -> {msg, resolve}
  const counter = useRef(0);

  useEffect(() => {
    let w;
    const fallBack = () => {
      workerRef.current = null;
      const waiting = [...pending.current.values()];
      pending.current.clear();
      waiting.forEach(({ msg, resolve }) => onMainThread(msg).then(resolve));
    };
    try {
      w = new Worker(new URL('./solver/solver.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        if (e.data.ready) return;
        const p = pending.current.get(e.data.id);
        if (p) { pending.current.delete(e.data.id); p.resolve(e.data.res); }
      };
      w.onerror = fallBack;
      workerRef.current = w;
    } catch { workerRef.current = null; }
    return () => { w && w.terminate(); };
  }, []);

  return useCallback((msg) => new Promise((resolve) => {
    const data = {
      ...msg,
      state: Array.from(msg.state),
      target: msg.target ? Array.from(msg.target) : null,
      recipe: msg.recipe || null,
    };
    if (workerRef.current) {
      const id = ++counter.current;
      pending.current.set(id, { msg: data, resolve });
      workerRef.current.postMessage({ id, ...data });
    } else {
      onMainThread(data).then(resolve);
    }
  }), []);
}
