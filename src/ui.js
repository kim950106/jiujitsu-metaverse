/* global window, document, localStorage, FileReader, Image, location, performance, navigator */
// DOM wiring: start screen, thumb stick and action buttons, rock-paper-scissors panel, menu, dialogs.
import { Game } from './game.js';
import { initBoard } from './board.js';
import { KINDS, KIND_OBJ, KIND_SUBJ } from './tech.js';
import { BELTS, GIS, clamp } from './util.js';
import { meetUrl } from './relay.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage may be unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const PLACE = {
  gym: { name: '전주 퍼스트짐 도청점', short: '도장', other: '대회장으로 이동', hash: 'dojo' },
  arena: { name: '치바 포트 아레나 · 아시아 선수권', short: '대회장', other: '도장으로 이동', hash: 'arena' },
};
const HANDS = { s: '✌️', r: '✊', p: '✋' };

// Fire on touch-down so buttons answer at once; the click path stays for keyboards and assistive tech.
function tap(el, fn) {
  let at = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    at = performance.now();
    fn(e);
  });
  el.addEventListener('click', (e) => {
    if (performance.now() - at < 700) return;
    fn(e);
  });
}

export function initUI(data) {
  const sel = { place: 'gym', belt: 'white', stripes: 0, gi: 'white', name: '' };
  try { Object.assign(sel, JSON.parse(store.get('bjjmeta.sel') || '{}')); } catch (e) { /* ignore */ }
  if (data && data.sel) Object.assign(sel, data.sel);
  if (location.hash === '#arena') sel.place = 'arena';
  else if (location.hash === '#dojo') sel.place = 'gym';
  if (!PLACE[sel.place]) sel.place = 'gym';
  if (!BELTS[sel.belt]) sel.belt = 'white';
  if (!GIS[sel.gi]) sel.gi = 'white';
  sel.stripes = clamp(parseInt(sel.stripes, 10) || 0, 0, 4);
  sel.name = String(sel.name || '').slice(0, 12);

  const toasts = $('#toasts');
  const toast = (msg, ms = 3000) => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toasts.appendChild(el);
    while (toasts.children.length > 2) toasts.removeChild(toasts.firstChild);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, ms);
  };

  /* ---------- big button and the label above the buttons ---------- */
  const mainBtn = $('#b-main');
  const chip = $('#chip');
  const hud = { prompt: null, partner: null, onMat: false };
  const paintPad = () => {
    const it = hud.prompt;
    mainBtn.textContent = it ? it.short || '사용' : '인사';
    mainBtn.classList.toggle('hot', !!it);
    const ready = !!hud.partner && hud.onMat;
    $$('.pb.sk').forEach((b) => b.classList.toggle('ready', ready));
    $$('.pb[data-act="roll"], .pb[data-act="shrimp"]').forEach((b) => b.classList.toggle('off', !hud.onMat));
    let label = '';
    if (it) label = typeof it.label === 'function' ? it.label() : it.label;
    else if (hud.partner) label = hud.onMat ? `상대: ${hud.partner.name}` : `상대: ${hud.partner.name} · 매트 위에서만`;
    chip.hidden = !label;
    chip.textContent = label;
  };

  /* ---------- rock-paper-scissors ---------- */
  const rps = $('#rps');
  const bar = $('#rps-bar');
  let barKey = '';
  const showDuel = (d) => {
    if (!d) {
      rps.hidden = true;
      barKey = '';
      return;
    }
    rps.hidden = false;
    const kind = KINDS[d.kind];
    $('#rps-title').textContent = `${d.mine ? `${d.name}에게 ${kind} 승부` : `${d.name}의 ${kind} 승부`}${d.round > 1 ? ` · ${d.round}번째` : ''}`;
    const picking = d.phase === 'pick';
    $('#rps-hands').hidden = !picking;
    $('#rps-versus').hidden = d.phase !== 'reveal';
    $('#rps-barwrap').hidden = !picking;
    $('#rps-cancel').hidden = d.phase === 'reveal';
    $$('.hand').forEach((b) => {
      b.setAttribute('aria-pressed', String(d.pick === b.dataset.hand));
      b.disabled = !!d.pick;
    });
    const status = $('#rps-status');
    if (d.phase === 'wait') status.textContent = '상대의 응답을 기다리는 중…';
    else if (picking) {
      status.textContent = d.pick ? '상대가 고르는 중…' : '가위바위보! 이긴 쪽이 기술을 겁니다';
      const key = `${d.round}`;
      if (key !== barKey) {
        barKey = key;
        bar.style.transition = 'none';
        bar.style.transform = `scaleX(${d.left / d.total})`;
        void bar.offsetWidth;
        bar.style.transition = `transform ${d.left}s linear`;
        bar.style.transform = 'scaleX(0)';
      }
    } else {
      barKey = '';
      $('#rps-me').textContent = HANDS[d.pick] || '';
      $('#rps-them').textContent = HANDS[d.their] || '';
      status.textContent = d.result > 0 ? `이겼습니다! ${KIND_OBJ[d.kind]} 겁니다` : d.result < 0 ? `졌습니다. 상대의 ${KIND_SUBJ[d.kind]} 들어옵니다` : '비겼습니다. 다시!';
    }
  };

  const menu = $('#menu');
  const toggleMenu = (force) => {
    const open = force == null ? menu.hidden : force;
    menu.hidden = !open;
    $('#menu-btn').setAttribute('aria-expanded', String(open));
  };

  const openModal = (id) => {
    toggleMenu(false);
    $$('.modal').forEach((m) => { m.hidden = m.id !== id; });
    if (game && game.ok) game.setStick(0, 0, false);
  };
  const closeModals = () => $$('.modal').forEach((m) => { m.hidden = true; });
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m || (e.target.closest && e.target.closest('[data-close]'))) m.hidden = true;
    });
  });

  let game = null; // set below; the panels above and below may be painted before it exists

  /* ---------- people ---------- */
  // mode '' until the first answer: nothing is claimed about the connection before it is known
  let crowd = { on: false, mode: '', host: 'claude', state: 'off', relay: null, others: [], here: 0 };
  const meet = meetUrl();
  if (meet) {
    $('#meet-link').href = meet;
    $('#solo-link').href = meet;
  }
  const paintPeople = () => {
    const n = crowd.others.length + 1;
    $('#people-n').textContent = String(n);
    const live = $('#live');
    live.hidden = !(crowd.on && crowd.others.length);
    live.textContent = `지금 함께 접속 중: ${n}명`;
    // on the start screen: where the others are, so friends pick the same place
    const count = { gym: 0, arena: 0 };
    for (const o of crowd.others) if (count[o.place] != null) count[o.place]++;
    $$('.here').forEach((el) => {
      const k = count[el.dataset.here] || 0;
      el.hidden = !k;
      el.textContent = k ? `지금 ${k}명 있음` : '';
    });
    const list = $('#people-list');
    list.textContent = '';
    const row = (name, belt, where) => {
      const li = document.createElement('li');
      const sw = document.createElement('i');
      sw.className = 'sw';
      sw.style.background = BELTS[belt] ? BELTS[belt].css : '#888';
      const b = document.createElement('b');
      b.textContent = name;
      const s = document.createElement('span');
      s.textContent = where;
      li.append(sw, b, s);
      list.appendChild(li);
    };
    const at = (pl) => (PLACE[pl] ? PLACE[pl].short : '첫 화면');
    row(`${sel.name || '수련생'} (나)`, sel.belt, game && game.mode === 'play' ? at(sel.place) : '첫 화면');
    for (const o of crowd.others) row(o.name, o.belt, at(o.place));
    const relay = crowd.mode === 'relay';
    const r = crowd.relay || { up: 0, total: 0 };
    const together = crowd.others.length ? `나를 포함해 ${n}명이 접속해 있습니다.` : '';
    let state = '';
    let note = '';
    if (relay) {
      state = !r.up ? '연결하는 중입니다. 연결되면 같은 주소로 들어온 사람이 여기에 나타납니다.'
        : together || '연결되었습니다. 아직 다른 사람은 들어오지 않았습니다.';
      note = `연결은 누구나 쓸 수 있는 공개 중계 서버를 거칩니다. 그래서 이름, 띠, 위치처럼 화면에 보이는 것만 주고받습니다. 지금 연결된 중계 서버: ${r.up}/${r.total}`;
    } else if (crowd.on) {
      state = together || '연결되어 있습니다. 아직 다른 사람은 들어오지 않았습니다.';
      note = 'Claude 페이지에서는 같은 조직 구성원이거나 이 페이지에 초대받은 사람이 로그인해서 열어야 서로 연결됩니다. 공개 링크로만 들어온 사람은 여기서 만날 수 없습니다.';
    } else if (crowd.mode === '') {
      state = '연결을 확인하는 중입니다.';
    } else {
      state = '지금은 혼자 접속해 있습니다.';
      note = crowd.host === 'claude'
        ? 'Claude 페이지에서는 공개 링크로 들어온 사람끼리 연결되지 않습니다. 이 화면에서는 혼자 둘러볼 수 있습니다.'
        : '이 브라우저에서는 다른 사람과 연결할 수 없습니다.';
    }
    $('#people-state').textContent = state;
    $('#people-note').textContent = note;
    $('#people-note').hidden = !note;
    $('#invite').hidden = !relay;
    $('#people-meet').hidden = !(meet && crowd.host === 'claude' && crowd.mode !== '');
    const solo = crowd.mode === 'off' && crowd.host === 'claude';
    $('#solo').hidden = !solo;
    $('#solo-text').textContent = solo ? '이 주소에서는 혼자 둘러보기만 됩니다.' : '';
    $('#solo-link').hidden = !(solo && meet);
  };

  // The address to send to a friend: this page, with the place kept so they land in the same one.
  const pageUrl = () => {
    try { return location.href; } catch (e) { return ''; }
  };
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* older browsers and some in-app browsers: fall back */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  };
  $('#inv-copy').addEventListener('click', async () => {
    toast((await copyText(pageUrl())) ? '주소를 복사했습니다. 친구에게 붙여 넣어 보내세요.' : '복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요.');
  });
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    $('#inv-share').hidden = false;
    $('#inv-share').addEventListener('click', () => {
      try {
        const pr = navigator.share({ title: '주짓수 메타버스', text: '주짓수 메타버스에서 만나요', url: pageUrl() });
        if (pr && pr.catch) pr.catch(() => {});
      } catch (e) { /* cancelled or not allowed here */ }
    });
  }

  game = new Game($('#scene'), {
    toast,
    zone: (label) => { $('#zone').textContent = label || ''; },
    prompt: (it) => { hud.prompt = it || null; paintPad(); },
    partner: (tg) => { hud.partner = tg; if (tg) hud.onMat = tg.onMat; paintPad(); },
    mat: (on) => { hud.onMat = on; paintPad(); },
    duel: showDuel,
    open: (what) => { if (what === 'master') openModal('modal-master'); },
    openBelt: () => openModal('modal-belt'),
    net: (s) => { $('#net-dot').dataset.s = s; },
    people: (p) => { crowd = p; paintPeople(); },
    joined: (name) => toast(`${name} 님이 들어왔습니다`),
    company: (k) => toast(`지금 이곳에 ${k}명이 함께 있습니다`),
    menu: () => {
      if ($$('.modal').some((m) => !m.hidden)) closeModals();
      else toggleMenu();
    },
  });
  if (!game.ok) {
    $('#nogl').hidden = false;
    $('#enter').disabled = true;
  }
  initBoard({ openModal, toast, sel: () => sel });

  /* ---------- start screen ---------- */
  const paint = () => {
    $$('.place').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === sel.place)));
    $$('.belt').forEach((b) => {
      const on = b.dataset.belt === sel.belt;
      b.setAttribute('aria-pressed', String(on));
      Array.from(b.querySelectorAll('.bar i')).forEach((i, k) => i.classList.toggle('on', on && k < sel.stripes));
    });
    $$('.gi').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gi === sel.gi)));
    $('#stripes-val').textContent = String(sel.stripes);
    $('#stripes-minus').disabled = sel.stripes <= 0;
    $('#stripes-plus').disabled = sel.stripes >= 4;
    $('#enter').textContent = `${PLACE[sel.place].short}으로 입장`;
    $('#summary').textContent = `${BELTS[sel.belt].name} ${sel.stripes}그랄 · ${GIS[sel.gi].name} 도복 · 성인부 경기 ${BELTS[sel.belt].minutes}분`;
    if (game.ok) game.setSelection(sel);
    store.set('bjjmeta.sel', JSON.stringify(sel));
  };
  $$('.place').forEach((b) => b.addEventListener('click', () => { sel.place = b.dataset.place; paint(); }));
  $$('.belt').forEach((b) => b.addEventListener('click', () => { sel.belt = b.dataset.belt; paint(); }));
  $$('.gi').forEach((b) => b.addEventListener('click', () => { sel.gi = b.dataset.gi; paint(); }));
  $('#stripes-minus').addEventListener('click', () => { sel.stripes = clamp(sel.stripes - 1, 0, 4); paint(); });
  $('#stripes-plus').addEventListener('click', () => { sel.stripes = clamp(sel.stripes + 1, 0, 4); paint(); });
  const nick = $('#nick');
  nick.value = sel.name;
  nick.addEventListener('input', () => { sel.name = nick.value.trim().slice(0, 12); paint(); });

  const hudEl = $('#hud');
  const startEl = $('#start');
  const showHud = () => {
    startEl.hidden = true;
    hudEl.hidden = false;
    $('#place-name').textContent = PLACE[sel.place].name;
    $('#m-place').textContent = PLACE[sel.place].other;
    try { location.hash = PLACE[sel.place].hash; } catch (e) { /* ignore */ }
  };
  const enter = (at) => {
    if (!game.ok) return;
    game.sound.unlock();
    hud.prompt = null;
    hud.partner = null;
    hud.onMat = false;
    showDuel(null);
    game.enter(sel.place, at);
    paintPad();
    showHud();
    paintPeople();
  };
  $('#setup').addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    enter();
  });

  /* ---------- thumb stick ---------- */
  const zone = $('#stick-zone');
  const stick = $('#stick');
  const knob = stick.firstElementChild;
  let sid = null;
  let sx = 0;
  let sy = 0;
  let rad = 50;
  const setKnob = (dx, dy, run) => {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.classList.toggle('run', run);
  };
  const endStick = (e) => {
    if (e && e.pointerId !== sid) return;
    sid = null;
    stick.classList.remove('float');
    stick.style.left = '';
    stick.style.top = '';
    setKnob(0, 0, false);
    game.setStick(0, 0, false);
  };
  zone.addEventListener('pointerdown', (e) => {
    if (sid != null || e.pointerType === 'mouse') return;
    e.preventDefault();
    sid = e.pointerId;
    try { zone.setPointerCapture(sid); } catch (err) { /* ignore */ }
    const r = zone.getBoundingClientRect();
    rad = stick.offsetWidth * 0.4;
    sx = e.clientX;
    sy = e.clientY;
    stick.classList.add('float');
    stick.style.left = `${e.clientX - r.left}px`;
    stick.style.top = `${e.clientY - r.top}px`;
    game.setStick(0, 0, true);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = (e.clientX - sx) / rad;
    let dy = (e.clientY - sy) / rad;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    setKnob(dx * rad, dy * rad, l > 0.86);
    game.setStick(dx, -dy, true);
  });
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);
  zone.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => endStick());

  /* ---------- buttons ---------- */
  $$('.pb[data-act]').forEach((b) => tap(b, (e) => { e.preventDefault(); game.act(b.dataset.act); }));
  tap(mainBtn, (e) => { e.preventDefault(); game.main(); });
  tap(chip, (e) => { e.preventDefault(); if (hud.prompt) game.main(); });
  $$('.hand').forEach((b) => tap(b, (e) => { e.preventDefault(); game.sim.pick(b.dataset.hand); }));
  $('#rps-cancel').addEventListener('click', () => game.sim.cancelDuel());
  hudEl.addEventListener('contextmenu', (e) => e.preventDefault());
  const hold = (el, dir) => {
    const off = () => { game.spin = 0; };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      game.spin = dir;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') game.cam.yaw += dir * 0.4; });
  };
  hold($('#cam-l'), 1);
  hold($('#cam-r'), -1);
  tap($('#zoom-in'), () => game.zoom(-1));
  tap($('#zoom-out'), () => game.zoom(1));
  $('#menu-btn').addEventListener('click', () => toggleMenu());
  $('#people-btn').addEventListener('click', () => { paintPeople(); openModal('modal-people'); });
  $('#m-people').addEventListener('click', () => { paintPeople(); openModal('modal-people'); });
  $('#m-place').addEventListener('click', () => {
    sel.place = sel.place === 'gym' ? 'arena' : 'gym';
    paint();
    toggleMenu(false);
    enter();
  });
  $('#m-look').addEventListener('click', () => {
    toggleMenu(false);
    showDuel(null);
    game.toStart();
    hudEl.hidden = true;
    startEl.hidden = false;
  });
  $('#m-logo').addEventListener('click', () => openModal('modal-logo'));
  $('#m-belt').addEventListener('click', () => openModal('modal-belt'));
  $('#m-help').addEventListener('click', () => openModal('modal-help'));
  $('#m-sound').addEventListener('click', () => {
    game.sound.unlock();
    game.sound.setOn(!game.sound.on);
    $('#m-sound').textContent = game.sound.on ? '소리 끄기' : '소리 켜기';
  });
  $('#m-close').addEventListener('click', () => toggleMenu(false));
  const full = $('#m-full');
  const root = document.documentElement;
  if (document.fullscreenEnabled && root.requestFullscreen) {
    full.hidden = false;
    full.addEventListener('click', () => {
      toggleMenu(false);
      try {
        const pr = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
        if (pr && pr.catch) pr.catch(() => toast('이 화면에서는 전체 화면을 쓸 수 없습니다'));
      } catch (e) { toast('이 화면에서는 전체 화면을 쓸 수 없습니다'); }
    });
    document.addEventListener('fullscreenchange', () => { full.textContent = document.fullscreenElement ? '전체 화면 끝내기' : '전체 화면'; });
  }

  /* ---------- logo slots (kept in this browser only) ---------- */
  const applyLogo = (kind, url, save) => {
    const img = new Image();
    img.onload = () => {
      game.setLogo(kind, img);
      const prev = $(`#logo-${kind}-prev`);
      prev.src = url;
      prev.hidden = false;
      $(`#logo-${kind}-clear`).hidden = false;
      if (save) store.set(`bjjmeta.logo.${kind}`, url);
    };
    img.src = url;
  };
  for (const kind of ['gym', 'event']) {
    const input = $(`#logo-${kind}`);
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 512 / Math.max(img.width, img.height, 1));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * s));
          cv.height = Math.max(1, Math.round(img.height * s));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          let url = fr.result;
          try { url = cv.toDataURL('image/png'); } catch (e) { /* keep original */ }
          applyLogo(kind, url, true);
        };
        img.onerror = () => toast('이미지를 읽지 못했습니다. PNG나 JPG 파일로 다시 시도해 주세요');
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
    $(`#logo-${kind}-clear`).addEventListener('click', () => {
      game.setLogo(kind, null);
      store.del(`bjjmeta.logo.${kind}`);
      input.value = '';
      $(`#logo-${kind}-prev`).hidden = true;
      $(`#logo-${kind}-clear`).hidden = true;
    });
    const saved = store.get(`bjjmeta.logo.${kind}`);
    if (saved && game.ok) applyLogo(kind, saved, false);
  }

  window.addEventListener('hashchange', () => {
    if (startEl.hidden) return;
    if (location.hash === '#arena') sel.place = 'arena';
    else if (location.hash === '#dojo') sel.place = 'gym';
    paint();
  });

  paint();
  paintPad();
  paintPeople();
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    try { window.claude.hot.snapshot(() => game.state()); } catch (e) { /* ignore */ }
  }
  if (data && data.playing && game.ok) enter({ x: data.x, z: data.z, yaw: data.yaw });
  window.__bjj = game;
  return game;
}
