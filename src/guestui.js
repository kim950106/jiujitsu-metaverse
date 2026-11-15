/* global document, window, requestAnimationFrame */
// The guestbook dialog: a wall of the drawings left so far, and a pad for drawing a new one with
// a finger. The pad reads touches in the stage's own frame (stage.js), so it works the same when
// the stage is turned on its side on an upright phone.
import { drawStrokes, makeStroke, packedSize, metaLine, GRID, INKS, PENS, MAX_BYTES } from './guest.js';
import { BELTS } from './util.js';
import { point, box } from './stage.js';

const $ = (s) => document.querySelector(s);
const PAPER = '#f6f3ea';
const SHORT = { white: '화이트', blue: '블루', purple: '퍼플', brown: '브라운', black: '블랙' };

export function initGuest({ guest, openModal, toast, sel }) {
  const modal = $('#modal-guest');
  const listView = $('#gb-list');
  const padView = $('#gb-pad');
  const grid = $('#gb-grid');
  const cv = $('#gb-canvas');
  const cx = cv.getContext('2d');
  const wrap = $('#gb-draw');
  let strokes = [];
  let raw = null; // the line being drawn: [[x, y], ...] in grid units
  let ink = 0;
  let pen = 1;
  let pid = null;
  let queued = false;

  /* ---------- the wall ---------- */
  const paintList = () => {
    const list = guest.list();
    grid.textContent = '';
    for (const e of list) {
      const fig = document.createElement('figure');
      fig.className = 'gb-card';
      const c = document.createElement('canvas');
      c.width = GRID.w * 2;
      c.height = GRID.h * 2;
      const g = c.getContext('2d');
      g.fillStyle = PAPER;
      g.fillRect(0, 0, c.width, c.height);
      drawStrokes(g, e.strokes, c.width, c.height);
      const cap = document.createElement('figcaption');
      cap.textContent = metaLine(e) + (e.mine ? ' (나)' : '');
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', `${e.n} 님이 남긴 그림`);
      fig.append(c, cap);
      if (e.mine) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = '삭제';
        let armed = 0;
        del.addEventListener('click', () => {
          // a second press within a few seconds removes it
          if (Date.now() - armed < 4000) {
            guest.remove(e.id);
            toast('내 그림을 지웠습니다');
            return;
          }
          armed = Date.now();
          del.textContent = '한 번 더 누르면 삭제';
          setTimeout(() => { if (del.isConnected) del.textContent = '삭제'; }, 4000);
        });
        fig.appendChild(del);
      }
      grid.appendChild(fig);
    }
    $('#gb-empty').hidden = !!list.length;
    $('#gb-note').textContent = guest.shared
      ? '손가락으로 그려서 남기는 게시판입니다. 누구나 쓰는 무료 공개 서버에 올려 두는 것이라 오래 남는다는 보장이 없고, 한번 본 그림은 이 기기에도 보관합니다.'
      : '손가락으로 그려서 남기는 게시판입니다. 이 주소에서는 지금 쓰는 브라우저에만 저장됩니다. 다른 사람과 함께 보는 게시판은 함께 접속하는 주소에서 쓸 수 있습니다.';
  };

  /* ---------- the pad ---------- */
  const paintPad = () => {
    queued = false;
    cx.fillStyle = PAPER;
    cx.fillRect(0, 0, cv.width, cv.height);
    drawStrokes(cx, strokes, cv.width, cv.height);
    if (raw && raw.length) drawStrokes(cx, [{ c: ink, w: pen, pts: raw }], cv.width, cv.height);
  };
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paintPad);
  };
  const inkLeft = () => {
    const left = Math.max(0, Math.round(100 - (packedSize(strokes) / MAX_BYTES) * 100));
    $('#gb-ink').textContent = `남은 잉크 ${left}%`;
  };
  // Size the pad to the room there is: beside the tools on a wide stage, above them on a tall one.
  const fit = () => {
    if (padView.hidden || modal.hidden) return;
    const st = $('#stage');
    const W = st.clientWidth;
    const H = st.clientHeight;
    const side = W > H * 1.15;
    wrap.classList.toggle('side', side);
    const maxW = Math.min(W - 24, 760) - 30 - (side ? 150 : 0);
    const maxH = H - 24 - 30 - (side ? 0 : 190);
    const w = Math.max(150, Math.floor(Math.min(maxW, maxH * (GRID.w / GRID.h))));
    cv.style.width = `${w}px`;
    cv.style.height = `${Math.round((w * GRID.h) / GRID.w)}px`;
  };
  const at = (e) => {
    const r = box(cv);
    const p = point(e);
    return [((p.x - r.left) / r.width) * GRID.w - 0.5, ((p.y - r.top) / r.height) * GRID.h - 0.5];
  };
  const setInk = (i) => {
    ink = i;
    Array.from($('#gb-inks').children).forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  };
  const setPen = (i) => {
    pen = i;
    Array.from($('#gb-pens').children).forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  };
  const NAMES = ['검정', '빨강', '파랑', '초록', '보라', '노랑'];
  INKS.forEach((col, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ink';
    b.style.setProperty('--c', col);
    b.setAttribute('aria-label', `${NAMES[i]} 펜`);
    b.addEventListener('click', () => setInk(i));
    $('#gb-inks').appendChild(b);
  });
  PENS.forEach((wd, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pen';
    b.setAttribute('aria-label', ['가는 선', '보통 선', '굵은 선'][i]);
    const dot = document.createElement('i');
    dot.style.setProperty('--d', `${[5, 9, 15][i]}px`);
    b.appendChild(dot);
    b.addEventListener('click', () => setPen(i));
    $('#gb-pens').appendChild(b);
  });

  cv.addEventListener('pointerdown', (e) => {
    if (pid != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    pid = e.pointerId;
    try { cv.setPointerCapture(pid); } catch (err) { /* ignore */ }
    raw = [at(e)];
    later();
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || !raw) return;
    const more = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    if (more && more.length) for (const m of more) raw.push(at(m));
    else raw.push(at(e));
    if (raw.length > 6000) raw.length = 6000;
    later();
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (!raw) return;
    const st = makeStroke(raw, ink, pen);
    raw = null;
    if (st.pts.length) {
      if (strokes.length >= 150 || packedSize(strokes) + 2 + st.pts.length * 2 > MAX_BYTES) toast('잉크가 다 떨어졌습니다. 되돌리기로 줄인 뒤 남겨 주세요');
      else strokes.push(st);
    }
    inkLeft();
    later();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  const showList = () => {
    padView.hidden = true;
    listView.hidden = false;
    delete modal.dataset.sticky;
    paintList();
  };
  const showPad = () => {
    const s = sel();
    strokes = [];
    raw = null;
    pid = null;
    listView.hidden = true;
    padView.hidden = false;
    modal.dataset.sticky = '1'; // a stray touch beside the pad must not throw the drawing away
    $('#gb-as').textContent = `${s.name || '수련생'} ${SHORT[s.belt] || BELTS[s.belt].name} ${s.stripes}그랄로 남깁니다`;
    setInk(0);
    setPen(1);
    inkLeft();
    fit();
    paintPad();
  };
  $('#gb-new').addEventListener('click', showPad);
  $('#gb-back').addEventListener('click', showList);
  $('#gb-undo').addEventListener('click', () => { strokes.pop(); inkLeft(); later(); });
  $('#gb-clear').addEventListener('click', () => { strokes = []; inkLeft(); later(); });
  $('#gb-post').addEventListener('click', () => {
    if (!strokes.length) {
      toast('먼저 그림을 그려 주세요');
      return;
    }
    const s = sel();
    const res = guest.add({ name: s.name, belt: s.belt, stripes: s.stripes }, strokes);
    if (!res) {
      toast('남기지 못했습니다. 다시 그려 주세요');
      return;
    }
    showList();
    toast(!guest.shared ? '이 브라우저의 게시판에 남겼습니다' : res.sent ? '게시판에 남겼습니다' : '남겼습니다. 연결되면 다른 사람에게도 보입니다', 3600);
  });
  guest.onChange(() => { if (!modal.hidden && !listView.hidden) paintList(); });
  window.addEventListener('resize', () => setTimeout(fit, 60));

  const open = () => {
    showList();
    openModal('modal-guest');
  };
  $('#m-guest').addEventListener('click', open);
  $('#ask-guest').addEventListener('click', open);
  return { open, fit };
}
