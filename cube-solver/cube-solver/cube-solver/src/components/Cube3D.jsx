import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getGeometry, parseAlg } from '../engine/cube.js';
import { COLORS } from '../colors.js';

const NORMALS = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
const HOME = { x: 0.5, y: -0.7 };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const cssVar = (name, fallback) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};

// Interactive 3D NxN cube.
//   state     colours to show
//   anim      {id, token, from}: animate one move starting from state `from`
//   next      move token whose layer(s) get a translucent highlight (next move / selected layer)
//   onPick(i) called with the sticker index when a sticker is clicked/tapped (not dragged)
//   trackpad  true: two-finger swipe rotates the view, pinch zooms (used in the play arena)
export default function Cube3D({ N = 4, state, anim, next, duration = 420, onPick, trackpad = false, maxHeight = 340 }) {
  const mountRef = useRef(null);
  const api = useRef(null);
  const onPickRef = useRef(onPick);
  const trackpadRef = useRef(trackpad);
  onPickRef.current = onPick;
  trackpadRef.current = trackpad;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch { setFailed(true); return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.style.display = 'block';

    const geo = getGeometry(N);
    const M = geo.M;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const baseZ = 3.1 * N + 0.2;
    camera.position.set(0, 0, baseZ);
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    root.add(pivot);
    scene.add(root);
    root.rotation.set(HOME.x, HOME.y, 0);

    // black cubies (all N^3, so inner slices never show gaps while turning)
    const bodyGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x0c0d10 });
    const bodies = [];
    for (let x = -M; x <= M; x += 2) for (let y = -M; y <= M; y += 2) for (let z = -M; z <= M; z += 2) {
      const m = new THREE.Mesh(bodyGeo, bodyMat);
      m.position.set(x / 2, y / 2, z / 2);
      m.userData.pos = [x, y, z];
      root.add(m); bodies.push(m);
    }
    // stickers
    const plane = new THREE.PlaneGeometry(0.86, 0.86);
    const stickers = [];
    for (let i = 0; i < geo.size; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x444444 });
      const m = new THREE.Mesh(plane, mat);
      const p = geo.pos[i], n = geo.nrm[i];
      m.position.set(p[0] / 2 + n[0] * 0.495, p[1] / 2 + n[1] * 0.495, p[2] / 2 + n[2] * 0.495);
      m.lookAt(m.position.clone().add(new THREE.Vector3(...n)));
      m.userData.pos = p;
      m.userData.idx = i;
      root.add(m); stickers.push(m);
    }
    // highlight slab
    const slabMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), slabMat);
    slab.visible = false;
    root.add(slab);

    const render = () => renderer.render(scene, camera);
    const setColors = (st) => { for (let i = 0; i < stickers.length; i++) { const v = st[i]; stickers[i].material.color.set(v >= 0 && v < 6 ? COLORS[v].hex : '#444'); } };
    const layerOf = (mv) => {
      const n = NORMALS[mv.face];
      return (pos) => {
        const d = (M - (pos[0] * n[0] + pos[1] * n[1] + pos[2] * n[2])) / 2;
        return d >= mv.d0 && d <= mv.d1;
      };
    };
    const showSlab = (token) => {
      slab.visible = false;
      if (!token) return;
      try {
        const [mv] = parseAlg(token, N);
        if (mv.d0 === 0 && mv.d1 === N - 1) return;
        const n = NORMALS[mv.face];
        const thick = mv.d1 - mv.d0 + 1 + 0.1;
        const center = (M - mv.d0 - mv.d1) / 2;
        const wide = N + 0.2;
        slab.scale.set(n[0] ? thick : wide, n[1] ? thick : wide, n[2] ? thick : wide);
        slab.position.set(n[0] * center, n[1] * center, n[2] * center);
        slabMat.color.set(cssVar('--slab', '#ffffff'));
        slab.visible = true;
      } catch { /* ignore */ }
    };

    let raf = 0, lastAnimId = -1, running = null;
    const finish = () => {
      if (!running) return;
      cancelAnimationFrame(raf);
      pivot.quaternion.identity();
      while (pivot.children.length) root.add(pivot.children[0]);
      const done = running.done; running = null;
      done();
    };
    const update = (st, an, nx, dur) => {
      finish();
      if (an && an.id !== lastAnimId) {
        lastAnimId = an.id;
        setColors(an.from);
        showSlab(null);
        const [mv] = parseAlg(an.token, N);
        const inLayer = layerOf(mv);
        [...stickers, ...bodies].forEach((m) => { if (inLayer(m.userData.pos)) pivot.add(m); });
        const n = new THREE.Vector3(...NORMALS[mv.face]);
        const total = -mv.turns * (Math.PI / 2);
        const t0 = performance.now();
        running = { done: () => { setColors(st); showSlab(nx); render(); } };
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / (dur * (mv.turns === 2 ? 1.4 : 1)));
          pivot.quaternion.setFromAxisAngle(n, total * ease(t));
          render();
          if (t < 1) raf = requestAnimationFrame(tick); else finish();
        };
        raf = requestAnimationFrame(tick);
      } else {
        setColors(st); showSlab(nx); render();
      }
    };

    const rotateView = (dx, dy) => {
      root.rotation.y += dx;
      root.rotation.x = Math.max(-1.45, Math.min(1.45, root.rotation.x + dy));
      render();
    };

    // drag to rotate; a click without dragging picks a sticker
    let drag = null;
    const raycaster = new THREE.Raycaster();
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(stickers, false)[0];
      if (hit) onPickRef.current?.(hit.object.userData.idx);
    };
    const down = (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; el.setPointerCapture(e.pointerId); };
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      rotateView(dx * 0.01, dy * 0.01);
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const up = (e) => {
      if (drag && drag.moved < 6 && e.type === 'pointerup' && onPickRef.current) pick(e);
      drag = null;
    };
    // trackpad: two-finger swipe rotates, pinch (ctrl+wheel) zooms
    const wheel = (e) => {
      if (!trackpadRef.current) return;
      e.preventDefault();
      if (e.ctrlKey) {
        camera.position.z = Math.max(baseZ * 0.6, Math.min(baseZ * 1.8, camera.position.z * (1 + e.deltaY * 0.01)));
        render();
      } else rotateView(-e.deltaX * 0.006, -e.deltaY * 0.006);
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });

    const resize = () => {
      const w = mount.clientWidth || 320;
      const h = Math.min(w, maxHeight);
      renderer.setSize(w, h, false);
      el.style.width = w + 'px'; el.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize); ro.observe(mount); resize();

    api.current = {
      update,
      setView: (kind) => {
        if (kind === 'home') root.rotation.set(HOME.x, HOME.y, 0);
        else if (kind === 'flip') root.rotation.set(0.5, HOME.y + Math.PI, 0);
        else if (kind === 'under') root.rotation.set(-0.6, HOME.y, 0);
        camera.position.z = baseZ;
        render();
      },
    };
    update(state, null, next, duration);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      stickers.forEach((s) => s.material.dispose());
      renderer.dispose(); bodyGeo.dispose(); plane.dispose(); bodyMat.dispose(); slabMat.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, maxHeight]);

  useEffect(() => { api.current?.update(state, anim, next, duration); }, [state, anim, next, duration]);

  if (failed) return <div className="muted" style={{ padding: 12 }}>3D view isn't supported on this device — use the flat view.</div>;
  return (
    <div className="cube3d">
      <div ref={mountRef} className="cube3d-mount" />
      <div className="view-btns">
        <button className="mini" onClick={() => api.current?.setView('home')}>Front view</button>
        <button className="mini" onClick={() => api.current?.setView('flip')}>Back view</button>
        <button className="mini" onClick={() => api.current?.setView('under')}>From below</button>
        <span className="muted">{trackpad ? 'drag or two-finger swipe to rotate' : 'drag to rotate'}</span>
      </div>
    </div>
  );
}
