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

const types = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2' };
const fontDirs = { bhs: 'node_modules/@fontsource/black-han-sans/files', plex: 'node_modules/@fontsource/ibm-plex-sans-kr/files' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const m = u.match(/^\/fonts\/(bhs|plex)\/(.+)$/);
  const file = m ? path.join(root, fontDirs[m[1]], path.basename(m[2])) : path.join(root, 'index.html');
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
