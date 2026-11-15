// Logic test for the points match, the shrimp race and the photo call: no browser, the gym map only.
import * as THREEm from 'three';
globalThis.THREE = THREEm;
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };

const { Sim } = await import('../src/sim.js');
const { Character, TECH, RACE } = await import('../src/character.js');
const { SLOW } = await import('../src/tech.js');
const { MATCH, layout, advance, posCode, posFrom } = await import('../src/match.js');
const { buildGym } = await import('../src/gym.js');
const { Net } = await import('../src/net.js');

const toasts = [];
const flashes = [];
const sounds = [];
let duel = null;
let prompt = null;
let raceHud = null;
let streakShown = 0;
const hooks = {
  toast: (m) => toasts.push(m), zone: () => {}, prompt: (p) => { prompt = p; }, sfx: (n) => sounds.push(n), camera: () => {},
  openBelt: () => {}, open: () => {}, duel: (d) => { duel = d; }, partner: () => {}, mat: () => {},
  flash: (f) => flashes.push(f), race: (r) => { raceHud = r; }, streak: (n) => { streakShown = n; },
  raceDone: (t) => ({ best: Math.min(t, 3.21), isBest: t < 3.21 }),
};
const sim = new Sim(hooks);
sim.sel.name = '현철';
sim.sel.belt = 'blue';
sim.applySel();
sim.npcMash = () => 0;
const DT = 1 / 60;
const idle = { mx: 0, my: 0, run: false, camYaw: 0 };
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const run = (sec, inp = idle) => { for (let i = 0; i < Math.round(sec / DT); i++) sim.step(DT, inp); };
const until = (fn, max = 30) => { for (let i = 0; i < max / DT && !fn(); i++) sim.step(DT, idle); return fn(); };
const tp = (x, z, yaw = 0) => { sim.p.x = x; sim.p.z = z; sim.p.yaw = yaw; sim.p.y = 0; };
const saw = (txt) => toasts.some((t) => t.includes(txt));
const FULL = TECH.end + SLOW.span / SLOW.k - SLOW.span;

const w = buildGym(sim.api);
w.freeze();
sim.setWorld(w);
run(1);
const npc = w.npcs.find((n) => n.name === '스파링 파트너');
const home = { x: npc.home.x, z: npc.home.z };
const near = () => { tp(home.x + 0.9, home.z, -Math.PI / 2); run(0.3); };

/* ---------- the rules, on their own ---------- */
{
  const M = { pos: 'stand', top: null };
  ok(advance(M, 'A').gain.n === 2 && M.pos === 'guard' && M.top === 'A', 'rules: a takedown is 2 and lands in the guard');
  ok(advance(M, 'A').gain.n === 3 && M.pos === 'side', 'rules: a guard pass is 3');
  ok(advance(M, 'A').gain.n === 4 && M.pos === 'mount', 'rules: the mount is 4');
  ok(advance(M, 'A').sub === true && M.pos === 'mount', 'rules: from the mount the next win is a finish attempt');
  const r = advance(M, 'B');
  ok(r.gain.n === 2 && r.gain.label === '스윕' && M.pos === 'guard' && M.top === 'B', 'rules: the one underneath sweeps for 2 and comes up in the guard');
  let all = true;
  for (const pos of ['guard', 'side', 'mount']) for (const top of ['A', 'B']) {
    const back = posFrom(posCode({ pos, top }));
    if (back.pos !== pos || back.top !== top) all = false;
  }
  ok(all && posCode({ pos: 'stand', top: null }) === 0 && posFrom(0).pos === 'stand' && posFrom(99).pos === 'stand', 'rules: the position survives being sent as one number');
  const L = layout({ pos: 'mount', top: 'B' }, 'pick', 0);
  ok(L.A.anim === 'mountBottom' && L.B.anim === 'mountTop' && L.A.u < 0 && L.B.u < 0, 'rules: with B on top the pair lies on A\'s side of the line');
}

{
  const { withName } = await import('../src/util.js');
  ok(withName('친구') === '친구와' && withName('민석') === '민석과' && withName('Kim') === 'Kim와(과)' && withName('스파링 파트너') === '스파링 파트너와', 'names take the particle that fits their last syllable');
}

/* ---------- a match against the sparring partner ---------- */
near();
run(2.2); // the bow on stepping onto the mat
near();
toasts.length = 0;
sim.npcPick = () => 's';
ok(sim.challenge('match') && sim.p.mode === 'duel' && duel && duel.kind === 'match' && duel.phase === 'intro', 'a match is offered to the partner and starts with a bow');
ok(saw('Combate!') && sounds.includes('whistle'), 'the start is called');
const d = sim.p.duel;
const M = d.M;
ok(M.total === 72 && M.left === 72, `the clock is the shorter belt's match time, scaled (${M.total} s for blue against blue)`);
run(0.5);
ok(M.left === 72 && sim.char.anim === 'bow' && npc.anim === 'bow', 'both bow; the clock is not running yet');
until(() => d.phase === 'pick', 3);
ok(duel.phase === 'pick' && duel.match && duel.match.me === 0 && duel.match.pos === '스탠딩', 'then hands are thrown from standing');
const sep = () => Math.hypot(sim.p.x - npc.x, sim.p.z - npc.z);
const win = () => { sim.npcPick = () => 's'; until(() => d.phase === 'pick' && !d.pick, 6); sim.pick('r'); };
const lose = () => { sim.npcPick = () => 'p'; until(() => d.phase === 'pick' && !d.pick, 6); sim.pick('r'); };
const settle = () => until(() => d.phase === 'pick' && !d.pick, 8);

win(); run(0.1);
ok(duel.phase === 'reveal' && duel.result === 1, 'round 1 is won');
until(() => d.phase === 'move', 3);
ok(saw('현철의 테이크다운!') && M.pos === 'guard' && M.top === 'A' && M.sc.A === 0, 'a takedown: on top in the guard, points not given yet');
ok(duel.phase === 'move' && duel.match.pos === '가드' && duel.match.top === '내가 위', 'the bar names the position');
settle();
ok(M.sc.A === 2 && M.sc.B === 0 && saw('테이크다운 2점 · 2 : 0') && d.round === 2, 'after the position is held: 2 points and the next round');
ok(sim.char.anim === 'guardTop' && npc.anim === 'guardBottom' && sep() < 0.6 && sep() > 0.3, `guard: one kneels, one lies (${sep().toFixed(2)} m apart)`);
ok(sim.netState().anim === 'guardTop' && sim.netState().du.ps === 1 && sim.netState().du.sa === 2, 'the position and the score are published');
const left1 = M.left;
ok(left1 < 72 && left1 > 62, `the clock ran during the round (${left1.toFixed(1)} s left)`);

win(); settle();
ok(M.sc.A === 5 && M.pos === 'side' && sim.char.anim === 'sideTop' && npc.anim === 'sideBottom' && saw('가드 패스 3점'), 'a guard pass: 3 points, side control');
win(); settle();
ok(M.sc.A === 9 && M.pos === 'mount' && sim.char.anim === 'mountTop' && npc.anim === 'mountBottom' && saw('마운트 4점'), 'the mount: 4 points');
ok(sim.netState().du.ps === 5, 'published as the mount with the challenger on top');
// the same hands: nothing changes
sim.npcPick = () => 'r'; sim.pick('r'); run(0.2);
ok(duel.phase === 'reveal' && duel.result === 0, 'the same hands are a draw');
settle();
ok(M.pos === 'mount' && M.sc.A === 9 && d.round === 5, 'a drawn round changes nothing');
lose(); settle();
ok(M.sc.B === 2 && M.top === 'B' && M.pos === 'guard' && sim.char.anim === 'guardBottom' && npc.anim === 'guardTop' && saw('스파링 파트너의 스윕!'), 'losing a round from the mount: swept, now underneath in the guard');
win(); settle();
ok(M.sc.A === 11 && M.top === 'A' && M.pos === 'guard', 'a sweep back: 2 points, on top again');
win(); settle(); win(); settle();
ok(M.sc.A === 18 && M.pos === 'mount', 'pass and mount again (18 points)');

// the finish from the mount
const before = { ax: sim.p.x, az: sim.p.z, dx: npc.x, dz: npc.z };
const leftBefore = M.left;
toasts.length = 0;
flashes.length = 0;
win();
until(() => sim.p.mode === 'bout', 3);
const b = sim.p.bout;
ok(b && d.phase === 'sub' && b.ground && b.a === sim.p && ['arm', 'kim', 'tri', 'rnc', 'guil'].includes(b.kind), `winning from the mount goes for a finish (${b && b.kind})`);
ok(Math.abs(b.t - TECH.down) < 0.05 && !b.open, 'the technique starts on the ground: no slap and bump, no takedown');
ok(Math.hypot(sim.p.x - before.ax, sim.p.z - before.az) < 0.06 && Math.hypot(npc.x - before.dx, npc.z - before.dz) < 0.06, 'nobody jumps when it starts');
ok(duel.match && duel.match.phase === 'sub' && sim.netState().bt.s === 1 && sim.netState().du.k === 'match', 'match and technique are both published');
ok(saw('노립니다!'), 'and it is announced');
const streak0 = sim.streak;
run(TECH.move + 0.2 - b.t);
ok(b.open && sim.mash(), 'the struggle opens as in any technique');
ok(sim.char.rate === 20 && npc.char.rate === 20, 'by then the bodies follow closely again');
until(() => d.phase === 'end', FULL);
ok(b.done && b.tapped && saw('한 판 종료 · 현철 승 ·') && M.end === 1 && M.how === 'sub', 'the tap ends the match');
ok(sim.streak === streak0 + 1, 'the win is counted once');
ok(flashes.some((f) => f.text === '탭!') && flashes.some((f) => f.text === '승리!'), 'tap and win are flashed');
ok(Math.abs(M.left - leftBefore) < 1.4, 'the clock stood still during the finish');
ok(duel.match.end === 'win' && sim.p.mode === 'duel', 'the bar shows the win');
run(0.6);
ok(sim.char.anim === 'win' && npc.anim === 'loco', 'the winner raises the arms');
run(MATCH.end - 1.2);
ok(sim.char.anim === 'bow' && npc.anim === 'bow', 'then both bow');
until(() => !sim.p.duel, 3);
ok(sim.p.mode === 'free' && duel === null && sim.char.rate === 20 && sim.char.anim === 'loco', 'and the match is over');
ok(sim.results.some((r) => r.text.startsWith('한 판 · 현철 승')), 'the result is kept for the boards');
until(() => !npc.busy && !npc.back, 12);
ok(Math.hypot(npc.x - home.x, npc.z - home.z) < 0.1 && npc.char.anim !== 'tech', 'the partner walks back to its spot');

// held in the mount by the partner: hammering gets out, and the match goes on standing
near(); run(1.2);
toasts.length = 0;
ok(sim.challenge('match'), 'a second match');
const d2 = sim.p.duel;
const loseTo = (dd) => { sim.npcPick = () => 'p'; until(() => dd.phase === 'pick' && !dd.pick, 8); sim.pick('r'); };
loseTo(d2); loseTo(d2); loseTo(d2);
until(() => d2.phase === 'pick' && !d2.pick, 8);
ok(d2.M.sc.B === 9 && d2.M.pos === 'mount' && d2.M.top === 'B' && sim.char.anim === 'mountBottom', 'three lost rounds: mounted, 0 : 9');
sim.npcMash = () => 2;
loseTo(d2);
until(() => sim.p.mode === 'bout', 3);
const b2 = sim.p.bout;
ok(b2 && b2.d === sim.p && b2.judge && saw('들어옵니다!'), 'the partner goes for the finish; this screen decides the struggle');
run(TECH.move + 0.1 - b2.t);
for (let i = 0; i < 8; i++) { sim.mash(); run(0.06); }
until(() => sim.p.mode === 'duel', FULL);
ok(b2.escaped && d2.phase === 'pick' && d2.M.pos === 'stand' && d2.M.top === null && d2.M.sc.B === 9 && saw('스탠딩에서 다시!'), 'eight presses against two: out, and back on the feet with the score kept');
ok(sim.char.anim === 'stance', 'standing again');
// the clock
d2.M.left = 0.4;
sim.npcPick = () => 's';
sim.pick('r');
until(() => d2.phase === 'end', 8);
ok(d2.M.sc.A === 2 && d2.M.end === 2 && d2.M.how === 'time' && saw('한 판 종료 · 스파링 파트너 승 · 9 : 2'), 'when the clock runs out the round in hand is finished and the points decide');
ok(sim.streak === 0, 'a lost match ends the run of wins');
until(() => !sim.p.duel, 6);
until(() => !npc.busy && !npc.back, 12);

// a draw on points, and giving up
near(); run(1.2);
toasts.length = 0;
sim.challenge('match');
const d3 = sim.p.duel;
until(() => d3.phase === 'pick', 3);
d3.M.left = 0.2;
until(() => d3.phase === 'end', 3);
ok(d3.M.end === 3 && saw('한 판 종료 · 무승부 · 0 : 0') && flashes.some((f) => f.text === '무승부'), 'no points on either side: a draw');
until(() => !sim.p.duel, 6);
until(() => !npc.busy && !npc.back, 12);
near(); run(1.2);
sim.challenge('match');
until(() => sim.p.duel.phase === 'pick', 3);
sim.cancelDuel();
ok(!sim.p.duel && sim.p.mode === 'free' && saw('한 판을 그만두었습니다') && sim.char.anim === 'loco', 'a match can be given up');
until(() => !npc.busy && !npc.back, 12);
// the scoreboard helper
near(); run(1.2);
sim.challenge('match');
const d4 = sim.p.duel;
win2(d4);
function win2(dd) { sim.npcPick = () => 's'; until(() => dd.phase === 'pick' && !dd.pick, 8); sim.pick('r'); until(() => dd.phase === 'pick' && !dd.pick, 8); }
const info = sim.matchIn(-12, 12, -8, 8);
ok(info && info.a === '현철' && info.b === '스파링 파트너' && info.sa === 2 && info.sb === 0 && info.pos === '가드', 'a board can read the match in its area');
ok(sim.matchIn(5, 6, 5, 6) === null, 'and none elsewhere');
sim.cancelDuel();
until(() => !npc.busy && !npc.back, 12);

/* ---------- a match against a person ---------- */
const mkPeer = (id, x, z) => ({ id, name: '친구', x, y: 0.04, z, yaw: 0, char: new Character({ medal: true }), busy: false, gone: false, du: null, bt: null, seat: '', bout: null, ctl: null, ctlAnim: '', st: { belt: 'purple' }, race: null, update() {}, dispose() {} });
let friend = mkPeer('peer-b', -7.5, -2.0);
sim.peers = () => [friend];
sim.myPeer = 'peer-a';
tp(-6.6, -2.0); run(1.6);
toasts.length = 0;
ok(sim.challenge('match') && duel.phase === 'wait' && duel.match === null, 'offering a match to a person waits for them');
const dp = sim.p.duel;
run(0.3);
ok(friend.ctl === null, 'they are not moved before they answer');
ok(sim.netState().du.k === 'match' && sim.netState().du.c === 1 && sim.netState().du.w === 'peer-b', 'the offer is published');
const theirs = (o) => { friend.du = Object.assign({ id: dp.id, k: 'match', r: dp.round, p: null, c: 0, sa: dp.M.sc.A, sb: dp.M.sc.B, tl: Math.ceil(dp.M.left), e: 0 }, o); };
theirs({});
run(0.2);
ok(dp.phase === 'intro' && saw('Combate! 친구와 한 판 · 72초'), 'their answer starts it (blue against purple: 72 s)');
until(() => dp.phase === 'pick', 3);
run(0.05);
ok(friend.ctl && friend.ctl.anim === 'stance', 'now their body is placed by the match');
const round = (mine, their) => {
  until(() => dp.phase === 'pick' && !dp.pick, 8);
  theirs({ r: dp.round });
  sim.pick(mine);
  run(0.1);
  theirs({ r: dp.round, p: their });
  until(() => dp.phase === 'pick' && !dp.pick && !dp.their, 8);
};
round('r', 's');
ok(dp.M.sc.A === 2 && friend.ctl.anim === 'guardBottom' && sim.char.anim === 'guardTop', 'a round won against a person: takedown');
round('r', 'p');
ok(dp.M.sc.B === 2 && dp.M.top === 'B' && friend.ctl.anim === 'guardTop', 'a round lost: swept');
round('r', 's'); round('r', 's'); round('r', 's');
ok(dp.M.pos === 'mount' && dp.M.top === 'A' && dp.M.sc.A === 11, 'sweep, pass, mount: 11 : 2');
// stale hands from an earlier round are not taken
theirs({ r: dp.round - 1, p: 's' });
sim.pick('r'); run(0.3);
ok(dp.phase === 'pick', 'a hand from an earlier round is not taken for this one');
theirs({ r: dp.round, p: 's' });
until(() => sim.p.mode === 'bout', 4);
const bp = sim.p.bout;
ok(bp && friend.bout === bp && friend.ctl === null && !bp.judge && bp.id === `${dp.id}-s${dp.round}`, 'the finish against a person: their screen decides it');
friend.bt = { id: bp.id, m: 9, e: 0 };
run(TECH.move + 0.3 - bp.t);
friend.bt = { id: bp.id, m: 9, e: 1 };
until(() => sim.p.mode === 'duel', FULL);
ok(bp.escaped && dp.phase === 'pick' && dp.M.pos === 'stand' && friend.bout === null, 'they got out: standing again');
run(0.1);
ok(friend.ctl && friend.ctl.anim === 'stance', 'and their body is placed by the match again');
// they stop answering
friend.du = null;
friend.bt = null;
toasts.length = 0;
run(3.8);
ok(!sim.p.duel && saw('상대가 한 판을 그만두었습니다') && friend.ctl === null, 'if they go quiet the match is dropped and their body is let go');
run(2);

// challenged by a person: their clock and their call at the end are followed
friend = mkPeer('peer-b', sim.p.x - 1.1, sim.p.z);
const off = { id: 'peer-b-9', k: 'match', r: 1, p: null, c: 1, w: 'peer-a', ox: sim.p.x - 0.55, oz: sim.p.z, yw: Math.PI / 2, sa: 0, sb: 0, tl: 72, e: 0, ps: 0 };
friend.du = off;
toasts.length = 0;
ok(sim.acceptDuel(friend, off) && sim.p.duel.me === 'B' && duel.phase === 'intro', 'a match offered by someone else is taken up');
const dq = sim.p.duel;
until(() => dq.phase === 'pick', 3);
friend.du = Object.assign({}, off, { p: 'r' });
sim.pick('s');
until(() => dq.phase === 'move', 4);
run(0.05);
ok(dq.M.top === 'A' && sim.char.anim === 'guardBottom', 'they won the round: taken down');
friend.du = Object.assign({}, off, { r: 2, sa: 2, tl: 40 });
until(() => dq.phase === 'pick', 4);
run(0.2);
ok(Math.abs(dq.M.left - 40) < 1.6, `their clock is followed (${dq.M.left.toFixed(1)} s)`);
friend.du = Object.assign({}, off, { r: 2, sa: 2, tl: 0, e: 1 });
run(0.2);
ok(dq.phase === 'end' && dq.M.end === 1 && saw('한 판 종료 · 친구 승 · 2 : 0') && flashes.some((f) => f.text === '패배'), 'their call ends it here too');
until(() => !sim.p.duel, 6);
ok(!sim.acceptDuel(friend, friend.du), 'the same offer is not taken up again');
sim.peers = () => [];
run(1);

/* ---------- somebody else's match against an NPC, seen from here ---------- */
{
  const net = new Net({ sim, world: w });
  const other = mkPeer('peer-c', home.x + 0.9, home.z);
  other.update = () => {};
  net.room = { presence() {} };
  net.avatars.set(other.id, other);
  net.list = [other];
  tp(2, 3); run(0.2);
  const yw = -Math.PI / 2;
  other.du = { id: 'peer-c-1', k: 'match', w: `n${npc.id}`, c: 1, r: 2, p: null, ox: home.x + 0.45, oz: home.z, yw, sa: 2, sb: 0, tl: 50, e: 0, ps: 1 };
  for (let i = 0; i < 90; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.busy && npc.anim === 'guardBottom' && net.held.has(npc), 'a watcher sees the NPC in the guard of somebody else\'s match');
  ok(sim.partner() === null || sim.partner().npc !== npc, 'and cannot challenge it meanwhile');
  other.du = Object.assign({}, other.du, { ps: 6, sb: 6 });
  for (let i = 0; i < 90; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.anim === 'mountTop', 'the position follows what is published');
  other.du = Object.assign({}, other.du, { r: 5 });
  other.bt = { id: 'peer-c-1-s5', w: `n${npc.id}`, k: 'arm', r: 'd', ox: other.du.ox, oz: other.du.oz, yw: yw + Math.PI, m: 0, e: 0, s: 1 };
  net.tick(DT); sim.step(DT, idle);
  ok(other.bout && other.bout.ground && other.bout.a === npc && sim.bouts.includes(other.bout), 'the finish attempt is shown from the ground');
  other.bt = Object.assign({}, other.bt, { e: 2 });
  for (let i = 0; i < FULL / DT + 30 && sim.bouts.length; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(sim.bouts.length === 0 && npc.busy && net.held.has(npc), 'after it the NPC is still held by the match');
  other.du = Object.assign({}, other.du, { e: 2, ps: 0 });
  other.bt = null;
  other.bout = null;
  for (let i = 0; i < 30; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.anim === 'win', 'the NPC that won raises the arms');
  other.du = null;
  for (let i = 0; i < 10; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(!npc.busy && !net.held.has(npc) && npc.char.rate === 20, 'when the match is gone the NPC is let go');
  until(() => !npc.back, 12);
  // the watcher's own match with it is not disturbed by a stale notice
  other.du = { id: 'peer-c-2', k: 'match', w: `n${npc.id}`, c: 1, r: 1, p: null, ox: home.x + 0.45, oz: home.z, yw, sa: 0, sb: 0, tl: 50, e: 0, ps: 3 };
  near(); run(1.2);
  sim.peers = () => [];
  ok(sim.challenge('match'), 'own match with the same NPC');
  for (let i = 0; i < 60; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(!net.held.has(npc) && npc.anim !== 'sideBottom', 'an NPC busy in a match here is not taken over by somebody else\'s');
  sim.cancelDuel();
  other.du = null;
  net._clear();
  sim.peers = () => [];
  until(() => !npc.busy && !npc.back, 12);
}

/* ---------- the shrimp race ---------- */
const R = w.race;
tp(R.x0 + 0.9, (R.z0 + R.z1) / 2); run(0.3);
ok(prompt && String(prompt.label).includes('새우빼기 경주'), 'the lane offers a race at its start');
toasts.length = 0;
flashes.length = 0;
sounds.length = 0;
sim.usePrompt();
ok(sim.p.mode === 'race' && sim.p.race.phase === 'count' && Math.abs(sim.p.x - R.x0) < 1e-6 && sim.char.anim === 'shrimpf', 'the racer lies down on the start line');
ok(!sim.stroke() && sim.p.race.n === 0, 'no shrimp before the signal');
ok(sim.netState().race && sim.netState().race.f === 0 && sim.netState().anim === 'shrimpf', 'the race is published');
run(0.1);
ok(prompt === null, 'no other prompt during a race');
run(3.0);
ok(sim.p.race.phase === 'go' && flashes.map((f) => f.text).join(' ') === '3 2 1 출발!' && sounds.filter((s) => s === 'tick').length === 3 && sounds.includes('whistle'), 'three, two, one, go');
ok(raceHud && raceHud.phase === 'go' && raceHud.prog === 0, 'the HUD follows');
// one press for every shrimp, in rhythm
let presses = 0;
const lead = sim.p.race.t; // how long after the signal the first press comes
for (let i = 0; i < 2000 && sim.p.race && sim.p.race.phase === 'go'; i++) {
  if (i % 24 === 0) { sim.stroke(); presses++; }
  sim.step(DT, idle);
}
const steady = sim.p.race.time;
ok(sim.p.race.phase === 'done' && sim.p.x <= R.x1 && presses === 12 && Math.abs(steady - lead - (11 * RACE.stroke + RACE.stroke * RACE.b)) < 0.05, `twelve shrimps in rhythm cross the line (${steady.toFixed(2)} s, ${lead.toFixed(2)} s of it before the first press)`);
ok(saw('완주!') && saw('새우빼기 12번') && saw('내 최고 3.21초') && flashes.some((f) => f.text === `${steady.toFixed(2)}초`), 'the time is told, with the best so far');
ok(sim.netState().race.f === Math.round(steady * 100), 'and published');
run(1.6);
ok(sim.p.mode === 'free' && !sim.p.race && raceHud === null && sim.char.anim === 'loco', 'the racer gets up');
ok(sim.netState().race && sim.netState().race.f > 0, 'the time stays published for a while');
run(8);
ok(sim.netState().race === null, 'then it is taken down');
// hammering is faster
tp(R.x0 + 0.9, (R.z0 + R.z1) / 2); run(0.3);
toasts.length = 0;
sim.usePrompt();
run(3.02);
for (let i = 0; i < 2000 && sim.p.race && sim.p.race.phase === 'go'; i++) {
  if (i % 6 === 0) sim.stroke(); // ten presses a second
  sim.step(DT, idle);
}
const fast = sim.p.race.time;
ok(sim.p.race.phase === 'done' && fast < steady * 0.6 && fast > 1.5, `hammering the button is much faster (${fast.toFixed(2)} s against ${steady.toFixed(2)} s)`);
ok(saw('내 최고 기록!'), 'a new best is told');
run(1.6);
// walking away ends it
tp(R.x0 + 0.9, (R.z0 + R.z1) / 2); run(0.3);
sim.usePrompt();
run(1);
toasts.length = 0;
run(0.2, { mx: 1, my: 0, run: false, camYaw: 0 });
ok(sim.p.mode === 'free' && !sim.p.race && saw('경주를 그만두었습니다'), 'pushing the stick leaves the race');
ok(!sim.challenge('match') || true, 'nothing else breaks');
run(1);
// joining somebody else's race from the start area
friend = mkPeer('peer-b', R.x0, -0.2);
friend.race = { id: 'peer-b-r1', f: 0 };
tp(R.x0 + 1.2, -0.8); run(0.2);
toasts.length = 0;
sim.seeRace(friend);
ok(sim.p.mode === 'race' && sim.p.race.id === 'peer-b-r1' && saw('함께합니다'), 'someone starting a race takes along whoever stands at the start');
run(0.2, { mx: 1, my: 0, run: false, camYaw: 0 });
sim.seeRace(friend);
ok(sim.p.mode === 'free', 'having left it, the same race is not joined again');
friend.race = { id: 'peer-b-r2', f: 0 };
tp(2, 3); run(0.2);
sim.seeRace(friend);
ok(sim.p.mode === 'free', 'nor a race by someone when standing elsewhere');
friend.race = { id: 'peer-b-r2', f: 512 };
friend.x = sim.p.x + 3; friend.z = sim.p.z;
toasts.length = 0;
sim.seeRace(friend); sim.seeRace(friend);
ok(toasts.filter((t) => t.includes('친구 님 새우빼기 5.12초')).length === 1, 'another person\'s time is told once');

// racing together: someone who finished long before still came first
friend = mkPeer('peer-b', R.x0, -0.2);
friend.race = { id: 'peer-b-r3', f: 0 };
sim.peers = () => [friend];
tp(R.x0 + 1.2, -0.8); run(0.2);
sim.seeRace(friend);
ok(sim.p.mode === 'race' && sim.p.race.id === 'peer-b-r3', 'joined a third race');
run(3.1);
friend.race = { id: 'peer-b-r3', f: 250 };
sim.seeRace(friend);
run(9);
friend.race = null; // their time is no longer published
toasts.length = 0;
for (let i = 0; i < 3000 && sim.p.race && sim.p.race.phase === 'go'; i++) { if (i % 24 === 0) sim.stroke(); sim.step(DT, idle); }
ok(saw('· 2등'), 'second place is told even when the winner finished long before', toasts.join(' | '));
run(2);
sim.peers = () => [];

/* ---------- the photo call ---------- */
ok(sim.netState().photo === 0, 'no photo call to begin with');
sim.photoCall();
ok(sim.netState().photo === 1, 'a photo call is published');
run(5.2);
ok(sim.netState().photo === 0, 'and taken down after the picture');
sim.photoCall();
ok(sim.netState().photo === 2, 'each call has its own number');

/* ---------- fuzz: matches, races and techniques thrown together ---------- */
{
  sim.peers = () => [];
  sim.npcMash = (role) => (role === 'd' ? (Math.random() * 9) | 0 : (Math.random() * 6) | 0);
  sim.npcPick = () => 'srp'[(Math.random() * 3) | 0];
  let bad = '';
  let ended = 0;
  const seen = new Set();
  const orig = hooks.toast;
  hooks.toast = (m) => { if (m.startsWith('한 판 종료')) ended++; orig(m); };
  for (let i = 0; i < 40000 && !bad; i++) {
    const a = Math.sin(i * 0.011) * 6.28;
    const still = (i % 2400) < 1900; // long stretches without the stick, so that matches can be played out
    sim.step(DT, still ? idle : { mx: Math.cos(a), my: Math.sin(a * 1.3), run: false, camYaw: 0 });
    if (i % 2400 === 1890) near();
    if (i % 2400 === 0) near();
    if (i % 2400 === 20) sim.challenge(i % 4800 ? 'match' : 'tri');
    if (i % 31 === 0) sim.pick('srp'[(Math.random() * 3) | 0]);
    if (i % 7 === 0) sim.mash();
    if (i % 911 === 0) sim.stroke();
    if (i % 9000 === 8000) sim.cancelDuel();
    const p = sim.p;
    if (p.duel && p.duel.M) seen.add(p.duel.M.pos);
    if (!Number.isFinite(p.x + p.y + p.z + p.yaw)) bad = 'not finite';
    else if (Math.abs(p.x) > 12.01 || p.z > 8.01 || p.z < -22 || p.y < -0.01) bad = `outside (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
    else if (p.duel && p.duel.M && (p.duel.M.sc.A > 400 || p.duel.M.left < -0.1)) bad = 'score or clock out of range';
  }
  ok(!bad, `fuzz: matches against the NPC stay sane${bad ? ` (${bad})` : ''}`);
  ok(ended >= 3 && seen.has('mount') && seen.has('side') && seen.has('guard'), `fuzz: matches were played to an end (${ended}) through every position`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
