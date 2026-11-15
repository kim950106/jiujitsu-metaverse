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
const { Character, TECH, GREET } = await import('../src/character.js');
const { rpsResult, SLOW, MARGIN } = await import('../src/tech.js');
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
sim.npcMash = () => 0; // NPCs do not struggle unless a check below makes them
// A technique shown to its end takes this long on the wall clock: its own length plus the stretch of the slow-motion tap.
const FULL = TECH.end + SLOW.span / SLOW.k - SLOW.span;
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
ok(zone === '입구', `spawn zone is the entrance (got "${zone}")`);
walkTo(6.3, 3.0);
ok(walkTo(7.5, 5.2) && zone === '컨디셔닝 룸', `the conditioning room is the corner by the entrance (got "${zone}")`);
ok(walkTo(3.4, 2.5), 'walk up the entrance walkway');
tp(-2, 6.2); run(0.3);
ok(zone === '안내 데스크' && !sim.p.onMat, `the desk is across the room, off the mat (got "${zone}")`);
tp(3.4, 2.5); run(0.3);
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

// techniques: only inside sparring; the winner of a throw puts on the one they chose
const partnerNpc = w.npcs.find((n) => n.name === '스파링 파트너');
const home = { x: partnerNpc.home.x, z: partnerNpc.home.z };
const near = () => { tp(home.x + 0.9, home.z, -Math.PI / 2); run(0.3); };
// start sparring with the NPC and throw the first hand; leaves the technique of that round running
const begin = (kind, npcHand) => {
  sim.npcPick = () => npcHand;
  sim.setTech(kind);
  if (!sim.challenge()) return false;
  for (let i = 0; i < 300 && sim.p.duel.phase !== 'pick'; i++) sim.step(DT, idle);
  sim.pick('r');
  for (let i = 0; i < 300 && !sim.p.bout; i++) sim.step(DT, idle);
  return !!sim.p.bout;
};
// let the technique finish, then give the sparring up
const quit = () => {
  for (let i = 0; i < 1200 && sim.p.mode === 'bout'; i++) sim.step(DT, idle);
  sim.cancelDuel();
  run(0.2);
};
near();
ok(partner && partner.name === '스파링 파트너', `partner in reach (got ${partner && partner.name})`);
ok(rpsResult('r', 's') === 1 && rpsResult('s', 'r') === -1 && rpsResult('p', 'p') === 0 && rpsResult('p', 'r') === 1 && rpsResult('s', 'p') === 1, 'rock-paper-scissors table');
ok(begin('arm', 's') && sim.p.mode === 'bout' && sim.p.bout.a === sim.p && sim.p.bout.kind === 'arm', 'sparring: the throw is won and the winner puts on the armbar');
// slap and bump first: the two right hands meet twice
const handGap = () => {
  const v1 = new THREEm.Vector3();
  const v2 = new THREEm.Vector3();
  sim.char.root.updateMatrixWorld(true);
  partnerNpc.char.root.updateMatrixWorld(true);
  sim.char.reachAR.end.getWorldPosition(v1);
  partnerNpc.char.reachAR.end.getWorldPosition(v2);
  return v1.distanceTo(v2);
};
ok(sim.p.bout.t < 0.22, `the check starts inside the wind-up (t=${sim.p.bout.t.toFixed(2)})`);
sim.char.blinkT = 99; // a blink would hide the smile checked below
sim.char.blink = 0;
run(0.22 - sim.p.bout.t);
const apartGap = handGap();
run(GREET.slap + 0.07 - sim.p.bout.t);
const slapGap = handGap();
run(0.56 - sim.p.bout.t);
const backGap = handGap();
run(GREET.bump + 0.07 - sim.p.bout.t);
const bumpGap = handGap();
ok(slapGap < 0.12 && bumpGap < 0.12 && apartGap > 0.6 && backGap > 0.25, `slap and bump: the right hands meet twice (${apartGap.toFixed(2)} → ${slapGap.toFixed(2)} → ${backGap.toFixed(2)} → ${bumpGap.toFixed(2)} m)`);
ok(sim.char.faceNow === 'grin', 'and both smile for it');
run(TECH.down + 0.2 - sim.p.bout.t);
ok(Math.abs(partnerNpc.char.C.tiltX + Math.PI / 2) < 0.2, `defender is on the back after the takedown (tilt ${partnerNpc.char.C.tiltX.toFixed(2)})`);
const wall0 = sim.t;
run(TECH.tap + 0.3 - sim.p.bout.t);
ok(saw('탭!') && Math.abs(sim.char.C.tiltX + Math.PI / 2) < 0.2, 'armbar: attacker lies back, defender taps');
ok(sim.p.bout.t < TECH.tap + 0.2 && sim.p.bout.t > TECH.tap, `the tap plays in slow motion (${(sim.p.bout.t - TECH.tap).toFixed(2)} s of it in ${(sim.t - wall0 - (TECH.tap - TECH.down - 0.2)).toFixed(2)} s)`);
ok(sim.p.duel.S.w.A === 1 && sim.streak === 0, 'the round is counted; a run of wins counts whole sparring sessions, not rounds');
run(TECH.end);
ok(sim.p.mode === 'duel' && !sim.p.bout && sim.bouts.length === 0 && sim.p.onMat, `the technique ends and the next round begins (mode ${sim.p.mode})`);
quit();
ok(sim.p.mode === 'free' && duel === null, 'sparring can be given up between rounds');
run(6);
ok(!partnerNpc.busy && Math.hypot(partnerNpc.x - home.x, partnerNpc.z - home.z) < 0.1, 'partner walks back to its spot');

// refusals
tp(home.x + 6, home.z + 2.5); run(0.3);
toasts.length = 0;
ok(!sim.challenge() && saw('가까이에 상대가 없습니다'), 'no partner in reach');
tp(4, 1); run(0.2); sim.doAction('roll');
ok(saw('매트 위에서'), 'roll refused off the mat');
ok(!sim.challenge() && saw('스파링은 매트 위에서'), 'sparring refused off the mat');

// every other technique goes the same way and ends in its own hold
const sameWay = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
for (const kind of ['ankle', 'guil', 'omo', 'rnc', 'tri', 'kim']) {
  near();
  toasts.length = 0;
  ok(begin(kind, 's'), `${kind}: sparring reaches the technique`);
  const b = sim.p.bout;
  ok(sim.p.mode === 'bout' && b && b.kind === kind && b.a === sim.p, `${kind}: winner attacks`);
  run(TECH.move + 0.7 - b.t);
  const A = sim.char.C;
  const D = partnerNpc.char.C;
  if (kind === 'guil') {
    ok(Math.abs(A.tiltX) < 0.4 && A.drop > -0.15 && D.spine > 0.85 && Math.abs(D.tiltX) < 0.2, `guil: attacker stands, defender is bent over (spine ${D.spine.toFixed(2)})`);
    ok(Math.hypot(sim.p.x - partnerNpc.x, sim.p.z - partnerNpc.z) < 0.7, 'guil: the two are locked together');
  } else if (kind === 'omo') {
    ok(Math.abs(D.tiltX - Math.PI / 2) < 0.2 && D.drop < -0.25, `omo: defender is face down (tilt ${D.tiltX.toFixed(2)})`);
    ok(A.drop < -0.25 && Math.abs(A.tiltX) < 0.3 && A.lLs > 1.3, `omo: attacker sits beside with a leg over (leg reach ${A.lLs.toFixed(2)})`);
    ok(sameWay(sim.p.yaw, partnerNpc.yaw) < 0.4, 'omo: both face the same way');
  } else if (kind === 'tri') {
    ok(A.tiltX < -1.9 && A.drop > -0.12 && A.lLs > 1.5 && A.lRs > 1.5, `tri: attacker is on the back with the hips up and the legs thrown high (tilt ${A.tiltX.toFixed(2)}, reach ${A.lLs.toFixed(2)})`);
    ok(D.drop < -0.18 && Math.abs(D.tiltX) < 0.2 && D.spine > 0.8, `tri: defender is on the knees, folded forward (spine ${D.spine.toFixed(2)})`);
    ok(Math.hypot(sim.p.x - partnerNpc.x, sim.p.z - partnerNpc.z) < 0.6 && sameWay(sim.p.yaw, partnerNpc.yaw + Math.PI) < 0.2, 'tri: they face each other, locked together');
  } else if (kind === 'kim') {
    ok(Math.abs(D.tiltX + Math.PI / 2) < 0.2 && D.drop < -0.25 && D.aLs > 1.3, `kim: defender is on the back with the far arm bent out (reach ${D.aLs.toFixed(2)})`);
    ok(A.drop < -0.18 && Math.abs(A.tiltX) < 0.2 && A.spine > 0.6, 'kim: attacker kneels and leans over');
    ok(Math.abs(sameWay(sim.p.yaw, partnerNpc.yaw) - Math.PI / 2) < 0.2, 'kim: attacker is across the defender');
  } else if (kind === 'rnc') {
    ok(A.drop < -0.25 && D.drop < -0.25, 'rnc: both are seated');
    ok(sameWay(sim.p.yaw, partnerNpc.yaw) < 0.2, 'rnc: the defender is turned round, back to the attacker');
    const ux = Math.sin(sim.p.yaw);
    const uz = Math.cos(sim.p.yaw);
    ok((partnerNpc.x - sim.p.x) * ux + (partnerNpc.z - sim.p.z) * uz > 0.1 && A.aLs > 1.6, `rnc: attacker is behind, arm round the neck (arm reach ${A.aLs.toFixed(2)})`);
  } else ok(A.drop < -0.25 && Math.abs(D.tiltX + Math.PI / 2) < 0.2, 'ankle: attacker sits at the feet, defender is on the back');
  run(TECH.tap + 0.3 - b.t);
  ok(saw('탭!') && partnerNpc.char.faceNow === 'ouch', `${kind}: the defender taps`);
  quit();
  ok(sim.p.mode === 'free' && sim.bouts.length === 0 && sim.p.onMat, `${kind}: both let go`);
  run(1.5);
  ok(['aLs', 'aRs', 'lLs', 'lRs'].every((k) => Math.abs(sim.char.C[k] - 1) < 0.01 && Math.abs(partnerNpc.char.C[k] - 1) < 0.01), `${kind}: limbs are back to their own length`);
  ok(Math.abs(sim.char.C.tiltX) < 0.05 && Math.abs(partnerNpc.char.C.tiltX) < 0.05 && Math.abs(partnerNpc.char.C.headY) < 0.02, `${kind}: both stand upright again`);
  run(6);
  ok(!partnerNpc.busy && Math.hypot(partnerNpc.x - home.x, partnerNpc.z - home.z) < 0.1 && sameWay(partnerNpc.yaw, partnerNpc.home.yaw) < 0.2, `${kind}: partner is back on its spot`);
}
// losing a throw: the NPC's technique goes on
near();
ok(begin('rnc', 'p') && sim.p.bout.d === sim.p && sim.p.bout.a === partnerNpc, 'a lost throw: the player is the one held');
run(TECH.tap + 0.2 - sim.p.bout.t);
ok(sim.char.faceNow === 'ouch', 'and winces at the tap');
quit(); run(6);
ok(sim.p.mode === 'free', 'free again afterwards');
ok(!sim.setTech('kimura') && !sim.setTech('constructor') && !sim.setTech('toString'), 'unknown technique names are refused');

// the two newer solo drills
tp(-6, -4); run(2.5);
const b0 = { x: sim.p.x, z: sim.p.z };
sim.doAction('bridge');
ok(sim.p.mode === 'action' && sim.netState().anim === 'bridge', 'bridge starts on the mat');
run(0.62);
ok(sim.char.C.drop > -0.1 && sim.char.C.tiltX < -1.9, `bridge: the hips come up (hip height ${(0.445 + sim.char.C.drop).toFixed(2)} m)`);
run(0.62);
ok(sim.char.C.drop < -0.24, 'and down again');
run(3);
ok(sim.p.mode === 'free' && Math.hypot(sim.p.x - b0.x, sim.p.z - b0.z) < 0.01, 'three bridges, on the spot');
sim.p.yaw = 0; run(0.5);
sim.doAction('standup');
run(0.9);
ok(sim.char.C.drop < -0.28 && sim.netState().anim === 'standup', `technical stand-up: seated first (hip height ${(0.445 + sim.char.C.drop).toFixed(2)} m)`);
run(1.6);
ok(sim.p.mode === 'free' && sim.p.z < b0.z - 0.3 && Math.abs(sim.p.x - b0.x) < 0.01, `then up, having moved back ${(b0.z - sim.p.z).toFixed(2)} m`);
run(1);
ok(Math.abs(sim.char.C.drop) < 0.03 && Math.abs(sim.char.C.aLs - 1) < 0.01, 'standing again');
tp(4, 1); run(0.2); toasts.length = 0;
sim.doAction('bridge'); sim.doAction('standup');
ok(sim.p.mode === 'free' && saw('매트 위에서'), 'both are refused off the mat');
sim.doAction('fly');
ok(sim.p.mode === 'free', 'an unknown action does nothing');

// the yard behind the folding doors
toasts.length = 0;
tp(-5, -6); run(0.3);
ok(walkTo(-5, -12.5), 'walk out through the open folding doors');
ok(zone === '6층 테라스 잔디마당' && !sim.p.onMat && sim.p.y < 0.03, `on the terrace lawn (zone "${zone}", y=${sim.p.y.toFixed(3)})`);
ok(saw('6층 테라스'), 'a toast greets the first step outside');
ok(!sim.challenge() && saw('스파링은 매트 위에서'), 'no sparring on the grass');
const stopped = (from, to, test, msg) => {
  tp(from[0], from[1]); run(0.2);
  const got = walkTo(to[0], to[1], 8);
  ok(!got && test(sim.p), `${msg} (stopped at ${sim.p.x.toFixed(2)}, ${sim.p.z.toFixed(2)})`);
};
stopped([-10.6, -6.5], [-10.6, -11], (p) => p.z > -8.05, 'the shut leaves on the west side do not let through');
stopped([-9.0, -6.5], [-9.0, -11], (p) => p.z > -8.05, 'nor does the folded stack');
stopped([0.8, -6.5], [0.8, -11], (p) => p.z > -8.05, 'nor the shut leaves on the east side');
stopped([-5, -15], [-26, -15], (p) => p.x > -17.2, 'the railing closes the terrace to the west');
stopped([-5, -15], [16, -15], (p) => p.x < 7.2, 'and to the east');
stopped([-5, -15], [-5, -32], (p) => p.z > -23.2, 'and at the far end: nobody walks off the sixth floor');
stopped([-12, -20], [-12, -32], (p) => p.z > -23.2, 'there too, from the open-air mat');
ok(w.colliders.every((c) => c.bottom >= 0), 'nothing to stand on lies below the terrace');
// the open-air mat on the turf
tp(-10.5, -17); run(2.5);
ok(zone === '야외 매트' && sim.p.onMat && Math.abs(sim.p.y - 0.04) < 0.005, `on the open-air mat (zone "${zone}")`);
const outNpc = w.npcs.find((n) => n.name === '야외 매트의 관원');
tp(outNpc.x + 0.9, outNpc.z, -Math.PI / 2); run(0.4);
ok(partner && partner.name === '야외 매트의 관원' && begin('tri', 's'), 'sparring can be started out there');
run(TECH.tap + 0.3 - sim.p.bout.t);
ok(saw('탭! 나의 트라이앵글'), 'and a round runs to the tap under the night sky');
quit();
run(6);
stopped([-15, -10], [-15, -3], (p) => p.z < -8.3, 'the corner beside the building is walled off');
stopped([5, -10], [5, -3], (p) => p.z < -8.3, 'the building wall east of the doors is solid from outside');
tp(-5, -12); run(0.2);
ok(walkTo(-5, -4) && sim.p.onMat, 'and back in onto the mat');
run(3);

// another person as the partner (what the network layer feeds in); the rest is in spar.mjs
const mkPeer = (id, x, z) => ({ id, name: '친구', x, y: 0.04, z, yaw: 0, char: new Character({ medal: true }), busy: false, gone: false, du: null, bt: null, rj: '', seat: '', bout: null, ctl: null, ctlAnim: '', st: { belt: 'white' } });
const friend = mkPeer('peer-b', -7.5, -2.0);
sim.peers = () => [friend];
sim.myPeer = 'peer-a';
tp(-6.6, -2.0); run(0.3);
ok(partner && partner.name === '친구', 'another person counts as a partner');
sim.challenge();
ok(duel && duel.phase === 'wait', 'asking a person waits for them');
const st = sim.netState();
ok(st.du && st.du.c === 1 && st.du.w === 'peer-b' && st.du.k === 'spar' && st.anim === 'stance', 'the request is published');
friend.du = { id: sim.p.duel.id, k: 'spar', r: 1, p: null, tk: 'arm', c: 0 };
run(2);
ok(duel.phase === 'pick' && duel.rule === '5판 3선승', 'their yes starts it, by the lower belt\'s rule');
sim.pick('s'); run(0.2);
ok(duel.phase === 'pick' && duel.pick === 's', 'waits for their hand');
friend.du = Object.assign({}, friend.du, { p: 'p' });
run(0.2);
ok(duel.phase === 'reveal' && duel.result === 1, 'scissors beats paper');
run(1.8);
ok(sim.p.mode === 'bout' && friend.bout === sim.p.bout && sim.netState().bt.r === 'a' && sim.netState().bt.w === 'peer-b', 'the technique against a person is published');
friend.gone = true; sim.p.bout.cancel = true; run(0.2);
ok(sim.p.mode === 'free' && !sim.p.duel, 'it all ends if the other person leaves');
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
  if (i % 400 === 0) sim.doAction(['bow', 'sit', 'shrimp', 'roll', 'rollb', 'scoot'][(i / 400) % 6 | 0]);
  if (i % 170 === 0) sim.challenge();
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
{
  const begin2 = () => { sim.npcPick = () => 's'; sim.setTech('ankle'); if (!sim.challenge()) return false; run(1.7); sim.pick('r'); run(1.6); return !!sim.p.bout; };
  ok(begin2(), 'the warm-up partner spars');
  run(TECH.tap + 0.3 - sim.p.bout.t);
  ok(saw('탭!'), 'ankle lock in the warm-up area');
  run(FULL); sim.cancelDuel(); run(2);
  ok(sim.p.mode === 'free', 'and free again');
}
ok(walkTo(-16.4, 0), 'walk to west gate');
ok(walkTo(-13.6, 0), 'through the gate');
ok(zone === '경기 구역', `inside competition floor (got "${zone}")`);
ok(walkTo(-4, -4, 12), 'walk onto MAT 1');
ok(zone.startsWith('MAT 1') && sim.p.onMat, `empty mat is open (zone "${zone}")`);
ok(sim.api.boutIn(-8, 0, -8, 0) === null, 'no bout on the empty mat');
tp(4, 4); run(0.3);
ok(zone.startsWith('MAT 4') && sim.p.onMat, `four mats joined in one block (zone "${zone}")`);
tp(0, 0); run(0.3);
ok(sim.p.onMat || sim.p.y > 0.03, 'the lanes between them are part of the block');
tp(-4, -4); run(0.3);
// coach seat as white belt
walkTo(-9.2, -4.5, 12);
walkTo(-9.2, -7.2, 6);
ok(saw('블랙벨트 지도자 1명만') && sim.p.mode !== 'seated', 'white belt refused at coach seat');
// as black belt
sim.sel.belt = 'black'; sim.applySel();
walkTo(-9.2, -4.5, 4);
walkTo(-9.2, -7.2, 6);
ok(sim.p.mode === 'seated' && sim.netState().seat === 'coach1' && sim.netState().anim === 'chair', `black belt sits as coach (mode ${sim.p.mode})`);
run(0.8);
run(1.0, { mx: 1, my: 0, run: false, camYaw: 0 });
ok(sim.p.mode === 'free' && saw('일어났습니다'), 'a fresh push stands up');
// a seat someone else holds
sim.peers = () => [{ id: 'peer-c', name: '다른 지도자', x: 9.2, y: 0, z: -7.2, yaw: 0, char: null, busy: true, gone: false, seat: 'coach2' }];
tp(9.2, -4.5); run(0.3);
walkTo(9.2, -7.2, 6);
ok(saw('이미 지도자가') && sim.p.mode !== 'seated', 'occupied coach seat refuses a second coach');
sim.peers = () => [];
// podium
tp(28.5, 0); run(0.2);
ok(zone === '시상대', `podium zone (got "${zone}")`);
ok(walkTo(31.2, 0, 6, false), 'step onto first place');
ok(Math.abs(sim.p.y - 0.62) < 0.02 && saw('1위 자리') && sim.netState().medal === 1, `on first place (y=${sim.p.y.toFixed(2)})`);
walkTo(31.2, -1.72, 6, false);
ok(Math.abs(sim.p.y - 0.42) < 0.02 && sim.netState().medal === 2, `second place gives silver (y=${sim.p.y.toFixed(2)}, medal ${sim.netState().medal})`);
walkTo(28.5, -1.72, 6, false);
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
