/* global location */
// The sky outside the dojo follows the visitor's own clock: daylight, a warm dusk and dawn, and
// night with the lights on in the apartment blocks.

// The hour of the day as a number (18.5 = half past six). ?h=21 pins it, for looking at a time on purpose.
export function hourNow() {
  try {
    const m = /[?&]h=([0-9.]+)/.exec(location.search);
    if (m) {
      const v = parseFloat(m[1]);
      if (v >= 0 && v < 24) return v;
    }
  } catch (e) { /* no address to read: use the clock */ }
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

// The hour asked for in the address (?h=9), or null. The dojo's terrace is shown by night unless
// one is given.
export function hourAsked() {
  try {
    const m = /[?&]h=([0-9.]+)/.exec(location.search);
    if (m) {
      const v = parseFloat(m[1]);
      if (v >= 0 && v < 24) return v;
    }
  } catch (e) { /* no address to read */ }
  return null;
}
export const NIGHT_HOUR = 21.5;

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a, b, t) => {
  const A = hex(a);
  const B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const step = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const DAY = { top: '#6fa9de', mid: '#a9cdea', low: '#dbe9f1', cloud: '#ffffff' };
const DUSK = { top: '#4a5f9a', mid: '#e79a78', low: '#ffd3a6', cloud: '#ffc4a8' };
const NIGHT = { top: '#070b1a', mid: '#101832', low: '#232c4a', cloud: '#2c3554' };

// night: 0 in daylight, 1 in the dark. glow: how much of the sunset or sunrise colour there is.
export function skyAt(h) {
  const night = h >= 12 ? step(17.3, 19.3, h) : 1 - step(5.3, 7.1, h);
  const glow = h >= 12 ? Math.sin(Math.PI * step(16.6, 19.6, h)) : Math.sin(Math.PI * step(4.9, 7.5, h));
  const col = (k) => mix(mix(DAY[k], NIGHT[k], night), DUSK[k], glow * 0.8);
  const low = col('low');
  return {
    hour: h,
    night,
    glow,
    top: col('top'),
    mid: col('mid'),
    low,
    fog: low,
    cloud: col('cloud'),
    k: 1 - 0.82 * night, // how brightly things standing outside glow with daylight of their own
    dark: night > 0.5, // windows lit, lamps on, stars out
  };
}
