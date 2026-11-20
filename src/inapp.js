/* global window, document, navigator, location, sessionStorage */
// The hosted copy opened inside a messenger's or an app's own browser (KakaoTalk, LINE, Instagram,
// Facebook, NAVER and the like) is handed over to the phone's own browser, where the game works as
// it should: full screen, on the home screen, with its storage kept. KakaoTalk and LINE have their
// own way out; other apps on Android open a link that asks Android itself to show the page; on an
// iPhone the other apps give a page no way out, so it says how to do it by hand. The game is not
// started in the app's browser unless the person chooses to stay there, so nobody shows up twice.
// Only the hosted copy does this (the claude.ai page is shown by Claude itself).

const SEEN = 'bjjmeta.out'; // this tab has already tried to hand the page over once

// What kind of in-app browser a user agent string is: 'kakao', 'line', 'android', 'ios', or ''
// for a browser of its own (or the page running from the home screen).
export function inAppKind(ua, standalone) {
  if (!ua || standalone) return '';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/\bLine\/\d/i.test(ua)) return 'line';
  const app = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|NAVER\(inapp|DaumApps|BAND\/|everytimeApp|KAKAOSTORY|Twitter|Snapchat|TikTok|musical_ly|Bytedance/i.test(ua);
  if (/Android/i.test(ua)) return app || /; wv\)/.test(ua) ? 'android' : '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    const own = /Safari\//.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua); // Safari, or a browser of its own
    return app || !own ? 'ios' : '';
  }
  return '';
}

// Where to go to leave, for a kind and the page's address (null where there is no such way).
export function wayOut(kind, href) {
  if (kind === 'kakao') return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
  if (kind === 'line') {
    if (/[?&]openExternalBrowser=1/.test(href)) return null;
    const [main, hash] = href.split('#');
    return `${main}${main.includes('?') ? '&' : '?'}openExternalBrowser=1${hash ? `#${hash}` : ''}`;
  }
  if (kind === 'android') {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  }
  if (kind === 'ios') return `x-safari-${href}`; // Safari's own address for a page (newer iPhones)
  return null;
}

const NAMES = { kakao: '카카오톡', line: '라인' };

// Hand the page over if it is in an app's browser. Returns false when it is not (start the game);
// otherwise shows a notice and calls stay() if the person chooses to play here after all.
export function leaveInApp(stay) {
  let standalone = false;
  try {
    standalone = navigator.standalone === true || !!(window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches));
  } catch (e) { /* ignore */ }
  const kind = inAppKind(navigator.userAgent || '', standalone);
  const box = document.querySelector('#inapp');
  if (!kind || !box) return false;
  const href = location.href;
  const out = wayOut(kind, href);
  const go = (url) => {
    if (typeof window.__bjjOpen === 'function') window.__bjjOpen(url); // (the page tests)
    else window.location.href = url;
  };
  let tried = false;
  try {
    tried = sessionStorage.getItem(SEEN) === '1';
    sessionStorage.setItem(SEEN, '1');
  } catch (e) { /* no storage: try once per load */ }
  const app = NAMES[kind] || '이 앱';
  const auto = kind !== 'ios' && out && !tried; // an iPhone app is left only by the person's own tap
  document.querySelector('#inapp-title').textContent = kind === 'ios' ? 'Safari에서 열어 주세요' : '기본 브라우저에서 엽니다';
  document.querySelector('#inapp-text').textContent = kind === 'ios'
    ? `${app} 안의 브라우저에서는 화면 고정이나 홈 화면 추가가 잘 되지 않습니다. 화면의 ⋯ 또는 공유 메뉴에서 ‘Safari로 열기’를 누르거나, 주소를 복사해 Safari에 붙여 넣어 주세요.`
    : auto
      ? `${app} 안의 브라우저 대신 휴대폰의 기본 브라우저로 넘겼습니다. 넘어가지 않았다면 아래 버튼을 눌러 주세요. 이 창은 닫아도 됩니다.`
      : `${app} 안의 브라우저입니다. 기본 브라우저에서 열면 화면 고정, 홈 화면 추가가 제대로 됩니다.`;
  const openBtn = document.querySelector('#inapp-open');
  openBtn.textContent = kind === 'ios' ? 'Safari로 열기' : '기본 브라우저로 열기';
  openBtn.hidden = !out;
  openBtn.addEventListener('click', () => { if (out) go(out); });
  document.querySelector('#inapp-copy').addEventListener('click', async () => {
    let done = false;
    try {
      await navigator.clipboard.writeText(href);
      done = true;
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = href;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { done = document.execCommand('copy'); } catch (err) { done = false; }
      t.remove();
    }
    document.querySelector('#inapp-copied').textContent = done ? '주소를 복사했습니다. 브라우저 주소창에 붙여 넣어 주세요.' : `복사하지 못했습니다. 주소: ${href}`;
  });
  document.querySelector('#inapp-stay').addEventListener('click', () => {
    box.hidden = true;
    stay();
  });
  box.hidden = false;
  if (auto) setTimeout(() => go(out), 60);
  return true;
}
