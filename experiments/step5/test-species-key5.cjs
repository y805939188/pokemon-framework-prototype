'use strict';
const I6 = require("./2/test-support.cjs");
// Step 5.0 / D5-3: the persistent species key is the content id + form number; the battle layer and protocol v1 keep
// the Showdown names. Covers the mapping (WP03 §3.2 "(species, form)", r8 FR-000394), content form records and their
// errors (FR-000396), the battle view, result write-back through the mapping, and schema 4 (validation, 3 -> 4 migration:
// needs the content, refuses unmappable names as a whole, keeps the replay ledger working).
// Verification: spec-driven vectors and invariants (no reference run exists for these rules).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const H = require('./1/legacy-test-support.cjs');
const K = E.speciesKey;
const S = E.state;
const { migrateGame, validateGame } = E.saveSchema;
const clone = x => JSON.parse(JSON.stringify(x));

const SRC = path.resolve(__dirname, '../../content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const inputs = () => ({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') });
const dex = E.dex.createDexLookup();
const assemble = i => { const c = E.contentCompile.compileContent(i); assert.equal(c.ok, true, JSON.stringify(c.errors)); return E.contentRuntime.assembleContent(c.data, dex); };
const sample = assemble(inputs()).content;
/** The sample plus a second form of an existing species (Vulpix 0 and its Alolan form 1). */
function withForms() {
  const i = inputs();
  const base = { growth: 'medium', baseExp: 60, evYield: { spe: 1 }, catchRate: 190, learnset: [{ level: 1, move: 'tackle' }], source: 'author-placeholder' };
  i.species.push({ id: 'vulpix', showdownId: 'vulpix', nameKey: 'species.vulpix', ...base });
  i.species.push({ id: 'vulpix', form: 1, showdownId: 'vulpixalola', nameKey: 'species.vulpix_alola', ...base });
  return i;
}
const formed = assemble(withForms()).content;

test('FR-000394: content id + form <-> Showdown name, both ways, from the assembled content', () => {
  assert.deepEqual(K.keyOfBattleName(sample, 'Charmander'), { species: 'charmander', form: 0 });
  assert.equal(K.battleNameOf(sample, { species: 'charmander', form: 0 }), 'Charmander');
  assert.deepEqual(K.keyOfBattleName(formed, 'Vulpix-Alola'), { species: 'vulpix', form: 1 });
  assert.equal(K.battleNameOf(formed, { species: 'vulpix', form: 1 }), 'Vulpix-Alola');
  assert.deepEqual(K.battleNamesOfSpecies(formed, 'vulpix'), ['Vulpix', 'Vulpix-Alola']);
  assert.equal(formed.speciesIds.vulpix, 'Vulpix', 'speciesIds keeps the base form');
  assert.equal(K.keyOfBattleName(sample, 'Mew'), null, 'a species the content does not have has no key');
  assert.equal(K.battleNameOf(sample, { species: 'toString', form: 0 }), null, 'inherited names are not content ids');
});

test('WP03 §3.2: a form the content does not define falls back to the base form; an unknown id is null', () => {
  assert.equal(K.battleNameOf(formed, { species: 'vulpix', form: 7 }), 'Vulpix');
  assert.equal(K.battleNameOf(sample, { species: 'charmander', form: 3 }), 'Charmander');
  assert.equal(K.speciesDataOf(formed, { species: 'vulpix', form: 7 }), formed.species.Vulpix);
  assert.equal(K.battleNameOf(sample, { species: 'nope', form: 0 }), null);
});

test('fixture content (no key tables): its content ids are the Showdown names, form 0', () => {
  const fx = E.fixtures.content;
  assert.equal(fx.speciesKeys, undefined);
  assert.deepEqual(K.keyOfBattleName(fx, 'Charizard'), { species: 'Charizard', form: 0 });
  assert.equal(K.battleNameOf(fx, { species: 'Charizard', form: 0 }), 'Charizard');
  assert.equal(K.keyOfBattleName(fx, 'Mew'), null);
});

test('members convert both ways; the battle view gives sessions Showdown names and every form of each recorded species', () => {
  const battle = E.memberFactory.createMember({ id: 'W1-1', species: 'Vulpix-Alola', level: 5 }, formed, () => 0);
  assert.equal(battle.form, 1);
  const saved = K.toPersistentMember(battle, formed);
  assert.deepEqual([saved.species, saved.form], ['vulpix', 1]);
  const projected = clone(battle); delete projected.form; delete projected.statNature;
  assert.deepEqual(K.toBattleMember(saved, formed), projected, 'a round trip gives the battle record back');
  assert.throws(() => K.toPersistentMember({ ...battle, species: 'Mew' }, formed), /has no persistent species key/);
  assert.throws(() => K.toBattleMember({ ...saved, species: 'mew' }, formed), /species "mew" \(form 1\) is not in the content/);
  const g = S.newGame({ party: [] }); g.party = [saved]; H.setBoxed(g, [{ ...saved, id: 'B-1', form: 0 }]); g.dex = { seen: ['vulpix', 'charmander'], owned: ['vulpix'] };
  const before = clone(g);
  const v = K.battleView(g, formed);
  assert.deepEqual(g, before, 'the stored state is not touched');
  assert.deepEqual([v.party[0].species, E.storage.boxedMembers(v)[0].species, 'form' in v.party[0]], ['Vulpix-Alola', 'Vulpix', false]);
  assert.deepEqual(v.dex, { seen: ['Vulpix', 'Vulpix-Alola', 'Charmander'], owned: ['Vulpix', 'Vulpix-Alola'] });
});

test('FR-000396: form records compile with located errors (duplicate form, missing base form, bad number); overlays address a form', () => {
  const bad = (mutate, pathRe, msgRe) => {
    const i = withForms(); mutate(i);
    const r = E.contentCompile.compileContent(i);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.file === 'species.json' && pathRe.test(e.path) && msgRe.test(e.message)), JSON.stringify(r.errors));
  };
  const at = i => i.species.length - 1;
  bad(i => { i.species.push({ ...i.species[at(i)], nameKey: 'species.vulpix_other' }); }, /^\[\d+\]\.id$/, /duplicate form 1 of species "vulpix"/);
  bad(i => { i.species.splice(at(i) - 1, 1); }, /^\[\d+\]\.form$/, /no base form 0 record/);
  bad(i => { i.species[at(i)].form = 1000; }, /^\[\d+\]\.form$/, /0 to 999/);
  bad(i => { i.species[at(i)].form = -1; }, /^\[\d+\]\.form$/, /0 to 999/);
  const i = withForms(); i.overlays = [{ target: 'species/vulpix/1', set: { catchRate: 50 }, reason: 'test: the Alolan form only' }];
  const c = E.contentCompile.compileContent(i); assert.equal(c.ok, true, JSON.stringify(c.errors));
  assert.deepEqual(c.data.species.filter(s => s.id === 'vulpix').map(s => [s.form ?? 0, s.catchRate]), [[0, 190], [1, 50]]);
  const nowhere = withForms(); nowhere.overlays = [{ target: 'species/vulpix/2', set: { catchRate: 50 }, reason: 'x' }];
  assert.match(E.contentCompile.compileContent(nowhere).errors[0].message, /"species\/<id>\/<form>" for a form/);
});

test('a result is written back through the content mapping: captured member and dex by content id + form; an unmapped name refuses it all', () => {
  const g = S.newGame({ party: [], content: formed });
  const caught = E.memberFactory.createMember({ id: 'W1-1', species: 'Vulpix-Alola', level: 5 }, formed, () => 0);
  const result = { protocol: 1, battleId: 'cap#1', outcome: { kind: 'caught', winner: null, target: 'W1-1', ball: 'pokeball' }, members: {}, bag: {}, captured: [caught], dex: { seen: ['Vulpix-Alola'], owned: ['Vulpix-Alola'] } };
  const reception = { templates: { [caught.id]: K.toPersistentMember(caught, formed) }, profile: { mode: 1, naming: 1 } };
  const r = S.applyBattleResult(g, result, undefined, K.speciesKeyResolver(formed), reception);
  assert.deepEqual([r.state.party[0].species, r.state.party[0].form, r.state.dex], ['vulpix', 1, { ...g.dex, seen: ['vulpix'], owned: ['vulpix'] }]);
  assert.deepEqual(validateGame(r.state), []);
  assert.equal(r.state.appliedBattles['cap#1'].hash, S.resultHash(result), 'the ledger hashes the result as received (battle names)');
  const before = clone(g);
  assert.throws(() => S.applyBattleResult(g, { ...result, battleId: 'cap#2', dex: { seen: ['Mew'], owned: [] } }, undefined, K.speciesKeyResolver(formed), reception), /dex seen: "Mew" has no persistent species key/);
  assert.throws(() => S.applyBattleResult(g, { ...result, battleId: 'cap#3', captured: [{ ...caught, species: 'Mew' }] }, undefined, K.speciesKeyResolver(formed), reception), /captured member W1-1: "Mew"/);
  assert.deepEqual(g, before, 'a refused result changes nothing');
});

test('schema 4 validation: form per member, statistics record (74 fields) and step counter; dex lists content ids', () => {
  const g = S.newGame({ party: [] });
  assert.deepEqual(validateGame(g), []);
  const m = K.toPersistentMember(E.memberFactory.createMember({ id: 'A-1', species: 'Charmander', level: 5 }, sample, () => 0), sample);
  const with_ = f => { const x = clone(g); x.party = [clone(m)]; f(x); return validateGame(x); };
  const has = (problems, pathRe, msgRe) => assert.ok(problems.some(p => pathRe.test(p.path) && msgRe.test(p.message)), JSON.stringify(problems));
  assert.deepEqual(with_(() => {}), []);
  has(with_(x => { delete x.party[0].form; }), /\.form$/, /0 to 999/);
  has(with_(x => { x.party[0].form = 1.5; }), /\.form$/, /0 to 999/);
  has(with_(x => { delete x.stats; }), /^\$\.stats$/, /74 fields/);
  has(with_(x => { x.stats.wild_battles_won = -1; }), /wild_battles_won$/, /integer >= 0/);
  has(with_(x => { x.stats.extra = 1; }), /stats\.extra$/, /unknown statistic/);
  has(with_(x => { x.stats.gym_leader_attempts = [1, -1]; }), /gym_leader_attempts$/, /integers >= 0/);
  has(with_(x => { x.stats.times_to_get_badges = ['x']; }), /times_to_get_badges$/, /seconds/);
  has(with_(x => { x.steps = 2 ** 31; }), /^\$\.steps$/, /2147483647/);
  assert.deepEqual(with_(x => { x.stats.play_time = 12.5; x.stats.times_to_get_badges = [null, 30.25]; }), [], 'seconds may be fractional; an unearned badge is null');
});

// ---- migration 3 -> 4
const v3 = () => {
  const m = E.memberFactory.createMember({ id: 'G-starter-1', species: 'Charmander', level: 5 }, sample, () => 0);
  const box = E.memberFactory.createMember({ id: 'W2-1', species: 'Pidgey', level: 3 }, sample, () => 1);
  const g = H.legacyGame(S.newGame({ party: [] }), 3);
  g.party = [H.legacyMember(m, 3)]; g.boxes = [H.legacyMember(box, 3)]; g.dex = { seen: ['Charmander', 'Pidgey'], owned: ['Charmander', 'Pidgey'] }; g.claims = { starter: { kind: 'grant' } };
  g.appliedBattles = { 'wild#2': { hash: 'a'.repeat(64) } }; I6.setBag(g, { potion: 5000 }); g.money = 2500;
  return g;
};

test('3 -> 4 needs the content: without the mapping it refuses (needs-content) and the input is untouched', () => {
  const raw = v3(), before = clone(raw);
  const r = migrateGame(raw);
  assert.deepEqual([r.ok, r.error.code, r.error.found], [false, 'needs-content', 3]);
  assert.match(r.error.message, /needs the game content.*Nothing was changed/);
  assert.deepEqual(raw, before);
});

test('3 -> 4 maps every member and the dex to content id + form, adds statistics and steps, keeps everything else', () => {
  const raw = v3(), before = clone(raw);
  const r = migrateGame(raw, { speciesKey: K.speciesKeyResolver(sample), content: sample });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual([r.from, r.to, r.migrated], [3, 7, true]);
  assert.deepEqual(raw, before, 'the input document is never mutated');
  assert.deepEqual([r.state.party[0].species, r.state.party[0].form, E.storage.boxedMembers(r.state)[0].species, E.storage.boxedMembers(r.state)[0].form], ['charmander', 0, 'pidgey', 0]);
  assert.deepEqual(sample.regionalDex.regions, [], 'this historical fixture has only a national layout');
  assert.deepEqual(r.state.dex, { seen: ['charmander', 'pidgey'], owned: ['charmander', 'pidgey'], hasDex: true, seenForms: {}, lastSeenForm: {}, capturedCounts: {}, defeatedCounts: {}, unlocked: [true], view: { region: -1, indices: [0], mode: 0 }, layoutIdentity: sample.regionalDex.layoutIdentity });
  assert.deepEqual([r.state.stats, r.state.steps], [E.stats.newStats(), 0]);
  const legacy = H.legacyGame(r.state, 4);
  legacy.dex = { seen: r.state.dex.seen, owned: r.state.dex.owned }; // project only the historical fields, after asserting every new schema 7 field above
  const changed = S.diffPaths(raw, legacy).sort();
  assert.deepEqual(changed, ['boxes.0.form', 'boxes.0.species', 'dex.owned.0', 'dex.owned.1', 'dex.seen.0', 'dex.seen.1', 'party.0.form', 'party.0.species', 'schema', 'stats', 'steps'], 'claims, ledger, bag (5000 above the cap), money untouched');
  assert.match(r.notes.join('|'), /schema 4: 2 member\(s\) and the dex moved/);
  assert.deepEqual(validateGame(r.state), []);
  const missingContent = migrateGame(r.state); assert.deepEqual([missingContent.ok, missingContent.error.code], [false, 'needs-content'], 'a current schema 7 document still needs its verified layout');
  const again = migrateGame(r.state, { content: sample }); assert.deepEqual([again.ok, again.migrated], [true, false], 'the current document validates against its content without migrating again');
});

test('3 -> 4 with forms: a Showdown form name maps to the content id and its form; the dex keeps one entry per species', () => {
  const raw = v3();
  raw.party.push({ ...clone(raw.party[0]), id: 'A-2', species: 'Vulpix-Alola' }, { ...clone(raw.party[0]), id: 'A-3', species: 'Vulpix' });
  raw.dex.seen.push('Vulpix-Alola', 'Vulpix');
  const r = migrateGame(raw, { speciesKey: K.speciesKeyResolver(formed), content: formed });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.state.party.map(m => [m.species, m.form]), [['charmander', 0], ['vulpix', 1], ['vulpix', 0]]);
  assert.deepEqual(r.state.dex.seen, ['charmander', 'pidgey', 'vulpix']);
});

test('3 -> 4 refuses as a whole when the content cannot map a name: every place is listed, nothing is changed', () => {
  const raw = v3(); raw.boxes[0].species = 'Mew'; raw.dex.owned.push('Missingno');
  const before = clone(raw);
  const r = migrateGame(raw, { speciesKey: K.speciesKeyResolver(sample), content: sample });
  assert.deepEqual([r.ok, r.error.code], [false, 'unmapped-species']);
  assert.deepEqual(r.error.problems.map(p => p.path), ['$.boxes[0].species', '$.dex.owned[2]']);
  assert.match(r.error.problems[0].message, /"Mew" \(member W2-1\) is not a species of the current content/);
  assert.match(r.error.message, /nothing was changed/);
  assert.deepEqual(raw, before);
});

test('replay ledger across the migration: a result committed before schema 4 is still recognised afterwards (applied once)', () => {
  const g3 = v3(); g3.appliedBattles = {};
  const caught = E.memberFactory.createMember({ id: 'W3-1', species: 'Pidgey', level: 4 }, sample, () => 2);
  const result = { protocol: 1, battleId: 'wild#3', outcome: { kind: 'caught', winner: null, target: 'W3-1', ball: 'pokeball' }, members: { 'G-starter-1': { hp: 10 } }, bag: { potion: -1 }, captured: [caught], dex: { seen: ['Pidgey'], owned: ['Pidgey'] } };
  // what a step 4 build did: schema 3, battle names stored, the hash of the result as received in the ledger
  const committed3 = { ...clone(g3), party: [...clone(g3.party), H.legacyMember(caught, 3)], bag: { potion: 4999 }, appliedBattles: { 'wild#3': { hash: S.resultHash(result) } } };
  committed3.party[0].hp = 10;
  const m = migrateGame(committed3, { speciesKey: K.speciesKeyResolver(sample), content: sample });
  assert.equal(m.ok, true, JSON.stringify(m.error));
  const again = S.applyBattleResult(m.state, result, undefined, K.speciesKeyResolver(sample), H.templatesFor(m.state, result));
  assert.deepEqual([again.status, again.state === m.state], ['already-applied', true], 'the same result is a repeat after the migration');
  assert.throws(() => S.applyBattleResult(m.state, { ...result, bag: { potion: -2 } }, undefined, K.speciesKeyResolver(sample), H.templatesFor(m.state, result)), /already applied with a different result/);
});

// ---- review of 1960b92 (2026-10-22): F07 the identity boundary of growth, F08 newGame's persistent members
test('F07: applyExp takes battle records (session growth unchanged); a persistent member goes through applyExpPersistent and keeps its key', () => {
  const battle = E.memberFactory.createMember({ id: 'G-1', species: 'Charmander', level: 5 }, sample, () => 0);
  const saved = K.toPersistentMember(battle, sample);
  const amount = E.growth.minExp('medium', 9) - battle.exp; // enough for a few levels (Charmander's sample curve)
  const viaBattle = E.growth.applyExp(battle, amount, sample);
  const viaSaved = E.growth.applyExpPersistent(saved, amount, sample);
  assert.deepEqual([viaSaved.member.species, viaSaved.member.form], ['charmander', 0], 'the result keeps the persistent identity');
  assert.deepEqual({ ...viaSaved.member, species: 'Charmander', form: undefined }, { ...viaBattle.member, form: undefined }, 'the same growth as the battle path');
  assert.deepEqual(viaSaved.log, viaBattle.log);
  assert.throws(() => E.growth.applyExp(saved, 1, sample), /applyExp takes a battle record.*applyExpPersistent/);
});

test('F07: applyExpPersistent resolves the form (and falls back to the base form for one the content lacks)', () => {
  const i = withForms(); i.species[i.species.length - 1].growth = 'fast'; // the Alolan form grows on another curve
  const ct = assemble(i).content;
  const base = K.toPersistentMember(E.memberFactory.createMember({ id: 'V-0', species: 'Vulpix', level: 5 }, ct, () => 0), ct);
  const alola = { ...base, id: 'V-1', form: 1 }, missing = { ...base, id: 'V-7', form: 7 };
  const amount = 2000;
  const lv = m => E.growth.applyExpPersistent(m, amount, ct).member;
  assert.equal(lv(alola).level, E.growth.levelForExp('fast', base.exp + amount), 'form 1 uses its own record (fast curve)');
  assert.equal(lv(base).level, E.growth.levelForExp('medium', base.exp + amount));
  assert.equal(lv(missing).level, lv(base).level, 'a form the content lacks falls back to the base form (WP03 §3.2)');
  assert.deepEqual([lv(alola).form, lv(missing).form], [1, 7], 'the stored form is kept');
});

test('F08: newGame gives a member without a form the base form 0 (valid schema 4); battle records and results stay without one', () => {
  const battle = E.memberFactory.createMember({ id: 'A-1', species: 'Charmander', level: 5 }, sample, () => 0);
  const { form: _f, ...noForm } = K.toPersistentMember(battle, sample);
  const g = S.newGame({ party: [noForm] });
  assert.deepEqual([g.party[0].species, g.party[0].form], ['charmander', 0]);
  assert.deepEqual(validateGame(g), []);
  assert.equal(S.newGame({ party: [{ ...noForm, form: 2 }] }).party[0].form, 2, 'a given form is kept');
  assert.equal('form' in S.protocolMember(battle), false, 'newMember (also used for captured records, protocol v1) adds no form');
});
