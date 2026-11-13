/* global window, document, localStorage, sessionStorage, location */
// What the master answers: the dojo timetable, and the sign-up sheet for next year's tournament.
// Both live in the page's shared store, so everyone who opens the page reads the same data.
// Names are public on the list; contact details are kept on a path only the page's admins can read.
import { mockWanted } from './net.js';
import { hostKind } from './relay.js';
import { BELTS } from './util.js';

const $ = (s) => document.querySelector(s);
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '');
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]);
const day = (at) => {
  if (typeof at !== 'number' || !Number.isFinite(at)) return '';
  try { return new Date(at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }); } catch (e) { return ''; }
};
const why = (e) => {
  const c = e && e.code;
  if (c === 'timeout') return '응답이 늦어지고 있습니다. 잠시 후 다시 열어 주세요.';
  if (c === 'invalid_argument') return '저장할 권한이 없습니다. 페이지 주인에게 참여자 권한을 요청해 주세요.';
  if (c === 'quota_exceeded') return '저장 공간이 가득 찼습니다. 페이지 주인에게 알려 주세요.';
  return '지금은 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
};

/* ---------- stand-ins for testing in one browser (?mock=1); never used otherwise ---------- */
function mockDb() {
  const KEY = 'bjj-mock-db';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  const snap = (id, data) => ({ id, exists: data != null, data: () => (data == null ? undefined : data), metadata: { fromCache: false, hasPendingWrites: false } });
  const doc = (path) => ({
    id: path.split('/').pop(),
    path,
    get: async () => snap(path.split('/').pop(), load()[path]),
    set: async (data) => { const o = load(); o[path] = JSON.parse(JSON.stringify(data)); save(o); },
    delete: async () => { const o = load(); delete o[path]; save(o); },
  });
  const collection = (path) => ({
    path,
    doc: (id) => doc(`${path}/${id}`),
    get: async () => {
      const o = load();
      const docs = Object.keys(o).filter((k) => k.startsWith(`${path}/`) && k.split('/').length === path.split('/').length + 1).sort().map((k) => snap(k.split('/').pop(), o[k]));
      return { docs, size: docs.length, empty: !docs.length };
    },
  });
  return { doc, collection };
}
function mockUser() {
  let id = null;
  try {
    id = sessionStorage.getItem('bjj-mock-uid');
    if (!id) {
      id = `u_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('bjj-mock-uid', id);
    }
  } catch (e) { id = 'u_test'; }
  const admin = /[?&]admin=1/.test(location.search);
  return { id: async () => id, canEdit: async () => admin, isOwner: async () => admin, can: async () => true };
}

let caps = null;
// Resolves once: { db, me: { id, admin, owner, write } }. db is null when this visitor has no store.
export function loadCaps() {
  if (caps) return caps;
  caps = (async () => {
    const use = async (name) => {
      try {
        const c = window.claude;
        if (c && typeof c.use === 'function') return await c.use(name);
      } catch (e) { /* fall through */ }
      return null;
    };
    let [db, user] = await Promise.all([use('db'), use('user')]);
    if (!db && mockWanted()) {
      db = mockDb();
      user = mockUser();
    }
    const me = { id: null, admin: false, owner: false, write: null };
    if (user) {
      try {
        me.id = await user.id();
        me.admin = !!(await user.canEdit());
        me.owner = !!(await user.isOwner());
        me.write = await user.can('data.write');
      } catch (e) { /* keep the defaults */ }
    }
    return { db, me };
  })();
  return caps;
}

export function initBoard({ openModal, toast, sel }) {
  loadCaps();
  // No store for this visitor: either the page has no shared storage switched on yet, or they are not signed in.
  const web = hostKind() === 'web';
  const noStore = (me) => {
    if (web) return '이 주소에서는 아직 준비 중인 기능입니다.';
    return me.admin
      ? '저장 기능이 아직 꺼져 있습니다. 이 페이지가 공개 링크로 공유된 동안에는 켤 수 없습니다. 공개 공유를 끈 뒤 Claude에게 저장 기능을 켜 달라고 요청해 주세요.'
      : '지금은 이 기능을 쓸 수 없습니다. 아직 준비 중이거나, 로그인하지 않은 상태입니다.';
  };

  /* ---------- timetable ---------- */
  let rows = [];
  let memo = '';
  const tState = $('#time-state');
  const tView = $('#time-view');
  const tRows = $('#time-rows');
  const tNote = $('#time-note');
  const tEdit = $('#time-edit');
  const tInputs = $('#time-inputs');
  const tBtn = $('#time-editbtn');

  const paintTime = (admin) => {
    tRows.textContent = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      for (const v of [r.d, r.t, r.c]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      tRows.appendChild(tr);
    }
    tView.hidden = !rows.length;
    tNote.hidden = !memo;
    tNote.textContent = memo;
    tState.hidden = !!rows.length;
    tState.textContent = admin
      ? '아직 시간표가 없습니다. 아래 ‘시간표 입력’으로 적어 두면 이 페이지를 여는 모든 사람에게 보입니다.'
      : '아직 시간표가 등록되지 않았습니다.';
    tBtn.hidden = !admin;
    tBtn.textContent = rows.length ? '시간표 수정' : '시간표 입력';
  };

  const openTime = async () => {
    openModal('modal-time');
    tEdit.hidden = true;
    tView.hidden = true;
    tNote.hidden = true;
    tBtn.hidden = true;
    tState.hidden = false;
    tState.textContent = '불러오는 중…';
    const { db, me } = await loadCaps();
    if (!db) {
      tState.textContent = noStore(me);
      return;
    }
    try {
      const snap = await within(db.doc('info/timetable').get(), 10000);
      const d = snap.exists ? snap.data() : null;
      rows = d && Array.isArray(d.rows) ? d.rows.slice(0, 40).map((r) => ({ d: text(r && r.d, 16), t: text(r && r.t, 24), c: text(r && r.c, 40) })).filter((r) => r.d || r.t || r.c) : [];
      memo = d ? text(d.memo, 120) : '';
      paintTime(me.admin);
    } catch (e) {
      tState.textContent = why(e);
    }
  };

  const addInputRow = (r) => {
    const row = document.createElement('div');
    row.className = 'trow';
    const mk = (ph, val, max, label) => {
      const i = document.createElement('input');
      i.type = 'text';
      i.placeholder = ph;
      i.maxLength = max;
      i.value = val || '';
      i.setAttribute('aria-label', label);
      row.appendChild(i);
      return i;
    };
    mk('월·수·금', r && r.d, 16, '요일');
    mk('19:30~20:30', r && r.t, 24, '시간');
    mk('주짓수 기초', r && r.c, 40, '수업');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mini';
    del.textContent = '삭제';
    del.setAttribute('aria-label', '이 줄 삭제');
    del.addEventListener('click', () => row.remove());
    row.appendChild(del);
    tInputs.appendChild(row);
  };

  tBtn.addEventListener('click', () => {
    tInputs.textContent = '';
    (rows.length ? rows : [null, null, null]).forEach(addInputRow);
    $('#time-memo').value = memo;
    tEdit.hidden = false;
    tView.hidden = true;
    tNote.hidden = true;
    tState.hidden = true;
    tBtn.hidden = true;
  });
  $('#time-add').addEventListener('click', () => { if (tInputs.children.length < 40) addInputRow(null); });
  $('#time-cancel').addEventListener('click', () => {
    tEdit.hidden = true;
    paintTime(true);
  });
  tEdit.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = Array.from(tInputs.children).map((row) => {
      const [d, t, c] = Array.from(row.querySelectorAll('input')).map((i) => i.value.trim());
      return { d: text(d, 16), t: text(t, 24), c: text(c, 40) };
    }).filter((r) => r.d || r.t || r.c);
    const note = text($('#time-memo').value.trim(), 120);
    const { db } = await loadCaps();
    if (!db) return;
    const btn = $('#time-save');
    btn.disabled = true;
    try {
      await within(db.doc('info/timetable').set({ rows: next, memo: note, at: Date.now() }), 10000);
      rows = next;
      memo = note;
      tEdit.hidden = true;
      paintTime(true);
      toast('시간표를 저장했습니다');
    } catch (err) {
      toast(why(err), 4200);
    }
    btn.disabled = false;
  });

  /* ---------- sign-up ---------- */
  const aForm = $('#apply-form');
  const aName = $('#apply-name');
  const aTel = $('#apply-tel');
  const aMsg = $('#apply-msg');
  const aSend = $('#apply-send');
  const aDrop = $('#apply-drop');
  const say = (m, bad) => {
    aMsg.hidden = !m;
    aMsg.textContent = m || '';
    aMsg.className = bad ? 'warn' : 'okmsg';
  };
  const lockForm = (on) => {
    aName.disabled = on;
    aTel.disabled = on;
    aSend.disabled = on;
  };

  const openApply = async () => {
    openModal('modal-apply');
    say('');
    aDrop.hidden = true;
    lockForm(true);
    aSend.textContent = '신청하기';
    if (!aName.value) aName.value = text(sel().name, 20);
    const { db, me } = await loadCaps();
    if (!db || !me.id) {
      say(noStore(me), true);
      return;
    }
    if (me.write === false) {
      say('보기 권한으로 들어와 있어 신청할 수 없습니다. 페이지 주인에게 참여자 권한을 요청해 주세요.', true);
      return;
    }
    try {
      const [mine, tel] = await within(Promise.all([db.doc(`signups/${me.id}`).get(), db.doc(`contacts/${me.id}`).get()]), 10000);
      if (mine.exists) {
        aName.value = text(mine.data().name, 20);
        if (tel.exists) aTel.value = text(tel.data().tel, 20);
        aSend.textContent = '수정해서 다시 저장';
        aDrop.hidden = false;
        say(`${day(mine.data().at)} 신청이 접수되어 있습니다.`);
      }
      lockForm(false);
    } catch (e) {
      say(why(e), true);
    }
  };

  aForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = text(aName.value.trim(), 20);
    const tel = text(aTel.value.trim(), 20);
    if (!name) {
      say('이름을 적어 주세요.', true);
      aName.focus();
      return;
    }
    if (!/^[0-9+\-\s]{7,20}$/.test(tel) || tel.replace(/\D/g, '').length < 7) {
      say('연락처는 숫자와 - 만 써서 적어 주세요. 예: 010-1234-5678', true);
      aTel.focus();
      return;
    }
    const { db, me } = await loadCaps();
    if (!db || !me.id) return;
    lockForm(true);
    try {
      const at = Date.now();
      // contact first: the public row should never exist without the private one behind it
      await within(db.doc(`contacts/${me.id}`).set({ tel, at }), 10000);
      await within(db.doc(`signups/${me.id}`).set({ name, belt: sel().belt, at }), 10000);
      aSend.textContent = '수정해서 다시 저장';
      aDrop.hidden = false;
      say('신청이 접수되었습니다.');
      toast('2027 IBJJF 참가 희망 신청이 접수되었습니다');
    } catch (err) {
      say(why(err), true);
    }
    lockForm(false);
  });

  aDrop.addEventListener('click', async () => {
    const { db, me } = await loadCaps();
    if (!db || !me.id) return;
    lockForm(true);
    try {
      await within(db.doc(`signups/${me.id}`).delete(), 10000);
      await within(db.doc(`contacts/${me.id}`).delete(), 10000);
      aDrop.hidden = true;
      aSend.textContent = '신청하기';
      aTel.value = '';
      say('신청을 취소했습니다.');
    } catch (err) {
      say(why(err), true);
    }
    lockForm(false);
  });

  /* ---------- list ---------- */
  const lState = $('#list-state');
  const lView = $('#list-view');
  const lRows = $('#list-rows');
  const lNote = $('#list-note');

  const openList = async () => {
    openModal('modal-list');
    lView.hidden = true;
    lState.hidden = false;
    lState.textContent = '불러오는 중…';
    lNote.textContent = '';
    const { db, me } = await loadCaps();
    if (!db) {
      lState.textContent = noStore(me);
      return;
    }
    try {
      const snap = await within(db.collection('signups').get(), 10000);
      const tels = new Map();
      if (me.admin) {
        try {
          const c = await within(db.collection('contacts').get(), 10000);
          for (const d of c.docs) tels.set(d.id, text(d.data() && d.data().tel, 20));
        } catch (e) { /* the list still shows without contacts */ }
      }
      const list = snap.docs.map((d) => {
        const v = d.data() || {};
        return { id: d.id, name: text(v.name, 20) || '이름 없음', belt: BELTS[v.belt] ? BELTS[v.belt].name : '', at: typeof v.at === 'number' ? v.at : 0 };
      }).sort((a, b) => a.at - b.at);
      $('#list-telh').hidden = !me.admin;
      $('#list-delh').hidden = !me.owner;
      lRows.textContent = '';
      list.forEach((r, i) => {
        const tr = document.createElement('tr');
        const cell = (v) => {
          const td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
          return td;
        };
        cell(String(i + 1));
        cell(r.id === me.id ? `${r.name} (나)` : r.name);
        cell(r.belt);
        cell(day(r.at));
        if (me.admin) cell(tels.get(r.id) || '');
        if (me.owner) {
          const td = cell('');
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'mini';
          b.textContent = '삭제';
          b.setAttribute('aria-label', `${r.name} 신청 삭제`);
          b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              await within(db.doc(`signups/${r.id}`).delete(), 10000);
              await within(db.doc(`contacts/${r.id}`).delete(), 10000);
              openList();
            } catch (err) {
              toast(why(err), 4200);
              b.disabled = false;
            }
          });
          td.appendChild(b);
        }
        lRows.appendChild(tr);
      });
      lView.hidden = !list.length;
      lState.hidden = !!list.length;
      lState.textContent = '아직 신청한 사람이 없습니다.';
      lNote.textContent = `${list.length ? `모두 ${list.length}명. ` : ''}${me.admin ? '연락처는 관리자인 나에게만 보입니다.' : '연락처는 이 페이지의 관리자에게만 보입니다.'}`;
    } catch (e) {
      lState.textContent = why(e);
    }
  };

  $('#ask-time').addEventListener('click', openTime);
  $('#ask-apply').addEventListener('click', openApply);
  $('#ask-list').addEventListener('click', openList);
  $('#apply-list').addEventListener('click', openList);
  $('#list-apply').addEventListener('click', openApply);
  return { openTime, openApply, openList };
}
