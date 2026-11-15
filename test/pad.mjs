// The button pad, its two lists (techniques, things to say), speech bubbles and the timetable.
// Saves pictures to shots/. Usage: node test/pad.mjs
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, shots, sleep } from './page.mjs';

const T = await launch();
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
// every button of a list is inside the screen and none overlaps another
const laidOut = (page, sel) => page.evaluate((s) => {
  const bs = Array.from(document.querySelectorAll(`${s} button`)).map((b) => b.getBoundingClientRect());
  const inside = bs.every((r) => r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5 && r.width >= 40 && r.height >= 40);
  let clash = false;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) clash = true;
  }
  return { n: bs.length, inside, clash };
}, sel);

/* ---------- desktop ---------- */
{
  const page = await T.open({ w: 1280, h: 720 });
  await T.enter(page);
  await sleep(300);
  const pad = await page.evaluate(() => Array.from(document.querySelectorAll('.pad .pb')).map((b) => b.textContent.replace(/\s+/g, '')));
  ok(pad.join('|').includes('말') && pad.some((t) => t.startsWith('기술')) && pad.some((t) => t.startsWith('브릿지')) && pad.some((t) => t.startsWith('스탠드업')), 'pad has talk, techniques, bridge, stand-up', pad.join(' '));
  // the say list
  await page.click('.pb[data-pop="say"]');
  ok(await vis(page, '#pop-say'), 'the talk button opens its list');
  const says = await page.evaluate(() => Array.from(document.querySelectorAll('#pop-say button')).map((b) => b.firstChild.textContent));
  ok(says[0] === '안녕하세요.' && says[1] === '한판 하실래요?' && says[2] === '내일봐요', 'the three phrases are the ones asked for', says.join(' / '));
  let lay = await laidOut(page, '#pop-say');
  ok(lay.n === 5 && lay.inside && !lay.clash, 'talk list is laid out', JSON.stringify(lay));
  await shot(page, 'pad-say-desktop');
  await page.click('#pop-say button[data-say="0"]');
  ok(!(await vis(page, '#pop-say')), 'choosing a phrase closes the list');
  ok(await until(page, () => !!window.__bjj.sim.char.bubble), 'a bubble appears over the player');
  const st = await page.evaluate(() => window.__bjj.sim.netState().say);
  ok(st > 0 && (st % 8) - 1 === 0, 'the phrase is published as a number', String(st));
  await sleep(500);
  await shot(page, 'pad-bubble');
  // keyboard (the game's own clock runs slower than the wall clock when frames are slow)
  const simT = (sec) => page.evaluate((s) => { const g = window.__bjj; window.__t0 = g.sim.t + s; }, sec).then(() => until(page, () => window.__bjj.sim.t >= window.__t0));
  await simT(1.1);
  await page.keyboard.press('KeyX');
  const st2 = await page.evaluate(() => window.__bjj.sim.netState().say);
  ok((st2 % 8) - 1 === 1 && st2 !== st, 'X says the second phrase', String(st2));
  // shaka
  await sleep(300);
  await page.keyboard.press('KeyV');
  ok(await until(page, () => window.__bjj.sim.p.act === 'shaka'), 'V does the shaka');
  await simT(0.8);
  await shot(page, 'pad-shaka');
  ok(await until(page, () => window.__bjj.sim.p.mode === 'free'), 'and it ends by itself');
  // techniques: refused away from a partner, offered next to one on the mat
  await page.click('.pb[data-pop="tech"]');
  ok(!(await vis(page, '#pop-tech')), 'no technique list without a partner');
  await page.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.name === '스파링 파트너');
    g.sim.p.x = n.x + 0.9; g.sim.p.z = n.z; g.sim.p.yaw = -Math.PI / 2;
  });
  ok(await until(page, () => document.querySelector('.pb[data-pop="tech"]').classList.contains('ready')), 'next to a partner on the mat the technique button lights up');
  await sleep(1600); // the bow on stepping onto the mat
  await page.click('.pb[data-pop="tech"]');
  ok(await vis(page, '#pop-tech'), 'and opens the list');
  lay = await laidOut(page, '#pop-tech');
  ok(lay.n === 8 && lay.inside && !lay.clash, 'technique list is laid out', JSON.stringify(lay));
  await shot(page, 'pad-tech-desktop');
  await page.click('#pop-tech button[data-act="guil"]');
  ok(await until(page, () => !!window.__bjj.sim.p.duel && window.__bjj.sim.p.duel.kind === 'guil'), 'choosing one starts the duel');
  ok(!(await vis(page, '#pop-tech')), 'the list is put away');
  await page.evaluate(() => window.__bjj.sim.cancelDuel());
  // timetable from the master
  await page.evaluate(() => { const g = window.__bjj; g.sim.p.x = 0; g.sim.p.z = -5.4; });
  ok(await until(page, () => document.querySelector('#b-main').textContent === '묻기'), 'by the master the big button asks');
  await sleep(1200);
  await page.click('#b-main');
  await page.click('#ask-time');
  ok(await vis(page, '#modal-time'), 'the timetable opens');
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#time-rows tr')).map((tr) => Array.from(tr.children).map((td) => td.textContent).join(' | ')));
  ok(rows.length === 3 && rows[0] === '월 · 화 | 오후 6시 · 7시 · 8시 | 드릴 → 기술 → 스파링' && rows[1] === '수 · 목 | 오후 6시 · 7시 · 8시 | 기술 → 스파링' && rows[2] === '금 | 오후 6시 · 7시 · 8시 | 오픈매트', 'the timetable rows', rows.join(' // '));
  ok((await page.evaluate(() => document.querySelector('#time-today').textContent)).startsWith('오늘('), 'with a line about today');
  await shot(page, 'pad-timetable');
  await page.click('#modal-time [data-close]');
  // the wall sign
  await page.evaluate(() => { const g = window.__bjj; g.sim.p.x = -10.4; g.sim.p.z = -6.3; g.cam.yaw = Math.PI / 2; g.cam.pitch = 0.1; g.cam.dist = 3.2; });
  ok(await until(page, () => document.querySelector('#chip').textContent === '시간표 보기'), 'the wall timetable offers itself');
  await sleep(1800);
  await shot(page, 'pad-timetable-wall');
  await page.close();
}

/* ---------- a phone held sideways, and an upright phone with the stage turned ---------- */
for (const [name, w, h, deg] of [['land', 640, 360, 0], ['small', 568, 320, 0], ['rot', 390, 844, 90], ['rot-small', 320, 568, 90]]) {
  const page = await T.open({ w, h, touch: true });
  await T.enter(page);
  await sleep(400);
  await page.evaluate(() => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.name === '스파링 파트너');
    g.sim.p.x = n.x + 0.9; g.sim.p.z = n.z; g.sim.p.yaw = -Math.PI / 2;
  });
  await until(page, () => document.querySelector('.pb[data-pop="tech"]').classList.contains('ready'));
  await sleep(1600);
  const press = (sel) => page.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 5, button: 0 })), sel);
  await press('.pb[data-pop="tech"]');
  ok(await vis(page, '#pop-tech'), `${name}: technique list opens`);
  let lay = await laidOut(page, '#pop-tech');
  ok(lay.n === 8 && lay.inside && !lay.clash, `${name}: technique list fits the screen`, JSON.stringify(lay));
  await shot(page, `pad-tech-${name}`, deg);
  await press('.pb[data-pop="say"]');
  ok(await vis(page, '#pop-say') && !(await vis(page, '#pop-tech')), `${name}: the talk list replaces it`);
  lay = await laidOut(page, '#pop-say');
  ok(lay.n === 5 && lay.inside && !lay.clash, `${name}: talk list fits the screen`, JSON.stringify(lay));
  await shot(page, `pad-say-${name}`, deg);
  await press('#pop-say button[data-say="2"]');
  ok(await until(page, () => (window.__bjj.sim.netState().say % 8) - 1 === 2), `${name}: a touch says the phrase`);
  // no pad button covers another
  const clash = await page.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('.pad .pb')).map((b) => b.getBoundingClientRect());
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      const d = Math.hypot((a.left + a.right - b.left - b.right) / 2, (a.top + a.bottom - b.top - b.bottom) / 2);
      if (d < (a.width + b.width) / 2 - 1) return true;
    }
    return false;
  });
  ok(!clash, `${name}: pad buttons do not overlap`);
  await page.close();
}

await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
