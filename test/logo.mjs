// The two logo slots on the hosted copy: image files placed beside the page show for everyone,
// a visitor's own choice wins over them, and the empty files that ship with the page count as
// "no logo". Usage: node test/logo.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, sleep } from './page.mjs';
import { startBroker } from './broker.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bjj-logo-'));
// plain test images: a red one "placed by the owner", a blue one "chosen by the visitor"
execFileSync('python3', ['-c', `
import sys
from PIL import Image
Image.new('RGB', (300, 200), (220, 20, 20)).save(sys.argv[1])
Image.new('RGB', (200, 200), (20, 40, 220)).save(sys.argv[2])
`, path.join(tmp, 'site.png'), path.join(tmp, 'mine.png')]);

const br = await startBroker();
const T = await launch({ web: true });
let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};
const query = `?relay=ws://127.0.0.1:${br.port}`;
// what the first banner of a slot shows: the colour in its middle, and where the image came from
const look = (page) => page.evaluate(() => {
  const g = window.__bjj;
  const read = (kind) => {
    const img = g.logos[kind];
    const s = g.world && g.world.logoSlots[kind].find((x) => x.c);
    const px = s ? Array.from(s.c.getImageData(Math.round(s.W / 2), Math.round(s.H * 0.4), 1, 1).data).slice(0, 3) : null;
    return { src: img ? (img.src.startsWith('data:') ? 'data' : img.src.split('/').pop()) : null, px, slots: g.world ? g.world.logoSlots[kind].length : 0 };
  };
  return {
    gym: read('gym'), event: read('event'),
    gymNote: !document.querySelector('#logo-gym-note').hidden, gymClear: !document.querySelector('#logo-gym-clear').hidden,
    gymPrev: !document.querySelector('#logo-gym-prev').hidden,
  };
});
const red = (px) => px && px[0] > 180 && px[1] < 80 && px[2] < 80;
const blue = (px) => px && px[2] > 180 && px[0] < 80;

/* the page as shipped: empty placeholder files */
{
  const page = await T.open({ w: 900, h: 600, query });
  await T.enter(page);
  await sleep(400);
  const s = await look(page);
  ok(s.gym.src === null && s.event.src === null, 'the empty files that ship with the page are not used as logos', `${s.gym.src} ${s.event.src}`);
  ok(s.gym.slots >= 3 && !red(s.gym.px), `the dojo has ${s.gym.slots} places for its logo, showing the plain banner`);
  await page.close();
}

/* the owner replaced logo-gym.png */
T.extra.set('/logo-gym.png', { type: 'image/png', body: fs.readFileSync(path.join(tmp, 'site.png')) });
{
  const page = await T.open({ w: 900, h: 600, query });
  await T.enter(page);
  await sleep(500);
  let s = await look(page);
  ok(s.gym.src === 'logo-gym.png' && red(s.gym.px), 'a logo file beside the page is drawn on the dojo banner', `${s.gym.src} ${s.gym.px}`);
  ok(s.event.src === null, 'the other slot stays empty');
  ok(s.gymNote && !s.gymClear && s.gymPrev, 'the dialog says the site logo is in use');
  // the visitor picks an image of their own
  await (await page.$('#logo-gym')).uploadFile(path.join(tmp, 'mine.png'));
  // reading the file and drawing it takes a moment, longer on a slow machine
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    s = await look(page);
    if (s.gym.src === 'data') break;
  }
  ok(s.gym.src === 'data' && blue(s.gym.px), "the visitor's own image wins", `${s.gym.src} ${s.gym.px}`);
  ok(!s.gymNote && s.gymClear, 'and can be taken out again');
  // it is still theirs after a reload
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__bjj && window.__bjj.ok', { timeout: 20000 });
  await T.enter(page);
  await sleep(600);
  s = await look(page);
  ok(s.gym.src === 'data' && blue(s.gym.px), 'their choice is kept in their browser', `${s.gym.src} ${s.gym.px}`);
  await page.evaluate(() => document.querySelector('#logo-gym-clear').click());
  await sleep(300);
  s = await look(page);
  ok(s.gym.src === 'logo-gym.png' && red(s.gym.px), 'taking it out falls back to the site logo', `${s.gym.src} ${s.gym.px}`);
  // the other map shows the event slot
  await page.evaluate(() => document.querySelector('#m-place').click());
  await sleep(1200);
  s = await look(page);
  ok(s.event.slots >= 3 && s.event.src === null, `the arena has ${s.event.slots} places for the event logo`);
  await page.close();
}

await T.close();
await br.stop();
fs.rmSync(tmp, { recursive: true, force: true });
const real = T.errors.filter((e) => !/WebSocket|ERR_CONNECTION|net::/i.test(e));
if (real.length) { console.log('ERRORS:\n' + [...new Set(real)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
