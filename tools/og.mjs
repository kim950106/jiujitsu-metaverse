// Makes og.png, the picture messengers show beside a link to the hosted page: a view from inside
// the game itself (the dojo by day, two figures on the mat) with the title over it. Needs dist/
// to be built. Usage: node tools/og.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, root, sleep } from '../test/page.mjs';

const T = await launch();
// 1. the picture from the game, drawn at twice the size and without any buttons
const page = await T.open({ w: 1200, h: 630, query: '?mock=1&h=14', sel: { place: 'gym', belt: 'blue', stripes: 4, gi: 'white', name: '' } });
await T.enter(page);
await T.freeze(page);
await page.evaluate(() => {
  const g = window.__bjj;
  const n = g.world.npcs.find((x) => x.name === '스파링 파트너');
  n.x = -5.3; n.z = -3.0; n.yaw = 0.25; n.home.x = n.x; n.home.z = n.z; n.home.yaw = n.yaw;
  n.char.setLabel('');
  g.sim.p.x = -4.2; g.sim.p.z = -3.0; g.sim.p.yaw = -0.2; g.sim.p.y = 0;
  g.cam.yaw = 0.42; g.cam.pitch = 0.16; g.cam.dist = 3.5;
});
await T.adv(page, 2.6); // the bow on stepping onto the mat
await page.evaluate(() => { const g = window.__bjj; g.sim.p.x = -4.2; g.sim.p.z = -3.0; g.sim.p.yaw = -0.2; g.act('shaka'); });
await T.adv(page, 0.7);
await sleep(1500);
const shot = await page.evaluate(() => {
  const g = window.__bjj;
  const r = g.renderer;
  const was = r.getPixelRatio();
  // the figures stand to the right of the middle, clear of the title
  g.camera.setViewOffset(1200, 630, -250, 10, 1200, 630);
  r.setPixelRatio(2);
  r.render(g.world.scene, g.camera);
  const data = r.domElement.toDataURL('image/png');
  r.setPixelRatio(was);
  g.camera.clearViewOffset();
  return data;
});
fs.writeFileSync(path.join(root, 'shots', 'og-scene.png'), Buffer.from(shot.split(',')[1], 'base64'));

// 2. the card: that picture, a shade on the left, the title
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&amp;family=IBM+Plex+Sans+KR:wght@400;500;700&amp;display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0f1114; }
  .pic { position: absolute; inset: 0; background: url(${shot}) center / cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(15,17,20,.94) 0%, rgba(15,17,20,.86) 30%, rgba(15,17,20,.35) 52%, rgba(15,17,20,0) 68%); }
  .txt { position: absolute; left: 64px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; gap: 18px; color: #f1efe9; font-family: 'IBM Plex Sans KR', sans-serif; }
  .over { font-size: 30px; font-weight: 700; color: #ffd79a; }
  h1 { margin: 0; font-family: 'Black Han Sans', sans-serif; font-weight: 400; font-size: 112px; line-height: 1.06; letter-spacing: -1px; }
  .line { width: 420px; height: 6px; border-radius: 3px; background: #ffd79a; }
  .sub { font-size: 34px; font-weight: 700; line-height: 1.35; }
  .note { font-size: 22px; font-weight: 500; color: #b9b5aa; }
</style></head><body>
<div class="pic"></div><div class="shade"></div>
<div class="txt">
  <div class="over">띠를 매고 걸어 들어가는</div>
  <h1>주짓수<br>메타버스</h1>
  <div class="line"></div>
  <div class="sub">링크 하나로 도장에서 만나요</div>
  <div class="note">개인 취미로 만든 비공식 팬 프로젝트</div>
</div>
</body></html>`;
T.extra.set('/og.html', { type: 'text/html; charset=utf-8', body: html });
await page.goto(`${T.base}/og.html`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await sleep(400);
await page.screenshot({ path: path.join(root, 'og.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
await T.close();
console.log('og.png', fs.statSync(path.join(root, 'og.png')).size, 'bytes');
