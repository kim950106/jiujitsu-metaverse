// Logic test of the relay transport (src/relay.js) against local MQTT brokers.
// Covers: packet splitting, finding each other, position updates, using as few relays as needed,
// carrying on when a relay goes away, leaving (goodbye, lost connection, silence), background and
// return, bad or hostile input, flooding, separate room codes. Usage: node test/relay.mjs
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { Relay, Reader, utf } from '../src/relay.js';
import { startBroker } from './broker.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, label) => {
  const t0 = Date.now();
  for (;;) {
    if (fn()) return Date.now() - t0;
    if (Date.now() - t0 > ms) throw new Error(`timeout after ${ms} ms: ${label}`);
    await sleep(15);
  }
};
let passed = 0;
const ok = (label, extra = '') => { passed++; console.log(`ok  ${label}${extra ? `  (${extra})` : ''}`); };

/* ---------- 0. packet splitting ---------- */
{
  const pkt = (type, flags, len, fill) => {
    const head = [(type << 4) | flags];
    let rest = len;
    do { let b = rest % 128; rest = Math.floor(rest / 128); if (rest > 0) b |= 128; head.push(b); } while (rest > 0);
    const out = new Uint8Array(head.length + len);
    out.set(head, 0);
    out.fill(fill, head.length);
    return out;
  };
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let trial = 0; trial < 300; trial++) {
    const want = [];
    const parts = [];
    const n = 3 + Math.floor(rnd() * 12);
    for (let i = 0; i < n; i++) {
      const r = rnd();
      const len = r < 0.15 ? 0 : r < 0.6 ? Math.floor(rnd() * 200) : r < 0.85 ? 127 + Math.floor(rnd() * 3900) : 4097 + Math.floor(rnd() * 20000);
      const type = 1 + Math.floor(rnd() * 13);
      const fill = Math.floor(rnd() * 256);
      parts.push(pkt(type, i % 4, len, fill));
      if (len <= 4096) want.push(`${type}:${i % 4}:${len}:${len ? fill : ''}`);
    }
    const total = parts.reduce((a, p) => a + p.length, 0);
    const all = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    const got = [];
    const rd = new Reader((t, f, b) => got.push(`${t}:${f}:${b.length}:${b.length ? b[0] : ''}${b.length && b[b.length - 1] !== b[0] ? '!' : ''}`));
    o = 0;
    while (o < all.length) {
      const step = rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 900);
      rd.push(all.slice(o, o + step));
      o += step;
    }
    assert.deepEqual(got, want, `trial ${trial}`);
    assert.equal(rd.buf, null);
    assert.equal(rd.skip, 0);
  }
  // a length that never ends is refused
  assert.throws(() => new Reader(() => {}).push(new Uint8Array([0x30, 0x80, 0x80, 0x80, 0x80, 1])));
  ok('packets are cut correctly from any chunking, oversize ones skipped');
}

/* ---------- brokers ---------- */
const b = [await startBroker(), await startBroker(), await startBroker()];
const urls = b.map((x) => x.url);
const all = [];
const mk = (code, list = urls) => {
  const r = new Relay({ WS: WebSocket, urls: list, code });
  r.seen = [];
  r.fires = 0;
  r.downs = 0;
  const ld = r._linkDown.bind(r);
  r._linkDown = (l, was) => { r.downs++; ld(l, was); };
  r.onPeers((ch) => { r.seen = ch.peers; r.fires++; });
  all.push(r);
  return r;
};
const other = (r, id) => r.seen.find((p) => p.peer === id);
const mvFrom = (broker, r, since = 0) => broker.stats.pub.filter((p) => p.at >= since && p.topic.includes('/mv/') && p.from.startsWith(`bjj-${r.id}-`)).length;
const hbFrom = (broker, r, since = 0) => broker.stats.pub.filter((p) => p.at >= since && p.topic.includes('/hb/') && p.from.startsWith(`bjj-${r.id}-`)).length;

/* ---------- 1. two people find each other ---------- */
const A = mk('t1');
const B = mk('t1');
await until(() => A.info().up === 3 && B.info().up === 3, 4000, 'A and B connected to all relays');
assert.equal(A.connected(), true);
A.presence({ v: 1, n: 'A', b: 'blue', pl: 'gym', x: 1, z: 2 });
B.presence({ v: 1, n: 'B', b: 'white', pl: 'gym', x: 5, z: 6 });
let ms = await until(() => other(A, B.id) && other(A, B.id).presence.x === 5 && other(B, A.id) && other(B, A.id).presence.n === 'A', 2000, 'A and B see each other');
assert.equal(A.seen[0].sameTab, true);
assert.equal(A.seen[0].peer, A.id);
ok('two people on the same address see each other', `${ms} ms`);

/* ---------- 2. moving: updates arrive, through one relay only ---------- */
await sleep(400);
let t0 = Date.now();
for (let i = 0; i < 15; i++) {
  A.presence({ x: 10 + i });
  await sleep(160);
}
ms = await until(() => other(B, A.id).presence.x === 24, 1500, 'B sees the last position of A');
const mv = b.map((x) => mvFrom(x, A, t0));
assert.ok(mv[0] >= 12 && mv[0] <= 15, `position updates on relay 0: ${mv[0]}`);
assert.equal(mv[1] + mv[2], 0, 'no position updates on the other relays');
ok('position updates go through one shared relay', `relay counts ${mv.join('/')}`);

/* ---------- 3. alone in a place: no position stream at all ---------- */
const C = mk('t3');
await until(() => C.info().up === 3, 4000, 'C connected');
C.presence({ v: 1, n: 'C', pl: 'arena', x: 0, z: 0 });
await sleep(300);
t0 = Date.now();
for (let i = 0; i < 10; i++) { C.presence({ x: i }); await sleep(150); }
assert.equal(b.reduce((a, x) => a + mvFrom(x, C, t0), 0), 0);
assert.ok(hbFrom(b[0], C) >= 1);
ok('someone alone sends only the slow heartbeat');

/* ---------- 4. another place: on the list, not in the position stream; then walks in ---------- */
const D = mk('t1');
await until(() => D.info().up === 3, 4000, 'D connected');
D.presence({ v: 1, n: 'D', pl: 'arena', x: 0, z: 0 });
await until(() => other(D, A.id) && other(A, D.id) && other(A, D.id).presence.pl === 'arena', 2000, 'A and D list each other');
let got = 0;
const dMsg = D._msg.bind(D);
D._msg = (link, topic, bytes) => { if (topic.includes('/mv/')) got++; dMsg(link, topic, bytes); };
for (let i = 0; i < 6; i++) { A.presence({ x: 40 + i }); await sleep(150); }
assert.equal(got, 0, 'D in the arena receives no gym position updates');
D.presence({ pl: 'gym', x: 3, z: 3 });
ms = await until(() => other(D, A.id).presence.x === 45 && other(A, D.id).presence.pl === 'gym', 1500, 'D walks into the gym and sees A where A stands');
A.presence({ x: 50 });
await until(() => other(D, A.id).presence.x === 50 && other(B, A.id).presence.x === 50, 1000, 'D and B get the next move');
assert.ok(got >= 1);
ok('people in another place are listed; walking in shows everyone at once', `${ms} ms`);

/* ---------- 5. a relay goes away, then comes back ---------- */
await b[0].down();
A.presence({ x: 60 });
ms = await until(() => other(B, A.id).presence.x === 60 && other(D, A.id).presence.x === 60, 4000, 'B and D still get A after relay 0 died');
await until(() => A.info().up === 2 && B.info().up === 2 && D.info().up === 2, 3000, 'everyone noticed relay 0 is gone');
await sleep(600);
t0 = Date.now();
for (let i = 0; i < 8; i++) { A.presence({ x: 61 + i }); await sleep(160); }
await until(() => other(B, A.id).presence.x === 68, 1500, 'B follows A on the remaining relays');
const mv2 = [mvFrom(b[1], A, t0), mvFrom(b[2], A, t0)];
assert.ok(mv2[0] >= 6 && mv2[1] === 0, `after failover: ${mv2.join('/')}`);
ok('when a relay dies the others carry on', `caught up in ${ms} ms, then relay counts -/${mv2.join('/')}`);
await b[0].up();
ms = await until(() => A.info().up === 3 && B.info().up === 3 && D.info().up === 3, 20000, 'everyone reconnects to relay 0');
ok('a relay that comes back is picked up again', `${ms} ms`);

/* ---------- 6. leaving on purpose ---------- */
B.close();
ms = await until(() => !other(A, B.id) && !other(D, B.id), 800, 'B gone from A and D');
await sleep(300);
assert.ok(!A.others.has(B.id), 'a late copy does not bring B back');
ok('closing the page removes the person at once', `${ms} ms`);

/* ---------- 7. connection lost without a goodbye ---------- */
const E = mk('t1');
await until(() => E.info().up === 3, 4000, 'E connected');
E.presence({ v: 1, n: 'E', pl: 'gym', x: 0, z: 0 });
await until(() => other(A, E.id), 2000, 'A sees E');
E.closed = true;
clearInterval(E.timer);
for (const l of E.links) l.ws.terminate();
ms = await until(() => !other(A, E.id), 6500, 'E removed after its connections dropped');
assert.ok(ms > 2500 && ms < 6500, `removed after ${ms} ms`);
ok('a dropped connection removes the person after the short grace', `${ms} ms`);

/* ---------- 7b. one connection lost, the person is still there ---------- */
{
  const K = mk('t1');
  await until(() => K.info().up === 3, 4000, 'K connected');
  K.presence({ v: 1, n: 'K', pl: 'gym', x: 0, z: 0 });
  await until(() => other(A, K.id) && A.others.get(K.id).mask === 7, 3000, 'A sees K on all three relays');
  const fires = A.fires;
  K.links[1].ws.terminate(); // relay 1 reports the loss; K reconnects by itself
  await until(() => A.fires > fires, 3000, 'something from K after the loss');
  for (let i = 0; i < 40; i++) {
    assert.ok(other(A, K.id), 'K stays on the list while one of three connections is replaced');
    await sleep(100);
  }
  await until(() => K.info().up === 3 && A.others.get(K.id).mask === 7, 6000, 'K back on all three');
  // a stale notice (from a connection replaced long ago) while every relay is fine: no effect
  const until0 = A.others.get(K.id).until;
  await b[2].inject(`${A.base}/hb/${K.id}`, JSON.stringify({ bye: 2, k: 2 }));
  await sleep(150);
  assert.ok(A.others.get(K.id).until >= until0, 'a single lost-connection notice does not shorten the wait');
  await sleep(3200);
  assert.ok(other(A, K.id) && A.others.get(K.id).mask === 7, 'the next heartbeat restores the full picture');
  ok('losing one of several connections never drops the person');
  K.close();
}

/* ---------- 8. silence without any notice ---------- */
const F = mk('t1');
await until(() => F.info().up === 3, 4000, 'F connected');
F.presence({ v: 1, n: 'F', pl: 'gym', x: 0, z: 0 });
await until(() => other(A, F.id), 2000, 'A sees F');
F.closed = true;
clearInterval(F.timer);
for (const l of F.links) l.shut(); // clean disconnect: the relay sends no notice, and no goodbye was said
ms = await until(() => !other(A, F.id), 11000, 'F removed after silence');
assert.ok(ms > 5000, `not before the timeout: ${ms} ms`);
ok('silence removes the person after the timeout', `${ms} ms`);

/* ---------- 9. going to the background and coming back ---------- */
const G = mk('t1');
await until(() => G.info().up === 3, 4000, 'G connected');
G.presence({ v: 1, n: 'G', pl: 'gym', x: 7, z: 7 });
await until(() => other(A, G.id), 2000, 'A sees G');
G._sleep(false);
ms = await until(() => !other(A, G.id), 600, 'G hidden from A');
G._wake();
const back = await until(() => other(A, G.id) && other(A, G.id).presence.x === 7, 1000, 'G back');
ok('background hides the person, return shows them again', `${ms} ms / ${back} ms`);
G._sleep(false);
await until(() => !other(A, G.id), 600, 'G hidden again');
G.sleptAt = Date.now() - 60000; // as if a minute had passed: the relays have dropped the connections
G._wake();
ms = await until(() => other(A, G.id) && G.info().up === 3 && other(G, A.id), 4000, 'G back after a long sleep');
ok('after a long sleep the connections are rebuilt', `${ms} ms`);

/* ---------- 10. duplicates are delivered once ---------- */
{
  const P = mk('t10');
  const Q = mk('t10');
  await until(() => P.info().up === 3 && Q.info().up === 3, 4000, 'P and Q connected');
  P.presence({ v: 1, n: 'P', pl: '' });
  Q.presence({ v: 1, n: 'Q', pl: '' });
  await until(() => other(P, Q.id) && other(Q, P.id), 2000, 'P and Q see each other');
  await sleep(800);
  const f0 = P.fires;
  const q0 = P.others.get(Q.id).q;
  await sleep(5300);
  const fires = P.fires - f0;
  const msgs = P.others.get(Q.id).q - q0;
  assert.equal(fires, msgs, 'one update per message, not one per relay');
  assert.ok(msgs >= 2 && msgs <= 3, `heartbeats in 5.3 s: ${msgs}`);
  ok('the same message through three relays counts once', `${msgs} heartbeats, ${fires} updates`);
  P.close();
  Q.close();
}

/* ---------- 11. separate room codes ---------- */
{
  const H = mk('elsewhere');
  await until(() => H.info().up === 3, 4000, 'H connected');
  H.presence({ v: 1, n: 'H', pl: 'gym', x: 0, z: 0 });
  await sleep(1200);
  assert.equal(H.seen.length, 1);
  assert.ok(!other(A, H.id));
  ok('another room code is a separate room');
  H.close();
}

/* ---------- 12. bad and hostile input ---------- */
{
  const base = A.base;
  const before = A.others.size;
  const downs = A.downs;
  const good = (q, extra = {}) => JSON.stringify({ q, m: 1, p: Object.assign({ v: 1, n: 'X', pl: 'gym', x: 0, z: 0 }, extra) });
  const bad = [
    [`${base}/hb/aaaaaaaaaa`, 'not json'],
    [`${base}/hb/aaaaaaaaaa`, '[1,2,3]'],
    [`${base}/hb/aaaaaaaaaa`, 'null'],
    [`${base}/hb/aaaaaaaaaa`, JSON.stringify({ m: 1, p: { v: 1 } })], // no counter
    [`${base}/hb/aaaaaaaaaa`, JSON.stringify({ q: -4, p: { v: 1 } })],
    [`${base}/hb/aaaaaaaaaa`, JSON.stringify({ q: 1e12, p: { v: 1 } })],
    [`${base}/hb/aaaaaaaaaa`, JSON.stringify({ q: '5', p: { v: 1 } })],
    [`${base}/hb/aaaaaaaaaa`, JSON.stringify({ q: 5, p: [1] })],
    [`${base}/hb/aaaaaaaaaa`, JSON.stringify({ q: 5, p: 'x' })],
    [`${base}/hb/aaaaaaaaaa`, JSON.stringify({ q: 5 })],
    [`${base}/hb/AAAAAAAAAA`, good(1)], // id not in the accepted form
    [`${base}/hb/short`, good(1)],
    [`${base}/hb/aaaaaaaaaa/extra`, good(1)],
    [`${base}/hb/`, good(1)],
    [`${base}/mv/arena/bbbbbbbbbb`, good(1)], // a place A is not in
    [`${base}/mv/gym/`, good(1)],
    [`${base}/hb/cccccccccc`, good(1, { pad: 'y'.repeat(1000) })], // over the size accepted from anyone
    [`${base}/hb/dddddddddd`, Buffer.alloc(6000, 0x7b)], // bigger than a packet we are willing to hold
    [`${base}/hb/dddddddddd`, Buffer.alloc(70000, 0x7b)],
  ];
  for (const [topic, payload] of bad) for (const x of b) await x.inject(topic, payload);
  await sleep(400);
  assert.equal(A.others.size, before, 'nothing got in');
  // a stored ("retained") message must not create anyone for a person who connects later
  await b[0].inject(`${base}/hb/eeeeeeeeee`, good(3), true);
  await b[1].inject(`${base}/hb/eeeeeeeeee`, good(3), true);
  const late = mk('t1');
  await until(() => late.info().up === 3, 4000, 'late joiner connected');
  await sleep(500);
  assert.ok(!late.others.has('eeeeeeeeee'), 'retained copy ignored');
  late.close();
  await b[0].inject(`${base}/hb/eeeeeeeeee`, '', true); // clear it
  await b[1].inject(`${base}/hb/eeeeeeeeee`, '', true);
  // a well-formed one does get in, so the checks above were really exercised
  await b[1].inject(`${base}/hb/ffffffffff`, good(1));
  await until(() => A.others.has('ffffffffff'), 1000, 'well-formed message accepted');
  assert.equal(A.info().up, 3);
  assert.equal(A.downs, downs, 'no connection was dropped because of bad input');
  // a goodbye in the past does not remove anyone; one that is current does
  await b[1].inject(`${base}/hb/ffffffffff`, good(9));
  await until(() => A.others.get('ffffffffff').q === 9, 1000, 'q 9');
  await b[1].inject(`${base}/hb/ffffffffff`, JSON.stringify({ q: 4, bye: 1 }));
  await sleep(200);
  assert.ok(A.others.has('ffffffffff'));
  await b[1].inject(`${base}/hb/ffffffffff`, JSON.stringify({ q: 10, bye: 1 }));
  await until(() => !A.others.has('ffffffffff'), 1000, 'current goodbye accepted');
  await b[2].inject(`${base}/hb/ffffffffff`, good(9)); // a late copy of an older message
  await sleep(200);
  assert.ok(!A.others.has('ffffffffff'), 'late copy after goodbye ignored');
  ok('malformed, oversize, stored and stale messages are ignored without losing a connection');

  // flooding from one sender
  for (let i = 1; i <= 600; i++) b[1].inject(`${base}/hb/gggggggggg`, good(i));
  await sleep(700);
  const q = A.others.get('gggggggggg').q;
  assert.ok(q <= 60 * 2, `accepted ${q} of 600 flood messages`);
  // too many strangers
  for (let i = 0; i < 60; i++) await b[1].inject(`${base}/hb/h${String(i).padStart(9, '0')}`, good(1, { pl: 'arena' }));
  await sleep(400);
  assert.ok(A.others.size <= 32, `list capped: ${A.others.size}`);
  ok('floods are throttled and the list is capped', `${q}/600 accepted, ${A.others.size} listed`);
}

/* ---------- 12b. a relay that does not hand a sender's own messages back ---------- */
{
  const mkMute = () => {
    const r = mk('mute', urls.slice(0, 2));
    const orig = r._msg.bind(r);
    r._msg = (link, topic, bytes) => { if (topic.endsWith(`/${r.id}`)) return; orig(link, topic, bytes); };
    return r;
  };
  const M = mkMute();
  const N = mkMute();
  M.presence({ v: 1, n: 'M', pl: 'gym', x: 1, z: 1 });
  N.presence({ v: 1, n: 'N', pl: 'gym', x: 2, z: 2 });
  ms = await until(() => other(M, N.id) && other(N, M.id), 3000, 'M and N see each other before any echo');
  const t1 = await until(() => M.connected() && N.connected() && M.info().up === 2, 9000, 'counted as connected without the echo');
  await sleep(300);
  t0 = Date.now();
  for (let i = 0; i < 8; i++) { M.presence({ x: 10 + i }); await sleep(160); }
  await until(() => other(N, M.id).presence.x === 17, 1500, 'N follows M');
  assert.ok(mvFrom(b[0], M, t0) >= 6 && mvFrom(b[1], M, t0) === 0);
  await sleep(13000); // past the echo deadline: the connections must stay
  assert.equal(M.downs, 0, 'no reconnect loop on a relay without echo');
  assert.equal(M.info().up, 2);
  ok('a relay that never echoes is still used', `seen after ${ms} ms, counted as connected after ${t1} ms`);
  M.close();
  N.close();
}

/* ---------- 13. our own packets are well-formed for the broker ---------- */
// closed sockets are expected here (pages closing, relays killed on purpose); anything else is a packet the broker did not like
const protocolErrors = b.flatMap((x) => x.stats.errors).filter((e) => !/connection closed|EPIPE|ECONNRESET|keep alive timeout/i.test(e));
assert.deepEqual(protocolErrors, [], 'the brokers reported no protocol errors');
assert.deepEqual(Array.from(utf('가a')), [0, 4, 0xea, 0xb0, 0x80, 0x61]);
ok('brokers saw no protocol errors');

for (const r of all) r.close();
await sleep(200);
for (const x of b) await x.stop();
console.log(`\nALL PASSED (${passed})`);
process.exit(0);
