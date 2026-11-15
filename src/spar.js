// Sparring: a series of rounds ("판") between the player and a partner. Every round is one throw
// of rock-paper-scissors; whoever wins the throw takes the round and puts on the technique they
// chose, and the other taps. How many rounds there are, and how many win the series, goes by belt:
//   white 3 of 5 · blue 4 of 6 · purple 4 of 7 · brown 5 of 8 · black 6 of 10
// Two different belts spar by the lower belt's rule. A series with an even number of rounds can
// end level (3 : 3 of 6); that is a draw.
//
// Techniques can only be put on inside sparring. An NPC partner starts at once; a person is asked
// and has to say yes (sim.offer / sim.answer).
//
// Both screens work the rounds out from the same hands, so they agree without sending the score.
// "A" is the one who asked, "B" the one who was asked, on both screens.
import { BELT_ORDER, turnToward, withName } from './util.js';
import { TECH } from './character.js';
import { Bout, KINDS, KIND_OBJ, KIND_SUBJ, isKind, rpsResult, randomPick } from './tech.js';

export const SPAR = { intro: 1.5, reveal: 1.3, end: 4.4, pick: 8, wait: 15, gap: 0.55 };
// belt -> [rounds, wins needed]
export const RULES = { white: [5, 3], blue: [6, 4], purple: [7, 4], brown: [8, 5], black: [10, 6] };
const KIND_LIST = Object.keys(KINDS);

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

// Where one side stands between rounds, and how: on the line from A to B, facing the other.
export function sparSpot(d, side, phase, t, end) {
  const sg = side === 'A' ? -1 : 1;
  let anim = 'stance';
  if (phase === 'intro') anim = 'bow';
  else if (phase === 'end') {
    const w = end === 1 ? 'A' : end === 2 ? 'B' : null;
    anim = t > SPAR.end - 1.4 ? 'bow' : side === w ? 'win' : 'loco';
  }
  return {
    x: d.ox + Math.sin(d.yaw) * SPAR.gap * sg, z: d.oz + Math.cos(d.yaw) * SPAR.gap * sg,
    yaw: d.yaw + (side === 'B' ? Math.PI : 0), anim,
  };
}

// Methods added to Sim.
export const SparMixin = {
  _sparInit(d) {
    const theirs = d.tgt.npc ? (d.tgt.npc.o.look || {}).belt : (d.tgt.av.st || {}).belt;
    const rule = ruleFor(this.sel.belt, theirs);
    d.me = d.mine ? 'A' : 'B';
    d.S = { max: rule.max, need: rule.need, text: rule.text, w: { A: 0, B: 0 }, n: 0, end: 0 };
    d.tk = null;
    d.theirTk = null;
    d.prev = null; // my hand and technique of the throw before this one, for a screen that missed it
    this.p.pose = 'stance';
  },

  _sparName(side) {
    const d = this.p.duel;
    return side === d.me ? this.api.name() : d.name;
  },

  // Put both bodies where they stand between rounds.
  _sparPlace(dt) {
    const p = this.p;
    const d = p.duel;
    const mine = sparSpot(d, d.me, d.phase, d.t, d.S.end);
    const dx = mine.x - p.x;
    const dz = mine.z - p.z;
    const far = Math.hypot(dx, dz);
    if (far > 0.01) {
      const st = Math.min(far, 2.6 * dt);
      p.x += (dx / far) * st;
      p.z += (dz / far) * st;
    }
    p.yaw = turnToward(p.yaw, mine.yaw, 8 * dt);
    const anim = d.phase === 'wait' ? 'stance' : mine.anim;
    if (p.pose !== anim) {
      p.pose = anim;
      p.actN++;
      this.char.play(anim);
    }
    const theirs = sparSpot(d, other(d.me), d.phase, d.t, d.S.end);
    const npc = d.tgt.npc;
    if (npc) {
      npc.slideTo(theirs.x, theirs.z, 2.6, dt);
      npc.yaw = turnToward(npc.yaw, theirs.yaw, 8 * dt);
      npc.setAnim(theirs.anim);
    } else if (d.tgt.av) d.tgt.av.ctl = d.phase === 'wait' ? null : theirs; // the avatar follows this instead of what its owner last sent
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
      if (d.t > SPAR.intro) {
        d.phase = 'pick';
        d.t = 0;
      }
    } else if (d.phase === 'pick') {
      if (!d.pick && d.t > SPAR.pick) this.pick(randomPick());
      if (npc) {
        if (d.pick && !d.their) {
          d.their = this.npcPick();
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
        else this._sparSub(d.result > 0 ? d.me : other(d.me));
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

  // The throw is won: the winner's technique goes on, and it ends in a tap.
  _sparSub(W) {
    const p = this.p;
    const d = p.duel;
    const iWin = W === d.me;
    const kind = iWin ? d.tk : d.theirTk;
    const their = d.tgt.act;
    const myName = this.api.name();
    const bout = new Bout({
      id: `${d.id}-s${d.round}`, kind: isKind(kind) ? kind : 'arm', atk: iWin ? p : their, def: iWin ? their : p,
      ox: d.ox, oz: d.oz, yaw: W === 'A' ? d.yaw : d.yaw + Math.PI,
      names: iWin ? [myName, d.name] : [d.name, myName], t: d.S.n ? TECH.greet : 0, // the first round starts with the slap and bump
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
    this.toast(iWin ? `이겼습니다! ${KIND_OBJ[bout.kind]} 겁니다` : `졌습니다. ${d.name}의 ${KIND_SUBJ[bout.kind]} 들어옵니다`, 3000);
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

  // The technique is over and both are back on their feet: the next round, or the end.
  _subDone(b) {
    const p = this.p;
    const d = p.duel;
    this._sparPoint(b);
    p.mode = 'duel';
    p.pose = '';
    d.lost = 0;
    const e = verdict(d.S);
    if (e) this._sparEnd(e);
    else this._sparNext();
    this._sparPlace(0);
    this._duelView();
  },

  // e: 1 the one who asked won, 2 the one who was asked, 3 a draw.
  _sparEnd(e) {
    const d = this.p.duel;
    const S = d.S;
    if (d.phase === 'end') return;
    S.end = e;
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
    this._duelView();
  },

  // For the HUD: null when no sparring is on.
  _sparInfo() {
    const d = this.p.duel;
    if (!d || d.kind !== 'spar' || d.phase === 'wait') return null;
    const S = d.S;
    return {
      name: d.name, me: S.w[d.me], them: S.w[other(d.me)], n: Math.min(S.max, S.n + (d.phase === 'end' ? 0 : 1)), max: S.max, need: S.need, rule: S.text,
      phase: d.phase, end: S.end ? (S.end === 3 ? 'draw' : (S.end === 1) === (d.me === 'A') ? 'win' : 'lose') : '',
    };
  },

  // Sparring going on inside a rectangle (mine, or between others), for scoreboards.
  matchIn(x0, x1, z0, z1) {
    const inside = (o) => o.ox >= x0 && o.ox <= x1 && o.oz >= z0 && o.oz <= z1;
    const d = this.p.duel;
    if (d && d.kind === 'spar' && d.phase !== 'wait' && inside(d)) {
      const S = d.S;
      const mine = this.api.name();
      return { a: d.mine ? mine : d.name, b: d.mine ? d.name : mine, sa: S.w.A, sb: S.w.B, need: S.need, max: S.max, end: S.end };
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
      return { a: av.name, b: name, sa: du.sa, sb: du.sb, need: rule.need, max: rule.max, end: du.e };
    }
    return null;
  },
};
