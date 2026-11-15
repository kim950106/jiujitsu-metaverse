/* global THREE */
// The terrace behind the dojo. The dojo is on the sixth floor, so the mat side of the room opens
// through folding glass doors onto a deck and a turf lawn on the roof of the floors below, with a
// glass railing round it. Beyond it rise the towers the real terrace looks at: the tall slender
// white towers with orange stripes of 전주 SK리더스뷰 to the north, and the charcoal and white
// towers of 유탑유블레스 to either side (plain shapes and plain lettering, no logos). It is shown
// by night, with the windows lit (sky.js; another hour can be asked for in the address).
import { GEO, FONT, fitText, pick, rand } from './util.js';

// o: { X0, X1, Z0, CEIL, door: [x0, x1] the folding-door span, gap: [x0, x1] the part standing open,
//      banner(c, W, H, img) the dojo banner drawing, sky: what skyAt() returned }
export function buildYard(w, o) {
  const S = w.scene;
  const { X0, X1, Z0, CEIL, sky } = o;
  const [dx0, dx1] = o.door;
  const [gx0, gx1] = o.gap;
  const WALL = Z0 - 0.3; // outer face of the north wall
  const GY = -19.6; // the street: five floors below the terrace
  const frame = 0x111214;
  // Daylight colours: lit by the room's dim lamps like everything else, plus a glow of their own
  // that fades as the day does.
  const day = (color, k = 0.55) => {
    const c = new THREE.Color(color).multiplyScalar(k * sky.k);
    return w.mat(color, { emissive: c.getHex() });
  };
  const lamp = w.mat(0xffe2a8, { basic: true });

  /* ---------- sky ---------- */
  const skyTex = w.canvasTex(4, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.4, sky.mid);
    g.addColorStop(0.5, sky.low);
    g.addColorStop(1, sky.low);
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  });
  const dome = new THREE.Mesh(
    w.own(new THREE.SphereGeometry(220, 20, 12)),
    w.own(new THREE.MeshBasicMaterial({ map: skyTex.tex, side: THREE.BackSide, fog: false, depthWrite: false })),
  );
  dome.userData.live = true;
  dome.renderOrder = -1;
  S.add(dome);
  const cloud = w.own(new THREE.MeshBasicMaterial({ color: sky.cloud }));
  for (const [x, y, z, s] of [[-60, 90, -140, 1], [40, 100, -150, 1.2], [110, 85, -80, 0.9], [-130, 95, -50, 1.1], [-10, 110, -175, 1.3]]) {
    for (let i = 0; i < 4; i++) {
      w.sphere({ x: x + i * 9 * s + rand(-2, 2), y: y + rand(-2, 2), z: z + rand(-4, 4), r: rand(7, 11) * s, sy: 0.42, mat: cloud, lo: true, receive: false });
    }
  }
  if (sky.dark) {
    const star = w.own(new THREE.MeshBasicMaterial({ color: 0xf2f4ff, fog: false }));
    for (let i = 0; i < 90; i++) {
      const az = rand(0, Math.PI * 2);
      const el = rand(0.2, 1.35);
      w.sphere({ x: Math.cos(az) * Math.cos(el) * 205, y: Math.sin(el) * 205, z: Math.sin(az) * Math.cos(el) * 205, r: rand(0.35, 0.8), mat: star, lo: true, receive: false });
    }
    w.sphere({ x: -70, y: 120, z: -150, r: 7, mat: w.own(new THREE.MeshBasicMaterial({ color: 0xf6f1dc, fog: false })), receive: false });
  }

  /* ---------- north wall around the doors ---------- */
  const wallC = 0x1b1c1f;
  const HEAD = 2.9; // top of the doors
  w.box({ x: (X0 - 0.3 + dx0) / 2, z: Z0 - 0.15, w: dx0 - (X0 - 0.3), h: CEIL, d: 0.3, color: wallC, collide: true });
  w.box({ x: (dx1 + X1 + 0.3) / 2, z: Z0 - 0.15, w: X1 + 0.3 - dx1, h: CEIL, d: 0.3, color: wallC, collide: true });
  w.box({ x: (dx0 + dx1) / 2, z: Z0 - 0.15, y: HEAD, w: dx1 - dx0, h: CEIL - HEAD, d: 0.3, color: wallC });
  w.box({ x: (dx0 + dx1) / 2, z: Z0 + 0.08, y: 3.0, w: dx1 - dx0, h: 0.05, d: 0.06, color: 0xa56bff, basic: true });

  /* ---------- folding glass doors ---------- */
  const glass = { color: 0xa9cfe2, opacity: 0.2 };
  const zc = Z0 - 0.15;
  // top and bottom tracks, end posts
  w.box({ x: (dx0 + dx1) / 2, z: zc, y: HEAD - 0.1, w: dx1 - dx0, h: 0.1, d: 0.16, color: frame });
  w.box({ x: (dx0 + dx1) / 2, z: zc, y: 0, w: dx1 - dx0, h: 0.015, d: 0.12, color: 0x2a2b2e });
  for (const x of [dx0 + 0.04, dx1 - 0.04]) w.box({ x, z: zc, w: 0.08, h: HEAD, d: 0.16, color: frame });
  // One leaf: glass in a dark frame. `turn` swings it about its own middle, as when folded.
  const leaf = (x, z, wd, turn) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    const add = (p) => w.box(Object.assign({ parent: g }, p));
    const h = HEAD - 0.12;
    add({ x: 0, z: 0, y: 0.02, w: wd - 0.08, h: h - 0.02, d: 0.02, color: glass.color, opacity: glass.opacity });
    add({ x: 0, z: 0, y: 0.02, w: wd, h: 0.09, d: 0.05, color: frame });
    add({ x: 0, z: 0, y: h - 0.07, w: wd, h: 0.07, d: 0.05, color: frame });
    for (const sx of [-1, 1]) add({ x: (sx * (wd - 0.05)) / 2, z: 0, y: 0.02, w: 0.05, h: h - 0.02, d: 0.05, color: frame });
    add({ x: wd / 2 - 0.09, z: 0.04, y: 1.0, w: 0.03, h: 0.16, d: 0.04, color: 0xb8bcc2 });
    // Bake the group into the scene so the pieces merge with everything else of their material.
    g.updateMatrixWorld(true);
    for (const m of g.children.slice()) {
      m.applyMatrix4(g.matrixWorld);
      S.add(m);
    }
  };
  // shut leaves at both ends
  const shut = (x0, x1) => {
    const n = Math.max(1, Math.round((x1 - x0) / 0.82));
    const wd = (x1 - x0) / n;
    for (let i = 0; i < n; i++) leaf(x0 + wd * (i + 0.5), zc, wd, 0);
    w.collider(x0, x1, Z0 - 0.3, Z0, 0, HEAD);
  };
  // leaves folded into a stack beside the opening
  const stack = (x0, dir) => {
    for (let i = 0; i < 5; i++) leaf(x0 + dir * (0.07 + i * 0.13), zc, 0.84, Math.PI / 2 + (i % 2 ? 0.16 : -0.16));
    const a = x0 + dir * 0.74;
    w.collider(Math.min(x0, a), Math.max(x0, a), zc - 0.5, zc + 0.5, 0, HEAD);
  };
  shut(dx0 + 0.08, gx0 - 0.74);
  stack(gx0 - 0.74, 1);
  stack(gx1 + 0.74, -1);
  shut(gx1 + 0.74, dx1 - 0.08);

  /* ---------- deck and turf ---------- */
  const LX0 = -17.5;
  const LX1 = 7.5;
  const LZ0 = -23.5; // far (north) edge
  const DZ = WALL - 2.3; // where the deck ends
  const glow = sky.k;
  w.floor({ x: (dx0 + dx1) / 2, z: (Z0 + DZ) / 2, y: 0.02, w: dx1 - dx0 + 1.2, d: Z0 - DZ, mat: w.glowMat(w.texDeck(), 0.5 * glow), tex: w.texDeck(), tile: 1.6 });
  w.box({ x: (dx0 + dx1) / 2, z: DZ - 0.04, y: 0, w: dx1 - dx0 + 1.2, h: 0.022, d: 0.08, mat: day(0x8a6a48) });
  w.floor({ x: (LX0 + LX1) / 2, z: (LZ0 + WALL) / 2, y: 0.008, w: LX1 - LX0, d: WALL - LZ0, mat: w.glowMat(w.texGrass(), 0.4 * glow), tex: w.texGrass(), tile: 3 });
  // stepping stones from the deck into the turf
  for (let i = 0; i < 5; i++) {
    w.cyl({ x: (gx0 + gx1) / 2 + Math.sin(i * 1.3) * 0.35, z: DZ - 0.7 - i * 0.95, y: 0.004, r: 0.34, h: 0.02, mat: day(0xbdb7a9, 0.4), seg: 8 });
  }

  /* ---------- the edge: a low parapet with a glass railing, so the view stays open ---------- */
  const para = day(0xcfcabf, 0.45);
  const railM = day(0x3a3c40, 0.4);
  const pane = w.mat(0xa9cfe2, { opacity: 0.2 });
  const rail = (x0, z0, x1, z1) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.5;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const sz = (l, t) => (alongX ? { w: l, d: t } : { w: t, d: l });
    w.box(Object.assign({ x: cx, z: cz, h: 0.42, mat: para }, sz(len, 0.5)));
    w.box(Object.assign({ x: cx, z: cz, y: 0.42, h: 0.8, mat: pane }, sz(len - 0.1, 0.03)));
    w.box(Object.assign({ x: cx, z: cz, y: 1.22, h: 0.05, mat: railM }, sz(len, 0.09)));
    const n = Math.max(2, Math.round(len / 1.7));
    for (let i = 0; i <= n; i++) {
      w.box({ x: alongX ? x0 - 0.25 + (len * i) / n : cx, z: alongX ? cz : z0 - 0.25 + (len * i) / n, y: 0.42, w: 0.06, h: 0.8, d: 0.06, mat: railM });
    }
    w.collider(Math.min(x0, x1) - 0.4, Math.max(x0, x1) + 0.4, Math.min(z0, z1) - 0.4, Math.max(z0, z1) + 0.4, 0, 1.3);
  };
  rail(LX0, LZ0, LX0, WALL - 0.4);
  rail(LX1, LZ0, LX1, WALL - 0.4);
  rail(LX0, LZ0, LX1, LZ0);
  // the wall that closes the corner beside the stair tower
  w.texBox({ x: (LX0 + X0 - 0.3) / 2, z: WALL + 0.12, w: X0 - 0.3 - LX0 + 0.8, h: 2.1, d: 0.24, mat: w.glowMat(w.texBrick('white'), 0.5 * glow), tex: w.texBrick('white'), tile: 1, collide: true });

  /* ---------- things on the terrace ---------- */
  // small trees in planter boxes
  const tree = (x, z, s = 1) => {
    w.box({ x, z, w: 1.0, h: 0.5, d: 1.0, mat: day(0x8a6a48, 0.45), collide: true });
    w.box({ x, z, y: 0.5, w: 0.88, h: 0.03, d: 0.88, mat: day(0x3a2c1e, 0.4) });
    w.cyl({ x, z, y: 0.5, r: 0.09 * s, h: 1.5 * s, mat: day(0x6b4f35), seg: 8 });
    const cols = [0x5fa646, 0x6eb552, 0x4f963c, 0x7cc05c];
    for (let i = 0; i < 6; i++) {
      w.sphere({ x: x + rand(-0.55, 0.55) * s, y: 0.5 + (1.7 + rand(0, 0.9)) * s, z: z + rand(-0.55, 0.55) * s, r: rand(0.5, 0.78) * s, mat: day(pick(cols), 0.5), lo: true });
    }
  };
  tree(LX0 + 1.5, LZ0 + 1.5, 1.05);
  tree(LX1 - 1.5, LZ0 + 1.5, 1);
  tree(LX1 - 1.5, WALL - 3.4, 0.9);
  const bench = (x, z, rotY) => {
    const along = Math.abs(Math.sin(rotY)) > 0.5;
    w.box({ x, z, y: 0.4, w: along ? 0.5 : 1.7, h: 0.07, d: along ? 1.7 : 0.5, mat: day(0xb08a5e) });
    for (const k of [-0.7, 0.7]) w.box({ x: x + (along ? 0 : k), z: z + (along ? k : 0), w: along ? 0.42 : 0.08, h: 0.4, d: along ? 0.08 : 0.42, mat: day(0x3a3c40) });
    w.collider(x - (along ? 0.3 : 0.9), x + (along ? 0.3 : 0.9), z - (along ? 0.9 : 0.3), z + (along ? 0.9 : 0.3), 0, 0.47);
  };
  bench(LX0 + 1.3, -12.2, Math.PI / 2);
  bench(0.5, LZ0 + 1.3, 0);
  // lamp posts: lit once it is dark
  for (const [x, z] of [[LX0 + 0.9, -16.8], [LX1 - 0.9, -16.8], [-5, LZ0 + 0.9]]) {
    w.cyl({ x, z, r: 0.05, h: 2.5, mat: railM, seg: 8 });
    w.sphere({ x, y: 2.62, z, r: 0.17, mat: sky.dark ? lamp : day(0xe9e6dc, 0.5), lo: true });
    w.collider(x - 0.1, x + 0.1, z - 0.1, z + 0.1, 0, 2.5);
  }
  // an open-air mat laid on the turf
  const MAT = { x0: -14, x1: -7, z0: -20.2, z1: -14.2 };
  const mcx = (MAT.x0 + MAT.x1) / 2;
  const mcz = (MAT.z0 + MAT.z1) / 2;
  w.box({ x: mcx, z: mcz, w: MAT.x1 - MAT.x0, h: 0.04, d: MAT.z1 - MAT.z0, mat: day(0x2f6aa3, 0.45) });
  w.floor({ x: mcx, z: mcz, y: 0.042, w: MAT.x1 - MAT.x0, d: MAT.z1 - MAT.z0, mat: w.glowMat(w.texMatColor('open', '#3f84c4', '#2f6aa3'), 0.42 * glow), tex: w.texMatColor('open', '#3f84c4', '#2f6aa3'), tile: 2 });
  w.floor({ x: mcx, z: mcz, y: 0.045, w: MAT.x1 - MAT.x0 - 2, d: MAT.z1 - MAT.z0 - 2, mat: w.glowMat(w.texMatColor('openin', '#e9c244', '#cfa92f'), 0.42 * glow), tex: w.texMatColor('openin', '#e9c244', '#cfa92f'), tile: 2 });
  w.collider(MAT.x0, MAT.x1, MAT.z0, MAT.z1, 0, 0.04);
  // a board on the outside wall with the dojo's banner
  w.logoSlot('gym', w.sign({ x: 6.6, y: 2.75, z: WALL - 0.08, w: 3.4, h: 1.5, rotY: Math.PI, draw: o.banner }));

  /* ---------- the building: this top floor, the stair tower, the floors below ---------- */
  const clad = day(0xd9d5cc, 0.5);
  w.box({ x: (dx1 + X1 + 0.3) / 2, z: WALL - 0.03, w: X1 + 0.3 - dx1, h: CEIL + 0.2, d: 0.06, mat: clad });
  w.box({ x: (dx0 + dx1) / 2, z: WALL - 0.03, y: HEAD, w: dx1 - dx0, h: CEIL + 0.2 - HEAD, d: 0.06, mat: clad });
  w.box({ x: (X0 - 0.3 + dx0) / 2, z: WALL - 0.03, w: dx0 - (X0 - 0.3), h: CEIL + 0.2, d: 0.06, mat: clad });
  // an awning strip over the doors
  w.box({ x: (dx0 + dx1) / 2, z: WALL - 0.55, y: HEAD + 0.12, w: dx1 - dx0 + 0.6, h: 0.1, d: 1.1, mat: day(0x2a2b2e) });
  // the roof of the dojo: a slab with a parapet and the usual machines on it
  const top = CEIL + 0.2;
  w.box({ x: 0, z: 1, y: top, w: 27, h: 0.25, d: 19, mat: day(0xbdb8ad, 0.5) });
  w.box({ x: 0, z: -8.45, y: top + 0.25, w: 27, h: 0.6, d: 0.3, mat: clad });
  for (const [x, z] of [[-7, -3], [-3.5, -3], [6, 2]]) w.box({ x, z, y: top + 0.25, w: 2.2, h: 1.1, d: 1.4, mat: day(0x8a9099, 0.5) });
  w.cyl({ x: 9, z: -4, y: top + 0.25, r: 1.2, h: 1.9, mat: day(0x9fb1c2, 0.5) });
  // the stair tower west of the dojo, with its door onto the terrace side
  w.box({ x: -15.8, z: 1, y: 0, w: 4.6, h: 8.2, d: 19, mat: day(0xcfcabf, 0.5) });
  // the five floors underneath, as far out as the terrace reaches
  w.box({ x: -2.85, z: -6.75, y: GY, w: 30.9, h: -GY - 0.03, d: 34.7, mat: clad });

  /* ---------- the neighbourhood, five floors down: ground, roads, trees, cars ---------- */
  w.floor({ x: 0, z: -60, y: GY - 0.02, w: 420, d: 420, mat: day(0xb4b8b3, 0.5) });
  for (const [x, z, wd, dp] of [[-5, -52, 60, 14], [-58, -12, 20, 30], [48, -18, 24, 26], [-5, -70, 120, 8]]) {
    w.floor({ x, z, y: GY - 0.012, w: wd, d: dp, mat: day(0x7dab58, 0.45) });
  }
  const road = day(0x4a4d52, 0.4);
  const paint = day(0xe9e6dc, 0.55);
  w.floor({ x: 0, z: -36, y: GY - 0.008, w: 260, d: 9, mat: road });
  w.floor({ x: 5.5, z: -86, y: GY - 0.008, w: 8, d: 100, mat: road });
  for (let x = -120; x <= 120; x += 8) w.floor({ x, z: -36, y: GY - 0.004, w: 3.4, d: 0.22, mat: paint });
  const far = [0x5a9a44, 0x69a84f, 0x4d8c3b];
  for (const [x, z, s] of [[-28, -29, 1.1], [-20, -29, 0.9], [-12, -29, 1.2], [-4, -29, 1], [4, -29, 1.15], [12, -29, 0.9], [-36, -43, 1], [-26, -43, 0.85], [-14, -43, 0.9], [0, -43, 1.05], [10, -43, 0.8], [34, -43, 0.9], [-44, -29, 1], [40, -29, 1.1]]) {
    w.cyl({ x, z, y: GY, r: 0.18, h: 2.6 * s, mat: day(0x6b4f35), seg: 8 });
    w.sphere({ x, y: GY + 3.6 * s, z, r: 1.8 * s, sy: 1.1, mat: day(pick(far), 0.45), lo: true });
  }
  const cars = [0xf2f2f0, 0x2a2c30, 0x9aa0a8, 0xb3312c, 0x2f4f7a, 0xf2f2f0, 0x55585d];
  for (let i = 0; i < 12; i++) {
    const x = -52 + i * 9 + rand(-1.5, 1.5);
    const z = i % 2 ? -34 : -38;
    w.box({ x, z, y: GY + 0.25, w: 4.3, h: 0.75, d: 1.9, mat: day(pick(cars), 0.6) });
    w.box({ x: x - 0.2, z, y: GY + 1.0, w: 2.3, h: 0.6, d: 1.7, mat: day(0x33383f, 0.6) });
    if (sky.dark) w.box({ x: x + (i % 2 ? -2.16 : 2.16), z, y: GY + 0.6, w: 0.06, h: 0.2, d: 1.5, mat: lamp });
  }
  // street lamps along the road
  for (let x = -90; x <= 90; x += 15) {
    w.cyl({ x, z: -30.6, y: GY, r: 0.09, h: 6, mat: railM, seg: 8 });
    w.sphere({ x, y: GY + 6.1, z: -31.2, r: 0.42, mat: sky.dark ? lamp : day(0xe9e6dc, 0.5), lo: true });
  }

  /* ---------- lower buildings nearby: their roofs sit about level with the terrace ---------- */
  const win = sky.dark ? w.mat(0x1b2230, { emissive: 0x0b0f18 }) : day(0x7f93a8, 0.6);
  const winLit = sky.dark ? w.mat(0xffd98a, { basic: true }) : win;
  const shops = [day(0xd5cfc2, 0.55), day(0xc9c0b2, 0.55), day(0xbfc7cf, 0.55), day(0xd9cdb8, 0.55)];
  const lowrise = (x, z, wd, dp, h, k) => {
    w.box({ x, z, y: GY, w: wd, h, d: dp, mat: shops[k % shops.length] });
    w.box({ x, z, y: GY + h, w: wd + 0.4, h: 0.5, d: dp + 0.4, mat: day(0xa9a59b, 0.5) });
    w.box({ x: x + wd * 0.2, z, y: GY + h + 0.5, w: 3, h: 1.6, d: 2.4, mat: day(0x8a9099, 0.5) });
    // a band of windows per floor on the two faces turned toward the terrace
    const floors = Math.floor(h / 3.4);
    const toS = z < -20; // its south face looks at us
    const toE = x < -5;
    for (let f = 0; f < floors; f++) {
      const y = GY + 1.2 + f * 3.4;
      const m = sky.dark && (f * 7 + k * 3) % 5 < 2 ? winLit : win;
      if (toS) w.box({ x, z: z + dp / 2 + 0.04, y, w: wd - 1.6, h: 1.5, d: 0.08, mat: m });
      w.box({ x: x + (toE ? 1 : -1) * (wd / 2 + 0.04), z, y, w: 0.08, h: 1.5, d: dp - 1.6, mat: sky.dark && (f * 5 + k) % 4 < 2 ? winLit : win });
    }
  };
  lowrise(-34, -52, 20, 14, 17.5, 0);
  lowrise(30, -54, 22, 12, 21, 1);
  lowrise(-46, -12, 14, 22, 14.2, 2);
  lowrise(34, -12, 16, 20, 18, 3);
  lowrise(-12, -56, 14, 12, 11, 2);

  /* ---------- apartment blocks ---------- */
  let tints;
  if (sky.dark) {
    const lit = w.texFlatsNight();
    tints = [0xffffff, 0xf2e8d8, 0xe2ecff].map((c) => w.own(new THREE.MeshLambertMaterial({ map: lit, color: c, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 0.9 })));
  } else {
    const flats = w.texFlats();
    tints = [0xf2ede3, 0xe6dfd2, 0xdde4ea].map((c) => w.glowMat(flats, 0.5 * glow, c));
  }
  const gable = [day(0xdcd6ca, 0.55), day(0xd0c9bb, 0.55), day(0xd3d9de, 0.55)];
  const band = [day(0x6f8dab, 0.6), day(0xb27f50, 0.6), day(0x5f8a72, 0.6)];
  // A slab block standing on the street. Long side along x (or along z when `turned`); its number
  // is painted on the gable ends and beside the roof line on the long front.
  const block = (num, x, z, len, h, turned, k) => {
    const dep = 12;
    const wd = turned ? dep : len;
    const dp = turned ? len : dep;
    w.texBox({ x, z, y: GY, w: wd, h, d: dp, mat: tints[k], tile: 16.8 });
    // blank gable ends, a coloured band under the roof, the roof slab and a lift house
    for (const sgn of [-1, 1]) {
      w.box({ x: x + (turned ? 0 : sgn * (len / 2 + 0.2)), z: z + (turned ? sgn * (len / 2 + 0.2) : 0), y: GY, w: turned ? dep + 0.5 : 0.4, h: h + 1, d: turned ? 0.4 : dep + 0.5, mat: gable[k] });
    }
    w.box({ x, z, y: GY + h - 3.2, w: wd + 0.3, h: 1.1, d: dp + 0.3, mat: band[k] });
    w.box({ x, z, y: GY + h, w: wd + 0.9, h: 0.7, d: dp + 0.9, mat: gable[k] });
    w.box({ x: x + (turned ? 0 : len * 0.2), z: z + (turned ? len * 0.2 : 0), y: GY + h + 0.7, w: turned ? 6 : 9, h: 3.2, d: turned ? 9 : 6, mat: gable[k] });
    // The number, once per block: both plates share one picture so they draw together.
    const t = w.canvasTex(128, 70, (c, W, H) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = sky.dark ? '#9aa3b0' : '#4a5560';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = FONT(Math.round(H * 0.8));
      fitText(c, String(num), W / 2, H / 2 + 2, W * 0.92, Math.round(H * 0.8));
    });
    const plate = w.own(new THREE.MeshBasicMaterial({ map: t.tex, transparent: true }));
    const tag = (px, pz, rotY) => {
      const m = new THREE.Mesh(GEO().plane, plate);
      m.scale.set(8, 4.4, 1);
      m.position.set(px, GY + h - 8, pz);
      m.rotation.y = rotY;
      S.add(m);
    };
    // on the two faces turned toward the terrace
    const sx = x < -5 ? 1 : -1;
    const sz = z < -15 ? 1 : -1;
    if (turned) {
      tag(x + sx * (dep / 2 + 0.2), z + sz * len * 0.34, (sx * Math.PI) / 2);
      tag(x, z + sz * (len / 2 + 0.42), sz > 0 ? 0 : Math.PI);
    } else {
      tag(x + sx * len * 0.34, z + sz * (dep / 2 + 0.2), sz > 0 ? 0 : Math.PI);
      tag(x + sx * (len / 2 + 0.42), z, (sx * Math.PI) / 2);
    }
  };
  block(105, -118, -128, 50, 74, false, 1);
  block(107, 122, -130, 44, 70, true, 1);
  block(108, -134, -66, 40, 64, true, 0);

  /* ---------- the towers ---------- */
  // night: a dim glow of their own, so the stripes and fins read against the dark sky
  const lit = (color, k) => (sky.dark ? w.mat(color, { emissive: new THREE.Color(color).multiplyScalar(k).getHex() }) : day(color, 0.55));
  const orange = lit(0xe8762c, 0.5);
  const white = lit(0xe9e9ea, 0.3);
  const grey = lit(0x9aa0a8, 0.22);
  const charcoal = lit(0x2c2f36, 0.25);
  const crownLight = sky.dark ? w.mat(0xffe2a8, { basic: true }) : white;
  let dusk = null;
  if (sky.dark) {
    const t = w.texFlatsNight();
    dusk = w.own(new THREE.MeshLambertMaterial({ map: t, color: 0x7d8494, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.85 }));
  }
  // lettering near the top of a face, plain text on a transparent plate
  const nameTag = (text, x, y, z, rotY, wd) => {
    const t = w.canvasTex(256, 56, (c, W, H) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = sky.dark ? '#fff3d6' : '#3a4048';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, text, W / 2, H / 2 + 2, W * 0.94, Math.round(H * 0.7));
    });
    const m = new THREE.Mesh(GEO().plane, w.own(new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, fog: false })));
    m.scale.set(wd, wd * 0.22, 1);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    S.add(m);
  };
  // Which way a tower at (x, z) faces the terrace: its long front is turned toward it.
  const facing = (x, z) => (Math.abs(x + 5) > Math.abs(z + 15) ? { ax: 'x', s: x < -5 ? 1 : -1 } : { ax: 'z', s: 1 });
  // 전주 SK리더스뷰: tall and slender, white and light grey, with orange stripes running the full
  // height of the front and a stepped crown.
  const towerSK = (x, z, h, k) => {
    const wd = 24;
    const dp = 20;
    w.texBox({ x, z, y: GY, w: wd, h, d: dp, mat: tints[k % tints.length], tile: 16.8 });
    const f = facing(x, z);
    const face = (u, y, ww, hh, mat, out = 0.25) => {
      // a strip on the front: u metres along it from the middle
      if (f.ax === 'z') w.box({ x: x + u, z: z + dp / 2 + out / 2, y, w: ww, h: hh, d: out, mat });
      else w.box({ x: x + f.s * (wd / 2 + out / 2), z: z + u, y, w: out, h: hh, d: ww, mat });
    };
    const half = (f.ax === 'z' ? wd : dp) / 2;
    for (const u of [-half + 0.9, half - 0.9]) face(u, GY, 1.8, h + 2, white, 0.5); // white corner piers
    for (const u of [-half * 0.42, half * 0.42]) face(u, GY + 6, 1.5, h - 6, orange, 0.35); // the orange stripes
    face(0, GY + 6, 1.1, h - 6, grey, 0.3);
    // crown: a set-back top with a light along its edge
    w.box({ x, z, y: GY + h, w: wd + 0.8, h: 1.2, d: dp + 0.8, mat: white });
    w.box({ x, z, y: GY + h + 1.2, w: wd * 0.62, h: 7, d: dp * 0.62, mat: grey });
    w.box({ x, z, y: GY + h + 8.2, w: wd * 0.66, h: 0.5, d: dp * 0.66, mat: crownLight });
    face(0, GY + h + 2.2, half * 1.1, 4.2, orange, 0.3);
    if (f.ax === 'z') nameTag('SK 리더스뷰', x, GY + h - 6, z + dp / 2 + 0.7, 0, 17);
    else nameTag('SK 리더스뷰', x + f.s * (wd / 2 + 0.7), GY + h - 6, z, (f.s * Math.PI) / 2, 15);
  };
  // 유탑유블레스: charcoal towers with white vertical bands and a white frame at the top.
  const towerYU = (x, z, h) => {
    const wd = 22;
    const dp = 26;
    w.texBox({ x, z, y: GY, w: wd, h, d: dp, mat: dusk || tints[2], tile: 16.8 });
    const f = facing(x, z);
    const half = (f.ax === 'z' ? wd : dp) / 2;
    const face = (u, y, ww, hh, mat, out = 0.3) => {
      if (f.ax === 'z') w.box({ x: x + u, z: z + dp / 2 + out / 2, y, w: ww, h: hh, d: out, mat });
      else w.box({ x: x + f.s * (wd / 2 + out / 2), z: z + u, y, w: out, h: hh, d: ww, mat });
    };
    for (const u of [-half + 1.1, half - 1.1]) face(u, GY, 2.2, h + 1, charcoal, 0.6);
    for (const u of [-half * 0.36, half * 0.36]) face(u, GY + 8, 1.3, h - 8, white, 0.35);
    w.box({ x, z, y: GY + h, w: wd + 1, h: 1.4, d: dp + 1, mat: white });
    w.box({ x, z, y: GY + h + 1.4, w: wd * 0.7, h: 5, d: dp * 0.7, mat: charcoal });
    w.box({ x, z, y: GY + h + 6.4, w: wd * 0.74, h: 0.45, d: dp * 0.74, mat: crownLight });
    if (f.ax === 'z') nameTag('유탑 유블레스', x, GY + h - 6, z + dp / 2 + 0.8, 0, 17);
    else nameTag('유탑 유블레스', x + f.s * (wd / 2 + 0.8), GY + h - 6, z, (f.s * Math.PI) / 2, 19);
  };
  towerSK(-47, -98, 142, 0);
  towerSK(-15, -116, 150, 1);
  towerSK(19, -102, 142, 2);
  towerSK(52, -120, 154, 0);
  towerYU(-76, -46, 112);
  towerYU(72, -52, 118);
  towerYU(-104, -88, 106);

  return { LX0, LX1, LZ0, WALL, DZ, MAT };
}
