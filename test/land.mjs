// Landscape on phones: the stage is turned on its side while playing on an upright phone, and
// touches are read in the turned frame. Also saves pictures of the layouts to shots/.
// Usage: node test/land.mjs
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, shots, sleep } from './page.mjs';

const T = await launch();
let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
// what a person holding the phone on its side would see
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
const state = (page) => page.evaluate(() => {
  const g = window.__bjj;
  const cl = document.documentElement.classList;
  const cv = document.querySelector('#scene');
  return {
    rot: cl.contains('rot'), flip: cl.contains('flip'), cw: cv.clientWidth, ch: cv.clientHeight,
    stick: Object.assign({}, g.stick), yaw: g.cam.yaw, pitch: g.cam.pitch, mode: g.sim.p.mode,
    land: !document.querySelector('#m-land').hidden, flipBtn: !document.querySelector('#m-flip').hidden,
    landText: document.querySelector('#m-land').textContent,
  };
});
// stage position -> where that is on the upright screen
const toClient = (turn, W, H) => (sx, sy) => (turn === 1 ? [W - sy, sx] : turn === -1 ? [sy, H - sx] : [sx, sy]);
// Touch events arrive a little after the call that sends them: wait until the page shows it.
const until = (page, fn, arg) => page.waitForFunction(fn, { timeout: 3000, polling: 30 }, arg).then(() => true, () => false);
const drag = async (page, map, from, to) => {
  const [x0, y0] = map(...from);
  const [x1, y1] = map(...to);
  await page.touchscreen.touchStart(x0, y0);
  await sleep(40);
  for (let i = 1; i <= 4; i++) {
    await page.touchscreen.touchMove(x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * i) / 4);
    await sleep(20);
  }
};

/* ---------- an upright phone ---------- */
{
  const W = 390;
  const H = 844;
  const page = await T.open({ w: W, h: H, touch: true });
  await sleep(600);
  let s = await state(page);
  ok(!s.rot, 'start screen stays upright');
  await shot(page, 'land-0-start');
  await T.enter(page);
  s = await state(page);
  ok(s.rot && !s.flip, 'playing on an upright phone turns the stage');
  ok(s.cw === H && s.ch === W, 'the picture is laid out in landscape', `${s.cw}x${s.ch}`);
  ok(s.land && s.flipBtn && s.landText === '세로로 보기', 'menu offers upright view and flipping');
  await sleep(1300);
  const told = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).some((t) => t.textContent.includes('가로 화면')));
  ok(told, 'a toast says how to hold the phone');
  await T.freeze(page);
  // stand on the mat next to the sparring partner so the technique buttons light up
  await page.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.spar && x.name.includes('파트너'));
    g.sim.p.x = n.home.x + 0.95; g.sim.p.z = n.home.z; g.sim.p.yaw = -Math.PI / 2;
    g.cam.yaw = -Math.PI / 2; g.cam.pitch = 0.3;
    window.__adv(2.2);
  });
  await sleep(700);
  await shot(page, 'land-1-play', 90);
  const ready = await page.evaluate(() => Array.from(document.querySelectorAll('.pb.sk')).map((b) => b.classList.contains('ready')));
  ok(ready.length === 1 && ready.every(Boolean), 'the technique button is lit beside a partner on the mat', ready.join(','));
  // nothing on the pad overlaps anything else
  const overlap = await page.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('.pad .pb')).map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.dataset.act || b.dataset.pop || 'main', x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    });
    const bad = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      if (Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y) < bs[i].r + bs[j].r + 2) bad.push(`${bs[i].id}/${bs[j].id}`);
    }
    const inside = bs.every((b) => b.x - b.r >= 0 && b.y - b.r >= 0 && b.x + b.r <= window.innerWidth && b.y + b.r <= window.innerHeight);
    return { bad, inside, n: bs.length };
  });
  ok(overlap.n === 8 && overlap.bad.length === 0 && overlap.inside, 'eight buttons, none overlapping, all on screen', overlap.bad.join(' '));

  // the stick: pushing toward the top of the turned picture walks forward
  const map = toClient(1, W, H);
  await drag(page, map, [110, 300], [110, 240]);
  await until(page, () => window.__bjj.stick.on && window.__bjj.stick.y > 0.95);
  s = await state(page);
  ok(s.stick.on && near(s.stick.x, 0, 0.15) && s.stick.y > 0.95, 'stick up = forward', `x ${s.stick.x.toFixed(2)} y ${s.stick.y.toFixed(2)}`);
  const knob = await page.evaluate(() => {
    const r = document.querySelector('#stick').getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  const [kx, ky] = map(110, 300);
  ok(near(knob[0], kx, 3) && near(knob[1], ky, 3), 'the stick appears under the thumb', `${knob.map((v) => v.toFixed(0))} vs ${kx},${ky}`);
  await page.touchscreen.touchMove(...map(170, 300));
  await until(page, () => window.__bjj.stick.x > 0.95);
  s = await state(page);
  ok(s.stick.x > 0.85 && near(s.stick.y, 0, 0.15), 'stick right = right', `x ${s.stick.x.toFixed(2)} y ${s.stick.y.toFixed(2)}`);
  await page.touchscreen.touchEnd();
  await until(page, () => !window.__bjj.stick.on);
  s = await state(page);
  ok(!s.stick.on, 'letting go stops');

  // dragging the picture turns the camera in the turned frame
  const before = await state(page);
  await drag(page, map, [430, 130], [490, 130]);
  await until(page, (y0) => Math.abs(window.__bjj.cam.yaw - y0 + 0.36) < 0.01, before.yaw);
  await page.touchscreen.touchEnd();
  await until(page, () => window.__bjj.touches.size === 0);
  s = await state(page);
  ok(near(s.yaw - before.yaw, -0.36, 0.03) && near(s.pitch, before.pitch, 0.02), 'drag right turns the view', `yaw ${(s.yaw - before.yaw).toFixed(3)}`);
  await drag(page, map, [430, 130], [430, 180]);
  await until(page, (p0) => Math.abs(window.__bjj.cam.pitch - p0 - 0.2) < 0.01, s.pitch);
  await page.touchscreen.touchEnd();
  await until(page, () => window.__bjj.touches.size === 0);
  const s2 = await state(page);
  ok(near(s2.pitch - s.pitch, 0.2, 0.03) && near(s2.yaw, s.yaw, 0.02), 'drag down tilts the view', `pitch ${(s2.pitch - s.pitch).toFixed(3)}`);

  // buttons are hit where they are drawn
  const hit = async (sel) => {
    const b = await (await page.$(sel)).boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await sleep(60);
  };
  await hit('#b-spar');
  await until(page, () => !!window.__bjj.sim.p.duel);
  const duel = await page.evaluate(() => { const d = window.__bjj.sim.p.duel; return d ? d.kind : null; });
  ok(duel === 'spar', 'tapping 스파링 beside the partner starts sparring', String(duel));
  await page.evaluate(() => window.__adv(2.0));
  await hit('#rps-cycle');
  ok(await page.evaluate(() => window.__bjj.sim.tech === 'guil'), 'the technique button on the strip is hit where it is drawn');
  await sleep(500);
  await shot(page, 'land-2-rps', 90);
  await page.evaluate(() => { window.__bjj.sim.cancelDuel(); window.__adv(1.2); });

  // flipped the other way
  await page.evaluate(() => document.querySelector('#m-flip').click());
  await sleep(200);
  s = await state(page);
  ok(s.rot && s.flip && s.cw === H && s.ch === W, 'flipping turns the stage the other way');
  const map2 = toClient(-1, W, H);
  await drag(page, map2, [110, 300], [110, 240]);
  await until(page, () => window.__bjj.stick.on && window.__bjj.stick.y > 0.95);
  s = await state(page);
  ok(s.stick.on && near(s.stick.x, 0, 0.15) && s.stick.y > 0.95, 'flipped: stick up = forward', `x ${s.stick.x.toFixed(2)} y ${s.stick.y.toFixed(2)}`);
  await page.touchscreen.touchEnd();
  await until(page, () => !window.__bjj.stick.on);
  const b3 = await state(page);
  await drag(page, map2, [430, 130], [490, 130]);
  await until(page, (y0) => Math.abs(window.__bjj.cam.yaw - y0 + 0.36) < 0.01, b3.yaw);
  await page.touchscreen.touchEnd();
  await until(page, () => window.__bjj.touches.size === 0);
  s = await state(page);
  ok(near(s.yaw - b3.yaw, -0.36, 0.03), 'flipped: drag right turns the view', `yaw ${(s.yaw - b3.yaw).toFixed(3)}`);
  await shot(page, 'land-3-flip', -90);
  const kept = await page.evaluate(() => localStorage.getItem('bjjmeta.side'));
  ok(kept === 'r', 'the side is remembered');
  await page.evaluate(() => document.querySelector('#m-flip').click());
  await sleep(100);

  // a dialog with a field to type into stands the stage up again; with the field shut it does not
  await page.evaluate(() => {
    for (const i of document.querySelectorAll('#modal-apply input')) i.disabled = true;
    document.querySelector('#modal-apply').hidden = false;
  });
  await sleep(150);
  s = await state(page);
  ok(s.rot, 'a form that cannot be typed into stays in landscape');
  await page.evaluate(() => { for (const i of document.querySelectorAll('#modal-apply input')) i.disabled = false; });
  await sleep(150);
  s = await state(page);
  ok(!s.rot && s.cw === W && s.ch === H, 'the sign-up form is shown upright once its fields open');
  await shot(page, 'land-4-form');
  await page.evaluate(() => { document.querySelector('#modal-apply').hidden = true; });
  await sleep(150);
  s = await state(page);
  ok(s.rot, 'closing it turns the stage back');
  // other dialogs stay in landscape
  await page.evaluate(() => document.querySelector('#m-help').click());
  await sleep(300);
  s = await state(page);
  ok(s.rot, 'the help dialog stays in landscape');
  await shot(page, 'land-5-help', 90);
  await page.evaluate(() => document.querySelector('#modal-help [data-close]').click());

  // choosing the upright view
  await page.evaluate(() => document.querySelector('#m-land').click());
  await sleep(200);
  s = await state(page);
  ok(!s.rot && s.landText === '가로로 보기' && !s.flipBtn, 'upright view on request');
  ok((await page.evaluate(() => localStorage.getItem('bjjmeta.land'))) === '0', 'the choice is remembered');
  await sleep(300);
  await shot(page, 'land-6-upright');
  await page.evaluate(() => document.querySelector('#m-land').click());
  await sleep(200);
  s = await state(page);
  ok(s.rot, 'and back to landscape');
  // the start screen is upright again
  await page.evaluate(() => document.querySelector('#m-look').click());
  await sleep(300);
  s = await state(page);
  ok(!s.rot && s.cw === W, 'back on the start screen the stage is upright');
  await page.close();
}

/* ---------- the same phone really turned (auto-rotate on) ---------- */
{
  const page = await T.open({ w: 844, h: 390, touch: true });
  await T.enter(page);
  let s = await state(page);
  ok(!s.rot && s.cw === 844 && s.ch === 390, 'a phone that is already sideways is left alone');
  ok(s.land && !s.flipBtn, 'no flip entry when the browser turned the view itself');
  await T.freeze(page);
  await page.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.spar && x.name.includes('파트너'));
    g.sim.p.x = n.home.x + 0.95; g.sim.p.z = n.home.z; g.sim.p.yaw = -Math.PI / 2;
    g.cam.yaw = -Math.PI / 2; g.cam.pitch = 0.3;
    window.__adv(2.2);
  });
  await sleep(700);
  await shot(page, 'land-7-real');
  // turning the phone upright while playing turns the stage
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await sleep(400);
  s = await state(page);
  ok(s.rot && s.cw === 844 && s.ch === 390, 'turning the phone upright keeps the game in landscape');
  await page.close();
}

/* ---------- a small phone ---------- */
{
  const page = await T.open({ w: 320, h: 568, touch: true });
  await T.enter(page);
  await T.freeze(page);
  await page.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.spar && x.name.includes('파트너'));
    g.sim.p.x = n.home.x + 0.95; g.sim.p.z = n.home.z;
    window.__adv(2.2);
  });
  await sleep(600);
  const fit = await page.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect();
    const chip = r('#chip');
    const cam = r('.camrow');
    const toast = r('#toasts');
    // In the turned frame "below" is further left on the upright screen and "left of" is higher up.
    return { chipRight: chip.right, camLeft: cam.left, toastBottom: toast.bottom, camTop: cam.top, hidden: document.querySelector('#chip').hidden };
  });
  ok(!fit.hidden && fit.chipRight <= fit.camLeft + 1, 'small phone: the partner label clears the camera buttons', `${fit.chipRight.toFixed(0)} <= ${fit.camLeft.toFixed(0)}`);
  ok(fit.toastBottom <= fit.camTop + 1, 'small phone: messages stay left of the camera buttons', `${fit.toastBottom.toFixed(0)} <= ${fit.camTop.toFixed(0)}`);
  await shot(page, 'land-8-small', 90);
  await page.close();
}

/* ---------- a tablet and a desktop are not turned ---------- */
{
  const page = await T.open({ w: 820, h: 1180, touch: true });
  await T.enter(page);
  const s = await state(page);
  ok(!s.rot && !s.land, 'a tablet is not turned');
  await page.close();
  const desk = await T.open({ w: 1280, h: 800, touch: false });
  await T.enter(desk);
  await T.freeze(desk);
  await desk.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.spar && x.name.includes('파트너'));
    g.sim.p.x = n.home.x + 0.95; g.sim.p.z = n.home.z; g.sim.p.yaw = -Math.PI / 2;
    g.cam.yaw = -Math.PI / 2; g.cam.pitch = 0.3;
    window.__adv(2.2);
  });
  const d = await state(desk);
  ok(!d.rot && !d.land, 'a desktop is not turned');
  await desk.keyboard.press('KeyF');
  ok(await desk.evaluate(() => { const dd = window.__bjj.sim.p.duel; window.__adv(1.8); return !!dd && dd.kind === 'spar'; }), 'key F starts sparring');
  for (const [key, kind] of [['KeyQ', 'ankle'], ['KeyE', 'guil'], ['KeyS', 'tri'], ['KeyD', 'kim']]) {
    await desk.keyboard.press(key);
    const k = await desk.evaluate(() => window.__bjj.sim.tech);
    ok(k === kind, `in sparring, key ${key} chooses ${kind}`, String(k));
  }
  await desk.evaluate(() => { window.__bjj.sim.cancelDuel(); window.__adv(1.2); });
  await sleep(600);
  await shot(desk, 'land-9-desk');
  await desk.close();
}

await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
