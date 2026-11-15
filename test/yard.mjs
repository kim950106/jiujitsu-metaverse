// The dojo's folding doors, the sixth-floor terrace behind them and the apartment blocks: checks
// that the camera stays inside the room, the doorway or the terrace wherever the player stands and
// looks, and saves a sheet of pictures for checking the scene by eye, at a chosen hour of the day.
// Usage: node test/yard.mjs [w] [h] [hour]   (hour 12 by default; e.g. 18.3 for dusk, 21 for night)
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, shots, sleep } from './page.mjs';

const W = Number(process.argv[2] || 800);
const H = Number(process.argv[3] || 450);
const HOUR = Number(process.argv[4] || 12);
const TAG = process.argv[4] ? `-${process.argv[4]}` : '';
const T = await launch();
const page = await T.open({ w: W, h: H, touch: false, query: `?mock=1&h=${HOUR}` });
await T.enter(page);
await page.addStyleTag({ content: '#hud{display:none!important}' });
await T.freeze(page);
// [name, x, z, camera yaw, pitch, distance]
const VIEWS = [
  ['mat-to-doors', -5, -3.2, 0, 0.22, 5.5],
  ['doorway', -4.8, -7.6, 0, 0.2, 4.2],
  ['lawn-default', -5, -13, 0, 0.3, 4.6],
  ['lawn-north', -5, -15, 0.25, 0.1, 6],
  ['lawn-up', -5, -16, 0.1, -0.3, 5],
  ['lawn-back', -5, -17, Math.PI, 0.2, 6.5],
  ['lawn-west', -3, -15, -Math.PI / 2, 0.12, 6],
  ['lawn-east', -8, -15, Math.PI / 2, 0.12, 6],
  ['lawn-high', -5, -15, 0.5, 0.75, 9],
  ['edge-down', -5, -22.4, 0.05, 0.62, 3.4],
  ['open-mat', -10.5, -17.2, 0.6, 0.32, 5.2],
  ['corner', 4.5, -20.5, 0.9, 0.2, 5],
];
const files = [];
for (const [name, x, z, yaw, pitch, dist] of VIEWS) {
  const info = await page.evaluate((v) => {
    const g = window.__bjj;
    const p = g.sim.p;
    p.x = v.x; p.z = v.z; p.y = 0; p.yaw = Math.PI + v.yaw;
    g.cam.yaw = v.yaw; g.cam.pitch = v.pitch; g.cam.dist = v.dist; g.cam.eff = v.dist;
    window.__adv(0.5);
    g.cam.tgt.set(p.x, p.y + 1.05, p.z);
    const r = g.renderer.info.render;
    return { calls: r.calls, tris: r.triangles, zone: document.querySelector('#zone').textContent, y: p.y.toFixed(2) };
  }, { x, z, yaw, pitch, dist });
  await sleep(450);
  const f = path.join(shots, `_y-${name}.png`);
  await page.screenshot({ path: f });
  files.push(f);
  console.log(name.padEnd(14), JSON.stringify(info));
}
const sheet = path.join(shots, `yard${TAG}.png`);
execFileSync('python3', ['-c', `
import sys
from PIL import Image
files = sys.argv[2:]
cols = 3
rows = (len(files) + cols - 1) // cols
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
sheet = Image.new('RGB', (cols * w, rows * h), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(sys.argv[1])
`, sheet, ...files]);
console.log(`saved shots/yard${TAG}.png`);
const skyNow = await page.evaluate(() => { const s = window.__bjj.world.sky; return { hour: s.hour, night: s.night, dark: s.dark }; });
console.log('sky', JSON.stringify(skyNow));

/* ---------- the camera never leaves the places it may be ---------- */
let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};
const sweep = await page.evaluate(() => {
  const g = window.__bjj;
  const p = g.sim.p;
  const boxes = g.world.cam.boxes;
  const inside = (c) => boxes.some((b) => c.x >= b.minX - 0.02 && c.x <= b.maxX + 0.02 && c.z >= b.minZ - 0.02 && c.z <= b.maxZ + 0.02 && c.y <= (b.ceil || b.maxY) + 0.02);
  const spots = [];
  for (let x = -11; x <= 11; x += 2.75) for (let z = -7; z <= 7; z += 3.5) spots.push([x, z]); // the room
  for (let x = -8; x <= -1.5; x += 1.3) for (const z of [-7.6, -8.0, -8.4, -8.9]) spots.push([x, z]); // the doorway
  for (let x = -16.5; x <= 6.5; x += 2.875) for (let z = -22.5; z <= -9; z += 2.7) spots.push([x, z]); // the lawn
  let n = 0;
  const bad = [];
  let lowest = 9;
  for (const [x, z] of spots) {
    for (let k = 0; k < 8; k++) {
      for (const [pitch, dist] of [[0.3, 4.6], [-0.3, 6], [0.9, 9], [0.1, 11]]) {
        p.x = x; p.z = z; p.y = 0;
        g.cam.yaw = (k * Math.PI) / 4 + 0.13;
        g.cam.pitch = pitch;
        g.cam.dist = dist;
        g.cam.eff = dist;
        g.cam.lid = null;
        g.cam.tgt.set(x, 1.05, z);
        g._camera(1 / 60);
        const c = g.camera.position;
        n++;
        lowest = Math.min(lowest, c.y);
        if (!inside(c) || !Number.isFinite(c.x + c.y + c.z)) bad.push(`player ${x},${z} yaw ${k} pitch ${pitch}: camera ${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}`);
      }
    }
  }
  // looking out through the doorway from the mat, and in from the lawn, the view is not pulled short
  const reach = (x, z, yaw) => {
    p.x = x; p.z = z; g.cam.yaw = yaw; g.cam.pitch = 0.3; g.cam.dist = 4.6; g.cam.eff = 4.6; g.cam.lid = null;
    g.cam.tgt.set(x, 1.05, z);
    g._camera(1 / 60);
    return Math.hypot(g.camera.position.x - x, g.camera.position.z - z);
  };
  return { n, bad: bad.slice(0, 6), count: bad.length, lowest, out: reach(-5, -10.5, 0), back: reach(-5, -6.2, Math.PI), wall: reach(-14, -9.2, 0) };
});
ok(sweep.count === 0, `camera stays in the room, the doorway or the lawn in ${sweep.n} poses`, sweep.bad.join(' | '));
ok(sweep.lowest >= 0.29, 'and never dips under the floor', sweep.lowest.toFixed(2));
ok(sweep.out > 3.8, 'from the deck the camera backs into the room through the doorway', sweep.out.toFixed(2));
ok(sweep.back > 3.8, 'from the mat it backs out onto the deck', sweep.back.toFixed(2));
ok(sweep.wall < 1.2, 'beside the wall it stays outside', sweep.wall.toFixed(2));


/* ---------- the other map still has one box: the same rule must hold there ---------- */
await page.evaluate(() => document.querySelector('#m-place').click());
await sleep(1500);
const hall = await page.evaluate(() => {
  const g = window.__bjj;
  const p = g.sim.p;
  const b = g.world.cam;
  let n = 0;
  let bad = 0;
  let longest = 0;
  for (let x = b.minX + 1; x <= b.maxX - 1; x += (b.maxX - b.minX - 2) / 7) {
    for (let z = b.minZ + 1; z <= b.maxZ - 1; z += (b.maxZ - b.minZ - 2) / 5) {
      for (let k = 0; k < 8; k++) {
        for (const [pitch, dist] of [[0.3, 4.6], [1.1, 11], [-0.3, 7]]) {
          p.x = x; p.z = z; p.y = 0;
          g.cam.yaw = (k * Math.PI) / 4 + 0.2; g.cam.pitch = pitch; g.cam.dist = dist; g.cam.eff = dist; g.cam.lid = null;
          g.cam.tgt.set(x, 1.05, z);
          g._camera(1 / 60);
          const c = g.camera.position;
          n++;
          longest = Math.max(longest, Math.hypot(c.x - x, c.y - 1.05, c.z - z));
          if (!(c.x >= b.minX - 0.02 && c.x <= b.maxX + 0.02 && c.z >= b.minZ - 0.02 && c.z <= b.maxZ + 0.02 && c.y <= b.maxY + 0.02 && c.y >= 0.29)) bad++;
        }
      }
    }
  }
  return { name: g.world.name, boxes: !!b.boxes, n, bad, longest };
});
ok(hall.name === 'arena' && !hall.boxes && hall.bad === 0 && hall.longest > 10.5, `arena: camera stays in the hall in ${hall.n} poses and still reaches full distance`, `bad ${hall.bad}, longest ${hall.longest.toFixed(2)}`);

await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
