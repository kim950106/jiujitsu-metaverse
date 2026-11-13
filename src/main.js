/* global window, document */
import { initUI } from './ui.js';

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

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start((hot && hot.data) || {});
