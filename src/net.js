/* global window, location, BroadcastChannel */
// Other people in the same place. Everything is sent as presence: one small object per person,
// shared with whoever has the page open right now. On the claude.ai page that goes through the
// platform's realtime room; on a copy hosted elsewhere it goes through public relays (relay.js).
// Nothing here is trusted: every field that arrives is checked before it is used.
import { Character, TECH } from './character.js';
import { Bout, isKind, SAYS } from './tech.js';
import { layout, posFrom } from './match.js';
import { BELTS, GIS, clamp, turnToward, cleanName } from './util.js';
import { relayRoom, hostKind } from './relay.js';

const SEND_EVERY = 0.1; // seconds between presence updates
const ANIMS = new Set([
  'loco', 'sit', 'chair', 'bow', 'shrimp', 'roll', 'stance', 'tech', 'shaka', 'bridge', 'standup', 'shrimpf',
  'guardTop', 'guardBottom', 'sideTop', 'sideBottom', 'mountTop', 'mountBottom', 'win',
]);
const DRILLS = new Set(['roll', 'shrimp', 'bridge', 'standup', 'shrimpf']); // in the middle of one, nobody is a partner
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : '');

export const mockWanted = () => {
  try { return /[?&]mock=1/.test(location.search); } catch (e) { return false; }
};

export { cleanName };

function cleanLink(d, bout) {
  if (!d || typeof d !== 'object') return null;
  const id = str(d.id, 64);
  const w = str(d.w, 64);
  // a duel is over a technique or, as 'match', the start of a points match; a bout is always a technique
  if (!id || !w || !(isKind(d.k) || (!bout && d.k === 'match'))) return null;
  if (!num(d.ox) || !num(d.oz) || !num(d.yw)) return null;
  const o = { id, w, k: d.k, ox: clamp(d.ox, -60, 60), oz: clamp(d.oz, -60, 60), yw: d.yw };
  if (bout) {
    if (d.r !== 'a' && d.r !== 'd') return null;
    o.r = d.r;
    o.m = num(d.m) ? clamp(d.m | 0, 0, 99) : 0;
    o.e = d.e === 1 || d.e === 2 ? d.e : 0;
    o.s = d.s === 1 ? 1 : 0;
  } else {
    o.r = num(d.r) ? clamp(d.r | 0, 1, 99) : 1;
    o.p = d.p === 's' || d.p === 'r' || d.p === 'p' ? d.p : null;
    o.c = d.c === 1 ? 1 : 0;
    if (d.k === 'match') {
      o.sa = num(d.sa) ? clamp(d.sa | 0, 0, 999) : 0;
      o.sb = num(d.sb) ? clamp(d.sb | 0, 0, 999) : 0;
      o.tl = num(d.tl) ? clamp(d.tl | 0, 0, 999) : 0;
      o.e = d.e === 1 || d.e === 2 || d.e === 3 ? d.e : 0;
      o.ps = num(d.ps) ? clamp(d.ps | 0, 0, 6) : 0;
    }
  }
  return o;
}

// Presence object -> checked state, or null when it is not from this version of the page.
function clean(pr) {
  if (!pr || typeof pr !== 'object' || pr.v !== 1) return null;
  const pl = pr.pl === 'gym' || pr.pl === 'arena' ? pr.pl : '';
  const st = {
    name: cleanName(pr.n) || '수련생',
    belt: BELTS[pr.b] ? pr.b : 'white',
    stripes: num(pr.s) ? clamp(pr.s | 0, 0, 4) : 0,
    gi: GIS[pr.g] ? pr.g : 'white',
    pl,
    x: 0, y: 0, z: 0, yaw: 0, anim: 'loco', actN: 0, seat: '', medal: 0, du: null, bt: null, say: 0, race: null, photo: 0,
    streak: num(pr.k) ? clamp(pr.k | 0, 0, 99) : 0,
  };
  if (!pl) return st;
  if (!num(pr.x) || !num(pr.z)) return null;
  st.x = clamp(pr.x, -60, 60);
  st.z = clamp(pr.z, -60, 60);
  st.y = num(pr.y) ? clamp(pr.y, 0, 12) : 0;
  st.yaw = num(pr.w) ? pr.w : 0;
  st.anim = ANIMS.has(pr.a) ? pr.a : 'loco';
  st.actN = num(pr.i) ? pr.i | 0 : 0;
  st.seat = str(pr.st, 24);
  st.medal = num(pr.md) ? clamp(pr.md | 0, 0, 3) : 0;
  st.say = num(pr.sy) ? clamp(pr.sy | 0, 0, 1e7) : 0;
  st.du = cleanLink(pr.du, false);
  st.bt = cleanLink(pr.bt, true);
  const rc = pr.rc;
  st.race = rc && typeof rc === 'object' && str(rc.id, 64) && num(rc.f) ? { id: rc.id, f: clamp(rc.f | 0, 0, 60000) } : null;
  st.photo = num(pr.ph) ? clamp(pr.ph | 0, 0, 1e6) : 0;
  return st;
}

class Avatar {
  constructor(id, st, scene) {
    this.id = id;
    this.scene = scene;
    this.char = new Character({ belt: st.belt, stripes: st.stripes, gi: st.gi, medal: true, blob: true });
    this.x = st.x;
    this.y = st.y;
    this.z = st.z;
    this.yaw = st.yaw;
    this.speed = 0;
    this.anim = '';
    this.actN = -1;
    this.name = '';
    this.look = '';
    this.bout = null;
    this.ctl = null; // { x, z, yaw, anim } while a points match on this screen places the body itself
    this.ctlAnim = '';
    this.gone = false;
    scene.add(this.char.root);
    this.apply(st);
    this.char.root.position.set(this.x, this.y, this.z);
    this.char.root.rotation.y = this.yaw;
    this.char.settle();
  }

  apply(st) {
    this.st = st;
    const look = `${st.belt}|${st.stripes}|${st.gi}`;
    if (look !== this.look) {
      this.look = look;
      this.char.setLook({ belt: st.belt, stripes: st.stripes, gi: st.gi });
    }
    if (st.name !== this.name) {
      this.name = st.name;
      this.char.drawPatch(null, st.name);
    }
    // a run of wins is shown beside the name
    const label = st.streak >= 2 ? `${st.name} · ${st.streak}연승` : st.name;
    if (label !== this.labelText) {
      this.labelText = label;
      this.char.setLabel(label);
    }
    this.char.setMedal(st.medal);
    if (st.say !== this.said) {
      this.said = st.say;
      const line = st.say ? SAYS[(st.say % 8) - 1] : null;
      if (line) this.char.say(line, 4);
    }
    this.seat = st.seat;
    this.du = st.du;
    this.bt = st.bt;
    this.race = st.race;
    if (!this.bout && !this.ctl && (st.anim !== this.anim || st.actN !== this.actN)) {
      const act = st.anim === 'tech' ? 'stance' : st.anim;
      if (act !== this.anim || st.actN !== this.actN) {
        this.char.play(act);
        if (act === 'shaka') this.char.say('🤙', 1.7);
      }
      this.anim = st.anim;
      this.actN = st.actN;
    }
  }

  // Not available as a partner: already in a duel or technique, seated, or in the middle of a drill.
  get busy() {
    return !!(this.du || this.bt || this.bout) || this.anim === 'chair' || this.anim === 'tech' || DRILLS.has(this.anim);
  }

  update(dt) {
    const st = this.st;
    if (this.bout && this.bout.done) {
      this.bout = null;
      this.anim = '';
    }
    if (this.ctl && !this.bout) {
      const c = this.ctl;
      const k = 1 - Math.exp(-11 * dt);
      this.x += (c.x - this.x) * k;
      this.z += (c.z - this.z) * k;
      this.y += (st.y - this.y) * k;
      this.yaw = turnToward(this.yaw, c.yaw, 9 * dt);
      this.speed = 0;
      this.char.rate = 9;
      if (this.ctlAnim !== c.anim) {
        this.ctlAnim = c.anim;
        this.char.play(c.anim);
      }
    } else if (!this.bout) {
      if (this.ctlAnim) {
        // let go by the match: back to what its owner sends
        this.ctlAnim = '';
        this.char.rate = 20;
        this.anim = '';
        this.apply(st);
      }
      const k = 1 - Math.exp(-11 * dt);
      const px = this.x;
      const pz = this.z;
      const far = Math.hypot(st.x - this.x, st.z - this.z);
      if (far > 6) {
        this.x = st.x;
        this.z = st.z;
      } else {
        this.x += (st.x - this.x) * k;
        this.z += (st.z - this.z) * k;
      }
      this.y += (st.y - this.y) * k;
      this.yaw = turnToward(this.yaw, st.yaw, 9 * dt);
      const v = dt > 0 ? Math.hypot(this.x - px, this.z - pz) / dt : 0;
      this.speed += (Math.min(v, 5) - this.speed) * Math.min(1, 8 * dt);
    }
    this.char.root.position.set(this.x, this.y, this.z);
    this.char.root.rotation.y = this.yaw;
    this.char.update(dt, this.anim === 'loco' && !this.bout && !this.ctl ? this.speed : 0);
  }

  dispose() {
    this.gone = true;
    if (this.bout) this.bout.cancel = true;
    this.scene.remove(this.char.root);
    this.char.dispose();
  }
}

// Stand-in room for testing with two tabs of the same browser (?mock=1). Never used otherwise.
function mockRoom() {
  if (typeof BroadcastChannel === 'undefined') return null;
  const id = `m${Math.random().toString(36).slice(2, 10)}`;
  const ch = new BroadcastChannel('bjj-mock-room');
  const others = new Map();
  const hs = new Set();
  let mine = {};
  const me = () => ({ peer: id, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() });
  const snap = () => [me()].concat(Array.from(others, ([k, v]) => ({ peer: k, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v, updatedAt: Date.now() })));
  const fire = (left) => {
    const peers = snap();
    for (const h of hs) h({ peers, joined: [], updated: peers, left: left || [] });
  };
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.id === id) return;
    if (m.bye) {
      others.delete(m.id);
      fire([{ peer: m.id }]);
      return;
    }
    const fresh = !others.has(m.id);
    others.set(m.id, m.presence || {});
    if (fresh || m.hello) ch.postMessage({ id, presence: mine });
    fire();
  };
  ch.postMessage({ id, presence: mine, hello: 1 });
  window.addEventListener('pagehide', () => ch.postMessage({ id, bye: 1 }));
  return {
    presence(patch) {
      const next = Object.assign({}, mine);
      for (const k of Object.keys(patch)) {
        if (patch[k] === null) delete next[k];
        else next[k] = patch[k];
      }
      mine = next;
      ch.postMessage({ id, presence: mine });
      fire();
      return Promise.resolve();
    },
    onPeers(h) {
      hs.add(h);
      Promise.resolve().then(() => fire());
      return () => hs.delete(h);
    },
    peers: snap,
    connected: () => true,
    onConnection(h) {
      Promise.resolve().then(() => h(true));
      return () => {};
    },
  };
}

export class Net {
  constructor(game, hooks = {}) {
    this.g = game;
    this.sim = game.sim;
    this.h = hooks;
    this.room = null;
    this.avatars = new Map();
    this.list = [];
    this.raw = [];
    this.place = '';
    this.acc = 0;
    this.last = '';
    this.shown = new Set(); // techniques already played here, so a lingering notice does not replay one
    this.held = new Map(); // NPC -> { av, du }: held here in somebody else's points match
    this.state = 'off'; // off: no room for this visitor; wait: connecting; on: connected
    this.mode = 'off'; // claude: platform room; relay: public relays; mock: test stand-in
    this.host = 'claude';
    this.relayUp = -1;
    this.poll = 0;
    this.placeAt = 0;
    this.greet = false;
    this.said = new Map(); // name -> time of the last "walked in" notice, so app switching does not repeat it
    this.sim.peers = () => this.list;
  }

  async start() {
    await null; // never call back into the page from inside the game's own constructor
    let room = null;
    let mode = 'off';
    let hosted = false; // served as a claude.ai page, where the platform decides who may connect
    try {
      const c = window.claude;
      hosted = !!(c && typeof c.use === 'function');
      if (hosted) room = await c.use('room');
    } catch (e) {
      room = null;
    }
    if (room) mode = 'claude';
    if (!room && mockWanted()) {
      room = mockRoom();
      if (room) mode = 'mock';
    }
    this.host = hosted ? 'claude' : hostKind();
    if (!room && this.host === 'web') {
      room = relayRoom();
      if (room) mode = 'relay';
    }
    this.mode = mode;
    if (mode === 'relay' && this.g.guest) this.g.guest.attach(room); // the guestbook rides on the same relays
    if (!room) {
      this._state('off');
      this._people();
      return;
    }
    this.room = room;
    const dead = () => {
      this.room = null;
      this.mode = 'off';
      this._clear();
      this._state('off');
      this._people();
    };
    try {
      room.onPeers((ch) => this._onPeers(ch), dead);
      if (room.onConnection) {
        room.onConnection((on) => {
          this._state(on ? 'on' : 'wait');
          this._people();
        }, () => {});
      }
      this._state(room.connected && room.connected() ? 'on' : 'wait');
      this._people();
    } catch (e) {
      dead();
    }
  }

  _state(s) {
    if (s === this.state) return;
    this.state = s;
    if (this.h.status) this.h.status(s);
  }

  _clear() {
    for (const av of this.avatars.values()) av.dispose();
    this.avatars.clear();
    this.list = [];
    for (const npc of this.held.keys()) {
      npc.char.rate = 20;
      npc.release();
    }
    this.held.clear();
  }

  // Called when the player walks into a place or goes back to the start screen ('').
  setPlace(place) {
    this._clear();
    this.place = place || '';
    this.placeAt = Date.now();
    this.greet = !!place;
    this.last = '';
    this.acc = SEND_EVERY;
    if (this.room) this._sync(this.raw);
  }

  _onPeers(change) {
    this.raw = change.peers || [];
    this._sync(this.raw);
  }

  _sync(peers) {
    const world = this.g.world;
    const seen = new Set();
    const roster = [];
    for (const p of peers) {
      if (!p || p.kind === 'agent') continue;
      if (p.sameTab) {
        this.sim.myPeer = String(p.peer);
        continue;
      }
      const st = clean(p.presence);
      if (!st) continue;
      roster.push({ name: st.name, belt: st.belt, place: st.pl });
      if (!world || !this.place || st.pl !== this.place) continue;
      const id = String(p.peer);
      seen.add(id);
      let av = this.avatars.get(id);
      if (!av) {
        av = new Avatar(id, st, world.scene);
        this.avatars.set(id, av);
        this._hello(st.name);
      } else av.apply(st);
      // someone here is about to take a group photo
      if (st.photo && st.photo !== av.photoN) {
        av.photoN = st.photo;
        if (this.h.photo) this.h.photo(st.name);
      }
    }
    for (const [id, av] of this.avatars) {
      if (!seen.has(id)) {
        av.dispose();
        this.avatars.delete(id);
      }
    }
    this.list = Array.from(this.avatars.values());
    this.roster = roster;
    this._people();
  }

  // Someone appeared in this place after we were already settled in.
  _hello(name) {
    const now = Date.now();
    // While the "n people are here" notice for our own arrival is still pending, that notice covers them.
    if (this.greet || !this.h.joined) return;
    if (now - (this.said.get(name) || 0) < 60000) return;
    if (this.said.size > 64) this.said.clear();
    this.said.set(name, now);
    this.h.joined(name);
  }

  _people() {
    if (!this.h.people) return;
    const relay = this.room && this.room.info ? this.room.info() : null;
    if (relay) this.relayUp = relay.up;
    this.h.people({ on: !!this.room, mode: this.mode, host: this.host, state: this.state, relay, others: this.roster || [], here: this.list.length });
  }

  _publish() {
    const sim = this.sim;
    const sel = sim.sel;
    const o = { v: 1, n: cleanName(sel.name), b: sel.belt, s: sel.stripes, g: sel.gi, pl: this.place, k: sim.streak >= 2 ? Math.min(sim.streak, 99) : null };
    if (this.place && sim.world) {
      const s = sim.netState();
      o.x = r2(s.x);
      o.y = r2(s.y);
      o.z = r2(s.z);
      o.w = r2(s.yaw);
      o.a = s.anim;
      o.i = s.actN;
      o.st = s.seat || null;
      o.md = s.medal || null;
      o.sy = s.say || null;
      o.rc = s.race || null;
      o.ph = s.photo || null;
      o.du = s.du ? Object.assign({}, s.du, { ox: r2(s.du.ox), oz: r2(s.du.oz), yw: r2(s.du.yw) }) : null;
      o.bt = s.bt ? Object.assign({}, s.bt, { ox: r2(s.bt.ox), oz: r2(s.bt.oz), yw: r2(s.bt.yw) }) : null;
    } else {
      o.x = null;
      o.y = null;
      o.z = null;
      o.w = null;
      o.a = null;
      o.i = null;
      o.st = null;
      o.md = null;
      o.sy = null;
      o.rc = null;
      o.ph = null;
      o.du = null;
      o.bt = null;
    }
    const key = JSON.stringify(o);
    if (key === this.last) return;
    this.last = key;
    try {
      const pr = this.room.presence(o);
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { /* the room went away; the page keeps working alone */ }
  }

  // A technique between two other bodies: show it here as well.
  _watch(av) {
    const bt = av.bt;
    const sim = this.sim;
    if (!bt || av.bout || bt.w === sim.myPeer || this.shown.has(bt.id)) return;
    let other = null;
    let npc = null;
    if (bt.w[0] === 'n') {
      npc = sim.world.npcs[parseInt(bt.w.slice(1), 10)];
      const h = npc ? this.held.get(npc) : null;
      if (!npc || npc.ctrl || (npc.busy && !(h && h.av === av.id))) return;
      other = npc;
    } else {
      other = this.avatars.get(bt.w);
      if (!other || other.bout) return;
    }
    const atk = bt.r === 'a' ? av : other;
    const def = bt.r === 'a' ? other : av;
    const bout = new Bout({ id: bt.id, kind: bt.k, atk, def, ox: bt.ox, oz: bt.oz, yaw: bt.yw, names: [atk.name, def.name], t: bt.s ? TECH.down : 0 });
    this.shown.add(bt.id);
    av.bout = bout;
    av.ctlAnim = '';
    if (npc) {
      npc.busy = true;
      npc.back = false;
      npc.anim = ''; // the technique poses it now
      bout.onDone = () => { if (!this.held.has(npc)) npc.release(); };
    } else other.bout = bout;
    sim.addBout(bout);
  }

  // Somebody else's points match against an NPC: put that NPC where the position says, here too.
  _holdNpc(av, dt) {
    const du = av.du;
    const sim = this.sim;
    const npc = sim.world.npcs[parseInt(du.w.slice(1), 10)];
    if (!npc || npc.ctrl || !npc.spar) return;
    const h = this.held.get(npc);
    if (!h) {
      if (npc.busy) return; // already in something on this screen
      npc.busy = true;
      npc.back = false;
      this.held.set(npc, { av: av.id, du: du.id });
    } else if (h.av !== av.id) return;
    else h.du = du.id;
    if (av.bout && !av.bout.done) return; // a finish is being tried: the technique moves both
    const M = Object.assign(posFrom(du.ps), { end: du.e });
    const o = layout(M, du.e ? 'end' : 'pick', 0).B; // the NPC is always the challenged side
    const ux = Math.sin(du.yw);
    const uz = Math.cos(du.yw);
    npc.slideTo(du.ox + ux * o.u + uz * o.s, du.oz + uz * o.u - ux * o.s, 2.6, dt);
    npc.yaw = turnToward(npc.yaw, du.yw + Math.PI + o.turn, 7 * dt);
    npc.char.rate = 9;
    npc.setAnim(o.anim);
  }

  // Let the NPCs go whose match is over (or whose opponent left).
  _letGo() {
    for (const [npc, h] of this.held) {
      const av = this.avatars.get(h.av);
      if (av && av.du && av.du.id === h.du) continue;
      if (av && av.bout && !av.bout.done) continue;
      this.held.delete(npc);
      npc.char.rate = 20;
      npc.release();
    }
  }

  tick(dt) {
    if (!this.room) return;
    if (this.room.info) {
      // the number of working relays changes without anyone coming or going
      this.poll += dt;
      if (this.poll >= 1) {
        this.poll = 0;
        if (this.room.info().up !== this.relayUp) this._people();
      }
    }
    if (this.greet && Date.now() - this.placeAt > 1800) {
      this.greet = false;
      if (this.list.length && this.h.company) this.h.company(this.list.length + 1);
    }
    this.acc += dt;
    if (this.acc >= SEND_EVERY) {
      this.acc = 0;
      this._publish();
    }
    const sim = this.sim;
    if (!sim.world) return;
    for (const av of this.list) {
      if (av.du && av.du.c === 1 && av.du.w === sim.myPeer && !sim.busy) sim.acceptDuel(av, av.du);
      if (av.bt) this._watch(av);
      if (av.du && av.du.k === 'match' && av.du.c === 1 && av.du.w[0] === 'n') this._holdNpc(av, dt);
      if (av.race) sim.seeRace(av);
      // a technique between two others: how its struggle ended, from whichever of them decides
      if (av.bout && !av.bout.mine && av.bt && av.bt.id === av.bout.id && av.bt.e) av.bout.settle(av.bt.e);
      av.update(dt);
    }
    if (this.held.size) this._letGo();
  }
}
