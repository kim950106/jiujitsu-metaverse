// Non-player characters and the two-person "match" controller used on mats.
import { Character, SHRIMP } from './character.js';
import { TAU, rand, pick, turnToward, BELT_ORDER } from './util.js';

export function randomLook(o = {}) {
  return Object.assign({
    belt: pick(BELT_ORDER),
    stripes: (Math.random() * 5) | 0,
    gi: pick(['white', 'white', 'blue', 'black']),
    female: Math.random() < 0.3,
    lite: true,
  }, o);
}

const TOPS = [0x2f4f6f, 0x6f2f3a, 0x3d5a3d, 0x4a4a52, 0x7a5a2a, 0x2b2b30, 0x8a8f96, 0x305a6a];
export function casualLook(o = {}) {
  return Object.assign({ outfit: 'casual', top: pick(TOPS), pants: pick([0x23262b, 0x2d3440, 0x3a3a3a]), female: Math.random() < 0.4, lite: true }, o);
}

export class NPC {
  constructor(world, o) {
    this.w = world;
    this.o = o;
    this.x = o.x;
    this.z = o.z;
    this.y = o.y || 0;
    this.yaw = o.yaw || 0;
    this.char = new Character(Object.assign({ lite: true }, o.look || {}));
    this.solid = o.solid !== false;
    this.mode = o.mode || 'idle';
    this.anim = 'loco';
    this.speed = 0;
    this.idx = 0;
    this.dir = false;
    this.rest = rand(0, 1.5);
    this.wait = 0;
    // Same build, same creation order: the index identifies this NPC on every visitor's screen.
    this.id = world.npcs.length;
    this.spar = !!o.spar; // can be challenged to a technique
    this.busy = false; // held in a duel or a bout; something else moves it
    this.back = false; // walking back to its spot afterwards
    this.name = o.name || o.label || '파트너';
    this.home = { x: this.x, z: this.z, yaw: this.yaw, anim: o.anim || 'loco', mode: this.mode };
    world.scene.add(this.char.root);
    world.npcs.push(this);
    if (o.label) this.char.setLabel(o.label);
    this.setAnim(o.anim || 'loco');
    this.char.animT = rand(0, 3);
    this.sync();
    this.char.settle();
  }

  sync() {
    this.char.root.position.set(this.x, this.y, this.z);
    this.char.root.rotation.y = this.yaw;
  }

  setAnim(a) {
    if (this.anim !== a) {
      this.anim = a;
      this.char.play(a);
    }
  }

  faceTo(x, z, dt, rate = 6) {
    const ty = Math.atan2(x - this.x, z - this.z);
    this.yaw = dt == null ? ty : turnToward(this.yaw, ty, rate * dt);
  }

  // Walk toward a point. Returns true on arrival.
  goTo(x, z, speed, dt) {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.06) {
      this.speed = 0;
      return true;
    }
    const st = Math.min(d, speed * dt);
    this.x += (dx / d) * st;
    this.z += (dz / d) * st;
    this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), 8 * dt);
    this.speed = speed;
    return false;
  }

  // Slide toward a point without turning (used while grappling).
  slideTo(x, z, speed, dt) {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const st = Math.min(d, speed * dt);
    this.x += (dx / d) * st;
    this.z += (dz / d) * st;
  }

  // Let go after a duel or bout; the NPC walks back to where it belongs.
  release() {
    if (!this.busy) return;
    this.busy = false;
    this.back = true;
    if (this.char.anim === 'tech') this.char.play('loco');
    this.char.tech = null;
    this.anim = 'loco';
  }

  update(dt) {
    if (this.busy) {
      this.speed = 0;
    } else if (this.back) {
      this.setAnim('loco');
      if (this.goTo(this.home.x, this.home.z, 1.5, dt)) {
        this.back = false;
        this.yaw = this.home.yaw;
        this.setAnim(this.home.anim);
      }
    } else if (this.mode === 'path') this._path(dt);
    else if (this.mode === 'shrimp') this._shrimp(dt);
    this.sync();
    this.char.update(dt, this.speed);
  }

  _path(dt) {
    const path = this.o.path;
    if (this.wait > 0) {
      this.wait -= dt;
      this.speed = 0;
      return;
    }
    const p = path[this.idx];
    if (this.goTo(p.x, p.z, this.o.speed || 1.25, dt)) {
      this.idx = (this.idx + 1) % path.length;
      if (p.wait) this.wait = p.wait;
    }
  }

  _shrimp(dt) {
    const tgt = this.dir ? this.o.b : this.o.a;
    const dx = tgt.x - this.x;
    const dz = tgt.z - this.z;
    const d = Math.hypot(dx, dz);
    this.speed = 0;
    if (this.rest > 0) {
      this.rest -= dt;
      this.setAnim('loco');
      if (d > 0.01) this.yaw = turnToward(this.yaw, Math.atan2(-dx, -dz), 4 * dt);
      return;
    }
    if (d < 0.35) {
      this.dir = !this.dir;
      this.rest = 2;
      return;
    }
    this.setAnim('shrimp');
    this.yaw = Math.atan2(-dx, -dz);
    const u = (this.char.animT % SHRIMP.cycle) / SHRIMP.cycle;
    if (u > SHRIMP.a && u < SHRIMP.b) {
      const v = SHRIMP.dist / ((SHRIMP.b - SHRIMP.a) * SHRIMP.cycle);
      this.x += (dx / d) * v * dt;
      this.z += (dz / d) * v * dt;
    }
  }
}

// Two NPCs alternating between standing grip-fighting and a guard position, with an optional referee,
// clock and score. Used for running matches in the arena and for drilling pairs in the gym.
export class MatchPair {
  constructor(o) {
    this.o = o;
    this.a = o.a;
    this.b = o.b;
    this.ref = o.ref || null;
    this.cx = o.cx;
    this.cz = o.cz;
    this.total = o.total || 0;
    this.time = this.total ? rand(Math.min(45, this.total), this.total) : 0;
    this.mode = Math.random() < 0.5 ? 'stand' : 'ground';
    this.flip = Math.random() < 0.5;
    this.t = rand(0, 5);
    this.dur = rand(7, 14);
    this.phi = rand(0, TAU);
    this.gyaw = rand(0, TAU);
    this.state = 'fight';
    this.endT = 0;
    this.score = { a: 0, b: 0, advA: 0, advB: 0 };
    this.winner = null;
    if (this.total) {
      this.score.a = pick([0, 0, 2, 2, 3, 4]);
      this.score.b = pick([0, 0, 0, 2, 2]);
      this.score.advA = pick([0, 0, 1]);
      this.score.advB = pick([0, 1, 1]);
    }
    this.a.ctrl = this;
    this.b.ctrl = this;
    if (this.ref) this.ref.ctrl = this;
  }

  reset() {
    this.state = 'fight';
    this.time = this.total;
    this.score = { a: 0, b: 0, advA: 0, advB: 0 };
    this.winner = null;
    this.mode = 'stand';
    this.t = 0;
  }

  stop() {
    for (const n of [this.a, this.b, this.ref]) {
      if (n) {
        n.ctrl = null;
        n.setAnim('loco');
        n.speed = 0;
      }
    }
  }

  update(dt) {
    const a = this.a;
    const b = this.b;
    const s = this.score;
    if (this.state === 'end') {
      this.endT -= dt;
      a.setAnim('loco');
      b.setAnim('loco');
      a.speed = b.speed = 0;
      a.faceTo(b.x, b.z, dt);
      b.faceTo(a.x, a.z, dt);
      if (this.endT <= 0) this.reset();
    } else {
      if (this.total) {
        this.time -= dt;
        if (this.time <= 0) {
          this.time = 0;
          this.state = 'end';
          this.endT = 8;
          const pa = s.a * 10 + s.advA;
          const pb = s.b * 10 + s.advB;
          this.winner = pa === pb ? pick(['a', 'b']) : pa > pb ? 'a' : 'b';
          if (this.o.onEnd) this.o.onEnd(this);
        }
      }
      this.t += dt;
      if (this.t > this.dur) {
        this.t = 0;
        this.dur = rand(8, 16);
        if (this.mode === 'stand') {
          this.mode = 'ground';
          if (Math.random() < 0.4) this.flip = !this.flip;
          const bottom = this.flip ? b : a;
          const top = this.flip ? a : b;
          this.gyaw = Math.atan2(top.x - bottom.x, top.z - bottom.z);
          if (this.total) {
            if (this.flip) s.a += 2;
            else s.b += 2;
          }
        } else {
          this.mode = 'stand';
          if (this.total) {
            if (Math.random() < 0.5) {
              if (this.flip) s.b += 2;
              else s.a += 2;
            } else if (Math.random() < 0.5) s.advA += 1;
            else s.advB += 1;
          }
        }
      }
      if (this.mode === 'stand') {
        this.phi += dt * 0.35;
        const r = 0.5;
        const ox = Math.sin(this.phi) * r;
        const oz = Math.cos(this.phi) * r;
        a.slideTo(this.cx + ox, this.cz + oz, 1.6, dt);
        b.slideTo(this.cx - ox, this.cz - oz, 1.6, dt);
        a.faceTo(b.x, b.z, dt, 8);
        b.faceTo(a.x, a.z, dt, 8);
        a.setAnim('stance');
        b.setAnim('stance');
      } else {
        const bottom = this.flip ? b : a;
        const top = this.flip ? a : b;
        const fx = Math.sin(this.gyaw);
        const fz = Math.cos(this.gyaw);
        top.slideTo(bottom.x + fx * 0.47, bottom.z + fz * 0.47, 1.6, dt);
        bottom.yaw = turnToward(bottom.yaw, this.gyaw, 6 * dt);
        top.yaw = turnToward(top.yaw, this.gyaw + Math.PI, 6 * dt);
        bottom.setAnim('guardBottom');
        top.setAnim('guardTop');
      }
      a.speed = b.speed = 0;
    }
    if (this.ref) {
      const ang = this.phi * 0.6 + 1.3;
      const tx = this.cx + Math.sin(ang) * 2.5;
      const tz = this.cz + Math.cos(ang) * 2.5;
      const far = Math.hypot(tx - this.ref.x, tz - this.ref.z);
      if (far > 0.5) this.ref.goTo(tx, tz, 0.9, dt);
      else {
        this.ref.speed = 0;
        this.ref.faceTo((a.x + b.x) / 2, (a.z + b.z) / 2, dt, 4);
      }
      this.ref.setAnim('loco');
    }
  }
}
