/* global THREE */
// Map 1: the dojo, laid out from the two interior photos (white mat by the windows, dark rubber-tile
// conditioning floor, brick front desk, stairs to a loft, black open ceiling with warm LED lines).
import { World, BELTS, FONT, fitText, drawContain, rand, pick } from './util.js';
import { NPC, randomLook, casualLook } from './npc.js';

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function buildGym(api) {
  const w = new World('gym', '전주 퍼스트짐 도청점');
  const S = w.scene;
  S.background = new THREE.Color(0x0e0f11);
  S.fog = new THREE.Fog(0x0e0f11, 28, 70);
  const X0 = -12;
  const X1 = 12;
  const Z0 = -8;
  const Z1 = 8;
  const CEIL = 4.8;
  w.cam = { minX: X0 + 0.35, maxX: X1 - 0.35, minZ: Z0 + 0.35, maxZ: Z1 - 0.35, maxY: 3.7, ceil: CEIL - 0.3 };
  w.spawn = { x: 3.5, z: 4.4, yaw: Math.PI };

  /* ---------- light ---------- */
  S.add(new THREE.HemisphereLight(0xfff0dc, 0x2a2a30, 0.42));
  S.add(new THREE.AmbientLight(0xffffff, 0.12));
  const sun = new THREE.DirectionalLight(0xfff2e0, 0.34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.002;
  S.add(sun);
  S.add(sun.target);
  w.sun = sun;
  const warm = (x, y, z, i) => {
    const l = new THREE.PointLight(0xffd9a8, i, 17);
    l.position.set(x, y, z);
    S.add(l);
  };
  warm(-5, 3.9, -4, 0.3);
  warm(-4, 3.9, 4.2, 0.3);
  warm(7, 3.9, 2, 0.3);
  const purple = new THREE.PointLight(0x8a5cff, 0.4, 9);
  purple.position.set(-6, 2.7, -6.6);
  S.add(purple);

  /* ---------- floor, mat, shell ---------- */
  w.floor({ x: 0, z: 0, w: 24, d: 16, tex: w.texRubber(), tile: 2 });
  const MX0 = -11.85;
  const MX1 = 2.0;
  const MZ0 = -7.7;
  const MZ1 = 0.5;
  const mw = MX1 - MX0;
  const md = MZ1 - MZ0;
  const mcx = (MX0 + MX1) / 2;
  const mcz = (MZ0 + MZ1) / 2;
  w.box({ x: mcx, z: mcz, w: mw, h: 0.04, d: md, color: 0xdedbd2 });
  w.floor({ x: mcx, z: mcz, y: 0.042, w: mw, d: md, tex: w.texMatColor('white', '#eeece6', '#d6d3cb'), tile: 2 });
  w.collider(MX0, MX1, MZ0, MZ1, 0, 0.04);

  const wallC = 0x1b1c1f;
  w.box({ x: 0, z: Z0 - 0.15, w: 24.6, h: CEIL, d: 0.3, color: wallC, collide: true });
  w.box({ x: 0, z: Z1 + 0.15, w: 24.6, h: CEIL, d: 0.3, color: wallC, collide: true });
  w.box({ x: X0 - 0.15, z: 0, w: 0.3, h: CEIL, d: 16, color: wallC, collide: true });
  w.box({ x: X1 + 0.15, z: 0, w: 0.3, h: CEIL, d: 16, color: wallC, collide: true });
  w.box({ x: 0, z: 0, y: CEIL, w: 24.6, h: 0.2, d: 16.6, color: 0x0c0c0e });

  /* ---------- north windows along the mat ---------- */
  const wx0 = -11.6;
  const wx1 = 1.8;
  const wl = wx1 - wx0;
  const wcx = (wx0 + wx1) / 2;
  const frame = 0x111214;
  w.texBox({ x: wcx, z: Z0 + 0.14, w: wl, h: 0.9, d: 0.28, tex: w.texBrick('white'), tile: 1, collide: true });
  w.sign({
    x: wcx, y: 1.9, z: Z0 + 0.03, w: wl, h: 2.0, res: 48,
    draw: (c, W, H) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#cfe2f1');
      g.addColorStop(1, '#eef3f5');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      const cols = ['#b9c1c9', '#a9b2bb', '#c6ccd2', '#9da7b1'];
      let x = 0;
      while (x < W) {
        const bw = 50 + Math.random() * 90;
        const bh = H * (0.35 + Math.random() * 0.45);
        c.fillStyle = pick(cols);
        c.fillRect(x, H - bh, bw, bh);
        c.fillStyle = 'rgba(255,255,255,.35)';
        for (let yy = H - bh + 8; yy < H - 8; yy += 14) c.fillRect(x + 6, yy, bw - 12, 5);
        x += bw + 6;
      }
    },
  });
  for (let i = 0; i <= 10; i++) w.box({ x: wx0 + (wl * i) / 10, z: Z0 + 0.1, y: 0.9, w: 0.07, h: 2.0, d: 0.1, color: frame });
  w.box({ x: wcx, z: Z0 + 0.1, y: 2.86, w: wl, h: 0.08, d: 0.1, color: frame });
  w.box({ x: wcx, z: Z0 + 0.1, y: 1.9, w: wl, h: 0.05, d: 0.1, color: frame });
  w.box({ x: wcx, z: Z0 + 0.08, y: 3.0, w: wl, h: 0.05, d: 0.06, color: 0xa56bff, basic: true });

  /* ---------- west wall: pad, banner, belt board, wood ---------- */
  w.box({ x: X0 + 0.06, z: mcz, w: 0.12, h: 2.0, d: md, color: 0xf0eee8 });
  const gymBanner = (c, W, H, img) => {
    c.fillStyle = '#15171a';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffd79a';
    c.fillRect(0, H - 8, W, 8);
    if (img) {
      c.fillStyle = '#f4f2ec';
      c.fillRect(10, 10, W - 20, H - 28);
      drawContain(c, img, 10, 10, W - 20, H - 28, 10);
    } else {
      c.fillStyle = '#f1efe9';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'JIU-JITSU', W / 2, H * 0.42, W * 0.84, Math.round(H * 0.42));
      c.fillStyle = '#9aa0a8';
      fitText(c, '로고 자리 · 메뉴에서 이미지를 넣을 수 있습니다', W / 2, H * 0.76, W * 0.88, Math.round(H * 0.1), 500);
    }
  };
  w.logoSlot('gym', w.sign({ x: X0 + 0.02, y: 3.05, z: -3.9, w: 3.6, h: 1.6, rotY: Math.PI / 2, draw: gymBanner }));
  w.logoSlot('gym', w.sign({ x: -2.2, y: 2.5, z: Z1 - 0.02, w: 2.6, h: 1.16, rotY: Math.PI, draw: gymBanner }));

  w.sign({
    x: X0 + 0.13, y: 1.42, z: -0.95, w: 1.7, h: 1.1, rotY: Math.PI / 2,
    draw: (c, W, H) => {
      c.fillStyle = '#191c21';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffd79a';
      c.fillRect(0, 0, W, 5);
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = '#f1efe9';
      c.font = FONT(Math.round(H * 0.105));
      c.fillText('띠 체계', W * 0.06, H * 0.12);
      c.fillStyle = '#9aa0a8';
      c.font = FONT(Math.round(H * 0.055), 500);
      c.textAlign = 'right';
      c.fillText('다음 띠까지 최소 기간', W * 0.95, H * 0.125);
      const rows = [['white', '흰 띠', '제한 없음'], ['blue', '파란 띠', '2년'], ['purple', '보라 띠', '1년 6개월'], ['brown', '갈색 띠', '1년'], ['black', '검은 띠', '']];
      rows.forEach((r, i) => {
        const y = H * (0.3 + i * 0.145);
        c.fillStyle = BELTS[r[0]].css;
        c.fillRect(W * 0.06, y - H * 0.04, W * 0.46, H * 0.08);
        c.fillStyle = r[0] === 'black' ? '#c62828' : '#141414';
        c.fillRect(W * 0.4, y - H * 0.04, W * 0.07, H * 0.08);
        c.textAlign = 'left';
        c.fillStyle = '#f1efe9';
        c.font = FONT(Math.round(H * 0.07), 700);
        c.fillText(r[1], W * 0.56, y);
        c.textAlign = 'right';
        c.fillStyle = '#9aa0a8';
        c.font = FONT(Math.round(H * 0.055), 500);
        c.fillText(r[2], W * 0.95, y);
      });
    },
  });
  w.interact.push({ x: X0 + 1.1, z: -0.95, r: 2.3, label: '띠 체계 보기', short: '보기', action: (a) => a.openBelt() });

  w.texBox({ x: X0 + 0.05, z: 4.25, w: 0.1, h: 3.4, d: 7.5, tex: w.texPlank('brown'), tile: 2 });

  /* ---------- south wall: door, planks ---------- */
  w.texBox({ x: 8.2, z: Z1 - 0.05, w: 7.6, h: 3.4, d: 0.1, tex: w.texPlank('black'), tile: 2 });
  w.box({ x: 3.5, z: Z1 - 0.03, w: 1.8, h: 2.3, d: 0.06, color: 0xbcd3e0, basic: true });
  w.box({ x: 2.56, z: Z1 - 0.06, w: 0.08, h: 2.4, d: 0.12, color: frame });
  w.box({ x: 4.44, z: Z1 - 0.06, w: 0.08, h: 2.4, d: 0.12, color: frame });
  w.box({ x: 3.5, z: Z1 - 0.06, y: 2.3, w: 1.96, h: 0.1, d: 0.12, color: frame });
  w.box({ x: 3.5, z: Z1 - 0.06, w: 0.06, h: 2.3, d: 0.1, color: frame });

  /* ---------- east wall pads ---------- */
  w.box({ x: X1 - 0.07, z: 0.75, w: 0.14, h: 2.0, d: 6.5, color: 0x2f5fb3 });
  for (let z = -2.5; z <= 4.01; z += 1.3) w.box({ x: X1 - 0.145, z, w: 0.01, h: 2.0, d: 0.03, color: 0x234a8f });

  /* ---------- interior glass partition and tree ---------- */
  const pz0 = Z0 + 0.3;
  const pz1 = -1.2;
  const pl = pz1 - pz0;
  const pcz = (pz0 + pz1) / 2;
  w.texBox({ x: 2.15, z: pcz, w: 0.26, h: 0.9, d: pl, tex: w.texBrick('white'), tile: 1 });
  w.box({ x: 2.15, z: pcz, y: 0.9, w: 0.04, h: 1.75, d: pl, color: 0x9fc4d8, opacity: 0.16 });
  for (let i = 0; i <= 5; i++) w.box({ x: 2.15, z: pz0 + (pl * i) / 5, y: 0.9, w: 0.09, h: 1.75, d: 0.07, color: frame });
  w.box({ x: 2.15, z: pcz, y: 2.62, w: 0.1, h: 0.08, d: pl, color: frame });
  w.collider(2.0, 2.3, pz0, pz1, 0, 2.7);

  const tree = (x, z) => {
    w.box({ x, z, w: 0.75, h: 0.62, d: 0.75, color: 0x8a6a48, collide: true });
    w.box({ x, z, y: 0.6, w: 0.66, h: 0.04, d: 0.66, color: 0x3a2c1e });
    w.cyl({ x, z, y: 0.6, r: 0.045, h: 1.7, color: 0x5a4632, seg: 8 });
    const cols = [0xb8c45a, 0x9fb14a, 0xc9cf6a, 0xa9b850];
    for (let i = 0; i < 7; i++) {
      w.sphere({ x: x + rand(-0.45, 0.45), y: rand(2.05, 2.9), z: z + rand(-0.45, 0.45), r: rand(0.28, 0.46), color: pick(cols), lo: true });
    }
  };
  tree(2.15, -0.72);

  /* ---------- stairs and loft (north-east) ---------- */
  w.texBox({ x: 7.2, z: Z0 + 0.03, w: 9.6, h: CEIL, d: 0.06, tex: w.texPlank('black'), tile: 2 });
  const SX0 = 3.2;
  const N = 14;
  const RUN = 0.3;
  const RISE = 0.2;
  const sz = -7.2;
  const sd = 1.2;
  for (let i = 0; i < N; i++) {
    const top = RISE * (i + 1);
    const x = SX0 + RUN * i + RUN / 2;
    w.box({ x, z: sz, w: RUN, h: top - 0.04, d: sd, color: 0x1c1c1e });
    w.box({ x, z: sz, y: top - 0.04, w: RUN + 0.02, h: 0.04, d: sd, color: 0x8a5a36 });
    w.collider(x - RUN / 2, x + RUN / 2, sz - sd / 2, sz + sd / 2, 0, top);
    if (i % 3 === 0) w.box({ x, z: sz + sd / 2 - 0.03, y: top, w: 0.04, h: 0.95, d: 0.04, color: frame });
  }
  const slope = Math.atan2(N * RISE, N * RUN);
  const slen = Math.hypot(N * RISE, N * RUN);
  w.box({ x: SX0 + (N * RUN) / 2, z: sz + sd / 2 - 0.03, y: (N * RISE) / 2 + 1.0, w: slen, h: 0.05, d: 0.05, rotZ: slope, color: frame });
  w.box({ x: SX0 + (N * RUN) / 2, z: sz + sd / 2 - 0.03, y: (N * RISE) / 2 + 0.55, w: slen, h: 0.03, d: 0.03, rotZ: slope, color: frame });
  w.collider(SX0, SX0 + N * RUN, sz + sd / 2 - 0.06, sz + sd / 2 + 0.02, 0, 4.4);

  const QX0 = SX0 + N * RUN;
  const QX1 = 11.85;
  const QZ0 = -7.85;
  const QZ1 = -2.9;
  const QY = N * RISE;
  w.box({ x: (QX0 + QX1) / 2, z: (QZ0 + QZ1) / 2, y: QY - 0.2, w: QX1 - QX0, h: 0.2, d: QZ1 - QZ0, color: 0x4a3626 });
  w.collider(QX0, QX1, QZ0, QZ1, QY - 0.2, QY);
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const yy of [1.0, 0.5]) {
      w.box({ x: cx, z: cz, y: QY + yy, w: alongX ? len : 0.05, h: yy === 1.0 ? 0.05 : 0.03, d: alongX ? 0.05 : len, color: frame });
    }
    const n = Math.max(2, Math.round(len / 1.1));
    for (let i = 0; i <= n; i++) {
      w.box({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, y: QY, w: 0.04, h: 1.0, d: 0.04, color: frame });
    }
    w.collider(Math.min(x0, x1) - 0.04, Math.max(x0, x1) + 0.04, Math.min(z0, z1) - 0.04, Math.max(z0, z1) + 0.04, QY, QY + 1.1);
  };
  rail(QX0, QZ1, QX1, QZ1);
  rail(QX0, sz + sd / 2, QX0, QZ1);
  // enclosed changing rooms under the loft
  w.texBox({ x: (QX0 + QX1) / 2, z: QZ1 - 0.04, w: QX1 - QX0, h: QY - 0.2, d: 0.08, tex: w.texPlank('black'), tile: 2 });
  w.texBox({ x: QX0 + 0.04, z: (sz + sd / 2 + QZ1) / 2, w: 0.08, h: QY - 0.2, d: QZ1 - (sz + sd / 2), tex: w.texPlank('black'), tile: 2 });
  w.collider(QX0, QX1, QZ1 - 0.1, QZ1, 0, QY - 0.2);
  w.collider(QX0, QX0 + 0.1, sz + sd / 2, QZ1, 0, QY - 0.2);
  w.box({ x: 9.6, z: QZ1 + 0.012, w: 0.9, h: 2.05, d: 0.03, color: 0x2c2c31 });
  w.sign({
    x: 9.6, y: 2.28, z: QZ1 + 0.02, w: 1.5, h: 0.3,
    draw: (c, W, H) => {
      c.fillStyle = '#191c21';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#f1efe9';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, '탈의실 · 샤워실', W / 2, H / 2 + 1, W * 0.9, Math.round(H * 0.6), 700);
    },
  });
  // loft furniture
  w.box({ x: 11.5, z: -5.4, y: QY, w: 0.5, h: 0.45, d: 3.2, color: 0x2a2a2e, collide: true });
  w.box({ x: 11.72, z: -5.4, y: QY + 0.45, w: 0.1, h: 0.5, d: 3.2, color: 0x2a2a2e });
  w.box({ x: 9.6, z: -5.4, y: QY, w: 0.8, h: 0.4, d: 0.8, color: 0x6b4a2e, collide: true });
  w.sign({
    x: QX1 - 0.02, y: QY + 1.5, z: -5.4, w: 2.2, h: 0.5, rotY: -Math.PI / 2,
    draw: (c, W, H) => {
      c.fillStyle = '#15171a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffd79a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, '2층 관람 라운지', W / 2, H / 2 + 1, W * 0.9, Math.round(H * 0.55), 700);
    },
  });

  /* ---------- front desk ---------- */
  w.texBox({ x: 7.5, z: 4.8, w: 3.8, h: 1.05, d: 0.8, tex: w.texBrick('red'), tile: 1, collide: true });
  w.box({ x: 7.5, z: 4.8, y: 1.05, w: 4.0, h: 0.06, d: 0.95, color: 0x2a2420 });
  w.cyl({ x: 6.1, z: 4.8, y: 1.11, r: 0.07, h: 0.02, color: 0xb08d4a });
  w.cyl({ x: 6.1, z: 4.8, y: 1.13, r: 0.012, h: 0.3, color: 0xb08d4a, seg: 8 });
  w.cyl({ x: 6.1, z: 4.8, y: 1.4, r: 0.1, rTop: 0.04, h: 0.13, color: 0xb08d4a });
  w.box({ x: 8.3, z: 4.85, y: 1.11, w: 0.36, h: 0.02, d: 0.26, color: 0x202226 });
  w.box({ x: 8.3, z: 4.97, y: 1.12, w: 0.36, h: 0.24, d: 0.02, color: 0x202226, rotX: 0.25 });
  for (const y of [1.55, 2.1]) w.box({ x: 7.5, z: Z1 - 0.2, y, w: 2.6, h: 0.05, d: 0.3, color: 0x3a2c1e });
  for (let i = 0; i < 6; i++) {
    const tx = 6.5 + i * 0.42;
    const ty = i % 2 ? 2.15 : 1.6;
    w.cyl({ x: tx, z: Z1 - 0.2, y: ty, r: 0.05, h: 0.05, color: 0x3a2c1e, seg: 8 });
    w.cyl({ x: tx, z: Z1 - 0.2, y: ty + 0.05, r: 0.03, rTop: 0.075, h: 0.2, color: 0xe2b93b, seg: 8 });
  }

  /* ---------- conditioning zone ---------- */
  const steel = 0x17181a;
  for (const [x, z] of [[-10.9, 2.5], [-9.7, 2.5], [-10.9, 3.9], [-9.7, 3.9]]) w.box({ x, z, w: 0.08, h: 2.4, d: 0.08, color: steel });
  for (const z of [2.5, 3.9]) w.box({ x: -10.3, z, y: 2.36, w: 1.28, h: 0.08, d: 0.08, color: steel });
  for (const x of [-10.9, -9.7]) w.box({ x, z: 3.2, y: 2.36, w: 0.08, h: 0.08, d: 1.48, color: steel });
  w.box({ x: -9.6, z: 3.2, y: 1.34, w: 0.03, h: 0.03, d: 2.2, color: 0xb8bcc2 });
  for (const [z, col] of [[2.22, 0x2456a6], [2.14, 0x17181a], [4.18, 0x2456a6], [4.26, 0x17181a]]) {
    w.cyl({ x: -9.6, y: 1.355, z, r: 0.225, h: 0.05, rotX: Math.PI / 2, center: true, color: col });
  }
  w.collider(-11.1, -9.3, 2.05, 4.35, 0, 2.5);
  w.box({ x: -8.4, z: 3.2, w: 0.34, h: 0.42, d: 1.25, color: 0x202226, collide: true });
  // dumbbell rack
  for (const y of [0.35, 0.78]) w.box({ x: -6.8, z: 7.5, y, w: 2.8, h: 0.06, d: 0.5, color: steel });
  for (const x of [-8.15, -5.45]) w.box({ x, z: 7.5, w: 0.06, h: 1.0, d: 0.5, color: steel });
  for (let i = 0; i < 6; i++) {
    for (const y of [0.41, 0.84]) w.box({ x: -8.0 + i * 0.47, z: 7.5, y, w: 0.15, h: 0.15, d: 0.36, color: 0x101113 });
  }
  w.collider(-8.3, -5.3, 7.15, 7.85, 0, 1.1);
  for (let i = 0; i < 4; i++) w.sphere({ x: -4.4 + i * 0.34, y: 0.12, z: 7.55, r: 0.12, color: 0x101113 });
  // rowing machines stored upright against the partition
  for (const z of [-3.5, -2.6]) {
    w.box({ x: 2.72, z, w: 0.1, h: 2.05, d: 0.14, color: 0xe8e8ea, rotZ: -0.06 });
    w.box({ x: 2.95, z, w: 0.5, h: 0.5, d: 0.32, color: 0x1a1b1e });
    w.cyl({ x: 3.0, y: 0.62, z, r: 0.2, h: 0.08, rotX: Math.PI / 2, center: true, color: 0x26282c });
    w.box({ x: 2.82, z, y: 1.15, w: 0.2, h: 0.14, d: 0.04, color: 0x101113 });
  }
  w.collider(2.3, 3.3, -3.95, -2.15, 0, 2.05);
  // heavy bags
  w.box({ x: 9.9, z: 1.85, y: 3.7, w: 2.2, h: 0.1, d: 0.1, color: steel });
  w.cyl({ x: 10.5, z: 1.85, y: 2.1, r: 0.012, h: 1.6, color: 0x8a8f96, seg: 8 });
  w.cyl({ x: 10.5, z: 1.85, y: 0.55, r: 0.185, h: 1.55, color: 0x141416 });
  w.cyl({ x: 10.5, z: 1.85, y: 1.55, r: 0.188, h: 0.2, color: 0xe8e8ea });
  w.collider(10.3, 10.7, 1.65, 2.05, 0.5, 2.2);
  w.cyl({ x: 9.3, z: 1.85, y: 2.15, r: 0.012, h: 1.55, color: 0x8a8f96, seg: 8 });
  w.sphere({ x: 9.3, y: 1.75, z: 1.85, r: 0.3, sy: 1.25, color: 0x141416 });
  w.sphere({ x: 9.3, y: 1.98, z: 1.85, r: 0.24, sy: 0.95, color: 0xe8e8ea });
  w.collider(9.08, 9.52, 1.63, 2.07, 1.3, 2.2);
  // gi rack and speaker
  w.box({ x: 11.3, z: 5.4, y: 1.75, w: 0.05, h: 0.05, d: 1.5, color: steel });
  for (const z of [4.7, 6.1]) w.box({ x: 11.3, z, w: 0.05, h: 1.78, d: 0.05, color: steel });
  [0xf3f2ee, 0x2148b5, 0xf3f2ee, 0x1d1e22].forEach((col, i) => w.box({ x: 11.3, z: 4.95 + i * 0.3, y: 0.82, w: 0.5, h: 0.9, d: 0.1, color: col }));
  w.collider(11.0, 11.6, 4.6, 6.2, 0, 1.8);
  w.box({ x: -0.6, z: 0.95, w: 0.4, h: 0.5, d: 0.32, color: 0x101113, collide: true });

  /* ---------- ceiling: ducts, cassettes, LED lines ---------- */
  w.cyl({ x: 0, y: 4.3, z: -2.2, r: 0.22, h: 23.6, rotZ: Math.PI / 2, center: true, color: 0x26272a });
  w.cyl({ x: 0, y: 4.42, z: 3.6, r: 0.14, h: 23.6, rotZ: Math.PI / 2, center: true, color: 0x26272a });
  w.cyl({ x: -3, y: 4.5, z: 0, r: 0.05, h: 15.6, rotX: Math.PI / 2, center: true, color: 0x3a3b3f, seg: 8 });
  for (const [x, z] of [[-5, -4], [-1, 3.6], [8.5, 1.6]]) {
    w.box({ x, z, y: 4.42, w: 0.95, h: 0.22, d: 0.95, color: 0xe9e9ea });
    w.box({ x, z, y: 4.41, w: 0.6, h: 0.02, d: 0.6, color: 0x55585c });
  }
  const led = (x0, x1, z) => w.box({ x: (x0 + x1) / 2, z, y: 4.15, w: x1 - x0, h: 0.04, d: 0.07, color: 0xffe9c4, basic: true });
  led(-11.2, 1.6, -5.7);
  led(-11.5, 11.5, -1.7);
  led(-11.5, 11.5, 2.6);
  led(-11.5, 11.5, 6.3);

  /* ---------- round timer above the windows ---------- */
  const timer = { run: false, left: 0, shown: -1 };
  const timerSign = w.sign({
    x: wcx, y: 3.5, z: Z0 + 0.02, w: 2.3, h: 0.66,
    draw: (c, W, H) => {
      c.fillStyle = '#060607';
      c.fillRect(0, 0, W, H);
      const s = Math.max(0, Math.ceil(timer.left));
      const txt = timer.run || timer.left > 0 ? `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : 'ROUND';
      c.fillStyle = timer.run ? '#ff5a3c' : '#ffb24a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, txt, W / 2, H / 2 + 2, W * 0.9, Math.round(H * 0.78));
    },
  });
  w.tickers.push((dt) => {
    if (timer.run) {
      timer.left -= dt;
      if (timer.left <= 0) {
        timer.left = 0;
        timer.run = false;
        api.sfx('beep');
        api.toast('라운드 종료');
      }
    }
    const s = timer.run ? Math.ceil(timer.left) : -2 - (timer.left > 0 ? 1 : 0);
    if (s !== timer.shown) {
      timer.shown = s;
      timerSign.redraw();
    }
  });
  w.interact.push({
    x: wcx, z: -5.9, r: 2.4,
    label: () => (timer.run ? '라운드 타이머 멈추기' : `라운드 타이머 시작 · ${api.beltMinutes()}분`),
    short: '타이머',
    action: (a) => {
      if (timer.run) {
        timer.run = false;
        timer.left = 0;
      } else {
        timer.left = a.beltMinutes() * 60;
        timer.run = true;
        a.sfx('beep');
        a.toast(`${BELTS[a.sel.belt].name} 경기 시간 ${a.beltMinutes()}분 라운드를 시작합니다`);
      }
    },
  });

  /* ---------- people ---------- */
  const patch = w.canvasTex(128, 104, null);
  const drawPatch = (img) => {
    const c = patch.c;
    c.fillStyle = '#f4f2ec';
    c.fillRect(0, 0, 128, 104);
    if (img) drawContain(c, img, 0, 0, 128, 104, 6);
    else {
      c.strokeStyle = '#15171a';
      c.lineWidth = 5;
      c.strokeRect(6, 6, 116, 92);
      c.fillStyle = '#15171a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'JIU-JITSU', 64, 54, 100, 26);
    }
    patch.tex.needsUpdate = true;
  };
  drawPatch(null);
  const patchMat = w.own(new THREE.MeshLambertMaterial({ map: patch.tex }));
  w.logoSlot('gym', { redraw: drawPatch });
  const gi = (o) => randomLook(Object.assign({ patchMat }, o));

  // A small room: the master, one sparring partner, one member resting by the wall, the front desk.
  const master = new NPC(w, {
    x: 0.9, z: -5.4, yaw: -Math.PI / 2, anim: 'arms', spar: true, label: '관장님',
    look: gi({ belt: 'black', stripes: 2, gi: 'black', female: false, lite: false, hairStyle: 'flat' }),
  });
  w.interact.push({ x: master.x, z: master.z, r: 2.3, label: '관장님께 물어보기', short: '묻기', when: () => !master.busy && !master.back, action: (a) => a.open('master') });
  new NPC(w, { x: -4.8, z: -3.4, yaw: 0.9, spar: true, label: '스파링 파트너', look: gi({ belt: 'blue', gi: 'white', lite: false }) });
  new NPC(w, { x: -10.9, z: -2.6, yaw: Math.PI / 2, anim: 'sit', spar: true, name: '흰 띠 관원', look: gi({ belt: 'white' }) });
  w.box({ x: 7.5, z: 6.1, w: 0.7, h: 0.3, d: 0.55, color: 0x3a2c1e });
  new NPC(w, { x: 7.5, z: 6.1, y: 0.3, yaw: Math.PI, anim: 'arms', look: casualLook({ top: 0x2b2b30 }) });

  /* ---------- zones ---------- */
  let lastBow = -1e9;
  w.zone({ id: 'room', label: '컨디셔닝 존', prio: 0, minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 });
  let told = false;
  w.zone({
    id: 'desk', label: '안내 데스크', prio: 1, minX: 2.4, maxX: X1, minZ: 3.4, maxZ: Z1,
    onEnter: (a) => {
      if (told) return;
      told = true;
      a.toast('매트 끝에 계신 관장님께 다가가 큰 버튼을 누르면 시간표와 2027 대회 신청을 볼 수 있습니다', 5200);
    },
  });
  w.zone({
    id: 'mat', label: '매트', prio: 2, surface: 'mat', minX: MX0, maxX: MX1, minZ: MZ0, maxZ: MZ1, maxY: 1,
    onEnter: (a) => {
      if (nowMs() - lastBow > 25000) {
        lastBow = nowMs();
        a.bow();
        a.toast('매트에 오르며 인사합니다. 상대에게 붙으면 기술 버튼을 쓸 수 있습니다', 4200);
      }
    },
  });
  w.zone({ id: 'loft', label: '2층 관람 라운지', prio: 3, minX: QX0, maxX: QX1, minZ: QZ0, maxZ: QZ1, minY: QY - 0.3 });

  return w;
}
