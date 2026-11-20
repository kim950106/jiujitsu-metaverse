// End-to-end check that two people who open the hosted copy on their own devices meet.
// Two separate browsers (as two phones would be), the single-file build (index.html), and two local
// MQTT brokers standing in for the public relays. Usage: node test/meet.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { startBroker } from './broker.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });

// MEET_DELAY=300 node test/meet.mjs runs the whole visit with a realistic network delay on every message
const delay = Number(process.env.MEET_DELAY) || 0;
const brokers = [await startBroker(0, { delay }), await startBroker(0, { delay })];
if (delay) console.log(`every message is held back ${delay} ms, as through a distant relay`);
const relay = encodeURIComponent(brokers.map((b) => b.url).join(','));

const types = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
// the files that lie beside the hosted page (the manifest, the icons, the logo slots)
const beside = (u) => (/^\/[a-z0-9-]+\.(json|png)$/.test(u) ? path.join(root, u.slice(1)) : null);
const fontDirs = { bhs: 'node_modules/@fontsource/black-han-sans/files', plex: 'node_modules/@fontsource/ibm-plex-sans-kr/files' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const m = u.match(/^\/fonts\/(bhs|plex)\/(.+)$/);
  const file = m ? path.join(root, fontDirs[m[1]], path.basename(m[2])) : beside(u) || path.join(root, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const css = (pkg, key, files) => files.map((f) => fs.readFileSync(path.join(root, 'node_modules/@fontsource', pkg, f), 'utf8')
  .replace(/url\(\.\/files\//g, `url(${base}/fonts/${key}/`)).join('\n');
const fontCss = css('black-han-sans', 'bhs', ['400.css']) + css('ibm-plex-sans-kr', 'plex', ['400.css', '500.css', '700.css']);
const three = fs.readFileSync(path.join(root, 'node_modules/three/build/three.min.js'));

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const device = async (tag, w, h, sel, hash = '') => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-proxy-server'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.setRequestInterception(true);
  page.on('request', (rq) => {
    const u = rq.url();
    if (u.includes('cdnjs.cloudflare.com')) rq.respond({ status: 200, contentType: 'text/javascript', body: three });
    else if (u.includes('fonts.googleapis.com')) rq.respond({ status: 200, contentType: 'text/css', body: fontCss });
    else if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) rq.continue();
    else rq.abort();
  });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${tag} ${m.type()}: ${m.text()}`); });
  await page.evaluateOnNewDocument((s) => { try { localStorage.setItem('bjjmeta.sel', JSON.stringify(s)); } catch (e) { /* ignore */ } }, sel);
  // every message ever shown, so that one which has already faded is not missed by a slow check
  await page.evaluateOnNewDocument(() => {
    window.__toastLog = [];
    document.addEventListener('DOMContentLoaded', () => {
      const box = document.querySelector('#toasts');
      if (!box) return;
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) window.__toastLog.push(n.textContent); }).observe(box, { childList: true });
    });
  });
  await page.goto(`${base}/?relay=${relay}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__bjj && window.__bjj.ok', { timeout: 30000 });
  return { tag, browser, page };
};
const shot = async (d, name) => { await d.page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('saved', name); };
const wait = async (d, fn, label, ms = 30000, arg) => {
  const t0 = Date.now();
  try {
    await d.page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg);
  } catch (e) {
    throw new Error(`${d.tag}: timeout waiting for ${label}`);
  }
  return Date.now() - t0;
};
const enter = async (d) => { await d.page.evaluate(() => document.querySelector('#setup').requestSubmit()); await sleep(600); };
const view = (d, a) => d.page.evaluate((v) => {
  const g = window.__bjj;
  const p = g.sim.p;
  if (v.x != null) { p.x = v.x; p.z = v.z; }
  if (v.yaw != null) p.yaw = v.yaw;
  if (v.camYaw != null) g.cam.yaw = v.camYaw;
  if (v.pitch != null) g.cam.pitch = v.pitch;
  if (v.dist != null) g.cam.dist = v.dist;
  g.cam.tgt.set(p.x, p.y + 1.0, p.z);
}, a);
const adv = (d, sec, mx = 0, my = 0) => d.page.evaluate((t, x, y) => {
  const g = window.__bjj;
  for (let i = 0; i < t * 60; i++) g.sim.step(1 / 60, { mx: x, my: y, run: false, camYaw: g.cam.yaw });
}, sec, mx, my);
const text = (d, s) => d.page.evaluate((q) => { const el = document.querySelector(q); return el && !el.hidden ? el.textContent.trim() : null; }, s);
let passed = 0;
const ok = (label, extra = '') => { passed++; console.log(`ok  ${label}${extra ? `  (${extra})` : ''}`); };

let A = null;
let B = null;
try {
  /* 1. both open the address; neither is on a claude.ai page */
  A = await device('A', 390, 844, { place: 'gym', belt: 'blue', stripes: 2, gi: 'white', name: '현철' }, '#dojo');
  let ms = await wait(A, () => window.__bjj.net.mode === 'relay' && window.__bjj.net.state === 'on', 'A connected to the relays');
  ok('A opens the hosted copy and connects to the relays', `${ms} ms`);
  B = await device('B', 844, 390, { place: 'arena', belt: 'white', stripes: 0, gi: 'blue', name: '민수' }, '#dojo');
  await wait(B, () => window.__bjj.net.mode === 'relay' && window.__bjj.net.state === 'on', 'B connected');

  /* 2. on the start screen they already count each other */
  await wait(A, () => { const el = document.querySelector('#live'); return !el.hidden && /2명/.test(el.textContent); }, 'A start screen says 2');
  await wait(B, () => { const el = document.querySelector('#live'); return !el.hidden && /2명/.test(el.textContent); }, 'B start screen says 2');
  ok('start screen shows the other visitor', await text(B, '#live'));

  /* 3. A walks into the gym: B sees on the place card that someone is there */
  await enter(A);
  await wait(B, () => { const el = document.querySelector('.here[data-here="gym"]'); return !el.hidden && /1명/.test(el.textContent); }, 'gym card on B says 1');
  assert.equal(await text(B, '.here[data-here="arena"]'), null);
  await sleep(500);
  await shot(B, 'meet-b-start');
  ok('place card shows where the friend is', await text(B, '.here[data-here="gym"]'));

  /* 4. B walks in: both see each other's body, A is told */
  await sleep(1600); // A has settled in: from here on a newcomer is announced by name
  await enter(B);
  await wait(A, () => window.__bjj.net.list.length === 1, 'A sees B in the gym');
  await wait(B, () => window.__bjj.net.list.length === 1, 'B sees A in the gym');
  const names = [await A.page.evaluate(() => window.__bjj.net.list[0].name), await B.page.evaluate(() => window.__bjj.net.list[0].name)];
  assert.deepEqual(names, ['민수', '현철']);
  await wait(A, () => Array.from(document.querySelectorAll('#toasts > *')).some((t) => /민수 님이 들어왔습니다/.test(t.textContent)), 'A is told that B walked in', 8000);
  await wait(B, () => Array.from(document.querySelectorAll('#toasts > *')).some((t) => /2명이 함께/.test(t.textContent)), 'B is told that someone is here', 8000);
  ok('both see each other in the gym, with the right names', names.join(' / '));

  /* 5. movement follows */
  await view(A, { x: -6.0, z: -1.5, yaw: -Math.PI / 2, camYaw: 0.4, pitch: 0.3, dist: 4.6 });
  await view(B, { x: -7.2, z: -1.5, yaw: Math.PI / 2, camYaw: -0.4, pitch: 0.3, dist: 4.2 });
  await adv(A, 0.5); await adv(B, 0.5);
  ms = await wait(A, () => { const v = window.__bjj.net.list[0]; return Math.abs(v.st.x + 7.2) < 0.05 && Math.abs(v.st.z + 1.5) < 0.05 && Math.abs(v.x + 7.2) < 0.2; }, 'A sees B at the new spot');
  await wait(B, () => { const v = window.__bjj.net.list[0]; return Math.abs(v.st.x + 6.0) < 0.05 && Math.abs(v.x + 6.0) < 0.2; }, 'B sees A at the new spot');
  await sleep(900);
  await shot(A, 'meet-a-sees-b');
  await shot(B, 'meet-b-sees-a');
  ok('positions follow on both screens', `${ms} ms`);

  /* 6. sparring between two devices: asked, declined, asked again, accepted, played to the end */
  await adv(A, 2); await adv(B, 2);
  const duelOf = (d) => d.page.evaluate(() => { const x = window.__bjj.sim.p.duel; return x ? { phase: x.phase, round: x.round, w: x.S.w, n: x.S.n, end: x.S.end, rule: x.S.text, me: x.me } : null; });
  assert.ok(await A.page.evaluate(() => { const g = window.__bjj; g.sim._cool = 0; return g.sim.challenge(); }), 'A could ask B to spar');
  assert.equal((await duelOf(A)).phase, 'wait', 'A waits for an answer');
  await wait(B, () => !!window.__bjj.sim.ask && !document.querySelector('#sparask').hidden, 'B is asked');
  assert.equal(await B.page.evaluate(() => window.__bjj.sim.p.duel), null, 'B is not in it before saying yes');
  assert.equal(await text(B, '#sparask-text'), '현철 님이 스파링을 신청했습니다 · 5판 3선승', 'the request names who asks and the lower belt\'s rule');
  await sleep(400);
  await shot(B, 'meet-b-asked');
  await shot(A, 'meet-a-waiting');
  await B.page.evaluate(() => document.querySelector('#sparask-no').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 9, button: 0 })));
  await wait(A, () => !window.__bjj.sim.p.duel && window.__toastLog.some((t) => t.includes('민수 님이 스파링을 사양했습니다')), 'A is told that B said no');
  ok('a request to spar can be declined', 'A was told');
  await adv(A, 5); await adv(B, 5); // the no is taken down, the cool-down passes
  await wait(A, () => { const v = window.__bjj.net.list[0]; return !!v && !v.busy && !v.rj; }, 'A sees B free again', 15000);
  assert.ok(await A.page.evaluate(() => { const g = window.__bjj; g.sim._cool = 0; return g.sim.challenge(); }), 'A could ask again');
  await wait(B, () => !!window.__bjj.sim.ask, 'B is asked again');
  await B.page.evaluate(() => document.querySelector('#sparask-yes').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 9, button: 0 })));
  await wait(B, () => { const d = window.__bjj.sim.p.duel; return !!d && d.me === 'B'; }, 'B is in');
  await wait(A, () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase !== 'wait'; }, 'A hears the yes');
  const canPick = () => { const d = window.__bjj.sim.p.duel; return !!d && window.__bjj.sim.p.mode === 'duel' && d.phase === 'pick' && !d.pick; };
  // one round: both throw; returns, for each screen, the position after it (or the technique if
  // the round decided the series)
  const play = async (handA, techA, handB, techB, label) => {
    for (let i = 0; i < 40 && !(await A.page.evaluate(canPick) && await B.page.evaluate(canPick)); i++) { await adv(A, 0.5); await adv(B, 0.5); await sleep(150); }
    assert.ok(await A.page.evaluate(canPick) && await B.page.evaluate(canPick), `${label}: both can throw`);
    await A.page.evaluate((h, k) => { const g = window.__bjj; g.sim.setTech(k); g.sim.pick(h); }, handA, techA);
    await B.page.evaluate((h, k) => { const g = window.__bjj; g.sim.setTech(k); g.sim.pick(h); }, handB, techB);
    const revealed = () => { const d = window.__bjj.sim.p.duel; return !!d && (d.phase === 'reveal' || d.phase === 'move' || d.phase === 'sub'); };
    await wait(A, revealed, `${label}: A sees B's hand`);
    await wait(B, revealed, `${label}: B sees A's hand`);
    await adv(A, 1.5); await adv(B, 1.5);
    const after = () => { const g = window.__bjj; const d = g.sim.p.duel; return g.sim.p.mode === 'bout' || (!!d && (d.phase === 'move' || d.phase === 'pick')); };
    await wait(A, after, `${label}: A after the throw`);
    await wait(B, after, `${label}: B after the throw`);
    const what = () => { const g = window.__bjj; const b = g.sim.p.bout; const d = g.sim.p.duel; return b ? [b.kind, b.iWin, b.ground] : [d.S.pos, d.S.top, d.S.w.A, d.S.w.B]; };
    return [await A.page.evaluate(what), await B.page.evaluate(what)];
  };
  // what each screen shows of the two bodies: its own pose and the other's
  const poses = (d) => d.page.evaluate(() => { const g = window.__bjj; const v = g.net.list[0]; return [g.sim.char.anim, v ? v.char.anim : '']; });
  const finish = async () => { await adv(A, 9); await adv(B, 9); await sleep(300); };
  let r = await play('r', 'arm', 's', 'kim', 'round 1');
  assert.deepEqual(r, [['guard', 'A', 1, 0], ['guard', 'A', 1, 0]], 'round 1: A wins: a takedown, A on top in B\'s guard, on both screens');
  await adv(A, 1.5); await adv(B, 1.5);
  await sleep(500);
  assert.deepEqual([await poses(A), await poses(B)], [['guardTop', 'guardBottom'], ['guardBottom', 'guardTop']], 'both screens show A kneeling in B\'s guard');
  await shot(A, 'meet-a-takedown');
  await shot(B, 'meet-b-takedown');
  r = await play('r', 'arm', 'p', 'rnc', 'round 2');
  assert.deepEqual(r, [['guard', 'B', 1, 1], ['guard', 'B', 1, 1]], 'round 2: B wins from underneath: a sweep, B on top');
  await adv(A, 1.5); await adv(B, 1.5);
  await sleep(500);
  assert.deepEqual([await poses(A), await poses(B)], [['guardBottom', 'guardTop'], ['guardTop', 'guardBottom']], 'both screens show the sweep');
  // a drawn throw is thrown again
  for (let i = 0; i < 40 && !(await A.page.evaluate(canPick) && await B.page.evaluate(canPick)); i++) { await adv(A, 0.5); await adv(B, 0.5); await sleep(150); }
  const before = (await duelOf(A)).round;
  await A.page.evaluate(() => window.__bjj.sim.pick('p'));
  await B.page.evaluate(() => window.__bjj.sim.pick('p'));
  await wait(A, () => window.__bjj.sim.p.duel.phase === 'reveal', 'A sees the draw');
  await wait(B, () => window.__bjj.sim.p.duel.phase === 'reveal', 'B sees the draw');
  await adv(A, 1.5); await adv(B, 1.5);
  assert.deepEqual([(await duelOf(A)).round, (await duelOf(B)).round, (await duelOf(A)).n], [before + 1, before + 1, 2], 'a draw is thrown again and is not a round');
  r = await play('s', 'tri', 'p', 'arm', 'round 3');
  assert.deepEqual(r, [['guard', 'A', 2, 1], ['guard', 'A', 2, 1]], 'round 3: A sweeps back');
  r = await play('s', 'guil', 'p', 'arm', 'round 4');
  assert.deepEqual(r, [['guil', true, true], ['guil', false, true]], 'round 4 decides it: A puts on the guillotine A chose, from the ground, on both screens');
  await adv(A, 3.4); await adv(B, 3.4);
  await sleep(500);
  await shot(B, 'meet-b-guillotined');
  const ended = () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'end'; };
  for (const d of [A, B]) for (let i = 0; i < 40 && !(await d.page.evaluate(ended)); i++) await adv(d, 0.3);
  await wait(A, ended, 'the sparring ends on A', 20000);
  await wait(B, ended, 'the sparring ends on B', 20000);
  const eA = await duelOf(A);
  const eB = await duelOf(B);
  assert.deepEqual([eA.end, eB.end, eA.w, eB.w], [1, 1, { A: 3, B: 1 }, { A: 3, B: 1 }], `both say A won 3 : 1: ${JSON.stringify([eA, eB])}`);
  assert.equal(await text(A, '#mt-clock'), '승리');
  assert.equal(await text(B, '#mt-clock'), '패배');
  await sleep(500);
  await shot(A, 'meet-a-spar-win');
  await shot(B, 'meet-b-spar-lost');
  await adv(A, 5); await adv(B, 5);
  await wait(A, () => window.__bjj.sim.p.mode === 'free', 'A free after the sparring', 20000);
  await wait(B, () => window.__bjj.sim.p.mode === 'free', 'B free after the sparring', 20000);
  assert.ok(!(await B.page.evaluate(() => !!window.__bjj.sim.ask)), 'the finished request does not come back to B');
  ok('sparring between two devices: asked, accepted, a takedown, a sweep, a draw, a sweep back and the finish, agreed on both', `${eA.rule}, 3 : 1`);

  /* 6e. the hip-walk race: one starts, the other standing at the start is taken along, in a lane of its own */
  await adv(A, 2); await adv(B, 2);
  const lane = await A.page.evaluate(() => window.__bjj.world.race);
  await view(A, { x: lane.x0 + 0.9, z: lane.lanes[1], yaw: -Math.PI / 2, camYaw: Math.PI / 2 + 0.4, pitch: 0.5, dist: 6.5 });
  await view(B, { x: lane.x0 + 1.3, z: lane.lanes[1] - 0.2, yaw: -Math.PI / 2, camYaw: Math.PI / 2 + 0.4, pitch: 0.5, dist: 6.5 });
  await adv(A, 0.4); await adv(B, 0.4);
  assert.equal(await text(A, '#b-main'), '경주', 'the big button offers the race at the start line');
  await wait(A, () => { const v = window.__bjj.net.list[0]; return !!v && !v.du && !v.bt; }, 'A hears that B is free', 8000);
  assert.ok(await A.page.evaluate(() => window.__bjj.sim.startRace()), 'A starts a race');
  ms = await wait(B, () => window.__bjj.sim.p.mode === 'race', 'B is taken along', 15000);
  const ids = [await A.page.evaluate(() => window.__bjj.sim.p.race.id), await B.page.evaluate(() => window.__bjj.sim.p.race.id)];
  assert.equal(ids[0], ids[1], 'both are in the same race');
  const zs = [await A.page.evaluate(() => window.__bjj.sim.p.z), await B.page.evaluate(() => window.__bjj.sim.p.z)];
  assert.ok(Math.abs(zs[0] - zs[1]) > 0.7 && lane.lanes.includes(zs[0]) && lane.lanes.includes(zs[1]), `in two lanes side by side: ${zs.join(' / ')}`);
  await wait(A, () => { const r = window.__bjj.sim.p.race; return !!r && r.phase === 'go'; }, 'A gets the start signal', 30000);
  await wait(B, () => { const r = window.__bjj.sim.p.race; return !!r && r.phase === 'go'; }, 'B gets the start signal', 30000);
  await sleep(300);
  // A hammers, B presses now and then
  let tick = 0;
  for (; tick < 400; tick++) {
    const ra = await A.page.evaluate(() => { const g = window.__bjj; g.sim.stroke(); const r = g.sim.p.race; return r ? r.phase : 'out'; });
    const rb = await B.page.evaluate((press) => { const g = window.__bjj; if (press) g.sim.stroke(); const r = g.sim.p.race; return r ? r.phase : 'out'; }, tick % 3 === 0);
    if (tick === 6) { await shot(A, 'meet-a-race'); await shot(B, 'meet-b-race'); }
    if (ra !== 'go' && rb !== 'go') break;
    await sleep(60);
  }
  // (every message ever shown is kept in __toastLog, so one that has already faded is not missed)
  await wait(A, () => window.__toastLog.some((t) => /완주! \d+\.\d\d초 · 엉덩이걷기 \d+걸음 · 1등/.test(t)), 'A came first', 20000);
  await wait(B, () => window.__toastLog.some((t) => /완주! \d+\.\d\d초 · 엉덩이걷기 \d+걸음 · 2등/.test(t)), 'B came second', 30000);
  await wait(B, () => window.__toastLog.some((t) => /현철 님 엉덩이걷기 \d+\.\d\d초/.test(t)), 'B is told A\'s time', 15000);
  await wait(A, () => window.__toastLog.some((t) => /민수 님 엉덩이걷기 \d+\.\d\d초/.test(t)), 'A is told B\'s time', 30000);
  const times = [await A.page.evaluate(() => window.__toastLog.find((t) => /완주!/.test(t))), await B.page.evaluate(() => window.__toastLog.find((t) => /완주!/.test(t)))];
  ok('a hip-walk race together: the other is taken along into the next lane, the faster presser wins, each is told the other\'s time', `joined after ${ms} ms; ${times.join(' / ')}`);

  /* 6f. the group photo: the other is told, the picture is taken */
  await wait(A, () => window.__bjj.sim.p.mode === 'free', 'A is up again', 20000);
  await wait(B, () => window.__bjj.sim.p.mode === 'free', 'B is up again', 20000);
  await view(A, { x: -6.0, z: -1.5, yaw: 0, camYaw: 0, pitch: 0.25, dist: 4.2 });
  await view(B, { x: -6.9, z: -1.5, yaw: 0, camYaw: 0, pitch: 0.25, dist: 4.2 });
  await adv(A, 0.3); await adv(B, 0.3);
  await wait(A, () => { const v = window.__bjj.net.list[0]; return !!v && Math.abs(v.x + 6.9) < 0.2 && Math.abs(v.z + 1.5) < 0.2; }, 'A sees B beside it', 15000);
  await B.page.evaluate(() => window.__bjj.act('shaka'));
  await A.page.evaluate(() => document.querySelector('#m-photo').click());
  await wait(B, () => window.__toastLog.some((t) => /현철 님이 단체 사진을 찍습니다/.test(t)), 'B is told that a photo is being taken', 15000);
  await wait(A, () => !document.querySelector('#modal-photo').hidden && document.querySelector('#photo-img').naturalWidth > 0, 'A has the picture', 40000);
  const photo = await A.page.evaluate(() => {
    const img = document.querySelector('#photo-img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return { w: c.width, h: c.height, data: c.toDataURL('image/png') };
  });
  fs.writeFileSync(path.join(out, 'meet-a-photo.png'), Buffer.from(photo.data.split(',')[1], 'base64'));
  assert.ok(photo.w >= 1500 && photo.h > 600, `the picture is sharp (${photo.w}x${photo.h})`);
  await A.page.evaluate(() => document.querySelector('#modal-photo [data-close]').click());
  ok('a group photo: announced to the other device, taken on this one', `${photo.w}x${photo.h}`);

  /* 7. one relay disappears mid-session */
  await brokers[0].down();
  await sleep(300);
  await view(A, { x: -5.0, z: -4.6 });
  await adv(A, 0.3);
  ms = await wait(B, () => { const v = window.__bjj.net.list[0]; return v && Math.abs(v.st.x + 5.0) < 0.05 && Math.abs(v.st.z + 4.6) < 0.05; }, 'B still follows A after a relay died', 15000);
  await wait(A, () => window.__bjj.net.room.info().up === 1, 'A noticed the dead relay', 15000);
  await A.page.evaluate(() => document.querySelector('#people-btn').click());
  await wait(A, () => /1\/2/.test(document.querySelector('#people-note').textContent), 'panel shows 1/2', 8000);
  await sleep(400);
  await shot(A, 'meet-a-people');
  const panel = { state: await text(A, '#people-state'), invite: await text(A, '#invite'), dot: await A.page.evaluate(() => document.querySelector('#net-dot').dataset.s) };
  assert.match(panel.state, /2명/);
  assert.ok(panel.invite && /주소/.test(panel.invite));
  assert.equal(panel.dot, 'on');
  await A.page.evaluate(() => document.querySelector('#modal-people [data-close]').click());
  ok('one relay down: still together, panel shows 1/2', `caught up in ${ms} ms`);
  await brokers[0].up();
  ms = await wait(A, () => window.__bjj.net.room.info().up === 2, 'A reconnected to the relay that came back', 40000);
  ok('relay back: reconnected by itself', `${ms} ms`);

  /* 8. B moves to the other place: gone from A's gym, still on the list */
  await B.page.evaluate(() => document.querySelector('#m-place').click());
  await wait(A, () => window.__bjj.net.list.length === 0, 'B left the gym on A');
  await wait(A, () => (window.__bjj.net.roster || []).some((o) => o.name === '민수' && o.place === 'arena'), 'A lists B in the arena');
  await wait(B, () => window.__bjj.net.list.length === 0 && window.__bjj.net.place === 'arena', 'B alone in the arena');
  ok('changing place: out of sight, still on the list as in the arena');
  await A.page.evaluate(() => document.querySelector('#m-place').click());
  await wait(A, () => window.__bjj.net.list.length === 1 && window.__bjj.net.place === 'arena', 'A followed B to the arena');
  await wait(B, () => window.__bjj.net.list.length === 1, 'B sees A arrive');
  ok('following the friend to the arena shows both again');

  /* 9. B closes the browser: A is alone again */
  const t0 = Date.now();
  await B.page.close({ runBeforeUnload: true });
  await B.browser.close();
  B = null;
  await wait(A, () => window.__bjj.net.list.length === 0 && (window.__bjj.net.roster || []).length === 0, 'B gone after closing', 12000);
  ok('closing the page removes the person', `${Date.now() - t0} ms`);
  assert.equal(await text(A, '#live'), null);

  const protocolErrors = brokers.flatMap((x) => x.stats.errors).filter((e) => !/connection closed|EPIPE|ECONNRESET|keep alive timeout/i.test(e));
  assert.deepEqual(protocolErrors, []);
} finally {
  if (A) await A.browser.close();
  if (B) await B.browser.close();
  server.close();
  for (const x of brokers) await x.stop();
}
// a relay that is switched off on purpose makes the browser log failed connection attempts
const real = Array.from(new Set(errors)).filter((e) => !/WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/?' failed|ERR_CONNECTION_REFUSED/.test(e));
if (real.length) {
  console.log('\nconsole problems:\n' + real.join('\n'));
  process.exit(1);
}
console.log(`\nALL PASSED (${passed}), no console problems`);
process.exit(0);
