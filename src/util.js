/* global THREE, document */
// Shared helpers: math, palette data, and the World container that every map is built on.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function turnToward(a, b, maxStep) {
  const d = angDiff(a, b);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}

// A name as shown to other people: no control or invisible characters, at most 12 long.
export function cleanName(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁯﻿]/g, '').trim().slice(0, 12);
}

// "with <name>" in Korean: 와 after a syllable that ends open, 과 after one that ends closed. A name
// that does not end in a Hangul syllable gets both, the way forms print it.
export function withName(name) {
  const c = name ? name.charCodeAt(name.length - 1) : 0;
  if (c < 0xac00 || c > 0xd7a3) return `${name}와(과)`;
  return `${name}${(c - 0xac00) % 28 ? '과' : '와'}`;
}

// Belt data. minutes = adult match length at that belt.
export const BELTS = {
  white: { name: '흰 띠', color: 0xe9e6dc, css: '#e9e6dc', bar: 0x141414, minutes: 5 },
  blue: { name: '파란 띠', color: 0x2a62d4, css: '#2a62d4', bar: 0x141414, minutes: 6 },
  purple: { name: '보라 띠', color: 0x6a3fa3, css: '#6a3fa3', bar: 0x141414, minutes: 7 },
  brown: { name: '갈색 띠', color: 0x6b4426, css: '#6b4426', bar: 0x141414, minutes: 8 },
  black: { name: '검은 띠', color: 0x161616, css: '#161616', bar: 0xc62828, minutes: 10 },
};
export const BELT_ORDER = ['white', 'blue', 'purple', 'brown', 'black'];
export const GIS = {
  white: { name: '흰색', color: 0xf3f2ee },
  blue: { name: '로열 블루', color: 0x2148b5 },
  black: { name: '검정', color: 0x1d1e22 },
};

export const FONT = (px, weight = 900) =>
  `${weight} ${px}px "Black Han Sans", "IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;

export function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Draw text shrunk to fit maxW. Returns the size used.
export function fitText(c, text, x, y, maxW, px, weight = 900) {
  let s = px;
  c.font = FONT(s, weight);
  while (s > 9 && c.measureText(text).width > maxW) {
    s -= 2;
    c.font = FONT(s, weight);
  }
  c.fillText(text, x, y);
  return s;
}

// Draw an image scaled to fit inside a box, centred.
export function drawContain(c, img, x, y, w, h, pad = 0) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const s = Math.min((w - pad * 2) / iw, (h - pad * 2) / ih);
  const dw = iw * s;
  const dh = ih * s;
  c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Unit box with rounded edges. r is the corner radius in unit space; tx/tz narrow the top.
// With plane=true the same shaping is applied to a single front face, pushed out slightly, for decals.
function softBox(seg, r, tx = 1, tz = 1, plane = false, push = 0) {
  const g = plane ? new THREE.PlaneGeometry(1, 1, seg, seg) : new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  const lim = 0.5 - r;
  const half = seg / 2;
  const remap = (t) => {
    const k = Math.round(Math.abs(t) * seg);
    if (k === 0) return 0;
    return Math.sign(t) * (k === 1 ? lim : lim + (r * (k - 1)) / (half - 1));
  };
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.set(remap(pos.getX(i)), remap(pos.getY(i)), plane ? 0.5 : remap(pos.getZ(i)));
    q.set(clamp(p.x, -lim, lim), clamp(p.y, -lim, lim), clamp(p.z, -lim, lim));
    n.copy(p).sub(q).normalize();
    p.copy(q).addScaledVector(n, r + push);
    if (plane) uv.setXY(i, p.x + 0.5, p.y + 0.5);
    const f = p.y + 0.5;
    pos.setXYZ(i, p.x * (1 + (tx - 1) * f), p.y, p.z * (1 + (tz - 1) * f));
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// Sleeve or trouser leg hanging from a joint at the origin: rounded on top, slightly flared at the cuff.
function limbGeo(rTop, rCuff, len, seg) {
  const pts = [new THREE.Vector2(0.0001, -len), new THREE.Vector2(rCuff, -len)];
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0001, rTop * Math.cos(a)), rTop * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, seg);
}

// Fringe: a strip of hair shell over the forehead. edge(az, i) gives the height of its lower edge
// (elevation in radians) at each column, which is what shapes the bangs.
function fringeGeo(edge) {
  const seg = 12;
  const rows = 3;
  const R = 1.066;
  const top = 0.85;
  const pos = [];
  const nor = [];
  const idx = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= seg; i++) {
      const az = (i / seg - 0.5) * 1.96;
      const el = top + (edge(az, i) - top) * (j / rows);
      const x = Math.sin(az) * Math.cos(el);
      const y = Math.sin(el);
      const z = Math.cos(az) * Math.cos(el);
      pos.push(x * R, y * R, z * R);
      nor.push(x, y, z);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const c = a + seg + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// Character sizes shared by the model and its poses.
export const BODY = { thigh: 0.2, shin: 0.19, sole: 0.055, armU: 0.16, armF: 0.14 };

let _geo = null;
export function GEO() {
  if (!_geo) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 1, 0, 0, 0, 0, 1, 1, 0]), 3));
    tri.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 0.5, 0, 1, 1]), 2));
    _geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
      cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
      sph: new THREE.SphereGeometry(1, 14, 10),
      sphLo: new THREE.SphereGeometry(1, 7, 5),
      plane: new THREE.PlaneGeometry(1, 1),
      disc: new THREE.CircleGeometry(1, 18),
      tri,
      // character parts
      head: new THREE.SphereGeometry(1, 26, 18),
      headLo: new THREE.SphereGeometry(1, 16, 11),
      face: new THREE.SphereGeometry(1.014, 12, 8, Math.PI / 2 - 1.0, 2.0, 0.95, 1.3),
      cone: new THREE.ConeGeometry(1, 1, 7),
      // hair shell: open toward the face, so the hairline is a clean edge
      hair: new THREE.SphereGeometry(1.06, 26, 13, 0, TAU, 0, 1.95).rotateX(-0.7),
      hairLo: new THREE.SphereGeometry(1.06, 16, 8, 0, TAU, 0, 1.95).rotateX(-0.7),
      fringe: {
        flat: fringeGeo(() => 0.2),
        zig: fringeGeo((az, i) => 0.13 + (i % 2 ? 0.2 : 0)),
        part: fringeGeo((az) => 0.16 + 0.44 * Math.max(0, 1 - Math.abs(az) / 0.4)),
        side: fringeGeo((az) => 0.36 - 0.26 * az),
      },
      // hair hanging round the sides and back, below the shell
      bob: new THREE.SphereGeometry(1.07, 18, 4, Math.PI / 2 + 1.01, TAU - 2.02, 1.483, 1.17),
      soft: softBox(4, 0.2),
      torso: softBox(6, 0.2, 0.84, 0.9),
      torsoLo: softBox(4, 0.2, 0.84, 0.9),
      chestA: softBox(6, 0.2, 0.84, 0.9, true, 0.014),
      chestB: softBox(6, 0.2, 0.84, 0.9, true, 0.028),
      armU: limbGeo(0.064, 0.071, BODY.armU, 9),
      armF: limbGeo(0.067, 0.082, BODY.armF, 9),
      thigh: limbGeo(0.09, 0.094, BODY.thigh, 9),
      shin: limbGeo(0.088, 0.102, BODY.shin, 9),
    };
  }
  return _geo;
}

export class World {
  constructor(name, label) {
    this.name = name;
    this.label = label;
    this.scene = new THREE.Scene();
    this.colliders = [];
    this.zones = [];
    this.npcs = [];
    this.tickers = [];
    this.interact = [];
    this.logoSlots = { gym: [], event: [] };
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.cam = { minX: -50, maxX: 50, minZ: -50, maxZ: 50, maxY: 30 };
    this.sun = null;
    this._mats = new Map();
    this._own = [];
    this._tex = {};
  }

  own(x) {
    this._own.push(x);
    return x;
  }

  mat(color, o = {}) {
    const key = `${color}|${o.emissive || 0}|${o.basic ? 1 : 0}|${o.opacity == null ? 1 : o.opacity}|${o.side || 0}`;
    let m = this._mats.get(key);
    if (!m) {
      m = o.basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
      if (o.emissive && !o.basic) m.emissive = new THREE.Color(o.emissive);
      if (o.opacity != null && o.opacity < 1) {
        m.transparent = true;
        m.opacity = o.opacity;
        m.depthWrite = false;
      }
      if (o.side) m.side = o.side;
      this._mats.set(key, m);
    }
    return m;
  }

  texMat(tex, o = {}) {
    const m = o.basic
      ? new THREE.MeshBasicMaterial({ map: tex, color: o.color == null ? 0xffffff : o.color })
      : new THREE.MeshLambertMaterial({ map: tex, color: o.color == null ? 0xffffff : o.color });
    if (o.transparent) m.transparent = true;
    return this.own(m);
  }

  _place(m, p) {
    if (p.rotX) m.rotation.x = p.rotX;
    if (p.rotY) m.rotation.y = p.rotY;
    if (p.rotZ) m.rotation.z = p.rotZ;
    m.castShadow = !!p.cast;
    m.receiveShadow = p.receive !== false;
    (p.parent || this.scene).add(m);
    return m;
  }

  // Box sitting on y (y is the bottom). collide adds an axis-aligned collider.
  box(p) {
    const m = new THREE.Mesh(GEO().box, p.mat || this.mat(p.color == null ? 0x888888 : p.color, p));
    m.scale.set(p.w, p.h, p.d);
    m.position.set(p.x || 0, (p.y || 0) + p.h / 2, p.z || 0);
    this._place(m, p);
    if (p.collide) {
      const c = Math.abs(Math.cos(p.rotY || 0));
      const s = Math.abs(Math.sin(p.rotY || 0));
      const hx = (p.w * c + p.d * s) / 2;
      const hz = (p.w * s + p.d * c) / 2;
      const x = p.x || 0;
      const z = p.z || 0;
      this.collider(x - hx, x + hx, z - hz, z + hz, p.y || 0, (p.y || 0) + p.h);
    }
    return m;
  }

  // Box with a tiling texture: UVs are scaled so `tile` metres = one texture repeat.
  texBox(p) {
    const g = this.own(new THREE.BoxGeometry(p.w, p.h, p.d));
    const uv = g.attributes.uv;
    const t = p.tile || 1;
    const spans = [
      [p.d, p.h], [p.d, p.h], [p.w, p.d], [p.w, p.d], [p.w, p.h], [p.w, p.h],
    ];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * spans[f][0] / t, uv.getY(k) * spans[f][1] / t);
      }
    }
    const m = new THREE.Mesh(g, p.mat || this.texMat(p.tex, p));
    m.position.set(p.x || 0, (p.y || 0) + p.h / 2, p.z || 0);
    this._place(m, p);
    if (p.collide) {
      const x = p.x || 0;
      const z = p.z || 0;
      this.collider(x - p.w / 2, x + p.w / 2, z - p.d / 2, z + p.d / 2, p.y || 0, (p.y || 0) + p.h);
    }
    return m;
  }

  // Vertical cylinder sitting on y, or centred on y when p.center is set.
  cyl(p) {
    let m;
    const mt = p.mat || this.mat(p.color == null ? 0x888888 : p.color, p);
    if (p.rTop != null) {
      m = new THREE.Mesh(this.own(new THREE.CylinderGeometry(p.rTop, p.r, p.h, p.seg || 12)), mt);
    } else {
      m = new THREE.Mesh(p.seg === 8 ? GEO().cyl8 : GEO().cyl, mt);
      m.scale.set(p.r, p.h, p.r);
    }
    m.position.set(p.x || 0, p.center ? (p.y || 0) : (p.y || 0) + p.h / 2, p.z || 0);
    this._place(m, p);
    if (p.collide) {
      const x = p.x || 0;
      const z = p.z || 0;
      this.collider(x - p.r, x + p.r, z - p.r, z + p.r, p.y || 0, (p.y || 0) + p.h);
    }
    return m;
  }

  sphere(p) {
    const m = new THREE.Mesh(p.lo ? GEO().sphLo : GEO().sph, p.mat || this.mat(p.color == null ? 0x888888 : p.color, p));
    m.scale.set(p.r * (p.sx || 1), p.r * (p.sy || 1), p.r * (p.sz || 1));
    m.position.set(p.x || 0, p.y || 0, p.z || 0);
    return this._place(m, p);
  }

  // Horizontal textured (or flat-coloured) rectangle at height y.
  floor(p) {
    const g = this.own(new THREE.PlaneGeometry(p.w, p.d));
    if (p.tex) {
      const uv = g.attributes.uv;
      const t = p.tile || 1;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * p.w / t, uv.getY(i) * p.d / t);
    }
    const m = new THREE.Mesh(g, p.mat || (p.tex ? this.texMat(p.tex, p) : this.mat(p.color, p)));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x || 0, p.y || 0, p.z || 0);
    m.receiveShadow = true;
    (p.parent || this.scene).add(m);
    return m;
  }

  collider(minX, maxX, minZ, maxZ, bottom = 0, top = 3) {
    const c = { minX, maxX, minZ, maxZ, bottom, top };
    this.colliders.push(c);
    return c;
  }

  zone(z) {
    this.zones.push(z);
    return z;
  }

  canvasTex(w, h, draw, o = {}) {
    const cv = newCanvas(w, h);
    const c = cv.getContext('2d');
    if (draw) draw(c, w, h);
    const tex = new THREE.CanvasTexture(cv);
    if (o.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    this.own(tex);
    return { tex, cv, c };
  }

  // Flat sign with a canvas texture. draw(c, W, H, img) is called again when a logo image is applied.
  sign(p) {
    const res = p.res || 96;
    const W = Math.min(1024, Math.max(32, Math.round(p.w * res)));
    const H = Math.min(1024, Math.max(32, Math.round(p.h * res)));
    const t = this.canvasTex(W, H, (c) => p.draw(c, W, H, null));
    const mt = p.lit
      ? new THREE.MeshLambertMaterial({ map: t.tex })
      : new THREE.MeshBasicMaterial({ map: t.tex });
    if (p.transparent) mt.transparent = true;
    this.own(mt);
    const gap = p.gap || 0;
    const mk = (rot) => {
      const m = new THREE.Mesh(GEO().plane, mt);
      m.scale.set(p.w, p.h, 1);
      m.position.set((p.x || 0) + Math.sin(rot) * gap, p.y || 0, (p.z || 0) + Math.cos(rot) * gap);
      m.rotation.y = rot;
      if (p.flat) {
        m.rotation.set(-Math.PI / 2, 0, rot);
      }
      (p.parent || this.scene).add(m);
      return m;
    };
    const mesh = mk(p.rotY || 0);
    let back = null;
    if (p.double) back = mk((p.rotY || 0) + Math.PI);
    const s = {
      mesh, back, tex: t.tex, c: t.c, W, H,
      redraw: (img) => {
        t.c.clearRect(0, 0, W, H);
        p.draw(t.c, W, H, img || null);
        t.tex.needsUpdate = true;
      },
    };
    return s;
  }

  // Floating text label that always faces the camera.
  sprite(text, x, y, z, scale = 1) {
    const t = this.canvasTex(320, 72, (c) => {
      c.fillStyle = 'rgba(15,17,20,.86)';
      c.fillRect(0, 6, 320, 60);
      c.fillStyle = '#ffd79a';
      c.fillRect(0, 61, 320, 5);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, text, 160, 34, 296, 32, 700);
    });
    const sp = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: t.tex, depthWrite: false })));
    sp.scale.set(2.4 * scale, 0.54 * scale, 1);
    sp.position.set(x, y, z);
    this.scene.add(sp);
    return sp;
  }

  logoSlot(kind, s) {
    this.logoSlots[kind].push(s);
    return s;
  }

  applyLogos(logos) {
    for (const kind of ['gym', 'event']) {
      for (const s of this.logoSlots[kind]) s.redraw(logos ? logos[kind] : null);
    }
  }

  /* ---------- procedural textures (cached per world) ---------- */
  _cached(key, w, h, draw) {
    if (!this._tex[key]) this._tex[key] = this.canvasTex(w, h, draw, { repeat: true }).tex;
    return this._tex[key];
  }

  texRubber() {
    return this._cached('rubber', 256, 256, (c) => {
      const sh = ['#3a3c3f', '#43464a', '#4d5054', '#36383b', '#484b4f', '#3f4245', '#55585c'];
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          c.fillStyle = pick(sh);
          c.fillRect(i * 64, j * 64, 64, 64);
        }
      }
      c.strokeStyle = '#27292b';
      c.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, 256); c.stroke();
        c.beginPath(); c.moveTo(0, i * 64); c.lineTo(256, i * 64); c.stroke();
      }
    });
  }

  texMatColor(key, base, seam) {
    return this._cached('mat' + key, 256, 256, (c) => {
      c.fillStyle = base;
      c.fillRect(0, 0, 256, 256);
      c.strokeStyle = seam;
      c.lineWidth = 2;
      for (const x of [1, 128]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
      c.beginPath(); c.moveTo(0, 1); c.lineTo(256, 1); c.stroke();
    });
  }

  texBrick(kind) {
    return this._cached('brick' + kind, 256, 128, (c) => {
      const red = kind === 'red';
      const cols = red ? ['#9a4a35', '#a85640', '#8c4230', '#b06048', '#964e3a', '#a25038'] : ['#f1efea', '#e8e6e0', '#f6f4ef', '#ecebe5'];
      c.fillStyle = red ? '#cbbfb0' : '#d2cfc8';
      c.fillRect(0, 0, 256, 128);
      for (let r = 0; r < 8; r++) {
        const off = r % 2 ? 32 : 0;
        for (let k = -1; k < 5; k++) {
          c.fillStyle = pick(cols);
          c.fillRect(k * 64 + off + 2, r * 16 + 2, 60, 12);
        }
      }
    });
  }

  texPlank(kind) {
    return this._cached('plank' + kind, 256, 256, (c) => {
      const cols = kind === 'black'
        ? ['#1d1d1f', '#232326', '#19191b', '#27272a', '#202023']
        : ['#8a5a36', '#7d5030', '#96643e', '#84562f', '#8f5f3a'];
      for (let i = 0; i < 8; i++) {
        c.fillStyle = pick(cols);
        c.fillRect(i * 32, 0, 32, 256);
        c.fillStyle = kind === 'black' ? 'rgba(0,0,0,.5)' : 'rgba(40,20,5,.45)';
        c.fillRect(i * 32, 0, 2, 256);
      }
    });
  }

  texWoodFloor() {
    return this._cached('woodfloor', 512, 256, (c) => {
      const cols = ['#d9b98a', '#d2b182', '#dfc093', '#cfad7c', '#d6b586'];
      for (let r = 0; r < 8; r++) {
        let x = -((r * 97) % 160);
        while (x < 512) {
          const len = 120 + ((r * 53 + x) % 90);
          c.fillStyle = pick(cols);
          c.fillRect(x, r * 32, len, 32);
          c.fillStyle = 'rgba(90,60,20,.28)';
          c.fillRect(x, r * 32, 2, 32);
          x += len;
        }
        c.fillStyle = 'rgba(90,60,20,.3)';
        c.fillRect(0, r * 32, 512, 1.5);
      }
    });
  }

  texGrass() {
    return this._cached('grass', 256, 256, (c) => {
      c.fillStyle = '#7fb24f';
      c.fillRect(0, 0, 256, 256);
      const cols = ['#88ba55', '#76aa49', '#93c25f', '#6fa244', '#84b652'];
      // mowing stripes, then short blades scattered over them
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
        c.fillRect(i * 64, 0, 64, 256);
      }
      for (let i = 0; i < 1500; i++) {
        c.fillStyle = pick(cols);
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        c.fillRect(x, y, 2, 3 + Math.random() * 4);
      }
    });
  }

  texDeck() {
    return this._cached('deck', 256, 256, (c) => {
      const cols = ['#b08a5e', '#a78157', '#b99368', '#a17b52', '#ad875c'];
      for (let i = 0; i < 8; i++) {
        c.fillStyle = pick(cols);
        c.fillRect(0, i * 32, 256, 32);
        c.fillStyle = 'rgba(60,35,10,.5)';
        c.fillRect(0, i * 32, 256, 2.5);
        c.fillStyle = 'rgba(60,35,10,.35)';
        c.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
      }
    });
  }

  // One tile of an apartment front: four flats wide, six floors tall. Each flat has a wide
  // balcony window with a railing, the way slab blocks are built.
  texFlats() {
    return this._cached('flats', 512, 512, (c) => {
      const W = 512;
      const fw = W / 4;
      const fh = W / 6;
      c.fillStyle = '#e7e1d5';
      c.fillRect(0, 0, W, W);
      for (let r = 0; r < 6; r++) {
        for (let k = 0; k < 4; k++) {
          const x = k * fw;
          const y = r * fh;
          // balcony glazing
          c.fillStyle = pick(['#6f849b', '#677d95', '#7a8fa5', '#5f768f']);
          c.fillRect(x + 12, y + 14, fw - 24, fh - 34);
          c.fillStyle = 'rgba(255,255,255,.22)';
          c.fillRect(x + 12, y + 14, fw - 24, 10);
          // mullions
          c.fillStyle = '#f4f1ea';
          for (const u of [0.34, 0.66]) c.fillRect(x + 12 + (fw - 24) * u - 1.5, y + 14, 3, fh - 34);
          // a few drawn blinds
          if (Math.random() < 0.3) {
            c.fillStyle = 'rgba(240,236,226,.75)';
            c.fillRect(x + 14, y + 16, (fw - 28) * (0.3 + Math.random() * 0.36), fh - 44);
          }
          // railing and slab edge
          c.fillStyle = '#d9d3c6';
          c.fillRect(x + 8, y + fh - 22, fw - 16, 8);
          c.fillStyle = '#c9c2b4';
          c.fillRect(x, y + fh - 6, fw, 6);
        }
      }
      // party walls between flats
      c.fillStyle = '#ddd7ca';
      for (let k = 0; k <= 4; k++) c.fillRect(k * fw - 3, 0, 6, W);
    });
  }

  // The same front after dark: the wall is a shadow and some of the windows are lit.
  texFlatsNight() {
    return this._cached('flatsNight', 512, 512, (c) => {
      const W = 512;
      const fw = W / 4;
      const fh = W / 6;
      c.fillStyle = '#1d212b';
      c.fillRect(0, 0, W, W);
      for (let r = 0; r < 6; r++) {
        for (let k = 0; k < 4; k++) {
          const x = k * fw;
          const y = r * fh;
          const lit = Math.random() < 0.44;
          c.fillStyle = lit ? pick(['#ffd98a', '#ffe7b0', '#ffcf73', '#fff1cf', '#cfe0ff']) : pick(['#10141d', '#141a26', '#0e1219']);
          c.fillRect(x + 12, y + 14, fw - 24, fh - 34);
          if (lit && Math.random() < 0.5) {
            // a curtain half drawn
            c.fillStyle = 'rgba(40,30,20,.45)';
            c.fillRect(x + 14, y + 16, (fw - 28) * (0.25 + Math.random() * 0.3), fh - 38);
          }
          c.fillStyle = '#232834';
          for (const u of [0.34, 0.66]) c.fillRect(x + 12 + (fw - 24) * u - 1.5, y + 14, 3, fh - 34);
          c.fillStyle = '#2a2f3b';
          c.fillRect(x + 8, y + fh - 22, fw - 16, 8);
          c.fillStyle = '#181c25';
          c.fillRect(x, y + fh - 6, fw, 6);
        }
      }
      c.fillStyle = '#191d27';
      for (let k = 0; k <= 4; k++) c.fillRect(k * fw - 3, 0, 6, W);
    });
  }

  // Lit material that also glows with its own colours, for things standing in daylight outside
  // while the room's own lamps are dim.
  glowMat(tex, k = 0.5, color = 0xffffff) {
    return this.own(new THREE.MeshLambertMaterial({ map: tex, color, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: k }));
  }

  // Merge the static meshes that share a material into one mesh each. A room is built from hundreds
  // of boxes; drawn one by one they cost a phone far more than their triangles do. Call once, after
  // building. Meshes marked userData.live, hidden meshes and instanced meshes are left alone.
  freeze() {
    const groups = new Map();
    for (const o of this.scene.children.slice()) {
      if (!o.isMesh || o.isInstancedMesh || o.children.length || o.userData.live || !o.visible) continue;
      const g = o.geometry;
      if (!g.index || !g.attributes.normal || !g.attributes.uv) continue;
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(o);
    }
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    const bake = (list) => {
      let nv = 0;
      let ni = 0;
      for (const o of list) {
        nv += o.geometry.attributes.position.count;
        ni += o.geometry.index.count;
      }
      const pos = new Float32Array(nv * 3);
      const nor = new Float32Array(nv * 3);
      const uv = new Float32Array(nv * 2);
      const idx = new Uint16Array(ni);
      let vo = 0;
      let io = 0;
      for (const o of list) {
        o.updateMatrix();
        nm.getNormalMatrix(o.matrix);
        const g = o.geometry;
        const gp = g.attributes.position;
        const gn = g.attributes.normal;
        const gu = g.attributes.uv;
        for (let i = 0; i < gp.count; i++) {
          const k = vo + i;
          v.fromBufferAttribute(gp, i).applyMatrix4(o.matrix);
          pos[k * 3] = v.x;
          pos[k * 3 + 1] = v.y;
          pos[k * 3 + 2] = v.z;
          v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
          nor[k * 3] = v.x;
          nor[k * 3 + 1] = v.y;
          nor[k * 3 + 2] = v.z;
          uv[k * 2] = gu.getX(i);
          uv[k * 2 + 1] = gu.getY(i);
        }
        const gi = g.index;
        for (let i = 0; i < gi.count; i++) idx[io + i] = gi.getX(i) + vo;
        vo += gp.count;
        io += gi.count;
        this.scene.remove(o);
      }
      const mg = this.own(new THREE.BufferGeometry());
      mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      mg.setIndex(new THREE.BufferAttribute(idx, 1));
      const m = new THREE.Mesh(mg, list[0].material);
      m.castShadow = list[0].castShadow;
      m.receiveShadow = list[0].receiveShadow;
      this.scene.add(m);
    };
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      // 16-bit indices: start a new merged mesh before a chunk passes 65,535 vertices
      let chunk = [];
      let count = 0;
      for (const o of list) {
        const n = o.geometry.attributes.position.count;
        if (count + n > 65535 && chunk.length) {
          if (chunk.length > 1) bake(chunk);
          chunk = [];
          count = 0;
        }
        chunk.push(o);
        count += n;
      }
      if (chunk.length > 1) bake(chunk);
    }
  }

  dispose() {
    for (const n of this.npcs) if (n.char && n.char.dispose) n.char.dispose();
    for (const o of this._own) if (o && o.dispose) o.dispose();
    for (const m of this._mats.values()) m.dispose();
    this._own.length = 0;
    this._mats.clear();
    this.npcs.length = 0;
    this.tickers.length = 0;
  }
}
