// Logic test for sparring (positions, the finish, the master), the drills, the hip-walk race and the
// photo call: no browser, the gym map only.
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
const { SLOW, rpsResult, handFor } = await import('../src/tech.js');
const { RULES, SPAR, MASTER_WIN, ruleFor, verdict, sparSpot, advance, preview, posCode, posFrom, masterThrow } = await import('../src/spar.js');
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
  // the positions
  const P = { pos: 'stand', top: null };
  const steps = [advance(P, 'A'), `${P.pos}${P.top}`, advance(P, 'A'), `${P.pos}${P.top}`, advance(P, 'A'), `${P.pos}${P.top}`, advance(P, 'A'), `${P.pos}${P.top}`, advance(P, 'A'), `${P.pos}${P.top}`];
  ok(steps.join(' ') === '테이크다운 guardA 가드 패스 sideA 마운트 mountA 백 테이크 backA 마운트 전환 mountA', `positions: a takedown, then up the ladder (${steps.join(' ')})`);
  ok(advance(P, 'B') === '스윕' && P.pos === 'guard' && P.top === 'B', 'positions: a round won from underneath is a sweep, into the other\'s guard');
  ok(preview(P, 'A') === '스윕' && P.top === 'B' && preview(P, 'B') === '가드 패스' && P.pos === 'guard', 'positions: what a win would do can be told without doing it');
  let codes = true;
  for (const pos of ['guard', 'side', 'mount', 'back']) for (const top of ['A', 'B']) { const n = posCode({ pos, top }); const back = posFrom(n); if (!(n >= 1 && n <= 8) || back.pos !== pos || back.top !== top) codes = false; }
  ok(codes && posCode({ pos: 'stand', top: null }) === 0 && posFrom(0).pos === 'stand' && posFrom(9).pos === 'stand' && posFrom(-3).top === null, 'positions: one small number each, and back');
  // where the bodies are
  const D = { ox: 0, oz: 0, yaw: 0 };
  const st = (o) => Object.assign({ pos: 'stand', top: null, end: 0 }, o);
  const a = sparSpot(D, 'A', 'pick', 0, st());
  const b = sparSpot(D, 'B', 'end', 0, st({ end: 2 }));
  ok(a.z < 0 && b.z > 0 && a.anim === 'stance' && b.anim === 'win' && Math.abs(b.yaw - Math.PI) < 1e-9, 'spots: the two stand across from each other; the winner raises the arms');
  const i1 = sparSpot(D, 'A', 'intro', 0.3, st());
  const i2 = sparSpot(D, 'A', 'intro', SPAR.bow + 0.3, st());
  const i3 = sparSpot(D, 'B', 'intro', SPAR.bow + 0.3, st());
  ok(i1.anim === 'bow' && i2.anim === 'greet' && i3.anim === 'greet' && Math.abs(i2.z - i3.z) < Math.abs(a.z) * 2 - 0.2, 'spots: a bow, then the two step in for the slap and bump');
  const gA = sparSpot(D, 'A', 'pick', 0, st({ pos: 'guard', top: 'A' }));
  const gB = sparSpot(D, 'B', 'pick', 0, st({ pos: 'guard', top: 'A' }));
  const hA = sparSpot(D, 'A', 'pick', 0, st({ pos: 'guard', top: 'B' }));
  const hB = sparSpot(D, 'B', 'pick', 0, st({ pos: 'guard', top: 'B' }));
  ok(gA.anim === 'guardTop' && gB.anim === 'guardBottom' && hA.anim === 'guardBottom' && hB.anim === 'guardTop' && Math.abs(gA.z + hB.z) < 1e-9 && Math.abs(gB.z + hA.z) < 1e-9, 'spots: guard, either way round, mirrored');
  const kA = sparSpot(D, 'A', 'pick', 0, st({ pos: 'back', top: 'A' }));
  const kB = sparSpot(D, 'B', 'pick', 0, st({ pos: 'back', top: 'A' }));
  ok(kA.anim === 'backTop' && kB.anim === 'backBottom' && Math.abs(Math.atan2(Math.sin(kA.yaw - kB.yaw), Math.cos(kA.yaw - kB.yaw))) < 1e-9 && kB.z > kA.z, 'spots: on the back, the one in front faces away');
  const sA = sparSpot(D, 'A', 'pick', 0, st({ pos: 'side', top: 'A' }));
  ok(sA.anim === 'sideTop' && Math.abs(sA.x) > 0.3, 'spots: side control kneels beside');
  // hands, and the master
  let hands = true;
  for (const m of 'srp') for (const r of [1, -1, 0]) if (rpsResult(m, handFor(m, r)) !== r) hands = false;
  ok(hands, 'the other hand for a wanted result');
  let fair = true;
  let rounds = 0;
  for (const belt of ['white', 'blue', 'purple', 'brown', 'black']) {
    const N = 30000;
    let won = 0;
    for (let i = 0; i < N; i++) {
      const [max, need] = RULES[belt];
      const T = { w: { A: 0, B: 0 }, n: 0, max, need };
      const fate = Math.random() < MASTER_WIN[belt] ? 'A' : 'B';
      let e = 0;
      for (let k = 0; k < 500 && !(e = verdict(T)); k++) { const r = masterThrow(T, fate, belt); if (r) { T.n++; T.w[r > 0 ? 'A' : 'B']++; } }
      if (e === 1) won++;
      if (e === 3 || e === 0) fair = false;
      if (belt === 'white') rounds += T.w.A;
    }
    const rate = won / N;
    const tol = belt === 'white' ? 0 : 3 * Math.sqrt((MASTER_WIN[belt] * (1 - MASTER_WIN[belt])) / N) + 0.002;
    console.log(`      the player beat the master ${(rate * 100).toFixed(2)}% of the time as a ${belt} belt`);
    if (Math.abs(rate - MASTER_WIN[belt]) > tol) fair = false;
  }
  ok(fair && MASTER_WIN.white === 0 && MASTER_WIN.blue === 0.01 && MASTER_WIN.purple === 0.05 && MASTER_WIN.brown === 0.1 && MASTER_WIN.black === 0.4, 'the master: beaten 0% by a white belt, 1% blue, 5% purple, 10% brown, 40% black, and never a draw');
  ok(rounds > 0, `the master still gives a white belt a round now and then (${(rounds / 30000).toFixed(2)} a series)`);
}

{
  const { withName, withRo } = await import('../src/util.js');
  ok(withName('친구') === '친구와' && withName('민석') === '민석과' && withName('Kim') === 'Kim와(과)' && withName('스파링 파트너') === '스파링 파트너와', 'names take the particle that fits their last syllable');
  ok(withRo('암바') === '암바로' && withRo('앵클락') === '앵클락으로' && withRo('트라이앵글') === '트라이앵글로' && withRo('길로틴') === '길로틴으로', 'and so does 으로');
}

/* ---------- sparring with the NPC partner ---------- */
near();
run(2.2); // the bow on stepping onto the mat
near();
toasts.length = 0;
sounds.length = 0;
sim.npcPick = () => 's';
ok(sim.setTech('tri') && sim.tech === 'tri' && !sim.setTech('nope') && !sim.setTech('constructor'), 'a technique is chosen by name; anything else is refused');
ok(sim.challenge() && sim.p.mode === 'duel' && duel && duel.kind === 'spar' && duel.phase === 'intro', 'sparring with an NPC starts at once, with a bow');
ok(saw('스파링 파트너와 스파링 · 6판 4선승') && sounds.includes('whistle'), 'the start is called with the rule (blue against blue)');
const d = sim.p.duel;
const S = d.S;
run(0.5);
ok(sim.char.anim === 'bow' && npc.anim === 'bow', 'both bow');
run(SPAR.bow + 0.4 - d.t);
ok(sim.char.anim === 'greet' && npc.anim === 'greet' && Math.hypot(sim.p.x - npc.x, sim.p.z - npc.z) < 0.8, 'then step in for the slap and bump');
run(SPAR.bow + TECH.greet - d.t);
ok(sounds.includes('slap') && sounds.includes('bump'), 'which are heard');
until(() => d.phase === 'pick', 3);
ok(duel.phase === 'pick' && duel.spar && duel.spar.me === 0 && duel.spar.n === 1 && duel.spar.rule === '6판 4선승' && duel.tech === 'tri' && duel.spar.pos === '' && duel.spar.win === '테이크다운', 'then hands are thrown; a win would be a takedown');
const settle = () => until(() => (sim.p.mode === 'duel' && d.phase === 'pick' && !d.pick) || d.phase === 'end', FULL + 8);
const win = () => { sim.npcPick = () => 's'; settle(); sim.pick('r'); run(0.05); };
const lose = () => { sim.npcPick = () => 'p'; settle(); sim.pick('r'); run(0.05); };

win();
ok(duel.phase === 'reveal' && duel.result === 1, 'throw 1 is won');
toasts.length = 0;
until(() => d.phase === 'move', 3);
ok(S.w.A === 1 && S.n === 1 && S.pos === 'guard' && S.top === 'A' && !sim.p.bout && saw('현철의 테이크다운! · 1 : 0') && flashes.some((f) => f.text === '테이크다운!'), 'a round won: counted at once, and a takedown, no technique');
run(1);
ok(sim.char.anim === 'guardTop' && npc.anim === 'guardBottom' && Math.abs(npc.char.C.tiltX + Math.PI / 2) < 0.3, `the winner kneels in the other's guard (tilt ${npc.char.C.tiltX.toFixed(2)})`);
ok(sim.netState().du.ps === 1 && sim.netState().anim === 'guardTop' && sim.netState().du.sa === 1 && !sim.netState().bt, 'the position and the score are published');
ok(duel.spar.pos === '가드' && duel.spar.top === 'me', 'the bar says where they are and who is on top');
settle();
ok(d.phase === 'pick' && d.round === 2 && duel.spar.n === 2 && duel.spar.win === '가드 패스' && duel.spar.lose === '스파링 파트너의 스윕', 'the next round: a win passes the guard, a loss is their sweep');
// a drawn throw is thrown again and is not a round
sim.npcPick = () => 'r';
sim.pick('r');
until(() => d.phase === 'pick' && !d.pick, 4);
ok(d.round === 3 && S.n === 1 && S.w.A === 1 && S.w.B === 0 && S.pos === 'guard', 'a drawn throw is thrown again; it is not a round');
win();
until(() => d.phase === 'move', 3);
ok(S.pos === 'side' && S.top === 'A' && S.w.A === 2, 'guard pass: side control');
lose();
until(() => d.phase === 'move', 3);
run(1);
ok(S.pos === 'guard' && S.top === 'B' && S.w.B === 1 && saw('스파링 파트너의 스윕! · 2 : 1') && npc.anim === 'guardTop' && sim.char.anim === 'guardBottom', 'a round lost from on top: they sweep, and now they are on top');
lose();
until(() => d.phase === 'move', 3);
ok(S.pos === 'side' && S.top === 'B' && S.w.B === 2, 'they pass: 2 : 2');
win();
until(() => d.phase === 'move', 3);
ok(S.pos === 'guard' && S.top === 'A' && saw('현철의 스윕! · 3 : 2'), 'a win from underneath sweeps back: 3 : 2');
settle();
sim.setTech('omo');
ok(duel.spar.final && duel.spar.win === '오모플라타로 마무리!' && duel.spar.lose === '스파링 파트너의 스윕', 'one round from the series: the strip says the technique finishes it');
sim.setTech('arm');
toasts.length = 0;
win();
until(() => sim.p.mode === 'bout', 4);
const b1 = sim.p.bout;
ok(b1 && b1.kind === 'arm' && b1.a === sim.p && b1.ground && b1.t >= TECH.down && d.phase === 'sub', 'the round that wins it: the chosen technique, put on from the ground');
ok(saw('이겼습니다! 암바를 겁니다') && S.w.A === 3, 'and is told so; it counts at the tap');
ok(sim.netState().bt && sim.netState().bt.k === 'arm' && sim.netState().bt.r === 'a' && sim.netState().bt.g === 1, 'the finish is published, from the ground');
run(TECH.tap - b1.t + 0.05);
ok(S.w.A === 4 && saw('탭! 현철의 암바 성공 · 4 : 2') && flashes.some((f) => f.text === '탭!'), 'the tap: 4 : 2');
toasts.length = 0;
until(() => d.phase === 'end', FULL + 3);
ok(S.end === 1 && saw('스파링 종료 · 현철 승 · 4 : 2') && flashes.some((f) => f.text === '승리!') && sim.streak === 1 && streakShown === 1, 'the sparring is won 4 : 2');
run(0.3);
ok(sim.char.anim === 'win' && npc.anim === 'loco' && S.pos === 'stand', 'both stand; the winner raises the arms');
ok(duel.spar.end === 'win' && sim.netState().du.e === 1 && sim.netState().du.ps === 0, 'the end is shown and published');
until(() => !sim.p.duel, 6);
ok(sim.p.mode === 'free' && sim.char.anim === 'loco' && sim.char.rate === 20 && npc.char.rate === 20, 'and both are let go');
until(() => !npc.busy && !npc.back, 12);

// a draw: 3 : 3 of 6, and nobody taps
near(); run(1.6);
ok(sim.challenge(), 'again');
{
  const dd = sim.p.duel;
  let bouts = 0;
  const go = (mine) => { sim.npcPick = () => (mine ? 's' : 'p'); until(() => (dd.phase === 'pick' && !dd.pick) || dd.phase === 'end', FULL + 8); sim.pick('r'); run(0.05); };
  toasts.length = 0;
  for (const m of [1, 0, 1, 0, 1, 0]) { go(m); for (let i = 0; i < 200; i++) { sim.step(DT, idle); if (sim.p.bout) bouts++; } }
  until(() => dd.phase === 'end', FULL + 3);
  ok(dd.S.end === 3 && dd.S.w.A === 3 && dd.S.w.B === 3 && saw('스파링 종료 · 무승부 · 3 : 3') && sim.streak === 1 && bouts === 0, 'six rounds, 3 : 3: a draw without a submission, and the run of wins stands');
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
  for (let i = 0; i < 3; i++) { sim.npcPick = () => 'p'; until(() => dd.phase === 'pick' && !dd.pick, FULL + 6); sim.pick('r'); run(0.05); }
  until(() => sim.p.mode === 'bout', 4);
  ok(sim.p.bout.a === npc && sim.p.bout.d === sim.p && sim.p.bout.ground && dd.S.top === 'B' && dd.S.pos === 'side', 'the NPC took the rounds, passed, and finishes from side control');
  until(() => dd.phase === 'end', FULL + 3);
  ok(dd.S.end === 2 && saw('스파링 종료 · 스파링 파트너 승 · 3 : 0') && sim.streak === 0, 'lost 0 : 3; the run of wins is over');
  until(() => !sim.p.duel, 6);
  until(() => !npc.busy && !npc.back, 12);
}
sim.sel.belt = 'blue';
// giving up, off the mat, no partner
near(); run(1.6);
sim.challenge();
until(() => sim.p.duel.phase === 'pick', 4);
sim.npcPick = () => 's';
sim.pick('r');
until(() => sim.p.duel.phase === 'move', 3);
toasts.length = 0;
sim.cancelDuel();
ok(!sim.p.duel && sim.p.mode === 'free' && saw('스파링을 그만두었습니다') && sim.char.anim === 'loco' && sim.char.rate === 20, 'sparring can be given up, even down in a position');
run(1);
ok(Math.abs(sim.char.C.tiltX) < 0.1 && !npc.busy, 'and both get up');
until(() => !npc.busy && !npc.back, 12);
// an unpicked hand is thrown for the player
near(); run(1.6);
sim.challenge();
{
  const dd = sim.p.duel;
  until(() => dd.phase === 'pick', 4);
  sim.npcPick = () => 's';
  ok(until(() => dd.phase !== 'pick', 9.5) && dd.pick && dd.tk === sim.tech, 'a hand not thrown in time is thrown at random, with the chosen technique');
  const info = sim.matchIn(-12, 12, -8, 8);
  ok(info && info.a === '현철' && info.b === '스파링 파트너' && info.need === 4 && info.max === 6, 'a board can read the sparring in its area');
  ok(sim.matchIn(5, 6, 5, 6) === null, 'and none elsewhere');
  until(() => dd.phase === 'pick' && !dd.pick, FULL + 6);
  sim.cancelDuel();
  until(() => !npc.busy && !npc.back, 12);
}

/* ---------- the master ---------- */
{
  const master = w.npcs.find((n) => n.name === '관장님');
  const nearM = () => { tp(master.home.x - 0.9, master.home.z, Math.PI / 2); run(0.3); };
  ok(master && master.o.master && (master.o.look || {}).belt === 'black', 'the master is a black belt NPC who spars');
  // a series against him, the player throwing at random; returns how it ended and the rounds the player took
  const series = () => {
    nearM(); run(1.6); nearM();
    sim._cool = 0;
    if (!sim.challenge()) return null;
    const dd = sim.p.duel;
    for (let i = 0; i < 4000 && sim.p.duel === dd && dd.phase !== 'end'; i++) {
      if (dd.phase === 'pick' && !dd.pick) sim.pick('srp'[(Math.random() * 3) | 0]);
      sim.step(DT, idle);
    }
    const out = { end: dd.S.end, mine: dd.S.w.A, rule: dd.S.text, fate: dd.fate };
    until(() => !sim.p.duel, 8);
    until(() => !master.busy && !master.back, 12);
    return out;
  };
  sim.sel.belt = 'white';
  const ends = [];
  let took = 0;
  for (let i = 0; i < 6; i++) {
    const r = series();
    if (r) { ends.push(r.end); took += r.mine; }
  }
  ok(ends.length === 6 && ends.every((e) => e === 2), `a white belt never beats the master (${ends.join(' ')})`);
  console.log(`      rounds the white belt took off him in 6 series: ${took}`);
  // a black belt wins when the roll falls in the 40%
  sim.sel.belt = 'black';
  let first = true;
  sim.rnd = () => { if (first) { first = false; return 0.39; } return Math.random(); };
  toasts.length = 0;
  const won = series();
  ok(won && won.end === 1 && won.fate === 'A' && won.rule === '10판 6선승', 'a black belt can beat him (the roll under 40%)');
  first = true;
  sim.rnd = () => { if (first) { first = false; return 0.41; } return Math.random(); };
  const lost = series();
  ok(lost && lost.end === 2 && lost.fate === 'B', 'and loses on a roll over it');
  run(2);
  ok(toasts.some((t) => t.startsWith('스파링 종료 · 관장님 승')), 'the master\'s win is told');
  sim.rnd = Math.random;
  sim.sel.belt = 'blue';
  // other partners are not settled beforehand
  near(); run(1.6);
  sim.challenge();
  ok(sim.p.duel && sim.p.duel.fate === null, 'sparring anyone else is a fair throw of hands');
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
run(SPAR.bow + 0.3 - dp.t);
ok(friend.ctl && friend.ctl.anim === 'greet' && friend.ctl.rate === 20, 'their body is placed by the sparring: the slap and bump');
until(() => dp.phase === 'pick', 3);
run(0.05);
ok(friend.ctl && friend.ctl.anim === 'stance', 'then standing across');
sim.setTech('rnc');
const round = (mine, their) => {
  until(() => (sim.p.mode === 'duel' && dp.phase === 'pick' && !dp.pick) || dp.phase === 'end', FULL + 8);
  theirs({ r: dp.round });
  sim.pick(mine);
  run(0.1);
  theirs({ r: dp.round, p: their });
  until(() => sim.p.mode === 'bout' || dp.phase === 'move' || dp.phase === 'end', 4);
};
round('r', 's');
ok(dp.phase === 'move' && dp.S.w.A === 1 && dp.S.pos === 'guard' && dp.S.top === 'A' && !sim.p.bout, 'a throw won against a person: a takedown');
run(0.5);
ok(friend.ctl && friend.ctl.anim === 'guardBottom' && friend.ctl.rate === 9, 'their body is laid in the guard on this screen');
round('r', 'p');
ok(dp.S.w.B === 1 && dp.S.top === 'B' && dp.S.pos === 'guard', 'a throw lost: their sweep');
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
ok(sim.netState().du.q === 'r' && sim.netState().du.qk === 'rnc' && sim.netState().du.r === dp.round && dp.S.w.A === 2 && dp.S.top === 'A', 'and mine goes out the same way (2 : 1, swept back)');
round('r', 's');
ok(dp.S.w.A === 3 && dp.S.pos === 'side', '3 : 1, guard passed');
round('r', 's');
ok(sim.p.bout && sim.p.bout.kind === 'rnc' && sim.p.bout.ground && friend.bout === sim.p.bout && friend.ctl === null, 'the round that wins it against a person: my technique, from the ground');
until(() => dp.phase === 'end', FULL + 3);
ok(dp.S.end === 1 && dp.S.w.A === 4 && friend.bout === null, '4 : 1');
until(() => !sim.p.duel, 6);
run(1.6);
// they stop answering
ok(sim.challenge(), 'asked again');
dp = sim.p.duel;
theirs({});
until(() => dp.phase === 'pick', 4);
friend.du = null;
friend.bt = null;
toasts.length = 0;
run(3.8);
ok(!sim.p.duel && saw('상대가 스파링을 그만두었습니다') && friend.ctl === null, 'if they go quiet the sparring is dropped and their body is let go');
run(2);

// asked by a person: a request to answer
friend = mkPeer('peer-b', sim.p.x - 1.1, sim.p.z);
sim.peers = () => [friend];
const off = { id: 'peer-b-9', k: 'spar', r: 1, p: null, tk: 'arm', q: null, qk: 'arm', c: 1, w: 'peer-a', ox: sim.p.x - 0.55, oz: sim.p.z, yw: Math.PI / 2, sa: 0, sb: 0, ps: 0, e: 0 };
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
for (let i = 1; i <= 4; i++) {
  until(() => dq.phase === 'pick' && !dq.pick, FULL + 6);
  friend.du = Object.assign({}, off3, { r: dq.round, p: 'r', tk: 'guil', sa: i - 1 });
  sim.pick('s');
  until(() => dq.phase === 'move' || sim.p.mode === 'bout', 4);
  if (i === 1) ok(dq.S.top === 'A' && dq.S.pos === 'guard' && sim.char.anim !== 'guardTop', 'they won the throw: their takedown (they are A, on top)');
}
ok(sim.p.bout && sim.p.bout.kind === 'guil' && sim.p.bout.d === sim.p && sim.p.bout.yaw === dq.yaw && sim.p.bout.ground, 'their fourth: their technique on me, facing along the line, from the ground');
until(() => dq.phase === 'end', FULL + 3);
ok(dq.S.end === 1 && saw('스파링 종료 · 친구 승 · 4 : 0') && flashes.some((f) => f.text === '패배'), 'four rounds to them: lost');
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
  other.du = { id: 'peer-c-1', k: 'spar', w: `n${npc.id}`, c: 1, r: 2, p: null, ox: home.x + 0.45, oz: home.z, yw, sa: 1, sb: 0, ps: 0, e: 0 };
  for (let i = 0; i < 90; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.busy && npc.anim === 'stance' && net.held.has(npc), 'a watcher sees the NPC standing across from somebody else');
  ok(sim.partner() === null || sim.partner().npc !== npc, 'and cannot ask it meanwhile');
  other.du = Object.assign({}, other.du, { ps: 1 }); // they took the NPC down: they are on top in its guard
  for (let i = 0; i < 90; i++) { net.tick(DT); sim.step(DT, idle); }
  const want = sparSpot({ ox: other.du.ox, oz: other.du.oz, yaw: yw }, 'B', 'pick', 0, { pos: 'guard', top: 'A', end: 0 });
  ok(npc.anim === 'guardBottom' && Math.hypot(npc.x - want.x, npc.z - want.z) < 0.05 && npc.char.rate === 9, 'the NPC is laid on its back where their position says');
  other.du = Object.assign({}, other.du, { ps: 4 }); // it swept them and passed: on top in side control
  for (let i = 0; i < 90; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.anim === 'sideTop', 'and on top when it has turned it round');
  const brd = sim.matchIn(-12, 12, -8, 8);
  ok(brd && brd.a === '친구' && brd.b === '스파링 파트너' && brd.sa === 1 && brd.need === 4 && brd.pos === '사이드', 'a board reads their sparring, with the position');
  other.bt = { id: 'peer-c-1-s5', w: `n${npc.id}`, k: 'arm', r: 'd', ox: other.du.ox, oz: other.du.oz, yw: yw + Math.PI, s: 1, g: 1 };
  net.tick(DT); sim.step(DT, idle);
  ok(other.bout && other.bout.ground && other.bout.t >= TECH.down && other.bout.a === npc && sim.bouts.includes(other.bout), 'their last round is shown, from the ground');
  for (let i = 0; i < FULL / DT + 30 && sim.bouts.length; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(sim.bouts.length === 0 && npc.busy && net.held.has(npc), 'after it the NPC is still held by the sparring');
  other.du = Object.assign({}, other.du, { e: 2, ps: 0 });
  other.bt = null;
  other.bout = null;
  for (let i = 0; i < 30; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(npc.anim === 'win', 'the NPC that won raises the arms');
  other.du = null;
  for (let i = 0; i < 10; i++) { net.tick(DT); sim.step(DT, idle); }
  ok(!npc.busy && !net.held.has(npc) && npc.char.rate === 20, 'when the sparring is gone the NPC is let go');
  until(() => !npc.back, 12);
  // the watcher's own sparring with it is not disturbed by a stale notice
  other.du = { id: 'peer-c-2', k: 'spar', w: `n${npc.id}`, c: 1, r: 1, p: null, ox: home.x + 0.45, oz: home.z, yw, sa: 0, sb: 0, ps: 0, e: 0 };
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

/* ---------- the hip-walk race ---------- */
const R = w.race;
ok(R.lanes && R.lanes.length === 3 && R.lanes.every((z) => z > R.z0 && z < R.z1) && Math.abs(Math.sin(R.yaw) - Math.sign(R.x1 - R.x0)) < 1e-9, 'three lanes; the racers face the finish');
tp(R.x0 + 0.9, (R.z0 + R.z1) / 2); run(0.3);
ok(prompt && String(prompt.label) === '엉덩이걷기 경주 시작 · 6 m', 'the lane offers a hip-walk race at its start', prompt && prompt.label);
toasts.length = 0;
flashes.length = 0;
sounds.length = 0;
sim.usePrompt();
ok(sim.p.mode === 'race' && sim.p.race.phase === 'count' && Math.abs(sim.p.x - R.x0) < 1e-6 && R.lanes.includes(sim.p.z) && sim.char.anim === 'scootf', 'the racer sits down on the start line, in a lane');
ok(saw('엉덩이걷기 경주! 출발 신호에 큰 버튼을 연타하세요'), 'and is told what to do');
ok(!sim.stroke() && sim.p.race.n === 0, 'no step before the signal');
ok(sim.netState().race && sim.netState().race.f === 0 && sim.netState().anim === 'scootf', 'the race is published');
run(0.1);
ok(prompt === null, 'no other prompt during a race');
run(3.0);
ok(sim.p.race.phase === 'go' && flashes.map((f) => f.text).join(' ') === '3 2 1 출발!' && sounds.filter((s) => s === 'tick').length === 3 && sounds.includes('whistle'), 'three, two, one, go');
ok(raceHud && raceHud.phase === 'go' && raceHud.prog === 0, 'the HUD follows');
// one press for every step, in rhythm
let presses = 0;
const lead = sim.p.race.t; // how long after the signal the first press comes
const z0 = sim.p.z;
for (let i = 0; i < 3000 && sim.p.race && sim.p.race.phase === 'go'; i++) {
  if (i % 24 === 0) { sim.stroke(); presses++; }
  sim.step(DT, idle);
}
const steady = sim.p.race.time;
const len = Math.abs(R.x1 - R.x0);
const need = Math.ceil(len / RACE.step - 1e-9);
const frac = (len - (need - 1) * RACE.step) / RACE.step; // of the last step
const expect = lead + (need - 1) * 0.4 + RACE.stroke * (RACE.a + frac * (RACE.b - RACE.a));
ok(sim.p.race.phase === 'done' && sim.p.x <= R.x1 && presses === need && Math.abs(steady - expect) < 0.05 && Math.abs(sim.p.z - z0) < 1e-6, `${need} steps in rhythm cross the line, straight down the lane (${steady.toFixed(2)} s, ${lead.toFixed(2)} s of it before the first press)`);
ok(saw('완주!') && saw(`엉덩이걷기 ${need}걸음`) && saw('내 최고 3.21초') && flashes.some((f) => f.text === `${steady.toFixed(2)}초`), 'the time is told, with the best so far');
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
for (let i = 0; i < 3000 && sim.p.race && sim.p.race.phase === 'go'; i++) {
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
run(1);
// joining somebody else's race from the start area: a lane of one's own
friend = mkPeer('peer-b', R.x0, R.lanes[1]);
friend.race = { id: 'peer-b-r1', f: 0 };
sim.peers = () => [friend];
tp(R.x0 + 1.2, R.lanes[1] + 0.1); run(0.2);
toasts.length = 0;
sim.seeRace(friend);
ok(sim.p.mode === 'race' && sim.p.race.id === 'peer-b-r1' && saw('함께합니다'), 'someone starting a race takes along whoever stands at the start');
ok(R.lanes.includes(sim.p.z) && Math.abs(sim.p.z - friend.z) > 0.5, `in the lane next to theirs, not on top of them (${sim.p.z.toFixed(2)} beside ${friend.z.toFixed(2)})`);
run(0.2, { mx: 1, my: 0, run: false, camYaw: 0 });
sim.seeRace(friend);
ok(sim.p.mode === 'free', 'having left it, the same race is not joined again');
// three already in it: the one left over still gets the last free lane
const f2 = mkPeer('peer-d', R.x0 - 0.5, R.lanes[0]);
f2.race = { id: 'peer-b-r5', f: 0 };
friend.race = { id: 'peer-b-r5', f: 0 };
sim.peers = () => [friend, f2];
tp(R.x0 + 0.8, R.lanes[0]); run(0.2);
sim.seeRace(friend);
ok(sim.p.mode === 'race' && Math.abs(sim.p.z - R.lanes[2]) < 1e-6, 'with two lanes taken, the third');
run(0.2, { mx: 1, my: 0, run: false, camYaw: 0 });
run(1);
friend.race = { id: 'peer-b-r2', f: 0 };
sim.peers = () => [friend];
tp(2, 3); run(0.2);
sim.seeRace(friend);
ok(sim.p.mode === 'free', 'nor a race by someone when standing elsewhere');
friend.race = { id: 'peer-b-r2', f: 512 };
friend.x = sim.p.x + 3; friend.z = sim.p.z;
toasts.length = 0;
sim.seeRace(friend); sim.seeRace(friend);
ok(toasts.filter((t) => t.includes('친구 님 엉덩이걷기 5.12초')).length === 1, 'another person\'s time is told once');

// racing together: someone who finished long before still came first
friend = mkPeer('peer-b', R.x0, R.lanes[0]);
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
  ok(ended >= 3 && kinds.size >= 2, `fuzz: sparring was played to an end (${ended}) with ${kinds.size} techniques`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
