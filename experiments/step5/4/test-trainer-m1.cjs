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

test('A-M1 persistent schema 8 migrates a complete schema 7 save without inventing defeats', () => {
  assert.equal(E.state.GAME_SCHEMA, 8);
  const legacyContent = assembled(compile());
  const old = E.state.newGame({ party: [], content: legacyContent });
  old.schema = 7;
  delete old.defeatedTrainers;
  const migrated = E.saveSchema.migrateGame(old, { content: legacyContent });
  assert.equal(migrated.ok, true, JSON.stringify(migrated.error));
  assert.equal(migrated.from, 7);
  assert.equal(migrated.to, 8);
  assert.deepEqual(migrated.state.defeatedTrainers, {});
  assert.deepEqual(E.saveSchema.validateGame(migrated.state), []);
  migrated.state.defeatedTrainers['route-1-rival@2'] = { id: 'route-1-rival', version: 2 };
  assert.deepEqual(E.saveSchema.validateGame(migrated.state), []);
  const replay = E.saveSchema.migrateGame(migrated.state, { content: assembled(compile()) });
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.state.defeatedTrainers, migrated.state.defeatedTrainers);
});
