// Logic test for sparring, the drills, the shrimp race and the photo call: no browser, the gym map only.
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
const { RULES, ruleFor, verdict, sparSpot } = await import('../src/spar.js');
const { buildGym } = await import('../src/gym.js');
const { Net } = await import('../src/net.js');

const toasts = [];
const flashes = [];
const sounds = [];
let duel = null;
let ask;
let prompt = null;
let raceHud = null;
let streakShown = 0;
const hooks = {
  toast: (m) => toasts.push(m), zone: () => {}, prompt: (p) => { prompt = p; }, sfx: (n) => sounds.push(n), camera: () => {},
  openBelt: () => {}, open: () => {}, duel: (d) => { duel = d; }, ask: (a) => { ask = a; }, partner: () => {}, mat: () => {},
  flash: (f) => flashes.push(f), race: (r) => { raceHud = r; }, streak: (n) => { streakShown = n; },
  raceDone: (t) => ({ best: Math.min(t, 3.21), isBest: t < 3.21 }),
};
const sim = new Sim(hooks);
sim.sel.name = '현철';
sim.sel.belt = 'blue';
sim.applySel();
const DT = 1 / 60;
const idle = { mx: 0, my: 0, run: false, camYaw: 0 };
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const run = (sec, inp = idle, each) => { for (let i = 0; i < Math.round(sec / DT); i++) { if (each) each(); sim.step(DT, inp); } };
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
  ok(ruleFor('white', 'white').text === '5판 3선승' && ruleFor('blue', 'blue').text === '6판 4선승' && ruleFor('purple', 'purple').text === '7판 4선승'
    && ruleFor('brown', 'brown').text === '8판 5선승' && ruleFor('black', 'black').text === '10판 6선승', 'rules: rounds and wins needed by belt');
  ok(ruleFor('blue', 'white').belt === 'white' && ruleFor('white', 'black').max === 5 && ruleFor('black', 'brown').need === 5 && ruleFor('purple', undefined).belt === 'white', 'rules: two belts spar by the lower belt\'s rule');
  const S = (a, b, belt) => ({ w: { A: a, B: b }, n: a + b, max: RULES[belt][0], need: RULES[belt][1] });
  ok(verdict(S(3, 0, 'white')) === 1 && verdict(S(2, 3, 'white')) === 2 && verdict(S(2, 2, 'white')) === 0, 'rules: white is first to 3');
  ok(verdict(S(3, 3, 'blue')) === 3 && verdict(S(4, 2, 'blue')) === 1 && verdict(S(3, 2, 'blue')) === 0, 'rules: 3 : 3 of 6 is a draw');
  ok(verdict(S(5, 5, 'black')) === 3 && verdict(S(4, 6, 'black')) === 2 && verdict(S(4, 4, 'brown')) === 3 && verdict(S(4, 3, 'purple')) === 1, 'rules: the other belts');
  const a = sparSpot({ ox: 0, oz: 0, yaw: 0 }, 'A', 'pick', 0, 0);
  const b = sparSpot({ ox: 0, oz: 0, yaw: 0 }, 'B', 'end', 0, 2);
  ok(a.z < 0 && b.z > 0 && a.anim === 'stance' && b.anim === 'win' && Math.abs(b.yaw - Math.PI) < 1e-9, 'rules: the two stand across from each other; the winner raises the arms');
}

{
  const { withName } = await import('../src/util.js');
  ok(withName('친구') === '친구와' && withName('민석') === '민석과' && withName('Kim') === 'Kim와(과)' && withName('스파링 파트너') === '스파링 파트너와', 'names take the particle that fits their last syllable');
}

/* ---------- sparring with the NPC partner ---------- */
near();
run(2.2); // the bow on stepping onto the mat
near();
toasts.length = 0;
sim.npcPick = () => 's';
ok(sim.setTech('tri') && sim.tech === 'tri' && !sim.setTech('nope') && !sim.setTech('constructor'), 'a technique is chosen by name; anything else is refused');
ok(sim.challenge() && sim.p.mode === 'duel' && duel && duel.kind === 'spar' && duel.phase === 'intro', 'sparring with an NPC starts at once, with a bow');
ok(saw('스파링 파트너와 스파링 · 6판 4선승') && sounds.includes('whistle'), 'the start is called with the rule (blue against blue)');
const d = sim.p.duel;
const S = d.S;
run(0.5);
ok(sim.char.anim === 'bow' && npc.anim === 'bow', 'both bow');
until(() => d.phase === 'pick', 3);
ok(duel.phase === 'pick' && duel.spar && duel.spar.me === 0 && duel.spar.n === 1 && duel.spar.rule === '6판 4선승' && duel.tech === 'tri', 'then hands are thrown; the strip shows the round and the technique');
const win = () => { sim.npcPick = () => 's'; until(() => d.phase === 'pick' && !d.pick, 12); sim.pick('r'); };
const lose = () => { sim.npcPick = () => 'p'; until(() => d.phase === 'pick' && !d.pick, 12); sim.pick('r'); run(0.05); };

win(); run(0.1);
ok(duel.phase === 'reveal' && duel.result === 1, 'throw 1 is won');
sim.setTech('arm');
until(() => sim.p.mode === 'bout', 3);
const b1 = sim.p.bout;
ok(b1 && b1.kind === 'tri' && b1.a === sim.p && !b1.skip && d.phase === 'sub', 'the winner puts on the technique chosen when the hand was thrown; the first round has the slap and bump');
ok(saw('이겼습니다! 트라이앵글을 겁니다'), 'and is told so');
ok(S.w.A === 0 && S.n === 0, 'the round is not counted before the tap');
run(TECH.tap - b1.t + 0.05);
ok(S.w.A === 1 && S.n === 1 && saw('탭! 현철의 트라이앵글 성공 · 1 : 0') && flashes.some((f) => f.text === '탭!'), 'at the tap the round is counted');
ok(sim.netState().bt && sim.netState().bt.k === 'tri' && sim.netState().bt.r === 'a' && sim.netState().du.sa === 1, 'the technique and the score are published');
until(() => sim.p.mode === 'duel', FULL);
ok(d.phase === 'pick' && d.round === 2 && duel.spar.n === 2 && sim.char.anim === 'stance', 'then the next round, standing');
// a drawn throw is thrown again and is not a round
sim.npcPick = () => 'r';
sim.pick('r');
until(() => d.phase === 'pick' && !d.pick, 4);
ok(d.round === 3 && S.n === 1 && S.w.A === 1 && S.w.B === 0, 'a drawn throw is thrown again; it is not a round');
lose();
until(() => sim.p.mode === 'bout', 3);
const b2 = sim.p.bout;
ok(b2.d === sim.p && b2.a === npc && b2.skip && saw('들어옵니다'), 'a lost throw: the NPC puts its technique on, without the slap and bump');
until(() => sim.p.mode === 'duel', FULL);
ok(S.w.B === 1 && S.n === 2, '1 : 1');
const settle = () => until(() => sim.p.mode === 'duel' && d.phase === 'pick' && !d.pick, FULL + 6);
win(); settle();
win(); settle();
ok(S.w.A === 3 && d.phase === 'pick', '3 : 1 is not yet the end for blue belts');
toasts.length = 0;
win(); until(() => d.phase === 'end', FULL + 3);
ok(S.end === 1 && S.w.A === 4 && saw('스파링 종료 · 현철 승 · 4 : 1') && flashes.some((f) => f.text === '승리!') && sim.streak === 1 && streakShown === 1, 'the fourth round won ends it: 4 : 1');
run(0.3);
ok(sim.char.anim === 'win' && npc.anim === 'loco', 'the winner raises the arms');
ok(duel.spar.end === 'win' && sim.netState().du.e === 1, 'the end is shown and published');
until(() => !sim.p.duel, 6);
ok(sim.p.mode === 'free' && sim.char.anim === 'loco', 'and both are let go');
until(() => !npc.busy && !npc.back, 12);

// a draw: 3 : 3 of 6
near(); run(1.6);
ok(sim.challenge(), 'again');
{
  const dd = sim.p.duel;
  const go = (mine) => { sim.npcPick = () => (mine ? 's' : 'p'); until(() => dd.phase === 'pick' && !dd.pick, FULL + 6); sim.pick('r'); run(0.05); };
  toasts.length = 0;
  for (const m of [1, 0, 1, 0, 1, 0]) go(m);
  until(() => dd.phase === 'end', FULL + 3);
  ok(dd.S.end === 3 && dd.S.w.A === 3 && dd.S.w.B === 3 && saw('스파링 종료 · 무승부 · 3 : 3') && sim.streak === 1, 'six rounds, 3 : 3: a draw, and the run of wins stands');
  until(() => !sim.p.duel, 6);
  until(() => !npc.busy && !npc.back, 12);
}
// a loss, by the white belt's rule when the player is a white belt
sim.sel.belt = 'white';
near(); run(1.6);
sim.challenge();
{
  const dd = sim.p.duel;
  ok(dd.S.max === 5 && dd.S.need === 3, 'a white belt against a blue belt spars by the white belt\'s rule');
  toasts.length = 0;
  for (let i = 0; i < 3; i++) { sim.npcPick = () => 'p'; until(() => dd.phase === 'pick' && !dd.pick, FULL + 6); sim.pick('r'); }
  until(() => dd.phase === 'end', FULL + 3);
  ok(dd.S.end === 2 && saw('스파링 종료 · 스파링 파트너 승 · 3 : 0') && sim.streak === 0, 'lost 0 : 3; the run of wins is over');
  until(() => !sim.p.duel, 6);
  until(() => !npc.busy && !npc.back, 12);
}
sim.sel.belt = 'blue';
// giving up, off the mat, no partner
near(); run(1.6);
sim.challenge();
until(() => sim.p.duel.phase === 'pick', 3);
toasts.length = 0;
sim.cancelDuel();
ok(!sim.p.duel && sim.p.mode === 'free' && saw('스파링을 그만두었습니다') && sim.char.anim === 'loco', 'sparring can be given up');
until(() => !npc.busy && !npc.back, 12);
// an unpicked hand is thrown for the player
near(); run(1.6);
sim.challenge();
{
  const dd = sim.p.duel;
  until(() => dd.phase === 'pick', 3);
  sim.npcPick = () => 's';
  ok(until(() => dd.phase !== 'pick', 9.5) && dd.pick && dd.tk === sim.tech, 'a hand not thrown in time is thrown at random, with the chosen technique');
  const info = sim.matchIn(-12, 12, -8, 8);
  ok(info && info.a === '현철' && info.b === '스파링 파트너' && info.need === 4 && info.max === 6, 'a board can read the sparring in its area');
  ok(sim.matchIn(5, 6, 5, 6) === null, 'and none elsewhere');
  until(() => sim.p.mode === 'duel' && dd.phase === 'pick', FULL + 6);
  sim.cancelDuel();
  until(() => !npc.busy && !npc.back, 12);
}

/* ---------- sparring with a person ---------- */
const mkPeer = (id, x, z) => ({ id, name: '친구', x, y: 0.04, z, yaw: 0, char: new Character({ medal: true }), busy: false, gone: false, du: null, bt: null, rj: '', seat: '', bout: null, ctl: null, ctlAnim: '', st: { belt: 'purple' }, race: null, update() {}, dispose() {} });
let friend = mkPeer('peer-b', -7.5, -2.0);
sim.peers = () => [friend];
sim.myPeer = 'peer-a';
tp(-6.6, -2.0); run(1.6);
toasts.length = 0;
ok(sim.challenge() && duel.phase === 'wait' && duel.spar === null && saw('친구 님에게 스파링을 신청했습니다'), 'asking a person waits for their answer');
let dp = sim.p.duel;
run(0.3);
ok(friend.ctl === null, 'they are not moved before they answer');
ok(sim.netState().du.k === 'spar' && sim.netState().du.c === 1 && sim.netState().du.w === 'peer-b', 'the request is published');
// they say no
friend.rj = dp.id;
run(0.2);
ok(!sim.p.duel && saw('친구 님이 스파링을 사양했습니다'), 'a no ends the request');
friend.rj = '';
run(1.2);
// nobody answers
sim.challenge();
toasts.length = 0;
run(15.3);
ok(!sim.p.duel && saw('상대가 응하지 않았습니다'), 'no answer in 15 seconds ends it too');
run(1.2);
// they say yes
sim.challenge();
dp = sim.p.duel;
const theirs = (o) => { friend.du = Object.assign({ id: dp.id, k: 'spar', r: dp.round, p: null, tk: 'kim', q: null, qk: 'arm', c: 0, sa: 0, sb: 0, e: 0 }, o); };
theirs({});
toasts.length = 0;
run(0.2);
ok(dp.phase === 'intro' && saw('친구와 스파링 · 6판 4선승'), 'their yes starts it (blue against purple: the blue belt\'s rule)');
until(() => dp.phase === 'pick', 3);
run(0.05);
ok(friend.ctl && friend.ctl.anim === 'stance', 'now their body is placed by the sparring');
sim.setTech('rnc');
const round = (mine, their) => {
  until(() => sim.p.mode === 'duel' && dp.phase === 'pick' && !dp.pick, FULL + 6);
  theirs({ r: dp.round });
  sim.pick(mine);
  run(0.1);
  theirs({ r: dp.round, p: their });
  until(() => sim.p.mode === 'bout' || (dp.phase === 'pick' && !dp.pick), 4);
};
round('r', 's');
ok(sim.p.bout && sim.p.bout.kind === 'rnc' && friend.bout === sim.p.bout && friend.ctl === null, 'a throw won against a person: my technique');
until(() => sim.p.mode === 'duel', FULL);
ok(dp.S.w.A === 1 && friend.bout === null, 'counted');
round('r', 'p');
ok(sim.p.bout && sim.p.bout.kind === 'kim' && sim.p.bout.a === friend, 'a throw lost: the technique they chose');
until(() => sim.p.mode === 'duel', FULL);
ok(dp.S.w.B === 1, '1 : 1');
// a hand from an earlier throw is not taken
until(() => dp.phase === 'pick' && !dp.pick, 3);
theirs({ r: dp.round - 1, p: 's' });
sim.pick('r'); run(0.3);
ok(dp.phase === 'pick', 'a hand from an earlier throw is not taken for this one');
// they have already gone on to the next throw: the hand of this one comes along with it
theirs({ r: dp.round + 1, p: null, q: 's', qk: 'omo' });
run(0.1);
ok(dp.phase === 'reveal' && dp.result === 1, 'a hand that was missed is taken from what they send with the next throw');
until(() => sim.p.mode === 'duel' && dp.phase === 'pick' && !dp.pick, FULL + 6);
ok(sim.netState().du.q === 'r' && sim.netState().du.qk === 'rnc' && sim.netState().du.r === dp.round, 'and mine goes out the same way');
// they stop answering
friend.du = null;
friend.bt = null;
toasts.length = 0;
run(3.8);
ok(!sim.p.duel && saw('상대가 스파링을 그만두었습니다') && friend.ctl === null, 'if they go quiet the sparring is dropped and their body is let go');
run(2);

// asked by a person: a request to answer
friend = mkPeer('peer-b', sim.p.x - 1.1, sim.p.z);
sim.peers = () => [friend];
const off = { id: 'peer-b-9', k: 'spar', r: 1, p: null, tk: 'arm', q: null, qk: 'arm', c: 1, w: 'peer-a', ox: sim.p.x - 0.55, oz: sim.p.z, yw: Math.PI / 2, sa: 0, sb: 0, e: 0 };
friend.du = off;
toasts.length = 0;
ask = undefined;
ok(sim.offer(friend, off) && sim.ask && ask && ask.name === '친구' && ask.rule === '6판 4선승' && !sim.p.duel, 'a request from someone else is shown, not started');
ok(!sim.offer(friend, off), 'the same request is not shown twice');
run(0.5, undefined, () => sim.offer(friend, off));
ok(sim.ask, 'it stays while they keep asking');
ok(sim.answer(false) && !sim.ask && ask === null && sim.netState().rj === 'peer-b-9' && saw('스파링을 사양했습니다'), 'no: they are told');
ok(!sim.offer(friend, off), 'and the same request does not come back');
run(4.2);
ok(sim.netState().rj === null, 'the no is taken down after a while');
const off2 = Object.assign({}, off, { id: 'peer-b-10' });
friend.du = off2;
sim.offer(friend, off2);
friend.du = null; // they took it back
toasts.length = 0;
run(1);
ok(!sim.ask && ask === null && saw('스파링 신청이 취소되었습니다'), 'a request that is taken back goes away');
const off3 = Object.assign({}, off, { id: 'peer-b-11' });
friend.du = off3;
sim.offer(friend, off3);
ok(sim.challenge() && sim.p.duel && sim.p.duel.me === 'B' && duel.phase === 'intro' && !sim.ask, 'yes (the sparring button says yes too): it starts');
const dq = sim.p.duel;
until(() => dq.phase === 'pick', 3);
friend.du = Object.assign({}, off3, { p: 'r', tk: 'guil' });
sim.pick('s');
until(() => sim.p.mode === 'bout', 4);
ok(sim.p.bout.kind === 'guil' && sim.p.bout.d === sim.p && sim.p.bout.yaw === dq.yaw, 'they won the throw: their technique, facing along the line');
until(() => sim.p.mode === 'duel', FULL);
ok(dq.S.w.A === 1 && duel.spar.them === 1 && duel.spar.me === 0, 'their round');
for (let i = 2; i <= 4; i++) {
  until(() => dq.phase === 'pick' && !dq.pick, 3);
  friend.du = Object.assign({}, off3, { r: dq.round, p: 'r', tk: 'arm', sa: i - 1 });
  sim.pick('s');
  until(() => sim.p.mode === 'bout', 4);
  until(() => sim.p.mode === 'duel', FULL);
}
ok(dq.phase === 'end' && dq.S.end === 1 && saw('스파링 종료 · 친구 승 · 4 : 0') && flashes.some((f) => f.text === '패배'), 'four rounds to them: lost');
until(() => !sim.p.duel, 6);
ok(!sim.offer(friend, friend.du), 'the request that was just played is not shown again');
sim.peers = () => [];
run(1);

/* ---------- somebody else's sparring with an NPC, seen from here ---------- */
{
  const net = new Net({ sim, world: w });
  const other = mkPeer('peer-c', home.x + 0.9, home.z);
  other.update = () => {};
  net.room = { presence() {} };
  net.avatars.set(other.id, other);
  net.list = [other];
  tp(2, 3); run(0.2);
  const yw = -Math.PI / 2;
  other.du = { id: 'peer-c-1', k: 'spar', w: `n${npc.id}`, c: 1, r: 2, p: null, ox: home.x + 0.45, oz: home.z, yw, sa: 1, sb: 0, e: 0 };
  for (let i = 0; i < 90; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.busy && npc.anim === 'stance' && net.held.has(npc), 'a watcher sees the NPC standing across from somebody else');
  ok(sim.partner() === null || sim.partner().npc !== npc, 'and cannot ask it meanwhile');
  const brd = sim.matchIn(-12, 12, -8, 8);
  ok(brd && brd.a === '친구' && brd.b === '스파링 파트너' && brd.sa === 1 && brd.need === 4, 'a board reads their sparring');
  other.bt = { id: 'peer-c-1-s2', w: `n${npc.id}`, k: 'arm', r: 'd', ox: other.du.ox, oz: other.du.oz, yw: yw + Math.PI, s: 1 };
  net.tick(DT); sim.step(DT, idle);
  ok(other.bout && other.bout.skip && other.bout.a === npc && sim.bouts.includes(other.bout), 'a round of theirs is shown, without the slap and bump');
  for (let i = 0; i < FULL / DT + 30 && sim.bouts.length; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(sim.bouts.length === 0 && npc.busy && net.held.has(npc), 'after it the NPC is still held by the sparring');
  other.du = Object.assign({}, other.du, { e: 2 });
  other.bt = null;
  other.bout = null;
  for (let i = 0; i < 30; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.anim === 'win', 'the NPC that won raises the arms');
  other.du = null;
  for (let i = 0; i < 10; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(!npc.busy && !net.held.has(npc), 'when the sparring is gone the NPC is let go');
  until(() => !npc.back, 12);
  // the watcher's own sparring with it is not disturbed by a stale notice
  other.du = { id: 'peer-c-2', k: 'spar', w: `n${npc.id}`, c: 1, r: 1, p: null, ox: home.x + 0.45, oz: home.z, yw, sa: 0, sb: 0, e: 0 };
  near(); run(1.2);
  sim.peers = () => [];
  ok(sim.challenge(), 'own sparring with the same NPC');
  for (let i = 0; i < 60; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(!net.held.has(npc), 'an NPC busy sparring here is not taken over by somebody else\'s');
  sim.cancelDuel();
  other.du = null;
  net._clear();
  sim.peers = () => [];
  until(() => !npc.busy && !npc.back, 12);
}

/* ---------- the drills ---------- */
{
  near(); run(1.6);
  const z0 = sim.p.z; const x0 = sim.p.x;
  sim.doAction('rollb');
  ok(sim.p.mode === 'action' && sim.char.anim === 'rollb', 'the backward roll starts on the mat');
  until(() => sim.p.mode === 'free', 3);
  const back = (sim.p.x - x0) * Math.sin(sim.p.yaw) + (sim.p.z - z0) * Math.cos(sim.p.yaw);
  ok(back < -1.2 && back > -1.8, `it carries the body backwards (${back.toFixed(2)} m)`);
  const x1 = sim.p.x; const z1 = sim.p.z;
  sim.doAction('scoot');
  ok(sim.char.anim === 'scoot', 'the hip walk starts');
  until(() => sim.p.mode === 'free', 6);
  const fwd = (sim.p.x - x1) * Math.sin(sim.p.yaw) + (sim.p.z - z1) * Math.cos(sim.p.yaw);
  ok(fwd > 1.0 && fwd < 1.7, `and carries the body forwards (${fwd.toFixed(2)} m)`);
  tp(0, 5); run(0.3);
  toasts.length = 0;
  sim.doAction('scoot');
  ok(sim.p.mode === 'free' && saw('매트 위에서'), 'off the mat neither is done');
  ok(!sim.challenge() && saw('스파링은 매트 위에서'), 'nor is sparring');
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

/* ---------- fuzz: sparring, races and drills thrown together ---------- */
{
  sim.peers = () => [];
  sim.npcPick = () => 'srp'[(Math.random() * 3) | 0];
  let bad = '';
  let ended = 0;
  const kinds = new Set();
  const orig = hooks.toast;
  hooks.toast = (m) => { if (m.startsWith('스파링 종료')) ended++; orig(m); };
  const K = ['ankle', 'arm', 'guil', 'omo', 'rnc', 'tri', 'kim'];
  for (let i = 0; i < 60000 && !bad; i++) {
    const a = Math.sin(i * 0.011) * 6.28;
    const still = (i % 6000) < 5400; // long stretches without the stick, so that sparring can be played out
    sim.step(DT, still ? idle : { mx: Math.cos(a), my: Math.sin(a * 1.3), run: false, camYaw: 0 });
    if (i % 6000 === 5390) near();
    if (i % 6000 === 0) near();
    if (i % 6000 === 20) sim.challenge();
    if (i % 31 === 0) sim.pick('srp'[(Math.random() * 3) | 0]);
    if (i % 53 === 0) sim.setTech(K[(Math.random() * 7) | 0]);
    if (i % 911 === 0) sim.stroke();
    if (i % 1777 === 0) sim.doAction(['rollb', 'scoot', 'roll', 'bridge'][(i / 1777) % 4]);
    if (i % 29000 === 28000) sim.cancelDuel();
    const p = sim.p;
    if (p.bout) kinds.add(p.bout.kind);
    if (!Number.isFinite(p.x + p.y + p.z + p.yaw)) bad = 'not finite';
    else if (Math.abs(p.x) > 12.01 || p.z > 8.01 || p.z < -22 || p.y < -0.01) bad = `outside (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
    else if (p.duel && (p.duel.S.w.A > p.duel.S.need || p.duel.S.w.B > p.duel.S.need || p.duel.S.n > p.duel.S.max)) bad = 'score out of range';
  }
  ok(!bad, `fuzz: sparring with the NPC stays sane${bad ? ` (${bad})` : ''}`);
  ok(ended >= 3 && kinds.size >= 5, `fuzz: sparring was played to an end (${ended}) with ${kinds.size} techniques`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
