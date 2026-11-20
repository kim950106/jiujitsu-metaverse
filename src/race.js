// The hip-walk race: lanes marked on the dojo mat, a countdown, and then one step of the hip walk
// (엉덩이걷기) for every press of the big button until the far line. Anyone standing by the start
// when somebody begins is taken along, into a lane of their own; each person's time is measured on
// their own screen from their own start signal, and everyone is told everyone else's.
import { clamp } from './util.js';
import { RACE } from './character.js';

const COUNT = 3; // seconds of countdown
const LIMIT = 45; // a race nobody finishes ends by itself
const QUEUE = 4; // presses that can wait their turn
const HURRY = 0.4; // how much faster a step goes for each press that is waiting

export const RaceMixin = {
  canRace() {
    return !!(this.world && this.world.race) && !this.busy && this.p.mode === 'free';
  },

  // Standing where a race starts from?
  _atStart() {
    const p = this.p;
    const R = this.world.race;
    const back = R.x1 < R.x0 ? 1 : -1; // the side of the start line the racers wait on
    const d = (p.x - R.x0) * back;
    return d >= -0.4 && d <= 2.6 && p.z >= R.z0 - 0.4 && p.z <= R.z1 + 0.4;
  },

  // The lane to race in: the nearest one to where the player stands that nobody racing is in.
  _lane() {
    const R = this.world.race;
    const lanes = R.lanes || [(R.z0 + R.z1) / 2];
    const lo = Math.min(R.x0, R.x1) - 0.5;
    const hi = Math.max(R.x0, R.x1) + 0.5;
    // where they really are: what they last sent, not where their body is still sliding to
    const at = (av, k) => (av.st && Number.isFinite(av.st[k]) ? av.st[k] : av[k]);
    const taken = (z) => this.peers().some((av) => av.race && !av.race.f && at(av, 'x') >= lo && at(av, 'x') <= hi && Math.abs(at(av, 'z') - z) < 0.36);
    const order = lanes.slice().sort((a, b) => Math.abs(a - this.p.z) - Math.abs(b - this.p.z));
    const free = order.find((z) => !taken(z));
    return free == null ? order[0] : free;
  },

  // Begin a race, or with an id join the one somebody else has just begun.
  startRace(joinId) {
    if (!this.canRace()) return false;
    const p = this.p;
    const R = this.world.race;
    p.race = { id: joinId || `${this.myPeer || 'solo'}-r${++this._seq}`, phase: 'count', t: 0, n: 0, st: 0, q: 0, shown: -1, time: 0 };
    this._raced.add(p.race.id);
    p.raceOut = null;
    p.mode = 'race';
    p.act = null;
    p.z = this._lane();
    p.x = R.x0;
    p.yaw = R.yaw;
    p.actN++;
    this.char.play('scootf');
    this.char.animT = RACE.stroke; // sitting ready, not yet moving
    this.toast(joinId ? '엉덩이걷기 경주에 함께합니다. 출발 신호에 큰 버튼을 연타!' : '엉덩이걷기 경주! 출발 신호에 큰 버튼을 연타하세요', 3600);
    this._raceView();
    return true;
  },

  // The big button during a race: one step. Presses made during a step wait their turn (up to
  // QUEUE of them), and the more are waiting the faster the body works through them, so hammering
  // the button is what wins.
  stroke() {
    const r = this.p.race;
    if (!r || r.phase !== 'go') return false;
    if (r.st > 0) r.q = Math.min(QUEUE, r.q + 1);
    else this._stroke();
    return true;
  },

  _stroke() {
    const p = this.p;
    const r = p.race;
    r.st = RACE.stroke;
    r.n++;
    p.actN++;
    this.char.play('scootf');
  },

  _stepRace(dt, mag) {
    const p = this.p;
    const r = p.race;
    const R = this.world.race;
    r.t += dt;
    if (mag > 0.6 && r.phase !== 'done') {
      this._endRace('경주를 그만두었습니다');
      return;
    }
    if (r.phase === 'count') {
      const n = Math.ceil(COUNT - r.t);
      if (n !== r.shown && n > 0) {
        r.shown = n;
        if (this.h.flash) this.h.flash({ text: String(n), kind: 'count' });
        if (this.h.sfx) this.h.sfx('tick');
      }
      if (r.t >= COUNT) {
        r.phase = 'go';
        r.t = 0;
        if (this.h.flash) this.h.flash({ text: '출발!', kind: 'count' });
        if (this.h.sfx) this.h.sfx('whistle');
      }
    } else if (r.phase === 'go') {
      if (r.st > 0) {
        // the body travels during the swing of each step
        const seg = (u) => clamp((u - RACE.a) / (RACE.b - RACE.a), 0, 1);
        const k = 1 + HURRY * r.q;
        const u0 = 1 - r.st / RACE.stroke;
        r.st -= dt * k;
        const u1 = 1 - Math.max(0, r.st) / RACE.stroke;
        const dist = (seg(u1) - seg(u0)) * RACE.step;
        if (dist > 0) this._move(Math.sin(p.yaw) * dist, Math.cos(p.yaw) * dist);
        this.char.animT = (1 - Math.max(0, r.st) / RACE.stroke) * RACE.stroke; // the pose keeps up with the pace
        if (r.st <= 0 && r.q > 0) {
          r.q--;
          this._stroke();
        }
      }
      if (R.x1 < R.x0 ? p.x <= R.x1 : p.x >= R.x1) {
        r.phase = 'done';
        r.time = r.t;
        r.t = 0;
        p.raceOut = { id: r.id, f: Math.round(r.time * 100), until: this.t + 8 };
        // everyone seen finishing this race before now was faster, however long ago that was
        const fin = this._raceFin.get(r.id);
        const place = 1 + (fin ? fin.size : 0);
        const shared = place > 1 || this.peers().some((av) => av.race && av.race.id === r.id);
        const rec = this.h.raceDone ? this.h.raceDone(r.time) : null;
        const best = rec ? (rec.isBest ? ' · 내 최고 기록!' : ` · 내 최고 ${rec.best.toFixed(2)}초`) : '';
        this.toast(`완주! ${r.time.toFixed(2)}초 · 엉덩이걷기 ${r.n}걸음${shared ? ` · ${place}등` : ''}${best}`, 5200);
        if (this.h.flash) this.h.flash({ text: `${r.time.toFixed(2)}초`, kind: 'tap' });
        if (this.h.sfx) this.h.sfx('ding');
      } else if (r.t > LIMIT) {
        this._endRace('시간이 다 되어 경주를 마칩니다');
        return;
      }
    } else if (r.t > 1.4) {
      this._endRace();
      return;
    }
    this._raceView();
  },

  _endRace(msg) {
    const p = this.p;
    p.race = null;
    if (p.mode === 'race') {
      p.mode = 'free';
      p.actN++;
      this.char.play('loco');
    }
    if (msg) this.toast(msg);
    this._raceView();
  },

  _raceView() {
    if (!this.h.race) return;
    const r = this.p.race;
    const R = this.world && this.world.race;
    const prog = r && R ? clamp((this.p.x - R.x0) / (R.x1 - R.x0), 0, 1) : 0;
    const key = r ? `${r.phase}|${r.phase === 'go' ? Math.floor(r.t * 10) : r.shown}|${Math.round(prog * 50)}` : '';
    if (key === this._raceKey) return;
    this._raceKey = key;
    this.h.race(r ? { phase: r.phase, time: r.phase === 'go' ? r.t : r.time, prog, n: r.n } : null);
  },

  // What another person's state says about a race: take part if they have just begun one next to
  // us, and tell their time when they finish.
  seeRace(av) {
    const rc = av.race;
    const p = this.p;
    if (!rc || !this.world || !this.world.race) return;
    if (rc.f === 0) {
      if (!this._raced.has(rc.id) && this.canRace() && this._atStart()) this.startRace(rc.id);
      return;
    }
    const key = `${av.id}|${rc.id}`;
    if (this._raceTold.has(key)) return;
    if (this._raceTold.size > 200) this._raceTold.clear();
    this._raceTold.add(key);
    let fin = this._raceFin.get(rc.id);
    if (!fin) {
      if (this._raceFin.size > 60) this._raceFin.clear();
      fin = new Set();
      this._raceFin.set(rc.id, fin);
    }
    fin.add(av.id);
    const together = this._raced.has(rc.id);
    if (!together && Math.hypot(av.x - p.x, av.z - p.z) > 12) return;
    this.toast(`${av.name} 님 엉덩이걷기 ${(rc.f / 100).toFixed(2)}초`, 4200);
  },
};
