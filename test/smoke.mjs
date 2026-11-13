// Logic smoke test: builds both maps without a browser and drives the player through the key flows.
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
const { Character, TECH } = await import('../src/character.js');
const { rpsResult } = await import('../src/tech.js');
const { buildGym } = await import('../src/gym.js');
const { buildArena } = await import('../src/arena.js');

const toasts = [];
let zone = '';
let prompt = null;
let duel = null;
let partner = null;
const sim = new Sim({
  toast: (m) => toasts.push(m), zone: (l) => { zone = l; }, prompt: (p) => { prompt = p; }, sfx: () => {}, camera: () => {},
  openBelt: () => toasts.push('[belt modal]'), open: (w) => toasts.push(`[open ${w}]`), duel: (d) => { duel = d; }, partner: (t) => { partner = t; }, mat: () => {},
});
const DT = 1 / 60;
const idle = { mx: 0, my: 0, run: false, camYaw: 0 };
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const run = (sec, inp = idle) => { for (let i = 0; i < sec / DT; i++) sim.step(DT, inp); };
const walkTo = (x, z, maxT = 30, runFlag = true) => {
  for (let i = 0; i < maxT / DT; i++) {
    const dx = x - sim.p.x, dz = z - sim.p.z, d = Math.hypot(dx, dz);
    if (d < 0.12) return true;
    sim.step(DT, { mx: dx / d, my: -dz / d, run: runFlag, camYaw: 0 });
  }
  return false;
};
const tp = (x, z, yaw = 0) => { sim.p.x = x; sim.p.z = z; sim.p.yaw = yaw; sim.p.y = 0; };
const saw = (txt) => toasts.some((t) => t.includes(txt));

/* ---------- gym ---------- */
let w = buildGym(sim.api);
w.freeze();
sim.setWorld(w);
console.log(`gym: ${w.colliders.length} colliders, ${w.zones.length} zones, ${w.npcs.length} npcs, ${w.scene.children.length} scene objects after merging`);
run(2);
ok(zone === '안내 데스크', `spawn zone is front desk (got "${zone}")`);
ok(walkTo(0.5, 3), 'walk to conditioning floor');
ok(walkTo(-4, -1), 'walk onto mat');
ok(sim.p.onMat && zone === '매트', `on mat (zone "${zone}", y=${sim.p.y.toFixed(3)})`);
ok(saw('인사'), 'auto bow toast on mat entry');
run(2);
const z0 = sim.p.z, x0 = sim.p.x;
sim.doAction('roll'); run(1.5);
ok(Math.hypot(sim.p.x - x0, sim.p.z - z0) > 1.2 && sim.p.mode === 'free', `forward roll moved ${Math.hypot(sim.p.x - x0, sim.p.z - z0).toFixed(2)} m`);
const x1 = sim.p.x, z1 = sim.p.z;
sim.doAction('shrimp'); run(4.2);
ok(Math.hypot(sim.p.x - x1, sim.p.z - z1) > 0.9 && sim.p.mode === 'free', `shrimp x3 moved ${Math.hypot(sim.p.x - x1, sim.p.z - z1).toFixed(2)} m`);
sim.doAction('sit'); run(1); ok(sim.p.mode === 'sit', 'seiza');
ok(walkTo(-10.6, -0.95), 'walk to belt board');
ok(prompt && (typeof prompt.label === 'string') && prompt.label.includes('띠'), 'belt board prompt');
sim.usePrompt(); ok(saw('[belt modal]'), 'belt modal opens');
ok(walkTo(-5, -5.9), 'walk to timer');
ok(prompt && typeof prompt.label === 'function' && prompt.label().includes('타이머'), 'timer prompt');
sim.usePrompt(); run(1.2);

// the master answers questions
tp(-0.6, -5.4); run(0.3);
ok(prompt && prompt.label === '관장님께 물어보기', `master prompt (got ${prompt && prompt.label})`);
sim.usePrompt(); ok(saw('[open master]'), 'asking the master opens the question list');

// techniques: rock-paper-scissors first, the winner applies it
const partnerNpc = w.npcs.find((n) => n.name === '스파링 파트너');
const home = { x: partnerNpc.home.x, z: partnerNpc.home.z };
const near = () => { tp(home.x + 0.9, home.z, -Math.PI / 2); run(0.3); };
near();
ok(partner && partner.name === '스파링 파트너', `partner in reach (got ${partner && partner.name})`);
ok(rpsResult('r', 's') === 1 && rpsResult('s', 'r') === -1 && rpsResult('p', 'p') === 0 && rpsResult('p', 'r') === 1 && rpsResult('s', 'p') === 1, 'rock-paper-scissors table');
sim.npcPick = () => 's';
ok(sim.challenge('arm') && sim.p.mode === 'duel' && duel && duel.phase === 'pick', 'armbar challenge opens the duel');
run(0.5); sim.pick('r'); run(0.2);
ok(duel && duel.phase === 'reveal' && duel.result === 1, `rock beats scissors (phase ${duel && duel.phase}, result ${duel && duel.result})`);
run(1.8);
ok(sim.p.mode === 'bout' && sim.p.bout && sim.p.bout.a === sim.p && duel === null, 'winner becomes the attacker');
run(TECH.down + 0.2 - sim.p.bout.t);
ok(Math.abs(partnerNpc.char.C.tiltX + Math.PI / 2) < 0.2, `defender is on the back after the takedown (tilt ${partnerNpc.char.C.tiltX.toFixed(2)})`);
run(TECH.tap + 0.3 - sim.p.bout.t);
ok(saw('탭!') && Math.abs(sim.char.C.tiltX + Math.PI / 2) < 0.2, 'armbar: attacker lies back, defender taps');
const mid = { x: sim.p.x, z: sim.p.z };
run(TECH.end);
ok(sim.p.mode === 'free' && !sim.p.bout && sim.bouts.length === 0 && sim.results.length === 1, `bout ends and is recorded (mode ${sim.p.mode})`);
ok(Number.isFinite(mid.x + mid.z) && sim.p.onMat, 'attacker stays on the mat');
run(6);
ok(!partnerNpc.busy && Math.hypot(partnerNpc.x - home.x, partnerNpc.z - home.z) < 0.1, 'partner walks back to its spot');

// losing: the NPC applies the technique
near();
sim.npcPick = () => 'p';
sim.challenge('ankle'); run(0.3); sim.pick('r'); run(2.0);
ok(sim.p.mode === 'bout' && sim.p.bout.d === sim.p && sim.p.bout.kind === 'ankle', 'loser becomes the defender');
run(TECH.tap + 0.2);
ok(Math.abs(sim.char.C.tiltX + Math.PI / 2) < 0.2 && sim.char.faceNow === 'ouch', `player is held and winces (face ${sim.char.faceNow})`);
run(TECH.end);
ok(sim.p.mode === 'free', 'free again after being submitted');
run(6);

// a draw replays the round
near();
const seq = ['r', 's'];
sim.npcPick = () => seq.shift();
sim.challenge('ankle'); run(0.3); sim.pick('r'); run(0.2);
ok(duel && duel.result === 0, 'same hand is a draw');
run(1.8);
ok(duel && duel.phase === 'pick' && duel.round === 2 && !duel.pick, 'second round starts');
sim.pick('r'); run(2.0);
ok(sim.p.mode === 'bout' && sim.p.bout.a === sim.p, 'second round decides it');
run(TECH.end + 0.5); run(6);

// no hand chosen in time: one is chosen at random and the duel still resolves
near();
sim.npcPick = () => 'r';
sim.challenge('arm'); run(40);
ok(sim.p.mode === 'free' && !sim.p.duel && !sim.p.bout, 'duel resolves by itself when nobody chooses');
run(6);

// backing out
near();
sim.challenge('arm'); run(0.4); sim.cancelDuel(); run(0.2);
ok(sim.p.mode === 'free' && !partnerNpc.busy && duel === null, 'duel can be cancelled');
run(3);

// refusals
tp(home.x + 6, home.z + 2.5); run(0.3);
toasts.length = 0;
ok(!sim.challenge('arm') && saw('가까이에 상대가 없습니다'), 'no partner in reach');
tp(0, 4); run(0.2); sim.doAction('roll');
ok(saw('매트 위에서'), 'roll refused off the mat');
ok(!sim.challenge('arm') && saw('기술은 매트 위에서'), 'technique refused off the mat');

// another person as the partner (what the network layer feeds in)
const mkPeer = (id, x, z) => ({ id, name: '친구', x, y: 0.04, z, yaw: 0, char: new Character({ medal: true }), busy: false, gone: false, du: null, bt: null, seat: '', bout: null });
let friend = mkPeer('peer-b', -7.5, -2.0);
sim.peers = () => [friend];
sim.myPeer = 'peer-a';
tp(-6.6, -2.0); run(0.3);
ok(partner && partner.name === '친구', 'another person counts as a partner');
sim.challenge('arm');
ok(duel && duel.phase === 'wait', 'challenging a person waits for them');
const st = sim.netState();
ok(st.du && st.du.c === 1 && st.du.w === 'peer-b' && st.du.k === 'arm' && st.anim === 'stance', 'the challenge is published');
friend.du = { id: sim.p.duel.id, r: 1, p: null };
run(0.2);
ok(duel.phase === 'pick', 'their answer starts the round');
sim.pick('s'); run(0.2);
ok(duel.phase === 'pick' && duel.pick === 's', 'waits for their hand');
friend.du = { id: sim.p.duel.id, r: 1, p: 'p' };
run(0.2);
ok(duel.phase === 'reveal' && duel.result === 1, 'scissors beats paper');
run(1.8);
ok(sim.p.mode === 'bout' && friend.bout === sim.p.bout && sim.netState().bt.r === 'a' && sim.netState().bt.w === 'peer-b', 'bout against a person is published');
run(TECH.end + 0.3);
ok(sim.p.mode === 'free' && friend.bout === null, 'both are released');
run(2);
// being challenged
friend = mkPeer('peer-b', sim.p.x - 1.1, sim.p.z);
const du = { id: 'peer-b-7', k: 'ankle', r: 1, p: null, c: 1, w: 'peer-a', ox: sim.p.x - 0.55, oz: sim.p.z, yw: Math.PI / 2 };
friend.du = du;
ok(sim.acceptDuel(friend, du) && sim.p.mode === 'duel' && duel && !duel.mine, 'a challenge from someone else is accepted');
ok(!sim.acceptDuel(friend, du), 'the same challenge is not accepted twice');
sim.pick('s'); friend.du = Object.assign({}, du, { p: 'r' });
run(2.2);
ok(sim.p.mode === 'bout' && sim.p.bout.d === sim.p && sim.p.bout.a === friend, 'they won, so they attack');
friend.gone = true; sim.p.bout.cancel = true; run(0.2);
ok(sim.p.mode === 'free', 'bout ends if the other person leaves');
sim.peers = () => [];
run(2);

// stairs to loft
tp(2.7, -7.2);
ok(walkTo(9.5, -7.2, 12, false), 'climb stairs');
ok(Math.abs(sim.p.y - 2.8) < 0.02 && zone === '2층 관람 라운지', `on loft (y=${sim.p.y.toFixed(2)}, zone "${zone}")`);
walkTo(9.5, -1.0, 4, false);
ok(sim.p.z < -2.9 && sim.p.y > 2.7, `loft railing holds (z=${sim.p.z.toFixed(2)})`);
// walls
tp(3.5, 6.5); walkTo(3.5, 20, 4);
ok(sim.p.z < 8, `south wall holds (z=${sim.p.z.toFixed(2)})`);
// fuzz
let bad = false;
sim.npcPick = () => 'srp'[(Math.random() * 3) | 0];
for (let i = 0; i < 9000; i++) {
  const a = Math.sin(i * 0.013) * 6.28;
  sim.step(DT, { mx: Math.cos(a), my: Math.sin(a * 1.7), run: i % 300 < 150, camYaw: i * 0.002 });
  if (i % 400 === 0) sim.doAction(['bow', 'sit', 'shrimp', 'roll'][(i / 400) % 4 | 0]);
  if (i % 170 === 0) sim.challenge(i % 340 ? 'arm' : 'ankle');
  if (i % 53 === 0) sim.pick('srp'[i % 3]);
  const p = sim.p;
  if (!Number.isFinite(p.x + p.y + p.z + p.yaw) || Math.abs(p.x) > 12.01 || Math.abs(p.z) > 8.01 || p.y < -0.01) { bad = true; console.log('  bad state', p.x, p.y, p.z); break; }
}
ok(!bad, 'gym fuzz: player stays finite and inside the room');
w.dispose();

/* ---------- arena ---------- */
toasts.length = 0;
sim.sel.belt = 'white'; sim.applySel();
w = buildArena(sim.api);
w.freeze();
sim.setWorld(w);
console.log(`arena: ${w.colliders.length} colliders, ${w.zones.length} zones, ${w.npcs.length} npcs, ${w.scene.children.length} scene objects after merging`);
run(2);
ok(zone === '대회장 플로어', `spawn zone (got "${zone}")`);
ok(walkTo(-30, 5), 'walk into warm-up area');
ok(zone === '몸 푸는 곳' && sim.p.onMat, `warm-up zone (got "${zone}")`);
sim.doAction('shrimp'); run(4.2); ok(sim.p.mode === 'free', 'shrimp in warm-up');
const wp = w.npcs.find((n) => n.name === '몸풀기 파트너');
tp(wp.x + 0.9, wp.z); run(0.3);
sim.npcPick = () => 's';
ok(sim.challenge('ankle'), 'warm-up partner can be challenged');
sim.pick('r'); run(2.2 + TECH.end + 0.3);
ok(sim.p.mode === 'free' && saw('탭!'), 'ankle lock in the warm-up area');
ok(walkTo(-16.4, 0), 'walk to west gate');
ok(walkTo(-13.6, 0), 'through the gate');
ok(zone === '경기 구역', `inside competition floor (got "${zone}")`);
ok(walkTo(-6.6, 0.8, 12), 'walk onto MAT 1');
ok(zone.startsWith('MAT 1') && sim.p.onMat, `empty mat is open (zone "${zone}")`);
ok(sim.api.boutIn(-11.6, -1.6, -4.2, 5.8) === null, 'no bout on the empty mat');
// coach seat as white belt
walkTo(-0.9, -5.1, 12);
walkTo(-3.3, -5.1, 6);
ok(saw('블랙벨트 지도자 1명만') && sim.p.mode !== 'seated', 'white belt refused at coach seat');
// as black belt
sim.sel.belt = 'black'; sim.applySel();
walkTo(-0.9, -5.1, 4);
walkTo(-3.3, -5.1, 6);
ok(sim.p.mode === 'seated' && sim.netState().seat === 'coach1' && sim.netState().anim === 'chair', `black belt sits as coach (mode ${sim.p.mode})`);
run(0.8);
run(1.0, { mx: 1, my: 0, run: false, camYaw: 0 });
ok(sim.p.mode === 'free' && saw('일어났습니다'), 'a fresh push stands up');
// a seat someone else holds
sim.peers = () => [{ id: 'peer-c', name: '다른 지도자', x: 9.9, y: 0, z: -5.1, yaw: 0, char: null, busy: true, gone: false, seat: 'coach2' }];
walkTo(0.9, -5.1, 8);
walkTo(8.6, -7.4, 12);
walkTo(9.9, -5.4, 6);
ok(saw('이미 지도자가') && sim.p.mode !== 'seated', 'occupied coach seat refuses a second coach');
sim.peers = () => [];
// podium
tp(28.5, 0); run(0.2);
ok(zone === '시상대', `podium zone (got "${zone}")`);
ok(walkTo(31.2, 0, 6, false), 'step onto first place');
ok(Math.abs(sim.p.y - 0.6) < 0.02 && saw('1위 자리') && sim.netState().medal === 1, `on first place (y=${sim.p.y.toFixed(2)})`);
walkTo(31.2, -1.42, 6, false);
ok(Math.abs(sim.p.y - 0.42) < 0.02 && sim.netState().medal === 2, `second place gives silver (y=${sim.p.y.toFixed(2)}, medal ${sim.netState().medal})`);
walkTo(28.5, -1.42, 6, false);
ok(sim.p.y < 0.05 && sim.netState().medal === 0, 'step down again');
// fuzz + timing
bad = false;
const t0 = performance.now();
for (let i = 0; i < 6000; i++) {
  const a = Math.sin(i * 0.011) * 6.28;
  sim.step(DT, { mx: Math.cos(a), my: Math.sin(a * 1.3), run: i % 500 < 350, camYaw: i * 0.003 });
  const p = sim.p;
  if (!Number.isFinite(p.x + p.y + p.z) || Math.abs(p.x) > 35.01 || Math.abs(p.z) > 19.51 || p.y < -0.01) { bad = true; console.log('  bad state', p.x, p.y, p.z); break; }
}
const ms = (performance.now() - t0) / 6000;
ok(!bad, 'arena fuzz: player stays finite and inside the hall');
console.log(`arena logic cost: ${ms.toFixed(3)} ms per frame`);
for (const n of w.npcs) if (!Number.isFinite(n.x + n.z + n.yaw)) { ok(false, 'npc has NaN'); break; }
w.dispose();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
