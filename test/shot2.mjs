// Visual check of the phone layout, the rock-paper-scissors duel, both techniques, the master's
// questions and two people in one room. Serves dist/ locally with the CDN library and web fonts
// mapped to local copies. Usage: node test/shot2.mjs [group,group]  (phone, land, desk, multi)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const only = process.argv[2] ? process.argv[2].split(',') : null;
const want = (name) => !only || only.includes(name);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };
const fontDirs = { bhs: 'node_modules/@fontsource/black-han-sans/files', plex: 'node_modules/@fontsource/ibm-plex-sans-kr/files' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let file;
  const m = u.match(/^\/fonts\/(bhs|plex)\/(.+)$/);
  if (m) file = path.join(root, fontDirs[m[1]], path.basename(m[2]));
  else file = path.join(dist, u === '/' ? 'index.html' : u);
  fs.readFile(file, (err, buf) => {
    if (err) { console.log('404:', u); res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const css = (pkg, key, files) => files.map((f) => fs.readFileSync(path.join(root, 'node_modules/@fontsource', pkg, f), 'utf8')
  .replace(/url\(\.\/files\//g, `url(${base}/fonts/${key}/`)).join('\n');
const fontCss = css('black-han-sans', 'bhs', ['400.css']) + css('ibm-plex-sans-kr', 'plex', ['400.css', '500.css', '700.css']);
const three = fs.readFileSync(path.join(root, 'node_modules/three/build/three.min.js'));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-proxy-server'],
});
const errors = [];
const open = async (w, h, touch, sel, query = '') => {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, hasTouch: !!touch, isMobile: !!touch });
  await page.setRequestInterception(true);
  page.on('request', (rq) => {
    const u = rq.url();
    if (u.includes('cdnjs.cloudflare.com')) rq.respond({ status: 200, contentType: 'text/javascript', body: three });
    else if (u.includes('fonts.googleapis.com')) rq.respond({ status: 200, contentType: 'text/css', body: fontCss });
    else if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) rq.continue();
    else rq.abort();
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  await page.evaluateOnNewDocument((s) => { try { localStorage.setItem('bjjmeta.sel', JSON.stringify(s)); } catch (e) { /* ignore */ } }, sel);
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__bjj && window.__bjj.ok', { timeout: 20000 });
  return page;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('saved', name); };
const enter = async (page) => { await page.evaluate(() => document.querySelector('#setup').requestSubmit()); await sleep(700); };
const view = (page, a) => page.evaluate((v) => {
  const g = window.__bjj;
  const p = g.sim.p;
  if (v.x != null) { p.x = v.x; p.z = v.z; }
  if (v.yaw != null) p.yaw = v.yaw;
  if (v.camYaw != null) g.cam.yaw = v.camYaw;
  if (v.pitch != null) g.cam.pitch = v.pitch;
  if (v.dist != null) g.cam.dist = v.dist;
  g.cam.tgt.set(p.x, p.y + 1.0, p.z);
}, a);
// advance the game by game-time, independent of how slowly the software renderer draws
const adv = (page, sec) => page.evaluate((t) => {
  const g = window.__bjj;
  for (let i = 0; i < t * 60; i++) g.sim.step(1 / 60, { mx: 0, my: 0, run: false, camYaw: g.cam.yaw });
}, sec);
const info = (page) => page.evaluate(() => {
  const g = window.__bjj;
  const r = g.renderer.info.render;
  return { calls: r.calls, tris: r.triangles, px: g.renderer.getPixelRatio() };
});
// side-on camera for a technique in progress
const boutCam = (page, dist = 3.3, off = Math.PI / 2, pitch = 0.32) => page.evaluate((d, o, pi) => {
  const g = window.__bjj;
  const b = g.sim.p.bout || g.sim.p.duel;
  if (!b) return;
  g.cam.yaw = b.yaw + o;
  g.cam.pitch = pi;
  g.cam.dist = d;
  g.cam.tgt.set(b.ox, 0.7, b.oz);
  g.cam.eff = Math.max(d, Math.min(7.5, 1.2 / (Math.tan((g.camera.fov * Math.PI) / 360) * g.camera.aspect)));
}, dist, off, pitch);
const SEL = { place: 'gym', belt: 'purple', stripes: 3, gi: 'blue', name: '현철' };

const fightNpc = async (page, kind, mine, theirs, prefix, shots) => {
  await page.evaluate((k, th) => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.spar && x.name.includes('파트너'));
    const p = g.sim.p;
    p.x = n.home.x + 0.95; p.z = n.home.z; p.yaw = -Math.PI / 2;
    g.sim.step(1 / 60, { mx: 0, my: 0, run: false, camYaw: 0 });
    g.sim.npcPick = () => th;
    g.sim._cool = 0;
    g.sim.challenge(k);
  }, kind, theirs);
  await adv(page, 0.5);
  await boutCam(page);
  await sleep(500);
  if (shots.includes('pick')) await shot(page, `${prefix}-1-pick`);
  await page.evaluate((m) => window.__bjj.sim.pick(m), mine);
  await adv(page, 0.1);
  await sleep(400);
  if (shots.includes('reveal')) await shot(page, `${prefix}-2-reveal`);
  await adv(page, 1.7);
  const marks = { clinch: 0.3, down: 0.95, move: 1.9, hold: 3.0, tap: 4.0, up: 5.3, bow: 6.4 };
  let t = 0;
  for (const [name, at] of Object.entries(marks)) {
    if (!shots.includes(name)) continue;
    await adv(page, at - t);
    t = at;
    await boutCam(page, 3.0, kind === 'arm' ? Math.PI * 0.82 : Math.PI / 2, 0.42);
    await sleep(450);
    await shot(page, `${prefix}-${name}`);
  }
  await adv(page, 7.6 - t);
  await adv(page, 5);
};

if (want('phone')) {
  const page = await open(390, 844, true, SEL, '?mock=1&admin=1');
  await sleep(1200);
  await shot(page, 'p-start');
  await enter(page);
  await sleep(900);
  await shot(page, 'p-gym-hud');
  console.log('gym at spawn:', await info(page));
  // near the master: the big button becomes "ask"
  await view(page, { x: -0.5, z: -5.2, yaw: Math.PI / 2, camYaw: -1.9, pitch: 0.22, dist: 3.4 });
  await adv(page, 0.2); await sleep(500);
  await shot(page, 'p-master-near');
  await page.evaluate(() => window.__bjj.main());
  await sleep(400); await shot(page, 'p-master-ask');
  await page.click('#ask-time'); await sleep(500); await shot(page, 'p-time-empty');
  await page.click('#time-editbtn'); await sleep(300);
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#time-inputs .trow');
    const fill = (row, vals) => row.querySelectorAll('input').forEach((el, i) => { el.value = vals[i]; });
    fill(rows[0], ['(예시) 월·수·금', '19:30~20:30', '주짓수 기초']);
    fill(rows[1], ['(예시) 화·목', '20:30~21:30', '스파링']);
  });
  await shot(page, 'p-time-edit');
  await page.click('#time-save'); await sleep(500); await shot(page, 'p-time-saved');
  await page.evaluate(() => document.querySelector('#modal-time [data-close]').click());
  await page.evaluate(() => window.__bjj.main()); await sleep(200);
  await page.click('#ask-apply'); await sleep(500); await shot(page, 'p-apply');
  await page.type('#apply-tel', '010-1234-5678');
  await page.click('#apply-send'); await sleep(600); await shot(page, 'p-apply-done');
  await page.click('#apply-list'); await sleep(600); await shot(page, 'p-list');
  await page.evaluate(() => document.querySelector('#modal-list [data-close]').click());
  // duel and both techniques against the sparring partner
  await fightNpc(page, 'ankle', 'r', 's', 'p-ankle', ['pick', 'reveal', 'down', 'hold', 'tap']);
  await fightNpc(page, 'arm', 'r', 's', 'p-arm', ['move', 'hold', 'tap', 'bow']);
  await fightNpc(page, 'arm', 'r', 'p', 'p-lose', ['reveal', 'tap']);
  await page.evaluate(() => document.querySelector('#people-btn').click());
  await sleep(300); await shot(page, 'p-people');
  await page.close();
}

if (want('land')) {
  const page = await open(844, 390, true, Object.assign({}, SEL, { place: 'arena' }), '?mock=1');
  await sleep(1000);
  await shot(page, 'l-start');
  await enter(page);
  await sleep(900);
  await shot(page, 'l-arena-hud');
  await view(page, { x: -6.6, z: 4.5, yaw: Math.PI, camYaw: 0, pitch: 0.34, dist: 6.5 });
  await adv(page, 0.3); await sleep(700);
  await shot(page, 'l-arena-mat');
  console.log('arena on mat:', await info(page));
  await adv(page, 2);
  await page.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.name === '몸풀기 파트너');
    g.sim.p.x = n.x + 0.95; g.sim.p.z = n.z; g.sim.step(1 / 60, { mx: 0, my: 0, run: false, camYaw: 0 });
    g.sim.npcPick = () => 'p';
    g.sim._cool = 0;
    g.sim.challenge('ankle');
  });
  await adv(page, 0.4); await boutCam(page, 3.4); await sleep(500);
  await shot(page, 'l-rps');
  await page.close();
}

if (want('desk')) {
  const page = await open(1280, 800, false, Object.assign({}, SEL, { place: 'arena', belt: 'black', stripes: 1, gi: 'white' }), '?mock=1');
  await enter(page);
  await view(page, { x: 0, z: 7.6, yaw: Math.PI, camYaw: 0, pitch: 0.5, dist: 10.5 });
  await adv(page, 0.3); await sleep(900);
  await shot(page, 'd-arena-mats');
  console.log('arena overview:', await info(page));
  await view(page, { x: -3.3, z: -5.1, yaw: 0, camYaw: 0.7, pitch: 0.2, dist: 3.2 });
  await adv(page, 0.5); await sleep(700);
  await shot(page, 'd-coach-seat');
  await page.evaluate(() => { const g = window.__bjj; g.sim.unseat(); });
  await view(page, { x: 31.2, z: -1.42, yaw: -Math.PI / 2, camYaw: -Math.PI / 2, pitch: 0.12, dist: 4.6 });
  await page.evaluate(() => { window.__bjj.sim.p.y = 0.42; });
  await adv(page, 0.4); await sleep(700);
  await shot(page, 'd-podium-silver');
  await page.close();
  const g = await open(1280, 800, false, SEL, '?mock=1');
  await enter(g);
  await view(g, { x: -3.0, z: 1.6, yaw: Math.PI, camYaw: 0.5, pitch: 0.42, dist: 8.5 });
  await adv(g, 0.3); await sleep(900);
  await shot(g, 'd-gym');
  console.log('gym overview:', await info(g));
  await g.close();
}

if (want('multi')) {
  // two visitors in one room, talking through the stand-in room
  const a = await open(640, 420, false, SEL, '?mock=1');
  const b = await open(640, 420, false, { place: 'gym', belt: 'blue', stripes: 1, gi: 'white', name: '민수' }, '?mock=1');
  await enter(a);
  await enter(b);
  await view(a, { x: -6.0, z: -1.5, yaw: -Math.PI / 2, camYaw: 0.4, pitch: 0.3, dist: 4.2 });
  await view(b, { x: -7.2, z: -1.5, yaw: Math.PI / 2, camYaw: -0.4, pitch: 0.3, dist: 4.2 });
  const count = (pg) => pg.evaluate(() => window.__bjj.net.list.length);
  await a.bringToFront(); await a.waitForFunction('window.__bjj.net.list.length === 1', { timeout: 30000 });
  await b.bringToFront(); await b.waitForFunction('window.__bjj.net.list.length === 1', { timeout: 30000 });
  console.log('each page sees', await count(a), await count(b), 'other(s)');
  await a.bringToFront(); await sleep(1500);
  await shot(a, 'm-a-sees-b');
  // A challenges B
  const pump = async (cond, pg, label, rounds = 80) => {
    for (let i = 0; i < rounds; i++) {
      for (const p of [a, b]) { await p.bringToFront(); await sleep(260); }
      if (await pg.evaluate(cond)) return true;
    }
    console.log('TIMEOUT waiting for', label);
    return false;
  };
  await adv(a, 2); await adv(b, 2);
  await pump(() => false, a, 'positions to settle (expected timeout)', 5);
  const dbg = (pg) => pg.evaluate(() => { const g = window.__bjj; const t = g.sim.partner(); return JSON.stringify({ me: g.sim.myPeer, mode: g.sim.p.mode, onMat: g.sim.p.onMat, at: [g.sim.p.x.toFixed(2), g.sim.p.z.toFixed(2)], partner: t && t.name, others: g.net.list.map((v) => [v.id, v.x.toFixed(2), v.z.toFixed(2), v.busy, v.anim]) }); });
  console.log('A:', await dbg(a));
  console.log('B:', await dbg(b));
  const started = await a.evaluate(() => { const g = window.__bjj; g.sim._cool = 0; return g.sim.challenge('arm'); });
  console.log('challenge started:', started, await a.evaluate(() => JSON.stringify(window.__bjj.sim.netState().du)));
  await pump(() => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick'; }, b, 'B to be challenged');
  await b.bringToFront(); await sleep(600); await shot(b, 'm-b-challenged');
  await pump(() => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick'; }, a, 'A to see the answer');
  await a.evaluate(() => window.__bjj.sim.pick('r'));
  await b.evaluate(() => window.__bjj.sim.pick('s'));
  await pump(() => window.__bjj.sim.p.mode === 'bout', a, 'A bout');
  await pump(() => window.__bjj.sim.p.mode === 'bout', b, 'B bout');
  console.log('roles:', await a.evaluate(() => window.__bjj.sim.p.bout && (window.__bjj.sim.p.bout.iWin ? 'A attacks' : 'A defends')), '/', await b.evaluate(() => window.__bjj.sim.p.bout && (window.__bjj.sim.p.bout.iWin ? 'B attacks' : 'B defends')));
  await pump(() => { const bt = window.__bjj.sim.p.bout; return !bt || bt.t > 3.2; }, a, 'hold');
  await a.bringToFront(); await boutCam(a, 3.2, Math.PI * 0.82, 0.42); await sleep(700); await shot(a, 'm-a-armbar');
  await b.bringToFront(); await boutCam(b, 3.2, Math.PI * 0.82, 0.42); await sleep(700); await shot(b, 'm-b-armbar');
  await pump(() => window.__bjj.sim.p.mode === 'free', a, 'A free');
  await pump(() => window.__bjj.sim.p.mode === 'free', b, 'B free');
  console.log('after bout:', await a.evaluate(() => window.__bjj.sim.p.mode), await b.evaluate(() => window.__bjj.sim.p.mode));
  await a.close();
  await b.close();
}

await browser.close();
server.close();
if (errors.length) console.log('\nconsole problems:\n' + Array.from(new Set(errors)).join('\n'));
else console.log('\nno console problems');
