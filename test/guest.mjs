// The guestbook without a browser: packing drawings, refusing bad input, keeping and removing
// entries, and sharing them through local MQTT brokers (kept messages, late joiners, a relay that
// lost everything). Usage: node test/guest.mjs
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { Relay } from '../src/relay.js';
import { Guestbook, packStrokes, unpackStrokes, makeStroke, metaLine, packedSize, MAX_BYTES, GRID } from '../src/guest.js';
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
const ok = (label, extra = '') => console.log(`ok  ${label}${extra ? `  (${extra})` : ''}`);
const mem = () => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), m }; };
const te = new TextEncoder();

/* ---------- packing ---------- */
{
  const s = [{ c: 0, w: 1, pts: [[0, 0], [255, 159], [10, 20]] }, { c: 5, w: 2, pts: [[128, 80]] }];
  const u8 = packStrokes(s);
  assert.equal(u8.length, 2 + 6 + 2 + 2);
  assert.deepEqual(unpackStrokes(u8), s);
  assert.equal(packedSize(s), u8.length);
  // refusals: empty, y off the grid, unknown ink or pen, a count that runs past the end, too big
  assert.equal(unpackStrokes(new Uint8Array(0)), null);
  assert.equal(unpackStrokes(new Uint8Array([0, 1, 5, 160])), null);
  assert.equal(unpackStrokes(new Uint8Array([6, 1, 5, 5])), null);
  assert.equal(unpackStrokes(new Uint8Array([3 << 3, 1, 5, 5])), null);
  assert.equal(unpackStrokes(new Uint8Array([0, 3, 5, 5])), null);
  assert.equal(unpackStrokes(new Uint8Array([0, 0])), null);
  assert.equal(unpackStrokes(new Uint8Array(MAX_BYTES + 2)), null);
  let seed = 99;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 3000; i++) {
    const u = new Uint8Array(Math.floor(rnd() * 60));
    for (let k = 0; k < u.length; k++) u[k] = Math.floor(rnd() * 256);
    const got = unpackStrokes(u);
    if (got) for (const st of got) for (const p of st.pts) assert.ok(p[0] < GRID.w && p[1] < GRID.h && st.c < 6 && st.w < 3);
  }
  ok('drawings pack and unpack; malformed bytes are refused');
  // a long wobbly line is thinned to fit
  const raw = [];
  for (let i = 0; i < 2000; i++) raw.push([10 + (i / 2000) * 230 + Math.sin(i * 0.9) * 0.3, 80 + Math.sin(i / 60) * 60]);
  const st = makeStroke(raw, 2, 0);
  assert.ok(st.pts.length <= 255 && st.pts.length > 20, `points ${st.pts.length}`);
  assert.ok(st.pts.every((p) => Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[0] < 256 && p[1] >= 0 && p[1] < 160));
  const off = makeStroke([[-50, -50], [400, 400]], 0, 0);
  assert.deepEqual(off.pts, [[0, 0], [255, 159]]);
  ok('a freehand line is thinned and kept on the grid', `${raw.length} -> ${st.pts.length} points`);
}

/* ---------- keeping in one browser ---------- */
const line = (x, c = 0) => [{ c, w: 1, pts: [[x, 10], [x + 30, 120]] }];
{
  const store = mem();
  const g = new Guestbook(store);
  let fires = 0;
  g.onChange(() => fires++);
  assert.equal(g.shared, false);
  assert.equal(g.add({ name: 'x', belt: 'blue', stripes: 4 }, []), null);
  const a = g.add({ name: '현철', belt: 'blue', stripes: 4 }, line(10));
  assert.ok(a && /^[a-z0-9]{10}$/.test(a.id) && a.sent === 0);
  await sleep(3);
  const b = g.add({ name: '', belt: 'nope', stripes: 9 }, line(20));
  assert.equal(b, null);
  const c = g.add({ name: '  아주아주아주아주긴이름입니다요  ', belt: 'black', stripes: 9 }, line(30, 3));
  const list = g.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, c.id);
  assert.equal(list[0].n.length, 12);
  assert.equal(list[0].s, 6); // a black belt's stripes are degrees, up to six
  assert.ok(list.every((e) => e.mine));
  assert.match(metaLine(list[1]), /^\d{4}\.\d{2}\.\d{2} · 현철 블루 4그랄$/);
  assert.equal(fires, 2);
  // a second visit reads them back
  const g2 = new Guestbook(store);
  assert.deepEqual(g2.list().map((e) => [e.id, e.n, e.b, e.s, e.mine]), list.map((e) => [e.id, e.n, e.b, e.s, e.mine]));
  assert.deepEqual(g2.list()[1].strokes, line(10));
  // removal is remembered
  assert.ok(g2.remove(a.id) && !g2.remove(a.id));
  const g3 = new Guestbook(store);
  assert.deepEqual(g3.list().map((e) => e.id), [c.id]);
  // rubbish in storage is ignored
  store.set('bjjmeta.guest.main', '{"p":[["short",{}],["aaaaaaaaaa",{"v":1,"t":1,"b":"blue","d":"AAEFBQ=="}],["bbbbbbbbbb",{"v":1,"t":' + Date.now() + ',"n":"<b>","b":"blue","s":1,"d":"AAEFBQ=="}]],"x":"no","o":[1,2]}');
  const g4 = new Guestbook(store);
  assert.deepEqual(g4.list().map((e) => [e.id, e.n, e.mine]), [['bbbbbbbbbb', '<b>', false]]);
  store.set('bjjmeta.guest.main', 'not json');
  assert.equal(new Guestbook(store).list().length, 0);
  // only the newest sixty are kept
  const g5 = new Guestbook(mem());
  for (let i = 0; i < 70; i++) g5._in(`id${String(i).padStart(8, '0')}`, te.encode(JSON.stringify({ v: 1, t: Date.UTC(2026, 5, 1) + i * 1000, n: `n${i}`, b: 'white', s: 0, d: 'AAEFBQ==' })));
  assert.equal(g5.list().length, 60);
  assert.equal(g5.list()[0].n, 'n69');
  assert.equal(g5.list()[59].n, 'n10');
  ok('entries are kept across visits, removals remembered, bad storage ignored, newest sixty kept');
}

/* ---------- through the relays ---------- */
const brokers = [await startBroker(), await startBroker()];
const urls = brokers.map((x) => x.url);
const all = [];
const mk = (code, list = urls, store = mem()) => {
  const r = new Relay({ WS: WebSocket, urls: list, code });
  const g = new Guestbook(store, code);
  g.attach(r);
  g.fires = 0;
  g.onChange(() => g.fires++);
  all.push(r);
  return { r, g, store };
};
const up = (x, n = urls.length) => until(() => x.r.info().up === n, 5000, 'relays up');
{
  const A = mk('gb');
  const B = mk('gb');
  await up(A);
  await up(B);
  assert.equal(A.g.shared, true);
  const post = A.g.add({ name: '가', belt: 'purple', stripes: 2 }, line(40, 1));
  assert.equal(post.sent, 2);
  await until(() => B.g.list().length === 1, 3000, 'B sees the entry');
  assert.deepEqual([B.g.list()[0].id, B.g.list()[0].n, B.g.list()[0].b, B.g.list()[0].s, B.g.list()[0].mine], [post.id, '가', 'purple', 2, false]);
  assert.deepEqual(B.g.list()[0].strokes, line(40, 1));
  ok('an entry reaches someone who is connected');
  // someone who comes later gets it from the relay, not from A
  A.r.close();
  await sleep(150);
  const C = mk('gb');
  await until(() => C.g.list().length === 1, 4000, 'late joiner sees the kept entry');
  ok('a late joiner gets the kept entry after its author has left');
  // another room does not
  const D = mk('other');
  await up(D);
  await sleep(300);
  assert.equal(D.g.list().length, 0);
  ok('another room code has its own guestbook');
  // removal reaches everyone and is not undone by a copy that arrives later
  const mine = B.g.add({ name: '나', belt: 'white', stripes: 0 }, line(60));
  await until(() => C.g.list().length === 2, 3000, 'second entry');
  B.g.remove(mine.id);
  await until(() => C.g.list().length === 1, 3000, 'removal arrives');
  C.g._in(mine.id, te.encode(JSON.stringify({ v: 1, t: Date.now(), n: '나', b: 'white', s: 0, d: 'AAEFBQ==' })));
  assert.equal(C.g.list().length, 1);
  const E = mk('gb');
  await until(() => E.g.list().length === 1, 4000, 'newcomer');
  await sleep(300);
  assert.equal(E.g.list().length, 1);
  assert.ok(E.g.dead.has(mine.id));
  ok('a removal reaches everyone and later visitors, and stays removed');
  // hostile or broken messages on the guestbook topics
  const base = `bjjmv1-k7x2q9/gb/bd`;
  const before = C.g.list().length;
  await brokers[0].inject(`${base}/zzzzzzzzzz`, 'not json', true);
  await brokers[0].inject(`${base}/yyyyyyyyyy`, JSON.stringify({ v: 1, t: Date.now(), n: 'x', b: 'blue', s: 0, d: '!!!!' }), true);
  await brokers[0].inject(`${base}/xxxxxxxxxx`, JSON.stringify({ v: 1, t: Date.now() + 9e9, n: 'x', b: 'blue', s: 0, d: 'AAEFBQ==' }), true);
  await brokers[0].inject(`${base}/wwwwwwwwww`, JSON.stringify({ v: 1, t: Date.now(), n: 'x', b: 'blue', s: 0, d: 'A'.repeat(4000) }), true);
  await brokers[0].inject(`${base}/BADID`, JSON.stringify({ v: 1, t: Date.now(), n: 'x', b: 'blue', s: 0, d: 'AAEFBQ==' }), true);
  await brokers[0].inject(`${base}/vvvvvvvvvv`, Buffer.alloc(3600, 65), true);
  await brokers[0].inject(`${base}/uuuuuuuuuu`, JSON.stringify({ v: 1, t: Date.now(), n: '\u0000<img src=x>​', b: 'blue', s: 0, d: 'AAEFBQ==' }), true);
  await until(() => C.g.list().length === before + 1, 3000, 'the one valid injected entry');
  await sleep(200);
  assert.equal(C.g.list().length, before + 1);
  assert.equal(C.g.list().find((e) => e.id === 'uuuuuuuuuu').n, '<img src=x>');
  assert.ok(C.r.info().up === 2);
  ok('malformed, oversize, future-dated and badly named messages are refused; names are cleaned');
  for (const x of [B, C, D, E]) x.r.close();
}
{
  // a relay that lost what it held gets it back from a visitor who remembers
  const store = mem();
  const A = mk('seed', urls, store);
  await up(A);
  const p1 = A.g.add({ name: '기억', belt: 'brown', stripes: 1 }, line(80, 4));
  await sleep(200);
  A.r.close();
  // wipe both relays' kept copies, as a restart would
  for (const br of brokers) await br.inject(`bjjmv1-k7x2q9/seed/bd/${p1.id}`, '', true);
  const N = mk('seed');
  await up(N);
  await sleep(500);
  assert.equal(N.g.list().length, 0);
  ok('after the relays lose an entry a newcomer sees nothing');
  const A2 = mk('seed', urls, store); // the same browser comes back
  assert.equal(A2.g.list().length, 1);
  await until(() => N.g.list().length === 1, 9000, 'entry put back by the returning visitor');
  assert.equal(N.g.list()[0].id, p1.id);
  N.r.close();
  A2.r.close();
  const L = mk('seed');
  await until(() => L.g.list().length === 1, 4000, 'kept again');
  ok('a returning visitor puts the lost entry back, for everyone', `${A2.r.sent.bd} messages`);
  L.r.close();
}
{
  // one relay down while posting: the entry still gets there, and reaches that relay later
  await brokers[1].down();
  const A = mk('half');
  await until(() => A.r.info().up === 1, 5000, 'one relay');
  const p = A.g.add({ name: '반', belt: 'blue', stripes: 0 }, line(100));
  assert.equal(p.sent, 1);
  await brokers[1].up();
  await until(() => A.r.info().up === 2, 40000, 'second relay back');
  const only1 = mk('half', [urls[1]]);
  await until(() => only1.g.list().length === 1, 12000, 'entry arrives on the relay that was down');
  ok('an entry posted while a relay was down is brought to it afterwards');
  A.r.close();
  only1.r.close();
}

for (const r of all) r.close();
for (const br of brokers) await br.stop();
console.log('\nALL PASSED');
process.exit(0);
