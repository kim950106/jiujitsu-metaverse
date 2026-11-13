// The claude.ai page build opened by someone who gets no room there (as a public-link visitor):
// it must say plainly that this address is for looking around alone.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'shots');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, 'dist', u === '/' ? 'index.html' : path.basename(u));
  fs.readFile(file, (err, raw) => {
    if (err) { res.writeHead(204); res.end(); return; }
    let buf = raw;
    if (file.endsWith('index.html') && /[?&]meet=1/.test(req.url)) buf = Buffer.from(String(raw).replace('<meta name="bjj-meet" content="">', '<meta name="bjj-meet" content="https://example.pages.dev/">'));
    res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const three = fs.readFileSync(path.join(root, 'node_modules/three/build/three.min.js'));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-proxy-server'] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (tag, claude, meet) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.setRequestInterception(true);
  let sockets = 0;
  page.on('request', (rq) => {
    const u = rq.url();
    if (u.includes('cdnjs.cloudflare.com')) rq.respond({ status: 200, contentType: 'text/javascript', body: three });
    else if (u.includes('fonts.googleapis.com')) rq.respond({ status: 200, contentType: 'text/css', body: '' });
    else if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) rq.continue();
    else rq.abort();
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', () => { sockets++; });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} error: ${m.text()}`); });
  await page.evaluateOnNewDocument((c) => {
    // stand-in for the platform: a runtime that answers "no capability for this visitor"
    if (c) window.claude = { use: () => new Promise((r) => setTimeout(() => r(null), 300)) };
  }, claude);
  await page.goto(`${base}/${meet ? '?meet=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__bjj && window.__bjj.ok', { timeout: 30000 });
  await sleep(1500);
  const r = await page.evaluate(() => {
    const vis = (q) => { const el = document.querySelector(q); return el && !el.hidden ? el.textContent.trim() : null; };
    const n = window.__bjj.net;
    document.querySelector('#setup').requestSubmit();
    return { mode: n.mode, host: n.host, state: n.state, solo: vis('#solo'), soloLink: vis('#solo-link'), dot: document.querySelector('#net-dot').dataset.s || '' };
  });
  await sleep(700);
  await page.evaluate(() => document.querySelector('#people-btn').click());
  await sleep(400);
  const p = await page.evaluate(() => {
    const vis = (q) => { const el = document.querySelector(q); return el && !el.hidden ? el.textContent.trim() : null; };
    return { state: vis('#people-state'), note: vis('#people-note'), invite: vis('#invite'), meet: vis('#people-meet'), href: document.querySelector('#meet-link').getAttribute('href') };
  });
  await page.screenshot({ path: path.join(out, `claude-${tag}.png`) });
  console.log(tag, JSON.stringify(Object.assign(r, p, { sockets }), null, 1));
  await page.close();
};
await run('visitor', true, '');
await run('visitor-meet', true, true);
await run('bare', false, ''); // the same build opened as a plain file host: still no relays, it is marked as the claude.ai build
console.log(errors.length ? 'console problems:\n' + errors.join('\n') : 'no console problems');
await browser.close(); server.close(); process.exit(0);
