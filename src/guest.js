/* global localStorage, atob, btoa, TextEncoder, TextDecoder */
// The guestbook: short drawings left by visitors, each with the day it was left and the name,
// belt and stripes of whoever left it.
//
// On a copy hosted on its own address the entries travel through the public relays (relay.js) as
// kept messages, one per entry, and every browser also remembers what it has seen. On the
// claude.ai page there are no relays, so entries stay in the browser that made them.
//
// Nothing that arrives is trusted: size, shape and every coordinate are checked before use, and a
// drawing is only ever painted as lines on a canvas.
import { BELTS, clamp, cleanName } from './util.js';

export const GRID = { w: 256, h: 160 }; // a drawing is made of points on this grid
export const INKS = ['#15171a', '#d63a2f', '#2a62d4', '#1f8f4d', '#6a3fa3', '#d99a00'];
export const PENS = [2.2, 4.6, 8.5]; // line widths, in grid units
export const MAX_BYTES = 2048; // one drawing, packed
const MAX_STROKES = 160;
const KEEP = 60; // entries kept, newest first
const KEEP_DEAD = 200; // deletions remembered, so a removed entry is not brought back
const T0 = Date.UTC(2026, 0, 1);
const DAY = 86400000;
const BELT_SHORT = { white: '화이트', blue: '블루', purple: '퍼플', brown: '브라운', black: '블랙' };
const te = new TextEncoder();
const td = new TextDecoder();

/* ---------- strokes <-> bytes ---------- */

// strokes: [{ c: ink index, w: pen index, pts: [[x, y], ...] }] with whole numbers on the grid.
// Packed as, per stroke: one byte (pen << 3 | ink), one byte point count, then x, y per point.
export function packStrokes(strokes) {
  let n = 0;
  for (const s of strokes) n += 2 + s.pts.length * 2;
  const out = new Uint8Array(n);
  let o = 0;
  for (const s of strokes) {
    out[o++] = (s.w << 3) | s.c;
    out[o++] = s.pts.length;
    for (const p of s.pts) {
      out[o++] = p[0];
      out[o++] = p[1];
    }
  }
  return out;
}

// null unless the bytes are a well-formed drawing with something in it
export function unpackStrokes(u8) {
  if (!u8 || !u8.length || u8.length > MAX_BYTES) return null;
  const strokes = [];
  let o = 0;
  while (o < u8.length) {
    if (o + 2 > u8.length || strokes.length >= MAX_STROKES) return null;
    const head = u8[o++];
    const n = u8[o++];
    const c = head & 7;
    const w = head >> 3;
    if (c >= INKS.length || w >= PENS.length || n < 1 || o + n * 2 > u8.length) return null;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = u8[o++];
      const y = u8[o++];
      if (y >= GRID.h) return null;
      pts.push([x, y]);
    }
    strokes.push({ c, w, pts });
  }
  return strokes.length ? strokes : null;
}

export const packedSize = (strokes) => strokes.reduce((a, s) => a + 2 + s.pts.length * 2, 0);

const toB64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};
const fromB64 = (str) => {
  if (typeof str !== 'string' || str.length > 2800 || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) return null;
  try {
    const s = atob(str);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  } catch (e) {
    return null;
  }
};

// Thin a freehand line: drop the points that lie within eps of the line through their neighbours.
function thin(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0];
    const ay = pts[a][1];
    const dx = pts[b][0] - ax;
    const dy = pts[b][1] - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > far) {
        far = d;
        at = i;
      }
    }
    if (far > eps && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((p, i) => keep[i]);
}

// A line as the finger drew it (fractions of the grid) -> a stroke ready to pack.
export function makeStroke(raw, c, w) {
  let eps = 0.7;
  let pts = raw;
  for (let k = 0; k < 8; k++) {
    pts = thin(raw, eps);
    if (pts.length <= 255) break;
    eps *= 1.6;
  }
  const out = [];
  for (const p of pts.slice(0, 255)) {
    const x = clamp(Math.round(p[0]), 0, GRID.w - 1);
    const y = clamp(Math.round(p[1]), 0, GRID.h - 1);
    const last = out[out.length - 1];
    if (!last || last[0] !== x || last[1] !== y) out.push([x, y]);
  }
  return { c, w, pts: out };
}

// Paint strokes on a canvas context that is W x H pixels.
export function drawStrokes(c, strokes, W, H, x0 = 0, y0 = 0) {
  const k = W / GRID.w;
  const ky = H / GRID.h;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const s of strokes) {
    c.strokeStyle = INKS[s.c];
    c.fillStyle = INKS[s.c];
    c.lineWidth = PENS[s.w] * k;
    const p = s.pts;
    if (p.length === 1) {
      c.beginPath();
      c.arc(x0 + (p[0][0] + 0.5) * k, y0 + (p[0][1] + 0.5) * ky, (PENS[s.w] * k) / 2, 0, Math.PI * 2);
      c.fill();
      continue;
    }
    c.beginPath();
    c.moveTo(x0 + (p[0][0] + 0.5) * k, y0 + (p[0][1] + 0.5) * ky);
    for (let i = 1; i < p.length; i++) c.lineTo(x0 + (p[i][0] + 0.5) * k, y0 + (p[i][1] + 0.5) * ky);
    c.stroke();
  }
}

/* ---------- one entry ---------- */

// "2026.11.14 · 현철 블루 4그랄"
export function metaLine(e) {
  const d = new Date(e.t);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} · ${e.n} ${BELT_SHORT[e.b]} ${e.s}그랄`;
}

// Checked entry from whatever arrived, or null. { dead: true, t } marks a removed entry.
function clean(m, now) {
  if (!m || typeof m !== 'object' || m.v !== 1) return null;
  const t = m.t;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < T0 || t > now + 2 * DAY) return null;
  if (m.x === 1) return { dead: true, t };
  if (!BELTS[m.b]) return null;
  const u8 = fromB64(m.d);
  const strokes = unpackStrokes(u8);
  if (!strokes) return null;
  return {
    t, n: cleanName(m.n) || '수련생', b: m.b, s: typeof m.s === 'number' && Number.isFinite(m.s) ? clamp(m.s | 0, 0, 4) : 0,
    d: m.d, strokes,
  };
}

const wire = (e) => ({ v: 1, t: e.t, n: e.n, b: e.b, s: e.s, d: e.d });
const newId = () => {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += abc[(Math.random() * 36) | 0];
  return s;
};

export class Guestbook {
  // store: { get(k), set(k, v) } over the browser's storage (may be a stand-in that keeps nothing)
  constructor(store, code = 'main') {
    this.store = store;
    this.key = `bjjmeta.guest.${code}`;
    this.posts = new Map(); // id -> entry
    this.dead = new Map(); // id -> time removed
    this.own = new Set(); // ids left from this browser
    this.relay = null;
    this.hs = new Set();
    this._sorted = null;
    this._load();
  }

  // Shared with other people (through the relays), or kept in this browser only.
  get shared() {
    return !!this.relay;
  }

  attach(relay) {
    if (!relay || typeof relay.onBoard !== 'function') return;
    this.relay = relay;
    relay.onBoard((id, bytes) => this._in(id, bytes));
    relay.boardWant = () => this._want();
    this._fire();
  }

  onChange(fn) {
    this.hs.add(fn);
    return () => this.hs.delete(fn);
  }

  // newest first
  list() {
    if (!this._sorted) this._sorted = Array.from(this.posts, ([id, e]) => Object.assign({ id, mine: this.own.has(id) }, e)).sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : 1));
    return this._sorted;
  }

  // who: { name, belt, stripes }. Returns { id, sent } or null when there is nothing to leave.
  add(who, strokes) {
    const u8 = packStrokes(strokes);
    if (!unpackStrokes(u8)) return null;
    const e = clean({ v: 1, t: Date.now(), n: who.name, b: who.belt, s: who.stripes, d: toB64(u8) }, Date.now());
    if (!e) return null;
    const id = newId();
    this.posts.set(id, e);
    this.own.add(id);
    this._trim();
    this._save();
    this._fire();
    const sent = this.relay ? this.relay.postBoard(id, te.encode(JSON.stringify(wire(e)))) : 0;
    return { id, sent };
  }

  remove(id) {
    if (!this.posts.has(id)) return false;
    const t = Date.now();
    this.posts.delete(id);
    this.dead.set(id, t);
    this._save();
    this._fire();
    if (this.relay) this.relay.postBoard(id, te.encode(JSON.stringify({ v: 1, t, x: 1 })));
    return true;
  }

  /* ---------- from the relays ---------- */

  _in(id, bytes) {
    let m;
    try { m = JSON.parse(td.decode(bytes)); } catch (e) { return; }
    const e = clean(m, Date.now());
    if (!e) return;
    if (e.dead) {
      if (this.dead.has(id)) return;
      this.dead.set(id, e.t);
      const had = this.posts.delete(id);
      this._save();
      if (had) this._fire();
      return;
    }
    if (this.dead.has(id) || this.posts.has(id)) return;
    this.posts.set(id, e);
    this._trim();
    this._save();
    if (this.posts.has(id)) this._fire();
  }

  // What every relay should be holding: removals first (they are small and must win), then entries.
  _want() {
    const out = [];
    for (const [id, t] of this.dead) out.push([id, te.encode(JSON.stringify({ v: 1, t, x: 1 }))]);
    for (const e of this.list()) out.push([e.id, te.encode(JSON.stringify(wire(e)))]);
    return out;
  }

  /* ---------- keeping ---------- */

  _trim() {
    this._sorted = null;
    if (this.posts.size > KEEP) {
      for (const e of this.list().slice(KEEP)) this.posts.delete(e.id);
      this._sorted = null;
    }
    if (this.dead.size > KEEP_DEAD) {
      const old = Array.from(this.dead).sort((a, b) => b[1] - a[1]).slice(KEEP_DEAD);
      for (const [id] of old) this.dead.delete(id);
    }
    for (const id of this.own) if (!this.posts.has(id)) this.own.delete(id);
  }

  _fire() {
    this._sorted = null;
    for (const h of this.hs) {
      try { h(); } catch (e) { /* a handler's own problem */ }
    }
  }

  _save() {
    this._sorted = null;
    try {
      this.store.set(this.key, JSON.stringify({
        p: Array.from(this.posts, ([id, e]) => [id, wire(e)]),
        x: Array.from(this.dead),
        o: Array.from(this.own),
      }));
    } catch (e) { /* storage full or unavailable: the entries live on for this visit */ }
  }

  _load() {
    let o = null;
    try { o = JSON.parse(this.store.get(this.key) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return;
    const now = Date.now();
    const idOk = (id) => typeof id === 'string' && /^[a-z0-9]{10}$/.test(id);
    if (Array.isArray(o.x)) {
      for (const it of o.x.slice(0, KEEP_DEAD)) {
        if (Array.isArray(it) && idOk(it[0]) && typeof it[1] === 'number' && now - it[1] < 90 * DAY) this.dead.set(it[0], it[1]);
      }
    }
    if (Array.isArray(o.p)) {
      for (const it of o.p.slice(0, KEEP * 2)) {
        if (!Array.isArray(it) || !idOk(it[0]) || this.dead.has(it[0])) continue;
        const e = clean(it[1], now);
        if (e && !e.dead) this.posts.set(it[0], e);
      }
    }
    if (Array.isArray(o.o)) for (const id of o.o) if (idOk(id) && this.posts.has(id)) this.own.add(id);
    this._trim();
  }
}

// Storage that works even where the browser refuses it.
export function browserStore() {
  return {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };
}
