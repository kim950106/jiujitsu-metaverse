// The hosted copy opened inside KakaoTalk, LINE or another app's own browser hands the page to the
// phone's own browser, and does not start the game in the app's browser unless asked to. Checked
// by the user agent strings of those apps; the address the page would go to is caught instead of
// followed. Usage: node test/inapp.mjs
import { launch, sleep } from './page.mjs';
import { inAppKind, wayOut } from '../src/inapp.js';

let fails = 0;
const ok = (cond, name, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) fails++;
};

const UA = {
  kakaoAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410550',
  kakaoIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.15.0',
  instaAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-G991N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 349.0.0.39.106 Android',
  naverAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S911N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.146 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.2)',
  instaIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 349.0.0.29.88 (iPhone15,2; iOS 17_6; ko_KR; ko; scale=3.00; 1179x2556; 642312132)',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  homeScreen: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

/* ---------- which browsers count as an app's own, on their own ---------- */
{
  const k = (ua, st) => inAppKind(ua, st);
  ok(k(UA.kakaoAndroid) === 'kakao' && k(UA.kakaoIos) === 'kakao' && k(UA.line) === 'line', 'KakaoTalk and LINE are told apart');
  ok(k(UA.instaAndroid) === 'android' && k(UA.naverAndroid) === 'android' && k(UA.instaIos) === 'ios', 'other apps on Android and on the iPhone');
  ok(!k(UA.chromeAndroid) && !k(UA.samsung) && !k(UA.safari) && !k(UA.chromeIos) && !k(UA.desktop), 'Chrome, Samsung Internet, Safari and a computer are left alone');
  ok(!k(UA.homeScreen, true) && k(UA.homeScreen, false) === 'ios', 'the page opened from the home screen is left alone');
  const href = 'https://kim950106.github.io/jiujitsu-metaverse/?r=ab12';
  ok(wayOut('kakao', href) === `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`, 'KakaoTalk: its own address for the outside browser, with the room code');
  ok(wayOut('line', href) === `${href}&openExternalBrowser=1` && wayOut('line', 'https://x.io/a#b') === 'https://x.io/a?openExternalBrowser=1#b' && wayOut('line', `${href}&openExternalBrowser=1`) === null, 'LINE: the page again, marked for the outside browser (once)');
  const intent = wayOut('android', href);
  ok(intent.startsWith('intent://kim950106.github.io/jiujitsu-metaverse/?r=ab12#Intent;scheme=https;') && intent.includes('action=android.intent.action.VIEW') && intent.includes(`S.browser_fallback_url=${encodeURIComponent(href)}`) && intent.endsWith(';end'), 'Android: a link that asks Android itself, coming back here if nothing takes it');
  ok(wayOut('ios', href) === `x-safari-${href}` && wayOut('', href) === null, 'iPhone: Safari\'s own address, used only on a tap');
}

/* ---------- on the page ---------- */
const T = await launch({ web: true });
const opened = (page) => page.evaluate(() => window.__opened.slice());
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), sel);
const init = () => { window.__opened = []; window.__bjjOpen = (u) => window.__opened.push(u); };
const open = (ua, extra = {}) => T.open(Object.assign({ w: 390, h: 780, touch: true, query: '?mock=1&r=ab12', ua, init, wait: false }, extra));

{
  const page = await open(UA.kakaoAndroid);
  await sleep(1200);
  const went = await opened(page);
  const here = await page.evaluate(() => location.href);
  ok(went.length === 1 && went[0] === `kakaotalk://web/openExternal?url=${encodeURIComponent(here)}`, 'in KakaoTalk the page goes straight to the outside browser, room code and all', went.join(' '));
  ok(await vis(page, '#inapp') && (await txt(page, '#inapp-title')) === '기본 브라우저에서 엽니다' && (await txt(page, '#inapp-text')).includes('카카오톡'), 'and says so', await txt(page, '#inapp-text'));
  ok(!(await page.evaluate(() => !!window.__bjj)), 'the game is not started in KakaoTalk\'s browser (nobody shows up twice)');
  await page.click('#inapp-open');
  ok((await opened(page)).length === 2, 'the button tries again');
  await page.click('#inapp-stay');
  await page.waitForFunction('window.__bjj && window.__bjj.ok', { timeout: 20000 });
  ok(!(await vis(page, '#inapp')), 'staying here starts the game after all');
  // the same tab again: no second automatic jump, only the button
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1200);
  ok((await opened(page)).length === 0 && await vis(page, '#inapp') && (await txt(page, '#inapp-text')).includes('기본 브라우저에서 열면'), 'opened again in the same tab: it does not jump a second time, it offers the button');
  await page.close();
}
{
  const page = await open(UA.line);
  await sleep(1200);
  const went = await opened(page);
  ok(went.length === 1 && went[0].endsWith('&r=ab12&openExternalBrowser=1') && !(await page.evaluate(() => !!window.__bjj)), 'in LINE: the page asks LINE for the outside browser', went.join(' '));
  await page.close();
}
{
  const page = await open(UA.instaAndroid);
  await sleep(1200);
  const went = await opened(page);
  ok(went.length === 1 && went[0].startsWith('intent://') && went[0].includes('&r=ab12#Intent;scheme=http;'), 'in Instagram on Android: a link for Android to open', went.join(' '));
  await page.close();
}
{
  const page = await open(UA.instaIos);
  await sleep(1200);
  ok((await opened(page)).length === 0 && await vis(page, '#inapp') && (await txt(page, '#inapp-title')) === 'Safari에서 열어 주세요' && (await txt(page, '#inapp-open')) === 'Safari로 열기', 'in an iPhone app: no jump of its own, but the way to Safari is shown');
  await page.click('#inapp-copy');
  await sleep(300);
  ok((await txt(page, '#inapp-copied')).length > 5, 'the address can be copied', await txt(page, '#inapp-copied'));
  await page.click('#inapp-open');
  ok((await opened(page))[0] === `x-safari-${await page.evaluate(() => location.href)}`, 'and Safari asked for on a tap');
  await page.close();
}
for (const [label, ua] of [['Chrome on Android', UA.chromeAndroid], ['Safari', UA.safari], ['a computer', UA.desktop]]) {
  const page = await open(ua, { wait: true });
  ok((await opened(page)).length === 0 && !(await vis(page, '#inapp')), `${label}: the game simply starts`);
  await page.close();
}
{
  // the claude.ai page never does this, even inside KakaoTalk
  const T2 = await launch();
  const page = await T2.open({ w: 390, h: 780, touch: true, ua: UA.kakaoAndroid, init });
  ok((await opened(page)).length === 0 && !(await vis(page, '#inapp')), 'the claude.ai page is left where it is');
  await page.close();
  await T2.close();
}

await T.close();
if (T.errors.length) { console.log('ERRORS:\n' + [...new Set(T.errors)].join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
