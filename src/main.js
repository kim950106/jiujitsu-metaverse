/* global window, document */
import { initUI } from './ui.js';
import { lockZoom } from './nozoom.js';
import { leaveInApp } from './inapp.js';
import { hostKind } from './relay.js';

function start(data) {
  if (!window.THREE) {
    const el = document.querySelector('#nogl');
    if (el) {
      el.textContent = '3D 라이브러리를 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.';
      el.hidden = false;
    }
    const b = document.querySelector('#enter');
    if (b) b.disabled = true;
    return;
  }
  initUI(data || {});
}

lockZoom();
const hot = window.claude && window.claude.hot;
const go = () => {
  if (hot && hot.ready) hot.ready(start);
  else start((hot && hot.data) || {});
};
// the hosted copy, opened inside KakaoTalk or another app's browser, goes to the phone's own browser
if (!(hostKind() === 'web' && leaveInApp(go))) go();
