// Contact sheets of the two-person techniques, for checking the poses by eye.
// One sheet per technique: a row per moment, a column per camera angle.
// Usage: node test/techshot.mjs [kind,kind] [--lose] [--t=0.4,0.74,1.9,4.6] [--zoom=2.5] [--y=0.6] [--w=400] [--views=0,2]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, root, shots, sleep } from './page.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}`));
  if (!a) return d;
  return a.includes('=') ? a.split('=')[1] : true;
};
const kinds = (args.find((x) => !x.startsWith('--')) || 'ankle,arm,guil,omo,rnc').split(',');
const times = String(flag('t', '0.4,0.74,1.9,4.6')).split(',').map(Number);
const lose = !!flag('lose', false);
const zoom = Number(flag('zoom', 2.5));
const eye = Number(flag('y', 0.6));
const W = Number(flag('w', 400));
const Hh = Math.round(W * 0.75);
// camera: [turn from the attacker's line of sight, pitch]
const ALL = [[Math.PI / 2, 0.3], [-Math.PI / 2, 0.3], [Math.PI, 0.38], [0, 0.38], [Math.PI * 0.75, 0.95], [-Math.PI * 0.25, 0.95]];
const VIEWS = flag('views', null) ? String(flag('views')).split(',').map((i) => ALL[+i]) : ALL.slice(0, 5);

const T = await launch();
const page = await T.open({ w: W, h: Hh });
await T.enter(page);
await page.addStyleTag({ content: '#hud{display:none!important}' });
await T.freeze(page);

for (const kind of kinds) {
  await page.evaluate((k, th) => {
    const g = window.__bjj;
    const n = g.world.npcs.find((x) => x.spar && x.name.includes('파트너'));
    const p = g.sim.p;
    p.x = n.home.x + 0.95; p.z = n.home.z; p.yaw = -Math.PI / 2;
    window.__adv(2); // stepping onto the mat bows first
    g.sim.npcPick = () => th;
    g.sim.npcMash = () => 0;
    g.sim._cool = 0;
    g.sim.challenge(k);
  }, kind, lose ? 'p' : 's');
  // the throw that decides the series, so that it goes straight to the technique
  const started = await page.evaluate(() => {
    const g = window.__bjj;
    const d = g.sim.p.duel;
    if (!d) return false;
    for (let i = 0; i < 400 && d.phase !== 'pick'; i++) window.__adv(1 / 60);
    d.S.w.A = d.S.need - 1;
    d.S.w.B = d.S.need - 1;
    g.sim.pick('r');
    return true;
  });
  if (!started) { T.errors.push(`${kind}: no duel started`); continue; }
  await T.adv(page, 1.75);
  const files = [];
  let t = 0;
  for (const at of times) {
    await T.adv(page, at - t);
    t = at;
    for (let v = 0; v < VIEWS.length; v++) {
      const ok = await page.evaluate((o, pi, d, y) => {
        const g = window.__bjj;
        const b = g.sim.p.bout;
        if (!b) return false;
        g.view.auto = false; // the sheet chooses its own angles
        g.cam.yaw = b.yaw + o;
        g.cam.pitch = pi;
        g.cam.dist = d;
        g.cam.eff = d;
        g.cam.tgt.set(b.ox, y, b.oz);
        return true;
      }, VIEWS[v][0], VIEWS[v][1], zoom, eye);
      if (!ok) { T.errors.push(`${kind}: no bout at t=${at}`); break; }
      await sleep(260);
      const f = path.join(shots, `_t-${kind}-${at}-${v}.png`);
      await page.screenshot({ path: f });
      files.push(f);
    }
  }
  await T.adv(page, 11.5 - t);
  await T.adv(page, 3);
  const sheet = path.join(shots, `tech-${kind}${lose ? '-lose' : ''}.png`);
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
files = sys.argv[2:]
cols = ${VIEWS.length}
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * ${W}, rows * ${Hh}), (20, 20, 20))
for i, f in enumerate(files):
    sheet.paste(Image.open(f).convert('RGB'), ((i % cols) * ${W}, (i // cols) * ${Hh}))
sheet.save(sys.argv[1])
`, sheet, ...files]);
  for (const f of files) fs.unlinkSync(f);
  console.log('saved', path.relative(root, sheet), `rows: t=${times.join(', ')}`);
}
await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); process.exit(1); }
