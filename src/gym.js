/* global THREE */
// Map 1: the dojo, laid out from the interior photos. The white mat takes most of the room, from
// the folding doors down to the walkway by the front desk, with waist-high white wall pads, grey
// wall tiles, a black open ceiling and long warm LED lines running toward the doors. The small
// conditioning room is in the corner by the entrance. It is on the sixth floor: the mat opens onto
// a roof terrace with a turf lawn and the apartment towers around it, at night (yard.js).
import { World, BELTS, FONT, fitText, drawContain, rand, pick } from './util.js';
import { NPC, randomLook, casualLook } from './npc.js';
import { buildYard } from './yard.js';
import { skyAt, hourAsked, NIGHT_HOUR } from './sky.js';
import { ROWS, timesText, flowText } from './schedule.js';
import { drawStrokes, metaLine } from './guest.js';

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function buildGym(api) {
  const w = new World('gym', '전주 퍼스트짐 도청점');
  const S = w.scene;
  // Outside it is night: the terrace looks best with the towers lit (an hour can still be asked
  // for in the address, ?h=9). The haze starts beyond anything in the room, so the room itself
  // keeps its dark, lamp-lit look.
  const asked = hourAsked();
  const sky = skyAt(asked == null ? NIGHT_HOUR : asked);
  S.background = new THREE.Color(sky.fog);
  S.fog = new THREE.Fog(sky.fog, 45, 250);
  const X0 = -12;
  const X1 = 12;
  const Z0 = -8;
  const Z1 = 8;
  const CEIL = 4.8;
  const roomCam = { minX: X0 + 0.35, maxX: X1 - 0.35, minZ: Z0 + 0.35, maxZ: Z1 - 0.35, maxY: 3.7, ceil: CEIL - 0.3 };
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
  const MZ1 = 4.8; // down to the walkway in front of the desk
  const mw = MX1 - MX0;
  const md = MZ1 - MZ0;
  const mcx = (MX0 + MX1) / 2;
  const mcz = (MZ0 + MZ1) / 2;
  w.box({ x: mcx, z: mcz, w: mw, h: 0.04, d: md, color: 0xdedbd2 });
  w.floor({ x: mcx, z: mcz, y: 0.042, w: mw, d: md, tex: w.texMatColor('white', '#eeece6', '#d6d3cb'), tile: 2 });
  w.collider(MX0, MX1, MZ0, MZ1, 0, 0.04);

  // The hip-walk race along the south edge of the mat: three lanes, six metres from the start line to
  // the finish.
  const RX0 = -3.0;
  const RX1 = -9.0;
  const LANE = 0.8;
  const RZ0 = -1.7;
  const RZ1 = RZ0 + 3 * LANE;
  const lanes = [0, 1, 2].map((i) => RZ0 + LANE * (i + 0.5));
  w.race = { x0: RX0, x1: RX1, z0: RZ0, z1: RZ1, yaw: -Math.PI / 2, lanes }; // sitting, facing the finish
  for (const [x, col] of [[RX0, 0xd99a00], [RX1, 0x15171a]]) w.box({ x, z: (RZ0 + RZ1) / 2, y: 0.043, w: 0.09, h: 0.004, d: RZ1 - RZ0, color: col });
  for (let i = 0; i <= 3; i++) w.box({ x: (RX0 + RX1) / 2, z: RZ0 + LANE * i, y: 0.043, w: RX0 - RX1, h: 0.004, d: 0.035, color: 0xb9b5aa });
  const laneText = (x, z, text, wd, big) => w.sign({
    x, y: 0.05, z, w: big ? 0.42 : 0.3, h: wd, flat: true, transparent: true, res: 160,
    draw: (c, W, H) => {
      c.clearRect(0, 0, W, H);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(-Math.PI / 2);
      c.fillStyle = '#8a8478';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, text, 0, 2, H * 0.92, Math.round(W * 0.62));
      c.restore();
    },
  });
  laneText(RX0 + 0.98, (RZ0 + RZ1) / 2, '엉덩이걷기 경주 · 출발', 2.1, true);
  lanes.forEach((z, i) => laneText(RX0 - 0.3, z, String(i + 1), 0.3));
  laneText(RX1 - 0.42, (RZ0 + RZ1) / 2, '도착', 0.8, true);
  w.interact.push({ x: RX0 + 0.9, z: (RZ0 + RZ1) / 2, r: 1.45, label: '엉덩이걷기 경주 시작 · 6 m', short: '경주', when: (a) => !a.racing(), action: (a) => a.race() });

  const wallC = 0x1b1c1f;
  // (the north wall, with its folding doors, is built with the yard below)
  w.box({ x: 0, z: Z1 + 0.15, w: 24.6, h: CEIL, d: 0.3, color: wallC, collide: true });
  w.box({ x: X0 - 0.15, z: 0, w: 0.3, h: CEIL, d: 16, color: wallC, collide: true });
  w.box({ x: X1 + 0.15, z: 0, w: 0.3, h: CEIL, d: 16, color: wallC, collide: true });
  w.box({ x: 0, z: 0, y: CEIL, w: 24.6, h: 0.2, d: 16.6, color: 0x0c0c0e });

  /* ---------- north side: folding doors along the mat (the yard is built further down) ---------- */
  const wx0 = -11.6;
  const wx1 = 1.8;
  const wcx = (wx0 + wx1) / 2;
  const frame = 0x111214;
  const GAP = [-8.6, -1.0]; // the part of the doors that stands open

  /* ---------- west wall: waist-high pad, grey tiles above, banner, belt board ---------- */
  const PAD = 1.15;
  w.box({ x: X0 + 0.06, z: mcz, w: 0.12, h: PAD, d: md, color: 0xf3f1ec });
  for (let z = MZ0 + 1.25; z < MZ1 - 0.2; z += 1.25) w.box({ x: X0 + 0.125, z, w: 0.006, h: PAD, d: 0.02, color: 0xcfccc4 });
  w.texBox({ x: X0 + 0.03, y: PAD, z: 0, w: 0.06, h: CEIL - PAD - 0.5, d: 15.9, tex: w.texTile(), tile: 1.2 });
  // the dark panel the logo hangs on
  w.box({ x: X0 + 0.07, y: 2.05, z: -3.9, w: 0.03, h: 2.1, d: 4.3, color: 0x101114 });
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
  w.logoSlot('gym', w.sign({ x: X0 + 0.11, y: 3.1, z: -3.9, w: 3.9, h: 1.7, rotY: Math.PI / 2, draw: gymBanner }));
  w.logoSlot('gym', w.sign({ x: -2.2, y: 2.5, z: Z1 - 0.02, w: 2.6, h: 1.16, rotY: Math.PI, draw: gymBanner }));

  /* ---------- the yard: folding doors, deck, lawn, apartment blocks ---------- */
  const yard = buildYard(w, { X0, X1, Z0, CEIL, door: [wx0, wx1], gap: GAP, banner: gymBanner, sky });
  w.sky = sky;
  // The camera may be in the room, on the lawn, or in the doorway between them.
  w.cam = Object.assign({}, roomCam, {
    boxes: [
      roomCam,
      { minX: GAP[0] + 0.3, maxX: GAP[1] - 0.3, minZ: yard.WALL - 0.95, maxZ: Z0 + 0.95, maxY: 2.7 },
      { minX: yard.LX0 + 0.75, maxX: yard.LX1 - 0.75, minZ: yard.LZ0 + 0.75, maxZ: yard.WALL - 0.45, maxY: 6.5, ceil: 9 },
    ],
  });

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

  // the timetable, on the same wall nearer the folding doors
  w.sign({
    x: X0 + 0.13, y: 1.4, z: -6.3, w: 2.0, h: 1.16, rotY: Math.PI / 2, res: 220,
    draw: (c, W, H) => {
      c.fillStyle = '#191c21';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffd79a';
      c.fillRect(0, 0, W, 5);
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = '#f1efe9';
      c.font = FONT(Math.round(H * 0.12));
      c.fillText('시간표', W * 0.06, H * 0.14);
      c.textAlign = 'right';
      c.fillStyle = '#9aa0a8';
      fitText(c, `${timesText()} · 한 타임 1시간`, W * 0.95, H * 0.145, W * 0.6, Math.round(H * 0.07), 500);
      ROWS.forEach((r, i) => {
        const y = H * (0.38 + i * 0.215);
        c.fillStyle = '#23272e';
        c.fillRect(W * 0.05, y - H * 0.088, W * 0.9, H * 0.176);
        c.textAlign = 'left';
        c.fillStyle = '#ffd79a';
        c.font = FONT(Math.round(H * 0.092));
        c.fillText(r.label, W * 0.08, y + 1);
        c.fillStyle = '#f1efe9';
        fitText(c, flowText(r.flow), W * 0.35, y + 1, W * 0.58, Math.round(H * 0.086), 700);
      });
    },
  });
  w.interact.push({ x: X0 + 1.1, z: -6.3, r: 1.9, label: '시간표 보기', short: '시간표', action: (a) => a.open('time') });


  /* ---------- south wall: door, planks ---------- */
  w.texBox({ x: 8.2, z: Z1 - 0.05, w: 7.6, h: 3.4, d: 0.1, tex: w.texPlank('black'), tile: 2 });
  w.texBox({ x: -5.0, y: 0, z: Z1 - 0.005, w: 14, h: CEIL - 0.5, d: 0.01, tex: w.texTile(), tile: 1.2 });
  w.box({ x: 3.5, z: Z1 - 0.03, w: 1.8, h: 2.3, d: 0.06, color: 0xbcd3e0, basic: true });
  w.box({ x: 2.56, z: Z1 - 0.06, w: 0.08, h: 2.4, d: 0.12, color: frame });
  w.box({ x: 4.44, z: Z1 - 0.06, w: 0.08, h: 2.4, d: 0.12, color: frame });
  w.box({ x: 3.5, z: Z1 - 0.06, y: 2.3, w: 1.96, h: 0.1, d: 0.12, color: frame });
  w.box({ x: 3.5, z: Z1 - 0.06, w: 0.06, h: 2.3, d: 0.1, color: frame });

  /* ---------- guestbook board beside the entrance: the newest drawings, pinned up ---------- */
  const guestSign = w.sign({
    x: 0.95, y: 1.62, z: Z1 - 0.02, w: 2.6, h: 1.7, rotY: Math.PI, res: 280,
    draw: (c, W, H) => {
      c.fillStyle = '#5a3d26';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#c9a877';
      c.fillRect(W * 0.018, H * 0.028, W * 0.964, H * 0.944);
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = '#15171a';
      c.font = FONT(Math.round(H * 0.085));
      c.fillText('게시판', W * 0.045, H * 0.105);
      c.textAlign = 'right';
      c.fillStyle = '#4a3626';
      c.font = FONT(Math.round(H * 0.046), 700);
      c.fillText('그림으로 남기는 한마디', W * 0.955, H * 0.11);
      const list = api.board();
      const tw = W * 0.28;
      const th = (tw * 160) / 256;
      for (let i = 0; i < 6; i++) {
        const x = W * (0.04 + (i % 3) * 0.32);
        const y = H * (0.185 + Math.floor(i / 3) * 0.385);
        c.fillStyle = 'rgba(0,0,0,.2)';
        c.fillRect(x + 4, y + 5, tw, th);
        c.fillStyle = '#f6f3ea';
        c.fillRect(x, y, tw, th);
        const e = list[i];
        if (e) {
          drawStrokes(c, e.strokes, tw, th, x, y);
          c.fillStyle = '#2a2018';
          c.textAlign = 'left';
          fitText(c, metaLine(e), x + 2, y + th + H * 0.04, tw - 4, Math.round(H * 0.038), 700);
        } else if (i === list.length) {
          c.fillStyle = '#9a8f7c';
          c.textAlign = 'center';
          fitText(c, list.length ? '다음 그림 자리' : '첫 그림을 남겨 보세요', x + tw / 2, y + th / 2, tw * 0.84, Math.round(H * 0.042), 700);
        }
        c.fillStyle = '#c62828';
        c.beginPath();
        c.arc(x + tw / 2, y + 3, H * 0.012, 0, Math.PI * 2);
        c.fill();
      }
    },
  });
  w.onBoard = () => guestSign.redraw();
  w.interact.push({ x: 0.95, z: Z1 - 1.3, r: 2.0, label: '게시판 · 그림 남기기', short: '게시판', action: (a) => a.open('guest') });

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

  /* ---------- front desk: across the room from the entrance, facing the mat ---------- */
  const DX = -6.6;
  w.texBox({ x: DX, z: 6.55, w: 3.8, h: 1.05, d: 0.8, tex: w.texBrick('red'), tile: 1, collide: true });
  w.box({ x: DX, z: 6.55, y: 1.05, w: 4.0, h: 0.06, d: 0.95, color: 0x2a2420 });
  w.cyl({ x: DX - 1.4, z: 6.55, y: 1.11, r: 0.07, h: 0.02, color: 0xb08d4a });
  w.cyl({ x: DX - 1.4, z: 6.55, y: 1.13, r: 0.012, h: 0.3, color: 0xb08d4a, seg: 8 });
  w.cyl({ x: DX - 1.4, z: 6.55, y: 1.4, r: 0.1, rTop: 0.04, h: 0.13, color: 0xb08d4a });
  w.box({ x: DX + 0.8, z: 6.6, y: 1.11, w: 0.36, h: 0.02, d: 0.26, color: 0x202226 });
  w.box({ x: DX + 0.8, z: 6.72, y: 1.12, w: 0.36, h: 0.24, d: 0.02, color: 0x202226, rotX: 0.25 });
  for (const y of [1.55, 2.1]) w.box({ x: DX, z: Z1 - 0.2, y, w: 2.6, h: 0.05, d: 0.3, color: 0x3a2c1e });
  for (let i = 0; i < 6; i++) {
    const tx = DX - 1.0 + i * 0.42;
    const ty = i % 2 ? 2.15 : 1.6;
    w.cyl({ x: tx, z: Z1 - 0.2, y: ty, r: 0.05, h: 0.05, color: 0x3a2c1e, seg: 8 });
    w.cyl({ x: tx, z: Z1 - 0.2, y: ty + 0.05, r: 0.03, rTop: 0.075, h: 0.2, color: 0xe2b93b, seg: 8 });
  }
  w.sign({
    x: DX, y: 2.9, z: Z1 - 0.07, w: 2.4, h: 0.42, rotY: Math.PI,
    draw: (c, W, H) => {
      c.fillStyle = '#15171a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffd79a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, '안내 데스크', W / 2, H / 2 + 1, W * 0.9, Math.round(H * 0.6), 700);
    },
  });

  /* ---------- conditioning room: the corner by the entrance, where the desk used to be ---------- */
  const CX0 = 5.3; // its west edge; the entrance walkway runs between it and the mat
  const steel = 0x17181a;
  // a low brick wall with a glass top marks it off from the walkway and the heavy bags
  w.texBox({ x: CX0, z: 5.7, w: 0.22, h: 0.9, d: 3.2, tex: w.texBrick('white'), tile: 1, collide: true });
  w.box({ x: CX0, z: 5.7, y: 0.9, w: 0.04, h: 1.2, d: 3.2, color: 0x9fc4d8, opacity: 0.16 });
  for (const z of [4.1, 5.7, 7.3]) w.box({ x: CX0, z, y: 0.9, w: 0.08, h: 1.2, d: 0.07, color: frame });
  w.sign({
    x: CX0 - 0.13, y: 1.35, z: 5.7, w: 1.9, h: 0.36, rotY: -Math.PI / 2,
    draw: (c, W, H) => {
      c.fillStyle = '#15171a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#f1efe9';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, '컨디셔닝 룸', W / 2, H / 2 + 1, W * 0.9, Math.round(H * 0.62), 700);
    },
  });
  // power rack with a loaded bar, and a bench
  const RX = 10.3;
  const RZ = 6.3;
  for (const [dx, dz] of [[-0.6, -0.7], [0.6, -0.7], [-0.6, 0.7], [0.6, 0.7]]) w.box({ x: RX + dx, z: RZ + dz, w: 0.08, h: 2.4, d: 0.08, color: steel });
  for (const dz of [-0.7, 0.7]) w.box({ x: RX, z: RZ + dz, y: 2.36, w: 1.28, h: 0.08, d: 0.08, color: steel });
  for (const dx of [-0.6, 0.6]) w.box({ x: RX + dx, z: RZ, y: 2.36, w: 0.08, h: 0.08, d: 1.48, color: steel });
  w.box({ x: RX - 0.7, z: RZ, y: 1.34, w: 0.03, h: 0.03, d: 2.2, color: 0xb8bcc2 });
  for (const [dz, col] of [[-0.98, 0x2456a6], [-1.06, 0x17181a], [0.98, 0x2456a6], [1.06, 0x17181a]]) {
    w.cyl({ x: RX - 0.7, y: 1.355, z: RZ + dz, r: 0.225, h: 0.05, rotX: Math.PI / 2, center: true, color: col });
  }
  w.collider(RX - 1.0, RX + 0.8, RZ - 1.15, RZ + 1.15, 0, 2.5);
  w.box({ x: RX - 1.9, z: RZ - 0.4, w: 0.34, h: 0.42, d: 1.25, color: 0x202226, collide: true });
  // dumbbell rack along the south wall
  const DR = 7.3;
  for (const y of [0.35, 0.78]) w.box({ x: DR, z: 7.5, y, w: 2.8, h: 0.06, d: 0.5, color: steel });
  for (const x of [DR - 1.35, DR + 1.35]) w.box({ x, z: 7.5, w: 0.06, h: 1.0, d: 0.5, color: steel });
  for (let i = 0; i < 6; i++) {
    for (const y of [0.41, 0.84]) w.box({ x: DR - 1.2 + i * 0.47, z: 7.5, y, w: 0.15, h: 0.15, d: 0.36, color: 0x101113 });
  }
  w.collider(DR - 1.5, DR + 1.5, 7.15, 7.85, 0, 1.1);
  for (let i = 0; i < 3; i++) w.sphere({ x: 5.75 + i * 0.3, y: 0.12, z: 4.0, r: 0.12, color: 0x101113 });
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
  w.box({ x: 11.3, z: 3.9, y: 1.75, w: 0.05, h: 0.05, d: 1.5, color: steel });
  for (const z of [3.2, 4.6]) w.box({ x: 11.3, z, w: 0.05, h: 1.78, d: 0.05, color: steel });
  [0xf3f2ee, 0x2148b5, 0xf3f2ee, 0x1d1e22].forEach((col, i) => w.box({ x: 11.3, z: 3.45 + i * 0.3, y: 0.82, w: 0.5, h: 0.9, d: 0.1, color: col }));
  w.collider(11.0, 11.6, 3.1, 4.7, 0, 1.8);
  w.box({ x: 2.75, z: 0.2, w: 0.4, h: 0.5, d: 0.32, color: 0x101113, collide: true });

  /* ---------- ceiling: ducts, cassettes, LED lines ---------- */
  w.cyl({ x: 0, y: 4.3, z: -2.2, r: 0.22, h: 23.6, rotZ: Math.PI / 2, center: true, color: 0x26272a });
  w.cyl({ x: 0, y: 4.42, z: 3.6, r: 0.14, h: 23.6, rotZ: Math.PI / 2, center: true, color: 0x26272a });
  w.cyl({ x: -3, y: 4.5, z: 0, r: 0.05, h: 15.6, rotX: Math.PI / 2, center: true, color: 0x3a3b3f, seg: 8 });
  for (const [x, z] of [[-5, -4], [-1, 3.6], [8.5, 1.6]]) {
    w.box({ x, z, y: 4.42, w: 0.95, h: 0.22, d: 0.95, color: 0xe9e9ea });
    w.box({ x, z, y: 4.41, w: 0.6, h: 0.02, d: 0.6, color: 0x55585c });
  }
  // long LED lines over the mat, running toward the folding doors, and two over the other side
  const led = (x0, x1, z) => w.box({ x: (x0 + x1) / 2, z, y: 4.15, w: x1 - x0, h: 0.04, d: 0.07, color: 0xffe9c4, basic: true });
  for (const x of [-9.4, -5.0, -0.6]) w.box({ x, z: (MZ0 + MZ1) / 2 + 0.4, y: 4.15, w: 0.07, h: 0.04, d: md + 1.6, color: 0xffe9c4, basic: true });
  led(2.8, 11.5, 2.6);
  led(2.8, 11.5, 6.3);

  /* ---------- round timer above the windows ---------- */
  const timer = { run: false, left: 0, shown: -1, match: null };
  const timerSign = w.sign({
    x: wcx, y: 3.5, z: Z0 + 0.02, w: 2.3, h: 0.66,
    draw: (c, W, H) => {
      c.fillStyle = '#060607';
      c.fillRect(0, 0, W, H);
      const clock = (sec) => `${String((sec / 60) | 0).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      const s = Math.max(0, Math.ceil(timer.left));
      const mt = timer.match;
      // sparring on the mat takes the board: the rounds won on each side
      const txt = mt ? `${mt.sa}  :  ${mt.sb}` : timer.run || timer.left > 0 ? clock(s) : 'ROUND';
      c.fillStyle = mt || timer.run ? '#ff5a3c' : '#ffb24a';
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
    timer.match = api.matchIn(MX0, MX1, MZ0, MZ1);
    const mt = timer.match;
    const s = mt ? `m${mt.sa}|${mt.sb}` : timer.run ? Math.ceil(timer.left) : -2 - (timer.left > 0 ? 1 : 0);
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
    x: 0.9, z: -5.4, yaw: -Math.PI / 2, anim: 'arms', spar: true, master: true, label: '관장님', // hard to beat (spar.js MASTER_WIN)
    lines: ['어서 오세요.', '좋지요. 매트로 오세요.', '내일 봅시다.'],
    look: gi({ belt: 'black', stripes: 2, gi: 'black', female: false, lite: false, hairStyle: 'flat' }),
  });
  w.interact.push({ x: master.x, z: master.z, r: 2.3, label: '관장님께 물어보기', short: '묻기', when: () => !master.busy && !master.back, action: (a) => a.open('master') });
  new NPC(w, { x: -4.8, z: -3.4, yaw: 0.9, spar: true, label: '스파링 파트너', look: gi({ belt: 'blue', gi: 'white', lite: false }) });
  new NPC(w, { x: -10.9, z: -2.6, yaw: Math.PI / 2, anim: 'sit', spar: true, name: '흰 띠 관원', look: gi({ belt: 'white' }) });
  w.box({ x: DX, z: 7.45, w: 0.7, h: 0.3, d: 0.55, color: 0x3a2c1e });
  new NPC(w, { x: DX, z: 7.45, y: 0.3, yaw: Math.PI, anim: 'arms', label: '안내 데스크', lines: ['어서 오세요!', '매트에서 스파링 버튼을 눌러 보세요.', '내일 봬요!'], look: casualLook({ top: 0x2b2b30 }) });
  new NPC(w, { x: -12.4, z: -18.6, yaw: 1.2, anim: 'stretch', spar: true, name: '야외 매트의 관원', look: gi({ belt: 'purple', gi: 'white' }) });

  /* ---------- zones ---------- */
  let lastBow = -1e9;
  w.zone({ id: 'room', label: '도장', prio: 0, minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 });
  let told = false;
  w.zone({
    id: 'entry', label: '입구', prio: 1, minX: 2.3, maxX: CX0, minZ: 3.4, maxZ: Z1,
    onEnter: (a) => {
      if (told) return;
      told = true;
      a.toast('매트 끝에 계신 관장님께 다가가 큰 버튼을 누르면 시간표와 2027 대회 신청을 볼 수 있습니다', 5200);
    },
  });
  w.zone({ id: 'cond', label: '컨디셔닝 룸', prio: 1, minX: CX0, maxX: X1, minZ: 3.4, maxZ: Z1 });
  w.zone({ id: 'desk', label: '안내 데스크', prio: 1, minX: X0, maxX: 2.3, minZ: MZ1, maxZ: Z1 });
  w.zone({
    id: 'mat', label: '매트', prio: 2, surface: 'mat', minX: MX0, maxX: MX1, minZ: MZ0, maxZ: MZ1, maxY: 1,
    onEnter: (a) => {
      if (nowMs() - lastBow > 25000) {
        lastBow = nowMs();
        a.bow();
        a.toast('매트에 오르며 인사합니다. 상대에게 붙으면 스파링 버튼이 켜집니다', 4200);
      }
    },
  });
  w.zone({ id: 'loft', label: '2층 관람 라운지', prio: 3, minX: QX0, maxX: QX1, minZ: QZ0, maxZ: QZ1, minY: QY - 0.3 });
  let out = false;
  w.zone({
    id: 'yard', label: '6층 테라스 잔디마당', prio: 1, minX: yard.LX0, maxX: yard.LX1, minZ: yard.LZ0, maxZ: Z0 - 0.15,
    onEnter: (a) => {
      if (out) return;
      out = true;
      a.toast('폴딩도어 밖은 6층 테라스 잔디마당입니다. 난간 너머로 전주 SK리더스뷰와 유탑유블레스의 야경이 보입니다', 4600);
    },
  });
  w.zone({
    id: 'openmat', label: '야외 매트', prio: 2, surface: 'mat', minX: yard.MAT.x0, maxX: yard.MAT.x1, minZ: yard.MAT.z0, maxZ: yard.MAT.z1, maxY: 1,
    onEnter: (a) => {
      if (nowMs() - lastBow > 25000) {
        lastBow = nowMs();
        a.bow();
        a.toast('야외 매트에 오르며 인사합니다. 여기서도 드릴과 스파링을 할 수 있습니다', 4200);
      }
    },
  });

  return w;
}
