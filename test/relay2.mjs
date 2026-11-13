// The relay transport against a second broker implementation (Python amqtt): finding each other,
// moving, leaving, and a lost connection. Usage: node test/relay2.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Relay } from '../src/relay.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const port = 9311;
const py = spawn('python3', [path.join(here, 'amqtt_broker.py'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
py.stderr.on('data', (d) => { log += d; });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`broker did not start\n${log}`)), 15000);
  py.stdout.on('data', (d) => { if (String(d).includes('ready')) { clearTimeout(t); res(); } });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, label) => {
  const t0 = Date.now();
  for (;;) {
    if (fn()) return Date.now() - t0;
    if (Date.now() - t0 > ms) throw new Error(`timeout after ${ms} ms: ${label}\n${log.slice(-1500)}`);
    await sleep(15);
  }
};
const mk = () => {
  const r = new Relay({ WS: WebSocket, urls: [`ws://127.0.0.1:${port}/`], code: 'amqtt' });
  r.seen = [];
  r.onPeers((ch) => { r.seen = ch.peers; });
  return r;
};
const other = (r, id) => r.seen.find((p) => p.peer === id);
try {
  const A = mk();
  const B = mk();
  let ms = await until(() => A.info().up === 1 && B.info().up === 1, 6000, 'both connected and heard their own message back');
  console.log(`ok  connected, own message echoed back  (${ms} ms)`);
  A.presence({ v: 1, n: '가나다', pl: 'gym', x: 1, z: 2 });
  B.presence({ v: 1, n: 'B', pl: 'gym', x: 5, z: 6 });
  ms = await until(() => other(A, B.id) && other(B, A.id) && other(B, A.id).presence.n === '가나다', 3000, 'see each other');
  console.log(`ok  see each other, Korean name intact  (${ms} ms)`);
  for (let i = 0; i < 10; i++) { A.presence({ x: 10 + i }); await sleep(160); }
  await until(() => other(B, A.id).presence.x === 19, 2000, 'moves arrive');
  console.log('ok  position updates arrive');
  B.presence({ pl: 'arena' });
  await until(() => other(A, B.id).presence.pl === 'arena', 2000, 'place change seen');
  B.presence({ pl: 'gym' });
  A.presence({ x: 30 });
  await until(() => other(B, A.id).presence.x === 30, 2000, 'resubscribed after changing place');
  console.log('ok  changing place re-subscribes correctly');
  B.close();
  ms = await until(() => !other(A, B.id), 1500, 'goodbye');
  console.log(`ok  goodbye removes  (${ms} ms)`);
  const C = mk();
  await until(() => C.info().up === 1, 6000, 'C connected');
  C.presence({ v: 1, n: 'C', pl: 'gym', x: 0, z: 0 });
  await until(() => other(A, C.id), 3000, 'A sees C');
  C.closed = true;
  clearInterval(C.timer);
  for (const l of C.links) l.ws.terminate();
  ms = await until(() => !other(A, C.id), 6000, 'lost connection noticed through the last-will message');
  assert.ok(ms < 6000);
  console.log(`ok  lost connection removes after the grace  (${ms} ms)`);
  A.close();
  await sleep(200);
  console.log('\nALL PASSED (amqtt)');
} finally {
  py.kill('SIGKILL');
}
process.exit(0);
