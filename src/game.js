/* global THREE, window, document, performance, requestAnimationFrame */
// Rendering, camera and input. All game rules live in sim.js; maps live in gym.js and arena.js;
// other people arrive through net.js.
import { clamp, angDiff, fitText } from './util.js';
import { Sim } from './sim.js';
import { Net } from './net.js';
import { buildGym } from './gym.js';
import { buildArena } from './arena.js';
import { Sound } from './audio.js';
import { isKind, SLOW } from './tech.js';
import { point } from './stage.js';
import { Guestbook, browserStore } from './guest.js';
import { roomCode } from './relay.js';

const SCALES = [1, 0.85, 0.72, 0.6]; // steps the drawing resolution can fall back through on slow devices
const FAR = 26; // beyond this distance characters drop their small parts
// Where a technique reads best from: camera directions measured from the way the attacker faces
// (a quarter turn to the left is the attacker's left side), and how far the camera looks down.
// The camera drifts to the nearest of these that has room behind it, unless the player takes over.
const VIEWS = {
  ankle: { yaw: [Math.PI / 2, -Math.PI / 2], pitch: 0.34 }, // from either side
  arm: { yaw: [Math.PI, 0], pitch: 0.52 }, // along the defender's body, looking down a little: the two make a T
  guil: { yaw: [-Math.PI / 2, 0], pitch: 0.3 }, // the side the head is not on, or facing the attacker
  omo: { yaw: [-Math.PI / 2, Math.PI], pitch: 0.36 }, // the defender's side, the attacker sitting up behind
  rnc: { yaw: [0.3, -0.3], pitch: 0.3 }, // from the front: both faces, the arm under the chin
  tri: { yaw: [Math.PI / 2, -Math.PI / 2], pitch: 0.3 },
  kim: { yaw: [-Math.PI / 2, Math.PI], pitch: 0.44 }, // the side the bent arm is on
};

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.h = hooks;
    this.mode = 'start';
    this.ok = false;
    this.world = null;
    this.sound = new Sound();
    this.guest = new Guestbook(browserStore(), roomCode() || 'main');
    this.guest.onChange(() => { if (this.world && this.world.onBoard) this.world.onBoard(); });
    this.logos = { gym: null, event: null };
    this.keys = Object.create(null);
    this.stick = { x: 0, y: 0, on: false };
    this.touches = new Map(); // pointers dragging on the scene: one turns the camera, two pinch to zoom
    this.pinch = 0;
    this.spin = 0; // camera turn buttons held: -1 left, 1 right
    this.drag = { id: null, x: 0 };
    this.cam = { yaw: 0, pitch: 0.3, dist: 4.6, tgt: new THREE.Vector3() };
    this.view = { id: null, auto: false, off: null }; // the camera's own choice of angle for the technique in progress
    this.prevYaw = 0.15;
    this.prevT = 0;
    this.frame = 0;
    const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    this.coarse = mm('(pointer: coarse)');
    this.reduce = mm('(prefers-reduced-motion: reduce)');
    try {
      // Phones skip multisampling: at their pixel density it costs more than it shows.
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.coarse, powerPreference: 'high-performance' });
    } catch (e) {
      this.renderer = null;
    }
    if (!this.renderer) return;
    this.ok = true;
    this.px = { base: Math.min(window.devicePixelRatio || 1, this.coarse ? 1.75 : 2), step: 0, acc: 0, n: 0, good: 0 };
    this.renderer.setPixelRatio(this.px.base);
    this.renderer.shadowMap.enabled = !this.coarse;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.15, 260);
    this.sim = new Sim({
      toast: (m, ms) => hooks.toast(m, ms),
      zone: (label) => hooks.zone(label),
      prompt: (it) => hooks.prompt(it),
      partner: (tg) => hooks.partner(tg),
      mat: (on) => hooks.mat(on),
      duel: (d) => hooks.duel(d),
      open: (what) => hooks.open(what),
      sfx: (n) => this.sound.sfx(n),
      camera: (yaw, pitch, dist) => {
        this.cam.yaw = yaw;
        this.cam.pitch = pitch;
        this.cam.dist = dist;
      },
      openBelt: () => hooks.openBelt(),
      board: () => this.guest.list(),
      mash: (m) => hooks.mash && hooks.mash(m),
      flash: (f) => hooks.flash && hooks.flash(f),
      streak: (n) => hooks.streak && hooks.streak(n),
      race: (r) => hooks.race && hooks.race(r),
      raceDone: (t) => (hooks.raceDone ? hooks.raceDone(t) : null),
    });
    if (this.sim.char.blob) this.sim.char.blob.visible = !this.renderer.shadowMap.enabled;
    this.net = new Net(this, {
      status: (s) => hooks.net(s),
      people: (p) => hooks.people(p),
      joined: (name) => hooks.joined && hooks.joined(name),
      company: (k) => hooks.company && hooks.company(k),
      photo: (name) => hooks.photo && hooks.photo(name),
    });
    this._buildPreview();
    this._bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); hooks.toast('3D 화면이 잠시 멈췄습니다. 계속되면 새로고침해 주세요', 6000); });
    this.last = performance.now();
    const loop = (t) => {
      this._frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.net.start();
  }

  _buildPreview() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x0f1114);
    s.fog = new THREE.Fog(0x0f1114, 9, 22);
    s.add(new THREE.HemisphereLight(0xfff0dc, 0x3a3c44, 0.8));
    const key = new THREE.DirectionalLight(0xffe2b8, 0.62);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 1; sc.far = 20;
    key.shadow.bias = -0.002;
    s.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.3);
    rim.position.set(-4, 3, -4);
    s.add(rim);
    const L = (c) => new THREE.MeshLambertMaterial({ color: c });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.04, 40), L(0x16181c));
    floor.position.y = -0.1;
    s.add(floor);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.06, 56), L(0x2a2d33));
    ring.position.y = -0.06;
    ring.receiveShadow = true;
    s.add(ring);
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.06, 56), L(0xeeece6));
    mat.position.y = -0.03;
    mat.receiveShadow = true;
    s.add(mat);
    s.add(this.sim.char.root);
    this.preview = s;
  }

  resize() {
    if (!this.ok) return;
    const w = Math.max(1, this.canvas.clientWidth);
    const hgt = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    if (this.mode === 'start') {
      const narrow = w < 820;
      this.camera.fov = narrow ? 60 : 32;
      this.camera.position.set(0, 1.12, 4.5);
      this.camera.lookAt(0, 0.74, 0);
      if (narrow) this.camera.setViewOffset(w, hgt, -w * 0.24, hgt * 0.3, w, hgt);
      else {
        const pw = Math.min(440, w * 0.44);
        this.camera.setViewOffset(w, hgt, w / 2 - (w - pw) * 0.63, 0, w, hgt);
      }
    } else {
      // A phone held sideways is short: widen the view a little so the room does not feel cropped.
      this.camera.fov = hgt < 460 && w > hgt ? 62 : 55;
      this.vw = w;
      this.vh = hgt;
      this.liftNow = null;
      this._lift(0);
    }
    this.camera.updateProjectionMatrix();
    // Changing the size wipes the picture. Draw it again at once, so that a change of resolution
    // or a turn of the screen never shows an empty frame.
    if (this.mode === 'start') {
      if (this.preview) this.renderer.render(this.preview, this.camera);
    } else if (this.world) this.renderer.render(this.world.scene, this.camera);
  }

  // How far the picture is lifted, as a part of its height: a little on an upright phone, so that
  // the character clears the buttons, and more during a points match, so that the two bodies stay
  // in view above the strip with the hands.
  _lift(dt) {
    const d = this.sim.p.duel;
    const match = this.mode === 'play' && !!d && d.kind === 'match' && d.phase !== 'wait';
    const want = (this.vh > this.vw * 1.2 ? 0.09 : 0) + (match ? (this.vh < 480 ? 0.18 : 0.06) : 0);
    let v = this.liftNow == null ? want : this.liftNow + (want - this.liftNow) * (1 - Math.exp(-5 * dt));
    if (Math.abs(v - want) < 0.002) v = want;
    if (v === this.liftNow) return;
    this.liftNow = v;
    if (v > 0) this.camera.setViewOffset(this.vw, this.vh, 0, Math.round(this.vh * v), this.vw, this.vh);
    else this.camera.clearViewOffset();
  }

  _bindInput() {
    const cv = this.canvas;
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      this.keys[e.code] = true;
      if (this.mode !== 'play') return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      if (this.sim.p.duel) {
        const hands = { Digit1: 's', Digit2: 'r', Digit3: 'p' };
        if (hands[e.code]) this.sim.pick(hands[e.code]);
        else if (e.code === 'Escape') this.sim.cancelDuel();
        return;
      }
      const acts = {
        Digit1: 'bow', Digit2: 'sit', Digit3: 'shrimp', Digit4: 'roll',
        Digit5: 'ankle', Digit6: 'arm', Digit7: 'guil', Digit8: 'omo', Digit9: 'rnc',
        KeyQ: 'ankle', KeyR: 'arm', KeyT: 'guil', KeyF: 'omo', KeyG: 'rnc', KeyY: 'tri', KeyH: 'kim', KeyM: 'match',
        KeyB: 'bridge', KeyN: 'standup', KeyV: 'shaka',
      };
      const says = { KeyZ: 0, KeyX: 1, KeyC: 2 };
      if (acts[e.code]) this.act(acts[e.code]);
      else if (says[e.code] != null) this.say(says[e.code]);
      else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') this.main();
      else if (e.code === 'KeyP') { if (this.h.shoot) this.h.shoot(); }
      else if (e.code === 'Escape') this.h.menu();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
      this.spin = 0;
    });
    document.addEventListener('visibilitychange', () => {
      this.keys = Object.create(null);
      this.spin = 0;
      this.last = performance.now();
    });

    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      // positions are read in the stage's frame, which may be turned on its side (stage.js)
      const p = point(e);
      if (this.mode === 'start') {
        this.drag.id = e.pointerId;
        this.drag.x = p.x;
        return;
      }
      if (this.touches.size < 2) this.touches.set(e.pointerId, p);
      this.pinch = 0;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = point(e);
      if (e.pointerId === this.drag.id) {
        this.prevYaw += (p.x - this.drag.x) * 0.012;
        this.drag.x = p.x;
        return;
      }
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      if (this.touches.size === 1) {
        this.view.auto = false; // the player is choosing the angle now
        this.cam.yaw -= (p.x - t.x) * 0.006;
        this.cam.pitch = clamp(this.cam.pitch + (p.y - t.y) * 0.004, -0.35, 1.25);
      }
      t.x = p.x;
      t.y = p.y;
      if (this.touches.size === 2) {
        const [a, b] = Array.from(this.touches.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch > 0 && d > 0) this.cam.dist = clamp(this.cam.dist * (this.pinch / d), 1.6, 11);
        this.pinch = d;
      }
    });
    const up = (e) => {
      if (e.pointerId === this.drag.id) this.drag.id = null;
      this.touches.delete(e.pointerId);
      this.pinch = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      if (this.mode !== 'play') return;
      e.preventDefault();
      this.cam.dist = clamp(this.cam.dist + e.deltaY * 0.004, 1.6, 11);
    }, { passive: false });
  }

  // On-screen joystick, in -1..1 on each axis (up is +y).
  setStick(x, y, on) {
    this.stick.x = x;
    this.stick.y = y;
    this.stick.on = on;
  }

  // Any action button or key.
  act(name) {
    if (this.mode !== 'play') return;
    if (isKind(name) || name === 'match') this.sim.challenge(name);
    else this.sim.doAction(name);
  }

  // The picture on the screen right now, without the buttons, with a caption strip along the
  // bottom. Returns a canvas, or null where there is nothing to take.
  snap(left, right) {
    if (!this.ok || !this.world || this.mode !== 'play') return null;
    // A phone that has been turned down to a coarse picture to keep its frame rate still gets a
    // sharp photo: this one frame is drawn about 1600 pixels wide.
    const r = this.renderer;
    const was = r.getPixelRatio();
    const size = r.getSize(new THREE.Vector2());
    const want = Math.min(3, Math.max(1, 1600 / Math.max(1, size.x, size.y)));
    if (want > was) r.setPixelRatio(want);
    r.render(this.world.scene, this.camera);
    const src = r.domElement;
    const cv = document.createElement('canvas');
    const W = src.width;
    const H = src.height;
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    c.drawImage(src, 0, 0); // must follow the render at once: the drawing buffer is not kept
    const bar = Math.max(30, Math.round(H * 0.075));
    c.fillStyle = 'rgba(15,17,20,.84)';
    c.fillRect(0, H - bar, W, bar);
    c.fillStyle = '#ffd79a';
    c.fillRect(0, H - bar, W, Math.max(2, Math.round(bar * 0.07)));
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = '#f1efe9';
    fitText(c, left, bar * 0.45, H - bar / 2 + 2, W * 0.56, Math.round(bar * 0.46), 700);
    c.textAlign = 'right';
    c.fillStyle = '#ffd79a';
    fitText(c, right, W - bar * 0.45, H - bar / 2 + 2, W * 0.36, Math.round(bar * 0.4), 700);
    if (want > was) r.setPixelRatio(was);
    return cv;
  }

  // One of the quick phrases.
  say(i) {
    if (this.mode === 'play') this.sim.say(i);
  }

  // The big button: whatever can be used right here, otherwise a bow.
  main() {
    if (this.mode !== 'play') return;
    if (this.sim.p.bout) {
      this.sim.mash(); // during a technique it is the button to hammer
      return;
    }
    if (this.sim.p.race) {
      this.sim.stroke(); // and in a shrimp race, every press is one shrimp
      return;
    }
    if (this.sim.busy) return;
    if (this.sim._prompt) {
      this.sim.usePrompt();
      this.h.prompt(this.sim._prompt);
    } else this.sim.doAction('bow');
  }

  usePrompt() {
    this.main();
  }

  zoom(d) {
    this.cam.dist = clamp(this.cam.dist + d, 1.6, 11);
  }

  _input() {
    const k = this.keys;
    let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let run = !!(k.ShiftLeft || k.ShiftRight);
    if (this.stick.on) {
      mx = this.stick.x;
      my = this.stick.y;
      run = Math.hypot(mx, my) > 0.86; // pushed to the rim
    }
    return { mx, my, run, camYaw: this.cam.yaw };
  }

  setSelection(sel) {
    Object.assign(this.sim.sel, sel);
    this.sim.applySel();
    this._patch();
  }

  _patch() {
    this.sim.char.drawPatch(this.logos.gym, this.sim.sel.name);
  }

  setLogo(kind, img) {
    this.logos[kind] = img || null;
    if (this.world) this.world.applyLogos(this.logos);
    this._patch();
  }

  enter(place, at) {
    if (!this.ok) return;
    if (this.world) this._unload();
    this.sim.sel.place = place;
    this.world = place === 'arena' ? buildArena(this.sim.api) : buildGym(this.sim.api);
    this.world.freeze();
    this.world.applyLogos(this.logos);
    this.sim.setWorld(this.world);
    const p = this.sim.p;
    if (at && typeof at.x === 'number') {
      p.x = at.x;
      p.z = at.z;
      p.yaw = at.yaw || 0;
    }
    this.mode = 'play';
    this.cam.yaw = p.yaw + Math.PI;
    this.cam.pitch = 0.3;
    // Portrait screens show a narrow slice of the room, so start a little further back.
    const tall = this.canvas.clientWidth < this.canvas.clientHeight * 0.8;
    this.cam.dist = (place === 'arena' ? 4.8 : 3.8) * (tall ? 1.35 : 1);
    this.cam.tgt.set(p.x, 1.05, p.z);
    this.cam.eff = this.cam.dist;
    this.touches.clear();
    this.spin = 0;
    this.resize();
    this._patch();
    this.sound.setAmbience(place);
    this.net.setPlace(place);
  }

  _unload() {
    this.net.setPlace('');
    this.sim.setWorld(null);
    this.world.scene.remove(this.sim.char.root);
    this.world.dispose();
    this.world = null;
  }

  toStart() {
    if (this.world) this._unload();
    this.mode = 'start';
    this.preview.add(this.sim.char.root);
    this.sim.char.setMedal(0);
    this.sim.char.play('loco');
    this.sound.setAmbience(null);
    this.resize();
  }

  state() {
    const p = this.sim.p;
    return { sel: Object.assign({}, this.sim.sel), playing: this.mode === 'play', x: p.x, z: p.z, yaw: p.yaw };
  }

  _camera(dt) {
    const p = this.sim.p;
    const c = this.cam;
    const lim = this.world.cam;
    this._lift(dt);
    if (this.spin) {
      c.yaw += this.spin * 1.9 * dt;
      this.view.auto = false;
    }
    // During a duel or a technique, look at the middle of the pair and stand back far enough to
    // keep both in frame, which on an upright phone is further than usual.
    const pair = p.bout || p.duel;
    const bout = p.bout && !p.bout.done ? p.bout : null;
    const ty = p.y + (p.mode === 'seated' ? 1.1 : p.mode === 'sit' ? 0.8 : pair ? 0.7 : 1.05);
    const k = 1 - Math.exp(-12 * dt);
    c.tgt.x += ((pair ? pair.ox : p.x) - c.tgt.x) * k;
    c.tgt.y += (ty - c.tgt.y) * k;
    c.tgt.z += ((pair ? pair.oz : p.z) - c.tgt.z) * k;
    const halfW = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect;
    // at the tap the camera pushes in for as long as the slow motion lasts
    const tapNow = !!bout && bout.outcome === 2 && bout.t >= bout.T.tap - 0.12 && bout.t < bout.T.tap + SLOW.span + 0.2;
    c.push = (c.push == null ? 1 : c.push) + ((tapNow ? 0.68 : 1) - (c.push == null ? 1 : c.push)) * (1 - Math.exp(-9 * dt));
    const want = (pair ? Math.max(c.dist, Math.min(7.5, 1.2 / halfW)) : c.dist) * c.push;
    c.eff = c.eff == null ? want : c.eff + (want - c.eff) * (1 - Math.exp(-6 * dt));
    // Keep the camera where it is allowed to be. A map gives one box, or several that together
    // cover its rooms (cam.boxes): flatten the angle under a low ceiling, then walk outward from
    // the look-at point and stop where the view would leave every box, so it never passes through
    // a wall but can look through a doorway.
    const boxes = lim.boxes || [lim];
    const inBox = (b, bx, bz) => bx >= b.minX && bx <= b.maxX && bz >= b.minZ && bz <= b.maxZ;
    // The box the look-at point is in sets the height limit. Among overlapping boxes the tallest
    // wins; outside all of them, the nearest.
    let home = null;
    let gap = Infinity;
    for (const b of boxes) {
      const ox = c.tgt.x - clamp(c.tgt.x, b.minX, b.maxX);
      const oz = c.tgt.z - clamp(c.tgt.z, b.minZ, b.maxZ);
      const far = ox * ox + oz * oz;
      if (far < gap - 1e-9 || (far < gap + 1e-9 && home && b.maxY > home.maxY)) {
        gap = far;
        home = b;
      }
    }
    const lid = Math.min(home.ceil || home.maxY, Math.max(home.maxY, p.y + 1.5));
    // ease the limit so that stepping through a doorway dips the view instead of snapping it
    c.lid = c.lid == null || c.lidOf !== this.world ? lid : c.lid + (lid - c.lid) * (1 - Math.exp(-9 * dt));
    c.lidOf = this.world;
    const maxY = c.lid;
    const sx = clamp(c.tgt.x, home.minX, home.maxX);
    const sz = clamp(c.tgt.z, home.minZ, home.maxZ);
    // How far the camera can stand back looking from a given direction, and where that puts it.
    const probe = (yaw, pitchIn) => {
      let pitch = pitchIn;
      const room = maxY - c.tgt.y;
      if (Math.sin(pitch) * c.eff > room) pitch = Math.asin(clamp(room / c.eff, -0.2, 1));
      const cp = Math.cos(pitch);
      const dx = Math.sin(yaw) * cp;
      const dy = Math.sin(pitch);
      const dz = Math.cos(yaw) * cp;
      const free = (t) => {
        const fx = sx + dx * t;
        const fy = c.tgt.y + dy * t;
        const fz = sz + dz * t;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (inBox(b, fx, fz) && fy <= (b === home ? Math.max(maxY, lid) : b.ceil || b.maxY) + 1e-3) return true;
        }
        return false;
      };
      let d = c.eff;
      if (dy < -1e-4) d = Math.min(d, (0.3 - c.tgt.y) / dy);
      const STEPS = 16;
      let clear = 0;
      let hit = false;
      for (let i = 1; i <= STEPS; i++) {
        const t = (d * i) / STEPS;
        if (!free(t)) {
          hit = true;
          break;
        }
        clear = t;
      }
      if (hit) {
        let hi = clear + d / STEPS;
        for (let i = 0; i < 6; i++) {
          const mid = (clear + hi) / 2;
          if (free(mid)) clear = mid;
          else hi = mid;
        }
        d = clear;
      }
      return { d, dx, dy, dz, free };
    };
    // A technique in progress: drift to an angle it reads well from.
    if (bout) {
      if (this.view.id !== bout.id) this.view = { id: bout.id, auto: true, off: null };
      const V = VIEWS[bout.kind] || VIEWS.ankle;
      if (this.view.auto && bout.t > 0.15) {
        if (this.view.off == null) {
          let best = null;
          for (const off of V.yaw) {
            const yaw = bout.yaw + off;
            const d = probe(yaw, V.pitch).d;
            const score = Math.max(0, c.eff * 0.8 - d) * 4 + Math.abs(angDiff(c.yaw, yaw)) * 0.3;
            if (!best || score < best.score) best = { off, score };
          }
          this.view.off = best.off;
        }
        const k2 = 1 - Math.exp(-2.8 * dt);
        c.yaw += angDiff(c.yaw, bout.yaw + this.view.off) * k2;
        c.pitch += (V.pitch - c.pitch) * k2;
      }
    } else if (this.view.id != null) this.view = { id: null, auto: false, off: null };
    const pr = probe(c.yaw, c.pitch);
    const { dx, dy, dz, free } = pr;
    const d = Math.max(pr.d, 0.7);
    let x = sx + dx * d;
    const y = clamp(c.tgt.y + dy * d, 0.3, Math.max(maxY, 0.3));
    let z = sz + dz * d;
    if (!free(d)) {
      x = clamp(x, home.minX, home.maxX);
      z = clamp(z, home.minZ, home.maxZ);
    }
    this.camera.position.set(x, y, z);
    this.camera.lookAt(c.tgt);
    const sun = this.world.sun;
    if (sun) {
      sun.position.set(p.x + 5, p.y + 14, p.z + 4);
      sun.target.position.set(p.x, p.y, p.z);
      sun.target.updateMatrixWorld();
    }
  }

  // Drop the drawing resolution a step when frames run long, and raise it again once there is room.
  _pace(raw) {
    const px = this.px;
    if (raw > 0.25) return; // a pause, not a slow frame
    px.acc += raw;
    px.n++;
    if (px.acc < 2) return;
    const avg = px.acc / px.n;
    px.acc = 0;
    px.n = 0;
    let step = px.step;
    if (avg > 0.026 && step < SCALES.length - 1) {
      step++;
      px.good = 0;
    } else if (avg < 0.015 && step > 0) {
      px.good++;
      if (px.good >= 4) {
        step--;
        px.good = 0;
      }
    } else px.good = 0;
    if (step !== px.step) {
      px.step = step;
      this.renderer.setPixelRatio(px.base * SCALES[step]);
      this.resize();
    }
  }

  _lod() {
    const c = this.camera.position;
    const far2 = FAR * FAR;
    const mark = (o) => {
      const dx = o.x - c.x;
      const dz = o.z - c.z;
      o.char.setLod(dx * dx + dz * dz > far2);
    };
    for (const n of this.world.npcs) mark(n);
    for (const av of this.net.list) mark(av);
  }

  _frame(t) {
    if (!this.ok) return;
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 0.016;
    const raw = dt;
    dt = Math.min(dt, 0.05);
    this.frame++;
    if (this.mode === 'start') {
      // Face the viewer and turn gently from side to side; dragging changes the base angle.
      this.prevT += dt;
      const ch = this.sim.char;
      ch.root.position.set(0, 0, 0);
      ch.root.rotation.y = this.prevYaw + (this.reduce ? 0 : Math.sin(this.prevT * 0.6) * 0.55);
      ch.update(dt, 0);
      this.net.tick(dt);
      this.renderer.render(this.preview, this.camera);
      return;
    }
    this.sim.step(dt, this._input());
    this.net.tick(dt);
    this._camera(dt);
    if (this.frame % 12 === 0) this._lod();
    this.renderer.render(this.world.scene, this.camera);
    this._pace(raw);
  }
}
