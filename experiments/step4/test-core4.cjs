'use strict';
// Step 4 / A, core rules (no engine, no host): creating an individual from species + level (WP18 4.1/4.2, WP19
// 3.2-3.5/5.2, WP20 5.1), one-time grants (D1 receiving order, stage capacities), and the party heal (WP20 3.2).
// Verification: spec-driven vectors and invariants; no reference (Ruby) run exists for these modules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const C = require('../../js/engine/build/core.cjs');
const { createMember, initialMoves, deriveFromPersonalId, NATURE_ORDER } = E.memberFactory;
const { applyGrant, GrantRefusedError } = E.grants;
const { healParty, healMember } = E.heal;
const S = E.state;

const SRC = path.resolve(__dirname, '../../content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
const clone = x => JSON.parse(JSON.stringify(x));
/** Scripted random(n): returns the queued values in order (each checked against n), then 0. Records the calls. */
function scripted(values) { const calls = []; const f = n => { const v = values.length ? values.shift() : 0; calls.push([n, v]); assert.ok(v >= 0 && v < n, `scripted value ${v} out of range for ${n}`); return v; }; f.calls = calls; return f; }
/** Deterministic pseudo-random random(n) for property loops. */
function lcg(seed) { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; }

test('the core entry exposes the new modules and they load in the bare core bundle', () => {
  for (const k of ['memberFactory', 'grants', 'heal']) assert.equal(typeof C[k], 'object', k);
});

test('personal id derivations (WP19): nature = id mod 25 in the registered order, gender from the low 8 bits, ability from the lowest bit', () => {
  assert.equal(NATURE_ORDER.length, 25); assert.deepEqual([NATURE_ORDER[0], NATURE_ORDER[1], NATURE_ORDER[24]], ['hardy', 'lonely', 'quirky']);
  const pid = 0x12345678; // 305419896 mod 25 = 21 (gentle); low byte 0x78 = 120; lowest bit 0
  assert.deepEqual(deriveFromPersonalId(pid, { gender: 128, abilities: ['Keen Eye', 'Tangled Feet'] }), { nature: 'gentle', gender: 'F', ability: 'Keen Eye' });
  assert.deepEqual(deriveFromPersonalId(pid, { gender: 32, abilities: ['Blaze'] }), { nature: 'gentle', gender: 'M', ability: 'Blaze' }); // 120 >= 32
  assert.deepEqual(deriveFromPersonalId(pid + 1, { gender: 128, abilities: ['Keen Eye', 'Tangled Feet'] }).ability, 'Tangled Feet');
  assert.equal(deriveFromPersonalId(pid + 1, { gender: 32, abilities: ['Blaze'] }).ability, 'Blaze', 'slot 1 empty -> slot 0 (WP19 3.4 step 3)');
  for (const g of ['M', 'F', 'N']) assert.equal(deriveFromPersonalId(pid, { gender: g, abilities: ['X'] }).gender, g, 'single-gender / genderless species are fixed');
  // boundary of the 8-bit compare: low byte == chance -> male, chance - 1 -> female
  assert.equal(deriveFromPersonalId(0x100 + 127, { gender: 128, abilities: ['X'] }).gender, 'F');
  assert.equal(deriveFromPersonalId(0x100 + 128, { gender: 128, abilities: ['X'] }).gender, 'M');
  assert.equal(deriveFromPersonalId(0xffffffff, { gender: 0, abilities: ['X'] }).gender, 'M', 'female chance 0 never gives female');
});

test('initial moves (WP20 5.1 reset_moves): level <= current, in order, de-duplicated keeping the latest, the last four', () => {
  assert.deepEqual(initialMoves(content.species.Charmander, 5, content).map(m => [m.id, m.pp, m.maxpp]), [['scratch', 35, 35], ['growl', 40, 40], ['ember', 25, 25]]);
  assert.deepEqual(initialMoves(content.species.Charmander, 12, content).map(m => m.id), ['growl', 'ember', 'smokescreen', 'dragonbreath']);
  assert.deepEqual(initialMoves(content.species.Charmander, 3, content).map(m => m.id), ['scratch', 'growl']);
  const synthetic = { learnset: { 1: ['Tackle', 'Growl'], 5: ['Tackle'], 7: ['Gust'] } };
  const moves = { Tackle: { id: 'tackle', name: 'Tackle', pp: 35 }, Growl: { id: 'growl', name: 'Growl', pp: 40 }, Gust: { id: 'gust', name: 'Gust', pp: 35 } };
  assert.deepEqual(initialMoves(synthetic, 7, { moves }).map(m => m.id), ['growl', 'tackle', 'gust'], 'a repeated move keeps its latest position');
  assert.throws(() => initialMoves({ learnset: { 1: ['Nope'] } }, 5, { moves }), /no move data for "Nope"/);
});

test('createMember: the documented random draws, then every field from species + level', () => {
  const random = scripted([0x1234, 0x5678, 31, 0, 15, 30, 1, 2]);
  const m = createMember({ id: 'G-starter-1', species: 'Charmander', level: 5 }, content, random);
  assert.deepEqual(random.calls.map(c => c[0]), [65536, 65536, 32, 32, 32, 32, 32, 32], 'personal id (high, low 16 bits), then six IVs');
  assert.deepEqual(m.ivs, { hp: 31, atk: 0, def: 15, spa: 30, spd: 1, spe: 2 });
  assert.deepEqual(m.evs, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.deepEqual([m.nature, m.gender, m.ability], ['gentle', 'M', 'Blaze']);
  const stats = E.growth.computeStats(content.species.Charmander.base, m.ivs, m.evs, 5, 'gentle');
  assert.deepEqual([m.level, m.exp, m.hp], [5, E.growth.minExp('parabolic', 5), stats.hp], 'exp = minimum of the level, HP full');
  assert.deepEqual(m.moves.map(x => x.id), ['scratch', 'growl', 'ember']);
  assert.deepEqual([m.status, m.statusCount, m.item, m.ball, m.ot, m.friendship, m.nickname], ['', 0, '', 'pokeball', 'player', 70, null]);
  // a created member is battle-shaped (Showdown name); stored with its persistent key (D5-3, step 5.0) it is a valid save member
  assert.equal(m.form, undefined);
  assert.deepEqual(E.saveSchema.validateGame({ ...S.newGame({ party: [] }), party: [E.speciesKey.toPersistentMember(m, content)] }), [], 'a created member, stored with its key, is a valid persistent member');
});

test('createMember over many draws: IVs stay in 0..31, every derivation matches its personal id rule', () => {
  const random = lcg(7);
  const seen = { natures: new Set(), genders: new Set() };
  for (let i = 0; i < 400; i++) {
    const m = createMember({ id: `W1-${i}`, species: 'Pidgey', level: 3 }, content, random);
    for (const v of Object.values(m.ivs)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 31);
    seen.natures.add(m.nature); seen.genders.add(m.gender);
    assert.ok(['Keen Eye', 'Tangled Feet'].includes(m.ability));
    assert.deepEqual(m.moves.map(x => x.id), ['tackle'], 'Pidgey L3 knows only Tackle');
  }
  assert.equal(seen.natures.size, 25); assert.deepEqual([...seen.genders].sort(), ['F', 'M']);
});

test('createMember refuses what it cannot build, with the reason (no half-built member)', () => {
  const r = () => 0;
  assert.throws(() => createMember({ id: 'X-1', species: 'Missingno', level: 5 }, content, r), /species "Missingno" is not in the content/);
  assert.throws(() => createMember({ id: 'X-1', species: 'Charmander', level: 0 }, content, r), /level must be an integer from 1 to 100/);
  assert.throws(() => createMember({ id: 'this-id-is-much-too-long', species: 'Charmander', level: 5 }, content, r), /member id/);
  const noData = clone(content); delete noData.species.Charmander.abilities;
  assert.throws(() => createMember({ id: 'X-1', species: 'Charmander', level: 5 }, noData, r), /no creation data.*abilities/);
  const noGender = clone(content); delete noGender.species.Charmander.gender;
  assert.throws(() => createMember({ id: 'X-1', species: 'Charmander', level: 5 }, noGender, r), /no creation data.*gender/);
  assert.throws(() => createMember({ id: 'X-1', species: 'Charmander', level: 5 }, content, () => 70000), /random\(65536\) returned 70000/);
  assert.throws(() => createMember({ id: 'X-1', species: 'Charmander', level: 5 }, content, () => 1.5), /random\(65536\) returned 1.5/);
});

// ---- grants
const fresh = () => S.newGame({ party: [] });
const starter = (state, random = lcg(1), limits) => applyGrant(state, 'starter', content, random, limits);

test('a grant is applied once: members (party first), items, money, and the claim, in one new state', () => {
  const s0 = fresh(); const before = clone(s0);
  const r = starter(s0);
  assert.equal(r.status, 'applied'); assert.deepEqual(s0, before, 'the input state is not mutated');
  assert.deepEqual(r.state.party.map(m => [m.id, m.species, m.form, m.level]), [['G-starter-1', 'charmander', 0, 5]], 'stored by content id + form (D5-3, step 5.0)');
  assert.deepEqual(r.state.bag, { potion: 5, pokeball: 10, antidote: 2 }); assert.deepEqual(r.state.claims, { starter: { kind: 'grant' } });
  assert.deepEqual(r.placed, [{ id: 'G-starter-1', species: 'charmander', form: 0, level: 5, to: 'party' }]);
  assert.deepEqual(E.saveSchema.validateGame(r.state), []);
  const again = starter(r.state);
  assert.equal(again.status, 'already-claimed'); assert.equal(again.state, r.state, 'a repeat returns the same state object: nothing changes');
});

test('grant receiving order and capacity: party, then boxes, refused as a whole when anything does not fit', () => {
  const pidgeys = { ...content, grants: { flock: { id: 'flock', members: [{ species: 'Pidgey', level: 3 }, { species: 'Pidgey', level: 4 }], items: { potion: 2 }, money: 100 } } };
  const full = fresh(); for (let i = 0; i < 6; i++) full.party.push(createMember({ id: `P-${i}`, species: 'Caterpie', level: 2 }, content, lcg(i)));
  const r = applyGrant(full, 'flock', pidgeys, lcg(3), { ...E.limits.DEFAULT_LIMITS, boxes: 2 });
  assert.deepEqual(r.placed.map(p => p.to), ['boxes', 'boxes'], 'a full party sends grant members to the boxes (D1)');
  const halfFull = clone(full); halfFull.boxes.push(clone(full.party[0])); halfFull.boxes[0].id = 'B-0';
  for (const [label, state, limits, reason] of [
    ['not enough box room', halfFull, { ...E.limits.DEFAULT_LIMITS, boxes: 2 }, 'no-room'],
    ['bag above the per-item cap', (() => { const s = fresh(); s.bag.potion = 998; return s; })(), E.limits.DEFAULT_LIMITS, 'bag-full'],
    ['already above the cap (old save)', (() => { const s = fresh(); s.bag.potion = 5000; return s; })(), E.limits.DEFAULT_LIMITS, 'bag-full'],
  ]) {
    const before = clone(state);
    assert.throws(() => applyGrant(state, 'flock', pidgeys, lcg(3), limits), e => e instanceof GrantRefusedError && e.reason === reason, label);
    assert.deepEqual(state, before, label + ': nothing changed, no claim written');
  }
  assert.throws(() => applyGrant(fresh(), 'nope', content, lcg(1)), e => e.reason === 'unknown-grant');
  const taken = fresh(); taken.party.push({ ...createMember({ id: 'G-starter-1', species: 'Pidgey', level: 3 }, content, lcg(1)) });
  assert.throws(() => starter(taken), e => e.reason === 'member-id-taken');
  const old = clone(fresh()); old.schema = 2; delete old.claims;
  assert.throws(() => starter(old), /migrate it first/);
});

test('grant money follows the money cap (WP24: clamped); an existing balance above the cap is kept, never reduced', () => {
  const rich = { ...content, grants: { cash: { id: 'cash', members: [], items: {}, money: 500 } } };
  const s = fresh(); s.money = 999800;
  assert.equal(applyGrant(s, 'cash', rich, lcg(1)).state.money, 999999);
  const over = fresh(); over.money = 2000000;
  assert.equal(applyGrant(over, 'cash', rich, lcg(1)).state.money, 2000000);
});

test('a grant registers every received species as seen and owned (WP26 3.2 gifts), once, only when the grant is applied', () => {
  const r = starter(fresh());
  assert.deepEqual(r.state.dex, { seen: ['charmander'], owned: ['charmander'] }, 'the starter is in the dex (by content id since step 5.0)');
  assert.equal(starter(r.state).state, r.state, 'a repeat changes nothing, the dex included');
  const flock = { ...content, grants: { flock: { id: 'flock', members: [{ species: 'Pidgey', level: 3 }, { species: 'Pidgey', level: 4 }, { species: 'Caterpie', level: 2 }], items: { potion: 1 }, money: 0 } } };
  const sighted = fresh(); sighted.dex.seen = ['pidgey'];
  assert.deepEqual(applyGrant(sighted, 'flock', flock, lcg(2)).state.dex, { seen: ['pidgey', 'caterpie'], owned: ['pidgey', 'caterpie'] }, 'one entry per species; an earlier sighting is kept');
  const full = fresh(); for (let i = 0; i < 6; i++) full.party.push(createMember({ id: `P-${i}`, species: 'Caterpie', level: 2 }, content, lcg(i)));
  const boxed = starter(full);
  assert.deepEqual([boxed.placed[0].to, boxed.state.dex.owned], ['boxes', ['charmander']], 'a member received into the boxes is registered too');
  for (const [label, state, limits, reason] of [
    ['no room', full, { ...E.limits.DEFAULT_LIMITS, boxes: 0 }, 'no-room'],
    ['bag cap', (() => { const s = fresh(); s.bag.potion = 999; return s; })(), E.limits.DEFAULT_LIMITS, 'bag-full'],
  ]) {
    const before = clone(state);
    assert.throws(() => applyGrant(state, 'flock', flock, lcg(2), limits), e => e.reason === reason, label);
    assert.deepEqual(state, before, `${label}: a refused grant registers nothing`);
  }
});

test('legal ids that are also Object.prototype names ("constructor") are ordinary keys: first claim applies, a repeat is a repeat, also after a JSON round trip', () => {
  const ct = { ...content, grants: { constructor: { id: 'constructor', members: [{ species: 'Charmander', level: 5 }], items: { potion: 1 }, money: 0 } } };
  const first = applyGrant(fresh(), 'constructor', ct, lcg(1));
  assert.equal(first.status, 'applied'); assert.ok(Object.hasOwn(first.state.claims, 'constructor')); assert.equal(first.state.party[0].id, 'G-constructor-1');
  assert.deepEqual(E.saveSchema.validateGame(first.state), []);
  const reloaded = JSON.parse(JSON.stringify(first.state)); // a save/load produces ordinary objects again
  assert.equal(applyGrant(reloaded, 'constructor', ct, lcg(1)).status, 'already-claimed');
  assert.throws(() => applyGrant(fresh(), 'toString', content, lcg(1)), e => e.reason === 'unknown-grant', 'an inherited name is not a grant');
  assert.throws(() => createMember({ id: 'X', species: 'constructor', level: 5 }, content, lcg(1)), /species "constructor" is not in the content/);
  const run = { protocol: 1, battleId: 'constructor', outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } };
  const applied = S.applyBattleResult(fresh(), run);
  assert.equal(applied.status, 'applied', 'a battle id equal to an inherited name is applied the first time');
  assert.equal(S.applyBattleResult(JSON.parse(JSON.stringify(applied.state)), run).status, 'already-applied');
});

test('"__proto__" as a battle id or a claim id is an ordinary own entry: applied once, a repeat (also after a JSON round trip) is a repeat, a different result conflicts; nothing is spent twice', () => {
  const run = { protocol: 1, battleId: '__proto__', outcome: { kind: 'run', winner: null }, members: {}, bag: { potion: -1 }, captured: [], dex: { seen: [], owned: [] } };
  const g = fresh(); g.bag.potion = 2;
  const a = S.applyBattleResult(g, run);
  assert.deepEqual([a.status, a.state.bag.potion, g.bag.potion], ['applied', 1, 2], 'one potion spent; the input is not touched');
  assert.ok(Object.hasOwn(a.state.appliedBattles, '__proto__'), 'an own ledger entry');
  assert.equal(Object.getPrototypeOf(a.state.appliedBattles), Object.prototype, 'the ledger keeps its prototype');
  const again = S.applyBattleResult(a.state, run);
  assert.deepEqual([again.status, again.state === a.state], ['already-applied', true]);
  const saved = JSON.stringify(a.state); assert.match(saved, /"__proto__":\{"hash":"[0-9a-f]{64}"\}/, 'serialized with the rest of the ledger');
  const loaded = JSON.parse(saved);
  assert.deepEqual(E.saveSchema.validateGame(loaded), []);
  const afterLoad = S.applyBattleResult(loaded, run);
  assert.deepEqual([afterLoad.status, afterLoad.state.bag.potion], ['already-applied', 1], 'after a save round trip the repeat spends nothing');
  const before = JSON.stringify(loaded);
  assert.throws(() => S.applyBattleResult(loaded, { ...run, bag: { potion: -2 } }), /already applied with a different result/);
  assert.equal(JSON.stringify(loaded), before, 'a conflicting result changes nothing');
  assert.throws(() => S.applyBattleResult(fresh(), { ...run, bag: { potion: -1 } }), /bag would go negative/, 'a refused result...');
  assert.deepEqual(fresh().appliedBattles, {}, '...records nothing');
  // the claims ledger takes the same key (a grant id outside the content rules, reachable through the API)
  const ct = { ...content, grants: JSON.parse('{"__proto__": {"id": "__proto__", "members": [], "items": {"potion": 1}, "money": 0}}') };
  const claimed = applyGrant(fresh(), '__proto__', ct, lcg(1));
  assert.deepEqual([claimed.status, Object.hasOwn(claimed.state.claims, '__proto__'), claimed.state.bag.potion], ['applied', true, 1]);
  assert.deepEqual(E.saveSchema.validateGame(claimed.state), []);
  assert.equal(applyGrant(JSON.parse(JSON.stringify(claimed.state)), '__proto__', ct, lcg(1)).status, 'already-claimed');
});

// ---- heal
test('party heal (WP20 3.2 heal_party): full HP from the stats, status and counter cleared, every move to max PP; boxes untouched; repeat changes nothing', () => {
  const s = starter(fresh()).state;
  const hurt = clone(s); const m = hurt.party[0];
  m.hp = 1; m.status = 'slp'; m.statusCount = 2; m.moves[0].pp = 0; m.moves[2].pp = 3;
  hurt.boxes.push({ ...clone(m), id: 'B-1' });
  const healed = healParty(hurt, content);
  const max = E.growth.computeStats(content.species.Charmander.base, m.ivs, m.evs, m.level, m.nature).hp;
  assert.deepEqual([healed.party[0].hp, healed.party[0].status, healed.party[0].statusCount], [max, '', 0]);
  assert.deepEqual(healed.party[0].moves.map(x => x.pp), healed.party[0].moves.map(x => x.maxpp));
  assert.deepEqual(healed.boxes, hurt.boxes, 'boxes are not part of the party heal');
  assert.deepEqual(S.diffPaths(hurt, healed).sort(), ['party.0.hp', 'party.0.moves.0.pp', 'party.0.moves.2.pp', 'party.0.status', 'party.0.statusCount']);
  assert.deepEqual(healParty(healed, content), healed, 'healing a healed party is a no-op');
  assert.equal(healMember({ ...m, hp: 0 }, content).hp, max, 'a fainted member is healed as well');
  assert.throws(() => healParty({ ...hurt, party: [{ ...m, species: 'Missingno' }] }, content), /species "Missingno"/);
});
