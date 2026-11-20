// On a phone the page is never zoomed by two fingers, and neither is the game's view: nearer and
// further is the + and - buttons only, a step at a touch and on and on while held. Checked with a
// real pinch from the browser (it does zoom an ordinary page) and with two fingers on the scene.
// Usage: node test/zoom.mjs
import { launch, sleep } from './page.mjs';

const T = await launch();
let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};
// Two fingers put down around (x, y) and drawn apart, as the browser itself gets them.
const pinch = async (page, x, y) => {
  const vp = page.viewport();
  const cx = Math.min(Math.max(x, 100), vp.width - 100);
  const cy = Math.min(Math.max(y, 10), vp.height - 10);
  const pts = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
  const cdp = await page.target().createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(20) });
  for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(20 + i * 4) }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  await cdp.detach();
  return page.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1));
};

/* ---------- an ordinary page zooms: the check below can see a zoom when there is one ---------- */
{
  const page = await T.open({ w: 740, h: 360, touch: true });
  const probe = await page.browser().newPage();
  await probe.setViewport({ width: 740, height: 360, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await probe.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;height:200vh;background:#ccc"><p>plain page</p></body>');
  let s = 1;
  for (let i = 0; i < 3 && s < 1.03; i++) s = await pinch(probe, 370, 180); // (a busy machine can drop one)
  ok(s > 1.03, 'a plain page is zoomed by the same two-finger pinch', `scale ${s.toFixed(2)}`);
  await probe.close();
  await page.close();
}

for (const [name, w, h, turned] of [['land', 740, 360, false], ['upright', 360, 740, true]]) {
  const page = await T.open({ w, h, touch: true, sel: { place: 'gym', belt: 'white', stripes: 1, gi: 'white', name: '나' } });
  const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]').content);
  ok(/maximum-scale=1\b/.test(meta) && /user-scalable=no/.test(meta) && /minimum-scale=1\b/.test(meta), `${name}: the viewport tag asks for no zoom`, meta);
  // on the start screen
  let s = await pinch(page, w / 2, h / 2);
  ok(Math.abs(s - 1) < 1e-3, `${name}: a pinch on the start screen does not zoom the page`, `scale ${s.toFixed(3)}`);
  await T.enter(page);
  await sleep(600);
  ok(turned === (await page.evaluate(() => document.documentElement.classList.contains('rot'))), `${name}: the stage is ${turned ? 'turned on its side' : 'as it is'}`);
  // a pinch on the scene, on the stick, on the big button, on the place name
  const spots = await page.evaluate(() => {
    const c = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    return { scene: { x: window.innerWidth / 2, y: window.innerHeight / 2 }, stick: c('#stick'), 'big button': c('#b-main'), 'place name': c('.where') };
  });
  for (const [where, p] of Object.entries(spots)) {
    const d0 = await page.evaluate(() => window.__bjj.cam.dist);
    s = await pinch(page, p.x, p.y);
    const d1 = await page.evaluate(() => window.__bjj.cam.dist);
    ok(Math.abs(s - 1) < 1e-3 && Math.abs(d1 - d0) < 1e-6, `${name}: a pinch on the ${where} zooms neither the page nor the game's view`, `scale ${s.toFixed(3)}, view ${d0.toFixed(2)} → ${d1.toFixed(2)}`);
  }
  // two fingers on the scene, moving apart: the old pinch-to-zoom is gone; one finger still turns the view
  const fingers = await page.evaluate(() => {
    const cv = document.querySelector('#scene');
    const ev = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: id, clientX: x, clientY: y, isPrimary: id === 11 }));
    const g = window.__bjj;
    const d0 = g.cam.dist;
    const y0 = g.cam.yaw;
    const p0 = g.cam.pitch;
    const turned = () => Math.abs(g.cam.yaw - y0) + Math.abs(g.cam.pitch - p0);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    ev('pointerdown', 11, cx - 20, cy);
    ev('pointerdown', 12, cx + 20, cy);
    for (let i = 1; i <= 10; i++) ev('pointermove', 12, cx + 20 + i * 14, cy);
    const dd = g.cam.dist - d0;
    const second = turned();
    for (let i = 1; i <= 10; i++) ev('pointermove', 11, cx - 20 - i * 10, cy - i * 4);
    const first = turned();
    ev('pointerup', 11, cx, cy);
    ev('pointerup', 12, cx, cy);
    return { dd, second, first };
  });
  ok(Math.abs(fingers.dd) < 1e-9 && Math.abs(fingers.second) < 1e-9 && Math.abs(fingers.first) > 0.1, `${name}: a second finger on the scene does nothing; the first still turns the view`, JSON.stringify(fingers));
  // what the page does with a two-finger move and with Safari's pinch gesture
  const blocked = await page.evaluate(() => {
    const t = (id, x) => new Touch({ identifier: id, target: document.body, clientX: x, clientY: 100 });
    const two = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(1, 100), t(2, 200)], targetTouches: [t(1, 100), t(2, 200)], changedTouches: [t(2, 200)] });
    document.body.dispatchEvent(two);
    const one = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(1, 120)], targetTouches: [t(1, 120)], changedTouches: [t(1, 120)] });
    document.body.dispatchEvent(one);
    const gs = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.dispatchEvent(gs);
    return { two: two.defaultPrevented, one: one.defaultPrevented, gesture: gs.defaultPrevented };
  });
  ok(blocked.two && !blocked.one && blocked.gesture, `${name}: a move with two fingers and Safari's pinch are stopped; one finger is left alone`, JSON.stringify(blocked));
  const ta = await page.evaluate(() => [getComputedStyle(document.body).touchAction, getComputedStyle(document.querySelector('.hud-tools')).touchAction, getComputedStyle(document.querySelector('#scene')).touchAction]);
  ok(!ta.some((v) => v === 'auto' || v.includes('pinch-zoom') || v === 'manipulation'), `${name}: nothing on the page allows pinch or double-tap zoom`, ta.join(' / '));
  // the + and - buttons: a step at a touch, more while held, nothing after letting go
  const hold = async (sel, ms) => {
    const before = await page.evaluate(() => window.__bjj.cam.dist);
    await page.evaluate((q) => document.querySelector(q).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 21, button: 0 })), sel);
    const step = await page.evaluate(() => window.__bjj.cam.dist);
    await sleep(ms);
    const held = await page.evaluate(() => window.__bjj.cam.dist);
    await page.evaluate((q) => document.querySelector(q).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 21, button: 0 })), sel);
    const up = await page.evaluate(() => window.__bjj.cam.dist);
    await sleep(500);
    const later = await page.evaluate(() => window.__bjj.cam.dist);
    return { before, step, held, up, later };
  };
  await page.evaluate(() => { window.__bjj.cam.dist = 6; });
  const zi = await hold('#zoom-in', 1600);
  ok(Math.abs(zi.before - zi.step - 0.8) < 1e-6 && zi.held < zi.step - 0.3 && Math.abs(zi.later - zi.up) < 1e-9, `${name}: + comes nearer a step at once, and on while held`, JSON.stringify(zi));
  const zo = await hold('#zoom-out', 1600);
  ok(Math.abs(zo.step - zo.before - 0.8) < 1e-6 && zo.held > zo.step + 0.3 && Math.abs(zo.later - zo.up) < 1e-9, `${name}: - goes further the same way`, JSON.stringify(zo));
  await page.evaluate(() => { window.__bjj.cam.dist = 1.7; });
  const lo = await hold('#zoom-in', 1200);
  ok(lo.held >= 1.6 - 1e-9, `${name}: and stops at the nearest the view goes`, lo.held.toFixed(2));
  // the stage still fills the screen exactly
  const fit = await page.evaluate(() => {
    const r = document.querySelector('#stage').getBoundingClientRect();
    const c = document.querySelector('#scene');
    return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight, cw: c.width / c.clientWidth, ch: c.height / c.clientHeight, aspect: window.__bjj.camera.aspect, ca: c.clientWidth / c.clientHeight };
  });
  ok(Math.abs(fit.w - fit.vw) < 1 && Math.abs(fit.h - fit.vh) < 1 && Math.abs(fit.aspect - fit.ca) < 1e-3 && Math.abs(fit.cw - fit.ch) < 0.02, `${name}: the stage fills the screen, and the view is drawn at the screen's own proportions`, JSON.stringify(fit));
  await page.close();
}

await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
