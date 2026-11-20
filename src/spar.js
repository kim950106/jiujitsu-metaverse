// Sparring: a series of rounds ("판") between the player and a partner, fought as one roll. Every
// round is one throw of rock-paper-scissors, and the one who wins the throw moves up:
//   standing                 -> takedown: on top, in the other's guard
//   on top in guard          -> guard pass, to side control
//   on top in side control   -> mount
//   on top in mount          -> back take
//   on the back              -> back to the mount
//   underneath               -> sweep: now on top, in guard
// The round that wins the series is finished with a submission: the technique the winner chose,
// put on from wherever the two are, and the other taps. How many rounds, and how many win it,
// goes by belt:
//   white 3 of 5 · blue 4 of 6 · purple 4 of 7 · brown 5 of 8 · black 6 of 10
// Two different belts spar by the lower belt's rule. A series with an even number of rounds can
// end level (3 : 3 of 6); that is a draw, and nobody taps.
//
// The master (관장님) is not beaten so easily. How a series with him ends is settled when it
// starts, by the player's belt (MASTER_WIN), and his hands follow from that.
//
// Techniques can only be put on inside sparring. An NPC partner starts at once; a person is asked
// and has to say yes (sim.offer / sim.answer).
//
// Both screens work the rounds and the positions out from the same hands, so they agree without
// sending either. "A" is the one who asked, "B" the one who was asked, on both screens.
import { BELT_ORDER, turnToward, withName, withRo } from './util.js';
import { TECH, GREET } from './character.js';
import { Bout, KINDS, KIND_OBJ, KIND_SUBJ, isKind, rpsResult, randomPick, handFor } from './tech.js';

export const SPAR = { bow: 1.2, intro: 2.4, reveal: 1.3, move: 1.8, end: 4.4, pick: 8, wait: 15, gap: 0.55, meet: 0.34 };
// belt -> [rounds, wins needed]
export const RULES = { white: [5, 3], blue: [6, 4], purple: [7, 4], brown: [8, 5], black: [10, 6] };
const KIND_LIST = Object.keys(KINDS);

// The positions, and the pose of the one on top and the one underneath in each.
export const POS = ['stand', 'guard', 'side', 'mount', 'back'];
export const POS_NAME = { stand: '스탠딩', guard: '가드', side: '사이드', mount: '마운트', back: '백' };
export const POSE = {
  guard: ['guardTop', 'guardBottom'], side: ['sideTop', 'sideBottom'], mount: ['mountTop', 'mountBottom'], back: ['backTop', 'backBottom'],
};
// Where the two are in each position, in the frame of the one on top: [metres toward the one
// underneath, metres to the left, turn away from facing the other], from the middle of the pair.
const SPOTS = {
  // kneeling between the legs of the one on the back
  guard: { top: [-0.19, 0, 0], under: [0.28, 0, 0] },
  // kneeling beside the chest, lying across it
  side: { top: [0.52, 0.42, -Math.PI / 2], under: [0.28, 0, 0] },
  // astride the belly
  mount: { top: [0.42, 0, 0], under: [0.28, 0, 0] },
  // both sitting, the one behind with the legs round the waist, both facing the same way
  back: { top: [-0.02, 0.1, 0], under: [0.34, 0, Math.PI] },
};
// Moving up from each position on top: the next one, and what it is called.
const LADDER = { guard: ['side', '가드 패스'], side: ['mount', '마운트'], mount: ['back', '백 테이크'], back: ['mount', '마운트 전환'] };

// The player's chance of taking a series off the master, by the player's belt.
export const MASTER_WIN = { white: 0, blue: 0.01, purple: 0.05, brown: 0.1, black: 0.4 };
// How often the side that is not to win the series still takes a round, while it can afford to.
// Against the master the player gets a round now and then, more often the higher the belt.
const GIVE = { white: 0.22, blue: 0.3, purple: 0.35, brown: 0.4, black: 0.45 };
const SAME = 0.14; // how often the master's hand is the same as the player's (thrown again)

const rank = (b) => Math.max(0, BELT_ORDER.indexOf(b));
// The rule two belts spar by: the lower belt's.
export function ruleFor(a, b) {
  const belt = BELT_ORDER[Math.min(rank(a), rank(b))];
  const [max, need] = RULES[belt];
  return { belt, max, need, text: `${max}판 ${need}선승` };
}

// How a series stands: 0 still going, 1 A has won, 2 B has won, 3 a draw.
export function verdict(S) {
  if (S.w.A >= S.need) return 1;
  if (S.w.B >= S.need) return 2;
  if (S.n >= S.max) return S.w.A === S.w.B ? 3 : S.w.A > S.w.B ? 1 : 2;
  return 0;
}

const hash = (s) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
const other = (side) => (side === 'A' ? 'B' : 'A');

// What a round won by W does to the position (S.pos, S.top). Returns what it is called.
export function advance(S, W) {
  if (S.pos === 'stand' || !S.top) {
    S.pos = 'guard';
    S.top = W;
    return '테이크다운';
  }
  if (S.top === W) {
    const [next, label] = LADDER[S.pos];
    S.pos = next;
    return label;
  }
  S.top = W;
  S.pos = 'guard';
  return '스윕';
}

// The same, without changing anything.
export const preview = (S, W) => advance({ pos: S.pos, top: S.top }, W);

// The position as one small number for the others in the place (0 standing), and back.
export const posCode = (S) => (!S.top || S.pos === 'stand' ? 0 : (POS.indexOf(S.pos) - 1) * 2 + (S.top === 'A' ? 1 : 2));
export const posFrom = (n) => (n >= 1 && n <= 8 ? { pos: POS[((n - 1) >> 1) + 1], top: n % 2 ? 'A' : 'B' } : { pos: 'stand', top: null });

// Where one side is, and in what pose. d: { ox, oz, yaw } the middle of the pair and the way from
// A toward B; S: { pos, top, end }; t: seconds into the phase.
export function sparSpot(d, side, phase, t, S) {
  const ux = Math.sin(d.yaw);
  const uz = Math.cos(d.yaw);
  const at = (u, s, turn, anim) => ({
    x: d.ox + ux * u + uz * s, z: d.oz + uz * u - ux * s, yaw: d.yaw + (side === 'B' ? Math.PI : 0) + turn, anim,
  });
  const sg = side === 'A' ? -1 : 1;
  if (phase === 'end') {
    const w = S.end === 1 ? 'A' : S.end === 2 ? 'B' : null;
    return at(sg * SPAR.gap, 0, 0, t > SPAR.end - 1.4 ? 'bow' : side === w ? 'win' : 'loco');
  }
  if (phase === 'intro') {
    if (t < SPAR.bow) return at(sg * SPAR.gap, 0, 0, 'bow');
    if (t < SPAR.bow + TECH.greet) return at(sg * SPAR.meet, 0, 0, 'greet'); // the slap and bump
    return at(sg * SPAR.gap, 0, 0, 'stance');
  }
  if (phase === 'wait' || S.pos === 'stand' || !S.top || !SPOTS[S.pos]) return at(sg * SPAR.gap, 0, 0, 'stance');
  const top = side === S.top;
  const [u, s, turn] = SPOTS[S.pos][top ? 'top' : 'under'];
  const k = S.top === 'A' ? 1 : -1; // the frame of the one on top, turned into the frame of A
  return at(u * k, s * k, turn, POSE[S.pos][top ? 0 : 1]);
}

// The result of one throw against the master, as the player (A) sees it: 1 won, -1 lost, 0 the
// same hands. `fate` is the side that is to win the series; rnd gives 0..1.
export function masterThrow(S, fate, belt, rnd = Math.random) {
  if (rnd() < SAME) return 0;
  const lose = other(fate);
  const cap = Math.min(S.need - 1, S.max - S.need); // rounds the other side can take, and the series still be won
  const give = fate === 'A' ? 0.45 : GIVE[belt] != null ? GIVE[belt] : 0.3;
  const W = S.w[lose] < cap && rnd() < give ? lose : fate;
  return W === 'A' ? 1 : -1;
}

// Methods added to Sim.
export const SparMixin = {
  _sparInit(d) {
    const npc = d.tgt.npc;
    const theirs = npc ? (npc.o.look || {}).belt : (d.tgt.av.st || {}).belt;
    const rule = ruleFor(this.sel.belt, theirs);
    d.me = d.mine ? 'A' : 'B';
    d.S = { max: rule.max, need: rule.need, text: rule.text, w: { A: 0, B: 0 }, n: 0, end: 0, pos: 'stand', top: null };
    d.tk = null;
    d.theirTk = null;
    d.prev = null; // my hand and technique of the throw before this one, for a screen that missed it
    d.step = ''; // what the last round won did
    d.fate = null;
    if (npc && npc.o.master) d.fate = this.rnd() < (MASTER_WIN[this.sel.belt] || 0) ? 'A' : 'B';
    this.p.pose = 'stance';
  },

  _sparName(side) {
    const d = this.p.duel;
    return side === d.me ? this.api.name() : d.name;
  },

  // Put both bodies where the sparring says they are.
  _sparPlace(dt) {
    const p = this.p;
    const d = p.duel;
    const S = d.S;
    const mine = sparSpot(d, d.me, d.phase, d.t, S);
    const dx = mine.x - p.x;
    const dz = mine.z - p.z;
    const far = Math.hypot(dx, dz);
    if (far > 0.01) {
      const st = Math.min(far, 2.6 * dt);
      p.x += (dx / far) * st;
      p.z += (dz / far) * st;
    }
    p.yaw = turnToward(p.yaw, mine.yaw, 8 * dt);
    // on the ground the bodies ease from one position into the next
    const rate = S.pos !== 'stand' || d.phase === 'move' || d.phase === 'end' ? 9 : 20;
    this.char.rate = rate;
    const anim = d.phase === 'wait' ? 'stance' : mine.anim;
    if (p.pose !== anim) {
      p.pose = anim;
      p.actN++;
      this.char.play(anim);
    }
    const theirs = sparSpot(d, other(d.me), d.phase, d.t, S);
    const npc = d.tgt.npc;
    if (npc) {
      npc.slideTo(theirs.x, theirs.z, 2.6, dt);
      npc.yaw = turnToward(npc.yaw, theirs.yaw, 8 * dt);
      npc.char.rate = rate;
      npc.setAnim(theirs.anim);
    } else if (d.tgt.av) d.tgt.av.ctl = d.phase === 'wait' ? null : Object.assign(theirs, { rate }); // the avatar follows this instead of what its owner last sent
  },

  _sparNext() {
    const d = this.p.duel;
    d.prev = d.pick ? { r: d.round, p: d.pick, tk: d.tk } : null;
    d.round++;
    d.pick = null;
    d.tk = null;
    d.their = null;
    d.theirTk = null;
    d.result = null;
    d.phase = 'pick';
    d.t = 0;
  },

  _stepSpar(dt) {
    const p = this.p;
    const d = p.duel;
    const before = d.t;
    d.t += dt;
    const av = d.tgt.av;
    const npc = d.tgt.npc;
    if (av && av.gone) {
      this._dropDuel('상대가 자리를 떠났습니다');
      return;
    }
    const theirs = av && av.du && av.du.id === d.id ? av.du : null;
    if (av && d.phase !== 'wait' && d.phase !== 'end') {
      if (theirs) d.lost = 0;
      else {
        d.lost += dt;
        if (d.lost > 3.5) {
          this._dropDuel('상대가 스파링을 그만두었습니다');
          return;
        }
      }
    }
    this._sparPlace(dt);
    if (d.phase === 'wait') {
      if (theirs) {
        d.phase = 'intro';
        d.t = 0;
        this._sparIntro();
      } else if (av.rj === d.id) {
        this._dropDuel(`${d.name} 님이 스파링을 사양했습니다`);
        return;
      } else if (d.t > SPAR.wait) {
        this._dropDuel('상대가 응하지 않았습니다');
        return;
      }
    } else if (d.phase === 'intro') {
      const crossed = (at) => before < at && d.t >= at;
      if (this.h.sfx && crossed(SPAR.bow + GREET.slap)) this.h.sfx('slap');
      if (this.h.sfx && crossed(SPAR.bow + GREET.bump)) this.h.sfx('bump');
      if (d.t > SPAR.intro) {
        d.phase = 'pick';
        d.t = 0;
      }
    } else if (d.phase === 'pick') {
      if (!d.pick && d.t > SPAR.pick) this.pick(randomPick());
      if (npc) {
        if (d.pick && !d.their) {
          d.their = d.fate ? handFor(d.pick, masterThrow(d.S, d.fate, this.sel.belt, this.rnd)) : this.npcPick();
          d.theirTk = KIND_LIST[hash(`${d.id}|${d.round}`) % KIND_LIST.length];
        }
      } else if (theirs) {
        if (theirs.r === d.round && theirs.p) {
          d.their = theirs.p;
          d.theirTk = theirs.tk;
        } else if (theirs.r === d.round + 1 && theirs.q) {
          // they have already moved on from this throw: their hand of it comes along with the next
          d.their = theirs.q;
          d.theirTk = theirs.qk;
        }
      }
      if (d.pick && d.their) {
        d.phase = 'reveal';
        d.t = 0;
        d.result = rpsResult(d.pick, d.their);
        if (this.h.sfx) this.h.sfx(d.result > 0 ? 'ding' : d.result < 0 ? 'thud' : 'beep');
      }
    } else if (d.phase === 'reveal') {
      if (d.t > SPAR.reveal) {
        if (d.result === 0) this._sparNext();
        else this._sparRound(d.result > 0 ? d.me : other(d.me));
      }
    } else if (d.phase === 'move') {
      if (d.t > SPAR.move) {
        const e = verdict(d.S);
        if (e) this._sparEnd(e);
        else this._sparNext();
      }
    } else if (d.phase === 'end' && d.t > SPAR.end) {
      this._dropDuel();
      this._cool = 1.5;
      return;
    }
    this._duelView();
  },

  _sparIntro() {
    const d = this.p.duel;
    this.toast(`${withName(d.name)} 스파링 · ${d.S.text}`, 3200);
    if (this.h.sfx) this.h.sfx('whistle');
  },

  // A throw is won. The round that wins the series goes to the finish; any other one moves the
  // winner up, or brings the one underneath out on top.
  _sparRound(W) {
    const d = this.p.duel;
    const S = d.S;
    if (S.w[W] + 1 >= S.need) {
      this._sparSub(W);
      return;
    }
    const was = S.pos;
    S.n++;
    S.w[W]++;
    d.step = advance(S, W);
    d.stepBy = W;
    d.phase = 'move';
    d.t = 0;
    this.toast(`${this._sparName(W)}의 ${d.step}! · ${S.w[d.me]} : ${S.w[other(d.me)]}`, 2600);
    if (this.h.flash) this.h.flash({ text: `${d.step}!`, kind: W === d.me ? 'tap' : 'esc' });
    if (this.h.sfx) this.h.sfx(was === 'stand' || d.step === '스윕' ? 'thud' : 'beep');
    this._sparPlace(0);
    this._duelView();
  },

  // The round that wins it: the winner's technique goes on from where the two are, and it ends in
  // a tap.
  _sparSub(W) {
    const p = this.p;
    const d = p.duel;
    const iWin = W === d.me;
    const kind = isKind(iWin ? d.tk : d.theirTk) ? (iWin ? d.tk : d.theirTk) : 'arm';
    const their = d.tgt.act;
    const myName = this.api.name();
    const ground = d.S.pos !== 'stand';
    const bout = new Bout({
      id: `${d.id}-s${d.round}`, kind, atk: iWin ? p : their, def: iWin ? their : p,
      ox: d.ox, oz: d.oz, yaw: W === 'A' ? d.yaw : d.yaw + Math.PI,
      names: iWin ? [myName, d.name] : [d.name, myName], t: ground ? TECH.down : TECH.greet, ground, // the slap and bump were at the start
    });
    bout.mine = true;
    bout.iWin = iWin;
    bout.tgt = d.tgt;
    bout.spar = d;
    bout.side = W;
    if (d.tgt.av) {
      d.tgt.av.ctl = null;
      d.tgt.av.ctlAnim = '';
      d.tgt.av.bout = bout;
    }
    if (d.tgt.npc) d.tgt.npc.anim = ''; // the technique poses it now
    p.bout = bout;
    p.mode = 'bout';
    p.pose = 'tech';
    d.phase = 'sub';
    this.bouts.push(bout);
    this._duelView();
    this.toast(iWin ? `이겼습니다! ${KIND_OBJ[kind]} 겁니다` : `졌습니다. ${d.name}의 ${KIND_SUBJ[kind]} 들어옵니다`, 3000);
  },

  // The tap: the round is counted.
  _sparPoint(b) {
    const d = b.spar;
    if (this.p.duel !== d || b.counted) return;
    b.counted = true;
    d.S.n++;
    d.S.w[b.side]++;
    this._duelView();
  },

  // The technique is over and both are back on their feet: the end of the sparring.
  _subDone(b) {
    const p = this.p;
    const d = p.duel;
    this._sparPoint(b);
    p.mode = 'duel';
    p.pose = '';
    d.lost = 0;
    d.S.pos = 'stand';
    d.S.top = null;
    const e = verdict(d.S);
    if (e) this._sparEnd(e);
    else this._sparNext(); // (only if the score was changed from outside)
    this._sparPlace(0);
    this._duelView();
  },

  // e: 1 the one who asked won, 2 the one who was asked, 3 a draw.
  _sparEnd(e) {
    const d = this.p.duel;
    const S = d.S;
    if (d.phase === 'end') return;
    S.end = e;
    S.pos = 'stand';
    S.top = null;
    d.phase = 'end';
    d.t = 0;
    const draw = e === 3;
    const iWon = !draw && (e === 1) === (d.me === 'A');
    const ws = e === 2 ? 'B' : 'A'; // the score is told the winner's first
    const score = `${S.w[ws]} : ${S.w[other(ws)]}`;
    if (iWon) this.streak++;
    else if (!draw) this.streak = 0;
    if (this.h.streak) this.h.streak(this.streak);
    const text = draw ? `무승부 · ${score}` : `${this._sparName(ws)} 승 · ${score}`;
    this.toast(`스파링 종료 · ${text}${iWon && this.streak >= 2 ? ` · ${this.streak}연승` : ''}`, 4600);
    this.results.unshift({ ox: d.ox, oz: d.oz, text: `스파링 · ${text}`, until: this.t + 14 });
    if (this.results.length > 8) this.results.length = 8;
    if (this.h.flash) this.h.flash({ text: draw ? '무승부' : iWon ? '승리!' : '패배', kind: iWon ? 'tap' : 'esc' });
    if (this.h.sfx) {
      this.h.sfx(iWon ? 'ding' : 'beep');
      if (this.world.name === 'arena') this.h.sfx('cheer');
    }
    const npc = d.tgt.npc;
    if (npc && npc.o.master) npc.reply = { t: 1.2, text: iWon ? '와, 많이 늘었네요!' : draw ? '좋은 스파링이었어요.' : '좋아요. 조금만 더 다듬어 봅시다.' };
    this._duelView();
  },

  // What a throw won by me would do now: { sub: true } for the round that wins it, else { label }.
  _sparNextFor(side) {
    const S = this.p.duel.S;
    if (S.w[side] + 1 >= S.need) return { sub: true };
    return { label: preview(S, side) };
  },

  // For the HUD: null when no sparring is on.
  _sparInfo() {
    const d = this.p.duel;
    if (!d || d.kind !== 'spar' || d.phase === 'wait') return null;
    const S = d.S;
    const mine = this._sparNextFor(d.me);
    const theirs = this._sparNextFor(other(d.me));
    const tk = d.tk || this.tech;
    return {
      name: d.name, me: S.w[d.me], them: S.w[other(d.me)], n: Math.min(S.max, S.n + (d.phase === 'end' ? 0 : 1)), max: S.max, need: S.need, rule: S.text,
      phase: d.phase, end: S.end ? (S.end === 3 ? 'draw' : (S.end === 1) === (d.me === 'A') ? 'win' : 'lose') : '',
      pos: S.pos === 'stand' ? '' : POS_NAME[S.pos], top: !S.top ? '' : S.top === d.me ? 'me' : 'them',
      // what winning or losing this throw does
      win: mine.sub ? `${withRo(KINDS[tk])} 마무리!` : mine.label,
      lose: theirs.sub ? `${d.name}의 ${KIND_SUBJ[isKind(d.theirTk) ? d.theirTk : 'arm']} 들어옵니다` : `${d.name}의 ${theirs.label}`,
      final: !!mine.sub,
    };
  },

  // Sparring going on inside a rectangle (mine, or between others), for scoreboards.
  matchIn(x0, x1, z0, z1) {
    const inside = (o) => o.ox >= x0 && o.ox <= x1 && o.oz >= z0 && o.oz <= z1;
    const d = this.p.duel;
    if (d && d.kind === 'spar' && d.phase !== 'wait' && inside(d)) {
      const S = d.S;
      const mine = this.api.name();
      return { a: d.mine ? mine : d.name, b: d.mine ? d.name : mine, sa: S.w.A, sb: S.w.B, need: S.need, max: S.max, end: S.end, pos: S.pos === 'stand' ? '' : POS_NAME[S.pos] };
    }
    const list = this.peers();
    for (const av of list) {
      const du = av.du;
      if (!du || du.k !== 'spar' || du.c !== 1 || !inside(du)) continue;
      let name = '상대';
      let belt = 'white';
      if (du.w[0] === 'n' && this.world.npcs[parseInt(du.w.slice(1), 10)]) {
        const n = this.world.npcs[parseInt(du.w.slice(1), 10)];
        name = n.name;
        belt = (n.o.look || {}).belt;
      } else {
        const o = du.w === this.myPeer ? null : list.find((x) => x.id === du.w);
        if (o) {
          name = o.name;
          belt = o.st.belt;
        } else if (du.w === this.myPeer) {
          name = this.api.name();
          belt = this.sel.belt;
        }
      }
      const rule = ruleFor(av.st.belt, belt);
      const ps = posFrom(du.ps);
      return { a: av.name, b: name, sa: du.sa, sb: du.sb, need: rule.need, max: rule.max, end: du.e, pos: ps.pos === 'stand' ? '' : POS_NAME[ps.pos] };
    }
    return null;
  },
};
