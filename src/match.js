// A points match ("한 판") between the player and a partner, on top of the rock-paper-scissors
// duel. Every round is one throw of hands; whoever wins it takes the next step:
//   standing            -> takedown, into the loser's guard          2 points
//   on top in guard     -> guard pass, to side control               3 points
//   on top in side      -> mount                                     4 points
//   on top in mount     -> a submission attempt (a technique, with its struggle); a tap ends the match
//   underneath          -> sweep: now on top, in guard               2 points
// When the clock runs out the points decide. The clock is the shorter of the two belts' match
// times, scaled down (PER_MINUTE seconds for each minute of a real match).
//
// Both screens work the position and the points out from the same hands, so they agree without
// sending either. Only the end by the clock needs one voice: the challenger's screen calls it and
// the other follows. "A" is the challenger, "B" the challenged, on both screens.
import { BELTS, clamp, turnToward, withName } from './util.js';
import { TECH } from './character.js';
import { Bout, KINDS, KIND_OBJ, KIND_SUBJ, MARGIN, rpsResult, randomPick } from './tech.js';

export const MATCH = { intro: 1.5, reveal: 1.3, move: 2.0, end: 4.4, pick: 7, perMinute: 12 };
export const POS_NAME = { stand: '스탠딩', guard: '가드', side: '사이드 컨트롤', mount: '마운트' };
const SUBS = ['arm', 'kim', 'tri', 'rnc', 'guil']; // the finishes tried from the mount
const POS = ['stand', 'guard', 'side', 'mount'];
// The position as one small number for the others in the place, and back.
export const posCode = (M) => (M.top == null ? 0 : POS.indexOf(M.pos) * 2 - (M.top === 'A' ? 1 : 0));
export const posFrom = (n) => (n >= 1 && n <= 6 ? { pos: POS[(n + 1) >> 1], top: n % 2 ? 'A' : 'B' } : { pos: 'stand', top: null });
const hash = (s) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
const other = (side) => (side === 'A' ? 'B' : 'A');

// Where the two bodies are for a position: metres along the line from A to B (u) and to A's left
// (s) from its middle, the turn away from facing the other, and the pose.
export function layout(M, phase, t) {
  if (phase === 'end') {
    const w = M.end === 1 ? 'A' : M.end === 2 ? 'B' : null;
    const bow = t > MATCH.end - 1.4;
    const pose = (side) => (bow ? 'bow' : side === w ? 'win' : 'loco');
    return { A: { u: -0.55, s: 0, turn: 0, anim: pose('A') }, B: { u: 0.55, s: 0, turn: 0, anim: pose('B') } };
  }
  if (phase === 'wait' || phase === 'intro' || M.pos === 'stand') {
    const anim = phase === 'intro' ? 'bow' : 'stance';
    return { A: { u: -0.55, s: 0, turn: 0, anim }, B: { u: 0.55, s: 0, turn: 0, anim } };
  }
  const T = M.top;
  const U = other(T);
  const sg = U === 'B' ? 1 : -1; // the side of the line the one underneath lies on
  const out = {};
  out[U] = { u: sg * 0.28, s: 0, turn: 0, anim: M.pos === 'guard' ? 'guardBottom' : M.pos === 'side' ? 'sideBottom' : 'mountBottom' };
  if (M.pos === 'guard') out[T] = { u: -sg * 0.19, s: 0, turn: 0, anim: 'guardTop' };
  else if (M.pos === 'side') out[T] = { u: sg * 0.52, s: sg * 0.42, turn: -Math.PI / 2, anim: 'sideTop' };
  else out[T] = { u: sg * 0.42, s: 0, turn: 0, anim: 'mountTop' };
  return out;
}

// What a won round does to the match. Returns { gain: { who, n, label } } or { sub: true }.
export function advance(M, W) {
  if (M.pos === 'stand') {
    M.top = W;
    M.pos = 'guard';
    return { gain: { who: W, n: 2, label: '테이크다운' } };
  }
  if (M.top === W) {
    if (M.pos === 'guard') {
      M.pos = 'side';
      return { gain: { who: W, n: 3, label: '가드 패스' } };
    }
    if (M.pos === 'side') {
      M.pos = 'mount';
      return { gain: { who: W, n: 4, label: '마운트' } };
    }
    return { sub: true };
  }
  M.top = W;
  M.pos = 'guard';
  return { gain: { who: W, n: 2, label: '스윕' } };
}

const beltMinutes = (b) => (BELTS[b] ? BELTS[b].minutes : 5);

// Methods added to Sim.
export const MatchMixin = {
  _matchInit(d) {
    const theirs = d.tgt.npc ? (d.tgt.npc.o.look || {}).belt : (d.tgt.av.st || {}).belt;
    const total = Math.min(beltMinutes(this.sel.belt), beltMinutes(theirs)) * MATCH.perMinute;
    d.me = d.mine ? 'A' : 'B';
    d.M = { pos: 'stand', top: null, sc: { A: 0, B: 0 }, total, left: total, end: 0, how: '', gain: null, sub: null };
    this.p.pose = 'stance';
  },

  _matchName(side) {
    const d = this.p.duel;
    return side === d.me ? this.api.name() : d.name;
  },

  // Put both bodies where the position says they are.
  _matchPlace(dt) {
    const p = this.p;
    const d = p.duel;
    const L = layout(d.M, d.phase, d.t);
    const ux = Math.sin(d.yaw);
    const uz = Math.cos(d.yaw);
    const spot = (side) => {
      const o = L[side];
      return { x: d.ox + ux * o.u + uz * o.s, z: d.oz + uz * o.u - ux * o.s, yaw: d.yaw + (side === 'B' ? Math.PI : 0) + o.turn, anim: o.anim };
    };
    const mine = spot(d.me);
    const dx = mine.x - p.x;
    const dz = mine.z - p.z;
    const far = Math.hypot(dx, dz);
    if (far > 0.01) {
      const st = Math.min(far, 2.6 * dt);
      p.x += (dx / far) * st;
      p.z += (dz / far) * st;
    }
    p.yaw = turnToward(p.yaw, mine.yaw, 7 * dt);
    this.char.rate = 9;
    if (p.pose !== mine.anim) {
      p.pose = mine.anim;
      p.actN++;
      this.char.play(mine.anim);
    }
    const theirs = spot(other(d.me));
    const npc = d.tgt.npc;
    if (npc) {
      npc.slideTo(theirs.x, theirs.z, 2.6, dt);
      npc.yaw = turnToward(npc.yaw, theirs.yaw, 7 * dt);
      npc.char.rate = 9;
      npc.setAnim(theirs.anim);
    } else if (d.tgt.av) d.tgt.av.ctl = d.phase === 'wait' ? null : theirs; // the avatar follows this instead of what its owner last sent
  },

  _matchNext() {
    const d = this.p.duel;
    d.round++;
    d.pick = null;
    d.their = null;
    d.result = null;
    d.phase = 'pick';
    d.t = 0;
  },

  _stepMatch(dt) {
    const p = this.p;
    const d = p.duel;
    const M = d.M;
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
          this._dropDuel('상대가 한 판을 그만두었습니다');
          return;
        }
      }
      // the challenged side takes the clock, and the end by the clock, from the challenger
      if (!d.mine && theirs) {
        if (Math.abs(M.left - theirs.tl) > 1.5) M.left = theirs.tl;
        if (theirs.e) {
          M.sc.A = theirs.sa;
          M.sc.B = theirs.sb;
          this._matchEnd(theirs.e, 'time');
        }
      }
    }
    if (d.phase === 'pick' || d.phase === 'reveal' || d.phase === 'move') M.left = Math.max(0, M.left - dt);
    this._matchPlace(dt);
    if (d.phase === 'wait') {
      if (theirs) {
        d.phase = 'intro';
        d.t = 0;
        this._matchIntro();
      } else if (d.t > 4) {
        this._dropDuel('상대가 응하지 않았습니다');
        return;
      }
    } else if (d.phase === 'intro') {
      if (d.t > MATCH.intro) {
        d.phase = 'pick';
        d.t = 0;
      }
    } else if (d.phase === 'pick') {
      if (M.left <= 0 && (d.mine || npc)) this._matchEnd(M.sc.A === M.sc.B ? 3 : M.sc.A > M.sc.B ? 1 : 2, 'time');
      else {
        if (!d.pick && d.t > MATCH.pick) d.pick = randomPick();
        if (npc) {
          if (d.pick && !d.their) d.their = this.npcPick();
        } else if (theirs && theirs.r === d.round && theirs.p) d.their = theirs.p;
        if (d.pick && d.their) {
          d.phase = 'reveal';
          d.t = 0;
          d.result = rpsResult(d.pick, d.their);
          if (this.h.sfx) this.h.sfx(d.result > 0 ? 'ding' : d.result < 0 ? 'thud' : 'beep');
        }
      }
    } else if (d.phase === 'reveal') {
      if (d.t > MATCH.reveal) {
        if (d.result === 0) this._matchNext();
        else {
          const W = d.result > 0 ? d.me : other(d.me);
          const was = M.pos;
          const r = advance(M, W);
          if (r.sub) this._matchSub(W);
          else {
            M.gain = r.gain;
            d.phase = 'move';
            d.t = 0;
            this.toast(`${this._matchName(W)}의 ${r.gain.label}!`, 2400);
            if (this.h.sfx && (was === 'stand' || r.gain.label === '스윕')) this.h.sfx('thud');
          }
        }
      }
    } else if (d.phase === 'move') {
      if (d.t > MATCH.move) {
        // the position was held: the points are given
        const g = M.gain;
        M.sc[g.who] += g.n;
        M.gain = null;
        this.toast(`${g.label} ${g.n}점 · ${M.sc[d.me]} : ${M.sc[other(d.me)]}`, 2600);
        if (this.h.sfx) this.h.sfx('beep');
        this._matchNext();
      }
    } else if (d.phase === 'end' && d.t > MATCH.end) {
      this._dropDuel();
      this._cool = 1.5;
      return;
    }
    this._duelView();
  },

  _matchIntro() {
    const d = this.p.duel;
    this.toast(`Combate! ${withName(d.name)} 한 판 · ${Math.round(d.M.total)}초`, 3200);
    if (this.h.sfx) this.h.sfx('whistle');
  },

  // On top in mount and the round is won: go for the finish. Which technique is settled by the
  // match itself, so both screens choose the same one.
  _matchSub(W) {
    const p = this.p;
    const d = p.duel;
    const kind = SUBS[hash(`${d.id}|${d.round}`) % SUBS.length];
    const iWin = W === d.me;
    const their = d.tgt.act;
    const myName = this.api.name();
    const bout = new Bout({
      id: `${d.id}-s${d.round}`, kind, atk: iWin ? p : their, def: iWin ? their : p,
      ox: d.ox, oz: d.oz, yaw: W === 'A' ? d.yaw : d.yaw + Math.PI,
      names: iWin ? [myName, d.name] : [d.name, myName], t: TECH.down,
    });
    bout.mine = true;
    bout.iWin = iWin;
    bout.tgt = d.tgt;
    bout.match = d;
    if (!iWin || d.tgt.npc) bout.judge = (b) => (b.m.d >= b.m.a + MARGIN ? 1 : 2);
    if (d.tgt.npc) bout.npcM = this.npcMash(iWin ? 'd' : 'a');
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
    d.M.sub = bout.id;
    this.bouts.push(bout);
    this._duelView();
    this.toast(iWin ? `마운트에서 ${KIND_OBJ[kind]} 노립니다!` : `${d.name}의 ${KIND_SUBJ[kind]} 들어옵니다!`, 3000);
  },

  // The submission attempt is over: a tap ends the match, an escape puts both back on their feet.
  _subDone(b) {
    const p = this.p;
    const d = p.duel;
    d.M.sub = null;
    p.mode = 'duel';
    p.pose = '';
    d.lost = 0;
    if (b.tapped) this._matchEnd((b.iWin ? d.me : other(d.me)) === 'A' ? 1 : 2, 'sub', b.kind);
    else {
      d.M.pos = 'stand';
      d.M.top = null;
      this._matchNext();
      if (b.escaped) this.toast('스탠딩에서 다시!', 2200);
    }
    this._matchPlace(0);
    this._duelView();
  },

  // e: 1 the challenger won, 2 the challenged, 3 a draw.
  _matchEnd(e, how, kind) {
    const d = this.p.duel;
    const M = d.M;
    if (d.phase === 'end') return;
    M.end = e;
    M.how = how;
    M.pos = 'stand';
    M.top = null;
    M.gain = null;
    d.phase = 'end';
    d.t = 0;
    const draw = e === 3;
    const iWon = !draw && (e === 1) === (d.me === 'A');
    // the points, the winner's first
    const ws = e === 2 ? 'B' : 'A';
    const score = `${M.sc[ws]} : ${M.sc[other(ws)]}`;
    const winner = draw ? '' : this._matchName(ws);
    if (how !== 'sub') {
      // a win by a tap has been counted already, at the tap
      if (iWon) this.streak++;
      else if (!draw) this.streak = 0;
      if (this.h.streak) this.h.streak(this.streak);
    }
    const text = draw ? `무승부 · ${score}` : how === 'sub' ? `${winner} 승 · ${KINDS[kind]}` : `${winner} 승 · ${score}`;
    this.toast(`한 판 종료 · ${text}`, 4600);
    this.results.unshift({ ox: d.ox, oz: d.oz, text: `한 판 · ${text}`, until: this.t + 14 });
    if (this.results.length > 8) this.results.length = 8;
    if (this.h.flash) this.h.flash({ text: draw ? '무승부' : iWon ? '승리!' : '패배', kind: iWon ? 'tap' : 'esc' });
    if (this.h.sfx) {
      this.h.sfx(iWon ? 'ding' : 'beep');
      if (this.world.name === 'arena') this.h.sfx('cheer');
    }
    this._duelView();
  },

  // For the HUD: null when no match is on.
  _matchInfo() {
    const d = this.p.duel;
    if (!d || d.kind !== 'match' || d.phase === 'wait') return null;
    const M = d.M;
    const top = M.top == null ? '' : M.top === d.me ? '내가 위' : '상대가 위';
    return {
      name: d.name, me: M.sc[d.me], them: M.sc[other(d.me)], left: Math.ceil(M.left), pos: POS_NAME[M.pos], top,
      key: M.pos, topMe: M.top == null ? null : M.top === d.me,
      phase: d.phase, end: M.end ? (M.end === 3 ? 'draw' : (M.end === 1) === (d.me === 'A') ? 'win' : 'lose') : '',
    };
  },

  // A match being fought inside a rectangle (mine, or one between others), for scoreboards.
  matchIn(x0, x1, z0, z1) {
    const inside = (o) => o.ox >= x0 && o.ox <= x1 && o.oz >= z0 && o.oz <= z1;
    const d = this.p.duel;
    if (d && d.kind === 'match' && d.phase !== 'wait' && inside(d)) {
      const M = d.M;
      const mine = this.api.name();
      return { a: d.mine ? mine : d.name, b: d.mine ? d.name : mine, sa: M.sc.A, sb: M.sc.B, left: Math.ceil(M.left), pos: POS_NAME[M.pos], end: M.end };
    }
    const list = this.peers();
    for (const av of list) {
      const du = av.du;
      if (!du || du.k !== 'match' || du.c !== 1 || !inside(du)) continue;
      let name = '상대';
      if (du.w[0] === 'n' && this.world.npcs[parseInt(du.w.slice(1), 10)]) name = this.world.npcs[parseInt(du.w.slice(1), 10)].name;
      else {
        const o = list.find((x) => x.id === du.w);
        if (o) name = o.name;
        else if (du.w === this.myPeer) name = this.api.name();
      }
      return { a: av.name, b: name, sa: du.sa, sb: du.sb, left: clamp(du.tl, 0, 999), pos: '', end: du.e };
    }
    return null;
  },
};
