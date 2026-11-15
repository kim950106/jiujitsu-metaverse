// Shared by the page tests: serves dist/ (or the hosted build) on a local port with the CDN library
// and the web fonts answered from node_modules, and opens pages in headless Chrome with software
// rendering.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const shots = path.join(root, 'shots');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// o.web: serve the hosted single-file build (index.html in the project folder) instead of dist/.
export async function launch(o = {}) {
  fs.mkdirSync(shots, { recursive: true });
  const dist = o.web ? root : path.join(root, 'dist');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css', '.png': 'image/png' };
  const fontDirs = { bhs: 'node_modules/@fontsource/black-han-sans/files', plex: 'node_modules/@fontsource/ibm-plex-sans-kr/files' };
  const extra = new Map(); // path -> { type, body }: files a test wants the server to have
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (extra.has(u)) {
      const f = extra.get(u);
      res.writeHead(200, { 'content-type': f.type });
      res.end(f.body);
      return;
    }
    const m = u.match(/^\/fonts\/(bhs|plex)\/(.+)$/);
    const file = m ? path.join(root, fontDirs[m[1]], path.basename(m[2])) : path.join(dist, u === '/' ? 'index.html' : u);
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const css = (pkg, key, files) => files.map((f) => fs.readFileSync(path.join(root, 'node_modules/@fontsource', pkg, f), 'utf8')
    .replace(/url\(\.\/files\//g, `url(${base}/fonts/${key}/`)).join('\n');
  const fontCss = css('black-han-sans', 'bhs', ['400.css']) + css('ibm-plex-sans-kr', 'plex', ['400.css', '500.css', '700.css']);
  const three = fs.readFileSync(path.join(root, 'node_modules/three/build/three.min.js'));
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-proxy-server'],
  });
  const errors = [];
  // o: { w, h, touch, sel (start-screen choices), query, store (extra localStorage entries),
  //      fresh (a browser profile of its own, as another person's device would be),
  //      init (a function run in the page before any of its own code) }
  const open = async (o) => {
    const page = o.fresh ? await (await browser.createBrowserContext()).newPage() : await browser.newPage();
    await page.setViewport({ width: o.w, height: o.h, deviceScaleFactor: 1, hasTouch: !!o.touch, isMobile: !!o.touch });
    await page.setRequestInterception(true);
    page.on('request', (rq) => {
      const u = rq.url();
      if (u.includes('cdnjs.cloudflare.com')) rq.respond({ status: 200, contentType: 'text/javascript', body: three });
      else if (u.includes('fonts.googleapis.com')) rq.respond({ status: 200, contentType: 'text/css', body: fontCss });
      else if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) rq.continue();
      else rq.abort();
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.evaluateOnNewDocument((s, more) => {
      try {
        localStorage.setItem('bjjmeta.sel', JSON.stringify(s));
        for (const k in more) localStorage.setItem(k, more[k]);
      } catch (e) { /* ignore */ }
    }, o.sel || { place: 'gym', belt: 'purple', stripes: 3, gi: 'blue', name: '나' }, o.store || {});
    if (o.init) await page.evaluateOnNewDocument(o.init);
    await page.goto(`${base}/${o.query == null ? '?mock=1' : o.query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__bjj && window.__bjj.ok', { timeout: 20000 });
    return page;
  };
  const enter = async (page) => {
    await page.evaluate(() => document.querySelector('#setup').requestSubmit());
    await sleep(900);
  };
  // Take over the clock: the game keeps drawing, but game time only moves through adv().
  const freeze = (page) => page.evaluate(() => {
    const g = window.__bjj;
    const real = g.sim.step.bind(g.sim);
    g.sim.step = () => {};
    window.__adv = (sec) => {
      for (let i = 0; i < Math.round(sec * 60); i++) real(1 / 60, g._input());
    };
  });
  const adv = (page, sec) => page.evaluate((t) => window.__adv(t), sec);
  const close = async () => {
    await browser.close();
    server.close();
  };
  return { base, open, enter, freeze, adv, errors, extra, close };
}
