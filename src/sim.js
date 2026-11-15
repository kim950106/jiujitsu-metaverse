// Game logic with no rendering or DOM: player movement, collisions, actions, zones, NPC updates,
// rock-paper-scissors duels and the two-person techniques that follow them.
import { BELTS, turnToward, clamp } from './util.js';
import { Character, SHRIMP, ROLL, BOW, TECH, GREET, SHAKA, BRIDGE, STANDUP } from './character.js';
import { Bout, KINDS, KIND_OBJ, KIND_SUBJ, SAYS, MARGIN, rpsResult, randomPick, isKind } from './tech.js';
import { MatchMixin, posCode } from './match.js';
import { RaceMixin } from './race.js';

const STEP = 0.72; // highest ledge the player can step onto
const HEIGHT = 1.75;
const R = 0.3;
const REACH = 1.7; // how close a partner must be to start a technique
const PICK_TIME = 7; // seconds to choose a hand before one is chosen at random
const GAP = 0.55; // each fighter stands this far from the midpoint during the duel
const SOLO = new Set(['bow', 'sit', 'shrimp', 'roll', 'shaka', 'bridge', 'standup']); // what doAction accepts
const ON_MAT = new Set(['shrimp', 'roll', 'bridge', 'standup']); // drills that need a mat under them

export class Sim {
  constructor(hooks = {}) {
    this.h = hooks;
    this.sel = { place: 'gym', belt: 'white', stripes: 0, gi: 'white', name: '' };
    this.p = {
      x: 0, y: 0, z: 0, yaw: 0, vy: 0, px: 0, pz: 0, mode: 'free', act: null, actT: 0, actN: 0,
      speed: 0, onMat: false, zones: new Set(), seat: null, seatT: 0, lockT: 0,
      duel: null, bout: null, medal: 0, race: null, raceOut: null, pose: '', photo: null,
    };
    this.char = new Character({ cast: true, player: true, blob: true });
    this.p.char = this.char; // the player state doubles as a Bout actor
    this.world = null;
    this.t = 0;
    this.bouts = []; // every technique in progress here, mine or someone else's
    this.results = []; // recent finishes, for scoreboards
    this.peers = () => []; // avatars of other people in this place (set by the network layer)
    this.myPeer = '';
    this.npcPick = () => randomPick();
    // how many times an NPC hammers during the struggle of a technique: as the one held it tries a
    // little (so a hold nobody tightens is sometimes lost), as the one holding somewhat more
    this.npcMash = (role) => (role === 'd' ? (Math.random() * 5) | 0 : 2 + ((Math.random() * 6) | 0));
    this.streak = 0; // techniques finished in a row without being tapped
    this._seq = 0;
    this._raced = new Set(); // races taken part in
    this._raceTold = new Set(); // other people's finishes already announced
    this._raceFin = new Map(); // race id -> who has been seen finishing it
    this._done = new Set();
    this._cool = 0;
    this._partner = undefined;
    this._toastAt = new Map();
    this._zoneLabel = null;
    this._prompt = null;
    this.api = this._makeApi();
    this.applySel();
  }

  _makeApi() {
    const s = this;
    return {
      get sel() { return s.sel; },
      get player() { return s.p; },
      char: s.char,
      toast: (m, ms) => s.toast(m, ms),
      sfx: (n) => { if (s.h.sfx) s.h.sfx(n); },
      isBlack: () => s.sel.belt === 'black',
      beltMinutes: () => BELTS[s.sel.belt].minutes,
      name: () => s.sel.name || '나',
      bow: () => s.doAction('bow', true),
      seat: (seat) => s.seat(seat),
      unseat: () => s.unseat(),
      lock: (sec) => { s.p.lockT = sec; },
      camera: (yaw, pitch, dist) => { if (s.h.camera) s.h.camera(yaw, pitch, dist); },
      medal: (place) => {
        s.p.medal = place === true ? 1 : place | 0;
        s.char.setMedal(s.p.medal);
      },
      openBelt: () => { if (s.h.openBelt) s.h.openBelt(); },
      open: (what) => { if (s.h.open) s.h.open(what); },
      // guestbook entries, newest first (empty where there is no guestbook)
      board: () => (s.h.board ? s.h.board() : []),
      race: () => s.startRace(),
      racing: () => !!s.p.race,
      matchIn: (x0, x1, z0, z1) => s.matchIn(x0, x1, z0, z1),
      // Is someone else already sitting on this seat?
      seatTaken: (id) => {
        for (const av of s.peers()) if (av.seat === id) return true;
        return false;
      },
      // The technique being fought inside a rectangle, and the most recent finish there.
      boutIn: (x0, x1, z0, z1) => s.bouts.find((b) => !b.done && b.ox >= x0 && b.ox <= x1 && b.oz >= z0 && b.oz <= z1) || null,
      lastIn: (x0, x1, z0, z1) => s.results.find((r) => r.ox >= x0 && r.ox <= x1 && r.oz >= z0 && r.oz <= z1) || null,
    };
  }

  applySel() {
    this.char.setLook({ belt: this.sel.belt, stripes: this.sel.stripes, gi: this.sel.gi });
  }

  toast(msg, ms) {
    const last = this._toastAt.get(msg);
    if (last != null && this.t - last < 2.6) return;
    this._toastAt.set(msg, this.t);
    if (this.h.toast) this.h.toast(msg, ms);
  }

  setWorld(world) {
    const p = this.p;
    this._dropDuel();
    for (const b of this.bouts) b.finish();
    this.bouts = [];
    this.results = [];
    this.world = world;
    p.zones = new Set();
    p.mode = 'free';
    p.act = null;
    p.seat = null;
    p.bout = null;
    p.race = null;
    p.raceOut = null;
    p.lockT = 0;
    p.vy = 0;
    p.medal = 0;
    this._zoneLabel = null;
    this._prompt = null;
    this._partner = undefined;
    this._onMat = undefined;
    this.char.setMedal(0);
    this.char.tech = null;
    this.char.play('loco');
    if (world) {
      p.x = world.spawn.x;
      p.z = world.spawn.z;
      p.y = 0;
      p.yaw = world.spawn.yaw;
      p.px = p.x;
      p.pz = p.z;
      world.scene.add(this.char.root);
      this.char.root.position.set(p.x, p.y, p.z);
      this.char.root.rotation.y = p.yaw;
      this.char.settle();
    }
  }

  _blocked(x, z, y) {
    const cs = this.world.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (x + R <= c.minX || x - R >= c.maxX || z + R <= c.minZ || z - R >= c.maxZ) continue;
      if (c.top <= y + STEP) continue;
      if (c.bottom >= y + HEIGHT) continue;
      return true;
    }
    return false;
  }

  _ground(x, z, y) {
    let g = 0;
    const cs = this.world.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (c.top <= y + STEP + 0.001 && c.top > g) g = c.top;
    }
    return g;
  }

  _move(dx, dz) {
    const p = this.p;
    if (dx && !this._blocked(p.x + dx, p.z, p.y)) p.x += dx;
    if (dz && !this._blocked(p.x, p.z + dz, p.y)) p.z += dz;
  }

  get busy() {
    const m = this.p.mode;
    return m === 'duel' || m === 'bout' || m === 'race';
  }

  doAction(name, auto) {
    const p = this.p;
    const c = this.char;
    if (!this.world || this.busy || !SOLO.has(name)) return;
    if (p.mode === 'seated') {
      if (!auto) this.toast('자리에서 일어나려면 이동하세요');
      return;
    }
    if (p.mode === 'action') return;
    if (name === 'sit') {
      p.actN++;
      if (p.mode === 'sit') {
        p.mode = 'free';
        c.play('loco');
      } else {
        p.mode = 'sit';
        c.play('sit');
      }
      return;
    }
    if (ON_MAT.has(name) && !p.onMat) {
      this.toast('이 동작은 매트 위에서 할 수 있습니다');
      return;
    }
    p.mode = 'action';
    p.act = name;
    p.actT = 0;
    p.actN++;
    c.play(name);
    if (name === 'shaka') c.say('🤙', SHAKA.dur);
  }

  // One of the quick phrases, shown as a bubble over the head here and for everyone in the place.
  say(i) {
    const p = this.p;
    if (!this.world || !SAYS[i] || this.t - (this._saidAt == null ? -9 : this._saidAt) < 1) return false;
    this._saidAt = this.t;
    p.sayN = (p.sayN || 0) + 1;
    p.say = { i, n: p.sayN, until: this.t + 4.2 };
    this.char.say(SAYS[i], 4);
    // whoever stands closest answers
    let best = null;
    let bd = 3.4;
    for (const n of this.world.npcs) {
      if (!n.lines || n.ctrl) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd && Math.abs(n.y - p.y) < 1) {
        bd = d;
        best = n;
      }
    }
    if (best) best.reply = { t: 0.9, text: best.lines[i] };
    return true;
  }

  _endAction() {
    this.p.mode = 'free';
    this.p.act = null;
    this.char.play('loco');
  }

  _stepAction(dt, mag) {
    const p = this.p;
    p.actT += dt;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    if (p.act === 'bow') {
      if (p.actT >= BOW.dur) this._endAction();
    } else if (p.act === 'shaka') {
      if (p.actT >= SHAKA.dur || (mag > 0.6 && p.actT > 0.4)) this._endAction();
    } else if (p.act === 'bridge') {
      if (p.actT >= BRIDGE.cycle * BRIDGE.reps || (mag > 0.6 && p.actT > 0.5)) this._endAction();
    } else if (p.act === 'standup') {
      const u = p.actT / STANDUP.dur;
      if (u > STANDUP.a && u < STANDUP.b) {
        const v = STANDUP.dist / ((STANDUP.b - STANDUP.a) * STANDUP.dur);
        this._move(-fx * v * dt, -fz * v * dt);
      }
      if (u >= 1) this._endAction();
    } else if (p.act === 'roll') {
      const u = p.actT / ROLL.dur;
      if (u > ROLL.a && u < ROLL.b) {
        const v = ROLL.dist / ((ROLL.b - ROLL.a) * ROLL.dur);
        this._move(fx * v * dt, fz * v * dt);
      }
      if (u >= 1) this._endAction();
    } else if (p.act === 'shrimp') {
      const u = (p.actT % SHRIMP.cycle) / SHRIMP.cycle;
      if (u > SHRIMP.a && u < SHRIMP.b) {
        const v = SHRIMP.dist / ((SHRIMP.b - SHRIMP.a) * SHRIMP.cycle);
        this._move(-fx * v * dt, -fz * v * dt);
      }
      if (p.actT >= SHRIMP.cycle * SHRIMP.reps || (mag > 0.6 && p.actT > 0.5)) this._endAction();
    } else this._endAction();
  }

  seat(seat) {
    const p = this.p;
    p.mode = 'seated';
    p.act = null;
    p.seat = seat;
    p.seatT = 0;
    p.seatArmed = false;
    p.x = seat.x;
    p.z = seat.z;
    p.yaw = seat.yaw;
    p.actN++;
    this.char.play('chair');
  }

  unseat() {
    const p = this.p;
    if (p.mode !== 'seated') return;
    const seat = p.seat;
    p.mode = 'free';
    p.seat = null;
    this.char.play('loco');
    if (seat && seat.onLeave) seat.onLeave(this.api);
  }

  /* ---------- techniques: find a partner, play rock-paper-scissors, winner applies it ---------- */

  // The closest person or sparring NPC within reach, or null.
  partner() {
    const p = this.p;
    let best = null;
    let bd = REACH;
    if (!this.world) return null;
    for (const n of this.world.npcs) {
      if (!n.spar || n.busy || n.ctrl) continue;
      if (Math.abs(n.y - p.y) > 0.6) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) {
        bd = d;
        best = { npc: n, act: n, name: n.name };
      }
    }
    for (const av of this.peers()) {
      if (av.busy || av.gone) continue;
      if (Math.abs(av.y - p.y) > 0.6) continue;
      const d = Math.hypot(av.x - p.x, av.z - p.z);
      if (d < bd) {
        bd = d;
        best = { av, act: av, name: av.name };
      }
    }
    return best;
  }

  _duelView() {
    const d = this.p.duel;
    if (!this.h.duel) return;
    const M = d && d.kind === 'match' ? this._matchInfo() : null;
    const key = d ? `${d.id}|${d.phase}|${d.round}|${d.pick}|${d.phase === 'reveal' ? d.their : ''}|${M ? `${M.me}|${M.them}|${M.left}|${M.pos}|${M.top}|${M.end}` : ''}` : '';
    if (key === this._duelKey) return;
    this._duelKey = key;
    if (!d) {
      this.h.duel(null);
      return;
    }
    this.h.duel({
      kind: d.kind, name: d.name, mine: d.mine, round: d.round, phase: d.phase,
      pick: d.pick, their: d.phase === 'reveal' ? d.their : null, result: d.result,
      left: d.phase === 'pick' ? Math.max(0, PICK_TIME - d.t) : 0, total: PICK_TIME,
      match: M, // a points match: score, clock and position (null for a single technique)
    });
  }

  // Player pressed a technique button.
  // kind: a technique, or 'match' for a points match.
  challenge(kind) {
    const p = this.p;
    const match = kind === 'match';
    if (!this.world || !(match || isKind(kind)) || this.busy) return false;
    if (p.mode === 'seated' || p.mode === 'action') return false;
    if (!p.onMat) {
      this.toast(match ? '한 판은 매트 위에서 붙을 수 있습니다' : '기술은 매트 위에서 걸 수 있습니다');
      return false;
    }
    if (this._cool > 0) return false;
    const tg = this.partner();
    if (!tg) {
      this.toast('가까이에 상대가 없습니다. 상대에게 붙어서 눌러 주세요');
      return false;
    }
    const o = tg.act;
    this._beginDuel({
      id: `${this.myPeer || 'solo'}-${++this._seq}`, kind, tgt: tg, name: tg.name, mine: true, round: 1,
      phase: tg.av ? 'wait' : match ? 'intro' : 'pick', ox: (p.x + o.x) / 2, oz: (p.z + o.z) / 2, yaw: Math.atan2(o.x - p.x, o.z - p.z),
    });
    if (match && !tg.av) this._matchIntro();
    if (tg.npc) {
      tg.npc.busy = true;
      tg.npc.back = false;
      tg.npc.setAnim('stance');
    }
    return true;
  }

  // Someone else challenged this player (called by the network layer).
  acceptDuel(av, du) {
    const p = this.p;
    if (!this.world || this.busy || p.mode === 'seated' || p.mode === 'action') return false;
    if (this._done.has(du.id) || this._cool > 0) return false;
    if (Math.hypot(du.ox - p.x, du.oz - p.z) > 3) return false;
    const match = du.k === 'match';
    this._beginDuel({
      id: du.id, kind: du.k, tgt: { av, act: av, name: av.name }, name: av.name, mine: false, round: du.r || 1,
      phase: match ? 'intro' : 'pick', ox: du.ox, oz: du.oz, yaw: du.yw,
    });
    if (match) this._matchIntro();
    else this.toast(`${av.name} 님이 ${KINDS[du.k]} 승부를 걸었습니다`);
    return true;
  }

  _beginDuel(d) {
    const p = this.p;
    d.t = 0;
    d.pick = null;
    d.their = null;
    d.result = null;
    d.lost = 0;
    p.duel = d;
    p.mode = 'duel';
    p.act = null;
    this.char.play('stance');
    this._done.add(d.id);
    if (d.kind === 'match') this._matchInit(d);
    this._duelView();
  }

  pick(hand) {
    const d = this.p.duel;
    if (!d || d.phase !== 'pick' || d.pick || !'srp'.includes(hand) || hand.length !== 1) return;
    d.pick = hand;
    this._duelView();
  }

  _dropDuel(msg) {
    const p = this.p;
    const d = p.duel;
    if (!d) return;
    p.duel = null;
    if (d.kind === 'match') {
      // bodies go back to moving at their own pace, and the other person's avatar to its owner
      this.char.rate = 20;
      p.pose = '';
      if (d.tgt.npc) d.tgt.npc.char.rate = 20;
      if (d.tgt.av) d.tgt.av.ctl = null;
    }
    if (d.tgt.npc) d.tgt.npc.release();
    if (p.mode === 'duel') {
      p.mode = 'free';
      p.actN++;
      this.char.play('loco');
    }
    this._cool = 1;
    this._duelView();
    if (msg) this.toast(msg);
  }

  // Player backed out before choosing.
  cancelDuel() {
    const d = this.p.duel;
    if (!d || this.p.mode !== 'duel') return;
    if (d.kind === 'match') {
      if (d.phase !== 'end') this._dropDuel('한 판을 그만두었습니다');
    } else if (d.phase !== 'reveal') this._dropDuel('승부를 취소했습니다');
  }

  _stepDuel(dt) {
    const p = this.p;
    const d = p.duel;
    if (d.kind === 'match') {
      this._stepMatch(dt);
      return;
    }
    d.t += dt;
    const ux = Math.sin(d.yaw);
    const uz = Math.cos(d.yaw);
    const side = d.mine ? -1 : 1; // the challenger stands on the near side of the line
    const tx = d.ox + ux * GAP * side;
    const tz = d.oz + uz * GAP * side;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const far = Math.hypot(dx, dz);
    if (far > 0.02) {
      const st = Math.min(far, 2.4 * dt);
      p.x += (dx / far) * st;
      p.z += (dz / far) * st;
    }
    p.yaw = turnToward(p.yaw, d.mine ? d.yaw : d.yaw + Math.PI, 10 * dt);
    const npc = d.tgt.npc;
    const av = d.tgt.av;
    if (npc) {
      npc.slideTo(d.ox + ux * GAP, d.oz + uz * GAP, 2.4, dt);
      npc.yaw = turnToward(npc.yaw, d.yaw + Math.PI, 10 * dt);
    }
    if (av && av.gone) {
      this._dropDuel('상대가 자리를 떠났습니다');
      return;
    }
    const theirs = av && av.du && av.du.id === d.id ? av.du : null;
    if (d.phase === 'wait') {
      if (theirs) {
        d.phase = 'pick';
        d.t = 0;
        this._duelView();
      } else if (d.t > 4) this._dropDuel('상대가 응하지 않았습니다');
      return;
    }
    if (d.phase === 'pick') {
      if (!d.pick && d.t > PICK_TIME) d.pick = randomPick();
      if (npc) {
        if (d.pick && !d.their) d.their = this.npcPick();
      } else if (theirs) {
        d.lost = 0;
        if (theirs.r === d.round && theirs.p) d.their = theirs.p;
      } else if (!(av && av.bt && av.bt.id === d.id)) {
        d.lost += dt;
        if (d.lost > 3) {
          this._dropDuel('상대가 승부를 그만두었습니다');
          return;
        }
      }
      if (d.pick && d.their) {
        d.phase = 'reveal';
        d.t = 0;
        d.result = rpsResult(d.pick, d.their);
        if (this.h.sfx) this.h.sfx(d.result > 0 ? 'ding' : d.result < 0 ? 'thud' : 'beep');
      }
      this._duelView();
      return;
    }
    if (d.t > 1.6) {
      if (d.result === 0) {
        d.round++;
        d.pick = null;
        d.their = null;
        d.result = null;
        d.phase = 'pick';
        d.t = 0;
        this._duelView();
      } else this._startBout(d.result > 0);
    }
  }

  _startBout(iWin) {
    const p = this.p;
    const d = p.duel;
    const other = d.tgt.act;
    const myName = this.api.name();
    // The duel line runs from the challenger to the challenged; the attacker faces along it.
    const atkIsChallenger = iWin === d.mine;
    const bout = new Bout({
      id: d.id, kind: d.kind, atk: iWin ? p : other, def: iWin ? other : p,
      ox: d.ox, oz: d.oz, yaw: atkIsChallenger ? d.yaw : d.yaw + Math.PI,
      names: iWin ? [myName, d.name] : [d.name, myName],
    });
    bout.mine = true;
    bout.iWin = iWin;
    bout.tgt = d.tgt;
    // The struggle is decided where the defender plays; against an NPC, here.
    if (!iWin || d.tgt.npc) bout.judge = (b) => (b.m.d >= b.m.a + MARGIN ? 1 : 2);
    if (d.tgt.npc) bout.npcM = this.npcMash(iWin ? 'd' : 'a');
    if (d.tgt.av) d.tgt.av.bout = bout;
    p.duel = null;
    p.bout = bout;
    p.mode = 'bout';
    this.bouts.push(bout);
    this._duelView();
    this.toast(iWin ? `이겼습니다! ${d.name}에게 ${KIND_OBJ[d.kind]} 겁니다` : `졌습니다. ${d.name}의 ${KIND_SUBJ[d.kind]} 들어옵니다`, 3200);
  }

  // A technique between two other bodies (other people, or a person and an NPC), shown here too.
  addBout(bout) {
    this.bouts.push(bout);
    return bout;
  }

  // The big button during the struggle of a technique: one press tightens or resists.
  mash() {
    const b = this.p.bout;
    if (!b || !b.open || this.t - (this._mashAt == null ? -1 : this._mashAt) < 0.03) return false;
    this._mashAt = this.t;
    const r = b.iWin ? 'a' : 'd';
    if (b.m[r] < 99) b.m[r]++;
    return true;
  }

  _mashView() {
    if (!this.h.mash) return;
    const b = this.p.bout;
    const on = !!b && b.open;
    const left = on ? clamp((TECH.judge - b.t) / (TECH.judge - TECH.move), 0, 1) : 0;
    const key = on ? `${b.id}|${b.m.a}|${b.m.d}|${Math.ceil(left * 10)}` : '';
    if (key === this._mashKey) return;
    this._mashKey = key;
    this.h.mash(on ? { role: b.iWin ? 'a' : 'd', a: b.m.a, d: b.m.d, left, margin: MARGIN } : null);
  }

  _stepBouts(dt) {
    const p = this.p;
    const say = (n) => { if (this.h.sfx) this.h.sfx(n); };
    for (let i = this.bouts.length - 1; i >= 0; i--) {
      const b = this.bouts[i];
      const before = b.t;
      if (b.mine && !b.done) {
        // the other side's presses: a person's arrive with their state, an NPC's are paced here
        const their = b.iWin ? 'd' : 'a';
        const bt = b.tgt.av && b.tgt.av.bt && b.tgt.av.bt.id === b.id ? b.tgt.av.bt : null;
        if (bt) {
          if (bt.m > b.m[their]) b.m[their] = bt.m;
          if (bt.e && !b.judge) b.settle(bt.e);
        }
        if (b.npcM != null) b.m[their] = Math.round(b.npcM * clamp((b.t - TECH.move) / (TECH.judge - TECH.move), 0, 1));
      }
      if (b.cancel) b.finish();
      else b.update(dt);
      const crossed = (at) => before < at && b.t >= at;
      const near = b.mine || Math.hypot(b.ox - p.x, b.oz - p.z) < 8;
      if (b.mine && !b.skip) {
        if (crossed(GREET.slap)) say('slap');
        if (crossed(GREET.bump)) say('bump');
      }
      if (b.mine && crossed(TECH.down)) say('thud');
      if (crossed(TECH.tap) && near) {
        const kind = KINDS[b.kind];
        if (b.outcome === 1) {
          this.toast(`탈출! ${b.names[1]} 님이 ${kind}에서 빠져나왔습니다`, 3200);
          if (b.mine) {
            say('ding');
            if (this.h.flash) this.h.flash({ text: '탈출!', kind: 'esc' });
          }
        } else {
          if (b.mine) {
            if (b.iWin) this.streak++;
            else this.streak = 0;
            if (this.h.streak) this.h.streak(this.streak);
            say('tap');
            if (this.h.flash) this.h.flash({ text: '탭!', kind: 'tap' });
          }
          if (this.world.name === 'arena') say('cheer');
          this.toast(`탭! ${b.names[0]}의 ${kind} 성공${b.mine && b.iWin && this.streak >= 2 ? ` · ${this.streak}연승` : ''}`, 3200);
        }
      }
      if (!b.done) continue;
      this.bouts.splice(i, 1);
      if (b.tapped || b.escaped) {
        this.results.unshift({ ox: b.ox, oz: b.oz, text: b.tapped ? `${b.names[0]} 승 · ${KINDS[b.kind]}` : `${b.names[1]} 탈출 · ${KINDS[b.kind]}`, until: this.t + 12 });
        if (this.results.length > 8) this.results.length = 8;
      }
      if (b.onDone) b.onDone(b);
      if (b.mine) {
        p.bout = null;
        if (b.tgt.av && b.tgt.av.bout === b) b.tgt.av.bout = null;
        if (b.match && p.duel === b.match) this._subDone(b); // a finish inside a points match: the match goes on or ends
        else {
          if (p.mode === 'bout') p.mode = 'free';
          this.char.play('loco');
          if (b.tgt.npc) b.tgt.npc.release();
          this._cool = 1.5;
        }
      }
    }
    while (this.results.length && this.results[this.results.length - 1].until < this.t) this.results.pop();
    this._mashView();
  }

  // What the network layer publishes about this player.
  netState() {
    const p = this.p;
    const d = p.duel;
    const b = p.bout;
    const anim = p.mode === 'sit' ? 'sit' : p.mode === 'seated' ? 'chair' : p.mode === 'action' ? p.act : p.mode === 'duel' ? p.pose || 'stance' : p.mode === 'bout' ? 'tech' : p.mode === 'race' ? 'shrimpf' : 'loco';
    const M = d && d.kind === 'match' ? d.M : null;
    const r = p.race;
    const out = p.raceOut && p.raceOut.until > this.t ? p.raceOut : null;
    const who = (tg) => (tg.av ? tg.av.id : `n${tg.npc.id}`);
    return {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, anim, actN: p.actN, seat: p.mode === 'seated' && p.seat ? p.seat.id || '' : '', medal: p.medal,
      say: p.say && p.say.until > this.t ? p.say.n * 8 + p.say.i + 1 : 0,
      du: d ? Object.assign(
        { id: d.id, w: who(d.tgt), k: d.kind, r: d.round, p: d.pick, c: d.mine ? 1 : 0, ox: d.ox, oz: d.oz, yw: d.yaw },
        // a points match also tells the score, the clock and, from the challenger, how it ended
        M ? { sa: M.sc.A, sb: M.sc.B, tl: Math.ceil(M.left), e: M.end, ps: posCode(M) } : null,
      ) : null,
      // a shrimp race: f is 0 while racing, the time in hundredths once finished
      race: r && r.phase !== 'done' ? { id: r.id, f: 0 } : out ? { id: out.id, f: out.f } : null,
      photo: p.photo && p.photo.until > this.t ? p.photo.n : 0,
      // m: my presses in the struggle; e: how it ended (1 escape, 2 tap), told only by the side that decides
      // s: started on the ground, from the mount of a points match
      bt: b ? { id: b.id, w: who(b.tgt), k: b.kind, r: b.iWin ? 'a' : 'd', ox: b.ox, oz: b.oz, yw: b.yaw, m: b.m[b.iWin ? 'a' : 'd'], e: b.judge ? b.outcome : 0, s: b.ground ? 1 : null } : null,
      streak: this.streak,
    };
  }

  _zones() {
    const p = this.p;
    const w = this.world;
    const inside = [];
    for (let i = 0; i < w.zones.length; i++) {
      const z = w.zones[i];
      if (p.x < z.minX || p.x > z.maxX || p.z < z.minZ || p.z > z.maxZ) continue;
      if (z.minY != null && p.y < z.minY) continue;
      if (z.maxY != null && p.y > z.maxY) continue;
      inside.push(z);
    }
    if (!this.busy) {
      for (const z of inside) {
        if (!p.zones.has(z) && z.canEnter && z.canEnter(this.api) === false) {
          p.x = p.px;
          p.z = p.pz;
          return;
        }
      }
    }
    const now = new Set(inside);
    for (const z of inside) if (!p.zones.has(z) && z.onEnter && !this.busy) z.onEnter(this.api);
    for (const z of p.zones) if (!now.has(z) && z.onLeave) z.onLeave(this.api);
    p.zones = now;
    let best = null;
    p.onMat = false;
    for (const z of inside) {
      if (z.surface === 'mat') p.onMat = true;
      if (z.label && (!best || (z.prio || 0) > (best.prio || 0))) best = z;
    }
    if (p.onMat !== this._onMat) {
      this._onMat = p.onMat;
      if (this.h.mat) this.h.mat(p.onMat);
    }
    const label = best ? best.label : w.label;
    if (label !== this._zoneLabel) {
      this._zoneLabel = label;
      if (this.h.zone) this.h.zone(label);
    }
  }

  _interact() {
    const p = this.p;
    let best = null;
    let bd = 1e9;
    if (!this.busy) {
      for (const it of this.world.interact) {
        if (it.minY != null && p.y < it.minY) continue;
        if (it.when && !it.when(this.api)) continue;
        const d = Math.hypot(p.x - it.x, p.z - it.z);
        if (d < it.r && d < bd) {
          bd = d;
          best = it;
        }
      }
    }
    if (best !== this._prompt) {
      this._prompt = best;
      if (this.h.prompt) this.h.prompt(best);
    }
    // tell the HUD whether a technique can be started right now, and on whom
    const tg = this.busy || p.mode === 'seated' ? null : this.partner();
    const key = tg ? `${tg.name}|${p.onMat ? 1 : 0}` : '';
    if (key !== this._partner) {
      this._partner = key;
      if (this.h.partner) this.h.partner(tg ? { name: tg.name, onMat: p.onMat } : null);
    }
  }

  usePrompt() {
    if (this._prompt && this._prompt.action) this._prompt.action(this.api);
  }

  // A group photo is about to be taken here: the others in the place are told, so they can pose.
  photoCall() {
    const p = this.p;
    p.photoN = (p.photoN || 0) + 1;
    p.photo = { n: p.photoN, until: this.t + 5 };
  }

  // inp: { mx, my, run, camYaw } with mx/my in camera space (-1..1)
  step(dt, inp) {
    const p = this.p;
    const w = this.world;
    if (!w) return;
    this.t += dt;
    p.px = p.x;
    p.pz = p.z;
    let speed = 0;
    const mag = Math.hypot(inp.mx, inp.my);
    if (p.lockT > 0) p.lockT -= dt;
    if (this._cool > 0) this._cool -= dt;
    if (p.mode === 'sit' && mag > 0.3) {
      p.mode = 'free';
      p.actN++;
      this.char.play('loco');
    }
    if (p.mode === 'seated') {
      // stand up only on a fresh push: the key that walked the player in must be released first
      p.seatT += dt;
      if (mag < 0.2) p.seatArmed = true;
      else if (mag > 0.5 && p.seatArmed && p.seatT > 0.5) this.unseat();
    }
    if (p.mode === 'free' && !(p.lockT > 0) && mag > 0.08) {
      const fx = -Math.sin(inp.camYaw);
      const fz = -Math.cos(inp.camYaw);
      let dx = -fz * inp.mx + fx * inp.my;
      let dz = fx * inp.mx + fz * inp.my;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const sp = (inp.run ? 4.6 : 2.3) * Math.min(1, mag);
      this._move(dx * sp * dt, dz * sp * dt);
      p.yaw = turnToward(p.yaw, Math.atan2(dx, dz), 11 * dt);
      speed = sp;
    }
    if (p.mode === 'action') this._stepAction(dt, mag);
    if (p.mode === 'race') this._stepRace(dt, mag);
    if (p.mode === 'duel') this._stepDuel(dt);
    this._stepBouts(dt);

    const g = this._ground(p.x, p.z, p.y);
    if (g > p.y) {
      p.y = Math.min(g, p.y + 5 * dt);
      p.vy = 0;
    } else if (g < p.y) {
      p.vy -= 18 * dt;
      p.y += p.vy * dt;
      if (p.y <= g) {
        p.y = g;
        p.vy = 0;
      }
    } else p.vy = 0;

    if (p.mode !== 'seated' && !this.busy) {
      for (let i = 0; i < w.npcs.length; i++) {
        const n = w.npcs[i];
        if (!n.solid || n.busy) continue;
        const dx = p.x - n.x;
        const dz = p.z - n.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.36 && d2 > 1e-6 && Math.abs(n.y - p.y) < 1) {
          const d = Math.sqrt(d2);
          const push = 0.6 - d;
          const nx = p.x + (dx / d) * push;
          const nz = p.z + (dz / d) * push;
          if (!this._blocked(nx, nz, p.y)) {
            p.x = nx;
            p.z = nz;
          }
        }
      }
    }

    this._zones();
    this._interact();

    this.char.root.position.set(p.x, p.y, p.z);
    this.char.root.rotation.y = p.yaw;
    this.char.update(dt, p.mode === 'free' ? speed : 0);
    p.speed = speed;

    for (let i = 0; i < w.npcs.length; i++) w.npcs[i].update(dt);
    for (let i = 0; i < w.tickers.length; i++) w.tickers[i](dt, this.t);
  }
}

Object.assign(Sim.prototype, MatchMixin, RaceMixin);
