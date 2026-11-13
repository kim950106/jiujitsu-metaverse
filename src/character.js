/* global THREE */
// Jiu-jitsu character in a rounded, big-headed cartoon style: gi, belt with rank bar and stripes,
// a painted face that blinks and changes expression, and a small procedural animation set.
import { GEO, BODY, BELTS, GIS, clamp, lerp, ease, TAU, pick, rand, newCanvas, FONT, fitText, drawContain } from './util.js';

export const H = BODY.thigh + BODY.shin + BODY.sole; // hip height when standing
const SPINE = 0.05; // spine pivot above the hip joint
const NECK = 0.385; // head pivot above the spine pivot
const HEAD_UP = 0.255; // head centre above the head pivot
const HR = { x: 0.3, y: 0.285, z: 0.288 }; // head radii
export const TALL = H + SPINE + NECK + HEAD_UP + HR.y * 1.16; // top of the hair

const SEIZA = 0.075 + Math.cos(1.02) * BODY.thigh; // hip height sitting on the heels
const KNEEL = 0.08 + Math.cos(0.75) * BODY.thigh; // hip height kneeling upright
const LIE = 0.17; // hip height lying on the back
const SEAT = 0.57; // hip height on a chair

export const SHRIMP = { cycle: 1.25, a: 0.45, b: 0.8, dist: 0.38, reps: 3 };
export const ROLL = { dur: 1.15, a: 0.2, b: 0.85, dist: 1.9 };
export const BOW = { dur: 1.35 };
// Two-person technique, in seconds from the start: step in and grip, takedown, move to the
// finishing hold, hold until the tap, let go and stand, bow.
export const TECH = { clinch: 0.5, down: 1.3, move: 2.3, tap: 3.5, hold: 4.8, up: 5.7, end: 7.05 };
// The tucked body rolls like an egg: centre of the tuck relative to the hips, and its half-length / half-height.
const TUCK = { cy: 0.1, cz: 0.375, a: 0.525, b: 0.3 };

const SKINS = [0xf6cfae, 0xefc09a, 0xe2ab82, 0xd0976c, 0xb07c56, 0xf3c7a8];
const HAIRS = [0x1c1613, 0x2e1f16, 0x121214, 0x3d2c20, 0x17181b, 0x6e5b45, 0x4a2f22];
const HAIR_M = ['sprout', 'zig', 'part', 'flat'];
const HAIR_F = ['bun', 'pony', 'tails', 'bob'];

const NEUTRAL = {
  tiltX: 0, drop: 0, twist: 0, bob: 0, sway: 0, spine: 0, head: 0, headZ: 0,
  aLx: 0, aLz: 0.26, aRx: 0, aRz: -0.26, fL: -0.1, fR: -0.1, fLy: 0, fRy: 0,
  lLx: 0, lLz: 0, lRx: 0, lRz: 0, sL: 0, sR: 0,
};
const KEYS = Object.keys(NEUTRAL);

// Expression shown while a given animation plays; anything else uses the character's own face.
const ANIM_FACE = {
  stance: 'focus', guardTop: 'focus', guardBottom: 'focus', shrimp: 'focus',
  roll: 'wow', bow: 'calm', sit: 'calm', stretch: 'grin', coach: 'grin',
};

let blobMat = null;
let ART = null;

function drawFace(c, kind) {
  const INK = '#1b1513';
  const MOUTH = '#6e2b2b';
  const ey = 88;
  c.clearRect(0, 0, 256, 160);
  c.lineCap = 'round';
  c.fillStyle = '#ff8fa0';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(128 + s * 88, 114, 17, 10, 0, 0, TAU);
    c.fill();
  }
  for (const s of [-1, 1]) {
    const x = 128 + s * 47;
    if (kind === 'calm') {
      c.strokeStyle = INK;
      c.lineWidth = 6;
      c.beginPath();
      c.arc(x, ey - 7, 12, 0.18 * Math.PI, 0.82 * Math.PI);
      c.stroke();
      continue;
    }
    if (kind === 'ouch') {
      // eyes squeezed shut
      c.strokeStyle = INK;
      c.lineWidth = 6;
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(x + s * 11, ey - 11);
      c.lineTo(x - s * 8, ey);
      c.lineTo(x + s * 11, ey + 11);
      c.stroke();
      continue;
    }
    const wide = kind === 'wow';
    c.fillStyle = INK;
    c.beginPath();
    c.ellipse(x, ey, wide ? 12.5 : 10.5, wide ? 13.5 : 15.5, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x - 3.5, ey - 6.5, 4.2, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(x + 4, ey + 6, 2, 0, TAU);
    c.fill();
    if (kind === 'focus') {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.translate(x, ey - 9);
      c.rotate(-s * 0.32);
      c.fillRect(-24, -26, 48, 26);
      c.restore();
      c.strokeStyle = INK;
      c.lineWidth = 5.5;
      c.beginPath();
      c.moveTo(x + s * 13, ey - 24);
      c.lineTo(x - s * 11, ey - 14);
      c.stroke();
    }
  }
  c.strokeStyle = MOUTH;
  c.fillStyle = MOUTH;
  c.lineWidth = 5;
  c.beginPath();
  if (kind === 'grin') {
    c.arc(128, 116, 15, 0, Math.PI);
    c.closePath();
    c.fill();
    c.fillStyle = '#ff9aa8';
    c.beginPath();
    c.ellipse(128, 126.5, 8, 4, 0, 0, TAU);
    c.fill();
  } else if (kind === 'wow') {
    c.ellipse(128, 124, 7.5, 9.5, 0, 0, TAU);
    c.fill();
  } else if (kind === 'ouch') {
    c.moveTo(108, 124);
    c.quadraticCurveTo(118, 113, 128, 124);
    c.quadraticCurveTo(138, 135, 148, 124);
    c.stroke();
  } else if (kind === 'focus') {
    c.arc(128, 137, 14, 1.3 * Math.PI, 1.7 * Math.PI);
    c.stroke();
  } else {
    c.arc(128, 112, 13, 0.2 * Math.PI, 0.8 * Math.PI);
    c.stroke();
  }
}

// Jacket front, painted in white so the material colour tints it: the two crossing lapels...
function drawLapels(c) {
  c.clearRect(0, 0, 128, 128);
  c.strokeStyle = '#ffffff';
  c.lineCap = 'butt';
  c.lineWidth = 15;
  c.beginPath();
  c.moveTo(27, -8);
  c.lineTo(66, 60);
  c.stroke();
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.lineWidth = 22;
  c.beginPath();
  c.moveTo(101, -8);
  c.lineTo(22, 136);
  c.stroke();
  c.restore();
  c.beginPath();
  c.moveTo(101, -8);
  c.lineTo(22, 136);
  c.stroke();
}

// ...and the open collar between them.
function drawCollar(c) {
  c.clearRect(0, 0, 128, 128);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(32, 0);
  c.lineTo(96, 0);
  c.lineTo(66, 56);
  c.closePath();
  c.fill();
}

function art() {
  if (ART) return ART;
  const tex = (w, h, draw) => {
    const cv = newCanvas(w, h);
    draw(cv.getContext('2d'));
    const t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  };
  const faces = {};
  for (const k of ['smile', 'grin', 'focus', 'calm', 'wow', 'ouch']) {
    faces[k] = new THREE.MeshLambertMaterial({ map: tex(256, 160, (c) => drawFace(c, k)), alphaTest: 0.5 });
  }
  ART = { faces, lapels: tex(128, 128, drawLapels), collar: tex(128, 128, drawCollar) };
  return ART;
}

const POSES = {
  loco(c, P, speed, dt) {
    const run = clamp((speed - 2.6) / 1.8, 0, 1);
    const mv = clamp(speed / 1.1, 0, 1);
    c.phase += dt * speed * (6.4 - 2.2 * run);
    const s = Math.sin(c.phase);
    const co = Math.cos(c.phase);
    const idle = 1 - mv;
    const A = (0.72 + 0.25 * run) * mv;
    P.lLx = -A * s;
    P.lRx = A * s;
    P.sL = (0.1 + 0.95 * Math.max(0, co)) * mv * (1 + 0.5 * run);
    P.sR = (0.1 + 0.95 * Math.max(0, -co)) * mv * (1 + 0.5 * run);
    P.aLx = A * 0.9 * s;
    P.aRx = -A * 0.9 * s;
    P.aLz = 0.26 + 0.12 * mv;
    P.aRz = -0.26 - 0.12 * mv;
    P.fL = P.fR = -0.1 - 0.25 * mv - 0.9 * run;
    P.spine = 0.03 * mv + 0.16 * run + 0.012 * Math.sin(c.time * 1.7 + c.seed) * idle;
    P.bob = 0.034 * Math.abs(co) * mv;
    P.sway = 0.07 * s * mv;
    P.headZ = -0.05 * s * mv + 0.045 * Math.sin(c.time * 0.8 + c.seed) * idle;
  },
  bow(c, P) {
    const u = clamp(c.animT / BOW.dur, 0, 1);
    const k = Math.min(1, Math.sin(Math.PI * u) * 1.7);
    P.spine = 0.72 * k;
    P.head = 0.12 * k;
    P.aLz = 0.26 - 0.1 * k;
    P.aRz = -0.26 + 0.1 * k;
  },
  sit(c, P) {
    P.drop = SEIZA - H;
    P.lLx = P.lRx = -1.02;
    P.sL = P.sR = 2.59;
    P.spine = 0.05 + 0.012 * Math.sin(c.time * 1.5 + c.seed);
    P.aLx = P.aRx = -0.25;
    P.fL = P.fR = -0.4;
    P.aLz = 0.16;
    P.aRz = -0.16;
    P.headZ = 0.03 * Math.sin(c.time * 0.7 + c.seed);
  },
  chair(c, P) {
    const sw = 0.3 * Math.sin(c.time * 2.3 + c.seed);
    P.drop = SEAT - H;
    P.lLx = P.lRx = -Math.PI / 2;
    P.sL = Math.PI / 2 + sw;
    P.sR = Math.PI / 2 - sw;
    P.spine = 0.06;
    P.aLx = P.aRx = -0.4;
    P.fL = P.fR = -0.55;
    P.aLz = 0.18;
    P.aRz = -0.18;
  },
  coach(c, P) {
    POSES.chair(c, P);
    const s = Math.sin(c.time * 0.9 + c.seed);
    if (s > 0.55) {
      P.spine = 0.3;
      P.aRx = -1.6;
      P.fR = -0.2;
      P.aRz = -0.3;
    } else if (s < -0.7) {
      P.aLx = -1.4;
      P.fL = -1.3;
      P.aLz = 0.1;
    }
  },
  desk(c, P) {
    POSES.chair(c, P);
    P.aLx = P.aRx = -0.95;
    P.fL = P.fR = -0.8;
    P.spine = 0.14;
    P.head = 0.14;
  },
  stance(c, P) {
    const b = Math.sin(c.time * 5 + c.seed);
    P.drop = -0.04 + 0.01 * b;
    P.spine = 0.24;
    P.head = -0.14;
    P.lLx = -0.5;
    P.sL = 0.6;
    P.lRx = 0.18;
    P.sR = 0.5;
    P.lLz = 0.18;
    P.lRz = -0.18;
    P.aLx = -1.1 + 0.08 * b;
    P.aRx = -0.95 - 0.08 * b;
    P.fL = -0.6;
    P.fR = -0.75;
    P.aLz = 0.12;
    P.aRz = -0.12;
  },
  arms(c, P) {
    P.aLx = -0.72;
    P.aLz = 0.1;
    P.fL = -1.7;
    P.fLy = -1.2;
    P.aRx = -0.6;
    P.aRz = -0.1;
    P.fR = -1.75;
    P.fRy = 1.2;
    P.spine = 0.02 + 0.012 * Math.sin(c.time * 1.3 + c.seed);
    P.headZ = 0.04 * Math.sin(c.time * 0.6 + c.seed);
  },
  stretch(c, P) {
    const s = Math.sin(c.time * 1.2 + c.seed);
    P.aLz = 2.5;
    P.aRz = -2.5;
    P.fL = P.fR = -0.12;
    P.sway = 0.14 * s;
    P.headZ = 0.08 * s;
    P.lLz = 0.2;
    P.lRz = -0.2;
  },
  guardBottom(c, P) {
    const s = Math.sin(c.time * 1.6 + c.seed);
    P.tiltX = -Math.PI / 2;
    P.drop = LIE - H;
    P.lLx = P.lRx = -1.9 + 0.08 * s;
    P.sL = P.sR = 1.3;
    P.lLz = 0.55;
    P.lRz = -0.55;
    P.aLx = P.aRx = -1.25 + 0.1 * s;
    P.fL = P.fR = -0.5;
    P.head = 0.35;
    P.spine = 0.12;
  },
  guardTop(c, P) {
    const s = Math.sin(c.time * 1.6 + c.seed + 1);
    P.drop = KNEEL - H;
    P.lLx = P.lRx = -0.75;
    P.sL = P.sR = 2.3;
    P.lLz = 0.3;
    P.lRz = -0.3;
    P.spine = 0.42 + 0.06 * s;
    P.aLx = P.aRx = -1.0;
    P.fL = P.fR = -0.4;
    P.head = -0.15;
  },
  shrimp(c, P) {
    const n = Math.floor(c.animT / SHRIMP.cycle);
    const u = (c.animT % SHRIMP.cycle) / SHRIMP.cycle;
    const side = n % 2 === 0 ? 1 : -1;
    let fold;
    let tw;
    let push = 0;
    if (u < SHRIMP.a) {
      fold = ease(u / SHRIMP.a);
      tw = fold;
    } else if (u < SHRIMP.b) {
      push = ease((u - SHRIMP.a) / (SHRIMP.b - SHRIMP.a));
      fold = 1 - push;
      tw = 1;
    } else {
      fold = 0;
      tw = 1 - ease((u - SHRIMP.b) / (1 - SHRIMP.b));
      push = tw;
    }
    P.tiltX = -Math.PI / 2;
    P.drop = LIE + 0.03 * tw - H;
    P.twist = side * 0.9 * tw;
    P.lLx = P.lRx = -0.25 - 1.15 * fold;
    P.sL = P.sR = 0.25 + 1.45 * fold;
    P.spine = 0.15 + 0.4 * push;
    P.aLx = P.aRx = -1.3 + 0.5 * (1 - fold);
    P.fL = P.fR = -0.5;
    P.head = 0.3;
  },
  roll(c, P) {
    const u = clamp(c.animT / ROLL.dur, 0, 1);
    let tuck;
    let spin = 0;
    if (u < ROLL.a) tuck = ease(u / ROLL.a);
    else if (u < ROLL.b) {
      tuck = 1;
      spin = (u - ROLL.a) / (ROLL.b - ROLL.a);
    } else tuck = 1 - ease((u - ROLL.b) / (1 - ROLL.b));
    P.tiltX = spin * TAU;
    P.drop = (TUCK.b - TUCK.cy - H) * tuck;
    P.spine = 1.25 * tuck;
    P.head = 0.55 * tuck;
    P.lLx = P.lRx = -1.75 * tuck;
    P.sL = P.sR = 2.1 * tuck;
    P.aLx = P.aRx = -1.4 * tuck;
    P.fL = P.fR = -0.9 * tuck;
  },
  // One half of a two-person technique. c.tech = { kind: 'ankle' | 'arm', role: 'a' | 'd', t }.
  // The attacker takes the defender down and finishes with a straight ankle lock or an armbar;
  // the defender taps the mat. Where each body stands is decided by Bout in tech.js.
  tech(c, P) {
    const T = c.tech;
    if (!T) return;
    const t = T.t;
    const atk = T.role === 'a';
    const arm = T.kind === 'arm';
    const seg = (a, b) => clamp((t - a) / (b - a), 0, 1);
    if (t < TECH.clinch) {
      POSES.stance(c, P);
      P.aLx = -1.3;
      P.aRx = -1.25;
      P.fL = -0.25;
      P.fR = -0.3;
      P.spine = 0.3;
      return;
    }
    if (t < TECH.down) {
      const v = ease(seg(TECH.clinch, TECH.down));
      if (atk) {
        // drive in and follow the opponent down onto the knees
        P.spine = 0.3 + 0.5 * Math.sin(Math.PI * v);
        P.drop = (KNEEL - H) * v;
        P.lLx = -0.5 - 0.25 * v;
        P.lRx = 0.18 - 0.93 * v;
        P.sL = 0.6 + 1.7 * v;
        P.sR = 0.5 + 1.8 * v;
        P.lLz = 0.25;
        P.lRz = -0.25;
        P.aLx = P.aRx = -1.25;
        P.fL = P.fR = -0.45;
        P.head = -0.1;
      } else {
        // fall onto the back
        P.tiltX = (-Math.PI / 2) * v;
        P.drop = (LIE - H) * v;
        P.lLx = P.lRx = -0.3 * v - 0.8 * Math.sin(Math.PI * v);
        P.sL = P.sR = 0.5 * v + 0.6 * Math.sin(Math.PI * v);
        P.lLz = 0.25;
        P.lRz = -0.25;
        P.aLx = P.aRx = -1.9 + 0.9 * v;
        P.aLz = 0.55;
        P.aRz = -0.55;
        P.fL = P.fR = -0.3;
        P.head = 0.35 * v;
        P.spine = 0.12 * v;
      }
      return;
    }
    if (t < TECH.hold) {
      const m = ease(seg(TECH.down, TECH.move));
      const h = Math.max(0, t - TECH.move);
      const pulse = m >= 1 ? Math.sin(h * 7) : 0;
      const tap = t > TECH.tap ? Math.max(0, Math.sin((t - TECH.tap) * 22)) : 0;
      if (atk && arm) {
        // armbar: lie back across the opponent, legs over the chest, the arm hugged to the body
        P.tiltX = (-Math.PI / 2) * m;
        P.drop = lerp(KNEEL, LIE + 0.05 + 0.025 * pulse, m) - H;
        P.lLx = P.lRx = -0.75;
        P.sL = P.sR = lerp(2.3, 0.95, m);
        P.lLz = lerp(0.3, 0.05, m);
        P.lRz = lerp(-0.3, -0.35, m);
        P.aLx = P.aRx = -1.1;
        P.fL = P.fR = lerp(-0.4, -1.6, m);
        P.fLy = -0.9 * m;
        P.fRy = 0.9 * m;
        P.head = 0.4 * m;
        P.spine = lerp(0.42, 0.12, m);
      } else if (atk) {
        // ankle lock: sit back with the opponent's foot hugged against the body
        P.tiltX = (-0.72 - 0.12 * pulse) * m;
        P.drop = lerp(KNEEL, 0.14, m) - H;
        P.lLx = P.lRx = lerp(-0.75, -0.95, m);
        P.sL = P.sR = lerp(2.3, 0.35, m);
        P.lLz = 0.32;
        P.lRz = -0.32;
        P.aLx = P.aRx = lerp(-1.0, -0.55, m);
        P.fL = P.fR = lerp(-0.4, -1.75, m);
        P.fLy = -1.0 * m;
        P.fRy = 1.0 * m;
        P.head = 0.35 * m;
        P.spine = lerp(0.42, 0.25, m);
      } else {
        P.tiltX = -Math.PI / 2;
        P.drop = LIE - H;
        P.head = 0.45;
        P.spine = 0.12 + 0.05 * Math.sin(h * 5);
        // the free hand slaps the mat to tap out
        P.aLx = 0;
        P.aLz = 1.3;
        P.fL = -0.2 - 0.9 * tap;
        if (arm) {
          P.aRx = -1.0;
          P.aRz = lerp(-0.55, -1.2, m);
          P.fR = lerp(-0.3, 0, m);
          P.lLx = P.lRx = -0.95 + 0.08 * Math.sin(h * 6);
          P.sL = P.sR = 1.5;
          P.lLz = 0.25;
          P.lRz = -0.25;
          P.headZ = -0.25 * m;
        } else {
          P.aRx = -0.9;
          P.aRz = -0.9;
          P.fR = -0.6;
          P.lRx = lerp(-0.3, -0.26, m);
          P.sR = lerp(0.5, 0, m);
          P.lRz = 0.15 * m;
          P.lLx = -1.2 + 0.1 * Math.sin(h * 6);
          P.sL = 1.6;
          P.lLz = 0.5;
        }
      }
      return;
    }
    if (t < TECH.up) {
      // let go, roll up through a crouch and stand
      const v = ease(seg(TECH.hold, TECH.up));
      const lying = !atk || arm;
      const k = Math.sin(Math.PI * v);
      P.tiltX = (lying ? -Math.PI / 2 : -0.72) * (1 - v);
      P.drop = ((lying ? LIE : 0.14) - H) * (1 - v) - 0.12 * k;
      P.lLx = P.lRx = -0.9 * (1 - v) - 0.5 * k;
      P.sL = P.sR = 1.0 * (1 - v) + 0.9 * k;
      P.spine = 0.3 * k;
      return;
    }
    const k = Math.min(1, Math.sin(Math.PI * seg(TECH.up, TECH.end)) * 1.7);
    P.spine = 0.72 * k;
    P.head = 0.12 * k;
    P.aLz = 0.26 - 0.1 * k;
    P.aRz = -0.26 + 0.1 * k;
  },
};

export class Character {
  constructor(o = {}) {
    this.o = Object.assign({
      belt: 'white', stripes: 0, gi: 'white', outfit: 'gi', lite: false, female: false,
      cast: false, blob: true, top: 0x2f4f6f, pants: 0x23262b,
    }, o);
    const q = this.o;
    const g = GEO();
    const A = art();
    const L = (c, more) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, more));
    const decal = (map) => ({ map, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.m = {
      top: L(0xffffff), pants: L(0xffffff), belt: L(0xffffff), bar: L(0x111111), stripe: L(0xffffff),
      skin: L(q.skin != null ? q.skin : q.player ? 0xf6cfae : pick(SKINS)),
      hair: L(q.hair != null ? q.hair : q.player ? 0x5a3d2b : pick(HAIRS)),
      shade: L(0xdddddd, decal(A.lapels)), under: L(0x222222, decal(A.collar)), dark: L(0x18191c),
    };
    const isGi = q.outfit === 'gi';
    this.detail = [];
    const fine = (o3) => {
      this.detail.push(o3);
      return o3;
    };
    const add = (parent, geo, mat, sx, sy, sz, x, y, z) => {
      const me = new THREE.Mesh(geo, mat);
      me.scale.set(sx, sy, sz);
      me.position.set(x, y, z);
      me.castShadow = !!q.cast;
      me.receiveShadow = false;
      parent.add(me);
      return me;
    };
    const grp = (parent, x, y, z) => {
      const G = new THREE.Group();
      G.position.set(x, y, z);
      parent.add(G);
      return G;
    };

    this.root = new THREE.Group();
    this.tilt = grp(this.root, 0, H, 0);
    this.rig = grp(this.tilt, 0, -H, 0);
    this.hips = grp(this.rig, 0, H, 0);
    this.spine = grp(this.hips, 0, SPINE, 0);

    // Body: the jacket skirt hides the hips, the torso narrows toward the shoulders.
    add(this.hips, g.soft, isGi ? this.m.top : this.m.pants, 0.42, 0.2, 0.29, 0, -0.02, 0);
    add(this.spine, q.lite ? g.torsoLo : g.torso, this.m.top, 0.4, 0.4, 0.27, 0, 0.2, 0);
    if (isGi) {
      fine(add(this.spine, g.chestA, this.m.under, 0.4, 0.4, 0.27, 0, 0.2, 0)).castShadow = false;
      fine(add(this.spine, g.chestB, this.m.shade, 0.4, 0.4, 0.27, 0, 0.2, 0)).castShadow = false;
    }

    // Head: skull, painted face, hair cap and one hairstyle on top of it.
    this.head = grp(this.spine, 0, NECK, 0);
    const skull = grp(this.head, 0, HEAD_UP, 0);
    skull.scale.set(HR.x, HR.y, HR.z);
    const hg = q.lite ? g.headLo : g.head;
    const bit = q.lite ? g.sphLo : g.sph;
    add(skull, hg, this.m.skin, 1, 1, 1, 0, 0, 0);
    this.faces = A.faces;
    this.baseFace = q.face || (q.player ? 'smile' : pick(['smile', 'smile', 'grin']));
    this.faceNow = this.baseFace;
    this.face = fine(add(skull, g.face, A.faces[this.baseFace], 1, 1, 1, 0, 0, 0));
    this.face.castShadow = false;
    add(skull, q.lite ? g.hairLo : g.hair, this.m.hair, 1, 1, 1, 0, 0, 0);
    // The fringe shapes the hairline; each style adds one or two pieces on top of that.
    const style = q.hairStyle || (q.player ? 'tuft' : pick(q.female ? HAIR_F : HAIR_M));
    const cut = { sprout: 'side', tuft: 'part', zig: 'zig', part: 'part', pony: 'part' }[style] || 'flat';
    fine(add(skull, g.fringe[cut], this.m.hair, 1, 1, 1, 0, 0, 0));
    if (style === 'sprout' || style === 'tuft') {
      const t = fine(add(skull, g.cone, this.m.hair, 0.12, 0.4, 0.12, 0.06, 1.24, -0.08));
      t.rotation.set(0.25, 0, -0.5);
    } else if (style === 'tails') {
      add(skull, bit, this.m.hair, 0.33, 0.36, 0.33, 0.98, -0.22, -0.3);
      add(skull, bit, this.m.hair, 0.33, 0.36, 0.33, -0.98, -0.22, -0.3);
    } else if (style === 'bun') add(skull, bit, this.m.hair, 0.38, 0.36, 0.38, 0, 1.12, -0.38);
    else if (style === 'pony') {
      add(skull, bit, this.m.hair, 0.24, 0.24, 0.24, 0, 0.5, -1.12);
      add(skull, bit, this.m.hair, 0.2, 0.5, 0.2, 0, 0.02, -1.3).rotation.x = 0.3;
    } else if (style === 'bob') add(skull, g.bob, this.m.hair, 1, 1, 1, 0, 0, 0);

    const foreMat = isGi ? this.m.top : this.m.skin;
    const arm = (sx) => {
      const U = grp(this.spine, sx * 0.2, 0.33, 0);
      add(U, g.armU, this.m.top, 1, 1, 1, 0, 0, 0);
      const F = grp(U, 0, -BODY.armU, 0);
      F.rotation.order = 'YXZ';
      add(F, g.armF, foreMat, 1, 1, 1, 0, 0, 0);
      fine(add(F, bit, this.m.skin, 0.058, 0.058, 0.058, 0, -BODY.armF - 0.03, 0));
      return [U, F];
    };
    [this.armL, this.foreL] = arm(1);
    [this.armR, this.foreR] = arm(-1);

    const footMat = q.outfit === 'casual' ? this.m.dark : this.m.skin;
    const leg = (sx) => {
      const T = grp(this.hips, sx * 0.1, 0, 0);
      add(T, g.thigh, this.m.pants, 1, 1, 1, 0, 0, 0);
      const S = grp(T, 0, -BODY.thigh, 0);
      add(S, g.shin, this.m.pants, 1, 1, 1, 0, 0, 0);
      fine(add(S, bit, footMat, 0.078, BODY.sole, 0.118, 0, -BODY.shin, 0.04));
      return [T, S];
    };
    [this.legL, this.shinL] = leg(1);
    [this.legR, this.shinR] = leg(-1);

    // Belt: band, knot, and two hanging ends. One end carries the rank bar and its stripes.
    this.stripes = [];
    if (isGi) {
      const B = grp(this.hips, 0, 0.072, 0);
      add(B, g.soft, this.m.belt, 0.436, 0.07, 0.302, 0, 0, 0);
      fine(add(B, g.soft, this.m.belt, 0.085, 0.078, 0.05, 0, 0, 0.157));
      const eA = fine(grp(B, 0.022, -0.012, 0.168));
      eA.rotation.z = 0.44;
      add(eA, g.box, this.m.belt, 0.058, 0.17, 0.014, 0, -0.085, 0);
      add(eA, g.box, this.m.bar, 0.061, 0.07, 0.017, 0, -0.115, 0.001);
      if (!q.lite) {
        for (let i = 0; i < 4; i++) {
          this.stripes.push(add(eA, g.box, this.m.stripe, 0.063, 0.009, 0.02, 0, -0.092 - i * 0.0148, 0.001));
        }
      }
      const eB = fine(grp(B, -0.022, -0.012, 0.168));
      eB.rotation.z = -0.44;
      add(eB, g.box, this.m.belt, 0.058, 0.17, 0.014, 0, -0.085, 0);
    }

    if (isGi && (q.patchMat || !q.lite)) {
      let pm = q.patchMat;
      if (!pm) {
        this.patchCv = newCanvas(256, 208);
        this.patchTex = new THREE.CanvasTexture(this.patchCv);
        pm = new THREE.MeshLambertMaterial({ map: this.patchTex });
        this.m.patch = pm;
      }
      const P = new THREE.Mesh(g.plane, pm);
      P.scale.set(0.23, 0.187, 1);
      P.position.set(0, 0.215, -0.131);
      P.rotation.set(0.034, Math.PI, 0);
      this.spine.add(fine(P));
      if (this.patchCv) this.drawPatch(null, '');
    }

    if (q.outfit === 'ref') {
      this.m.band1 = L(0x1f9d55);
      this.m.band2 = L(0xf2c230);
      add(this.foreR, g.cyl8, this.m.band1, 0.078, 0.03, 0.078, 0, -0.04, 0);
      add(this.foreR, g.cyl8, this.m.band2, 0.081, 0.03, 0.081, 0, -0.072, 0);
    }

    if (q.player || q.medal) {
      this.medal = grp(this.spine, 0, 0, 0);
      this.m.gold = L(0xf2c230);
      this.m.ribbon = L(0xc62828);
      const d = add(this.medal, g.cyl, this.m.gold, 0.05, 0.014, 0.05, 0, 0.17, 0.152);
      d.rotation.x = Math.PI / 2;
      add(this.medal, g.box, this.m.ribbon, 0.034, 0.15, 0.008, 0, 0.27, 0.144);
      this.medal.visible = false;
    }

    if (q.blob) {
      if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false });
      const b = new THREE.Mesh(g.disc, blobMat);
      b.rotation.x = -Math.PI / 2;
      b.scale.set(0.34, 0.34, 1);
      b.position.y = 0.012;
      this.root.add(b);
      this.blob = b;
      this.lod = 0;
    }

    this.P = Object.assign({}, NEUTRAL);
    this.C = Object.assign({}, NEUTRAL);
    this.anim = 'loco';
    this.animT = 0;
    this.time = 0;
    this.phase = Math.random() * TAU;
    this.seed = Math.random() * 10;
    this.blinkT = rand(0.5, 4);
    this.blink = 0;
    this.label = null;
    this.tech = null;
    this.lod = 0;
    this.setLook({});
  }

  setLook(look) {
    Object.assign(this.o, look);
    const q = this.o;
    if (q.outfit === 'gi') {
      const gc = GIS[q.gi].color;
      this.m.top.color.setHex(gc);
      this.m.pants.color.setHex(gc);
      if (q.gi === 'black') this.m.shade.color.setHex(0x3a3c44);
      else this.m.shade.color.setHex(gc).multiplyScalar(q.gi === 'white' ? 0.8 : 0.72);
      const b = BELTS[q.belt];
      this.m.belt.color.setHex(q.belt === 'white' && q.gi === 'white' ? 0xd9d5c8 : b.color);
      this.m.bar.color.setHex(b.bar);
      this.stripes.forEach((s, i) => { s.visible = i < q.stripes; });
      this.m.under.color.setHex(q.female ? 0x23262d : this.m.skin.color.getHex());
    } else if (q.outfit === 'ref') {
      this.m.top.color.setHex(0x17191c);
      this.m.pants.color.setHex(0x17191c);
    } else {
      this.m.top.color.setHex(q.top);
      this.m.pants.color.setHex(q.pants);
    }
  }

  // 0 hides the medal; 1, 2, 3 show gold, silver, bronze.
  setMedal(place) {
    if (!this.medal) return;
    const n = place === true ? 1 : place | 0;
    this.medal.visible = n > 0;
    if (n > 0) this.m.gold.color.setHex([0xf2c230, 0xc9ced6, 0xb9773c][Math.min(n, 3) - 1]);
  }

  // Far-away characters drop their small parts (hands, face, belt ends, lapels).
  setLod(far) {
    const lod = far ? 1 : 0;
    if (lod === this.lod) return;
    this.lod = lod;
    for (const o3 of this.detail) o3.visible = !far;
  }

  drawPatch(img, text) {
    if (!this.patchCv) return;
    const c = this.patchCv.getContext('2d');
    const W = 256;
    const Hh = 208;
    c.fillStyle = '#f4f2ec';
    c.fillRect(0, 0, W, Hh);
    if (img) drawContain(c, img, 0, 0, W, Hh, 12);
    else {
      c.strokeStyle = '#15171a';
      c.lineWidth = 10;
      c.strokeRect(12, 12, W - 24, Hh - 24);
      c.fillStyle = '#15171a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, (text || 'JIU-JITSU').toUpperCase(), W / 2, Hh / 2 + 4, W - 52, 64);
    }
    this.patchTex.needsUpdate = true;
  }

  setLabel(text) {
    if (this.label) {
      this.root.remove(this.label);
      this.label.material.map.dispose();
      this.label.material.dispose();
      this.label = null;
    }
    if (!text) return;
    const cv = newCanvas(256, 64);
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(15,17,20,.84)';
    c.fillRect(0, 6, 256, 52);
    c.fillStyle = '#ffd79a';
    c.fillRect(0, 54, 256, 4);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = FONT(28, 700);
    fitText(c, text, 128, 31, 236, 28, 700);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
    sp.scale.set(1.2, 0.3, 1);
    sp.position.set(0, TALL + 0.3, 0);
    this.root.add(sp);
    this.label = sp;
  }

  play(name) {
    if (this.anim === 'roll') this.C.tiltX = 0;
    this.anim = POSES[name] ? name : 'loco';
    this.animT = 0;
  }

  update(dt, speed = 0) {
    this.animT += dt;
    this.time += dt;
    const P = this.P;
    const C = this.C;
    for (const k of KEYS) P[k] = NEUTRAL[k];
    POSES[this.anim](this, P, speed, dt);
    const k = 1 - Math.exp(-20 * dt);
    for (const key of KEYS) C[key] += (P[key] - C[key]) * k;
    let ty = H + C.drop + C.bob;
    let tz = 0;
    if (this.anim === 'roll') {
      // Rotate about the middle of the tucked body and keep it resting on the mat as it turns over.
      C.tiltX = P.tiltX;
      const s = Math.sin(C.tiltX);
      const co = Math.cos(C.tiltX);
      ty += Math.hypot(TUCK.a * s, TUCK.b * co) - TUCK.b - (TUCK.cy * (co - 1) - TUCK.cz * s);
      tz = TUCK.cz * (1 - co) - TUCK.cy * s;
    }
    this.tilt.position.set(0, ty, tz);
    this.tilt.rotation.set(C.tiltX, 0, C.sway);
    this.rig.rotation.y = C.twist;
    this.spine.rotation.x = C.spine;
    this.head.rotation.set(C.head, 0, C.headZ);
    this.armL.rotation.set(C.aLx, 0, C.aLz);
    this.armR.rotation.set(C.aRx, 0, C.aRz);
    this.foreL.rotation.set(C.fL, C.fLy, 0);
    this.foreR.rotation.set(C.fR, C.fRy, 0);
    this.legL.rotation.set(C.lLx, 0, C.lLz);
    this.legR.rotation.set(C.lRx, 0, C.lRz);
    this.shinL.rotation.x = C.sL;
    this.shinR.rotation.x = C.sR;
    if (this.blob) {
      const lying = Math.abs(Math.sin(C.tiltX)) > 0.5;
      this.blob.scale.set(lying ? 0.4 : 0.34, lying ? 0.62 : 0.34, 1);
    }

    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkT = rand(2.2, 5.5);
      this.blink = 0.13;
    }
    if (this.blink > 0) this.blink -= dt;
    let mood = ANIM_FACE[this.anim] || this.baseFace;
    if (this.anim === 'tech' && this.tech) {
      const tt = this.tech.t;
      if (tt >= TECH.up) mood = 'calm';
      else if (tt >= TECH.hold) mood = this.baseFace;
      else if (this.tech.role === 'a') mood = 'focus';
      else mood = tt < TECH.clinch ? 'focus' : tt < TECH.down ? 'wow' : 'ouch';
    }
    const want = this.blink > 0 && mood !== 'ouch' ? 'calm' : mood;
    if (want !== this.faceNow) {
      this.faceNow = want;
      this.face.material = this.faces[want];
    }
  }

  // Jump straight to the current pose (used right after spawning).
  settle() {
    this.update(0.0001, 0);
    for (const key of KEYS) this.C[key] = this.P[key];
    this.update(0.0001, 0);
  }

  dispose() {
    for (const k in this.m) this.m[k].dispose();
    if (this.patchTex) this.patchTex.dispose();
    this.setLabel(null);
  }
}
