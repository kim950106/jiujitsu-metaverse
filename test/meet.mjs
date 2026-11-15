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

  /* 6. rock-paper-scissors, then the technique, played on both screens */
  await adv(A, 2); await adv(B, 2);
  const started = await A.page.evaluate(() => { const g = window.__bjj; g.sim._cool = 0; return g.sim.challenge('arm'); });
  assert.ok(started, 'A could challenge B');
  await wait(B, () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick'; }, 'B is challenged');
  await sleep(700);
  await shot(B, 'meet-b-challenged');
  await wait(A, () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick'; }, 'A sees the answer');
  await A.page.evaluate(() => window.__bjj.sim.pick('r'));
  await B.page.evaluate(() => window.__bjj.sim.pick('s'));
  await wait(A, () => window.__bjj.sim.p.mode === 'bout', 'A in the technique');
  await wait(B, () => window.__bjj.sim.p.mode === 'bout', 'B in the technique');
  const roles = [await A.page.evaluate(() => window.__bjj.sim.p.bout.iWin), await B.page.evaluate(() => window.__bjj.sim.p.bout.iWin)];
  assert.deepEqual(roles, [true, false]);
  await wait(A, () => { const bt = window.__bjj.sim.p.bout; return !bt || bt.t > 3.2; }, 'hold reached');
  await sleep(500);
  await shot(A, 'meet-a-armbar');
  await shot(B, 'meet-b-armbar');
  await wait(A, () => window.__bjj.sim.p.mode === 'free', 'A free again', 40000);
  await wait(B, () => window.__bjj.sim.p.mode === 'free', 'B free again', 40000);
  ok('challenge, rock-paper-scissors and armbar ran on both devices', 'A won with rock and attacked');

  /* 6b. a second round with one of the newer techniques; this time B wins and takes A's back */
  await adv(A, 3); await adv(B, 3);
  // each has to hear that the other is free again before a new challenge can be made
  await wait(A, () => { const v = window.__bjj.net.list[0]; return !!v && !v.busy && !v.bout; }, 'A sees B free again', 8000);
  await wait(B, () => { const v = window.__bjj.net.list[0]; return !!v && !v.busy && !v.bout; }, 'B sees A free again', 8000);
  const again = await A.page.evaluate(() => {
    const g = window.__bjj;
    g.sim._cool = 0;
    if (g.sim.challenge('rnc')) return true;
    const p = g.sim.p;
    const v = g.net.list[0];
    return { mode: p.mode, onMat: p.onMat, busy: g.sim.busy, me: [p.x, p.z, p.y], them: v ? [v.x, v.z, v.y, v.busy, !!v.bout, v.anim] : null, toast: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent) };
  });
  assert.ok(again === true, `A could challenge B to a back choke: ${JSON.stringify(again)}`);
  await wait(B, () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick' && d.kind === 'rnc'; }, 'B is challenged to the back choke');
  await wait(A, () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick'; }, 'A sees the answer again');
  await A.page.evaluate(() => window.__bjj.sim.pick('s'));
  await B.page.evaluate(() => window.__bjj.sim.pick('r'));
  await wait(A, () => window.__bjj.sim.p.mode === 'bout', 'A in the back choke');
  await wait(B, () => window.__bjj.sim.p.mode === 'bout', 'B in the back choke');
  await wait(A, () => { const bt = window.__bjj.sim.p.bout; return !bt || bt.t > 3.0; }, 'back choke held on A');
  await wait(B, () => { const bt = window.__bjj.sim.p.bout; return !bt || bt.t > 3.0; }, 'back choke held on B');
  // on both screens: same technique, B behind A, both facing the same way, both seated
  const held = (me) => me.page.evaluate(() => {
    const g = window.__bjj;
    const b = g.sim.p.bout;
    if (!b) return null;
    const turn = (x) => Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
    const ux = Math.sin(b.a.yaw);
    const uz = Math.cos(b.a.yaw);
    return {
      kind: b.kind, iWin: b.iWin, same: turn(b.a.yaw - b.d.yaw) < 0.2, ahead: (b.d.x - b.a.x) * ux + (b.d.z - b.a.z) * uz,
      low: b.a.char.C.drop < -0.25 && b.d.char.C.drop < -0.25, reach: b.a.char.C.aLs,
    };
  });
  const hA = await held(A);
  const hB = await held(B);
  assert.ok(hA && hB, 'both still in the hold');
  assert.deepEqual([hA.kind, hA.iWin, hB.kind, hB.iWin], ['rnc', false, 'rnc', true]);
  for (const h of [hA, hB]) assert.ok(h.same && h.ahead > 0.1 && h.low && h.reach > 1.6, `hold looks the same on both screens: ${JSON.stringify(h)}`);
  await sleep(500);
  await shot(A, 'meet-a-rnc');
  await shot(B, 'meet-b-rnc');
  await wait(A, () => window.__bjj.sim.p.mode === 'free', 'A free after the back choke', 40000);
  await wait(B, () => window.__bjj.sim.p.mode === 'free', 'B free after the back choke', 40000);
  ok('a back choke between two devices looks the same on both', `B won with rock; defender ${hA.ahead.toFixed(2)} m in front on A, ${hB.ahead.toFixed(2)} m on B`);

  /* 6c. the struggle: the one who is held hammers the button, gets out, and both screens agree */
  await adv(A, 3); await adv(B, 3);
  await wait(A, () => { const v = window.__bjj.net.list[0]; return !!v && !v.busy && !v.bout; }, 'A sees B free once more', 8000);
  await wait(B, () => { const v = window.__bjj.net.list[0]; return !!v && !v.busy && !v.bout; }, 'B sees A free once more', 8000);
  assert.ok(await A.page.evaluate(() => { const g = window.__bjj; g.sim._cool = 0; return g.sim.challenge('guil'); }), 'A could challenge B to a guillotine');
  await wait(B, () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick' && d.kind === 'guil'; }, 'B is challenged to the guillotine');
  await wait(A, () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick'; }, 'A sees the answer a third time');
  await A.page.evaluate(() => window.__bjj.sim.pick('r'));
  await B.page.evaluate(() => window.__bjj.sim.pick('s'));
  await wait(B, () => { const b = window.__bjj.sim.p.bout; return !!b && b.open; }, 'the struggle opens on B', 40000);
  assert.deepEqual(await B.page.evaluate(() => { const b = window.__bjj.sim.p.bout; return [b.iWin, typeof b.judge]; }), [false, 'function'], 'B is held and decides the struggle');
  assert.equal(await A.page.evaluate(() => { const b = window.__bjj.sim.p.bout; return b ? typeof b.judge : 'gone'; }), 'object', 'A does not decide it');
  let pressed = 0;
  for (let i = 0; i < 40 && pressed < 6; i++) {
    if (await B.page.evaluate(() => window.__bjj.sim.mash())) pressed++;
    await sleep(120);
  }
  assert.ok(pressed >= 5, `B got its presses in (${pressed})`);
  await A.page.evaluate(() => window.__bjj.sim.mash());
  await wait(B, () => { const b = window.__bjj.sim.p.bout; return !b || b.outcome !== 0; }, 'B decides', 40000);
  await wait(A, () => { const b = window.__bjj.sim.p.bout; return !b || b.outcome !== 0; }, 'A hears how it ended', 40000);
  const endA = await A.page.evaluate(() => { const b = window.__bjj.sim.p.bout; return b ? { o: b.outcome, m: b.m, waited: b.waited } : null; });
  const endB = await B.page.evaluate(() => { const b = window.__bjj.sim.p.bout; return b ? { o: b.outcome, m: b.m } : null; });
  assert.ok(endA && endB, 'both still in the technique when it was decided');
  assert.deepEqual([endA.o, endB.o], [1, 1], `both screens say escape: ${JSON.stringify([endA, endB])}`);
  assert.ok(endA.m.d >= pressed - 1 && endB.m.a >= 1, `each saw the other's presses: ${JSON.stringify([endA.m, endB.m])}`);
  await wait(A, () => Array.from(document.querySelectorAll('#toasts > *')).some((t) => /탈출! 민수 님이 길로틴에서/.test(t.textContent)), 'A is told of the escape', 20000);
  await sleep(300);
  await shot(A, 'meet-a-escape');
  await wait(A, () => window.__bjj.sim.p.mode === 'free', 'A free after the escape', 40000);
  await wait(B, () => window.__bjj.sim.p.mode === 'free', 'B free after the escape', 40000);
  ok('the one held hammered out of a guillotine, and both devices agreed', `B pressed ${pressed}, A saw ${endA.m.d}; A waited ${endA.waited.toFixed(2)} s for word`);

  /* 6d. a points match: positions and points are worked out on each device and must agree */
  await adv(A, 3); await adv(B, 3);
  await wait(A, () => { const v = window.__bjj.net.list[0]; return !!v && !v.busy && !v.bout; }, 'A sees B free before the match', 8000);
  await wait(B, () => { const v = window.__bjj.net.list[0]; return !!v && !v.busy && !v.bout; }, 'B sees A free before the match', 8000);
  assert.ok(await A.page.evaluate(() => { const g = window.__bjj; g.sim._cool = 0; return g.sim.challenge('match'); }), 'A could offer B a match');
  await wait(B, () => { const d = window.__bjj.sim.p.duel; return !!d && d.kind === 'match' && d.me === 'B'; }, 'B is offered the match');
  const canPick = () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick' && !d.pick; };
  const hands = async (ha, hb, label) => {
    await wait(A, canPick, `A can throw a hand (${label})`, 60000);
    await wait(B, canPick, `B can throw a hand (${label})`, 60000);
    await A.page.evaluate((h) => window.__bjj.sim.pick(h), ha);
    await B.page.evaluate((h) => window.__bjj.sim.pick(h), hb);
  };
  const state = (d) => d.page.evaluate(() => {
    const g = window.__bjj;
    const du = g.sim.p.duel;
    const v = g.net.list[0];
    return du ? { me: du.me, round: du.round, phase: du.phase, pos: du.M.pos, top: du.M.top, sc: [du.M.sc.A, du.M.sc.B], left: Math.round(du.M.left), end: du.M.end, mine: g.sim.char.anim, theirs: v && v.ctl ? v.ctl.anim : null } : null;
  });
  const settled = (round) => [`round ${round} played out`, (r) => { const d = window.__bjj.sim.p.duel; return !!d && d.round === r && d.phase === 'pick'; }];
  const total = await A.page.evaluate(() => window.__bjj.sim.p.duel.M.total);
  assert.equal(total, 60, 'blue against white: the white belt\'s five minutes, scaled to 60 s');
  await hands('r', 's', 'round 1');
  await wait(A, settled(2)[1], `A: ${settled(2)[0]}`, 60000, 2);
  await wait(B, settled(2)[1], `B: ${settled(2)[0]}`, 60000, 2);
  let mA = await state(A);
  let mB = await state(B);
  assert.deepEqual([mA.pos, mA.top, mA.sc, mB.pos, mB.top, mB.sc], ['guard', 'A', [2, 0], 'guard', 'A', [2, 0]], `takedown agreed: ${JSON.stringify([mA, mB])}`);
  assert.deepEqual([mA.mine, mA.theirs, mB.mine, mB.theirs], ['guardTop', 'guardBottom', 'guardBottom', 'guardTop'], 'each device shows itself and the other in the right place');
  assert.equal(await text(A, '#mt-me'), '2');
  assert.equal(await text(B, '#mt-them'), '2');
  await sleep(600);
  await shot(A, 'meet-a-match-guard');
  await shot(B, 'meet-b-match-guard');
  await hands('s', 'r', 'round 2'); // B sweeps
  await wait(A, settled(3)[1], 'A: round 2 played out', 60000, 3);
  await wait(B, settled(3)[1], 'B: round 2 played out', 60000, 3);
  mA = await state(A); mB = await state(B);
  assert.deepEqual([mA.top, mA.sc, mB.top, mB.sc], ['B', [2, 2], 'B', [2, 2]], `sweep agreed: ${JSON.stringify([mA, mB])}`);
  await hands('s', 'r', 'round 3');
  await wait(A, settled(4)[1], 'A: round 3 played out', 60000, 4);
  await wait(B, settled(4)[1], 'B: round 3 played out', 60000, 4);
  await hands('s', 'r', 'round 4');
  await wait(A, settled(5)[1], 'A: round 4 played out', 60000, 5);
  await wait(B, settled(5)[1], 'B: round 4 played out', 60000, 5);
  mA = await state(A); mB = await state(B);
  assert.deepEqual([mA.pos, mA.top, mA.sc, mB.pos, mB.top, mB.sc], ['mount', 'B', [2, 9], 'mount', 'B', [2, 9]], `pass and mount agreed: ${JSON.stringify([mA, mB])}`);
  assert.ok(Math.abs(mA.left - mB.left) <= 2, `the clocks agree (${mA.left} s and ${mB.left} s)`);
  await sleep(600);
  await shot(A, 'meet-a-match-mounted');
  await shot(B, 'meet-b-match-mount');
  // B goes for the finish from the mount; A, underneath, decides the struggle and does not get out
  await hands('s', 'r', 'round 5');
  await wait(A, () => window.__bjj.sim.p.mode === 'bout', 'A is in the finish', 40000);
  await wait(B, () => window.__bjj.sim.p.mode === 'bout', 'B is in the finish', 40000);
  const sub = [await A.page.evaluate(() => { const b = window.__bjj.sim.p.bout; return [b.id, b.kind, b.iWin, typeof b.judge, b.ground]; }), await B.page.evaluate(() => { const b = window.__bjj.sim.p.bout; return [b.id, b.kind, b.iWin, typeof b.judge, b.ground]; })];
  assert.deepEqual([sub[0][0], sub[0][1], sub[0][4]], [sub[1][0], sub[1][1], sub[1][4]], `both devices chose the same finish: ${JSON.stringify(sub)}`);
  assert.deepEqual([sub[0][2], sub[0][3], sub[1][2], sub[1][3]], [false, 'function', true, 'object'], 'the one underneath decides');
  await wait(B, () => { const b = window.__bjj.sim.p.bout; return !b || b.t > 3.4; }, 'the hold is on', 40000);
  await sleep(400);
  await shot(B, 'meet-b-match-finish');
  const ended = () => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'end'; };
  await wait(A, ended, 'the match ends on A', 60000);
  await wait(B, ended, 'the match ends on B', 60000);
  mA = await state(A); mB = await state(B);
  assert.deepEqual([mA.end, mB.end], [2, 2], `both say the challenged side won: ${JSON.stringify([mA, mB])}`);
  await wait(A, () => Array.from(document.querySelectorAll('#toasts > *')).some((t) => /한 판 종료 · 민수 승 · /.test(t.textContent)), 'A is told who won', 10000);
  await wait(B, () => Array.from(document.querySelectorAll('#toasts > *')).some((t) => /한 판 종료 · 민수 승 · /.test(t.textContent)), 'B is told who won', 10000);
  assert.equal(await text(A, '#mt-short'), '패배');
  assert.equal(await text(B, '#mt-short'), '승리');
  await sleep(300);
  await shot(B, 'meet-b-match-win');
  await wait(A, () => window.__bjj.sim.p.mode === 'free', 'A free after the match', 40000);
  await wait(B, () => window.__bjj.sim.p.mode === 'free', 'B free after the match', 40000);
  ok('a points match between two devices: takedown, sweep, pass, mount and a finish agreed on both', `${sub[0][1]} from the mount; ${mA.left} s left on A, ${mB.left} s on B`);

  /* 6e. the shrimp race: one starts, the other standing at the start is taken along */
  await adv(A, 2); await adv(B, 2);
  const lane = await A.page.evaluate(() => window.__bjj.world.race);
  await view(A, { x: lane.x0 + 0.9, z: -0.25, yaw: -Math.PI / 2, camYaw: Math.PI, pitch: 0.5, dist: 6.5 });
  await view(B, { x: lane.x0 + 1.3, z: -0.85, yaw: -Math.PI / 2, camYaw: Math.PI, pitch: 0.5, dist: 6.5 });
  await adv(A, 0.4); await adv(B, 0.4);
  assert.equal(await text(A, '#b-main'), '경주', 'the big button offers the race at the start line');
  await wait(A, () => { const v = window.__bjj.net.list[0]; return !!v && !v.du && !v.bt; }, 'A hears that B is free', 8000);
  assert.ok(await A.page.evaluate(() => window.__bjj.sim.startRace()), 'A starts a race');
  ms = await wait(B, () => window.__bjj.sim.p.mode === 'race', 'B is taken along', 15000);
  const ids = [await A.page.evaluate(() => window.__bjj.sim.p.race.id), await B.page.evaluate(() => window.__bjj.sim.p.race.id)];
  assert.equal(ids[0], ids[1], 'both are in the same race');
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
  await wait(A, () => window.__toastLog.some((t) => /완주! \d+\.\d\d초 · 새우빼기 \d+번 · 1등/.test(t)), 'A came first', 20000);
  await wait(B, () => window.__toastLog.some((t) => /완주! \d+\.\d\d초 · 새우빼기 \d+번 · 2등/.test(t)), 'B came second', 30000);
  await wait(B, () => window.__toastLog.some((t) => /현철 님 새우빼기 \d+\.\d\d초/.test(t)), 'B is told A\'s time', 15000);
  await wait(A, () => window.__toastLog.some((t) => /민수 님 새우빼기 \d+\.\d\d초/.test(t)), 'A is told B\'s time', 30000);
  const times = [await A.page.evaluate(() => window.__toastLog.find((t) => /완주!/.test(t))), await B.page.evaluate(() => window.__toastLog.find((t) => /완주!/.test(t)))];
  ok('a shrimp race together: the other is taken along, the faster presser wins, each is told the other\'s time', `joined after ${ms} ms; ${times.join(' / ')}`);

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
  await view(A, { x: -5.0, z: -2.5 });
  await adv(A, 0.3);
  ms = await wait(B, () => { const v = window.__bjj.net.list[0]; return v && Math.abs(v.st.x + 5.0) < 0.05 && Math.abs(v.st.z + 2.5) < 0.05; }, 'B still follows A after a relay died', 15000);
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
