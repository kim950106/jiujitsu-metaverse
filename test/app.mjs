// The hosted copy as something that can be put on a home screen and shared as a link: the manifest,
// the icons, the preview picture, and the menu entry that explains it. Usage: node test/app.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, root, shots, sleep } from './page.mjs';

let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};
// width and height of a PNG file, read from its header
const pngSize = (file) => {
  const b = fs.readFileSync(path.join(root, file));
  const sig = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return { sig, w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
};

/* ---------- the files beside the page ---------- */
const web = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const claude = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const meet = (fs.readFileSync(path.join(root, 'build.sh'), 'utf8').match(/^MEET_URL="([^"]+)"/m) || [])[1];
ok(web.includes('<link rel="manifest" href="manifest.json">') && web.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png">'), 'the hosted copy links its manifest and touch icon');
ok(web.includes(`<meta property="og:image" content="${meet}og.png">`) && web.includes(`<meta property="og:url" content="${meet}">`) && web.includes('<meta property="og:title" content="주짓수 메타버스">'), 'and names its preview picture by its full address', meet);
ok(!claude.includes('rel="manifest"') && !claude.includes('og:image'), 'the claude.ai copy has neither');
ok(web.split('<head>')[1].split('</head>')[0].includes('rel="manifest"'), 'the tags are inside the head');
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
ok(man.name === '주짓수 메타버스' && man.short_name === '주짓수' && man.start_url === './' && man.scope === './', 'manifest: names and where it starts', `${man.name} / ${man.short_name}`);
ok(man.display === 'fullscreen' && man.orientation === 'landscape' && /^#[0-9a-f]{6}$/.test(man.background_color), 'manifest: opens without browser bars, in landscape');
let icons = true;
for (const ic of man.icons) {
  const s = pngSize(ic.src);
  const [w, h] = ic.sizes.split('x').map(Number);
  if (!s.sig || s.w !== w || s.h !== h || ic.type !== 'image/png') icons = false;
}
ok(icons && man.icons.some((i) => i.sizes === '192x192') && man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') && man.icons.some((i) => i.purpose === 'maskable'), 'manifest: icons exist at the sizes they claim, one of them maskable');
const touch = pngSize('apple-touch-icon.png');
const og = pngSize('og.png');
ok(touch.sig && touch.w === 180 && touch.h === 180, 'the touch icon is 180 x 180');
ok(og.sig && og.w === 1200 && og.h === 630 && og.bytes < 900000, 'the preview picture is 1200 x 630 and under 900 kB', `${og.bytes} bytes`);
// a launcher that cuts the icon to a circle must not cut into the mark
{
  const T0 = await launch({ web: true });
  const p0 = await T0.open({ w: 400, h: 400, query: '?mock=1' });
  const res = await p0.evaluate(async () => {
    const out = {};
    for (const [name, safe] of [['icon-maskable-512.png', 0.4], ['icon-512.png', 0.5]]) {
      const img = new Image();
      img.src = name;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let outside = 0; // light pixels outside the circle that is always kept
      let corner = d[3]; // alpha of the top left pixel
      let lit = 0;
      for (let yy = 0; yy < c.height; yy += 2) for (let xx = 0; xx < c.width; xx += 2) {
        const i = (yy * c.width + xx) * 4;
        if (d[i] + d[i + 1] + d[i + 2] < 420) continue;
        lit++;
        if (Math.hypot(xx - c.width / 2, yy - c.height / 2) > c.width * safe) outside++;
      }
      out[name] = { outside, corner, lit };
    }
    const m = await (await fetch('manifest.json')).json();
    out.link = document.querySelector('link[rel="manifest"]').href;
    out.served = m.name;
    return out;
  });
  ok(res['icon-maskable-512.png'].outside === 0 && res['icon-maskable-512.png'].corner === 255 && res['icon-maskable-512.png'].lit > 500, 'the maskable icon fills its square and keeps the mark inside the safe circle', JSON.stringify(res['icon-maskable-512.png']));
  ok(res['icon-512.png'].corner === 0 && res['icon-512.png'].lit > 500, 'the ordinary icon is a rounded tile', JSON.stringify(res['icon-512.png']));
  ok(/\/manifest\.json$/.test(res.link) && res.served === '주짓수 메타버스', 'the manifest is found from the page');

  /* ---------- the menu entry ---------- */
  await T0.enter(p0);
  const web1 = await p0.evaluate(() => ({ app: !document.querySelector('#m-app').hidden }));
  ok(web1.app, 'the hosted copy offers "앱처럼 열기" in its menu');
  await p0.evaluate(() => { document.querySelector('#menu-btn').click(); document.querySelector('#m-app').click(); });
  await sleep(200);
  const dlg = await p0.evaluate(() => ({ open: !document.querySelector('#modal-app').hidden, install: !document.querySelector('#app-install').hidden, text: document.querySelector('#modal-app').textContent.replace(/\s+/g, ' ') }));
  ok(dlg.open && dlg.text.includes('홈 화면에 추가') && dlg.text.includes('사파리') && dlg.text.includes('기본 브라우저로 저절로 넘어갑니다') && dlg.text.includes('Safari로 열기'), 'the dialog says where to find it on each kind of phone, and that an app\'s own browser hands over');
  // (this Chrome may already have offered to install the page by itself, since the manifest is complete)
  console.log(`note  the test browser ${dlg.install ? 'offered' : 'did not offer'} its own install step for this page`);
  // where the browser offers its own install step, a button takes it
  await p0.evaluate(() => {
    document.querySelector('#modal-app [data-close]').click();
    const e = new Event('beforeinstallprompt', { cancelable: true });
    window.__asked = 0;
    e.prompt = () => { window.__asked++; return Promise.resolve(); };
    window.dispatchEvent(e);
    window.__prevented = e.defaultPrevented;
    document.querySelector('#m-app').click();
  });
  await sleep(200);
  ok(await p0.evaluate(() => window.__prevented && !document.querySelector('#app-install').hidden), 'the browser\'s own offer is held back and shown as a button');
  await p0.evaluate(() => document.querySelector('#app-install').click());
  ok(await p0.evaluate(() => window.__asked === 1 && document.querySelector('#app-install').hidden), 'pressing it asks the browser once');
  await p0.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  ok(await p0.evaluate(() => document.querySelector('#m-app').hidden && document.querySelector('#modal-app').hidden), 'once installed the entry is taken away');
  // phones: the dialog fits
  for (const [w, h] of [[568, 320], [360, 640]]) {
    const ph = await T0.open({ w, h, touch: true, query: '?mock=1', store: { 'bjjmeta.land': '0' } });
    await T0.enter(ph);
    await ph.evaluate(() => document.querySelector('#m-app').click());
    await sleep(250);
    const fit = await ph.evaluate(() => { const c = document.querySelector('#modal-app .card'); const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, sc: c.scrollHeight - c.clientHeight }; });
    ok(fit.l >= 0 && fit.t >= 0 && fit.r <= w + 0.5 && fit.b <= h + 0.5, `${w}x${h}: the dialog is on the screen${fit.sc > 1 ? ' (it scrolls)' : ''}`, JSON.stringify(fit));
    await ph.screenshot({ path: path.join(shots, `app-dialog-${w}.png`) });
    await ph.close();
  }
  const bad = T0.errors.filter((e) => !/logo-(gym|event)\.png|Failed to load resource/.test(e));
  ok(bad.length === 0, 'no page errors on the hosted copy', bad.slice(0, 3).join(' ; '));
  await T0.close();
}
/* the claude.ai copy does not offer it */
{
  const T1 = await launch();
  const p1 = await T1.open({ w: 900, h: 506 });
  await T1.enter(p1);
  ok(await p1.evaluate(() => document.querySelector('#m-app').hidden), 'the claude.ai copy does not offer it');
  await T1.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
