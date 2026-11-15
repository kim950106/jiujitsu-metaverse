/* global window, document, location, WebSocket, TextEncoder, TextDecoder, crypto */
// Meeting other people when the page is hosted outside claude.ai, where there is no platform room.
// Everyone who opens the same build joins the same topic space on a few public MQTT relays. The
// page connects to all of them at once, so any single one being reachable is enough, and it speaks
// the small part of MQTT 3.1.1 it needs by itself (connect, subscribe, QoS 0 publish) over a
// WebSocket.
//
// These relays are open to anyone. Only what is already visible on screen (name, belt, position,
// animation) goes through them, never anything typed into a form, and everything that arrives is
// treated as untrusted: size, shape and rate are checked here, the fields again in net.js.
//
// The object returned by relayRoom() has the same shape as the platform room that net.js uses:
// presence(patch), onPeers(fn), peers(), connected(), onConnection(fn).
//
// The relays also keep the guestbook (guest.js): each drawing is one retained message under
// bd/<id>, which a relay hands to whoever subscribes later. Public relays promise nothing about
// how long they keep such messages, so every visitor's browser remembers the drawings it has seen
// and puts back the ones a relay has lost.

// Checked from a real browser on 2026-11-14 with the exact bytes this file sends: all three accept
// the connection, confirm the subscription, hand a sender's own message back and pass it on to
// another client (about 0.25 s one way from Korea). The first one carries the position updates, so
// the order matters. mqtt.eclipseprojects.io was left out: it did not answer at all from Korea.
export const RELAYS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const SPACE = 'bjjmv1-k7x2q9'; // topic prefix shared by every copy of this build
const SEND_EVERY = 140; // ms between position updates while someone else is in the same place
const HB_EVERY = 2500; // ms between full "I am here" messages on every relay
const PEER_TTL = 8000; // ms of silence before someone is taken off the list
const WILL_GRACE = 4000; // ms left to someone whose last known relay connection was reported lost (longer than HB_EVERY)
const MAX_PEERS = 32;
const MAX_BODY = 900; // bytes of JSON accepted from anyone
const MAX_PACKET = 4096; // bytes; anything bigger is skipped without being buffered
const MAX_RATE = 60; // messages per second accepted from one sender
const MAX_BOARD = 3400; // bytes of one guestbook entry
const BOARD_IN = 600; // guestbook messages taken from one relay connection; the rest are ignored
const SEED_AFTER = 5000; // ms after subscribing before missing guestbook entries are put back
const ID_RE = /^[a-z0-9]{10}$/;
const PLACE_RE = /^[a-z]{1,12}$/;

const te = new TextEncoder();
const td = new TextDecoder();
const noop = () => {};

// 'web': a copy hosted on its own address, which uses the relays. 'claude': the claude.ai page.
export function hostKind() {
  try {
    const m = document.querySelector('meta[name="bjj-host"]');
    return m && m.content === 'web' ? 'web' : 'claude';
  } catch (e) {
    return 'claude';
  }
}

// Address of the hosted copy, shown on the claude.ai page so visitors can find where people meet.
export function meetUrl() {
  try {
    const m = document.querySelector('meta[name="bjj-meet"]');
    const u = m ? String(m.content || '').trim() : '';
    return /^https:\/\/[a-z0-9.-]+(\/[^\s"'<>]*)?$/i.test(u) ? u : '';
  } catch (e) {
    return '';
  }
}

const cleanCode = (s) => (typeof s === 'string' && /^[a-z0-9-]{1,24}$/i.test(s) ? s.toLowerCase() : '');

function rid(n) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rnd = null;
  try { rnd = crypto.getRandomValues(new Uint8Array(n)); } catch (e) { rnd = null; }
  let s = '';
  for (let i = 0; i < n; i++) s += abc[(rnd ? rnd[i] : Math.floor(Math.random() * 256)) % 36];
  return s;
}

/* ---------- MQTT 3.1.1, the few packets needed ---------- */

function frame(type, flags, parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const head = [(type << 4) | flags];
  let rest = n;
  do {
    let b = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) b |= 128;
    head.push(b);
  } while (rest > 0);
  const out = new Uint8Array(head.length + n);
  out.set(head, 0);
  let o = head.length;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// Length-prefixed UTF-8, as MQTT writes strings.
export function utf(s) {
  const b = te.encode(s);
  const out = new Uint8Array(b.length + 2);
  out[0] = b.length >> 8;
  out[1] = b.length & 255;
  out.set(b, 2);
  return out;
}

const u16 = (n) => new Uint8Array([n >> 8, n & 255]);
const QOS0 = new Uint8Array([0]);
const DISCONNECT = new Uint8Array([0xe0, 0]);
const PINGREQ = new Uint8Array([0xc0, 0]);

function connectPacket(clientId, willTopic, willBody, keepAlive) {
  // protocol name "MQTT", level 4, flags: clean session + will (QoS 0, not retained)
  const vh = new Uint8Array([0, 4, 77, 81, 84, 84, 4, 0x06, keepAlive >> 8, keepAlive & 255]);
  return frame(1, 0, [vh, utf(clientId), utf(willTopic), utf(willBody)]);
}

// Splits a byte stream into MQTT packets. WebSocket frames need not line up with packets.
export class Reader {
  constructor(on) {
    this.on = on;
    this.buf = null;
    this.skip = 0;
  }

  push(chunk) {
    let u = chunk;
    if (this.skip) {
      const n = Math.min(this.skip, u.length);
      this.skip -= n;
      if (n === u.length) return;
      u = u.subarray(n);
    }
    let buf = u;
    if (this.buf) {
      buf = new Uint8Array(this.buf.length + u.length);
      buf.set(this.buf, 0);
      buf.set(u, this.buf.length);
      this.buf = null;
    }
    let o = 0;
    for (;;) {
      if (buf.length - o < 2) break;
      let len = 0;
      let mul = 1;
      let i = o + 1;
      let done = false;
      let used = 0;
      while (used < 4 && i < buf.length) {
        const b = buf[i++];
        used++;
        len += (b & 127) * mul;
        mul *= 128;
        if (!(b & 128)) {
          done = true;
          break;
        }
      }
      if (!done) {
        if (used >= 4) throw new Error('bad length');
        break; // the length itself is not complete yet
      }
      const have = buf.length - i;
      if (len > MAX_PACKET) {
        // not ours: let it go by without holding on to it
        if (have >= len) {
          o = i + len;
          continue;
        }
        this.skip = len - have;
        o = buf.length;
        break;
      }
      if (have < len) break;
      this.on(buf[o] >> 4, buf[o] & 15, buf.subarray(i, i + len));
      o = i + len;
    }
    if (o < buf.length) this.buf = buf.slice(o);
  }
}

// One connection to one relay.
class Link {
  constructor(owner, i, url) {
    this.o = owner;
    this.i = i;
    this.url = url;
    this.ws = null;
    this.rd = null;
    this.up = false; // the relay accepted the connection
    this.good = false; // it carries traffic: our own message came back through it
    this.acked = false; // the relay confirmed a subscription
    this.mute = false; // counted as good although our own messages do not come back from it
    this.ping = 0;
    this.wait = 0;
    this.t = null;
    this.pid = 0;
    this.at = 0;
    this.upAt = 0;
    this.rx = 0;
    this.due = 0; // an echo of our own heartbeat has to arrive by then
    this.have = new Set(); // guestbook entries this relay has shown us
    this.bdN = 0;
  }

  open() {
    const o = this.o;
    if (this.ws || o.asleep || o.closed || !o.WS) return;
    clearTimeout(this.t);
    let ws;
    try {
      ws = new o.WS(this.url, 'mqtt');
    } catch (e) {
      this._retry();
      return;
    }
    try { ws.binaryType = 'arraybuffer'; } catch (e) { /* keep the default */ }
    this.ws = ws;
    this.at = Date.now();
    this.rd = new Reader((t, f, b) => this._packet(t, f, b));
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.rx = Date.now();
      this._raw(connectPacket(`bjj-${o.id}-${this.i}`, `${o.base}/hb/${o.id}`, JSON.stringify({ bye: 2, k: this.i }), 20));
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.rx = Date.now();
      const d = e.data;
      try {
        if (d instanceof ArrayBuffer) this.rd.push(new Uint8Array(d));
        else if (d && d.buffer instanceof ArrayBuffer) this.rd.push(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
      } catch (err) {
        this.drop(ws);
      }
    };
    ws.onclose = () => this.drop(ws);
    ws.onerror = () => this.drop(ws);
  }

  _packet(t, f, b) {
    const o = this.o;
    if (t === 2) {
      // CONNACK
      if (b.length < 2 || b[1] !== 0) {
        this.drop(this.ws);
        return;
      }
      const now = Date.now();
      this.up = true;
      this.upAt = now;
      this.due = now + 8000;
      this.ping = now;
      this.have = new Set();
      this.bdN = 0;
      this.sub(`${o.base}/hb/+`);
      this.sub(`${o.base}/bd/+`);
      if (o.place) this.sub(`${o.base}/mv/${o.place}/+`);
      o._linkUp(this);
    } else if (t === 3) {
      // PUBLISH
      if (!this.up || b.length < 2) return;
      const tl = (b[0] << 8) | b[1];
      let at = 2 + tl;
      if (f & 6) at += 2;
      if (at > b.length) return;
      let topic;
      try { topic = td.decode(b.subarray(2, 2 + tl)); } catch (e) { return; }
      const bd = topic.startsWith(`${o.base}/bd/`);
      // a kept copy of anything but a guestbook entry is old by definition
      if ((f & 1) && !bd) return;
      if (bd) o._board(this, topic.slice(o.base.length + 4), b.subarray(at));
      else o._msg(this, topic, b.subarray(at));
    } else if (t === 9) this.acked = true; // SUBACK
  }

  _raw(u8) {
    try {
      if (this.ws && this.ws.readyState === 1) this.ws.send(u8);
    } catch (e) { /* the socket is closing; drop() follows */ }
  }

  _pid() {
    this.pid = (this.pid % 65535) + 1;
    return u16(this.pid);
  }

  sub(topic) {
    this._raw(frame(8, 2, [this._pid(), utf(topic), QOS0]));
  }

  unsub(topic) {
    this._raw(frame(10, 2, [this._pid(), utf(topic)]));
  }

  // keep: ask the relay to hold on to the message for later subscribers (guestbook entries only)
  pub(topic, body, force, keep) {
    if (!this.up || !this.ws) return false;
    if (!force && this.ws.bufferedAmount > 32768) return false; // a slow network: skip instead of piling up
    this._raw(frame(3, keep ? 1 : 0, [topic, body]));
    return true;
  }

  // Called about once a second.
  check(now) {
    if (!this.ws) return;
    if (!this.up) {
      if (now - this.at > 10000) this.drop(this.ws);
      return;
    }
    if (now - this.ping >= 10000) {
      this.ping = now;
      this._raw(PINGREQ); // the answer counts as a sign of life even when nobody is talking
    }
    if (now - this.rx > 25000) {
      this.drop(this.ws);
      return;
    }
    if (!this.good && this.acked && now - this.upAt > 4000) {
      // Subscribed, yet our own heartbeat is not handed back: a relay set up not to return a
      // sender's own messages. Use it anyway, without the echo as a health check.
      this.mute = true;
      this.good = true;
      this.o._linkGood(this);
    }
    if (!this.mute && now > this.due) {
      this.drop(this.ws);
      return;
    }
    if (this.good && this.wait && now - this.upAt > 10000) this.wait = 0; // it held: forget the backoff
    if (this.acked && now - this.upAt > SEED_AFTER) this.o._seed(this);
  }

  _detach() {
    const ws = this.ws;
    this.ws = null;
    this.rd = null;
    const was = this.up;
    this.up = false;
    this.good = false;
    this.acked = false;
    this.mute = false;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = noop;
      try { ws.close(); } catch (e) { /* already closed */ }
    }
    return was;
  }

  // The connection is gone or useless: let go of it and try again later.
  drop(ws) {
    if (!this.ws || (ws && this.ws !== ws)) return;
    const was = this._detach();
    this.o._linkDown(this, was);
    this._retry();
  }

  // A clean goodbye: the relay does not send our last-will message after this.
  shut() {
    clearTimeout(this.t);
    if (!this.ws) return;
    if (this.up) this._raw(DISCONNECT);
    this._detach();
  }

  _retry() {
    const o = this.o;
    clearTimeout(this.t);
    if (o.asleep || o.closed) return;
    this.wait = this.wait ? Math.min(this.wait * 1.8, 30000) : 1000;
    this.t = setTimeout(() => this.open(), this.wait * (0.75 + Math.random() * 0.5));
  }
}

export class Relay {
  constructor(opts = {}) {
    this.WS = opts.WS || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.urls = (opts.urls || RELAYS).slice(0, 8);
    this.code = cleanCode(opts.code) || 'main';
    this.id = rid(10);
    this.base = `${SPACE}/${this.code}`;
    this.hbTopic = utf(`${this.base}/hb/${this.id}`);
    this.mvTopic = null;
    this.place = '';
    this.mine = {};
    this.seq = 0;
    this.others = new Map(); // id -> { q, pr, pl, mask, until, at, n, t0, stale }
    this.gone = new Map(); // id -> { q, at }: people who said goodbye, so a late message does not bring them back
    this.hs = new Set();
    this.cs = new Set();
    this.isOn = false;
    this.dirty = false;
    this.hbNow = true;
    this.lastHb = 0;
    this.swept = 0;
    this.asleep = false;
    this.sleptAt = 0;
    this.closed = false;
    this.sent = { hb: 0, mv: 0, bd: 0 };
    this.bs = new Set(); // guestbook listeners
    this.boardWant = null; // () => [[id, bytes], ...]: the entries the guestbook wants every relay to hold
    this.links = this.urls.map((u, i) => new Link(this, i, u));
    for (const l of this.links) l.open();
    this.timer = setInterval(() => this._tick(), SEND_EVERY);
    this._listen();
  }

  /* ---------- the room interface ---------- */

  presence(patch) {
    const next = Object.assign({}, this.mine);
    for (const k of Object.keys(patch || {})) {
      if (patch[k] === null || patch[k] === undefined) delete next[k];
      else next[k] = patch[k];
    }
    const was = this._who(this.mine);
    this.mine = next;
    const pl = typeof next.pl === 'string' && PLACE_RE.test(next.pl) ? next.pl : '';
    if (pl !== this.place) this._setPlace(pl);
    if (this._who(next) !== was) this.hbNow = true; // who or where changed: tell everyone, not only this place
    this.dirty = true;
    return Promise.resolve();
  }

  onPeers(h) {
    this.hs.add(h);
    Promise.resolve().then(() => { if (this.hs.has(h)) this._call(h, null); });
    return () => this.hs.delete(h);
  }

  peers() {
    return this._snap();
  }

  connected() {
    return this.isOn;
  }

  onConnection(h) {
    this.cs.add(h);
    Promise.resolve().then(() => { if (this.cs.has(h)) h(this.isOn); });
    return () => this.cs.delete(h);
  }

  // For the status line: how many relays are carrying traffic right now.
  info() {
    let up = 0;
    for (const l of this.links) if (l.good) up++;
    return { up, total: this.links.length, code: this.code };
  }

  close() {
    if (this.closed) return;
    this._sleep(true);
    this.closed = true;
    clearInterval(this.timer);
  }

  /* ---------- sending ---------- */

  _who(p) {
    return `${p.n}|${p.b}|${p.s}|${p.g}|${p.pl}`;
  }

  _setPlace(pl) {
    const old = this.place;
    this.place = pl;
    this.mvTopic = pl ? utf(`${this.base}/mv/${pl}/${this.id}`) : null;
    for (const l of this.links) {
      if (!l.up) continue;
      if (old) l.unsub(`${this.base}/mv/${old}/+`);
      if (pl) l.sub(`${this.base}/mv/${pl}/+`);
    }
  }

  _mask() {
    let m = 0;
    for (const l of this.links) if (l.good) m |= 1 << l.i;
    return m;
  }

  _body() {
    return te.encode(JSON.stringify({ q: ++this.seq, m: this._mask(), p: this.mine }));
  }

  // The relays a position update goes to: as few as reach everyone in this place.
  _cover() {
    const mine = this._mask();
    let any = false;
    let all = mine;
    let unknown = false;
    for (const p of this.others.values()) {
      if (p.pl !== this.place) continue;
      any = true;
      if (!p.mask) unknown = true;
      else all &= p.mask;
    }
    if (!any) return [];
    if (!mine || unknown) return this.links.filter((l) => l.up);
    let pick = 0;
    if (all) pick = all & -all; // one relay that everybody here shares
    else {
      for (const p of this.others.values()) {
        if (p.pl !== this.place) continue;
        const both = p.mask & mine;
        if (!both || (both & pick)) continue;
        pick |= both & -both;
      }
    }
    return this.links.filter((l) => l.good && ((pick >> l.i) & 1));
  }

  _flush(now) {
    if (this.asleep || this.closed) return;
    if (this.hbNow || now - this.lastHb >= HB_EVERY) {
      let n = 0;
      let body = null;
      for (const l of this.links) {
        if (!l.up) continue;
        if (!body) body = this._body();
        if (l.pub(this.hbTopic, body, true)) n++;
      }
      if (!n) return; // nothing is connected yet; hbNow stays set
      this.sent.hb += n;
      this.lastHb = now;
      this.hbNow = false;
      this.dirty = false;
      return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    if (!this.mvTopic) return;
    const cover = this._cover();
    if (!cover.length) return; // nobody else is here: the next heartbeat carries it
    const body = this._body();
    for (const l of cover) if (l.pub(this.mvTopic, body, false)) this.sent.mv++;
  }

  _tick() {
    const now = Date.now();
    if (now - this.swept >= 1000) {
      this.swept = now;
      this._sweep(now);
    }
    this._flush(now);
  }

  _sweep(now) {
    if (this.asleep) return;
    let left = null;
    for (const [id, p] of this.others) {
      if (now > p.until) {
        this.others.delete(id);
        (left || (left = [])).push({ peer: id });
      }
    }
    for (const [id, g] of this.gone) if (now - g.at > 15000) this.gone.delete(id);
    if (left) this._fire(left);
    for (const l of this.links) l.check(now);
  }

  /* ---------- guestbook ---------- */

  // fn(id, bytes) for every guestbook entry a relay shows us, kept ones and new ones alike.
  onBoard(fn) {
    this.bs.add(fn);
    return () => this.bs.delete(fn);
  }

  // Put an entry on every relay that is connected; _seed() brings it to the others later.
  postBoard(id, bytes) {
    if (!ID_RE.test(id) || bytes.length > MAX_BOARD) return 0;
    const topic = utf(`${this.base}/bd/${id}`);
    let n = 0;
    for (const l of this.links) {
      if (!l.pub(topic, bytes, true, true)) continue;
      l.have.add(id);
      n++;
    }
    this.sent.bd += n;
    return n;
  }

  _board(link, id, bytes) {
    if (!ID_RE.test(id) || bytes.length > MAX_BOARD || ++link.bdN > BOARD_IN) return;
    link.have.add(id);
    if (!bytes.length) return; // cleared on the relay by hand: says nothing about the entry itself
    for (const h of this.bs) {
      try { h(id, bytes); } catch (e) { /* a handler's own problem */ }
    }
  }

  // A relay that has had time to show what it holds, and still lacks entries we know: put a few
  // back each second, newest first.
  _seed(link) {
    if (!this.boardWant || this.asleep) return;
    let n = 0;
    for (const [id, bytes] of this.boardWant()) {
      if (link.have.has(id)) continue;
      if (!link.pub(utf(`${this.base}/bd/${id}`), bytes, false, true)) return;
      link.have.add(id);
      this.sent.bd++;
      if (++n >= 3) return;
    }
  }

  /* ---------- receiving ---------- */

  _msg(link, topic, bytes) {
    const base = this.base;
    if (bytes.length > MAX_BODY || topic.length > base.length + 40 || !topic.startsWith(`${base}/`)) return;
    const rest = topic.slice(base.length + 1);
    let id = '';
    if (rest.startsWith('hb/')) id = rest.slice(3);
    else if (this.place && rest.startsWith(`mv/${this.place}/`)) id = rest.slice(4 + this.place.length);
    if (!ID_RE.test(id)) return;
    const now = Date.now();
    if (id === this.id) {
      // our own message, back from the relay: this connection works in both directions
      link.due = now + 12000;
      link.mute = false;
      if (!link.good) {
        link.good = true;
        this._linkGood(link);
      }
      return;
    }
    let m;
    try { m = JSON.parse(td.decode(bytes)); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    let p = this.others.get(id);
    if (m.bye) {
      if (m.bye === 2) {
        if (!p) return;
        // Sent by a relay on the person's behalf: that one connection was lost. It can also be an
        // old connection of someone who has long since reconnected (some relays only notice a
        // closed socket when its keep-alive runs out), so it never removes anyone by itself: it
        // shortens the wait only when no other relay is known to reach them, and their next
        // heartbeat cancels even that.
        if (typeof m.k === 'number' && m.k >= 0 && m.k < 8) p.mask &= ~(1 << m.k);
        if (!p.mask) p.until = Math.min(p.until, now + WILL_GRACE);
        return;
      }
      if (typeof m.q !== 'number' || !Number.isFinite(m.q) || (p && m.q < p.q)) return;
      // Remembered even when nobody by that id is listed: an earlier message of theirs may still
      // be on its way through a slower relay, and must not bring them back as a ghost.
      if (p || this.gone.size < 200) this.gone.set(id, { q: m.q, at: now });
      if (p) {
        this.others.delete(id);
        this._fire([{ peer: id }]);
      }
      return;
    }
    const q = m.q;
    if (typeof q !== 'number' || !Number.isFinite(q) || q < 1 || q > 1e9) return;
    if (!m.p || typeof m.p !== 'object' || Array.isArray(m.p)) return;
    const g = this.gone.get(id);
    if (g) {
      if (q <= g.q) return;
      this.gone.delete(id);
    }
    if (!p) {
      if (this.others.size >= MAX_PEERS) return;
      p = { q: 0, pr: {}, pl: null, mask: 0, until: 0, at: now, n: 0, t0: now, stale: 0 };
      this.others.set(id, p);
      this.hbNow = true; // let the newcomer see us right away
    }
    if (now - p.t0 >= 1000) {
      p.t0 = now;
      p.n = 0;
    }
    if (++p.n > MAX_RATE) return;
    if (q === p.q) return; // the same message through another relay
    if (q < p.q) {
      // out of order. If nothing newer shows up for a while the counter was bad: start over from here.
      if (!p.stale) p.stale = now;
      if (now - p.stale < 3000) return;
    }
    p.stale = 0;
    p.q = q;
    p.pr = m.p;
    p.mask = typeof m.m === 'number' ? m.m & 255 : 0;
    p.at = now;
    p.until = now + PEER_TTL;
    const pl = typeof m.p.pl === 'string' ? m.p.pl : '';
    if (pl !== p.pl) {
      if (pl && pl === this.place) this.hbNow = true; // they just walked in here: show them where we stand
      p.pl = pl;
    }
    this._fire(null);
  }

  _snap() {
    const now = Date.now();
    const out = [{ peer: this.id, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: this.mine, updatedAt: now }];
    for (const [id, p] of this.others) out.push({ peer: id, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: p.pr, updatedAt: p.at });
    return out;
  }

  _call(h, left) {
    const peers = this._snap();
    try {
      h({ peers, joined: [], updated: peers, left: left || [] });
    } catch (e) { /* a handler's own problem */ }
  }

  _fire(left) {
    for (const h of this.hs) this._call(h, left);
  }

  /* ---------- connection state ---------- */

  _conn() {
    let on = false;
    for (const l of this.links) if (l.good) on = true;
    if (on === this.isOn) return;
    this.isOn = on;
    for (const h of this.cs) {
      try { h(on); } catch (e) { /* a handler's own problem */ }
    }
  }

  _linkUp() {
    this.hbNow = true;
    this._flush(Date.now());
  }

  _linkGood() {
    this.hbNow = true; // tell the others that this relay reaches us now
    this._conn();
  }

  _linkDown(link, was) {
    this._conn();
    if (was) this.hbNow = true; // the set of relays we listen on changed
  }

  _listen() {
    if (typeof document === 'undefined' || typeof window === 'undefined' || !window.addEventListener) return;
    document.addEventListener('visibilitychange', () => (document.hidden ? this._sleep(false) : this._wake()));
    window.addEventListener('pagehide', () => this._sleep(true));
    window.addEventListener('pageshow', () => this._wake());
    window.addEventListener('online', () => {
      for (const l of this.links) {
        if (l.ws) continue;
        l.wait = 0;
        l.open();
      }
    });
  }

  // The page went to the background or is closing: say goodbye so nobody sees a frozen body.
  _sleep(final) {
    if (this.closed) return;
    if (!this.asleep) {
      this.asleep = true;
      this.sleptAt = Date.now();
      const body = te.encode(JSON.stringify({ q: ++this.seq, bye: 1 }));
      for (const l of this.links) l.pub(this.hbTopic, body, true);
    }
    if (final) for (const l of this.links) l.shut();
  }

  _wake() {
    if (this.closed || !this.asleep) return;
    this.asleep = false;
    const now = Date.now();
    const long = now - this.sleptAt > 25000; // longer than the relays keep a silent connection
    for (const p of this.others.values()) p.until = Math.max(p.until, now + 3000);
    for (const l of this.links) {
      if (l.ws && long) l._detach();
      if (!l.ws) {
        l.wait = 0;
        l.open();
      } else if (l.up) l.due = now + 5000;
    }
    this._conn();
    this.hbNow = true;
    this._flush(now);
  }
}

// Relay addresses for a local test broker: only honoured when the page itself runs on this machine.
function localRelays() {
  try {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    const m = /[?&]relay=([^&]+)/.exec(location.search);
    if (!m) return null;
    const list = decodeURIComponent(m[1]).split(',').filter((u) => /^ws:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(u));
    return list.length ? list : null;
  } catch (e) {
    return null;
  }
}

// ?r=code keeps a group to itself; everyone else shares the main room.
export function roomCode() {
  try {
    const m = /[?&]r=([^&]+)/.exec(location.search);
    return m ? cleanCode(decodeURIComponent(m[1])) : '';
  } catch (e) {
    return '';
  }
}

export function relayRoom() {
  if (typeof WebSocket === 'undefined' || typeof TextEncoder === 'undefined') return null;
  try {
    return new Relay({ urls: localRelays() || RELAYS, code: roomCode() });
  } catch (e) {
    return null;
  }
}
