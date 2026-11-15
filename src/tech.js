// A two-person technique from the slap-and-bump to the bow. One Bout moves both bodies along a
// shared line so the same sequence looks identical for the player, an NPC partner, or another
// person's avatar.
//
// A technique always ends in a tap: it is put on by whoever won the round of sparring (spar.js).
import { TECH } from './character.js';
import { clamp, lerp, ease } from './util.js';

// Every technique that can be applied, in the order the buttons show them.
export const KINDS = { ankle: '앵클락', arm: '암바', guil: '길로틴', omo: '오모플라타', rnc: '백초크', tri: '트라이앵글', kim: '기무라' };
// the same names with their object and subject particles
export const KIND_OBJ = { ankle: '앵클락을', arm: '암바를', guil: '길로틴을', omo: '오모플라타를', rnc: '백초크를', tri: '트라이앵글을', kim: '기무라를' };
export const KIND_SUBJ = { ankle: '앵클락이', arm: '암바가', guil: '길로틴이', omo: '오모플라타가', rnc: '백초크가', tri: '트라이앵글이', kim: '기무라가' };
// True for a technique's own name only; names inherited by every object ("constructor") are not.
export const isKind = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(KINDS, k);
export const RPS = { s: '가위', r: '바위', p: '보' };
// The quick phrases a player can say; only the number travels to other people, never free text.
export const SAYS = ['안녕하세요.', '한판 하실래요?', '내일봐요'];
const BEATS = { s: 'p', r: 's', p: 'r' };

// 1 if a beats b, -1 if b beats a, 0 for a draw
export function rpsResult(a, b) {
  if (a === b) return 0;
  return BEATS[a] === b ? 1 : -1;
}

export function randomPick(rnd = Math.random) {
  return 'srp'[Math.min(2, (rnd() * 3) | 0)];
}

const PI = Math.PI;
// The tap is shown in slow motion: for `span` seconds of the technique's own time the clock runs
// at `k` of its speed. Every screen applies the same stretch, so they stay in step.
export const SLOW = { span: 0.42, k: 0.3 };
const MEET = { a: [-0.34, 0, 0], d: [0.34, 0, 0] }; // where the two stand for the slap and bump
// Where the hips of each body are at two moments: `mid`, when the first move lands, and `hold`, the
// finishing position. Each entry is [u, s, turn]: metres along the line from the attacker to the
// defender (u) and to the attacker's left (s), measured from the midpoint, and how far the body
// has turned from the way it faced at the grip.
const MOVES = {
  // straight ankle lock: the defender is taken down onto the back, the attacker sits at the feet
  ankle: { mid: { a: [-0.02, 0, 0], d: [0.5, 0, 0] }, hold: { a: [-0.05, 0, 0], d: [0.5, 0, 0] } },
  // armbar: the attacker swings round to lie across the defender's chest
  arm: { mid: { a: [-0.02, 0, 0], d: [0.5, 0, 0] }, hold: { a: [0.72, 0.36, -PI / 2], d: [0.5, 0, 0] } },
  // standing guillotine: the defender is bent over with the head under the attacker's left arm
  guil: { mid: { a: [-0.26, 0, 0], d: [0.36, 0.14, -0.2] }, hold: { a: [-0.22, 0, 0], d: [0.24, 0.26, -0.4] } },
  // omoplata: the defender is flattened face down, the attacker sits up beside the shoulder,
  // facing the same way, with a leg over it
  omo: { mid: { a: [0.02, 0.36, PI / 2], d: [0.4, 0, 0] }, hold: { a: [0.172, 0.42, PI - 0.25], d: [0.5, 0, 0] } },
  // rear naked choke: the defender is turned round, then both sit, the attacker behind
  rnc: { mid: { a: [0, 0.1, 0], d: [0.26, 0, PI] }, hold: { a: [0, 0.12, 0], d: [0.22, 0, PI] } },
  // triangle choke: the attacker pulls guard and throws the legs up round the neck from the back;
  // the defender ends on the knees, folded forward between them
  tri: { mid: { a: [-0.2, 0, 0], d: [0.3, 0, 0] }, hold: { a: [-0.14, 0, 0], d: [0.4, 0, 0] } },
  // kimura: the defender is taken down onto the back, the attacker moves up to kneel beside the
  // chest and bends the far arm behind
  kim: { mid: { a: [-0.02, 0, 0], d: [0.5, 0, 0] }, hold: { a: [0.72, 0.44, -PI / 2], d: [0.5, 0, 0] } },
};

// An actor is anything with x, z, yaw and a Character at .char: the player state paired with its
// character, an NPC, or a remote avatar.
export class Bout {
  constructor(o) {
    this.id = o.id || '';
    this.kind = isKind(o.kind) ? o.kind : 'ankle';
    this.a = o.atk;
    this.d = o.def;
    this.ox = o.ox;
    this.oz = o.oz;
    this.yaw = o.yaw; // direction the attacker faces
    this.t = o.t || 0;
    this.skip = this.t >= TECH.greet; // started without the slap and bump (a later round of sparring)
    this.done = false;
    this.names = o.names || ['', ''];
    this.T = TECH; // the moments of the technique
    this.outcome = 2; // it ends in a tap
    const ux = Math.sin(this.yaw);
    const uz = Math.cos(this.yaw);
    const along = (p) => (p.x - this.ox) * ux + (p.z - this.oz) * uz;
    const side = (p) => (p.x - this.ox) * uz - (p.z - this.oz) * ux;
    this.a0 = { u: this.skip ? along(this.a) : Math.min(along(this.a), -0.3), s: side(this.a) };
    this.d0 = { u: this.skip ? along(this.d) : Math.max(along(this.d), 0.3), s: side(this.d) };
    for (const [act, role] of [[this.a, 'a'], [this.d, 'd']]) {
      act.char.tech = { kind: this.kind, role, t: this.t, T: this.T };
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
    const T = this.T;
    let step = dt;
    if (this.t >= T.tap && this.t < T.tap + SLOW.span) step *= SLOW.k;
    this.t += step;
    const t = this.t;
    const M = MOVES[this.kind];
    const seg = (a, b) => ease(clamp((t - a) / (b - a), 0, 1));
    const grip = { a: [-0.3, 0, 0], d: [0.3, 0, 0] };
    const apart = { a: [-0.45, 0, 0], d: [0.45, 0, 0] };
    const start = { a: [this.a0.u, this.a0.s, 0], d: [this.d0.u, this.d0.s, 0] };
    let from;
    let to;
    let v;
    if (t < TECH.greet) {
      from = start;
      to = MEET;
      v = seg(0, 0.24);
    } else if (t < TECH.clinch) {
      from = this.skip ? start : MEET;
      to = grip;
      v = seg(TECH.greet, TECH.clinch);
    } else if (t < TECH.down) {
      from = grip;
      to = M.mid;
      v = seg(TECH.clinch, TECH.down);
    } else if (t < T.hold) {
      from = M.mid;
      to = M.hold;
      v = seg(TECH.down, TECH.move);
    } else {
      from = M.hold;
      to = apart;
      v = seg(T.hold, T.up);
    }
    const at = (k, i) => lerp(from[k][i], to[k][i], v);
    this._put(this.a, at('a', 0), at('a', 1), this.yaw + at('a', 2));
    this._put(this.d, at('d', 0), at('d', 1), this.yaw + PI + at('d', 2));
    if (this.a.char.tech) this.a.char.tech.t = t;
    if (this.d.char.tech) this.d.char.tech.t = t;
    if (t >= T.end) this.finish();
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
    return this.t >= this.T.tap;
  }
}
