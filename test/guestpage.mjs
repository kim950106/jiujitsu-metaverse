// The guestbook in a browser: drawing with a mouse and with a finger (also with the stage turned
// on its side), leaving, keeping across a reload, removing, the board on the dojo wall, and two
// separate browsers sharing entries through local relays. Saves pictures to shots/.
// Usage: node test/guestpage.mjs
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, shots, sleep } from './page.mjs';
import { startBroker } from './broker.mjs';

let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};
const turned = (file, deg) => execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).rotate(int(sys.argv[2]), expand=True)
im.save(sys.argv[1])
`, file, String(deg)]);
const shot = async (page, name, deg = 0) => {
  const f = path.join(shots, `${name}.png`);
  await page.screenshot({ path: f });
  if (deg) turned(f, deg);
  console.log('saved', name);
};
const until = (page, fn, arg) => page.waitForFunction(fn, { timeout: 8000, polling: 30 }, arg).then(() => true, () => false);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const list = (page) => page.evaluate(() => window.__bjj.guest.list().map((e) => ({ id: e.id, n: e.n, b: e.b, s: e.s, mine: e.mine, strokes: e.strokes })));
const openBook = async (page) => {
  await page.evaluate(() => { document.querySelector('#menu-btn').click(); document.querySelector('#m-guest').click(); });
  await sleep(150);
};

/* ---------- one browser, the claude.ai build (kept in this browser only) ---------- */
{
  const T = await launch();
  const page = await T.open({ w: 1280, h: 720, fresh: true });
  await T.enter(page);
  await openBook(page);
  ok(await vis(page, '#modal-guest') && await vis(page, '#gb-empty'), 'the guestbook opens empty');
  ok((await page.evaluate(() => document.querySelector('#gb-note').textContent)).includes('브라우저에만'), 'and says it is kept in this browser only');
  await page.click('#gb-new');
  ok(await vis(page, '#gb-canvas') && !(await vis(page, '#gb-grid')), 'the pad opens');
  ok((await page.evaluate(() => document.querySelector('#gb-as').textContent)) === '나 퍼플 3그랄로 남깁니다', 'it says whose entry this will be');
  // nothing drawn: refused
  await page.click('#gb-post');
  ok(await vis(page, '#gb-canvas'), 'an empty pad is not left');
  const r = await rect(page, '#gb-canvas');
  ok(Math.abs(r.w / r.h - 1.6) < 0.02 && r.w > 300, 'the pad keeps its shape', `${Math.round(r.w)}x${Math.round(r.h)}`);
  // "OSS" in three colours
  const pt = (u, v) => [r.x + r.w * u, r.y + r.h * v];
  const draw = async (pts) => {
    await page.mouse.move(...pt(...pts[0]));
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...pt(...p), { steps: 4 });
    await page.mouse.up();
  };
  const ring = (cx, cy, rx, ry) => Array.from({ length: 25 }, (_, i) => [cx + Math.cos((i / 24) * 6.283) * rx, cy + Math.sin((i / 24) * 6.283) * ry]);
  const ess = (cx) => [[cx + 0.07, 0.3], [cx, 0.24], [cx - 0.07, 0.32], [cx, 0.48], [cx + 0.07, 0.62], [cx, 0.74], [cx - 0.07, 0.66]];
  await draw(ring(0.2, 0.5, 0.1, 0.26));
  await page.click('#gb-inks button:nth-child(2)');
  await draw(ess(0.5));
  await page.click('#gb-inks button:nth-child(3)');
  await page.click('#gb-pens button:nth-child(3)');
  await draw(ess(0.78));
  await draw([[0.1, 0.9], [0.9, 0.9]]);
  const ink = await page.evaluate(() => document.querySelector('#gb-ink').textContent);
  ok(/^남은 잉크 \d+%$/.test(ink) && ink !== '남은 잉크 100%', 'ink runs down as lines are drawn', ink);
  await page.click('#gb-undo');
  await shot(page, 'guest-pad-desktop');
  // a touch beside the pad does not close the dialog
  await page.mouse.click(8, 400);
  ok(await vis(page, '#gb-canvas'), 'a touch beside the pad does not throw the drawing away');
  await page.click('#gb-post');
  ok(await until(page, () => window.__bjj.guest.list().length === 1), 'the entry is left');
  let l = await list(page);
  ok(l[0].n === '나' && l[0].b === 'purple' && l[0].s === 3 && l[0].mine && l[0].strokes.length === 3, 'with name, belt, stripes and three lines', JSON.stringify({ n: l[0].n, b: l[0].b, s: l[0].s, lines: l[0].strokes.length }));
  ok(l[0].strokes[0].c === 0 && l[0].strokes[1].c === 1 && l[0].strokes[2].c === 2 && l[0].strokes[2].w === 2, 'colours and widths are kept');
  const c0 = l[0].strokes[0].pts;
  ok(c0.every((p) => p[0] > 20 && p[0] < 82 && p[1] > 35 && p[1] < 125), 'the first ring lies where it was drawn', `${c0.length} points`);
  const cap = await page.evaluate(() => document.querySelector('.gb-card figcaption').textContent);
  const d = new Date();
  const today = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  ok(cap === `${today} · 나 퍼플 3그랄 (나)`, 'the card shows the day and who left it', cap);
  await shot(page, 'guest-list-desktop');
  await page.click('#modal-guest [data-close]');
  // the board on the wall
  await page.evaluate(() => { const g = window.__bjj; g.sim.p.x = 0.95; g.sim.p.z = 5.4; g.sim.p.yaw = 0; g.cam.yaw = Math.PI; g.cam.pitch = 0.12; g.cam.dist = 2.6; });
  ok(await until(page, () => document.querySelector('#chip').textContent === '게시판 · 그림 남기기'), 'the wall board offers itself');
  await sleep(1500);
  await shot(page, 'guest-wall');
  await page.click('#b-main');
  ok(await vis(page, '#modal-guest'), 'and the big button opens the guestbook');
  // kept across a reload
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__bjj && window.__bjj.ok', { timeout: 20000 });
  l = await list(page);
  ok(l.length === 1 && l[0].mine && l[0].strokes.length === 3, 'the entry is still there after a reload');
  // removing takes two presses
  await openBook(page);
  await page.click('.gb-card .del');
  ok((await list(page)).length === 1, 'one press does not remove');
  await page.click('.gb-card .del');
  ok(await until(page, () => window.__bjj.guest.list().length === 0) && await vis(page, '#gb-empty'), 'the second press removes it');
  await page.close();

  /* ---------- a finger, on a phone held sideways and on an upright phone with the stage turned ---------- */
  for (const [name, w, h, turn, deg, upright] of [['land', 640, 360, 0, 0], ['rot', 390, 844, 1, 90], ['small', 320, 568, 1, 90], ['upright', 360, 740, 0, 0, true]]) {
    const ph = await T.open({ w, h, touch: true, fresh: true, store: upright ? { 'bjjmeta.land': '0' } : {} });
    await T.enter(ph);
    await sleep(300);
    ok((await ph.evaluate(() => document.documentElement.classList.contains('rot'))) === !!turn, `${name}: stage ${turn ? 'turned' : 'not turned'}`);
    await openBook(ph);
    await ph.evaluate(() => document.querySelector('#gb-new').click());
    await sleep(200);
    // the pad in the stage's own frame
    const box = await ph.evaluate((t) => {
      const b = document.querySelector('#gb-canvas').getBoundingClientRect();
      const W = window.innerWidth, H = window.innerHeight;
      const st = t === 1 ? { x: b.top, y: W - b.right, w: b.height, h: b.width } : { x: b.left, y: b.top, w: b.width, h: b.height };
      const tools = document.querySelector('.gb-tools').getBoundingClientRect();
      const fits = b.left >= 0 && b.top >= 0 && b.right <= W + 0.5 && b.bottom <= H + 0.5 && tools.left >= 0 && tools.top >= 0 && tools.right <= W + 0.5 && tools.bottom <= H + 0.5;
      return Object.assign(st, { fits, side: document.querySelector('#gb-draw').classList.contains('side') });
    }, turn);
    ok(box.fits && box.side === !upright && Math.abs(box.w / box.h - 1.6) < 0.03 && box.w >= 150, `${name}: pad and tools fit on the screen, ${upright ? 'one above the other' : 'side by side'}`, `${Math.round(box.w)}x${Math.round(box.h)}`);
    // every tool can be reached: none is cut off by the card
    const cut = await ph.evaluate(() => {
      const card = document.querySelector('#modal-guest .card').getBoundingClientRect();
      return Array.from(document.querySelectorAll('.gb-tools button')).filter((b) => { const r = b.getBoundingClientRect(); return r.left < card.left - 0.5 || r.top < card.top - 0.5 || r.right > card.right + 0.5 || r.bottom > card.bottom + 0.5; }).length;
    });
    ok(cut === 0, `${name}: no tool is cut off`, String(cut));
    const toClient = (sx, sy) => (turn === 1 ? [w - sy, sx] : [sx, sy]);
    const sp = (u, v) => toClient(box.x + box.w * u, box.y + box.h * v);
    // a level line across the middle, then a short upright one on the left
    const stroke = async (a, b) => {
      const [x0, y0] = sp(...a);
      const [x1, y1] = sp(...b);
      await ph.touchscreen.touchStart(x0, y0);
      for (let i = 1; i <= 6; i++) { await ph.touchscreen.touchMove(x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6); await sleep(12); }
      await ph.touchscreen.touchEnd();
      await sleep(60);
    };
    await stroke([0.25, 0.5], [0.75, 0.5]);
    await stroke([0.125, 0.25], [0.125, 0.75]);
    await shot(ph, `guest-pad-${name}`, deg);
    await ph.evaluate(() => document.querySelector('#gb-post').click());
    ok(await until(ph, () => window.__bjj.guest.list().length === 1), `${name}: the finger drawing is left`);
    const s = (await list(ph))[0].strokes;
    const a = s[0] ? s[0].pts : [];
    const b = s[1] ? s[1].pts : [];
    const near = (v, t, tol = 4) => Math.abs(v - t) <= tol;
    ok(s.length === 2 && near(a[0][0], 64) && near(a[a.length - 1][0], 192) && a.every((p) => near(p[1], 80)), `${name}: the level line is level, from a quarter to three quarters`, JSON.stringify([a[0], a[a.length - 1]]));
    ok(b.length >= 2 && near(b[0][1], 40) && near(b[b.length - 1][1], 120) && b.every((p) => near(p[0], 32)), `${name}: the upright line is upright`, JSON.stringify([b[0], b[b.length - 1]]));
    await sleep(150);
    await shot(ph, `guest-list-${name}`, deg);
    await ph.close();
  }
  await T.close();
  if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
}

/* ---------- two browsers on the hosted build, sharing through local relays ---------- */
{
  const brokers = [await startBroker(), await startBroker()];
  const relay = encodeURIComponent(brokers.map((b) => b.url).join(','));
  const T = await launch({ web: true });
  const A = await T.open({ w: 900, h: 500, fresh: true, query: `?relay=${relay}`, sel: { place: 'gym', belt: 'blue', stripes: 4, gi: 'white', name: '현철' } });
  const B = await T.open({ w: 900, h: 500, fresh: true, query: `?relay=${relay}`, sel: { place: 'gym', belt: 'white', stripes: 0, gi: 'white', name: '친구' } });
  await T.enter(A);
  await T.enter(B);
  ok(await until(A, () => window.__bjj.guest.shared) && await until(B, () => window.__bjj.guest.shared), 'on the hosted build the guestbook is shared');
  await until(A, () => window.__bjj.net.room.info().up === 2);
  await openBook(A);
  ok((await A.evaluate(() => document.querySelector('#gb-note').textContent)).includes('공개 서버'), 'and says where the entries go');
  await A.click('#gb-new');
  const r = await rect(A, '#gb-canvas');
  await A.mouse.move(r.x + r.w * 0.2, r.y + r.h * 0.3);
  await A.mouse.down();
  await A.mouse.move(r.x + r.w * 0.5, r.y + r.h * 0.7, { steps: 5 });
  await A.mouse.move(r.x + r.w * 0.8, r.y + r.h * 0.3, { steps: 5 });
  await A.mouse.up();
  await A.click('#gb-post');
  ok(await until(B, () => window.__bjj.guest.list().length === 1), 'what one person leaves, the other sees');
  const lb = (await list(B))[0];
  ok(lb.n === '현철' && lb.b === 'blue' && lb.s === 4 && !lb.mine, 'with the right name, belt and stripes, and not as their own', JSON.stringify({ n: lb.n, b: lb.b, s: lb.s }));
  await openBook(B);
  const cap = await B.evaluate(() => document.querySelector('.gb-card figcaption').textContent);
  ok(/^\d{4}\.\d{2}\.\d{2} · 현철 블루 4그랄$/.test(cap), 'the other person reads the caption', cap);
  ok(!(await B.evaluate(() => !!document.querySelector('.gb-card .del'))), 'and cannot remove it from the dialog');
  await shot(B, 'guest-shared');
  // a third person who arrives later
  const C = await T.open({ w: 900, h: 500, fresh: true, query: `?relay=${relay}` });
  ok(await until(C, () => window.__bjj.guest.list().length === 1), 'someone who opens the page later sees it too, before entering');
  // the author removes it: gone for everyone
  // (two presses in quick succession; with several pages drawing in software a real click takes seconds here)
  await A.evaluate(() => { document.querySelector('.gb-card .del').click(); document.querySelector('.gb-card .del').click(); });
  ok(await until(B, () => window.__bjj.guest.list().length === 0) && await until(C, () => window.__bjj.guest.list().length === 0), 'when the author removes it, it goes for everyone');
  await T.close();
  for (const b of brokers) await b.stop();
  if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
