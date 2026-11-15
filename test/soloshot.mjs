// Contact sheet of the solo drills (bridge, technical stand-up, shaka), for checking by eye.
// Usage: node test/soloshot.mjs [act,act]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, root, shots, sleep } from './page.mjs';

const acts = (process.argv[2] || 'bridge,standup').split(',');
const TIMES = { bridge: [0.2, 0.45, 0.7, 1.05, 1.6, 1.85], standup: [0.3, 0.8, 1.2, 1.5, 1.8, 2.2], shaka: [0.2, 0.5, 0.9, 1.3] };
const W = 300;
const Hh = 240;
const T = await launch();
const page = await T.open({ w: W, h: Hh });
await T.enter(page);
await page.addStyleTag({ content: '#hud{display:none!important}' });
await T.freeze(page);
for (const act of acts) {
  const files = [];
  for (const [vi, off] of [[0, Math.PI / 2], [1, 0.5]]) {
    await page.evaluate((a) => {
      const g = window.__bjj;
      const p = g.sim.p;
      p.x = -6; p.z = -5; p.yaw = Math.PI / 2;
      window.__adv(3);
      g.sim.doAction(a);
    }, act);
    let t = 0;
    for (const at of TIMES[act]) {
      await T.adv(page, at - t);
      t = at;
      await page.evaluate((o) => { const g = window.__bjj; const p = g.sim.p; g.cam.yaw = p.yaw + o; g.cam.pitch = 0.28; g.cam.dist = 2.4; g.cam.eff = 2.4; g.cam.tgt.set(p.x, 0.55, p.z); }, off);
      await sleep(240);
      const f = path.join(shots, `_s-${act}-${vi}-${at}.png`);
      await page.screenshot({ path: f });
      files.push(f);
    }
    await T.adv(page, 5);
  }
  const sheet = path.join(shots, `solo-${act}.png`);
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
files = sys.argv[2:]
cols = ${TIMES[act].length}
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * ${W}, rows * ${Hh}), (20, 20, 20))
for i, f in enumerate(files):
    sheet.paste(Image.open(f).convert('RGB'), ((i % cols) * ${W}, (i // cols) * ${Hh}))
sheet.save(sys.argv[1])
`, sheet, ...files]);
  for (const f of files) fs.unlinkSync(f);
  console.log('saved', path.relative(root, sheet));
}
await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); process.exit(1); }
