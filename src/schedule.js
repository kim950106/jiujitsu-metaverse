// The dojo's timetable as the owner gave it: three one-hour classes every weekday evening, and
// what a class runs through on each day. Nothing here is fetched or stored; to change the
// timetable, change this file.
export const TIMES = [18, 19, 20]; // the hour each class starts; a class lasts one hour
export const ROWS = [
  { days: [1, 2], label: '월 · 화', flow: ['드릴', '기술', '스파링'] },
  { days: [3, 4], label: '수 · 목', flow: ['기술', '스파링'] },
  { days: [5], label: '금', flow: ['오픈매트'] },
];
const DAY = ['일', '월', '화', '수', '목', '금', '토'];
export const hourText = (h) => `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시`;
export const timesText = () => `${hourText(TIMES[0])} · ${TIMES.slice(1).map((h) => `${h % 12 || 12}시`).join(' · ')}`;
export const flowText = (flow) => flow.join(' → ');

// What the timetable says about a moment (the device's own clock): one line of text.
export function todayLine(d = new Date()) {
  const day = d.getDay();
  const row = ROWS.find((r) => r.days.includes(day));
  if (!row) return `오늘(${DAY[day]})은 시간표에 수업이 없습니다.`;
  const h = d.getHours() + d.getMinutes() / 60;
  const on = TIMES.find((t) => h >= t && h < t + 1);
  const next = TIMES.find((t) => t > h);
  const head = `오늘(${DAY[day]}) ${flowText(row.flow)}`;
  if (on != null) return `${head} · 지금 ${hourText(on)} 타임 진행 중`;
  if (next != null) return `${head} · 다음 타임 ${hourText(next)}`;
  return `${head} · 오늘 수업은 끝났습니다`;
}
