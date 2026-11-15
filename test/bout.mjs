// A technique as the player sees it: the slap and bump, the struggle bar and the big button, the
// camera finding its angle, the slow-motion tap with its word on the screen, an escape, the run of
// wins. Saves pictures to shots/. Usage: node test/bout.mjs
import path from 'node:path';
import { launch, shots, sleep } from './page.mjs';

const T = await launch();
let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};
const shot = async (page, name) => { await page.screenshot({ path: path.join(shots, `${name}.png`) }); console.log('saved', name); };
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

for (const [name, w, h, touch] of [['desk', 1100, 620, false], ['land', 740, 360, true]]) {
  const page = await T.open({ w, h, touch });
  await T.enter(page);
  await T.freeze(page);
  // stand next to the sparring partner and win the duel
  const begin = (kind, npcHand, npcMash) => page.evaluate((k, hand, mash) => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.name === '스파링 파트너');
    const p = g.sim.p;
    p.x = n.home.x + 0.95; p.z = n.home.z; p.yaw = -Math.PI / 2;
    window.__adv(2);
    g.sim.npcPick = () => hand;
    g.sim.npcMash = () => mash;
    g.sim._cool = 0;
    g.cam.yaw = 0.2; // somewhere that is not one of the technique's own angles
    g.sim.challenge(k);
    window.__adv(0.4);
    g.sim.pick('r');
    for (let i = 0; i < 300 && !g.sim.p.bout; i++) window.__adv(1 / 60);
    return !!g.sim.p.bout;
  }, kind, npcHand, npcMash);
  const to = (t) => page.evaluate((at) => { const b = window.__bjj.sim.p.bout; if (b) window.__adv(Math.max(0, at - b.t)); }, t);
  const st = () => page.evaluate(() => {
    const g = window.__bjj;
    const b = g.sim.p.bout;
    return { t: b ? b.t : -1, yaw: g.cam.yaw, byaw: b ? b.yaw : 0, auto: g.view.auto, off: g.view.off, main: document.querySelector('#b-main').textContent, outcome: b ? b.outcome : -1, m: b ? Object.assign({}, b.m) : null, push: g.cam.push };
  });

  ok(await begin('ankle', 's', 0), `${name}: the technique starts`);
  await to(0.4);
  await sleep(350);
  await shot(page, `bout-${name}-1-slap`);
  await to(3.25);
  await sleep(1300); // real time for the camera to come round
  let s = await st();
  ok(s.auto && angle(s.yaw, s.byaw + s.off) < 0.2 && Math.abs(Math.abs(s.off) - Math.PI / 2) < 0.01, `${name}: the camera has come round to the side`, `off ${s.off.toFixed(2)}, ${angle(s.yaw, s.byaw + s.off).toFixed(2)} away`);
  ok(await vis(page, '#mash') && s.main === '연타!', `${name}: the struggle bar is up and the big button says so`, s.main);
  ok((await page.evaluate(() => document.querySelector('#mash-text').textContent)) === '연타해서 조이세요!', `${name}: the attacker is told to tighten`);
  // hammer the big button: touches on a phone, the key on a desk
  for (let i = 0; i < 3; i++) {
    if (touch) await page.evaluate(() => document.querySelector('#b-main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 7, button: 0 })));
    else await page.keyboard.press('Space');
    await page.evaluate(() => window.__adv(0.1));
  }
  s = await st();
  ok(s.m.a === 3, `${name}: three presses are counted`, JSON.stringify(s.m));
  const bar = await page.evaluate(() => document.querySelector('#mash-bar').style.width);
  ok(bar === '100%', `${name}: the bar has moved to the tap side`, bar);
  await sleep(200);
  await shot(page, `bout-${name}-2-struggle`);
  await to(5.25);
  ok(!(await vis(page, '#mash')), `${name}: the bar goes away when the struggle ends`);
  await to(5.86);
  await sleep(700);
  s = await st();
  ok(s.outcome === 2 && await vis(page, '#flash') && (await page.evaluate(() => document.querySelector('#flash').textContent)) === '탭!', `${name}: the tap fills the screen`);
  ok(s.push < 0.85, `${name}: the camera pushes in`, s.push.toFixed(2));
  await shot(page, `bout-${name}-3-tap`);
  await page.evaluate(() => window.__adv(6));
  await sleep(400);
  ok(await page.evaluate(() => window.__bjj.sim.p.mode === 'free' && window.__bjj.sim.streak === 1), `${name}: free again, one win`);
  ok(!(await vis(page, '#streak')), `${name}: one win is not yet a run`);
  await page.evaluate(() => window.__adv(7));
  // a second win: the run shows; this time the player turns the camera and it is left alone
  ok(await begin('rnc', 's', 0), `${name}: a second technique`);
  await to(2.0);
  await page.evaluate(() => { const g = window.__bjj; g.spin = 1; });
  await sleep(250);
  await page.evaluate(() => { window.__bjj.spin = 0; });
  const y0 = (await st()).yaw;
  await sleep(700);
  s = await st();
  ok(!s.auto && angle(s.yaw, y0) < 0.02, `${name}: once the player turns the camera it stays where they put it`);
  await to(5.9);
  await page.evaluate(() => window.__adv(7));
  await sleep(300);
  ok(await vis(page, '#streak') && (await page.evaluate(() => document.querySelector('#streak').textContent)) === '2연승', `${name}: two in a row shows as a run`);
  await page.evaluate(() => window.__adv(7));
  // held by the NPC and hammering out
  ok(await begin('guil', 'p', 2), `${name}: held by the partner`);
  await to(3.3);
  ok((await page.evaluate(() => document.querySelector('#mash-text').textContent)) === '연타해서 빠져나오세요!', `${name}: the defender is told to get out`);
  for (let i = 0; i < 6; i++) await page.evaluate(() => { window.__bjj.main(); window.__adv(0.08); });
  await sleep(150);
  await shot(page, `bout-${name}-4-resist`);
  await to(5.86);
  await sleep(500);
  s = await st();
  ok(s.outcome === 1 && (await page.evaluate(() => document.querySelector('#flash').textContent)) === '탈출!', `${name}: six presses against two: out`, JSON.stringify(s.m));
  await shot(page, `bout-${name}-5-escape`);
  await page.evaluate(() => window.__adv(6));
  ok(await page.evaluate(() => window.__bjj.sim.p.mode === 'free' && window.__bjj.sim.streak === 2), `${name}: the run survives an escape`);
  await page.close();
}
await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
