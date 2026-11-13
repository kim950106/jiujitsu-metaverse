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
const out = html.replace(HOST, '<meta name="bjj-host" content="web">').replace(TAG, () => `<script>\n${safe}\n</script>`);

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('index.html', Buffer.byteLength(out), 'bytes');
