// Developer aid: where the joints of a character end up for a set of pose values, without a
// browser. It repeats the joint layout of src/character.js, so it only helps while the two agree.
// Usage: import { joints, place } from './fk.mjs'
import * as THREE from 'three';

const BODY = { thigh: 0.2, shin: 0.19, sole: 0.055, armU: 0.16, armF: 0.14 };
export const H = BODY.thigh + BODY.shin + BODY.sole;
const SPINE = 0.05;
const NECK = 0.385;
const HEAD_UP = 0.255;

export const NEUTRAL = {
  tiltX: 0, drop: 0, twist: 0, bob: 0, sway: 0, spine: 0, head: 0, headZ: 0, headY: 0,
  aLx: 0, aLz: 0.26, aRx: 0, aRz: -0.26, fL: -0.1, fR: -0.1, fLy: 0, fRy: 0,
  lLx: 0, lLz: 0, lRx: 0, lRz: 0, sL: 0, sR: 0,
  aLs: 1, aRs: 1, lLs: 1, lRs: 1,
};

const grp = (parent, x, y, z) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
};

// Joint positions in the character's own frame: x to its left, y up, z the way it faces.
export function joints(pose) {
  const C = Object.assign({}, NEUTRAL, pose);
  const root = grp(null, 0, 0, 0);
  const tilt = grp(root, 0, H + C.drop + C.bob, 0);
  tilt.rotation.set(C.tiltX, 0, C.sway);
  const rig = grp(tilt, 0, -H, 0);
  rig.rotation.y = C.twist;
  const hips = grp(rig, 0, H, 0);
  const spine = grp(hips, 0, SPINE, 0);
  spine.rotation.x = C.spine;
  const head = grp(spine, 0, NECK, 0);
  head.rotation.set(C.head, C.headY, C.headZ);
  const skull = grp(head, 0, HEAD_UP, 0);
  const chest = grp(spine, 0, 0.2, 0);
  const out = { hips, neck: head, head: skull, chest };
  for (const [n, sx] of [['L', 1], ['R', -1]]) {
    const U = grp(spine, sx * 0.2, 0.33, 0);
    U.rotation.set(C[`a${n}x`], 0, C[`a${n}z`]);
    const ak = C[`a${n}s`];
    const lk = C[`l${n}s`];
    const F = grp(U, 0, -BODY.armU * ak, 0);
    F.rotation.order = 'YXZ';
    F.rotation.set(C[`f${n}`], C[`f${n}y`], 0);
    const hand = grp(F, 0, -BODY.armF * ak - 0.03, 0);
    const T = grp(hips, sx * 0.1, 0, 0);
    T.rotation.set(C[`l${n}x`], 0, C[`l${n}z`]);
    const S = grp(T, 0, -BODY.thigh * lk, 0);
    S.rotation.x = C[`s${n}`];
    const foot = grp(S, 0, -BODY.shin * lk, 0.04);
    Object.assign(out, { [`sh${n}`]: U, [`el${n}`]: F, [`hand${n}`]: hand, [`hip${n}`]: T, [`knee${n}`]: S, [`foot${n}`]: foot });
  }
  root.updateMatrixWorld(true);
  const res = {};
  for (const k in out) res[k] = out[k].getWorldPosition(new THREE.Vector3());
  return res;
}

// The same joints for a body standing at (u, s) and turned by `yaw`, in technique coordinates:
// u along the line from the attacker to the defender, s to the attacker's left, y up.
export function place(pose, u, s, yaw) {
  const j = joints(pose);
  const res = {};
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  for (const k in j) {
    const p = j[k];
    res[k] = { u: +(u + p.z * c - p.x * sn).toFixed(3), s: +(s + p.x * c + p.z * sn).toFixed(3), y: +p.y.toFixed(3) };
  }
  return res;
}

export function show(title, j, keys) {
  console.log(title);
  for (const k of keys || Object.keys(j)) {
    const p = j[k];
    console.log(`  ${k.padEnd(6)} u ${String(p.u).padStart(6)}  s ${String(p.s).padStart(6)}  y ${String(p.y).padStart(6)}`);
  }
}

// Fit one limb to targets given in technique coordinates: finds the four joint angles (and
// optionally the stretch) that bring the middle joint and the end closest to `mid` and `end`.
// limb: 'aL' | 'aR' | 'lL' | 'lR'. Returns the pose values to paste into a key pose.
export function fit(pose, at, limb, mid, end, opt = {}) {
  const arm = limb[0] === 'a';
  const n = limb[1];
  const keys = arm ? [`a${n}x`, `a${n}z`, `f${n}`, `f${n}y`] : [`l${n}x`, `l${n}z`, `s${n}`];
  const sk = `${limb}s`;
  if (opt.stretch) keys.push(sk);
  const jm = arm ? `el${n}` : `knee${n}`;
  const je = arm ? `hand${n}` : `foot${n}`;
  const lim = {
    [`a${n}x`]: [-3.2, 1.2], [`a${n}z`]: [-1.8, 1.8], [`f${n}`]: [-2.5, 0], [`f${n}y`]: [-2, 2],
    [`l${n}x`]: [-2.6, 0.8], [`l${n}z`]: [-2.2, 2.2], [`s${n}`]: [0, 2.6], [sk]: [1, opt.max || 2],
  };
  const base = Object.assign({}, NEUTRAL, pose);
  const d2 = (a, b) => (a.u - b.u) ** 2 + (a.s - b.s) ** 2 + (a.y - b.y) ** 2;
  const cost = (p) => {
    const j = place(p, at[0], at[1], at[2]);
    return (mid ? d2(j[jm], mid) * (opt.wMid == null ? 1 : opt.wMid) : 0) + d2(j[je], end) + (opt.stretch ? 0.002 * (p[sk] - 1) ** 2 : 0);
  };
  // coordinate descent from several starting points, since one start often sticks at a limit
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let cur = null;
  let best = Infinity;
  for (let start = 0; start < 24; start++) {
    const p = Object.assign({}, base);
    if (start) for (const k of keys) p[k] = lim[k][0] + (lim[k][1] - lim[k][0]) * rnd();
    let c0 = cost(p);
    let step = 0.5;
    for (let it = 0; it < 400 && step > 0.002; it++) {
      let moved = false;
      for (const k of keys) {
        for (const dir of [1, -1]) {
          const v = Math.min(lim[k][1], Math.max(lim[k][0], p[k] + dir * step));
          const old = p[k];
          p[k] = v;
          const c = cost(p);
          if (c < c0 - 1e-9) {
            c0 = c;
            moved = true;
          } else p[k] = old;
        }
      }
      if (!moved) step *= 0.6;
    }
    if (c0 < best) {
      best = c0;
      cur = p;
    }
  }
  const res = {};
  for (const k of keys) res[k] = +cur[k].toFixed(2);
  return { set: res, err: +Math.sqrt(best).toFixed(3) };
}
