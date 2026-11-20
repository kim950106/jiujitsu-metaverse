// Sparring as the player sees it: the request box when a person asks, the bar with the rounds and
// the position, the strip with the finishing technique and the hands, the slap and bump after the
// bow, the takedown and the sweeps, the camera finding its angle, the finish from the ground with
// the slow-motion tap, the end of the series and the run of wins.
// Saves pictures to shots/. Usage: node test/bout.mjs
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
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), sel);
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

for (const [name, w, h, touch] of [['desk', 1100, 620, false], ['land', 740, 360, true]]) {
  // a white belt, so that the series is the short one: first to 3 of 5
  const page = await T.open({ w, h, touch, sel: { place: 'gym', belt: 'white', stripes: 2, gi: 'white', name: '나' } });
  await T.enter(page);
  await T.freeze(page);
  const press = (sel) => page.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 7, button: 0 })), sel);
  await page.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.name === '스파링 파트너');
    const p = g.sim.p;
    p.x = n.home.x + 0.95; p.z = n.home.z; p.yaw = -Math.PI / 2;
    window.__adv(2.4);
    g.sim.npcPick = () => 's';
    g.sim._cool = 0;
    g.cam.yaw = 0.2; // somewhere that is not one of the technique's own angles
  });
  // throw a hand in the round that is open, and run on past the reveal (into the move, or the technique)
  const round = (kind, hand) => page.evaluate((k, hd) => {
    const g = window.__bjj;
    for (let i = 0; i < 900 && !(g.sim.p.mode === 'duel' && g.sim.p.duel && g.sim.p.duel.phase === 'pick' && !g.sim.p.duel.pick); i++) window.__adv(1 / 60);
    g.sim.setTech(k);
    g.sim.pick(hd);
    for (let i = 0; i < 300 && !g.sim.p.bout && !(g.sim.p.duel && g.sim.p.duel.phase === 'move'); i++) window.__adv(1 / 60);
    return g.sim.p.bout ? g.sim.p.bout.kind : g.sim.p.duel ? g.sim.p.duel.phase : '';
  }, kind, hand);
  const to = (t) => page.evaluate((at) => { const b = window.__bjj.sim.p.bout; if (b) window.__adv(Math.max(0, at - b.t)); }, t);
  const st = () => page.evaluate(() => {
    const g = window.__bjj;
    const b = g.sim.p.bout;
    const d = g.sim.p.duel;
    return { t: b ? b.t : -1, yaw: g.cam.yaw, byaw: b ? b.yaw : d ? d.yaw : 0, auto: g.view.auto, off: g.view.off, push: g.cam.push, T: b ? b.T : null };
  });

  ok(!(await vis(page, '#matchbar')) && !(await vis(page, '#rps')), `${name}: no bar and no strip before sparring`);
  if (touch) await press('#b-spar'); else await page.keyboard.press('KeyF');
  ok(await page.evaluate(() => { const d = window.__bjj.sim.p.duel; return !!d && d.kind === 'spar' && d.phase === 'intro'; }), `${name}: sparring with the NPC starts at once`);
  ok(await vis(page, '#matchbar') && !(await vis(page, '#rps')), `${name}: during the bow the bar is up, no hands yet`);
  ok((await txt(page, '#mt-clock')) === '1판째' && (await txt(page, touch ? '#mt-short' : '#mt-pos')) === '5판 3선승' && (await txt(page, '#mt-me')) === '0', `${name}: the bar shows the round and the rule`, await txt(page, '#matchbar'));
  await T.adv(page, 1.5);
  await sleep(300);
  await shot(page, `bout-${name}-1-slap`);
  await T.adv(page, 1.1);
  ok(await vis(page, '#rps') && await vis(page, touch ? '#rps-cycle' : '#rps-techs') && await vis(page, '#rps-hands'), `${name}: then the strip with the finishing technique and the hands`);
  ok((await txt(page, touch ? '#rps-cycle' : '#rps-status')) === (touch ? '마무리 · 암바 ⟳' : '이기면 테이크다운'), `${name}: it says what a win does`, await txt(page, touch ? '#rps-cycle' : '#rps-status'));
  ok((await round('ankle', 'r')) === 'move', `${name}: the first throw is won: no technique yet`);
  await sleep(300);
  ok((await txt(page, '#flash')) === '테이크다운!' && (await txt(page, '#mt-me')) === '1' && (await txt(page, touch ? '#mt-short' : '#mt-pos')) === (touch ? '가드' : '5판 3선승 · 가드') && await page.evaluate(() => document.querySelector('#matchbar').dataset.top === 'me'), `${name}: a takedown: the round on the bar, with the position and who is on top`, await txt(page, '#matchbar'));
  ok(!(await vis(page, '#rps')), `${name}: the strip is put away while they go down`);
  await T.adv(page, 1.2);
  let s;
  for (let i = 0; i < 40; i++) { // real time for the camera to come round
    await sleep(300);
    s = await st();
    if (s.off != null && angle(s.yaw, s.byaw + s.off) < 0.15) break;
  }
  ok(s.auto && angle(s.yaw, s.byaw + s.off) < 0.25 && Math.abs(Math.abs(s.off) - Math.PI / 2) < 0.01, `${name}: the camera has come round to the side of the pair`, `off ${s.off == null ? '-' : s.off.toFixed(2)}, ${angle(s.yaw, s.byaw + (s.off || 0)).toFixed(2)} away`);
  await shot(page, `bout-${name}-2-guard`);
  // the second round is lost: swept
  await page.evaluate(() => { window.__bjj.sim.npcPick = () => 'p'; });
  ok((await round('arm', 'r')) === 'move', `${name}: a lost throw`);
  await sleep(300);
  ok((await txt(page, '#flash')) === '스윕!' && (await txt(page, '#mt-them')) === '1' && await page.evaluate(() => document.querySelector('#matchbar').dataset.top === 'them'), `${name}: the partner sweeps and is on top`, await txt(page, '#matchbar'));
  // this time the player turns the camera and it is left alone
  await page.evaluate(() => { window.__bjj.spin = 1; });
  await sleep(250);
  await page.evaluate(() => { window.__bjj.spin = 0; });
  const y0 = (await st()).yaw;
  await T.adv(page, 1);
  await sleep(700);
  s = await st();
  ok(!s.auto && angle(s.yaw, y0) < 0.02, `${name}: once the player turns the camera it stays where they put it`);
  await page.evaluate(() => { window.__bjj.sim.npcPick = () => 's'; });
  ok((await round('rnc', 'r')) === 'move', `${name}: the third round is won`);
  ok((await txt(page, '#mt-me')) === '2' && await page.evaluate(() => document.querySelector('#matchbar').dataset.top === 'me'), `${name}: swept back: 2 : 1`);
  await page.evaluate(() => { const g = window.__bjj; for (let i = 0; i < 900 && !(g.sim.p.duel.phase === 'pick' && !g.sim.p.duel.pick); i++) window.__adv(1 / 60); g.sim.setTech('arm'); });
  ok(touch || (await txt(page, '#rps-status')) === '이기면 암바로 마무리!', `${name}: one win from the series, the strip says the technique finishes it`, await txt(page, '#rps-status'));
  await shot(page, `bout-${name}-3-final`);
  ok((await round('arm', 'r')) === 'arm', `${name}: the round that wins it: the armbar`);
  ok(await page.evaluate(() => window.__bjj.sim.p.bout.ground), `${name}: put on from the position`);
  ok(!(await vis(page, '#rps')), `${name}: the strip is put away during the technique`);
  await to(3.25);
  // real time for the camera to come round (a quarter turn from the side of the pair)
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    s = await st();
    if (s.off != null && angle(s.yaw, s.byaw + s.off) < 0.15) break;
  }
  ok(s.auto && angle(s.yaw, s.byaw + s.off) < 0.2, `${name}: the camera comes round for the technique`, `off ${s.off.toFixed(2)}, ${angle(s.yaw, s.byaw + s.off).toFixed(2)} away`);
  ok((await txt(page, '#b-main')) !== '연타!' && !(await vis(page, '#mash')), `${name}: nothing to hammer: the technique ends in a tap`);
  await shot(page, `bout-${name}-4-hold`);
  await to(s.T.tap + 0.06);
  await sleep(700);
  s = await st();
  ok(await vis(page, '#flash') && (await txt(page, '#flash')) === '탭!', `${name}: the tap fills the screen`);
  ok(s.push < 0.85, `${name}: the camera pushes in`, s.push.toFixed(2));
  ok((await txt(page, '#mt-me')) === '3' && (await txt(page, '#mt-them')) === '1', `${name}: the round is on the bar at the tap`, await txt(page, '#matchbar'));
  await shot(page, `bout-${name}-5-tap`);
  await page.evaluate(() => { const g = window.__bjj; for (let i = 0; i < 900 && !(g.sim.p.duel && g.sim.p.duel.phase === 'end'); i++) window.__adv(1 / 60); window.__adv(0.4); });
  await sleep(500);
  ok((await txt(page, '#mt-clock')) === '승리' && (await txt(page, '#mt-me')) === '3' && (await txt(page, '#flash')) === '승리!', `${name}: three rounds won: the sparring is won`, await txt(page, '#matchbar'));
  ok(/스파링 종료 · 나 승 · 3 : 1/.test(await page.evaluate(() => document.querySelector('#toasts').textContent)), `${name}: and said so`);
  await shot(page, `bout-${name}-6-win`);
  await T.adv(page, 5);
  await sleep(300);
  ok(await page.evaluate(() => window.__bjj.sim.p.mode === 'free' && window.__bjj.sim.streak === 1) && !(await vis(page, '#matchbar')), `${name}: free again, one win, the bar is gone`);
  ok(!(await vis(page, '#streak')), `${name}: one win is not yet a run`);
  // a second series won: the run shows, on the badge and over the head
  await T.adv(page, 7);
  await page.evaluate(() => { const g = window.__bjj; const n = g.world.npcs.find((x) => x.name === '스파링 파트너'); g.sim.p.x = n.home.x + 0.95; g.sim.p.z = n.home.z; window.__adv(0.5); g.sim._cool = 0; g.sim.challenge(); });
  for (let i = 0; i < 3; i++) await round('kim', 'r');
  await page.evaluate(() => { const g = window.__bjj; for (let i = 0; i < 1200 && g.sim.p.duel; i++) window.__adv(1 / 60); });
  await sleep(300);
  ok(await vis(page, '#streak') && (await txt(page, '#streak')) === '2연승' && await page.evaluate(() => window.__bjj.labelText === '나 · 2연승'), `${name}: two in a row shows as a run`);

  // a person asks: the request box, yes and no
  const ask = (o) => page.evaluate((a) => window.__bjj.sim.h.ask(a), o);
  await ask({ name: '친구', rule: '5판 3선승', left: 15, total: 15 });
  ok(await vis(page, '#sparask') && (await txt(page, '#sparask-text')) === '친구 님이 스파링을 신청했습니다 · 5판 3선승', `${name}: a request shows who asks and the rule`, await txt(page, '#sparask-text'));
  const fit = await page.evaluate(() => {
    const r = document.querySelector('#sparask').getBoundingClientRect();
    const b = Array.from(document.querySelectorAll('#sparask button')).map((x) => x.getBoundingClientRect());
    return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight && b.every((x) => x.height >= 30 && x.width >= 80);
  });
  ok(fit && await page.evaluate(() => document.querySelector('#b-spar').classList.contains('ready')), `${name}: the box is on the screen with two buttons big enough to hit; the sparring button lights up as a yes`);
  await sleep(200);
  await shot(page, `bout-${name}-5-ask`);
  // the buttons answer the simulation (there is nobody asking here, so the box is simply put away)
  await page.evaluate(() => { const s = window.__bjj.sim; window.__ans = []; const real = s.answer.bind(s); s.answer = (y) => { window.__ans.push(y); s.h.ask(null); return real(y); }; });
  await page.evaluate(() => { window.__bjj.sim.ask = { id: 'w', av: { gone: true, du: null }, t: 0, seen: 1e9 }; });
  if (touch) await press('#sparask-no'); else await page.keyboard.press('Escape');
  ok(await page.evaluate(() => window.__ans.join() === 'false') && !(await vis(page, '#sparask')), `${name}: no`);
  await ask({ name: '친구', rule: '5판 3선승', left: 15, total: 15 });
  await page.evaluate(() => { window.__bjj.sim.ask = { id: 'x', av: { gone: true, du: null }, t: 0, seen: 1e9 }; });
  if (touch) await press('#sparask-yes'); else await page.keyboard.press('KeyF');
  ok(await page.evaluate(() => window.__ans.join() === 'false,true') && !(await vis(page, '#sparask')), `${name}: yes`);
  await page.close();
}
await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
