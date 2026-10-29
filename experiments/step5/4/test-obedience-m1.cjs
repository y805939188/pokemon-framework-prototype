'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../../js/engine/build/engine.cjs');

const PLAYER = { id: 0, name: 'player', gender: 2, language: 2 };
const FOREIGN = { id: 1, name: 'other', gender: 0, language: 7 };
const moveset = moves => moves.map(id => ({ id, pp: id === 'tackle' || id === 'scratch' ? 35 : 20, maxpp: id === 'tackle' || id === 'scratch' ? 35 : 20 }));
function context(overrides = {}) {
  return { player: { ...PLAYER }, members: { player: { ...FOREIGN } }, badges: 0, anyHighLevel: false, foreignHighLevel: true, generation: 1, contentIdentity: 'obedience-test', ...overrides };
}
function set(name, species, level, moves, ability = 'Immunity') {
  return { name, species, level, moves, ability, nature: 'hardy', gender: 'M', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } };
}
async function create(seed, options = {}) {
  const level = options.level ?? 60;
  const player = set('player', options.species ?? 'Snorlax', level, options.moves ?? ['Tackle', 'Scratch'], options.ability ?? 'Immunity');
  const foe = set('foe', options.foeSpecies ?? 'Caterpie', options.foeLevel ?? 5, options.foeMoves ?? ['Tackle'], options.foeAbility ?? 'Shield Dust');
  const gw = await E.gateway.BattleGateway.create({ formatid: 'gen8rpgcustomgame', seed: [seed, 22, 33, 44], wild: true,
    players: [{ name: 'Player', team: [player] }, { name: 'Wild', team: [foe] }], obedience: options.control ?? context() });
  await gw.choose('p1', 'team 1'); await gw.choose('p2', 'team 1');
  if (options.status) gw.seedState('p1', [{ id: 'player', hp: gw.readState('p1')[0].maxhp, status: options.status, statusCount: options.statusCount ?? (options.status === 'slp' ? 2 : 0) }]);
  if (options.volatile) gw._debugBattle().getSide('p1').active[0].addVolatile(options.volatile);
  gw.drain();
  return gw;
}
async function turn(gw, choice = 'move 1') {
  await gw.choose('p1', choice); await gw.choose('p2', 'move 1');
  return gw.drain();
}
function snapshot(gw) { return JSON.parse(gw.snapshot()); }
function runtime(gw) { return snapshot(gw).rpg.obedienceRuntime ?? { draws: 0, trace: [] }; }
function trace(gw) { return runtime(gw).trace; }
function pp(gw) { return gw.readState('p1')[0].pp; }
async function findScenario(kind, options = {}, limit = 160) {
  for (let seed = 1; seed <= limit; seed++) {
    const gw = await create(seed, options), beforePp = pp(gw), token = gw.checkpoint(), messages = await turn(gw);
    if (trace(gw).some(entry => entry.kind === kind && (options.applied === undefined || entry.applied === options.applied)) && (!options.where || options.where(gw))) return { gw, token, messages, seed, beforePp };
  }
  assert.fail(`no natural seed produced ${kind}`);
}
async function assertReplay(sample) {
  const before = snapshot(sample.gw), beforePp = pp(sample.gw);
  const restored = await E.gateway.BattleGateway.fromCheckpoint(sample.token);
  await turn(restored);
  assert.deepEqual(snapshot(restored), before, 'independent checkpoint restore has identical serialized engine/RNG/rpg state');
  assert.deepEqual(pp(restored), beforePp);
}

test('A-M1 WP40 eligibility: Owner id+name, independent flags, threshold and zero-draw exclusions', () => {
  const base = { level: 60, owner: FOREIGN, player: PLAYER, badges: 0, anyHighLevel: false, foreignHighLevel: true };
  assert.equal(E.obedience.obedienceLevelLimit(0), 10);
  assert.equal(E.obedience.obedienceLevelLimit(7), 80);
  assert.equal(E.obedience.obedienceLevelLimit(8), Number.MAX_SAFE_INTEGER);
  assert.equal(E.obedience.obedienceEligible(base), true);
  assert.equal(E.obedience.obedienceEligible({ ...base, level: 10 }), false);
  assert.equal(E.obedience.obedienceEligible({ ...base, badges: 8 }), false);
  assert.equal(E.obedience.obedienceEligible({ ...base, owner: { ...PLAYER, gender: 0, language: 99 } }), false, 'gender/language do not make a member foreign');
  assert.equal(E.obedience.obedienceEligible({ ...base, owner: { ...PLAYER, name: 'renamed' } }), true);
  assert.equal(E.obedience.obedienceEligible({ ...base, owner: { ...PLAYER, id: 2 } }), true);
  assert.equal(E.obedience.obedienceEligible({ ...base, anyHighLevel: true, owner: PLAYER }), true);
  assert.equal(E.obedience.obedienceEligible({ ...base, foreignHighLevel: false }), false);
  for (const excluded of [{ nonMove: true }, { continuing: true }, { locked: true }]) assert.equal(E.obedience.obedienceEligible({ ...base, ...excluded }), false);
});

test('A-M1 real engine: level equality and own high-level member consume no obedience RNG', async () => {
  const equal = await create(1, { level: 10 }), equalPp = pp(equal); await turn(equal);
  assert.equal(runtime(equal).draws, 0);
  assert.equal(trace(equal).at(-1).kind, 'ineligible');
  assert.equal(pp(equal).tackle, equalPp.tackle - 1);
  const ownControl = context({ members: { player: { ...PLAYER, gender: 0, language: 99 } } });
  const own = await create(1, { control: ownControl }), ownPp = pp(own); await turn(own);
  assert.equal(runtime(own).draws, 0);
  assert.equal(pp(own).tackle, ownPp.tackle - 1);
});

test('A-M1 real engine: sleep and freeze stop before obedience and preserve PP', async () => {
  for (const status of ['slp', 'frz']) {
    const gw = await create(1, { status }), before = pp(gw); await turn(gw);
    assert.equal(runtime(gw).draws, 0, status);
    assert.equal(trace(gw).length, 0, status);
    assert.equal(pp(gw).tackle, before.tackle, status);
  }
});

test('A-M1 real engine: changed move skips original PP, pays new PP once, recurses safely and replays', async () => {
  const sample = await findScenario('change');
  assert.equal(pp(sample.gw).tackle, sample.beforePp.tackle);
  assert.equal(pp(sample.gw).scratch, sample.beforePp.scratch - 1);
  assert.ok(trace(sample.gw).some(entry => entry.kind === 'recursive'));
  await assertReplay(sample);
});

test('A-M1 real engine: self-sleep uses engine status and replays without extra original PP', async () => {
  const sample = await findScenario('self-sleep', { applied: true });
  assert.equal(gwStatus(sample.gw), 'slp');
  assert.equal(pp(sample.gw).tackle, sample.beforePp.tackle);
  await assertReplay(sample);
});
function gwStatus(gw) { return gw.readState('p1')[0].status; }

test('AM1-ULTRA-06 non-sleep statuses retain natural disobedience self-hit, zero PP and full checkpoint semantics', async () => {
  for (const [status, statusCount] of [['psn', 0], ['brn', 0], ['par', 0], ['psn', 1]]) {
    const gw = await create(3, { ability: 'Thick Fat', status, statusCount, foeSpecies: 'Snorlax', foeLevel: 50, foeMoves: ['Splash'], foeAbility: 'Thick Fat' });
    const beforePp = pp(gw), token = gw.checkpoint(), beforeHp = gw.readState('p1')[0].hp, messages = await turn(gw);
    const hit = trace(gw).find(entry => entry.kind === 'self-hit');
    assert.ok(hit, JSON.stringify({ status, statusCount, trace: trace(gw) }));
    assert.equal(hit.roll, 3); assert.equal(hit.c, 50);
    assert.equal(runtime(gw).draws, 3, 'do not draw a fourth refusal message');
    assert.ok(!trace(gw).some(entry => entry.kind === 'refuse'));
    assert.ok(gw.readState('p1')[0].hp < beforeHp);
    assert.deepEqual(pp(gw), beforePp);
    assert.ok(messages.flatMap(m => m.events ?? []).some(e => e.raw.includes('|rpg|obedience|p1|player|self-hit|')));
    await assertReplay({ gw, token });
  }
});

test('AM1-ULTRA-06 no-status and sleep-immunity neighbors retain sleep then self-hit ordering', async () => {
  const ordinary = await create(3, { ability: 'Thick Fat' });
  await turn(ordinary);
  assert.equal(trace(ordinary).find(e => e.kind === 'self-sleep').applied, true);
  assert.ok(!trace(ordinary).some(e => e.kind === 'self-hit'));
  const immune = await create(3, { ability: 'Insomnia', foeSpecies: 'Snorlax', foeLevel: 50, foeMoves: ['Splash'] });
  const token = immune.checkpoint(), beforePp = pp(immune); await turn(immune);
  assert.equal(trace(immune).find(e => e.kind === 'self-sleep').applied, false);
  assert.ok(trace(immune).some(e => e.kind === 'self-hit'));
  assert.deepEqual(pp(immune), beforePp);
  await assertReplay({ gw: immune, token });
});

test('A-M1 real engine: disobedience self-hit uses engine damage and checkpoint replay', async () => {
  const sample = await findScenario('self-hit');
  assert.ok(sample.gw.readState('p1')[0].hp < sample.gw.readState('p1')[0].maxhp);
  assert.equal(pp(sample.gw).tackle, sample.beforePp.tackle);
  await assertReplay(sample);
});

test('A-M1 real engine: four-way refusal emits an RPG refusal and preserves PP', async () => {
  const sample = await findScenario('refuse');
  assert.equal(pp(sample.gw).tackle, sample.beforePp.tackle);
  assert.ok(sample.messages.flatMap(message => message.events ?? []).some(event => event.raw.includes('|rpg|obedience|p1|player|refuse|')));
});

test('A-M1 real engine: sleep-usable move can be refused without PP or self-sleep', async () => {
  const sample = await findScenario('sleep-usable-refusal', { status: 'slp', moves: ['Snore', 'Tackle'] });
  assert.equal(pp(sample.gw).snore, sample.beforePp.snore);
  assert.equal(gwStatus(sample.gw), 'slp');
});

test('A-M1 real engine: obedience hook is after sleep/freeze and before truant/flinch', async () => {
  for (const options of [{ volatile: 'truant', ability: 'Truant' }, { volatile: 'flinch' }]) {
    const sample = await findScenario('eligible', { ...options, where: gw => trace(gw).some(entry => entry.kind === 'eligible' && entry.a < entry.limit) });
    assert.ok(sample.messages.flatMap(message => message.events ?? []).some(event => options.volatile === 'truant' ? event.raw.includes('Truant') : event.raw.includes('|cant|') && event.raw.includes('flinch')), JSON.stringify({ options, events: sample.messages.flatMap(message => message.events ?? []).map(event => event.raw) }));
    assert.equal(pp(sample.gw).tackle, sample.beforePp.tackle);
  }
});

test('A-M1 real engine: locked continuation consumes no additional obedience RNG', async () => {
  let found;
  for (let seed = 1; seed <= 80 && !found; seed++) {
    const gw = await create(seed, { moves: ['Outrage', 'Tackle'], foeSpecies: 'Snorlax', foeLevel: 50 });
    await turn(gw);
    const eligible = trace(gw).find(entry => entry.kind === 'eligible');
    if (eligible && eligible.a < eligible.limit && !gw.ended) found = { gw, draws: runtime(gw).draws };
  }
  assert.ok(found, 'natural seed with an executed first Outrage');
  await turn(found.gw);
  const last = trace(found.gw).at(-1);
  assert.equal(last.kind, 'ineligible');
  assert.equal(last.lockedMove, 'outrage');
  assert.equal(runtime(found.gw).draws, found.draws);
});

test('A-M1 real engine: special external non-struggle move skips obedience and PP deduction with zero RNG', async () => {
  const gw = await create(1), before = pp(gw), pokemon = gw._debugBattle().getSide('p1').active[0];
  gw._debugBattle().actions.runMove('tackle', pokemon, 1, { externalMove: true });
  assert.equal(runtime(gw).draws, 0);
  assert.equal(trace(gw).at(-1).kind, 'special-skip');
  assert.equal(pp(gw).tackle, before.tackle);
});
