/* global window, document, localStorage, FileReader, Image, location, performance, navigator, MutationObserver, URL, File */
// DOM wiring: start screen, thumb stick and action buttons, rock-paper-scissors panel, menu, dialogs.
import { Game } from './game.js';
import { initBoard } from './board.js';
import { initGuest } from './guestui.js';
import { KINDS, KIND_OBJ } from './tech.js';
import { BELTS, GIS, clamp, mayBlack, maxStripes } from './util.js';
import { drawCard, cleanAge } from './card.js';
import { meetUrl, hostKind } from './relay.js';
import { stage, point, box } from './stage.js';

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
  sel.name = String(sel.name || '').slice(0, 12);
  if (sel.belt === 'black' && !mayBlack(sel.name)) sel.belt = 'brown'; // the black belt is kept for three names
  sel.stripes = clamp(parseInt(sel.stripes, 10) || 0, 0, maxStripes(sel.belt));

  const RULE_TEXT = { white: '5판 3선승', blue: '6판 4선승', purple: '7판 4선승', brown: '8판 5선승', black: '10판 6선승' };
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
  const hud = { prompt: null, partner: null, onMat: false, race: null, ask: false };
  // the sparring button, and the two lists that open from the pad: drills and things to say
  const sparBtn = $('#b-spar');
  const techBtn = $('.pb[data-pop="drill"]');
  const sayBtn = $('.pb[data-pop="say"]');
  const popTech = $('#pop-drill');
  const popSay = $('#pop-say');
  const closePops = () => {
    popTech.hidden = true;
    popSay.hidden = true;
    techBtn.setAttribute('aria-expanded', 'false');
    sayBtn.setAttribute('aria-expanded', 'false');
  };
  const togglePop = (pop, btn) => {
    const open = pop.hidden;
    closePops();
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  const paintPad = () => {
    const it = hud.prompt;
    const racing = hud.race && hud.race.phase !== 'done';
    mainBtn.textContent = racing ? (hud.race.phase === 'go' ? '새우!' : '준비') : it ? it.short || '사용' : '인사';
    mainBtn.classList.toggle('hot', !!it || (racing && hud.race.phase === 'go'));
    const ready = !!hud.partner && hud.onMat;
    sparBtn.classList.toggle('ready', ready || hud.ask);
    sparBtn.classList.toggle('off', !ready && !hud.ask);
    $$('[data-act="roll"], [data-act="rollb"], [data-act="scoot"], [data-act="shrimp"], [data-act="bridge"], [data-act="standup"]').forEach((b) => b.classList.toggle('off', !hud.onMat));
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
  // the strip with the rounds won on each side, which round this is and the rule
  const paintMatch = (sp) => {
    $('#matchbar').hidden = !sp;
    if (!sp) return;
    $('#mt-me').textContent = String(sp.me);
    $('#mt-them').textContent = String(sp.them);
    $('#mt-name').textContent = sp.name;
    const word = sp.end ? { win: '승리', lose: '패배', draw: '무승부' }[sp.end] || '' : '';
    $('#mt-clock').textContent = word || `${sp.n}판째`;
    $('#mt-pos').textContent = sp.rule;
    $('#mt-short').textContent = sp.rule; // the narrow bar on a phone
  };
  const showDuel = (d) => {
    if (!d) {
      rps.hidden = true;
      barKey = '';
      paintMatch(null);
      return;
    }
    closePops();
    paintMatch(d.spar || null);
    // the hands are only shown while hands are being thrown
    if (d.phase !== 'wait' && d.phase !== 'pick' && d.phase !== 'reveal') {
      rps.hidden = true;
      barKey = '';
      return;
    }
    const waiting = d.phase === 'wait';
    const picking = d.phase === 'pick';
    rps.hidden = false;
    rps.classList.toggle('match', !waiting);
    $('#rps-title').hidden = !waiting; // once it is on, the bar already says what is going on
    $('#rps-title').textContent = `${d.name} 님에게 스파링 신청 · ${d.rule}`;
    $('#rps-cancel').textContent = waiting ? '취소' : '기권';
    $('#rps-techs').hidden = !picking;
    $('#rps-hands').hidden = !picking;
    $('#rps-versus').hidden = d.phase !== 'reveal';
    $('#rps-barwrap').hidden = d.phase === 'reveal';
    $('#rps-cancel').hidden = d.phase === 'reveal';
    $$('.hand').forEach((b) => {
      b.setAttribute('aria-pressed', String(d.pick === b.dataset.hand));
      b.disabled = !!d.pick;
    });
    $$('#rps-techs button').forEach((b) => {
      b.setAttribute('aria-pressed', String(d.tech === b.dataset.tech));
      b.disabled = !!d.pick; // the technique is fixed once the hand is thrown
    });
    // (phones) one button that steps through the techniques, until the hand is thrown
    const choosing = picking && !d.pick;
    rps.classList.toggle('choose', choosing);
    $('#rps-cycle').hidden = !choosing;
    $('#rps-cycle').textContent = `기술 · ${KINDS[d.tech]} ⟳`;
    const status = $('#rps-status');
    if (waiting || picking) {
      status.textContent = waiting ? '상대의 수락을 기다리는 중…' : d.pick ? '상대가 고르는 중…' : `이기면 ${KINDS[d.tech]}!`;
      const key = `${d.phase}${d.round}`;
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
      status.textContent = d.result > 0 ? `이겼습니다! ${KIND_OBJ[d.tech]} 겁니다` : d.result < 0 ? '졌습니다. 상대의 기술이 들어옵니다' : '비겼습니다. 다시!';
    }
  };
  // somebody asks this player to spar: a = { name, rule, left, total } while they ask, else null
  const askBox = $('#sparask');
  const askBar = $('#sparask-bar');
  const showAsk = (a) => {
    const was = hud.ask;
    hud.ask = !!a;
    askBox.hidden = !a;
    if (was !== hud.ask) paintPad();
    if (!a || was) return;
    closePops();
    $('#sparask-text').textContent = `${a.name} 님이 스파링을 신청했습니다 · ${a.rule}`;
    askBar.style.transition = 'none';
    askBar.style.transform = `scaleX(${a.left / a.total})`;
    void askBar.offsetWidth;
    askBar.style.transition = `transform ${a.left}s linear`;
    askBar.style.transform = 'scaleX(0)';
  };

  const menu = $('#menu');
  const toggleMenu = (force) => {
    const open = force == null ? menu.hidden : force;
    menu.hidden = !open;
    $('#menu-btn').setAttribute('aria-expanded', String(open));
  };

  const openModal = (id) => {
    toggleMenu(false);
    closePops();
    $$('.modal').forEach((m) => { m.hidden = m.id !== id; });
    if (game && game.ok) game.setStick(0, 0, false);
  };
  const closeModals = () => $$('.modal').forEach((m) => { m.hidden = true; });
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m && m.dataset.sticky) return; // only its own buttons close it
      if (e.target === m || (e.target.closest && e.target.closest('[data-close]'))) m.hidden = true;
    });
  });

  let game = null; // set below; the panels above and below may be painted before it exists
  let desk = null; // the master's answers (timetable, sign-up sheet), likewise
  let book = null; // the guestbook dialog
  let flashT = 0;
  let takePhoto = () => {}; // set further down, with the rest of the photo code

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
    ask: showAsk,
    open: (what) => {
      if (what === 'master') openModal('modal-master');
      else if (what === 'time' && desk) desk.openTime();
      else if (what === 'guest' && book) book.open();
    },
    openBelt: () => openModal('modal-belt'),
    net: (s) => { $('#net-dot').dataset.s = s; },
    people: (p) => { crowd = p; paintPeople(); },
    joined: (name) => toast(`${name} 님이 들어왔습니다`),
    company: (k) => toast(`지금 이곳에 ${k}명이 함께 있습니다`),
    menu: () => {
      if (!popTech.hidden || !popSay.hidden) closePops();
      else if ($$('.modal').some((m) => !m.hidden)) closeModals();
      else toggleMenu();
    },
    // a shrimp race: r = { phase: 'count' | 'go' | 'done', time, prog, n } while it lasts, else null
    race: (r) => {
      const was = hud.race ? hud.race.phase : '';
      hud.race = r;
      if (was !== (r ? r.phase : '')) paintPad();
      $('#mash').hidden = !r;
      if (!r) return;
      $('#mash-l').textContent = '출발';
      $('#mash-r').textContent = '도착 6 m';
      $('#mash-timewrap').hidden = true;
      $('#mash-text').textContent = r.phase === 'count' ? '새우빼기 경주 · 준비' : `새우빼기 경주 · ${r.time.toFixed(1)}초`;
      $('#mash-bar').style.width = `${clamp(r.prog, 0, 1) * 100}%`;
    },
    // a finished race: the best time is remembered in this browser
    raceDone: (t) => {
      const old = parseFloat(store.get('bjjmeta.race') || '');
      const isBest = !(old > 0) || t < old;
      if (isBest) store.set('bjjmeta.race', t.toFixed(2));
      return { best: isBest ? t : old, isBest };
    },
    photo: (name) => toast(`${name} 님이 단체 사진을 찍습니다. 3, 2, 1!`, 3600),
    shoot: () => takePhoto(),
    flash: (f) => {
      const el = $('#flash');
      el.hidden = true;
      el.textContent = f.text;
      el.className = `flash ${f.kind === 'esc' ? 'esc' : f.kind === 'count' ? 'count' : ''}`;
      void el.offsetWidth; // start the animation again
      el.hidden = false;
      clearTimeout(flashT);
      flashT = setTimeout(() => { el.hidden = true; }, f.kind === 'count' ? 900 : 1500);
    },
    streak: (n) => {
      $('#streak').hidden = n < 2;
      $('#streak').textContent = `${n}연승`;
    },
  });
  if (!game.ok) {
    $('#nogl').hidden = false;
    $('#enter').disabled = true;
  }
  desk = initBoard({ openModal, toast, sel: () => sel });
  book = initGuest({ guest: game.guest, openModal, toast, sel: () => sel });

  /* ---------- start screen ---------- */
  const paint = () => {
    $$('.place').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === sel.place)));
    $$('.belt').forEach((b) => {
      const on = b.dataset.belt === sel.belt;
      b.setAttribute('aria-pressed', String(on));
      Array.from(b.querySelectorAll('.bar i')).forEach((i, k) => i.classList.toggle('on', on && k < sel.stripes));
    });
    $$('.gi').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gi === sel.gi)));
    const black = sel.belt === 'black';
    sel.stripes = clamp(sel.stripes, 0, maxStripes(sel.belt));
    $('#stripes-label').textContent = black ? '단(줄)' : '그랄(줄)';
    $('#stripes-val').textContent = String(sel.stripes);
    $('#stripes-minus').disabled = sel.stripes <= 0;
    $('#stripes-plus').disabled = sel.stripes >= maxStripes(sel.belt);
    $('#enter').textContent = `${PLACE[sel.place].short}으로 입장`;
    $('#summary').textContent = `${BELTS[sel.belt].name} ${sel.stripes}${black ? '단' : '그랄'} · ${GIS[sel.gi].name} 도복 · 스파링 ${RULE_TEXT[sel.belt]}`;
    if (game.ok) game.setSelection(sel);
    store.set('bjjmeta.sel', JSON.stringify(sel));
  };
  $$('.place').forEach((b) => b.addEventListener('click', () => { sel.place = b.dataset.place; paint(); }));
  $$('.belt').forEach((b) => b.addEventListener('click', () => {
    // the black belt is kept for three names: anyone else is told so and the choice is not taken
    if (b.dataset.belt === 'black' && !mayBlack(sel.name)) {
      openModal('modal-black');
      return;
    }
    sel.belt = b.dataset.belt;
    paint();
  }));
  $$('.gi').forEach((b) => b.addEventListener('click', () => { sel.gi = b.dataset.gi; paint(); }));
  $('#stripes-minus').addEventListener('click', () => { sel.stripes = clamp(sel.stripes - 1, 0, maxStripes(sel.belt)); paint(); });
  $('#stripes-plus').addEventListener('click', () => { sel.stripes = clamp(sel.stripes + 1, 0, maxStripes(sel.belt)); paint(); });
  const nick = $('#nick');
  nick.value = sel.name;
  const setName = (v) => {
    sel.name = String(v || '').trim().slice(0, 12);
    if (sel.belt === 'black' && !mayBlack(sel.name)) {
      sel.belt = 'brown';
      toast('검은 띠는 김상인, 양동건, 서현찬 세 분만 고를 수 있어 갈색 띠로 바꿨습니다', 4200);
    }
    paint();
  };
  nick.addEventListener('input', () => setName(nick.value));

  /* ---------- landscape on phones ----------
     While playing on a phone the stage is laid out in landscape. If the browser's own view is
     upright (rotation lock, or the phone simply held upright) the stage is turned a quarter by
     CSS; once the view itself is landscape the turn is dropped. A dialog with a field that can be
     typed into is shown upright, because the on-screen keyboard always follows the browser's
     view. */
  const root = document.documentElement;
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const isPhone = () => coarse && Math.min(window.innerWidth, window.innerHeight) < 600;
  const view = { on: store.get('bjjmeta.land') !== '0', side: store.get('bjjmeta.side') === 'r' ? 'r' : 'l', playing: false, told: false };
  const landBtn = $('#m-land');
  const flipBtn = $('#m-flip');
  let stickOff = () => {};
  const fitStage = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const typing = $$('.modal[data-upright]').some((m) => !m.hidden
      && Array.from(m.querySelectorAll('input:not([type="file"])')).some((i) => !i.disabled && !i.closest('[hidden]')));
    const turn = view.playing && view.on && isPhone() && h > w && !typing ? (view.side === 'r' ? -1 : 1) : 0;
    root.classList.toggle('rot', turn !== 0);
    root.classList.toggle('flip', turn === -1);
    if (turn) {
      root.style.setProperty('--sw', `${h}px`);
      root.style.setProperty('--sh', `${w}px`);
    } else {
      root.style.removeProperty('--sw');
      root.style.removeProperty('--sh');
    }
    if (turn !== stage.turn) {
      stage.turn = turn;
      stickOff();
      if (game && game.ok) game.touches.clear();
    }
    landBtn.hidden = !isPhone();
    landBtn.textContent = view.on ? '세로로 보기' : '가로로 보기';
    flipBtn.hidden = turn === 0;
    if (game && game.ok) game.resize();
    if (book) book.fit();
  };
  // Where the browser can really turn the screen (Android), ask for that: full screen, landscape.
  const lockLandscape = () => {
    const so = window.screen && window.screen.orientation;
    if (!view.on || !isPhone() || !so || typeof so.lock !== 'function' || !root.requestFullscreen) return;
    try {
      const pr = document.fullscreenElement ? null : root.requestFullscreen({ navigationUI: 'hide' });
      Promise.resolve(pr).then(() => so.lock('landscape')).catch(() => {});
    } catch (e) { /* stays with the CSS turn */ }
  };
  const unlockLandscape = () => {
    const so = window.screen && window.screen.orientation;
    try { if (so && typeof so.unlock === 'function') so.unlock(); } catch (e) { /* ignore */ }
  };
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', () => setTimeout(fitStage, 250));
  if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(fitStage);
    $$('.modal[data-upright]').forEach((m) => mo.observe(m, { attributes: true, attributeFilter: ['hidden', 'disabled'], subtree: true }));
  }
  landBtn.addEventListener('click', () => {
    view.on = !view.on;
    store.set('bjjmeta.land', view.on ? '1' : '0');
    toggleMenu(false);
    if (view.on) lockLandscape();
    else unlockLandscape();
    fitStage();
    toast(view.on ? '가로 화면으로 바꿨습니다. 휴대폰을 옆으로 눕혀 잡아 주세요' : '세로 화면으로 바꿨습니다');
  });
  flipBtn.addEventListener('click', () => {
    view.side = view.side === 'l' ? 'r' : 'l';
    store.set('bjjmeta.side', view.side);
    toggleMenu(false);
    fitStage();
  });

  const hudEl = $('#hud');
  const startEl = $('#start');
  const showHud = () => {
    startEl.hidden = true;
    hudEl.hidden = false;
    view.playing = true;
    fitStage();
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
    hud.race = null;
    showAsk(null);
    $('#mash').hidden = true;
    showDuel(null);
    // lay the stage out the way it will be played before the map is built, so that the opening
    // camera distance is chosen for that shape
    view.playing = true;
    fitStage();
    game.enter(sel.place, at);
    paintPad();
    showHud();
    paintPeople();
    // the arena hands out an athlete card at the door, once for each look the player comes in with
    if (sel.place === 'arena' && !at) {
      const o = cardSaved();
      if (!(o && o.key === cardKey())) setTimeout(() => { if (game.mode === 'play' && sel.place === 'arena' && !$$('.modal').some((m) => !m.hidden)) openCard(); }, 700);
    }
    // Tell once how to hold the phone, if the picture is still turned by CSS a moment later.
    if (!view.told) {
      view.told = true;
      setTimeout(() => {
        if (stage.turn) toast(`가로 화면입니다. 휴대폰을 ${stage.turn > 0 ? '왼쪽' : '오른쪽'}으로 눕혀 잡아 주세요 · 메뉴에서 뒤집거나 세로로 바꿀 수 있습니다`, 6500);
      }, 900);
    }
  };
  $('#setup').addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    lockLandscape();
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
  stickOff = () => endStick();
  zone.addEventListener('pointerdown', (e) => {
    if (sid != null || e.pointerType === 'mouse') return;
    e.preventDefault();
    sid = e.pointerId;
    try { zone.setPointerCapture(sid); } catch (err) { /* ignore */ }
    const r = box(zone);
    const p = point(e);
    rad = stick.offsetWidth * 0.4;
    sx = p.x;
    sy = p.y;
    stick.classList.add('float');
    stick.style.left = `${p.x - r.left}px`;
    stick.style.top = `${p.y - r.top}px`;
    game.setStick(0, 0, true);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    const p = point(e);
    let dx = (p.x - sx) / rad;
    let dy = (p.y - sy) / rad;
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
  $$('.pb[data-act]').forEach((b) => tap(b, (e) => { e.preventDefault(); closePops(); game.act(b.dataset.act); }));
  tap(techBtn, (e) => { e.preventDefault(); togglePop(popTech, techBtn); });
  tap(sayBtn, (e) => { e.preventDefault(); togglePop(popSay, sayBtn); });
  $$('.pop button').forEach((b) => tap(b, (e) => {
    e.preventDefault();
    closePops();
    if (b.dataset.say != null) game.say(Number(b.dataset.say));
    else if (b.dataset.photo != null) takePhoto();
    else game.act(b.dataset.act);
  }));
  // a touch anywhere else puts the lists away
  $('#scene').addEventListener('pointerdown', closePops);
  $('#stick-zone').addEventListener('pointerdown', closePops);
  tap(mainBtn, (e) => { e.preventDefault(); closePops(); game.main(); });
  tap(chip, (e) => { e.preventDefault(); if (hud.prompt) game.main(); });
  $$('.hand').forEach((b) => tap(b, (e) => { e.preventDefault(); game.sim.pick(b.dataset.hand); }));
  $$('#rps-techs button').forEach((b) => tap(b, (e) => { e.preventDefault(); game.sim.setTech(b.dataset.tech); }));
  tap($('#rps-cycle'), (e) => {
    e.preventDefault();
    const list = Object.keys(KINDS);
    game.sim.setTech(list[(list.indexOf(game.sim.tech) + 1) % list.length]);
  });
  $('#rps-cancel').addEventListener('click', () => game.sim.cancelDuel());
  tap($('#sparask-yes'), (e) => { e.preventDefault(); game.sim.answer(true); });
  tap($('#sparask-no'), (e) => { e.preventDefault(); game.sim.answer(false); });
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
    view.playing = false;
    fitStage();
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

  /* ---------- on the home screen ----------
     The hosted copy can be put on a phone's home screen, where it opens without the browser's
     bars. Offered only there, and not once it is already running that way. Where the browser
     offers its own install step (Chrome on Android), a button takes it; elsewhere the dialog
     says where to find it. */
  const standalone = () => {
    try {
      return !!(window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true;
    } catch (e) { return false; }
  };
  if (hostKind() === 'web' && !standalone()) {
    let offer = null; // the browser's own install step, kept until the person asks for it
    $('#m-app').hidden = false;
    $('#m-app').addEventListener('click', () => {
      $('#app-install').hidden = !offer;
      openModal('modal-app');
    });
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      offer = e;
    });
    window.addEventListener('appinstalled', () => {
      offer = null;
      $('#m-app').hidden = true;
      closeModals();
      toast('홈 화면에 올렸습니다');
    });
    $('#app-install').addEventListener('click', () => {
      if (!offer) return;
      const o = offer;
      offer = null;
      $('#app-install').hidden = true;
      try {
        const pr = o.prompt();
        if (pr && pr.catch) pr.catch(() => {});
      } catch (e) { toast('여기서는 바로 설치할 수 없습니다. 브라우저 메뉴의 ‘홈 화면에 추가’를 써 주세요', 5200); }
    });
  }

  /* ---------- group photo ----------
     A countdown everyone in the place is told about, then the 3D picture as it is on the screen,
     without the buttons, with the place and the day written along the bottom. The picture never
     leaves this browser unless the person saves or sends it. */
  let shooting = false;
  let photoBlob = null;
  let photoUrl = '';
  // A claude.ai page may not start a download or open the share sheet by itself; it hands the file
  // to the page around it, which asks the viewer. Elsewhere the browser's own ways are used.
  const framed = () => !!(window.claude && typeof window.claude.use === 'function');
  let saver = null;
  const NOTE = '저장이 안 되면 사진을 길게 눌러 저장할 수 있습니다.';
  const stamp = () => {
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    return {
      day: `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`,
      file: `jiujitsu-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`,
    };
  };
  const count = (text) => {
    const el = $('#flash');
    el.hidden = true;
    el.textContent = text;
    el.className = 'flash count';
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(flashT);
    flashT = setTimeout(() => { el.hidden = true; }, 900);
  };
  const shoot = () => {
    shooting = false;
    const st = stamp();
    $('#flash').hidden = true; // the count is not part of the picture
    const cv = game.snap(PLACE[sel.place].name, `${st.day} · 주짓수 메타버스`);
    if (!cv) return;
    game.sound.sfx('shutter');
    const blink = document.createElement('div');
    blink.className = 'shutter';
    $('#stage').appendChild(blink);
    setTimeout(() => blink.remove(), 520);
    const show = (blob) => {
      photoBlob = blob || null;
      if (photoUrl) { try { URL.revokeObjectURL(photoUrl); } catch (e) { /* ignore */ } }
      photoUrl = '';
      let src = '';
      try {
        if (blob) {
          photoUrl = URL.createObjectURL(blob);
          src = photoUrl;
        } else src = cv.toDataURL('image/png');
      } catch (e) { src = ''; }
      if (!src) {
        toast('사진을 만들지 못했습니다');
        return;
      }
      $('#photo-img').src = src;
      $('#photo-save').dataset.name = st.file;
      let canShare = false;
      try {
        canShare = !!blob && typeof File === 'function' && typeof navigator.share === 'function' && !!navigator.canShare
          && navigator.canShare({ files: [new File([blob], st.file, { type: 'image/png' })] });
      } catch (e) { canShare = false; }
      $('#photo-share').hidden = !canShare || framed();
      $('#photo-save').hidden = false;
      $('#photo-note').textContent = NOTE;
      if (framed()) {
        // the save button appears once the page around this one says it will take a file
        $('#photo-save').hidden = !saver;
        if (!saver) {
          $('#photo-note').textContent = '사진을 길게 누르거나 오른쪽 클릭해 저장할 수 있습니다.';
          let ask = null;
          try { ask = window.claude.use('downloads'); } catch (e) { ask = null; }
          Promise.resolve(ask).then((dl) => {
            if (!dl || typeof dl.save !== 'function') return;
            saver = dl;
            $('#photo-save').hidden = false;
            $('#photo-note').textContent = '저장을 누르면 저장할지 묻는 창이 뜹니다.';
          }, () => {});
        } else $('#photo-note').textContent = '저장을 누르면 저장할지 묻는 창이 뜹니다.';
      }
      setTimeout(() => { if (game.mode === 'play') openModal('modal-photo'); }, 450);
    };
    try {
      if (cv.toBlob) cv.toBlob((b) => show(b), 'image/png');
      else show(null);
    } catch (e) { show(null); }
  };
  takePhoto = () => {
    if (shooting || !game.ok || game.mode !== 'play') return;
    shooting = true;
    closeModals();
    toggleMenu(false);
    closePops();
    game.sim.photoCall();
    toast('단체 사진을 찍습니다. 포즈!', 2600);
    [3, 2, 1].forEach((n, i) => setTimeout(() => { if (shooting) { count(String(n)); game.sound.sfx('tick'); } }, i * 1000));
    setTimeout(shoot, 3000);
  };
  $('#m-photo').addEventListener('click', () => takePhoto());
  $('#photo-again').addEventListener('click', () => takePhoto());
  // Save a picture this page made: through the page around it where there is one, else as a download.
  const saveImage = (blob, src, name) => {
    if (saver && blob) {
      saver.save({ filename: name, data: blob }).then(
        () => toast('저장했습니다'),
        (err) => { if (!err || err.code !== 'declined') toast('저장하지 못했습니다. 그림을 길게 눌러 저장해 주세요', 4200); },
      );
      return;
    }
    try {
      const a = document.createElement('a');
      a.href = src;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('저장했습니다. 보이지 않으면 그림을 길게 눌러 저장해 주세요', 4200);
    } catch (e) { toast('여기서는 바로 저장할 수 없습니다. 그림을 길게 눌러 저장해 주세요', 4200); }
  };
  $('#photo-save').addEventListener('click', () => saveImage(photoBlob, $('#photo-img').src, $('#photo-save').dataset.name || 'jiujitsu.png'));

  /* ---------- athlete card ----------
     Walking into the arena, the player fills in a card: name, belt, age. It is drawn here (card.js)
     with a picture of their character. What was typed is kept in this browser only; the age never
     goes anywhere else. */
  let cardBlob = null;
  let cardUrl = '';
  const cardKey = () => `${sel.name}|${sel.belt}|${sel.stripes}|${sel.gi}`;
  const cardSaved = () => {
    try {
      const o = JSON.parse(store.get('bjjmeta.card') || 'null');
      return o && typeof o === 'object' && cleanAge(o.age) ? o : null;
    } catch (e) { return null; }
  };
  const cardForm = () => {
    const o = cardSaved();
    $('#t-card').textContent = '선수카드 발급';
    $('#card-form').hidden = false;
    $('#card-done').hidden = true;
    $('#card-warn').hidden = true;
    $('#card-name').value = sel.name;
    $('#card-age').value = o ? String(o.age) : '';
    const black = sel.belt === 'black';
    $('#card-belt').innerHTML = '';
    const sw = document.createElement('i');
    sw.style.background = BELTS[sel.belt].css;
    $('#card-belt').appendChild(sw);
    $('#card-belt').appendChild(document.createTextNode(`${BELTS[sel.belt].name} ${sel.stripes}${black ? '단' : '그랄'} · 띠는 메뉴의 ‘띠 · 도복 바꾸기’에서 고릅니다`));
  };
  const cardShow = (age) => {
    const d = new Date();
    const day = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const cv = drawCard({ name: sel.name || '수련생', belt: sel.belt, stripes: sel.stripes, age, day, portrait: game.portrait(), logo: game.logos.event });
    $('#t-card').textContent = '선수카드';
    $('#card-form').hidden = true;
    $('#card-done').hidden = false;
    cardBlob = null;
    if (cardUrl) { try { URL.revokeObjectURL(cardUrl); } catch (e) { /* ignore */ } }
    cardUrl = '';
    const put = (blob) => {
      cardBlob = blob || null;
      try {
        if (blob) {
          cardUrl = URL.createObjectURL(blob);
          $('#card-img').src = cardUrl;
        } else $('#card-img').src = cv.toDataURL('image/png');
      } catch (e) { /* the card stays as it was */ }
    };
    try {
      if (cv.toBlob) cv.toBlob((b) => put(b), 'image/png');
      else put(null);
    } catch (e) { put(null); }
    // inside a claude.ai page a file is handed to the page around this one, which asks first
    $('#card-save').hidden = framed() && !saver;
    if (framed() && !saver) {
      let ask = null;
      try { ask = window.claude.use('downloads'); } catch (e) { ask = null; }
      Promise.resolve(ask).then((dl) => {
        if (!dl || typeof dl.save !== 'function') return;
        saver = dl;
        $('#card-save').hidden = false;
      }, () => {});
    }
  };
  // The card for who the player is now: the one already issued, or the form to issue one.
  const openCard = () => {
    if (!game.ok || game.mode !== 'play') return;
    const o = cardSaved();
    openModal('modal-card');
    if (o && o.key === cardKey()) cardShow(o.age);
    else cardForm();
  };
  $('#card-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const warn = $('#card-warn');
    const name = $('#card-name').value.trim().slice(0, 12);
    const age = cleanAge($('#card-age').value);
    warn.hidden = true;
    if (!name) {
      warn.textContent = '이름을 적어 주세요.';
      warn.hidden = false;
      return;
    }
    if (!age) {
      warn.textContent = '나이를 숫자로 적어 주세요 (4~99).';
      warn.hidden = false;
      return;
    }
    if (sel.belt === 'black' && !mayBlack(name)) {
      warn.textContent = '검은 띠는 김상인, 양동건, 서현찬 세 분만 쓸 수 있습니다. 추가 요청은 개발자에게 요청해 주세요.';
      warn.hidden = false;
      return;
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (name !== sel.name) {
      nick.value = name;
      setName(name);
    }
    store.set('bjjmeta.card', JSON.stringify({ key: cardKey(), age }));
    cardShow(age);
    game.sound.sfx('ding');
    toast('선수카드가 발급되었습니다');
  });
  $('#card-redo').addEventListener('click', () => cardForm());
  $('#card-save').addEventListener('click', () => saveImage(cardBlob, $('#card-img').src, 'athlete-card.png'));
  $('#m-card').addEventListener('click', () => { toggleMenu(false); openCard(); });
  $('#photo-share').addEventListener('click', () => {
    try {
      const f = new File([photoBlob], $('#photo-save').dataset.name || 'jiujitsu.png', { type: 'image/png' });
      const pr = navigator.share({ files: [f], title: '주짓수 메타버스' });
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { toast('보내지 못했습니다. 저장한 뒤 보내 주세요'); }
  });

  /* ---------- logo slots ----------
     Two image slots, 'gym' and 'event', feed the banners in both maps. A visitor can put their own
     image in a slot (kept in that browser only). On the hosted copy the owner can also replace
     the files logo-gym.png and logo-event.png beside the page; those show for everyone who has not
     chosen an image of their own. No logo is drawn or bundled by this page itself. */
  const siteLogo = { gym: null, event: null };
  const showLogo = (kind) => {
    const own = store.get(`bjjmeta.logo.${kind}`);
    const prev = $(`#logo-${kind}-prev`);
    const note = $(`#logo-${kind}-note`);
    const put = (img, src, mine) => {
      game.setLogo(kind, img);
      prev.hidden = !img;
      if (img) prev.src = src;
      $(`#logo-${kind}-clear`).hidden = !mine;
      note.hidden = !(img && !mine);
    };
    if (own) {
      const img = new Image();
      img.onload = () => { if (store.get(`bjjmeta.logo.${kind}`) === own) put(img, own, true); };
      img.onerror = () => put(siteLogo[kind], siteLogo[kind] ? siteLogo[kind].src : '', false);
      img.src = own;
    } else put(siteLogo[kind], siteLogo[kind] ? siteLogo[kind].src : '', false);
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
          const sc = Math.min(1, 512 / Math.max(img.width, img.height, 1));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * sc));
          cv.height = Math.max(1, Math.round(img.height * sc));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          let url = fr.result;
          try { url = cv.toDataURL('image/png'); } catch (e) { /* keep original */ }
          store.set(`bjjmeta.logo.${kind}`, url);
          showLogo(kind);
        };
        img.onerror = () => toast('이미지를 읽지 못했습니다. PNG나 JPG 파일로 다시 시도해 주세요');
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
    $(`#logo-${kind}-clear`).addEventListener('click', () => {
      store.del(`bjjmeta.logo.${kind}`);
      input.value = '';
      showLogo(kind);
    });
    if (!game.ok) continue;
    if (store.get(`bjjmeta.logo.${kind}`)) showLogo(kind);
    // The image file the owner placed beside the hosted page. The copy that ships with the page is
    // an empty one-pixel image, which counts as "no logo".
    if (hostKind() === 'web') {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth < 8 || img.naturalHeight < 8) return;
        siteLogo[kind] = img;
        showLogo(kind);
      };
      img.src = `logo-${kind}.png`;
    }
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
