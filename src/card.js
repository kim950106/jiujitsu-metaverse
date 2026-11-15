// The athlete card handed out on walking into the arena: a picture drawn here from what the
// player typed (name, belt, age), their character and, if one has been put in, the event logo
// image. It is a card of this game, not a federation's membership card, and says so on its face.
// The age stays in this browser: it is drawn on the card and never sent anywhere.
import { BELTS, FONT, newCanvas, fitText, drawContain, maxStripes } from './util.js';

export const CARD = { w: 1000, h: 630, r: 46 };

// The age division a competitor of that age would enter (adult divisions by age).
export function division(age) {
  const a = age | 0;
  if (a < 16) return '키즈 · 틴';
  if (a < 18) return '주버나일';
  if (a < 30) return '어덜트';
  const m = a >= 61 ? 7 : a >= 56 ? 6 : a >= 51 ? 5 : a >= 46 ? 4 : a >= 41 ? 3 : a >= 36 ? 2 : 1;
  return `마스터 ${m}`;
}

export const cleanAge = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 4 && n <= 99 ? n : 0;
};

function rounded(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

// o: { name, belt, stripes, age, day, portrait (canvas or null), logo (image or null) }
export function drawCard(o) {
  const { w: W, h: H, r: R } = CARD;
  const cv = newCanvas(W, H);
  const c = cv.getContext('2d');
  c.save();
  rounded(c, 0, 0, W, H, R);
  c.clip();
  // the mat colours of the arena: blue, with yellow sweeping across one corner
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0c2f86');
  g.addColorStop(0.55, '#1746b4');
  g.addColorStop(1, '#0a2466');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.lineCap = 'round';
  [['rgba(255,255,255,.07)', 150, 0], ['#f2c22e', 30, 96], ['rgba(242,194,46,.5)', 12, 132]].forEach(([col, lw, off]) => {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(W * 0.42 + off, H + 60);
    c.bezierCurveTo(W * 0.62 + off, H * 0.72, W * 0.78 + off, H * 0.5, W + 80, H * 0.34 - off * 0.5);
    c.stroke();
  });
  // head: the logo slot, the title
  const lx = 46;
  const ly = 40;
  c.fillStyle = '#ffffff';
  rounded(c, lx, ly, 118, 118, 22);
  c.fill();
  if (o.logo) drawContain(c, o.logo, lx, ly, 118, 118, 10);
  else {
    c.fillStyle = '#0c2f86';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = FONT(30);
    c.fillText('주짓수', lx + 59, ly + 62);
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#ffffff';
  c.font = FONT(58);
  c.fillText('선수카드', lx + 144, ly + 62);
  c.fillStyle = '#f2c22e';
  c.font = FONT(22, 700);
  c.fillText('ATHLETE CARD · 치바 포트 아레나', lx + 146, ly + 100);
  // the fields
  const fx = 52;
  const field = (label, y) => {
    c.fillStyle = '#f2c22e';
    c.font = FONT(21, 700);
    c.fillText(label, fx, y);
  };
  const value = (text, y, px, maxW) => {
    c.fillStyle = '#ffffff';
    fitText(c, text, fx, y, maxW, px, 900);
  };
  field('이름  NAME', 222);
  value(o.name || '수련생', 282, 60, 520);
  field('벨트  BELT', 338);
  const belt = BELTS[o.belt] || BELTS.white;
  // the belt itself: its colour, the rank bar and the stripes on it
  const bx = fx;
  const by = 356;
  c.fillStyle = belt.css;
  rounded(c, bx, by, 260, 44, 8);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.55)';
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = o.belt === 'black' ? '#c62828' : '#141414';
  c.fillRect(bx + 150, by, 84, 44);
  const n = Math.min(o.stripes | 0, maxStripes(o.belt));
  c.fillStyle = '#f4f2ec';
  for (let i = 0; i < n; i++) c.fillRect(bx + 160 + i * (n > 4 ? 11 : 17), by + 5, n > 4 ? 6 : 9, 34);
  c.fillStyle = '#ffffff';
  c.font = FONT(34);
  c.fillText(`${belt.name} ${n}${o.belt === 'black' ? '단' : '그랄'}`, bx + 280, by + 35);
  field('나이  AGE', 452);
  value(`${o.age}세`, 506, 50, 200);
  c.fillStyle = '#f2c22e';
  c.font = FONT(21, 700);
  c.fillText('부문  DIVISION', fx + 230, 452);
  c.fillStyle = '#ffffff';
  fitText(c, division(o.age), fx + 230, 506, 250, 44, 900);
  // the picture of the character
  const px = 668;
  const py = 150;
  const pw = 284;
  const ph = 356;
  c.save();
  rounded(c, px, py, pw, ph, 26);
  c.fillStyle = '#dfe7f5';
  c.fill();
  c.clip();
  if (o.portrait) c.drawImage(o.portrait, px, py, pw, ph);
  c.restore();
  rounded(c, px, py, pw, ph, 26);
  c.strokeStyle = '#f2c22e';
  c.lineWidth = 7;
  c.stroke();
  // foot
  c.fillStyle = 'rgba(5,14,44,.72)';
  c.fillRect(0, H - 74, W, 74);
  c.fillStyle = '#ffffff';
  c.font = FONT(22, 700);
  c.fillText(`발급일 ${o.day}`, fx, H - 30);
  c.textAlign = 'right';
  c.fillStyle = 'rgba(255,255,255,.82)';
  c.font = FONT(19, 700);
  c.fillText('주짓수 메타버스 게임 카드 · 비공식 팬 프로젝트', W - 48, H - 30);
  c.restore();
  // a thin light edge all round
  rounded(c, 3, 3, W - 6, H - 6, R - 3);
  c.strokeStyle = 'rgba(255,255,255,.35)';
  c.lineWidth = 3;
  c.stroke();
  return cv;
}
