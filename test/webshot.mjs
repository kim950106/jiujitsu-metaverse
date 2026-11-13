// Quick look at the hosted copy on a phone-sized screen: start screen and the master's answers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startBroker } from './broker.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'shots');
const br = await startBroker();
const fontDirs = { bhs: 'node_modules/@fontsource/black-han-sans/files', plex: 'node_modules/@fontsource/ibm-plex-sans-kr/files' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const m = u.match(/^\/fonts\/(bhs|plex)\/(.+)$/);
  const file = m ? path.join(root, fontDirs[m[1]], path.basename(m[2])) : path.join(root, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': m ? 'font/woff2' : 'text/html; charset=utf-8', 'access-control-allow-origin': '*' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const css = (pkg, key, files) => files.map((f) => fs.readFileSync(path.join(root, 'node_modules/@fontsource', pkg, f), 'utf8').replace(/url\(\.\/files\//g, `url(${base}/fonts/${key}/`)).join('\n');
const fontCss = css('black-han-sans', 'bhs', ['400.css']) + css('ibm-plex-sans-kr', 'plex', ['400.css', '500.css', '700.css']);
const three = fs.readFileSync(path.join(root, 'node_modules/three/build/three.min.js'));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-proxy-server'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
await page.setRequestInterception(true);
const errors = [];
page.on('request', (rq) => {
  const u = rq.url();
  if (u.includes('cdnjs.cloudflare.com')) rq.respond({ status: 200, contentType: 'text/javascript', body: three });
  else if (u.includes('fonts.googleapis.com')) rq.respond({ status: 200, contentType: 'text/css', body: fontCss });
  else if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) rq.continue();
  else rq.abort();
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`${base}/?relay=${encodeURIComponent(br.url)}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__bjj && window.__bjj.ok && window.__bjj.net.state === "on"', { timeout: 30000 });
await sleep(1200);
await page.screenshot({ path: path.join(out, 'web-start.png') });
await page.evaluate(() => document.querySelector('#setup').requestSubmit());
await sleep(800);
await page.evaluate(() => document.querySelector('#people-btn').click());
await sleep(500);
await page.screenshot({ path: path.join(out, 'web-people-alone.png') });
console.log('people:', await page.evaluate(() => [document.querySelector('#people-state').textContent, document.querySelector('#people-note').textContent, document.querySelector('#invite').hidden, document.querySelector('#solo').hidden]));
await page.evaluate(() => { document.querySelector('#modal-people [data-close]').click(); window.__bjj.sim.api ? 0 : 0; });
for (const id of ['ask-time', 'ask-apply', 'ask-list']) {
  await page.evaluate((q) => { document.querySelectorAll('.modal').forEach((m) => { m.hidden = m.id !== 'modal-master'; }); document.querySelector(`#${q}`).click(); }, id);
  await sleep(900);
  await page.screenshot({ path: path.join(out, `web-${id}.png`) });
  console.log(id, '->', await page.evaluate(() => { const m = Array.from(document.querySelectorAll('.modal')).find((x) => !x.hidden); return m ? m.id + ': ' + m.innerText.replace(/\s+/g, ' ').slice(0, 220) : 'none'; }));
}
console.log(errors.length ? 'console problems:\n' + Array.from(new Set(errors)).join('\n') : 'no console problems');
await browser.close(); server.close(); await br.stop(); process.exit(0);
