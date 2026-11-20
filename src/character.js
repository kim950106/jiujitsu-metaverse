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
// Backward roll: sit back and tuck, turn over backwards between a and b, moving `dist` backwards.
export const ROLLB = { dur: 1.3, a: 0.26, b: 0.86, dist: 1.6 };
// Hip walk: seated with the legs out in front, one hip is thrown forward at a time; each cycle
// carries the body `dist` metres forward between a and b.
export const SCOOT = { cycle: 0.8, a: 0.2, b: 0.8, dist: 0.3, reps: 5 };
export const BOW = { dur: 1.35 };
export const SHAKA = { dur: 1.7 };
export const BRIDGE = { cycle: 1.15, reps: 3 };
// Technical stand-up: sit, then between a and b (shares of the whole) rise on one hand and the
// opposite foot while the other leg swings back, moving `dist` backwards.
export const STANDUP = { dur: 2.3, a: 0.45, b: 0.82, dist: 0.4 };
// One step of the hip-walk race: quicker than the drill, and it carries the body `step` metres.
export const RACE = { stroke: 0.36, a: 0.12, b: 0.88, step: 0.34 };
// the quick shrimp of the race before it was a hip walk (still drawn for older pages)
const SHRIMPF = { stroke: 0.4, a: 0.3, b: 0.85 };
// Two-person technique, in seconds from the start: slap and bump, step in and grip, takedown,
// move to the finishing hold, the struggle (both sides hammer their button until `judge`), the
// tap, let go and stand, bow. A technique that is escaped from has its own later moments (Bout.T).
export const TECH = { greet: 0.9, clinch: 1.4, down: 2.2, move: 3.2, judge: 4.1, tap: 4.6, hold: 5.9, up: 6.8, end: 7.9 };
// Moments inside the greeting when the palms and then the fists meet.
export const GREET = { slap: 0.36, bump: 0.7 };
// The tucked body rolls like an egg: centre of the tuck relative to the hips, and its half-length / half-height.
const TUCK = { cy: 0.1, cz: 0.375, a: 0.525, b: 0.3 };

const SKINS = [0xf6cfae, 0xefc09a, 0xe2ab82, 0xd0976c, 0xb07c56, 0xf3c7a8];
const HAIRS = [0x1c1613, 0x2e1f16, 0x121214, 0x3d2c20, 0x17181b, 0x6e5b45, 0x4a2f22];
const HAIR_M = ['sprout', 'zig', 'part', 'flat'];
const HAIR_F = ['bun', 'pony', 'tails', 'bob'];

const NEUTRAL = {
  tiltX: 0, drop: 0, twist: 0, bob: 0, sway: 0, spine: 0, head: 0, headZ: 0, headY: 0,
  aLx: 0, aLz: 0.26, aRx: 0, aRz: -0.26, fL: -0.1, fR: -0.1, fLy: 0, fRy: 0,
  lLx: 0, lLz: 0, lRx: 0, lRz: 0, sL: 0, sR: 0,
  // limb length as a multiple of the real one: short cartoon limbs stretch a little to wrap a hold
  aLs: 1, aRs: 1, lLs: 1, lRs: 1,
};
const KEYS = Object.keys(NEUTRAL);

// Expression shown while a given animation plays; anything else uses the character's own face.
const ANIM_FACE = {
  stance: 'focus', guardTop: 'focus', guardBottom: 'focus', shrimp: 'focus',
  roll: 'wow', rollb: 'wow', scoot: 'focus', bow: 'calm', sit: 'calm', stretch: 'grin', coach: 'grin', shaka: 'grin',
  bridge: 'focus', standup: 'focus', shrimpf: 'focus', scootf: 'focus',
  sideTop: 'focus', sideBottom: 'focus', mountTop: 'focus', mountBottom: 'wow', backTop: 'focus', backBottom: 'wow', win: 'grin', greet: 'grin',
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

const SIT = 0.125; // hip height sitting on the mat
const PRONE = 0.15; // hip height lying face down
const pose = (o) => Object.assign({}, NEUTRAL, o);
// Both bodies at the grip, just before a technique starts.
const GRIP = pose({
  drop: -0.04, spine: 0.3, head: -0.14, lLx: -0.5, sL: 0.6, lRx: 0.18, sR: 0.5, lLz: 0.18, lRz: -0.18,
  aLx: -1.3, aRx: -1.25, fL: -0.25, fR: -0.3, aLz: 0.12, aRz: -0.12,
});
// Techniques that are drawn by blending key poses: the grip, `mid` when the first move lands, and
// the finishing `hold`, for the attacker (a) and the defender (d). `live` adds the squeeze and the
// tap on top of the hold: m is how far the hold is set (0..1), pulse swings between -1 and 1 while
// it is held, tap is 0..1 while the defender taps, h is the time held in seconds.
const MOVE = {
  // Standing guillotine. The attacker snaps the head down and wraps it under the left arm, then
  // leans back; the defender is bent over at the waist and taps the attacker's leg.
  guil: {
    a: {
      mid: pose({
        drop: -0.06, spine: 0.36, head: 0.12, lLx: -0.45, sL: 0.6, lRx: 0.15, sR: 0.45, lLz: 0.2, lRz: -0.2,
        aLx: -1.0, aLz: 0.4, fL: -0.9, fLy: -0.6, aRx: -1.15, aRz: -0.1, fR: -0.7,
      }),
      hold: pose({
        tiltX: -0.2, drop: -0.05, spine: -0.1, head: 0.25, lLx: -0.4, sL: 0.5, lRx: 0.1, sR: 0.35, lLz: 0.24, lRz: -0.24,
        aLx: -0.85, aLz: 0.6, fL: -0.7, fLy: -1.3, aRx: -0.9, aRz: 0.35, fR: -1.4, fRy: 1.2,
      }),
      live(P, m, pulse) {
        P.tiltX -= 0.05 * pulse * m;
        P.spine -= 0.04 * pulse * m;
      },
    },
    d: {
      mid: pose({
        drop: -0.06, spine: 0.8, head: 0.1, lLx: -0.4, sL: 0.6, lRx: 0.05, sR: 0.5, lLz: 0.2, lRz: -0.2,
        aLx: -1.4, aRx: -1.4, fL: -0.5, fR: -0.5, aLz: 0.3, aRz: -0.3,
      }),
      hold: pose({
        drop: -0.05, spine: 1.05, head: 0.3, lLx: -0.55, sL: 0.75, lRx: -0.1, sR: 0.6, lLz: 0.22, lRz: -0.22,
        aLx: -1.5, aLz: 0.5, fL: -0.9, fLy: -0.5, aRx: -1.3, aRz: -0.2, fR: -0.6,
      }),
      live(P, m, pulse, tap, h) {
        P.fR = -0.3 - 1.0 * tap;
        P.sR += 0.12 * Math.sin(h * 6) * m;
        P.spine += 0.03 * pulse * m;
      },
    },
  },
  // Rear naked choke. The attacker gets behind, both sit, the attacker's legs hook the waist and
  // one arm closes under the chin; the defender pulls at the arm and taps with the other hand.
  rnc: {
    a: {
      mid: pose({
        drop: -0.05, spine: 0.3, headZ: -0.3, sway: -0.08, lLx: -0.4, sL: 0.55, lRx: 0.1, sR: 0.45, lLz: 0.2, lRz: -0.2,
        aLx: -1.5, aLz: -0.2, fL: -0.9, fLy: -1.3, aLs: 1.5, aRx: -1.0, aRz: -0.3, fR: -1.1, fRy: 0.4,
      }),
      hold: pose({
        tiltX: -0.12, drop: SIT - H, sway: -0.12, spine: 0.15, headZ: -0.4, head: 0.05,
        lLx: -1.5, lRx: -1.5, lLz: 0.5, lRz: -0.5, sL: 0.25, sR: 0.25, lLs: 1.3, lRs: 1.3,
        aLx: -1.72, aLz: -0.43, fL: -0.93, fLy: -1.69, aLs: 2, aRx: -0.75, aRz: -0.82, fR: -1.26, fRy: -0.52,
      }),
      live(P, m, pulse) {
        P.tiltX -= 0.04 * pulse * m;
        P.fL -= 0.08 * pulse * m;
      },
    },
    d: {
      mid: pose({
        drop: -0.06, spine: 0.2, head: -0.1, headZ: 0.2, lLx: -0.3, sL: 0.5, lRx: 0.1, sR: 0.4, lLz: 0.18, lRz: -0.18,
        aLx: -1.0, aRx: -1.0, fL: -1.3, fR: -1.3,
      }),
      hold: pose({
        tiltX: -0.2, drop: SIT - H, spine: 0.1, head: -0.2, headZ: 0.35,
        lLx: -1.3, lRx: -1.15, sL: 0.45, sR: 0.9, lLz: 0.12, lRz: -0.18,
        aRx: -0.79, aRz: 0.93, fR: -1.07, fRy: -0.15, aLx: 0.45, aLz: 0.77, fL: -0.91, fLy: 0.19,
      }),
      live(P, m, pulse, tap, h) {
        P.fL = -0.75 - 0.75 * tap;
        P.lLx += 0.1 * Math.sin(h * 6) * m;
        P.lRx -= 0.1 * Math.sin(h * 6) * m;
        P.tiltX -= 0.04 * pulse * m;
      },
    },
  },
  // Omoplata. The defender is flattened face down; the attacker sits up beside the shoulder with
  // a leg over it and leans forward; the defender slaps the mat with the free hand.
  omo: {
    a: {
      mid: pose({
        tiltX: -0.5, drop: SIT + 0.03 - H, spine: 0.3, head: 0.2,
        lLx: -2.2, lLz: 0.3, sL: 0.9, lLs: 1.3, lRx: -1.6, lRz: -0.4, sR: 1.0,
        aLx: -1.2, aLz: 0.2, fL: -0.8, aRx: -1.2, aRz: -0.2, fR: -0.8,
      }),
      hold: pose({
        drop: SIT + 0.04 - H, spine: 0.4, head: -0.2,
        lLx: -0.36, lLz: 2.04, sL: 0.38, lLs: 1.5, lRx: -1.73, lRz: 0.02, sR: 1.3,
        aLx: 0.8, aLz: 0.27, fL: -0.07, fLy: 1.22, aLs: 1.59, aRx: -0.3, aRz: 0.43, fR: -1.38, fRy: 0.04,
      }),
      live(P, m, pulse) {
        P.spine += 0.08 * pulse * m;
      },
    },
    d: {
      mid: pose({
        tiltX: 1.4, drop: 0.3 - H, spine: 0.1, head: -0.7, lLx: -1.4, lRx: -1.4, sL: 1.5, sR: 1.5, lLz: 0.2, lRz: -0.2,
        aLx: -1.4, aRx: -1.4, aLz: 0.25, aRz: -0.25, fL: -0.1, fR: -0.1,
      }),
      hold: pose({
        tiltX: Math.PI / 2, drop: PRONE - H, spine: -0.12, head: -0.25, headY: 1.25,
        lLx: 0.1, lRx: 0.1, sL: 0.3, sR: 0.2, lLz: 0.2, lRz: -0.2,
        aLx: -1.74, aLz: 1.02, fL: -0.82, fLy: -0.31, aRx: 0.48, aRz: -0.79, fR: -1.42, fRy: 2,
      }),
      live(P, m, pulse, tap, h) {
        // the free hand lifts off the mat and slaps it
        P.aLz = lerp(P.aLz, 1.09, tap);
        P.fL = lerp(P.fL, -1.4, tap);
        P.fLy = lerp(P.fLy, 0.66, tap);
        P.sL += 0.35 * Math.max(0, Math.sin(h * 6)) * m;
        P.sR += 0.35 * Math.max(0, Math.sin(h * 6 + 1.6)) * m;
      },
    },
  },
};

// Triangle choke. The attacker pulls guard, lifts the hips and locks the legs over the neck and
// one shoulder, pulling the head down; the defender is folded forward between the thighs and
// slaps the mat with the hand that is outside.
MOVE.tri = {
  a: {
    mid: pose({
      tiltX: -Math.PI / 2, drop: LIE - H, spine: 0.12, head: 0.35,
      lLx: -1.9, lRx: -1.9, sL: 1.3, sR: 1.3, lLz: 0.55, lRz: -0.55,
      aLx: -1.25, aRx: -1.25, fL: -0.5, fR: -0.5,
    }),
    hold: pose({
      tiltX: -Math.PI / 2 - 0.55, drop: LIE + 0.2 - H, spine: 0.45, head: 0.5,
      lLx: -0.17, lLz: -0.34, sL: 1.21, lLs: 1.6, lRx: -0.06, lRz: -0.16, sR: 1.39, lRs: 1.6,
      aLx: -0.65, aLz: -0.05, fL: -0.01, fLy: -0.73, aLs: 2.2, aRx: -0.65, aRz: 0.04, fR: -0.02, fRy: 0.73, aRs: 2.2,
    }),
    live(P, m, pulse) {
      P.drop += 0.02 * pulse * m;
      P.sL += 0.08 * pulse * m;
      P.sR += 0.08 * pulse * m;
    },
  },
  d: {
    mid: pose({
      drop: KNEEL - H, spine: 0.42, head: -0.15, lLx: -0.75, lRx: -0.75, sL: 2.3, sR: 2.3, lLz: 0.3, lRz: -0.3,
      aLx: -1.0, aRx: -1.0, fL: -0.4, fR: -0.4,
    }),
    hold: pose({
      drop: KNEEL - H, spine: 0.9, head: -0.4, lLx: -0.8, lRx: -0.8, sL: 2.3, sR: 2.3, lLz: 0.35, lRz: -0.35,
      aLx: -1.16, aLz: 0.52, fL: -0.04, fLy: -0.71, aLs: 1.59, aRx: -2.27, aRz: 0.41, fR: -0.12, fRy: -0.41, aRs: 1.49,
    }),
    live(P, m, pulse, tap, h) {
      P.fL = -0.04 - 0.75 * tap;
      P.spine += 0.05 * pulse * m;
      P.headZ = 0.12 * Math.sin(h * 5) * m;
    },
  },
};
// Kimura. The defender is on the back; the attacker kneels beside the chest, leans over it and
// bends the far arm behind in a figure-four; the defender taps the attacker's leg with the near hand.
MOVE.kim = {
  a: {
    mid: pose({
      drop: KNEEL - H, spine: 0.4, head: -0.1, lLx: -0.75, lRx: -0.75, sL: 2.3, sR: 2.3, lLz: 0.25, lRz: -0.25,
      aLx: -1.25, aRx: -1.25, fL: -0.45, fR: -0.45,
    }),
    hold: pose({
      drop: KNEEL - H - 0.02, spine: 0.82, head: 0.3, lLx: -0.8, lRx: -0.8, sL: 2.3, sR: 2.3, lLz: 0.4, lRz: -0.4,
      aRx: -2.09, aRz: 0.13, fR: -0.16, fRy: 1.05, aRs: 2, aLx: -2.02, aLz: -0.15, fL: -0.45, fLy: -0.72, aLs: 2,
    }),
    live(P, m, pulse) {
      // the crank: lean back a little and lift the wrist
      P.spine -= 0.06 * (0.5 + 0.5 * pulse) * m;
      P.aRx += 0.07 * (0.5 + 0.5 * pulse) * m;
    },
  },
  d: {
    mid: pose({
      tiltX: -Math.PI / 2, drop: LIE - H, spine: 0.12, head: 0.35, lLx: -0.7, lRx: -0.7, sL: 1.0, sR: 1.0, lLz: 0.25, lRz: -0.25,
      aLx: -1.0, aRx: -1.0, aLz: 0.55, aRz: -0.55, fL: -0.3, fR: -0.3,
    }),
    hold: pose({
      tiltX: -Math.PI / 2, drop: LIE - H, spine: 0.1, head: 0.35, headZ: 0.25, lLx: -0.95, lRx: -0.95, sL: 1.5, sR: 1.5, lLz: 0.25, lRz: -0.25,
      aLx: 1.2, aLz: 1.43, fL: -1.45, fLy: 0.15, aLs: 1.49, aRx: -2.72, aRz: 0.05, fR: -1.95, fRy: -1.16,
    }),
    live(P, m, pulse, tap, h) {
      P.fL -= 0.12 * (0.5 + 0.5 * pulse) * m; // the bent arm is levered up
      P.fR = -1.95 + 0.7 * tap;
      P.lLx += 0.1 * Math.sin(h * 6) * m;
      P.lRx -= 0.1 * Math.sin(h * 6) * m;
    },
  },
};

// Bridge: on the back with the feet planted, then the hips driven up (fitted so the feet stay put).
const BR_LOW = pose({
  tiltX: -Math.PI / 2, drop: LIE - H, spine: 0.1, head: 0.3,
  lLx: -0.26, lLz: 0.14, sL: 1.73, lRx: -0.26, lRz: -0.14, sR: 1.73, aLx: -1.3, aRx: -1.3, fL: -0.5, fR: -0.5,
});
const BR_HIGH = pose({
  tiltX: -Math.PI / 2 - 0.5, drop: LIE + 0.24 - H, spine: 0, head: 0.55,
  lLx: 0.8, lLz: 0.09, sL: 1.42, lLs: 1.3, lRx: 0.8, lRz: -0.09, sR: 1.42, lRs: 1.3, aLx: -1.9, aRx: -1.9, fL: -0.25, fR: -0.25,
});
// Technical stand-up: seated with the left hand posted behind, the right foot planted and the
// right hand up as a guard; lifted on that hand and foot with the left leg swung back; standing.
const SU_SIT = pose({
  drop: SIT - H, tiltX: -0.3, spine: 0.3, head: 0.1,
  aLx: 0.48, aLz: 0.08, fL: -0.03, fLy: -1.06, aLs: 1.5, aRx: -1.82, aRz: 0.28, fR: -0.4, fRy: 0.87,
  lRx: -1.89, lRz: -0.1, sR: 1.95, lRs: 1.2, lLx: -1.12, lLz: 0.15, sL: 0.27,
});
const SU_LIFT = pose({
  drop: 0.29 - H, tiltX: 0.12, sway: -0.38, spine: 0.25, head: -0.15, headZ: 0.3,
  aLx: 0.11, aLz: 0.38, fL: -0.01, fLy: -0.41, aLs: 1.7, aRx: -1.82, aRz: 0.28, fR: -0.4, fRy: 0.87,
  lRx: -0.93, lRz: 0.17, sR: 0.19, lRs: 1.06, lLx: 0.2, lLz: 0.38, sL: 1.35,
});
const SU_STAND = pose({
  drop: -0.04, spine: 0.24, head: -0.14, lLx: 0.18, sL: 0.5, lRx: -0.5, sR: 0.6, lLz: 0.18, lRz: -0.18,
  aLx: -0.95, aRx: -1.1, fL: -0.75, fR: -0.6, aLz: 0.12, aRz: -0.12,
});

const POSES = {
  // Positions of a points match (the guard pair is further down). Side control: the one on top
  // kneels beside the chest and lies across it; the one underneath frames with the arms.
  sideTop(c, P) {
    const s = Math.sin(c.time * 1.7 + c.seed);
    P.drop = KNEEL - H - 0.03;
    P.spine = 1.08 + 0.04 * s;
    P.head = 0.2;
    P.lLx = P.lRx = -0.85;
    P.sL = P.sR = 2.3;
    P.lLz = 0.4;
    P.lRz = -0.4;
    P.aLx = P.aRx = -1.9;
    P.aLz = 0.3;
    P.aRz = -0.3;
    P.fL = P.fR = -0.4;
    P.aLs = P.aRs = 1.4;
  },
  sideBottom(c, P) {
    const s = Math.sin(c.time * 2.3 + c.seed);
    P.tiltX = -Math.PI / 2;
    P.drop = LIE - H;
    P.head = 0.35;
    P.spine = 0.1;
    P.lLx = -0.9 + 0.12 * s;
    P.lRx = -0.6 - 0.12 * s;
    P.sL = 1.5;
    P.sR = 1.1;
    P.lLz = 0.25;
    P.lRz = -0.25;
    P.aLx = P.aRx = -1.3;
    P.fL = P.fR = -1.2;
    P.twist = 0.12 * s;
  },
  // Mount: astride the belly, knees wide, hands on the chest; underneath, pushing and bucking.
  mountTop(c, P) {
    const s = Math.sin(c.time * 2.3 + c.seed);
    P.drop = 0.33 - H + 0.02 * Math.max(0, s);
    P.spine = 0.38;
    P.head = -0.1;
    P.lLx = P.lRx = -0.9;
    P.lLz = 0.75;
    P.lRz = -0.75;
    P.sL = P.sR = 2.2;
    P.aLx = P.aRx = -1.2;
    P.fL = P.fR = -0.5;
  },
  mountBottom(c, P) {
    const s = Math.sin(c.time * 2.3 + c.seed);
    P.tiltX = -Math.PI / 2;
    P.drop = LIE - H + 0.03 * Math.max(0, s);
    P.head = 0.4;
    P.lLx = P.lRx = -0.45 - 0.2 * Math.max(0, s);
    P.sL = P.sR = 0.95;
    P.lLz = 0.2;
    P.lRz = -0.2;
    P.aLx = P.aRx = -1.5;
    P.fL = P.fR = -0.6;
  },
  // Back control: both sit, the one behind with the legs hooked in front and one arm over the
  // shoulder, one under the arm (a seat belt); the one in front holds the top arm off the neck.
  backTop(c, P) {
    const s = Math.sin(c.time * 1.9 + c.seed);
    P.tiltX = -0.16;
    P.drop = SIT - H;
    P.sway = -0.12;
    P.spine = 0.24 + 0.03 * s;
    P.head = 0.1;
    P.headZ = -0.42;
    P.lLx = P.lRx = -1.45;
    P.lLz = 0.5;
    P.lRz = -0.5;
    P.sL = P.sR = 0.45;
    P.lLs = P.lRs = 1.2;
    P.aLx = -1.62;
    P.aLz = -0.36;
    P.fL = -1.05;
    P.fLy = -1.5;
    P.aLs = 1.7;
    P.aRx = -0.95;
    P.aRz = -0.6;
    P.fR = -1.3;
    P.fRy = -0.2;
    P.aRs = 1.3;
  },
  backBottom(c, P) {
    const s = Math.sin(c.time * 2.4 + c.seed);
    P.tiltX = -0.22;
    P.drop = SIT - H;
    P.spine = 0.12 + 0.04 * s;
    P.head = -0.05;
    P.headZ = 0.12 * s;
    P.lLx = -1.3;
    P.lRx = -1.2;
    P.sL = 0.5;
    P.sR = 0.75;
    P.lLz = 0.14;
    P.lRz = -0.18;
    P.aLx = -1.25;
    P.aLz = 0.35;
    P.fL = -1.7;
    P.aRx = -1.2;
    P.aRz = -0.25;
    P.fR = -1.75;
    P.twist = 0.06 * s;
  },
  // The slap and bump before sparring, in step with the one opposite (both start it together).
  greet(c, P) {
    greetPose(P, Math.min(c.animT, TECH.greet - 1e-4));
  },
  // The winner's hand goes up.
  win(c, P) {
    const b = Math.abs(Math.sin(c.time * 5));
    P.aRz = -2.85;
    P.fR = -0.08;
    P.aRs = 1.15;
    P.aLz = 0.4;
    P.bob = 0.03 * b;
    P.headZ = -0.08;
    P.spine = -0.04;
  },
  // One quick shrimp for the race, then lying ready for the next. c.strokeN picks the side.
  shrimpf(c, P) {
    const u = Math.min(1, c.animT / SHRIMPF.stroke);
    const side = (c.strokeN || 0) % 2 === 0 ? 1 : -1;
    let fold = 0;
    let tw = 0;
    let push = 0;
    if (u < SHRIMPF.a) {
      fold = ease(u / SHRIMPF.a);
      tw = fold;
    } else if (u < SHRIMPF.b) {
      push = ease((u - SHRIMPF.a) / (SHRIMPF.b - SHRIMPF.a));
      fold = 1 - push;
      tw = 1;
    } else if (u < 1) {
      tw = 1 - ease((u - SHRIMPF.b) / (1 - SHRIMPF.b));
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
  bridge(c, P) {
    const n = Math.floor(c.animT / BRIDGE.cycle);
    const u = (c.animT % BRIDGE.cycle) / BRIDGE.cycle;
    const side = n % 2 === 0 ? 1 : -1; // onto one shoulder, then the other
    const k = u < 0.25 ? 0 : u < 0.45 ? ease((u - 0.25) / 0.2) : u < 0.75 ? 1 : 1 - ease((u - 0.75) / 0.25);
    for (const key of KEYS) P[key] = BR_LOW[key] + (BR_HIGH[key] - BR_LOW[key]) * k;
    P.twist = side * 0.5 * k;
    P.aLz = 0.26 + side * 0.5 * k;
    P.aRz = -0.26 + side * 0.5 * k;
  },
  standup(c, P) {
    const u = clamp(c.animT / STANDUP.dur, 0, 1);
    const mix = (A, B, v) => {
      for (const key of KEYS) P[key] = A[key] + (B[key] - A[key]) * v;
    };
    if (u < 0.16) mix(NEUTRAL, SU_SIT, ease(u / 0.16));
    else if (u < STANDUP.a) {
      mix(SU_SIT, SU_SIT, 0);
      P.fR += 0.08 * Math.sin(c.animT * 6); // the guard hand stays alive
    } else if (u < 0.62) mix(SU_SIT, SU_LIFT, ease((u - STANDUP.a) / (0.62 - STANDUP.a)));
    else if (u < STANDUP.b) mix(SU_LIFT, SU_STAND, ease((u - 0.62) / (STANDUP.b - 0.62)));
    else mix(SU_STAND, NEUTRAL, ease((u - STANDUP.b) / (1 - STANDUP.b)));
  },
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
  // Hang loose: the right hand comes up beside the head and shakes.
  shaka(c, P) {
    const u = clamp(c.animT / SHAKA.dur, 0, 1);
    const k = Math.min(1, Math.sin(Math.PI * u) * 2.4);
    const wig = Math.sin(c.animT * 15) * k;
    P.aRz = -0.26 - 1.44 * k;
    P.aRx = -0.3 * k;
    P.fR = -0.1 - (1.2 + 0.24 * wig) * k;
    P.fRy = -1.2 * k;
    P.aRs = 1 + 0.25 * k;
    P.headZ = -0.14 * k;
    P.sway = -0.05 * k;
    P.bob = 0.012 * Math.abs(wig);
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
  rollb(c, P) {
    const u = clamp(c.animT / ROLLB.dur, 0, 1);
    let tuck;
    let spin = 0;
    if (u < ROLLB.a) tuck = ease(u / ROLLB.a);
    else if (u < ROLLB.b) {
      tuck = 1;
      spin = (u - ROLLB.a) / (ROLLB.b - ROLLB.a);
    } else tuck = 1 - ease((u - ROLLB.b) / (1 - ROLLB.b));
    P.tiltX = -spin * TAU;
    P.drop = (TUCK.b - TUCK.cy - H) * tuck;
    P.spine = 1.2 * tuck;
    P.head = 0.6 * tuck;
    P.lLx = P.lRx = -1.8 * tuck;
    P.sL = P.sR = 2.0 * tuck;
    // the hands go back beside the ears, to push off the mat
    P.aLx = P.aRx = -2.5 * tuck;
    P.fL = P.fR = -1.5 * tuck;
  },
  scoot(c, P) {
    const n = Math.floor(c.animT / SCOOT.cycle);
    const u = (c.animT % SCOOT.cycle) / SCOOT.cycle;
    const side = n % 2 === 0 ? 1 : -1; // which hip goes forward
    const sit = Math.min(1, ease(c.animT / 0.3));
    const sw = Math.sin(clamp((u - SCOOT.a) / (SCOOT.b - SCOOT.a), 0, 1) * Math.PI); // 0 .. 1 .. 0 over the step
    P.drop = (SIT - H) * sit;
    P.tiltX = -0.18 * sit;
    P.spine = 0.28 * sit;
    P.head = 0.05;
    P.twist = side * 0.42 * sw * sit;
    P.sway = -side * 0.1 * sw * sit;
    P.bob = 0.035 * sw * sit;
    // legs out in front, knees a little bent; the leg of the leading hip reaches further
    P.lLx = (-1.42 - (side > 0 ? 0.14 : -0.06) * sw) * sit;
    P.lRx = (-1.42 - (side < 0 ? 0.14 : -0.06) * sw) * sit;
    P.sL = (0.34 + (side > 0 ? -0.2 : 0.3) * sw) * sit;
    P.sR = (0.34 + (side < 0 ? -0.2 : 0.3) * sw) * sit;
    P.lLz = 0.1 * sit;
    P.lRz = -0.1 * sit;
    // elbows bent, swinging with the hips
    P.aLx = (-0.5 - side * 0.5 * sw) * sit;
    P.aRx = (-0.5 + side * 0.5 * sw) * sit;
    P.fL = P.fR = -1.3 * sit;
    P.aLz = 0.3;
    P.aRz = -0.3;
  },
  // One hip step for the race, then sitting ready for the next. c.strokeN picks the hip.
  scootf(c, P) {
    const u = Math.min(1, c.animT / RACE.stroke);
    const side = (c.strokeN || 0) % 2 === 0 ? 1 : -1;
    const sw = Math.sin(clamp((u - RACE.a) / (RACE.b - RACE.a), 0, 1) * Math.PI); // 0 .. 1 .. 0 over the step
    P.drop = SIT - H;
    P.tiltX = -0.18;
    P.spine = 0.3 + 0.06 * sw;
    P.head = 0.05;
    P.twist = side * 0.5 * sw;
    P.sway = -side * 0.12 * sw;
    P.bob = 0.04 * sw;
    P.lLx = -1.42 - (side > 0 ? 0.16 : -0.06) * sw;
    P.lRx = -1.42 - (side < 0 ? 0.16 : -0.06) * sw;
    P.sL = 0.34 + (side > 0 ? -0.22 : 0.32) * sw;
    P.sR = 0.34 + (side < 0 ? -0.22 : 0.32) * sw;
    P.lLz = 0.1;
    P.lRz = -0.1;
    P.aLx = -0.5 - side * 0.62 * sw;
    P.aRx = -0.5 + side * 0.62 * sw;
    P.fL = P.fR = -1.3;
    P.aLz = 0.3;
    P.aRz = -0.3;
  },
  // One half of a two-person technique. c.tech = { kind, role: 'a' | 'd', t }. Where each body
  // stands is decided by Bout in tech.js. The ankle lock and the armbar are written out below:
  // the attacker takes the defender down and finishes, the defender taps the mat. The other
  // techniques blend the key poses in MOVE.
  tech(c, P) {
    const S = c.tech;
    if (!S) return;
    const t = S.t;
    const M = S.T || TECH; // this technique's own moments (an escape ends the hold early)
    techPose(c, P, S, M);
    // slipping out: the defender thrashes from the moment the hold is lost until they are free
    if (M.tap === Infinity && S.role === 'd' && t > TECH.judge && t < M.hold) {
      const k = Math.sin((t - TECH.judge) * 21);
      P.twist += 0.32 * k;
      P.sway += 0.1 * k;
    }
  },
};

// The pose of one body at one moment of a technique. S = { kind, role, t }, M = its moments.
function techPose(c, P, S, M) {
  {
    const T = S;
    const t = T.t;
    const atk = T.role === 'a';
    const arm = T.kind === 'arm';
    const seg = (a, b) => clamp((t - a) / (b - a), 0, 1);
    if (t < TECH.greet) {
      greetPose(P, t);
      return;
    }
    const K = MOVE[T.kind] && MOVE[T.kind][T.role];
    if (K && t >= TECH.clinch && t < M.up) {
      const put = (A, B, v) => {
        for (const k of KEYS) P[k] = A[k] + (B[k] - A[k]) * v;
      };
      if (t < TECH.down) put(GRIP, K.mid, ease(seg(TECH.clinch, TECH.down)));
      else if (t < M.hold) {
        const m = ease(seg(TECH.down, TECH.move));
        const h = Math.max(0, t - TECH.move);
        put(K.mid, K.hold, m);
        K.live(P, m, m >= 1 ? Math.sin(h * 7) : 0, t > M.tap ? Math.max(0, Math.sin((t - M.tap) * 22)) : 0, h);
      } else {
        // let go and stand up through a crouch
        const v = ease(seg(M.hold, M.up));
        const k = Math.sin(Math.PI * v);
        put(K.hold, NEUTRAL, v);
        P.drop -= 0.1 * k;
        P.lLx -= 0.45 * k;
        P.lRx -= 0.45 * k;
        P.sL += 0.85 * k;
        P.sR += 0.85 * k;
        P.spine += 0.25 * k;
      }
      return;
    }
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
    if (t < M.hold) {
      const m = ease(seg(TECH.down, TECH.move));
      const h = Math.max(0, t - TECH.move);
      const pulse = m >= 1 ? Math.sin(h * 7) : 0;
      const tap = t > M.tap ? Math.max(0, Math.sin((t - M.tap) * 22)) : 0;
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
    if (t < M.up) {
      // let go, roll up through a crouch and stand
      const v = ease(seg(M.hold, M.up));
      const lying = !atk || arm;
      const k = Math.sin(Math.PI * v);
      P.tiltX = (lying ? -Math.PI / 2 : -0.72) * (1 - v);
      P.drop = ((lying ? LIE : 0.14) - H) * (1 - v) - 0.12 * k;
      P.lLx = P.lRx = -0.9 * (1 - v) - 0.5 * k;
      P.sL = P.sR = 1.0 * (1 - v) + 0.9 * k;
      P.spine = 0.3 * k;
      return;
    }
    const k = Math.min(1, Math.sin(Math.PI * seg(M.up, M.end)) * 1.7);
    P.spine = 0.72 * k;
    P.head = 0.12 * k;
    P.aLz = 0.26 - 0.1 * k;
    P.aRz = -0.26 + 0.1 * k;
  }
}

// Slap and bump before a technique: the right hand winds up, the palms meet, it draws back and
// the fists meet. Both bodies do the same; standing face to face their right hands cross in the
// middle. The four arm keys were fitted so that the hand ends on the line between the two.
const GK = {
  rest: { aRx: -0.95, aRz: -0.12, fR: -0.75, fRy: 0, aRs: 1 },
  wind: { aRx: -1.33, aRz: -1.8, fR: -1.06, fRy: 0.13, aRs: 1.35 },
  slap: { aRx: -1.79, aRz: 0.56, fR: -0.07, fRy: -0.63, aRs: 1.13 },
  back: { aRx: -0.68, aRz: -0.53, fR: -2.19, fRy: 0.65, aRs: 1 },
  bump: { aRx: -1.63, aRz: 0.57, fR: -0.01, fRy: -1.06, aRs: 1.14 },
};
const GSEQ = [[0, 'rest'], [0.16, 'wind'], [0.3, 'slap'], [0.44, 'slap'], [0.54, 'back'], [0.64, 'bump'], [0.78, 'bump'], [TECH.greet, 'rest']];
function greetPose(P, t) {
  P.drop = -0.02;
  P.spine = 0.08;
  P.lLx = -0.22;
  P.sL = 0.3;
  P.lRx = 0.12;
  P.sR = 0.22;
  P.lLz = 0.12;
  P.lRz = -0.12;
  P.aLx = -0.5;
  P.fL = -1.3;
  P.aLz = 0.15;
  let i = 0;
  while (i < GSEQ.length - 2 && t >= GSEQ[i + 1][0]) i++;
  const A = GK[GSEQ[i][1]];
  const B = GK[GSEQ[i + 1][1]];
  const v = ease((t - GSEQ[i][0]) / (GSEQ[i + 1][0] - GSEQ[i][0]));
  for (const k in A) P[k] = A[k] + (B[k] - A[k]) * v;
  // lean into each touch
  const hit = Math.max(0, 1 - Math.abs(t - GREET.slap) / 0.12, 1 - Math.abs(t - GREET.bump) / 0.12);
  P.spine += 0.1 * hit;
}



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
    // Each limb keeps its two segments and its end piece so that it can be stretched (see _reach).
    const arm = (sx) => {
      const U = grp(this.spine, sx * 0.2, 0.33, 0);
      const um = add(U, g.armU, this.m.top, 1, 1, 1, 0, 0, 0);
      const F = grp(U, 0, -BODY.armU, 0);
      F.rotation.order = 'YXZ';
      const fm = add(F, g.armF, foreMat, 1, 1, 1, 0, 0, 0);
      const hand = fine(add(F, bit, this.m.skin, 0.058, 0.058, 0.058, 0, -BODY.armF - 0.03, 0));
      return [U, F, { up: um, low: fm, joint: F, end: hand, a: BODY.armU, b: BODY.armF, pad: 0.03, k: 1 }];
    };
    [this.armL, this.foreL, this.reachAL] = arm(1);
    [this.armR, this.foreR, this.reachAR] = arm(-1);

    const footMat = q.outfit === 'casual' ? this.m.dark : this.m.skin;
    const leg = (sx) => {
      const T = grp(this.hips, sx * 0.1, 0, 0);
      const tm = add(T, g.thigh, this.m.pants, 1, 1, 1, 0, 0, 0);
      const S = grp(T, 0, -BODY.thigh, 0);
      const sm = add(S, g.shin, this.m.pants, 1, 1, 1, 0, 0, 0);
      const foot = fine(add(S, bit, footMat, 0.078, BODY.sole, 0.118, 0, -BODY.shin, 0.04));
      return [T, S, { up: tm, low: sm, joint: S, end: foot, a: BODY.thigh, b: BODY.shin, pad: 0, k: 1 }];
    };
    [this.legL, this.shinL, this.reachLL] = leg(1);
    [this.legR, this.shinR, this.reachLR] = leg(-1);

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
        for (let i = 0; i < 6; i++) {
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
    this.bubble = null;
    this.rate = 20; // how quickly the body follows a new pose; lower for the slow changes of a match
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
      // up to four stripes sit evenly on the bar; the five or six degrees of a black belt are packed closer
      const gap = q.stripes > 4 ? 0.0102 : 0.0148;
      this.stripes.forEach((s, i) => {
        s.visible = i < q.stripes;
        s.position.y = (q.stripes > 4 ? -0.0885 : -0.092) - i * gap;
        s.scale.y = q.stripes > 4 ? 0.0066 : 0.009;
      });
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

  // The name floating over the head: small light text with a dark edge, so that it reads from the
  // front, the back and against any wall.
  setLabel(text) {
    if (this.label) {
      this.root.remove(this.label);
      this.label.material.map.dispose();
      this.label.material.dispose();
      this.label = null;
    }
    if (!text) return;
    const cv = newCanvas(256, 56);
    const c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(12,14,18,.92)';
    c.fillStyle = '#fff3d6';
    let px = 30;
    c.font = FONT(px, 700);
    while (px > 12 && c.measureText(text).width > 240) {
      px -= 2;
      c.font = FONT(px, 700);
    }
    c.strokeText(text, 128, 29);
    c.fillText(text, 128, 29);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
    sp.scale.set(0.96, 0.21, 1);
    sp.position.set(0, TALL + 0.2, 0);
    this.root.add(sp);
    this.label = sp;
  }

  // A speech bubble over the head for `sec` seconds; say(null) takes it away.
  say(text, sec = 4) {
    if (this.bubble) {
      this.root.remove(this.bubble);
      this.bubble.material.map.dispose();
      this.bubble.material.dispose();
      this.bubble = null;
    }
    if (!text) return;
    const cv = newCanvas(384, 128);
    const c = cv.getContext('2d');
    const W = 384;
    const r = 26;
    const top = 6;
    const bot = 98;
    c.beginPath();
    c.moveTo(r + 6, top);
    c.lineTo(W - r - 6, top);
    c.quadraticCurveTo(W - 6, top, W - 6, top + r);
    c.lineTo(W - 6, bot - r);
    c.quadraticCurveTo(W - 6, bot, W - r - 6, bot);
    c.lineTo(W / 2 + 18, bot);
    c.lineTo(W / 2, 124);
    c.lineTo(W / 2 - 18, bot);
    c.lineTo(r + 6, bot);
    c.quadraticCurveTo(6, bot, 6, bot - r);
    c.lineTo(6, top + r);
    c.quadraticCurveTo(6, top, r + 6, top);
    c.closePath();
    c.fillStyle = '#fbf9f3';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#15171a';
    c.lineJoin = 'round';
    c.stroke();
    c.fillStyle = '#15171a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, text, W / 2, 54, W - 44, text.length <= 2 ? 62 : 44, 700);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sp.center.set(0.5, 0);
    sp.position.set(0, TALL + (this.label ? 0.44 : 0.14), 0);
    sp.renderOrder = 5;
    this.root.add(sp);
    this.bubble = sp;
    this.bubbleT = sec;
    this.bubbleAge = 0;
    this._bubble(0);
  }

  _bubble(dt) {
    const sp = this.bubble;
    this.bubbleT -= dt;
    this.bubbleAge += dt;
    if (this.bubbleT <= 0) {
      this.say(null);
      return;
    }
    const pop = Math.min(1, this.bubbleAge / 0.14);
    const k = 0.6 + 0.4 * pop * (2 - pop);
    sp.scale.set(1.5 * k, 0.5 * k, 1);
    sp.material.opacity = Math.min(1, this.bubbleT / 0.3);
  }

  play(name) {
    if (this.anim === 'roll' || this.anim === 'rollb') this.C.tiltX = 0;
    this.anim = POSES[name] ? name : 'loco';
    this.animT = 0;
    if (name === 'shrimpf' || name === 'scootf') this.strokeN = (this.strokeN || 0) + 1;
  }

  update(dt, speed = 0) {
    this.animT += dt;
    this.time += dt;
    if (this.label) this.label.position.y = TALL + 0.2 + 0.018 * Math.sin(this.time * 2.1 + this.seed); // it floats a little
    const P = this.P;
    const C = this.C;
    for (const k of KEYS) P[k] = NEUTRAL[k];
    POSES[this.anim](this, P, speed, dt);
    const k = 1 - Math.exp(-this.rate * dt);
    for (const key of KEYS) C[key] += (P[key] - C[key]) * k;
    let ty = H + C.drop + C.bob;
    let tz = 0;
    if (this.anim === 'roll' || this.anim === 'rollb') {
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
    this.head.rotation.set(C.head, C.headY, C.headZ);
    this.armL.rotation.set(C.aLx, 0, C.aLz);
    this.armR.rotation.set(C.aRx, 0, C.aRz);
    this.foreL.rotation.set(C.fL, C.fLy, 0);
    this.foreR.rotation.set(C.fR, C.fRy, 0);
    this.legL.rotation.set(C.lLx, 0, C.lLz);
    this.legR.rotation.set(C.lRx, 0, C.lRz);
    this.shinL.rotation.x = C.sL;
    this.shinR.rotation.x = C.sR;
    this._reach(this.reachAL, C.aLs);
    this._reach(this.reachAR, C.aRs);
    this._reach(this.reachLL, C.lLs);
    this._reach(this.reachLR, C.lRs);
    if (this.blob) {
      const lying = Math.abs(Math.sin(C.tiltX)) > 0.5;
      this.blob.scale.set(lying ? 0.4 : 0.34, lying ? 0.62 : 0.34, 1);
    }

    if (this.bubble) this._bubble(dt);

    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkT = rand(2.2, 5.5);
      this.blink = 0.13;
    }
    if (this.blink > 0) this.blink -= dt;
    let mood = ANIM_FACE[this.anim] || this.baseFace;
    if (this.anim === 'tech' && this.tech) {
      const tt = this.tech.t;
      const M = this.tech.T || TECH;
      const out = M.tap === Infinity && tt > TECH.judge; // the defender is slipping out
      if (tt < TECH.greet) mood = 'grin';
      else if (tt >= M.up) mood = 'calm';
      else if (tt >= M.hold) mood = out && this.tech.role === 'd' ? 'grin' : this.baseFace;
      else if (this.tech.role === 'a') mood = out ? 'wow' : 'focus';
      else mood = tt < TECH.clinch ? 'focus' : tt < TECH.down ? 'wow' : out ? 'focus' : 'ouch';
    }
    const want = this.blink > 0 && mood !== 'ouch' ? 'calm' : mood;
    if (want !== this.faceNow) {
      this.faceNow = want;
      this.face.material = this.faces[want];
    }
  }

  // Lengthen or restore one limb: both segments grow along their own axis, the joint and the hand
  // or foot move out with them.
  _reach(r, k) {
    if (Math.abs(k - r.k) < 0.002) return;
    r.k = k;
    r.up.scale.y = k;
    r.low.scale.y = k;
    r.joint.position.y = -r.a * k;
    r.end.position.y = -r.b * k - r.pad;
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
    this.say(null);
  }
}
