// The copy that is hosted on its own address (GitHub Pages serves the repository root): one
// self-contained index.html with the game code inlined, marked as "web" so it meets other visitors
// through the public relays instead of the claude.ai room. Written to ./index.html.
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, 'src/page.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
if (js.includes('<!--')) throw new Error('bundle contains "<!--", which is unsafe inside an inline script');
const safe = js.replace(/<\/script/gi, '<\\/script');

const HOST = '<meta name="bjj-host" content="claude">';
const TAG = '<script src="app.js"></script>';
if (!html.includes(HOST) || !html.includes(TAG)) throw new Error('src/page.html is missing a marker');
// Only the hosted copy can be put on a home screen or shown as a link preview: it gets the
// manifest, the touch icon and the preview picture, all of which lie beside it. The picture needs
// its full address (messengers do not resolve a relative one); it is taken from build.sh.
const meet = (fs.readFileSync(path.join(root, 'build.sh'), 'utf8').match(/^MEET_URL="([^"]+)"/m) || [])[1];
if (!meet || !/^https:\/\/[^"<> ]+\/$/.test(meet)) throw new Error('build.sh has no usable MEET_URL');
for (const f of ['manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'og.png']) {
  if (!fs.existsSync(path.join(root, f))) throw new Error(`${f} is missing beside the page (python3 tools/icons.py, node tools/og.mjs)`);
}
const APP = [
  '<link rel="manifest" href="manifest.json">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="주짓수">',
  `<meta property="og:url" content="${meet}">`,
  `<meta property="og:image" content="${meet}og.png">`,
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta name="twitter:card" content="summary_large_image">',
].join('\n');
const out = html.replace(HOST, `<meta name="bjj-host" content="web">\n${APP}`).replace(TAG, () => `<script>\n${safe}\n</script>`);
if (!out.includes('rel="manifest"')) throw new Error('the manifest link was not added');

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('index.html', Buffer.byteLength(out), 'bytes');
