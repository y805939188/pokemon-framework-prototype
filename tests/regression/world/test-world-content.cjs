'use strict';
// Formal-spec-derived input vectors. This suite executes the production TS graph, without a shared build.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
require('../../../scripts/tests/ts-source-loader.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const modules = Promise.all(['content/world-input', 'rules/world-data'].map(file => import(pathToFileURL(path.join(ROOT, 'src/framework', file + '.ts')).href)));
const copy = value => JSON.parse(JSON.stringify(value));
const context = { speciesKeys: [{ species: 'alpha', form: 0 }, { species: 'zeta', form: 0 }, { species: 'form-only', form: 1 }], usableSource: id => id === 'author' ? null : 'source not approved' };
const slot = (species = 'alpha', weight = 10, minLevel = 2, maxLevel = 5) => ({ species, weight, minLevel, maxLevel });
const inputs = () => ({
  encounters: { source: 'author', tables: [{ mapId: 7, version: -2, types: { Land: { stepChance: 121, slots: [slot('zeta', 20), slot('alpha', 10), slot('alpha', 10)] }, OldRod: { stepChance: 0, slots: [] } } }] },
  regionMaps: { source: 'author', regions: [{ id: 9, nameKey: 'region.remote', points: [{ x: 1, y: 2, switchId: 0 }, { x: 1, y: 2, nameKey: '', descriptionKey: '', healingSpot: { mapId: 7, x: -2, y: 5 } }] }, { id: 0, nameKey: 'region.home', points: [] }] },
  mapConnections: { source: 'author', connections: [{ a: { mapId: 7, anchor: 'E', offset: -3 }, b: { mapId: 8, anchor: 'W', offset: 9 } }] },
});
async function check(raw = inputs(), c = context) { return (await modules)[0].checkWorldInputs(raw, c); }
async function reject(edit, file, fragment) {
  const raw = inputs(); edit(raw);
  const result = await check(raw);
  assert.ok(result.problems.some(problem => problem.file === file && (!fragment || (problem.path + ' ' + problem.message).includes(fragment))), JSON.stringify(result.problems));
  const key = { 'encounters.json': 'encounters', 'region-maps.json': 'regionMaps', 'map-connections.json': 'mapConnections' }[file];
  assert.equal(Object.hasOwn(result.value, key), false);
  return result;
}

test('B1 optional files stay absent, including compiler-owned undefined properties', async () => {
  assert.deepEqual(await check({}), { value: {}, problems: [] });
  assert.deepEqual(await check({ encounters: undefined, regionMaps: undefined, mapConnections: undefined }), { value: {}, problems: [] });
});
test('B1 canonical encounter merge/sort is deterministic, preserves source and does not mutate author objects', async () => {
  const raw = inputs(), before = copy(raw), result = await check(raw);
  assert.deepEqual(result.problems, []); assert.deepEqual(raw, before);
  assert.deepEqual(result.value.encounters, { source: 'author', tables: [{ mapId: 7, version: -2, types: { Land: { stepChance: 121, slots: [slot('alpha', 20), slot('zeta', 20)] }, OldRod: { stepChance: 0, slots: [] } } }] });
  assert.deepEqual(await check(result.value), result);
  result.value.regionMaps.regions[0].points[1].healingSpot.x = 44;
  result.value.mapConnections.connections[0].a.offset = 88;
  assert.deepEqual(raw, before);
});
test('B1 exact level ranges merge separately and weight ties retain species/range order', async () => {
  const raw = inputs(); raw.encounters.tables[0].types.Land.slots = [slot('alpha', 5, 1, 1), slot('alpha', 3, 2, 2), slot('alpha', 2, 2, 2)];
  const result = await check(raw); assert.deepEqual(result.problems, []);
  assert.deepEqual(result.value.encounters.tables[0].types.Land.slots, [slot('alpha', 5, 1, 1), slot('alpha', 5, 2, 2)]);
});
test('B1 all 26 formal encounter identities retain exact default categories and chances', async () => {
  const [, data] = await modules;
  const groups = [['land', 21, ['Land', 'LandDay', 'LandNight', 'LandMorning', 'LandAfternoon', 'LandEvening']], ['land', 20, ['PokeRadar']], ['cave', 5, ['Cave', 'CaveDay', 'CaveNight', 'CaveMorning', 'CaveAfternoon', 'CaveEvening']], ['water', 2, ['Water', 'WaterDay', 'WaterNight', 'WaterMorning', 'WaterAfternoon', 'WaterEvening']], ['fishing', 0, ['OldRod', 'GoodRod', 'SuperRod']], ['none', 50, ['RockSmash']], ['none', 0, ['HeadbuttLow', 'HeadbuttHigh']], ['contest', 21, ['BugContest']]];
  assert.equal(Object.keys(data.ENCOUNTER_TYPES).length, 26);
  const raw = inputs(); raw.encounters.tables[0].types = {};
  for (const [category, chance, ids] of groups) for (const id of ids) {
    assert.deepEqual(data.ENCOUNTER_TYPES[id], { category, stepChance: chance });
    raw.encounters.tables[0].types[id] = { stepChance: chance, slots: [] };
  }
  assert.deepEqual((await check(raw)).problems, []);
});
test('B1 signed version/chance and probability above 100 survive; numeric strings and unsafe values reject', async () => {
  for (const number of [Number.MIN_SAFE_INTEGER, -1, 0, Number.MAX_SAFE_INTEGER]) {
    const raw = inputs(); raw.encounters.tables[0].version = number; raw.encounters.tables[0].types.Land.stepChance = number;
    const result = await check(raw); assert.deepEqual(result.problems, []);
    assert.equal(result.value.encounters.tables[0].version, number); assert.equal(result.value.encounters.tables[0].types.Land.stepChance, number);
  }
  for (const bad of ['1', 1.5, NaN, Infinity, 9007199254740992]) {
    await reject(raw => { raw.encounters.tables[0].version = bad; }, 'encounters.json', '.version');
    await reject(raw => { raw.encounters.tables[0].types.Land.stepChance = bad; }, 'encounters.json', '.stepChance');
  }
});
test('B1 duplicate map/version rejects while distinct signed versions remain separate', async () => {
  await reject(raw => raw.encounters.tables.push(copy(raw.encounters.tables[0])), 'encounters.json', 'duplicate map/version');
  const raw = inputs(); raw.encounters.tables.push({ ...copy(raw.encounters.tables[0]), version: 0 });
  assert.equal((await check(raw)).value.encounters.tables.length, 2);
});
test('B1 slot identities, positive weights and inclusive level boundaries are validated before publication', async () => {
  for (const [field, bad] of [['species', 'missing'], ['species', 'form-only'], ['weight', 0], ['weight', -1], ['weight', 1.5], ['minLevel', 0], ['maxLevel', 101]]) {
    await reject(raw => { raw.encounters.tables[0].types.Land.slots[0][field] = bad; }, 'encounters.json', '.' + field);
  }
  await reject(raw => { raw.encounters.tables[0].types.Land.slots[0].minLevel = 6; }, 'encounters.json', 'minimum level');
  const raw = inputs(); raw.encounters.tables[0].types.Land.slots = [slot('alpha', Number.MAX_SAFE_INTEGER, 1, 100)];
  assert.deepEqual((await check(raw)).problems, []);
});
test('B1 total/merged weights cannot lose integer precision', async () => {
  for (const species of ['alpha', 'zeta']) await reject(raw => { raw.encounters.tables[0].types.Land.slots = [slot('alpha', Number.MAX_SAFE_INTEGER), slot(species, 1)]; }, 'encounters.json', 'total encounter weight');
});
test('B1 source usage gate is applied once per present file, source envelope remains in the result', async () => {
  const calls = [], result = await check(inputs(), { ...context, usableSource: id => { calls.push(id); return null; } });
  assert.deepEqual(calls, ['author', 'author', 'author']);
  assert.equal(result.value.encounters.source, 'author'); assert.equal(result.value.regionMaps.source, 'author'); assert.equal(result.value.mapConnections.source, 'author');
  for (const [key, file] of [['encounters', 'encounters.json'], ['regionMaps', 'region-maps.json'], ['mapConnections', 'map-connections.json']]) {
    await reject(raw => { raw[key].source = 'denied'; }, file, 'source-unusable');
    await reject(raw => { delete raw[key].source; }, file, '$.source');
  }
});
test('B1 unknown nested fields/type IDs cannot silently disappear in author or compiled data', async () => {
  for (const edit of [raw => { raw.encounters.extra = true; }, raw => { raw.encounters.tables[0].extra = true; }, raw => { raw.encounters.tables[0].types.Missing = { stepChance: 1, slots: [] }; }, raw => { raw.encounters.tables[0].types.Land.extra = true; }, raw => { raw.encounters.tables[0].types.Land.slots[0].form = 1; }]) await reject(edit, 'encounters.json', 'unknown field');
  await reject(raw => { raw.regionMaps.regions[0].points[0].visible = true; }, 'region-maps.json', 'unknown field');
  await reject(raw => { raw.mapConnections.connections[0].a.extra = 0; }, 'map-connections.json', 'unknown field');
});
test('B1 points preserve same-cell author order, incomplete first point and missing/zero/negative switches', async () => {
  const raw = inputs(); raw.regionMaps.regions[0].points.push({ x: 1, y: 2, switchId: -2 });
  const result = await check(raw); assert.deepEqual(result.problems, []);
  assert.deepEqual(result.value.regionMaps, raw.regionMaps);
  assert.equal(Object.hasOwn(result.value.regionMaps.regions[0].points[1], 'switchId'), false);
  assert.deepEqual(result.value.regionMaps.regions.map(region => region.id), [9, 0]);
});
test('B1 sparse region IDs and points beyond cursor viewport are legal data, duplicate regions reject', async () => {
  const raw = inputs(); raw.regionMaps.regions[0].points.push({ x: 50, y: 25, switchId: Number.MIN_SAFE_INTEGER });
  assert.deepEqual((await check(raw)).problems, []);
  await reject(raw => { raw.regionMaps.regions.push(copy(raw.regionMaps.regions[0])); }, 'region-maps.json', 'duplicate region');
});
test('B1 malformed region coordinates, text, switches and healing triples reject with precise paths', async () => {
  for (const [field, bad] of [['x', -1], ['y', 0.5], ['nameKey', null], ['descriptionKey', 1], ['switchId', '0'], ['healingSpot', { mapId: 1, x: 2 }]]) await reject(raw => { raw.regionMaps.regions[0].points[0][field] = bad; }, 'region-maps.json', `$.regions[0].points[0].${field}`);
});
test('B1 connection author order/duplicates and explicit first-anchor mixed pair survive intact', async () => {
  const raw = inputs(); raw.mapConnections.connections.push(copy(raw.mapConnections.connections[0]), { a: { mapId: 8, anchor: { x: -2, y: 0 }, offset: 0 }, b: { mapId: 7, anchor: 'N', offset: 5 } });
  const result = await check(raw); assert.deepEqual(result.problems, []); assert.deepEqual(result.value.mapConnections, raw.mapConnections);
});
test('B1 directional first-anchor pairing matches WP04 rather than permitting arbitrary second endpoints', async () => {
  for (const [a, b] of [['N', 'S'], ['S', 'N'], ['E', 'W'], ['W', 'E']]) {
    const raw = inputs(); raw.mapConnections.connections[0].a.anchor = a; raw.mapConnections.connections[0].b.anchor = b;
    assert.deepEqual((await check(raw)).problems, []);
  }
  for (const b of ['E', 'S', { x: 0, y: 0 }]) await reject(raw => { raw.mapConnections.connections[0].b.anchor = b; }, 'map-connections.json', 'must oppose');
});
test('B1 connection/map identities and offsets are safe typed numbers', async () => {
  for (const [field, bad] of [['mapId', 0], ['mapId', -1], ['offset', '0'], ['offset', 0.5], ['anchor', { x: Infinity, y: 0 }], ['anchor', 'North']]) await reject(raw => { raw.mapConnections.connections[0].a[field] = bad; }, 'map-connections.json', '$.connections[0].a');
});
test('B1 world-map increments preserve signed target coordinates, shape text, >100 weather and independent region identity', async () => {
  const [validator] = await modules;
  const raw = { region: 1, flags: ['Existing'], darkMap: true, outdoor: true, alwaysBicycle: false, environment: 'cave', weather: { type: 'HeavyRain', chance: 123 }, mapPosition: { regionId: 99, x: 13, y: 12 }, mapSize: { width: 3, shape: '1290x' }, healingSpot: { mapId: 7, x: -2, y: 8 } };
  const before = copy(raw), result = validator.checkWorldMapFields(raw, '$.maps.7');
  assert.deepEqual(result.problems, []); const expected = copy(raw); delete expected.region; delete expected.flags; delete expected.darkMap;
  assert.deepEqual(result.value, expected); assert.deepEqual(raw, before);
  result.value.healingSpot.x = 50; assert.deepEqual(raw, before);
});
test('B1 each formal world-weather identity/category is separate from battle engine weather names', async () => {
  const [validator, data] = await modules;
  const expected = { None: 'None', Rain: 'Rain', Storm: 'Rain', Snow: 'Hail', Blizzard: 'Hail', Sandstorm: 'Sandstorm', HeavyRain: 'Rain', Sun: 'Sun', Fog: 'Fog' };
  assert.deepEqual(new Set(data.WORLD_WEATHER_IDS), new Set(Object.keys(expected)));
  for (const [type, category] of Object.entries(expected)) {
    assert.equal(data.isWorldWeatherId(type), true); assert.equal(data.worldWeatherCategory(type), category);
    assert.deepEqual(validator.checkWorldMapFields({ weather: { type, chance: 0 } }, '$').problems, []);
  }
  for (const type of ['rain', 'primordialsea', null, {}, undefined]) assert.equal(data.isWorldWeatherId(type), false);
  assert.throws(() => data.worldWeatherCategory('primordialsea'), /unknown world weather/);
});
test('B1 map malformed booleans, enums, integers, complete triples and shape domain reject atomically', async () => {
  const [validator] = await modules;
  for (const raw of [{ outdoor: 1 }, { alwaysBicycle: null }, { environment: 'Cave' }, { weather: { type: 'Rain', chance: -1 } }, { weather: { type: 'rain', chance: 100 } }, { mapPosition: { regionId: -1, x: 0, y: 0 } }, { mapSize: { width: -1, shape: '1' } }, { mapSize: { width: 1, shape: '１' } }, { healingSpot: { mapId: 1, x: 2 } }, { healingSpot: { mapId: 1, x: 2, y: 3, direction: 2 } }, { outdoor: undefined }]) {
    const result = validator.checkWorldMapFields(raw, '$.maps.7'); assert.equal(result.value, null); assert.ok(result.problems.length); assert.ok(result.problems.every(problem => problem.path.startsWith('$.maps.7')));
  }
  for (const raw of [{}, { mapSize: { width: 0, shape: '' } }, { mapSize: { width: 3, shape: '11111' } }]) assert.deepEqual(validator.checkWorldMapFields(raw, '$').problems, []);
});
test('B1 getters at every nesting layer are rejected without running them', async () => {
  let calls = 0;
  for (const edit of [raw => Object.defineProperty(raw.encounters, 'source', { enumerable: true, get() { calls++; return 'author'; } }), raw => Object.defineProperty(raw.encounters.tables[0], 'mapId', { enumerable: true, get() { calls++; return 7; } }), raw => Object.defineProperty(raw.encounters.tables[0].types.Land.slots, '0', { enumerable: true, get() { calls++; return slot(); } }), raw => Object.defineProperty(raw.regionMaps.regions[0].points[1].healingSpot, 'x', { enumerable: true, get() { calls++; return 0; } })]) {
    const raw = inputs(); edit(raw); assert.ok((await check(raw)).problems.length);
  }
  const [validator] = await modules, increment = {}; Object.defineProperty(increment, 'outdoor', { enumerable: true, get() { calls++; return true; } });
  assert.equal(validator.checkWorldMapFields(increment, '$').value, null); assert.equal(calls, 0);
});
test('B1 custom prototypes, hidden/symbol fields, array extras and sparse arrays are rejected', async () => {
  for (const edit of [raw => { raw.encounters = Object.assign(Object.create({ inherited: true }), raw.encounters); }, raw => { Object.defineProperty(raw.encounters, 'hidden', { value: 1 }); }, raw => { raw.encounters[Symbol('x')] = 1; }, raw => { delete raw.encounters.tables[0]; }, raw => { raw.encounters.tables.extra = true; }]) await reject(edit, 'encounters.json');
  const raw = inputs(); raw.encounters.tables[0].types = JSON.parse('{"__proto__":{"stepChance":21,"slots":[]}}');
  assert.ok((await check(raw)).problems.some(problem => problem.path.endsWith('.__proto__'))); assert.equal({}.stepChance, undefined);
});
test('B1 JSON/cross-realm/null-prototype ordinary data remains supported', async () => {
  const raw = vm.runInNewContext('(' + JSON.stringify(inputs()) + ')'); assert.deepEqual((await check(raw)).problems, []);
  const ordinary = inputs(); Object.setPrototypeOf(ordinary.encounters, null); assert.deepEqual((await check(ordinary)).problems, []);
});
test('B1 independent bad files all report their own file and no invalid envelope is installable', async () => {
  const raw = inputs(); raw.encounters.source = 'denied'; raw.regionMaps.regions[0].id = -1; raw.mapConnections.connections[0].b.offset = '0';
  const result = await check(raw); assert.deepEqual(new Set(result.problems.map(problem => problem.file)), new Set(['encounters.json', 'region-maps.json', 'map-connections.json'])); assert.deepEqual(result.value, {});
});
