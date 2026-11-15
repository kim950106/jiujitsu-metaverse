/* global THREE, window, performance */
// Map 2: the tournament hall. A 70 x 39 m arena floor with a crowd on four sides, two open mats
// for visitors to fight on, a warm-up area and a podium. Only one black-belt coach may sit matside.
import { World, GEO, FONT, fitText, drawContain, rand, pick } from './util.js';
import { NPC, randomLook, casualLook } from './npc.js';
import { KINDS } from './tech.js';

const CLOTHES = [0x2f4f6f, 0x6f2f3a, 0x3d5a3d, 0x4a4a52, 0x7a5a2a, 0xd9d9d9, 0x8a8f96, 0x305a6a, 0xf3f2ee, 0x2148b5, 0x1d1e22, 0xb8862f];
const SKINS = [0xf6cfae, 0xefc09a, 0xe2ab82, 0xd0976c, 0xb07c56];
const HAIRS = [0x1c1613, 0x2e1f16, 0x121214, 0x3d2c20, 0x6e5b45];
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function buildArena(api) {
  const w = new World('arena', '치바 포트 아레나 · 아시아 선수권');
  const S = w.scene;
  S.background = new THREE.Color(0x141a22);
  S.fog = new THREE.Fog(0x141a22, 80, 200);
  const HX = 35;
  const HZ = 19.5;
  w.cam = { minX: -HX + 0.4, maxX: HX - 0.4, minZ: -HZ + 0.4, maxZ: HZ - 0.4, maxY: 13.5 };
  w.spawn = { x: -30.5, z: 16.6, yaw: Math.atan2(10.5, -16.5) };
  const once = new Set();
  const tipOnce = (key, msg, ms) => {
    if (once.has(key)) return;
    once.add(key);
    api.toast(msg, ms || 4200);
  };

  /* ---------- light ---------- */
  S.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.6));
  S.add(new THREE.AmbientLight(0xffffff, 0.14));
  const sun = new THREE.DirectionalLight(0xffffff, 0.38);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.002;
  S.add(sun);
  S.add(sun.target);
  w.sun = sun;

  /* ---------- floor, walls, stands, roof ---------- */
  w.floor({ x: 0, z: 0, w: HX * 2, d: HZ * 2, tex: w.texWoodFloor(), tile: 4 });
  const wallC = 0x22364c;
  w.box({ x: 0, z: -HZ - 0.2, w: 70.8, h: 3, d: 0.4, color: wallC, collide: true });
  w.box({ x: 0, z: HZ + 0.2, w: 70.8, h: 3, d: 0.4, color: wallC, collide: true });
  w.box({ x: -HX - 0.2, z: 0, w: 0.4, h: 3, d: 39, color: wallC, collide: true });
  w.box({ x: HX + 0.2, z: 0, w: 0.4, h: 3, d: 39, color: wallC, collide: true });

  const TD = 0.9;
  const TR = 0.5;
  const NS = 7;
  const EW = 6;
  const spots = [];
  for (let i = 0; i < NS; i++) {
    const top = 3 + TR * (i + 1);
    const zc = HZ + 0.4 + TD * i + TD / 2;
    for (const sg of [-1, 1]) {
      w.box({ x: 0, z: sg * zc, w: 70.8, h: top, d: TD, color: 0x7c8189 });
      w.box({ x: 0, z: sg * (zc - 0.12), y: top, w: 70.4, h: 0.28, d: 0.5, color: i % 3 === 2 ? 0x8a9099 : 0x2a5ea8 });
      for (let x = -34.6; x <= 34.6; x += 0.62) spots.push({ x, y: top + 0.28, z: sg * (zc - 0.12), yaw: sg === 1 ? Math.PI : 0, p: 0.45 });
    }
  }
  for (let i = 0; i < EW; i++) {
    const top = 3 + TR * (i + 1);
    const xc = HX + 0.4 + TD * i + TD / 2;
    for (const sg of [-1, 1]) {
      w.box({ x: sg * xc, z: 0, w: TD, h: top, d: 39, color: 0x7c8189 });
      w.box({ x: sg * (xc - 0.12), z: 0, y: top, w: 0.5, h: 0.28, d: 38.6, color: i % 3 === 2 ? 0x8a9099 : 0x2a5ea8 });
      for (let z = -19; z <= 19; z += 0.62) spots.push({ x: sg * (xc - 0.12), y: top + 0.28, z, yaw: sg === 1 ? -Math.PI / 2 : Math.PI / 2, p: 0.3 });
    }
  }
  // phones get a slightly thinner crowd; the bodies are plain boxes since nobody sees them up close
  const thin = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 0.75 : 1;
  const occ = spots.filter((s) => Math.random() < s.p * thin);
  const body = new THREE.InstancedMesh(GEO().box, w.own(new THREE.MeshLambertMaterial({ color: 0xffffff })), occ.length);
  const head = new THREE.InstancedMesh(GEO().sphLo, w.own(new THREE.MeshLambertMaterial({ color: 0xffffff })), occ.length);
  const hair = new THREE.InstancedMesh(GEO().sphLo, w.own(new THREE.MeshLambertMaterial({ color: 0xffffff })), occ.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  occ.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    m4.compose(v1.set(s.x, s.y + 0.21, s.z), q, v2.set(0.4, 0.42, 0.3));
    body.setMatrixAt(i, m4);
    body.setColorAt(i, col.setHex(pick(CLOTHES)));
    m4.compose(v1.set(s.x, s.y + 0.6, s.z), q, v2.set(0.225, 0.213, 0.215));
    head.setMatrixAt(i, m4);
    head.setColorAt(i, col.setHex(pick(SKINS)));
    m4.compose(v1.set(s.x - Math.sin(s.yaw) * 0.034, s.y + 0.625, s.z - Math.cos(s.yaw) * 0.034), q, v2.set(0.236, 0.222, 0.226));
    hair.setMatrixAt(i, m4);
    hair.setColorAt(i, col.setHex(pick(HAIRS)));
  });
  for (const im of [body, head, hair]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    S.add(im);
  }
  const backZ = HZ + 0.4 + TD * NS + 0.2;
  const backX = HX + 0.4 + TD * EW + 0.2;
  const ROOF = 15;
  const shell = 0x1a2230;
  w.box({ x: 0, z: -backZ, w: backX * 2 + 0.4, h: ROOF, d: 0.4, color: shell });
  w.box({ x: 0, z: backZ, w: backX * 2 + 0.4, h: ROOF, d: 0.4, color: shell });
  w.box({ x: -backX, z: 0, w: 0.4, h: ROOF, d: backZ * 2, color: shell });
  w.box({ x: backX, z: 0, w: 0.4, h: ROOF, d: backZ * 2, color: shell });
  w.box({ x: 0, z: 0, y: ROOF, w: backX * 2 + 0.4, h: 0.3, d: backZ * 2 + 0.4, color: 0x10151c });
  for (const z of [-13, -4.4, 4.4, 13]) w.box({ x: 0, z, y: ROOF - 0.9, w: backX * 2, h: 0.25, d: 0.25, color: 0x2a3340 });
  for (let x = -30; x <= 30; x += 12) {
    w.box({ x, z: 0, y: ROOF - 0.7, w: 0.2, h: 0.2, d: backZ * 2, color: 0x2a3340 });
    for (const z of [-11, 0, 11]) w.box({ x, z, y: ROOF - 0.55, w: 4.2, h: 0.1, d: 1.5, color: 0xf6f9ff, basic: true });
  }

  /* ---------- banners and the centre screen ---------- */
  const eventBanner = (c, W, H, img) => {
    c.fillStyle = '#10223a';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#f2c230';
    c.fillRect(0, 0, W, H * 0.07);
    c.fillRect(0, H * 0.93, W, H * 0.07);
    if (img) {
      c.fillStyle = '#ffffff';
      c.fillRect(W * 0.03, H * 0.13, W * 0.94, H * 0.74);
      drawContain(c, img, W * 0.03, H * 0.13, W * 0.94, H * 0.74, 8);
    } else {
      c.fillStyle = '#f4f6f8';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'JIU-JITSU CHAMPIONSHIP', W / 2, H * 0.45, W * 0.9, Math.round(H * 0.32));
      c.fillStyle = '#8fa3bb';
      fitText(c, '대회 로고 자리', W / 2, H * 0.76, W * 0.5, Math.round(H * 0.13), 500);
    }
  };
  for (const x of [-24, -8, 8, 24]) {
    w.logoSlot('event', w.sign({ x, y: 1.6, z: -HZ + 0.02, w: 7, h: 1.7, res: 64, draw: eventBanner }));
    if (x !== -24) w.logoSlot('event', w.sign({ x, y: 1.6, z: HZ - 0.02, w: 7, h: 1.7, res: 64, rotY: Math.PI, draw: eventBanner }));
  }
  w.box({ x: 0, z: 0, y: 9.6, w: 5.3, h: 2.9, d: 5.3, color: 0x0d1118 });
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) w.cyl({ x, z, y: 12.5, r: 0.03, h: ROOF - 12.5, color: 0x55606e, seg: 8 });
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    w.logoSlot('event', w.sign({ x: Math.sin(rot) * 2.66, y: 11.05, z: Math.cos(rot) * 2.66, w: 5, h: 2.6, res: 64, rotY: rot, draw: eventBanner }));
  }

  /* ---------- competition floor: fence, gates ---------- */
  const BX = 15;
  const BZ = 9;
  const GATE = 1.7;
  const fence = (x0, z0, x1, z1) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    w.box({ x: cx, z: cz, w: alongX ? len : 0.1, h: 1.0, d: alongX ? 0.1 : len, color: 0x1d2633, collide: true });
    w.box({ x: cx, z: cz, y: 1.0, w: alongX ? len : 0.14, h: 0.05, d: alongX ? 0.14 : len, color: 0xe9edf2 });
  };
  fence(-BX, -BZ, BX, -BZ);
  fence(-BX, BZ, BX, BZ);
  fence(-BX, -BZ, -BX, -GATE);
  fence(-BX, GATE, -BX, BZ);
  fence(BX, -BZ, BX, -GATE);
  fence(BX, GATE, BX, BZ);
  for (const gx of [-BX, BX]) {
    for (const gz of [-GATE, GATE]) w.box({ x: gx, z: gz, w: 0.1, h: 2.75, d: 0.1, color: 0x1d2633 });
    w.sign({
      x: gx, y: 2.5, z: 0, w: GATE * 2, h: 0.5, rotY: gx < 0 ? -Math.PI / 2 : Math.PI / 2, double: true, gap: 0.03,
      draw: (c, W, H) => {
        c.fillStyle = '#f2c230';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#10223a';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        fitText(c, '선수 · 지도자 입구', W / 2, H / 2 + 1, W * 0.9, Math.round(H * 0.62));
      },
    });
  }

  /* ---------- two open mats ---------- */
  const texY = w.texMatColor('yellow', '#f0c22e', '#d6a91f');
  const texB = w.texMatColor('blue', '#2a5cab', '#234f95');
  const mats = [];
  const drawScore = (c, W, H, d) => {
    c.fillStyle = '#0b0d10';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#1d2633';
    c.fillRect(0, 0, W, H * 0.17);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = '#f2c230';
    c.font = FONT(Math.round(H * 0.115));
    c.fillText(`MAT ${d.n}`, W * 0.04, H * 0.09);
    c.textAlign = 'right';
    c.fillStyle = '#c9d2dc';
    c.font = FONT(Math.round(H * 0.085), 700);
    c.fillText(d.div, W * 0.96, H * 0.09);
    const row = (y, name, top, bottom, mark) => {
      c.fillStyle = top;
      c.fillRect(0, y, W * 0.03, H * 0.14);
      c.fillStyle = bottom;
      c.fillRect(0, y + H * 0.14, W * 0.03, H * 0.14);
      c.textAlign = 'left';
      c.fillStyle = '#f4f6f8';
      fitText(c, name, W * 0.06, y + H * 0.15, mark ? W * 0.62 : W * 0.9, Math.round(H * 0.13));
      if (mark) {
        c.fillStyle = '#18202b';
        c.fillRect(W * 0.72, y + H * 0.03, W * 0.24, H * 0.22);
        c.fillStyle = '#ffffff';
        c.textAlign = 'center';
        fitText(c, mark, W * 0.84, y + H * 0.15, W * 0.2, Math.round(H * 0.15));
      }
    };
    row(H * 0.19, d.a, '#f4f6f8', '#f4f6f8', d.ma);
    row(H * 0.48, d.b, '#1f9d55', '#f2c230', d.mb);
    c.fillStyle = d.hot ? '#8c1f28' : '#131922';
    c.fillRect(0, H * 0.79, W, H * 0.21);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    fitText(c, d.foot, W / 2, H * 0.9, W * 0.92, Math.round(H * 0.13));
  };

  let lastBow = -1e9;
  for (let n = 0; n < 2; n++) {
    const cx = n === 0 ? -6.6 : 6.6;
    const cz = 0.8;
    const zt = cz - 6.4;
    const face = 0; // yaw that looks toward the mat from the table side
    w.box({ x: cx, z: cz, w: 10, h: 0.05, d: 10, color: 0x234f95 });
    w.floor({ x: cx, z: cz, y: 0.056, w: 10, d: 10, tex: texB, tile: 2 });
    w.floor({ x: cx, z: cz, y: 0.072, w: 8, d: 8, tex: texY, tile: 2 });
    w.collider(cx - 5, cx + 5, cz - 5, cz + 5, 0, 0.06);
    // score table, stool, scoreboard
    w.box({ x: cx - 1.6, z: zt, w: 2.2, h: 0.74, d: 0.7, color: 0x15171a, collide: true });
    w.box({ x: cx - 1.6, z: zt, y: 0.74, w: 2.3, h: 0.03, d: 0.8, color: 0xe9edf2 });
    w.box({ x: cx - 1.6, z: zt - 0.78, w: 0.44, h: 0.45, d: 0.44, color: 0x2b3140 });
    w.box({ x: cx + 0.7, z: zt, w: 0.08, h: 1.25, d: 0.08, color: 0x15171a });
    w.box({ x: cx + 0.7, z: zt, w: 0.55, h: 0.04, d: 0.55, color: 0x15171a });
    w.box({ x: cx + 0.7, z: zt, y: 1.22, w: 1.78, h: 1.04, d: 0.05, color: 0x15171a });
    const m = { n: n + 1, cx, cz, zt, face, kx: cx + 3.3, kz: cz - 5.9, data: null, key: '' };
    m.board = w.sign({
      x: cx + 0.7, y: 1.74, z: zt, w: 1.7, h: 0.96, res: 160, double: true, gap: 0.03,
      draw: (c, W, H) => { if (m.data) drawScore(c, W, H, m.data); },
    });
    // mat number flag
    w.box({ x: cx - 4.3, z: zt, w: 0.07, h: 3.1, d: 0.07, color: 0x15171a });
    w.sign({
      x: cx - 4.3, y: 2.78, z: zt, w: 1.5, h: 0.72, double: true, gap: 0.04,
      draw: (c, W, H) => {
        c.fillStyle = '#10223a';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#f2c230';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        fitText(c, `MAT ${n + 1}`, W / 2, H / 2 + 2, W * 0.86, Math.round(H * 0.62));
      },
    });
    // coach chair and its floor marking
    w.box({ x: m.kx, z: m.kz, y: 0.4, w: 0.46, h: 0.05, d: 0.46, color: 0x2b3140 });
    w.box({ x: m.kx, z: m.kz - 0.22, y: 0.45, w: 0.46, h: 0.48, d: 0.04, color: 0x2b3140 });
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) w.box({ x: m.kx + dx, z: m.kz + dz, w: 0.03, h: 0.4, d: 0.03, color: 0x8a9099 });
    w.sign({
      x: m.kx, y: 0.013, z: m.kz, w: 1.7, h: 1.7, flat: true, rotY: Math.PI, transparent: true,
      draw: (c, W, H) => {
        c.clearRect(0, 0, W, H);
        c.strokeStyle = '#f4f6f8';
        c.lineWidth = 6;
        c.strokeRect(5, 5, W - 10, H - 10);
        c.fillStyle = '#f4f6f8';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        fitText(c, 'COACH', W / 2, H * 0.84, W * 0.7, Math.round(H * 0.14));
      },
    });
    mats.push(m);
    new NPC(w, { x: cx - 1.6, z: zt - 0.78, yaw: face, anim: 'desk', solid: false, look: casualLook({ top: 0x2c3e55 }) });
    w.sprite(`MAT ${n + 1} · 빈 매트`, cx, 3.4, cz, 1.5);
    w.zone({
      id: `mat${m.n}`, label: `MAT ${m.n} · 빈 매트`, prio: 3, surface: 'mat', minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5,
      onEnter: (a2) => {
        if (nowMs() - lastBow > 25000) {
          lastBow = nowMs();
          a2.bow();
        }
        tipOnce('mat', '빈 매트에 올랐습니다. 상대에게 붙어서 기술 버튼을 누르면 가위바위보로 승부하고, ‘한 판’은 점수 경기입니다', 5200);
      },
    });
    const seatId = `coach${m.n}`;
    w.zone({
      id: seatId, label: '지도자석', prio: 4, minX: m.kx - 0.8, maxX: m.kx + 0.8, minZ: m.kz - 0.8, maxZ: m.kz + 0.8,
      canEnter: (a2) => {
        if (!a2.isBlack()) {
          a2.toast('지도자석은 블랙벨트 지도자 1명만 들어갈 수 있습니다');
          return false;
        }
        if (a2.seatTaken(seatId)) {
          a2.toast('이 매트 지도자석에는 이미 지도자가 있습니다. 1명만 앉을 수 있습니다');
          return false;
        }
        return true;
      },
      onEnter: (a2) => {
        a2.seat({ id: seatId, x: m.kx, z: m.kz, yaw: m.face, onLeave: (a3) => a3.toast('지도자석에서 일어났습니다') });
        a2.toast('지도자석에 앉았습니다. 이동하면 일어납니다', 3600);
      },
    });
  }

  // scoreboards follow whatever is being fought on their mat
  let acc = 1;
  w.tickers.push((dt) => {
    acc += dt;
    if (acc < 0.5) return;
    acc = 0;
    for (const m of mats) {
      const box = [m.cx - 5, m.cx + 5, m.cz - 5, m.cz + 5];
      const b = api.boutIn(...box);
      const mt = api.matchIn(...box);
      const r = b || (mt && !mt.end) ? null : api.lastIn(...box); // a match that has just ended shows its result at once
      let d;
      if (mt && !mt.end) {
        // a points match: the two names with their points, and the clock
        const clock = `${(mt.left / 60) | 0}:${String(mt.left % 60).padStart(2, '0')}`;
        d = { n: m.n, div: '한 판', a: mt.a, b: mt.b, ma: String(mt.sa), mb: String(mt.sb), foot: b ? `${KINDS[b.kind]} · ${clock}` : `${clock}${mt.pos ? ` · ${mt.pos}` : ''}`, hot: !!b };
      } else if (b) d = { n: m.n, div: KINDS[b.kind], a: b.names[0], b: b.names[1], ma: b.tapped ? '승' : '', mb: b.tapped ? '탭' : '', foot: b.tapped ? `탭! ${b.names[0]} 승` : '기술 진행 중', hot: b.tapped };
      else if (r) d = { n: m.n, div: '결과', a: r.text, b: '', ma: '', mb: '', foot: '다음 선수 입장', hot: true };
      else d = { n: m.n, div: '빈 매트', a: '누구나 올라올 수 있습니다', b: '붙어서 기술 → 한 판', ma: '', mb: '', foot: '점수 경기는 여기서', hot: false };
      const key = `${d.div}|${d.a}|${d.b}|${d.ma}|${d.mb}|${d.foot}`;
      if (key === m.key) continue;
      m.key = key;
      m.data = d;
      m.board.redraw();
    }
  });
  w.zone({
    id: 'fop', label: '경기 구역', prio: 1, minX: -BX, maxX: BX, minZ: -BZ, maxZ: BZ,
    onEnter: () => tipOnce('fop', '경기 구역입니다. 빈 매트 두 곳은 누구나 올라가 겨룰 수 있습니다'),
  });

  /* ---------- warm-up area ---------- */
  const WX0 = -34;
  const WX1 = -26.5;
  const WZ0 = -13;
  const WZ1 = 13;
  w.box({ x: (WX0 + WX1) / 2, z: 0, w: WX1 - WX0, h: 0.04, d: WZ1 - WZ0, color: 0x4b6783 });
  w.floor({ x: (WX0 + WX1) / 2, z: 0, y: 0.042, w: WX1 - WX0, d: WZ1 - WZ0, tex: w.texMatColor('warm', '#5a7896', '#4b6783'), tile: 2 });
  w.collider(WX0, WX1, WZ0, WZ1, 0, 0.04);
  w.sign({
    x: -HX + 0.02, y: 2.15, z: -5, w: 7.4, h: 1.3, rotY: Math.PI / 2, res: 64,
    draw: (c, W, H) => {
      c.fillStyle = '#f2c230';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#10223a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'WARM-UP AREA · 몸 푸는 곳', W / 2, H / 2 + 2, W * 0.92, Math.round(H * 0.5));
    },
  });
  w.sign({
    x: -HX + 0.02, y: 1.75, z: 6.5, w: 4.6, h: 2.3, rotY: Math.PI / 2, res: 96,
    draw: (c, W, H) => {
      c.fillStyle = '#0b0d10';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#1d2633';
      c.fillRect(0, 0, W, H * 0.16);
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = '#f2c230';
      c.font = FONT(Math.round(H * 0.09));
      c.fillText('안내', W * 0.04, H * 0.085);
      const rows = ['MAT 1 · MAT 2  빈 매트, 누구나 입장', '상대에게 붙어서 기술 버튼 · 한 판은 점수 경기', '가위바위보에서 이긴 쪽이 기술을 겁니다', '지도자석은 검은 띠 1명만', '시상대는 동쪽 끝'];
      rows.forEach((t, i) => {
        c.fillStyle = i === 0 ? '#f4f6f8' : '#c9d2dc';
        fitText(c, t, W * 0.04, H * (0.28 + i * 0.145), W * 0.92, Math.round(H * 0.075), i === 0 ? 700 : 500);
      });
    },
  });
  new NPC(w, { x: -30.2, z: 3.2, yaw: Math.PI / 2, look: randomLook({ lite: false }), label: '몸풀기 파트너', spar: true });
  new NPC(w, { x: -32.2, z: -6.2, yaw: Math.PI / 2, anim: 'stretch', look: randomLook(), spar: true, name: '몸 푸는 선수' });
  w.zone({
    id: 'warmup', label: '몸 푸는 곳', prio: 2, surface: 'mat', minX: WX0, maxX: WX1, minZ: WZ0, maxZ: WZ1,
    onEnter: () => tipOnce('warm', '몸 푸는 곳입니다. 새우빼기와 앞구르기를 하거나, 파트너에게 붙어서 기술을 걸어 보세요', 5200),
  });

  /* ---------- weigh-in and gi check ---------- */
  w.box({ x: -30.2, z: -17.4, w: 2.4, h: 0.74, d: 0.7, color: 0x15171a, collide: true });
  w.box({ x: -30.2, z: -17.4, y: 0.74, w: 2.5, h: 0.03, d: 0.8, color: 0xe9edf2 });
  w.box({ x: -27.6, z: -17.2, w: 0.7, h: 0.08, d: 0.7, color: 0x8a9099 });
  w.box({ x: -27.6, z: -17.62, y: 0.08, w: 0.06, h: 1.1, d: 0.06, color: 0x8a9099 });
  w.box({ x: -27.6, z: -17.62, y: 1.18, w: 0.3, h: 0.2, d: 0.06, color: 0x15171a });
  w.sign({
    x: -29.6, y: 2.2, z: -HZ + 0.02, w: 5, h: 0.95, res: 64,
    draw: (c, W, H) => {
      c.fillStyle = '#f4f6f8';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#10223a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, '계체 · 도복 검사', W / 2, H / 2 + 2, W * 0.9, Math.round(H * 0.56));
    },
  });
  w.box({ x: -30.2, z: -18.2, w: 0.38, h: 0.45, d: 0.38, color: 0x2b3140 });
  new NPC(w, { x: -30.2, z: -18.2, yaw: 0, anim: 'desk', solid: false, look: casualLook({ top: 0x2c3e55 }) });
  w.zone({ id: 'weigh', label: '계체 · 도복 검사', prio: 2, minX: -34.5, maxX: -25.5, minZ: -HZ, maxZ: -14.6 });

  /* ---------- podium: three steps, three medals ---------- */
  const PX = 31.2;
  w.floor({ x: 30.2, z: 0, y: 0.012, w: 8.6, d: 9.4, color: 0x8c1f28 });
  const blocks = [[0, 0.6, 1, '1위'], [-1.42, 0.42, 2, '2위'], [1.42, 0.3, 3, '3위']];
  for (const [z, h, place, label] of blocks) {
    w.box({ x: PX, z, w: 1.4, h, d: 1.36, color: 0xf4f6f8, collide: true });
    w.sign({
      x: PX - 0.702, y: h / 2, z, w: 0.6, h: Math.min(0.5, h * 0.8), rotY: -Math.PI / 2,
      draw: (c, W, H) => {
        c.fillStyle = '#f4f6f8';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#10223a';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = FONT(Math.round(H * 0.9));
        c.fillText(String(place), W / 2, H / 2 + 2);
      },
    });
    w.zone({
      id: `step${place}`, label: `시상대 ${label}`, prio: 5, minX: PX - 0.7, maxX: PX + 0.7, minZ: z - 0.68, maxZ: z + 0.68, minY: h - 0.1,
      onEnter: (a2) => {
        a2.medal(place);
        a2.sfx('ding');
        a2.toast(`${label} 자리에 올랐습니다`);
      },
      onLeave: (a2) => a2.medal(0),
    });
  }
  w.logoSlot('event', w.sign({
    x: HX - 0.02, y: 2.0, z: 0, w: 9.4, h: 3.7, rotY: -Math.PI / 2, res: 64,
    draw: (c, W, H, img) => {
      c.fillStyle = '#0d1b2e';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#f2c230';
      c.fillRect(0, 0, W, H * 0.04);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 5; k++) {
          const x = W * (0.1 + k * 0.2);
          const y = H * (0.22 + r * 0.3);
          if (img && (r + k) % 2 === 0) {
            c.fillStyle = '#ffffff';
            c.fillRect(x - W * 0.085, y - H * 0.11, W * 0.17, H * 0.22);
            drawContain(c, img, x - W * 0.085, y - H * 0.11, W * 0.17, H * 0.22, 4);
          } else {
            c.fillStyle = (r + k) % 2 === 0 ? '#f4f6f8' : '#5f7896';
            fitText(c, (r + k) % 2 === 0 ? 'PODIUM' : 'JIU-JITSU', x, y, W * 0.17, Math.round(H * 0.085));
          }
        }
      }
    },
  }));
  w.zone({
    id: 'podium', label: '시상대', prio: 2, minX: 25.8, maxX: HX, minZ: -4.7, maxZ: 4.7,
    onEnter: () => tipOnce('podium', '시상대입니다. 올라선 자리에 맞는 메달이 걸립니다'),
  });
  w.interact.push({ x: PX, z: 0, r: 4.2, label: '기념 사진 시점', short: '사진', action: (a2) => a2.camera(-Math.PI / 2, 0.1, 5.2) });

  /* ---------- entrance signs and a few people on the floor ---------- */
  w.sign({
    x: -30.5, y: 2.2, z: HZ - 0.02, w: 4, h: 0.95, rotY: Math.PI, res: 64,
    draw: (c, W, H) => {
      c.fillStyle = '#f4f6f8';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#10223a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, '선수 입구', W / 2, H / 2 + 2, W * 0.8, Math.round(H * 0.58));
    },
  });
  w.box({ x: -26.4, z: 16.9, w: 0.08, h: 1.9, d: 0.08, color: 0x15171a });
  w.sign({
    x: -26.4, y: 1.5, z: 16.9, w: 2.3, h: 1.1, rotY: -Math.PI * 0.75, double: true, gap: 0.05,
    draw: (c, W, H) => {
      c.fillStyle = '#10223a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#f4f6f8';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      ['몸 푸는 곳  왼쪽', '빈 매트  MAT 1 · 2', '시상대  동쪽 끝'].forEach((t, i) => fitText(c, t, W * 0.07, H * (0.22 + i * 0.28), W * 0.86, Math.round(H * 0.17), 700));
    },
  });
  const ring = [{ x: -22, z: -15.5 }, { x: 22, z: -15.5 }, { x: 22, z: 15.5 }, { x: -22, z: 15.5 }];
  new NPC(w, { x: ring[0].x, z: ring[0].z, mode: 'path', speed: rand(1.05, 1.3), path: ring, look: casualLook({ top: 0x2c3e55 }) });
  new NPC(w, { x: ring[2].x, z: ring[2].z, mode: 'path', speed: rand(1.05, 1.3), path: ring.slice().reverse(), look: randomLook() });
  w.zone({ id: 'hall', label: '대회장 플로어', prio: 0, minX: -HX, maxX: HX, minZ: -HZ, maxZ: HZ });
  return w;
}
