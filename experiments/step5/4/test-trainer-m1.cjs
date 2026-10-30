'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../js/engine/build/engine.cjs');

const SRC = path.resolve(__dirname, '../../../content/sample');
const read = file => JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
const optional = file => fs.existsSync(path.join(SRC, file)) ? read(file) : undefined;
const baseInputs = () => Object.fromEntries(Object.entries({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: optional('grants.json'), regionalDex: optional('regional-dex.json'), settings: optional('settings.json'), items: optional('items.json'), shops: optional('shops.json'), mapMetadata: optional('map-metadata.json') }).filter(([, value]) => value !== undefined));
const clone = value => JSON.parse(JSON.stringify(value));
const lcg = seed => { let state = seed >>> 0; return n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor((state / 4294967296) * n); }; };

function trainerType() {
  return { id: 'youngster', nameKey: 'trainer.type.youngster', gender: 0, baseMoney: 20, skillLevel: 3, flags: ['NoName'], items: [{ item: 'potion', count: 1 }], battleBgm: 'Battle trainer', victoryBgm: '', introBgm: 'Intro', openingText: 'Hello', winText: 'I won', loseText: 'I lost', source: 'author-placeholder' };
}
function trainerRecord() {
  return { id: 'route-1-rival', type: 'youngster', name: 'Avery', version: 2, source: 'author-placeholder', items: [{ item: 'potion', count: 2 }], party: [
    { species: 'pidgey', level: 19, form: 0, moves: ['gust', 'tackle'], abilityIndex: 0, ability: 'keeneye', gender: 'F', shiny: false, superShiny: true, nature: 'lonely', ivs: { hp: 31 }, evs: { atk: 252 }, friendship: 0, nickname: 'Pip', ball: 'pokeball' },
    { species: 'caterpie', level: 19 },
  ] };
}
function compile(extra = {}) {
  const result = E.contentCompile.compileContent({ ...baseInputs(), ...extra });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result.data;
}
function assembled(compiled) {
  const result = E.contentRuntime.assembleContent(compiled, E.dex.createDexLookup());
  assert.deepEqual(result.errors, []);
  return result.content;
}
function build(content, compiled, record = compiled.trainers[0]) {
  const type = compiled.trainerTypes.find(t => t.id === record.type);
  return E.trainerTeam.buildTrainerTeam({ content, registrationOrder: compiled.registrationOrder, trainerTypeOrder: compiled.trainerTypes.map(t => t.id), record, type,
    owner: { id: 7, name: record.name, gender: type.gender, language: 2 }, random: lcg(42), receivedAt: 1234, allocateId: index => `T${index + 1}` });
}

test('AM1-ULTRA-03 ordinary form creation precedes omitted/explicit overrides and preserves the next member RNG', () => {
  const pumpkins = ['pumpkaboo', 'pumpkaboosmall', 'pumpkaboolarge', 'pumpkaboosuper'].map((showdownId, form) => ({
    id: 'pumpkin', form, showdownId, nameKey: 'species.pumpkin', growth: 'medium', baseExp: 67, evYield: { def: 1 }, catchRate: 120,
    learnset: [{ level: 1, move: form === 1 ? 'tackle' : 'astonish' }], source: 'author-placeholder',
  }));
  function random() { const calls = []; return { calls, next(n) { const i = calls.length; calls.push(n); return i === 8 ? 0 : (i * 17) % n; } }; }
  for (const form of [undefined, 0, 1, 3]) {
    const input = baseInputs(); input.species.push(...pumpkins);
    const npc = { ...trainerRecord(), party: [{ species: 'pumpkin', level: 5, ...(form === undefined ? {} : { form }) }, { species: 'caterpie', level: 5 }] };
    const compiled = E.contentCompile.compileContent({ ...input, trainerTypes: [trainerType()], trainers: [npc] });
    assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
    const content = assembled(compiled.data), expected = random(), actual = random();
    const owner = { id: 7, name: npc.name, gender: 0, language: 2 }, context = { map: 9, receivedAt: 1234, playerId: 7 };
    const normal = E.memberFactory.createMember({ id: 'C1', species: 'Pumpkaboo', level: 5, owner, withMoves: false, context }, content, n => expected.next(n));
    const next = E.memberFactory.createMember({ id: 'C2', species: 'Caterpie', level: 5, owner, withMoves: false, context }, content, n => expected.next(n));
    const team = E.trainerTeam.buildTrainerTeam({ content, registrationOrder: compiled.data.registrationOrder, trainerTypeOrder: ['youngster'],
      record: compiled.data.trainers[0], type: compiled.data.trainerTypes[0], owner, random: n => actual.next(n), receivedAt: 1234, allocateId: i => `T${i + 1}`, context: { map: 9 } });
    assert.equal(normal.form, 3);
    assert.equal(team[0].form, form ?? normal.form);
    assert.equal(team[0].species, content.forms.pumpkin[form ?? normal.form]);
    assert.deepEqual(actual.calls, expected.calls);
    assert.equal(actual.calls[8], 100, 'explicit Form must not remove ordinary creation RNG');
    assert.equal(team[1].personalID, next.personalID);
    assert.deepEqual(team[0].moves.map(m => m.id), [form === 1 ? 'tackle' : 'astonish']);
    const species = content.species[team[0].species];
    assert.equal(team[0].hp, E.growth.computeStats(species.base, team[0].ivs, team[0].evs, 5, team[0].nature).hp);
  }
});

test('AM1-ULTRA-04 explicit legacy omitted friendship inherits legal 256 while explicit overrides retain their own domain', () => {
  const input = baseInputs(); input.manifest.schema = 1; input.species.find(s => s.id === 'pidgey' && (s.form ?? 0) === 0).happiness = 256;
  for (const friendship of [undefined, 0]) {
    const npc = { ...trainerRecord(), party: [{ species: 'pidgey', level: 5, ...(friendship === undefined ? {} : { friendship }) }] };
    const result = E.contentCompile.compileContent({ ...input, trainerTypes: [trainerType()], trainers: [npc] });
    assert.equal(result.ok, true); const team = build(assembled(result.data), result.data);
    assert.equal(team[0].friendship, friendship ?? 256);
  }
  for (const friendship of [-1, 256]) {
    const result = E.contentCompile.compileContent({ ...input, trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 5, friendship }] }] });
    assert.equal(result.ok, false); assert.ok(result.errors.some(e => e.path.endsWith('.friendship')));
  }
});

test('AM1-ULTRA-05 canonical and hyphenated trainer references agree through cache, assembly and construction', () => {
  for (const [move, ability] of [['quick-attack', 'keen-eye'], ['quickattack', 'keeneye']]) {
    const compiled = compile({ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 19, moves: [move, 'quickattack'], ability }] }] });
    const loaded = E.contentRuntime.loadCompiled(clone(compiled)), content = assembled(loaded);
    assert.deepEqual(content.trainers['route-1-rival'][0].party[0].moves, ['quickattack', 'quickattack']);
    assert.equal(content.trainers['route-1-rival'][0].party[0].ability, 'keeneye');
    const team = build(content, loaded);
    assert.deepEqual(team[0].moves.map(m => m.id), ['quickattack']);
    assert.equal(team[0].ability, 'Keen Eye');
  }
  for (const member of [{ moves: ['missing-move'] }, { ability: 'missing-ability' }]) {
    const compiled = compile({ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 19, ...member }] }] });
    const result = E.contentRuntime.assembleContent(E.contentRuntime.loadCompiled(clone(compiled)), E.dex.createDexLookup());
    assert.ok(result.errors.some(e => member.moves ? e.path.includes('.moves[') : e.path.endsWith('.ability')));
  }
});

test('AM1-ULTRA-05 registered Dex aliases fail at the content gate while canonical targets remain consumable', () => {
  const dex = E.dex.createDexLookup();
  for (const [alias, canonical, name, pp] of [['tbolt', 'thunderbolt', 'Thunderbolt', 15], ['eq', 'earthquake', 'Earthquake', 10]]) {
    assert.deepEqual(dex.move(alias), { id: canonical, name, pp }, 'the negative input is a real registered Dex alias');
    const compiled = compile({ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 19, moves: [alias] }] }] });
    const cached = E.contentRuntime.loadCompiled(clone(compiled)), before = clone(cached);
    const rejected = E.contentRuntime.assembleContent(cached, dex);
    assert.ok(rejected.errors.some(e => e.path === 'trainers/route-1-rival@2.party[0].moves[0]' && e.message.includes('canonical') && e.message.includes(canonical)), 'an accepted Dex alias must not pass the content gate with an unusable stored ID');
    assert.deepEqual(cached, before, 'diagnostics do not rewrite the compiled input or its hash');

    const supported = compile({ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 19, moves: [canonical, 'tackle', canonical], ability: 'keen-eye' }] }] });
    const loaded = E.contentRuntime.loadCompiled(clone(supported)), content = assembled(loaded);
    assert.equal(E.contentRuntime.validatedContentIdentity(content), loaded.contentIdentity);
    for (const record of [loaded.trainers[0], content.trainers['route-1-rival'][0]]) {
      const member = build(content, loaded, record)[0];
      assert.deepEqual(member.moves.map(m => m.id), ['tackle', canonical]);
      assert.equal(member.moves[1].pp, pp);
      assert.equal(member.ability, 'Keen Eye');
    }
    assert.deepEqual(loaded, supported, 'successful runtime assembly also leaves the cache unchanged');
  }
});

test('A-M1 content is optional and preserves the legacy input hash when absent', () => {
  const before = compile();
  assert.equal(before.trainers, undefined);
  assert.equal(before.trainerTypes, undefined);
  const again = compile();
  assert.equal(again.inputsHash, before.inputsHash);
  const withTrainers = compile({ trainerTypes: [trainerType()], trainers: [trainerRecord()] });
  assert.notEqual(withTrainers.inputsHash, before.inputsHash);
  assert.deepEqual(withTrainers.trainerTypes.map(t => t.id), ['youngster']);
  assert.deepEqual(withTrainers.trainers.map(t => [t.id, t.version]), [['route-1-rival', 2]]);
});

test('A-M1 content rejects bad references, explicit empty values, Shadow and denied sources', () => {
  const cases = [
    [{ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'missing', level: 5 }] }] }, /species/],
    [{ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 5, nickname: '' }] }] }, /nickname/],
    [{ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 5, ball: 'not-a-ball' }] }] }, /ball/],
    [{ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), party: [{ species: 'pidgey', level: 5, shadow: true }] }] }, /[Ss]hadow/],
    [{ trainerTypes: [{ ...trainerType(), source: 'not-registered' }], trainers: [trainerRecord()] }, /source/],
    [{ trainerTypes: [trainerType()], trainers: [{ ...trainerRecord(), version: 2 }, { ...trainerRecord(), version: 2 }] }, /duplicate/],
  ];
  for (const [extra, expected] of cases) {
    const result = E.contentCompile.compileContent({ ...baseInputs(), ...extra });
    assert.equal(result.ok, false);
    assert.match(result.errors.map(e => `${e.file} ${e.path} ${e.message}`).join('\n'), expected);
  }
});

test('A-M1 deterministic NPC team follows WP18 override order and keeps omitted values distinct', () => {
  const compiled = compile({ trainerTypes: [trainerType()], trainers: [trainerRecord()] });
  const content = assembled(compiled);
  const original = clone(compiled);
  const team = build(content, compiled);
  assert.equal(team.length, 2);
  const [explicit, defaulted] = team;
  assert.deepEqual(explicit.moves.map(m => m.id), ['gust', 'tackle']);
  assert.deepEqual([explicit.owner.id, explicit.owner.name, explicit.owner.gender], [7, 'Avery', 0]);
  assert.deepEqual([explicit.abilityIndex, explicit.ability, explicit.gender], [0, 'Keen Eye', 'F']);
  assert.deepEqual([explicit.shiny, explicit.superShiny, explicit.nature, explicit.friendship, explicit.nickname, explicit.ball, explicit.form], [true, true, 'lonely', 0, 'Pip', 'pokeball', 0]);
  assert.equal(explicit.ivs.hp, 31);
  assert.equal(explicit.ivs.atk, 9, 'omitted IV uses floor(level/2), not the random creation value');
  assert.equal(explicit.evs.atk, 252);
  assert.equal(explicit.evs.hp, 28, 'omitted EV uses min(floor(3*level/2),85)');
  assert.equal(explicit.origin.receivedAt, 1234);
  assert.deepEqual(defaulted.moves.map(m => m.id), ['tackle', 'stringshot', 'bugbite']);
  assert.deepEqual([defaulted.abilityIndex, defaulted.gender, defaulted.shiny, defaulted.superShiny, defaulted.friendship], [0, 'M', false, false, 70]);
  assert.ok(Object.values(defaulted.ivs).every(v => v === 9));
  assert.ok(Object.values(defaulted.evs).every(v => v === 28));
  assert.equal(defaulted.nature, E.memberFactory.NATURE_ORDER[(compiled.registrationOrder.findIndex(k => k.species === 'caterpie' && k.form === 0) + 0) % 25]);
  assert.deepEqual(compiled, original, 'builder does not mutate content or records');
  const again = build(content, compiled);
  assert.deepEqual(again, team, 'same complete inputs and seed are byte-deterministic');
  explicit.moves[0].pp = 0;
  explicit.owner.name = 'changed';
  assert.notEqual(again[0].moves[0].pp, 0);
  assert.equal(again[0].owner.name, 'Avery');
});

test('A-M1 default nature uses full registrationOrder including form placeholders, never national ids', () => {
  const compiled = compile({ trainerTypes: [trainerType(), { ...trainerType(), id: 'ace', gender: 2 }], trainers: [{ ...trainerRecord(), type: 'ace', party: [{ species: 'pidgey', level: 5 }] }] });
  const content = assembled(compiled);
  const team = build(content, compiled);
  const speciesIndex = compiled.registrationOrder.findIndex(k => k.species === 'pidgey' && k.form === 0);
  assert.equal(team[0].nature, E.memberFactory.NATURE_ORDER[(speciesIndex + 1) % 25]);
  assert.equal(team[0].gender, 'F', 'non-male trainer type attempts female by default');
});

test('A-M1 base reward uses each opposing team maximum and actual capped balance delta', () => {
  const opponents = [{ baseMoney: 20, levels: [3, 19, 7] }, { baseMoney: 5, levels: [11] }];
  assert.equal(E.trainerReward.trainerPrizeBase(opponents), 435);
  assert.throws(() => E.trainerReward.trainerPrizeBase([{ baseMoney: Number.MAX_SAFE_INTEGER, levels: [100] }, { baseMoney: 1, levels: [100] }]), /safe|money/i);
  const state = E.state.newGame({ party: [], money: 999990 });
  const planned = E.trainerReward.applyTrainerPrize(state, opponents, undefined, E.limits.DEFAULT_LIMITS);
  assert.equal(planned.state.money, 999999);
  assert.equal(planned.state.stats.battle_money_gained, 9);
  assert.deepEqual(planned.reward, { nominal: 435, before: 999990, after: 999999, actual: 9, normalizationLoss: 0 });
  const rich = E.state.newGame({ party: [], money: 1000000 });
  const normalized = E.trainerReward.applyTrainerPrize(rich, opponents, undefined, E.limits.DEFAULT_LIMITS);
  assert.equal(normalized.state.money, 999999);
  assert.equal(normalized.state.stats.battle_money_gained, 0);
  assert.deepEqual(normalized.reward, { nominal: 435, before: 1000000, after: 999999, actual: 0, normalizationLoss: 1 });
});

test('A-M1 persistent schema 9 migrates a complete schema 7 save without inventing defeats', () => {
  assert.equal(E.state.GAME_SCHEMA, 9);
  const legacyContent = assembled(compile());
  const old = E.state.newGame({ party: [], content: legacyContent });
  old.schema = 7;
  delete old.defeatedTrainers;
  const migrated = E.saveSchema.migrateGame(old, { content: legacyContent });
  assert.equal(migrated.ok, true, JSON.stringify(migrated.error));
  assert.equal(migrated.from, 7);
  assert.equal(migrated.to, 9);
  assert.deepEqual(migrated.state.defeatedTrainers, {});
  assert.deepEqual(E.saveSchema.validateGame(migrated.state), []);
  migrated.state.defeatedTrainers['route-1-rival@2'] = { id: 'route-1-rival', version: 2 };
  assert.deepEqual(E.saveSchema.validateGame(migrated.state), []);
  const replay = E.saveSchema.migrateGame(migrated.state, { content: assembled(compile()) });
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.state.defeatedTrainers, migrated.state.defeatedTrainers);
});
