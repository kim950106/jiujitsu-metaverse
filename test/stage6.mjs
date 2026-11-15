// The points match, the shrimp race and the group photo as they appear on the page: the match bar,
// the race strip, the countdown, the picture. Saves pictures to shots/. Usage: node test/stage6.mjs
import fs from 'node:fs';
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
const until = (page, fn, arg, ms = 12000) => page.waitForFunction(fn, { timeout: ms, polling: 30 }, arg).then(() => true, () => false);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const toasts = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#toasts > *')).map((t) => t.textContent).join(' | '));
const toPartner = (page) => page.evaluate(() => {
  const g = window.__bjj;
  const n = g.world.npcs.find((x) => x.name === '스파링 파트너');
  g.sim.p.x = n.home.x + 0.9; g.sim.p.z = n.home.z; g.sim.p.yaw = -Math.PI / 2; g.sim.p.y = 0;
});
// the rectangle of an element on the screen
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
const apart = (a, b) => !a || !b || a.r <= b.l + 1 || b.r <= a.l + 1 || a.b <= b.t + 1 || b.b <= a.t + 1;
const inside = (a, w, h) => !!a && a.l >= -0.5 && a.t >= -0.5 && a.r <= w + 0.5 && a.b <= h + 0.5;
// one round of a match against the NPC: the NPC throws scissors, the player the hand given
const round = async (T2, page, hand, press) => {
  await T2.adv(page, 0.05);
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => { const d = window.__bjj.sim.p.duel; return !!d && d.phase === 'pick' && !d.pick; })) break;
    await T2.adv(page, 0.1);
  }
  await press(hand);
  await T2.adv(page, 0.1);
};

/* ---------- desktop: a whole match against the partner ---------- */
{
  const page = await T.open({ w: 1280, h: 720 });
  await T.enter(page);
  await T.freeze(page);
  await toPartner(page);
  await T.adv(page, 2.4); // the bow on stepping onto the mat
  await toPartner(page);
  await T.adv(page, 0.3);
  await page.evaluate(() => { const g = window.__bjj; g.sim.npcPick = () => 's'; g.sim.npcMash = () => 0; g.cam.yaw = Math.PI; g.cam.pitch = 0.42; g.cam.dist = 3.6; });
  ok(!(await vis(page, '#matchbar')), 'no match bar outside a match');
  await page.click('.pb[data-pop="tech"]');
  ok((await txt(page, '#pop-tech button[data-act="match"]')).startsWith('한 판'), 'the technique list offers a match');
  await page.click('#pop-tech button[data-act="match"]');
  ok(await page.evaluate(() => { const d = window.__bjj.sim.p.duel; return !!d && d.kind === 'match' && d.phase === 'intro'; }), 'choosing it starts a match');
  ok(await vis(page, '#matchbar') && !(await vis(page, '#rps')), 'during the bow: the bar is up, no hands yet');
  ok((await txt(page, '#mt-clock')) === '1:12' && (await txt(page, '#mt-pos')) === '스탠딩' && (await txt(page, '#mt-name')) === '스파링 파트너', 'the bar shows the clock, the position and the name', `${await txt(page, '#matchbar')}`);
  await T.adv(page, 1.6);
  ok(await vis(page, '#rps') && !(await vis(page, '#rps-title')), 'then the hands, as a strip without a title');
  ok((await txt(page, '#rps-status')) === '이기면 다음 포지션!' && (await txt(page, '#rps-cancel')) === '기권', 'with what the round is for, and a way to give up', await txt(page, '#rps-status'));
  const bar = await rect(page, '#matchbar');
  const panel = await rect(page, '#rps');
  ok(apart(bar, panel) && inside(bar, 1280, 720) && inside(panel, 1280, 720) && panel.t > 720 * 0.7 && panel.b - panel.t < 130, 'the strip sits low and leaves the middle of the screen free', JSON.stringify(panel));
  // the two bodies are drawn above the strip
  const feet = await page.evaluate(() => {
    const g = window.__bjj;
    const out = [];
    for (const o of [g.sim.p, g.world.npcs.find((x) => x.name === '스파링 파트너')]) {
      const v = new THREE.Vector3(o.x, 0.04, o.z).project(g.camera);
      out.push(Math.round((1 - v.y) / 2 * window.innerHeight));
    }
    return out;
  });
  ok(feet.every((y) => y < panel.t), 'both stand above it on the screen', `feet at ${feet.join(', ')} px, strip from ${Math.round(panel.t)}`);
  await sleep(300);
  await shot(page, 's6-match-pick');
  const click = (hand) => page.click(`.hand[data-hand="${hand}"]`);
  await click('r');
  await T.adv(page, 0.1);
  ok((await txt(page, '#rps-status')) === '이겼습니다!', 'a won round is told', await txt(page, '#rps-status'));
  await T.adv(page, 1.4);
  ok(!(await vis(page, '#rps')) && (await txt(page, '#mt-pos')) === '가드 · 내가 위', 'while the position is taken the hands are put away', await txt(page, '#mt-pos'));
  await T.adv(page, 2.1);
  ok((await txt(page, '#mt-me')) === '2' && (await txt(page, '#mt-them')) === '0', 'two points for the takedown', await txt(page, '#matchbar'));
  await sleep(400);
  await shot(page, 's6-match-guard');
  await round(T, page, 'r', click);
  await T.adv(page, 3.5);
  ok((await txt(page, '#mt-me')) === '5' && (await txt(page, '#mt-pos')) === '사이드 컨트롤 · 내가 위', 'guard pass: five points, side control', await txt(page, '#matchbar'));
  await page.evaluate(() => { const g = window.__bjj; g.cam.yaw = Math.PI * 0.8; });
  await sleep(400);
  await shot(page, 's6-match-side');
  await round(T, page, 'r', click);
  await T.adv(page, 3.5);
  ok((await txt(page, '#mt-me')) === '9' && (await txt(page, '#mt-pos')) === '마운트 · 내가 위', 'mount: nine points', await txt(page, '#matchbar'));
  await sleep(400);
  await shot(page, 's6-match-mount');
  // being swept, seen from underneath
  await page.evaluate(() => { window.__bjj.sim.npcPick = () => 'p'; });
  await round(T, page, 'r', click);
  await T.adv(page, 3.5);
  ok((await txt(page, '#mt-them')) === '2' && (await txt(page, '#mt-pos')) === '가드 · 상대가 위', 'swept: two points to the partner', await txt(page, '#matchbar'));
  await sleep(400);
  await shot(page, 's6-match-under');
  await page.evaluate(() => { window.__bjj.sim.npcPick = () => 's'; });
  await round(T, page, 'r', click); await T.adv(page, 3.5);
  await round(T, page, 'r', click); await T.adv(page, 3.5);
  await round(T, page, 'r', click); await T.adv(page, 3.5);
  ok((await txt(page, '#mt-me')) === '18' && (await txt(page, '#mt-pos')) === '마운트 · 내가 위', 'sweep, pass, mount: 18 : 2', await txt(page, '#matchbar'));
  // the finish
  await round(T, page, 'r', click);
  await T.adv(page, 1.5);
  ok(await page.evaluate(() => window.__bjj.sim.p.mode === 'bout' && window.__bjj.sim.p.bout.ground), 'the next win from the mount goes for the finish');
  ok(!(await vis(page, '#rps')) && (await txt(page, '#mt-pos')) === '서브미션!', 'the bar says so', await txt(page, '#mt-pos'));
  await T.adv(page, 0.5);
  await sleep(300);
  await shot(page, 's6-match-sub-start');
  await T.adv(page, 0.7);
  ok(await vis(page, '#mash') && (await txt(page, '#mash-text')) === '연타해서 조이세요!' && (await txt(page, '#b-main')) === '연타!', 'the struggle strip appears, with its own labels', `${await txt(page, '#mash')}`);
  ok((await txt(page, '#mash-l')) === '탈출' && (await txt(page, '#mash-r')) === '탭' && await vis(page, '#mash-timewrap'), 'escape on one end, tap on the other, time bar below');
  ok(apart(await rect(page, '#mash'), await rect(page, '#matchbar')), 'strip and bar do not cover each other');
  await page.click('#b-main');
  await T.adv(page, 0.8);
  await sleep(300);
  await shot(page, 's6-match-sub');
  await T.adv(page, 2.2);
  ok(await until(page, () => /탭!/.test(document.querySelector('#flash').textContent)), 'the tap is flashed');
  await T.adv(page, 5.2);
  ok((await txt(page, '#mt-pos')) === '승리' && /한 판 종료 · 나 승 ·/.test(await toasts(page)), 'the match ends with the tap', `${await txt(page, '#mt-pos')} / ${await toasts(page)}`);
  ok((await txt(page, '#flash')) === '승리!', 'and the win is flashed');
  await T.adv(page, 0.8);
  await sleep(400);
  await shot(page, 's6-match-win');
  await T.adv(page, 4.2);
  ok(!(await vis(page, '#matchbar')) && !(await vis(page, '#rps')) && await page.evaluate(() => window.__bjj.sim.p.mode === 'free'), 'afterwards the bar is gone');
  ok(!(await vis(page, '#streak')) || /연승/.test(await txt(page, '#streak')), 'streak badge is consistent');

  /* the race */
  await page.evaluate(() => { const g = window.__bjj; const R = g.world.race; g.sim.p.x = R.x0 + 0.9; g.sim.p.z = (R.z0 + R.z1) / 2; g.sim.p.yaw = -Math.PI / 2; g.cam.yaw = Math.PI; g.cam.pitch = 0.5; g.cam.dist = 6.5; });
  await T.adv(page, 0.3);
  ok((await txt(page, '#b-main')) === '경주' && (await txt(page, '#chip')) === '새우빼기 경주 시작 · 6 m', 'at the lane the big button starts a race', `${await txt(page, '#b-main')} / ${await txt(page, '#chip')}`);
  await sleep(500);
  await shot(page, 's6-lane');
  await page.click('#b-main');
  ok(await page.evaluate(() => window.__bjj.sim.p.mode === 'race'), 'pressing it lies the racer down');
  await T.adv(page, 0.05);
  ok(await vis(page, '#mash') && (await txt(page, '#mash-text')) === '새우빼기 경주 · 준비' && (await txt(page, '#b-main')) === '준비', 'the strip and the button say: ready', `${await txt(page, '#mash')} / ${await txt(page, '#b-main')}`);
  ok((await txt(page, '#mash-l')) === '출발' && (await txt(page, '#mash-r')) === '도착 6 m' && !(await vis(page, '#mash-timewrap')), 'the strip is relabelled for the race');
  ok((await txt(page, '#flash')) === '3', 'the count starts at three', await txt(page, '#flash'));
  await sleep(250);
  await shot(page, 's6-race-count');
  await T.adv(page, 1.0);
  ok((await txt(page, '#flash')) === '2', 'two');
  await T.adv(page, 1.0);
  ok((await txt(page, '#flash')) === '1', 'one');
  await T.adv(page, 1.0);
  ok((await txt(page, '#flash')) === '출발!' && (await txt(page, '#b-main')) === '새우!' && await page.evaluate(() => document.querySelector('#b-main').classList.contains('hot')), 'go: the button is the shrimp button now', `${await txt(page, '#flash')} / ${await txt(page, '#b-main')}`);
  for (let i = 0; i < 6; i++) { await page.click('#b-main'); await T.adv(page, 0.2); }
  const half = await page.evaluate(() => parseFloat(document.querySelector('#mash-bar').style.width));
  ok(half > 15 && half < 80 && /^새우빼기 경주 · \d\.\d초$/.test(await txt(page, '#mash-text')), 'the strip shows the way covered and the time', `${half}% / ${await txt(page, '#mash-text')}`);
  await sleep(300);
  await shot(page, 's6-race');
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => { const r = window.__bjj.sim.p.race; return !r || r.phase !== 'go'; })) break;
    await page.keyboard.press('Space');
    await T.adv(page, 0.15);
  }
  ok(/완주! \d+\.\d\d초 · 새우빼기 \d+번 · 내 최고 기록!/.test(await toasts(page)), 'the finish is told with the time', await toasts(page));
  const best = await page.evaluate(() => localStorage.getItem('bjjmeta.race'));
  ok(parseFloat(best) > 1.5 && parseFloat(best) < 12, 'the best time is kept in this browser', String(best));
  await T.adv(page, 1.6);
  ok(!(await vis(page, '#mash')) && await page.evaluate(() => window.__bjj.sim.p.mode === 'free'), 'and the strip is put away');
  ok((await txt(page, '#mash-l')) === '출발', 'labels stay until the next use');

  /* the photo */
  await page.evaluate(() => { const g = window.__bjj; const n = g.world.npcs.find((x) => x.name === '스파링 파트너'); g.sim.p.x = n.x + 1.1; g.sim.p.z = n.z + 0.3; g.sim.p.yaw = 0; g.cam.yaw = 0; g.cam.pitch = 0.2; g.cam.dist = 3.4; });
  await T.adv(page, 0.3);
  await page.keyboard.press('KeyV'); // a shaka for the picture
  await T.adv(page, 0.5);
  await page.keyboard.press('KeyP');
  ok(await page.evaluate(() => window.__bjj.sim.netState().photo === 1), 'P calls a photo, and the others are told');
  ok(/단체 사진을 찍습니다. 포즈!/.test(await toasts(page)), 'with a notice here');
  ok(await until(page, () => /^[321]$/.test(document.querySelector('#flash').textContent) && !document.querySelector('#flash').hidden, null, 4000), 'a countdown is shown');
  ok(await until(page, () => !document.querySelector('#modal-photo').hidden, null, 20000), 'after it the picture is shown');
  const pic = await page.evaluate(async () => {
    const img = document.querySelector('#photo-img');
    if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < lo) lo = v; if (v > hi) hi = v; }
    // the caption strip along the bottom: dark, with light letters in it
    const y0 = Math.round(c.height * 0.95);
    const row = x.getImageData(0, y0, c.width, 1).data;
    let dark = 0, light = 0;
    for (let i = 0; i < row.length; i += 4) { const v = row[i] + row[i + 1] + row[i + 2]; if (v < 160) dark++; if (v > 500) light++; }
    return { w: c.width, h: c.height, lo, hi, dark: dark / c.width, light, src: img.src.slice(0, 5), name: document.querySelector('#photo-save').dataset.name, data: c.toDataURL('image/png') };
  });
  ok(pic.w === 1600 && pic.h === 900 && pic.hi - pic.lo > 200, 'the picture is the 3D view, 1600 wide, not an empty one', `${pic.w}x${pic.h}, range ${pic.lo}..${pic.hi}`);
  ok(await page.evaluate(() => { const c = document.querySelector('#scene'); return c.width === 1280 && c.height === 720; }), 'and the screen picture is back at its own size afterwards');
  ok(pic.dark > 0.5 && pic.light > 8, 'with a caption strip along the bottom', `dark ${pic.dark.toFixed(2)}, light ${pic.light}`);
  ok(/^jiujitsu-\d{8}-\d{4}\.png$/.test(pic.name) && (pic.src === 'blob:' || pic.src === 'data:'), 'and a file name for saving', `${pic.name} ${pic.src}`);
  fs.writeFileSync(path.join(shots, 's6-photo.png'), Buffer.from(pic.data.split(',')[1], 'base64'));
  console.log('saved s6-photo');
  const card = await rect(page, '#modal-photo .card');
  ok(inside(card, 1280, 720), 'the picture dialog fits the screen');
  await sleep(300);
  await shot(page, 's6-photo-dialog');
  await page.click('#modal-photo [data-close]');
  ok(!(await vis(page, '#modal-photo')), 'it closes');
  // from the list and from the menu
  await page.click('.pb[data-pop="say"]');
  ok((await txt(page, '#pop-say button[data-photo]')).includes('단체 사진'), 'the talk list has the photo button too');
  await page.click('#pop-say button[data-photo]');
  ok(await page.evaluate(() => window.__bjj.sim.netState().photo === 2), 'and it calls a photo as well');
  ok(await until(page, () => !document.querySelector('#modal-photo').hidden, null, 20000), 'which is shown again');
  await page.click('#modal-photo [data-close]');
  await page.close();
}

/* ---------- phones: nothing of this covers the stick or the buttons ---------- */
for (const [name, w, h, deg] of [['land', 640, 360, 0], ['small', 568, 320, 0], ['rot', 390, 844, 90]]) {
  const page = await T.open({ w, h, touch: true });
  await T.enter(page);
  await T.freeze(page);
  await toPartner(page);
  await T.adv(page, 2.4);
  await toPartner(page);
  await T.adv(page, 0.3);
  await page.evaluate(() => { const g = window.__bjj; g.sim.npcPick = () => 's'; g.sim.npcMash = () => 0; g.cam.yaw = Math.PI; g.cam.pitch = 0.42; g.cam.dist = 3.6; });
  const press = (sel) => page.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 5, button: 0 })), sel);
  const hand = (k) => press(`.hand[data-hand="${k}"]`);
  // on a turned stage the screen is the stage's own box
  const W = deg ? h : w;
  const H = deg ? w : h;
  const box = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e || e.hidden || !e.getClientRects().length) return null;
    // position inside the stage, in the stage's own (unturned) pixels
    let x = 0, y = 0, n = e;
    while (n && n.id !== 'stage') { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const cs = getComputedStyle(e);
    const m = cs.transform && cs.transform !== 'none' ? new DOMMatrixReadOnly(cs.transform) : null;
    if (m) { x += m.m41; y += m.m42; }
    return { l: x, t: y, r: x + e.offsetWidth, b: y + e.offsetHeight };
  }, sel);
  await press('.pb[data-pop="tech"]');
  await press('#pop-tech button[data-act="match"]');
  ok(await page.evaluate(() => { const d = window.__bjj.sim.p.duel; return !!d && d.kind === 'match'; }), `${name}: a match starts from the list`);
  await T.adv(page, 2.6); // the bow, and the picture has finished lifting
  let bar = await box('#matchbar');
  const panel = await box('#rps');
  ok(inside(bar, W, H) && inside(panel, W, H), `${name}: bar and hands are on the screen`, JSON.stringify({ bar, panel }));
  ok(apart(bar, panel), `${name}: the bar is not under the hands`, JSON.stringify({ bar, panel }));
  const techB = await box('.pb[data-pop="tech"]');
  const baseB = await box('#stick-base');
  const sayB = await box('.pb[data-pop="say"]');
  ok(apart(panel, techB) && apart(panel, sayB) && (!baseB || apart(panel, baseB)) && panel.b - panel.t < 118, `${name}: the hands strip fits between the stick and the buttons`, JSON.stringify({ panel, techB, sayB, baseB }));
  const oneLine = await page.evaluate(() => { const e = document.querySelector('#rps-status'); return e.getClientRects().length === 1 && e.offsetHeight < 24; });
  ok(oneLine, `${name}: its line of text does not wrap`);
  const hands = await page.evaluate(() => Array.from(document.querySelectorAll('.hand')).map((b) => [b.offsetWidth, b.offsetHeight]));
  ok(hands.every(([hw, hh]) => hw >= 52 && hh >= 44), `${name}: each hand is big enough for a thumb`, JSON.stringify(hands));
  const lifted = await page.evaluate(() => {
    const g = window.__bjj;
    const v = new THREE.Vector3(g.sim.p.x, 0.04, g.sim.p.z).project(g.camera);
    return { y: (1 - v.y) / 2, lift: g.liftNow };
  });
  ok(lifted.lift > 0.1 && lifted.y * H < panel.t, `${name}: the picture is lifted so the bodies clear the strip`, JSON.stringify(lifted));
  await sleep(250);
  await shot(page, `s6-${name}-pick`, deg);
  await hand('r');
  await T.adv(page, 3.6);
  bar = await box('#matchbar');
  const main = await box('#b-main');
  const base = await box('#stick-base');
  ok(apart(bar, main) && (!base || apart(bar, base)), `${name}: the bar keeps clear of the big button and the stick`, JSON.stringify({ bar, main, base }));
  bar = await box('#matchbar');
  ok(bar && bar.b - bar.t < 36 && (await txt(page, '#mt-short')) === '가드' && await page.evaluate(() => document.querySelector('#matchbar').dataset.top === 'me' && getComputedStyle(document.querySelector('#mt-pos')).display === 'none'), `${name}: the bar is one compact row with a short position name`, JSON.stringify(bar));
  await sleep(250);
  await shot(page, `s6-${name}-guard`, deg);
  for (let i = 0; i < 2; i++) { await round(T, page, 'r', hand); await T.adv(page, 3.5); }
  await round(T, page, 'r', hand);
  await T.adv(page, 1.4);
  ok(await page.evaluate(() => window.__bjj.sim.p.mode === 'bout'), `${name}: mount and finish`);
  await T.adv(page, 1.2);
  const mash = await box('#mash');
  bar = await box('#matchbar');
  ok(inside(mash, W, H) && apart(mash, bar) && apart(mash, main), `${name}: the struggle strip sits clear of the bar and the big button`, JSON.stringify({ mash, bar, main }));
  await sleep(250);
  await shot(page, `s6-${name}-sub`, deg);
  await page.evaluate(() => window.__bjj.sim.p.bout && (window.__bjj.sim.p.bout.cancel = true));
  await T.adv(page, 0.2);
  await page.evaluate(() => window.__bjj.sim.cancelDuel());
  await T.adv(page, 2.5);
  // the race strip
  await page.evaluate(() => { const g = window.__bjj; const R = g.world.race; g.sim.p.x = R.x0 + 0.9; g.sim.p.z = (R.z0 + R.z1) / 2; g.cam.yaw = Math.PI; g.cam.pitch = 0.5; g.cam.dist = 6.5; });
  await T.adv(page, 0.3);
  await press('#b-main');
  await T.adv(page, 3.1);
  for (let i = 0; i < 5; i++) { await press('#b-main'); await T.adv(page, 0.2); }
  const strip = await box('#mash');
  ok(inside(strip, W, H) && apart(strip, main) && (await txt(page, '#b-main')) === '새우!', `${name}: the race strip is on the screen, clear of the button`, JSON.stringify({ strip, main }));
  await sleep(250);
  await shot(page, `s6-${name}-race`, deg);
  await page.evaluate(() => window.__bjj.sim._endRace());
  // the photo dialog
  await press('.pb[data-pop="say"]');
  await press('#pop-say button[data-photo]');
  ok(await until(page, () => !document.querySelector('#modal-photo').hidden, null, 25000), `${name}: a photo from the talk list`);
  const card = await box('#modal-photo .card');
  const img = await page.evaluate(() => { const i = document.querySelector('#photo-img'); return { w: i.naturalWidth, h: i.naturalHeight, cw: i.clientWidth, ch: i.clientHeight }; });
  ok(inside(card, W, H) && img.w === 1600 && img.cw > 120, `${name}: the picture dialog fits, and the picture is sharp`, JSON.stringify({ card, img }));
  const btns = await page.evaluate(() => {
    const c = document.querySelector('#modal-photo .card');
    return { scroll: c.scrollHeight - c.clientHeight, n: Array.from(c.querySelectorAll('.rowbtn button')).filter((b) => !b.hidden && b.offsetHeight >= 30).length };
  });
  ok(btns.scroll <= 1 && btns.n >= 3, `${name}: with every button in view without scrolling`, JSON.stringify(btns));
  await sleep(300);
  await shot(page, `s6-${name}-photo`, deg);
  await page.close();
}

/* ---------- inside a claude.ai page: no download or share of the page's own; the file is handed over ---------- */
{
  const page = await T.open({
    w: 900, h: 506,
    init: () => {
      window.__saved = [];
      window.__asked = [];
      window.claude = {
        use: (name) => {
          window.__asked.push(name);
          if (name !== 'downloads') return Promise.resolve(null);
          return new Promise((r) => setTimeout(() => r({ save: (o) => { window.__saved.push({ name: o.filename, size: o.data.size, type: o.data.type }); return Promise.resolve({ status: 'saved' }); } }), 300));
        },
      };
    },
  });
  await T.enter(page);
  ok(await page.evaluate(() => window.__bjj.net.mode !== 'claude' && window.__asked.includes('room')), 'framed page: the room was asked for and, refused, is not used');
  await page.keyboard.press('KeyP');
  ok(await until(page, () => !document.querySelector('#modal-photo').hidden, null, 25000), 'framed page: the picture is taken');
  ok(await until(page, () => !document.querySelector('#photo-save').hidden, null, 5000) && await page.evaluate(() => document.querySelector('#photo-share').hidden), 'framed page: save appears once the frame offers it, share is not offered');
  ok((await txt(page, '#photo-note')) === '저장을 누르면 저장할지 묻는 창이 뜹니다.', 'framed page: the note says a prompt will come');
  await page.click('#photo-save');
  ok(await until(page, () => window.__saved.length === 1, null, 5000), 'framed page: pressing save hands the file to the frame');
  const sv = await page.evaluate(() => window.__saved[0]);
  ok(/^jiujitsu-\d{8}-\d{4}\.png$/.test(sv.name) && sv.size > 20000 && sv.type === 'image/png', 'framed page: a PNG with a file name', JSON.stringify(sv));
  ok(/사진을 저장했습니다/.test(await toasts(page)), 'framed page: and says so');
  await page.close();
}
{
  // a frame that offers no way to save
  const page = await T.open({ w: 900, h: 506, init: () => { window.claude = { use: () => Promise.resolve(null) }; } });
  await T.enter(page);
  await page.keyboard.press('KeyP');
  ok(await until(page, () => !document.querySelector('#modal-photo').hidden, null, 25000), 'frame without saving: the picture is still shown');
  await sleep(600);
  ok(await page.evaluate(() => document.querySelector('#photo-save').hidden && document.querySelector('#photo-share').hidden) && /길게 누르거나/.test(await txt(page, '#photo-note')), 'frame without saving: no dead buttons, only the hint to press and hold');
  await page.close();
}

const bad = T.errors.filter((e) => !/favicon|logo-(gym|event)\.png|Failed to load resource/.test(e));
ok(bad.length === 0, 'no page errors', bad.slice(0, 4).join(' ; '));
await T.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
