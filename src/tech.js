// A two-person technique from grip to bow. One Bout moves both bodies along a shared line so the
// same sequence looks identical for the player, an NPC partner, or another person's avatar.
import { TECH } from './character.js';
import { clamp, lerp, ease } from './util.js';

export const KINDS = { ankle: '앵클락', arm: '암바' };
// the same names with their object and subject particles
export const KIND_OBJ = { ankle: '앵클락을', arm: '암바를' };
export const KIND_SUBJ = { ankle: '앵클락이', arm: '암바가' };
export const RPS = { s: '가위', r: '바위', p: '보' };
const BEATS = { s: 'p', r: 's', p: 'r' };

// 1 if a beats b, -1 if b beats a, 0 for a draw
export function rpsResult(a, b) {
  if (a === b) return 0;
  return BEATS[a] === b ? 1 : -1;
}

export function randomPick(rnd = Math.random) {
  return 'srp'[Math.min(2, (rnd() * 3) | 0)];
}

// Where the hips of each body sit during the finishing hold, measured along the line from the
// attacker to the defender (u) and to the attacker's left (s), in metres from the midpoint.
const HOLD = {
  ankle: { a: { u: -0.05, s: 0, turn: 0 }, d: { u: 0.5 } },
  arm: { a: { u: 0.72, s: 0.36, turn: -Math.PI / 2 }, d: { u: 0.5 } },
};

// An actor is anything with x, z, yaw and a Character at .char: the player state paired with its
// character, an NPC, or a remote avatar.
export class Bout {
  constructor(o) {
    this.id = o.id || '';
    this.kind = HOLD[o.kind] ? o.kind : 'ankle';
    this.a = o.atk;
    this.d = o.def;
    this.ox = o.ox;
    this.oz = o.oz;
    this.yaw = o.yaw; // direction the attacker faces
    this.t = o.t || 0;
    this.done = false;
    this.names = o.names || ['', ''];
    const ux = Math.sin(this.yaw);
    const uz = Math.cos(this.yaw);
    const along = (p) => (p.x - this.ox) * ux + (p.z - this.oz) * uz;
    const side = (p) => (p.x - this.ox) * uz - (p.z - this.oz) * ux;
    this.a0 = { u: Math.min(along(this.a), -0.3), s: side(this.a) };
    this.d0 = { u: Math.max(along(this.d), 0.3), s: side(this.d) };
    for (const [act, role] of [[this.a, 'a'], [this.d, 'd']]) {
      act.char.tech = { kind: this.kind, role, t: this.t };
      act.char.play('tech');
    }
    this.update(0);
  }

  _put(act, u, s, yaw) {
    const ux = Math.sin(this.yaw);
    const uz = Math.cos(this.yaw);
    act.x = this.ox + ux * u + uz * s;
    act.z = this.oz + uz * u - ux * s;
    act.yaw = yaw;
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const H = HOLD[this.kind];
    const seg = (a, b) => ease(clamp((t - a) / (b - a), 0, 1));
    let au;
    let as;
    let turn = 0;
    let du;
    let ds;
    if (t < TECH.clinch) {
      const v = seg(0, TECH.clinch);
      au = lerp(this.a0.u, -0.3, v);
      as = lerp(this.a0.s, 0, v);
      du = lerp(this.d0.u, 0.3, v);
      ds = lerp(this.d0.s, 0, v);
    } else if (t < TECH.down) {
      const v = seg(TECH.clinch, TECH.down);
      au = lerp(-0.3, -0.02, v);
      as = 0;
      du = lerp(0.3, H.d.u, v);
      ds = 0;
    } else if (t < TECH.hold) {
      const v = seg(TECH.down, TECH.move);
      au = lerp(-0.02, H.a.u, v);
      as = lerp(0, H.a.s, v);
      turn = H.a.turn * v;
      du = H.d.u;
      ds = 0;
    } else {
      const v = seg(TECH.hold, TECH.up);
      au = lerp(H.a.u, -0.45, v);
      as = lerp(H.a.s, 0, v);
      turn = H.a.turn * (1 - v);
      du = lerp(H.d.u, 0.45, v);
      ds = 0;
    }
    this._put(this.a, au, as, this.yaw + turn);
    this._put(this.d, du, ds, this.yaw + Math.PI);
    if (this.a.char.tech) this.a.char.tech.t = t;
    if (this.d.char.tech) this.d.char.tech.t = t;
    if (t >= TECH.end) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    for (const act of [this.a, this.d]) {
      if (act.char.anim === 'tech') act.char.play('loco');
      act.char.tech = null;
    }
  }

  // True once the defender has started tapping.
  get tapped() {
    return this.t >= TECH.tap;
  }
}
