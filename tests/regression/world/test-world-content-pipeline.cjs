'use strict';
// Actual author -> compiler -> cache gate -> runtime and CLI vectors; no reference runtime observations.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
require('../../../scripts/tests/ts-source-loader.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const modules = Promise.all(['content/compile', 'flow/content-runtime', 'content/pbs-import', 'content/schema'].map(file => import(pathToFileURL(path.join(ROOT, 'src/framework', file + '.ts')).href)));
const SHA = 'a'.repeat(40), clone = value => JSON.parse(JSON.stringify(value));
const sp = (id, extra = {}) => ({ id, showdownId: id, nameKey: 'species.' + id, growth: 'medium', baseExp: 64, evYield: { hp: 1 }, catchRate: 255, happiness: 70, learnset: [{ level: 1, move: 'tackle' }], source: 'author', ...extra });
const inputs = () => ({ manifest: { schema: 2, id: 'world-test', title: 'Author synthetic world test' }, sources: [{ id: 'sd', kind: 'showdown', description: 'synthetic pinned data port', license: 'test', ref: 'test', status: 'confirmed', usedFor: [], usageCheck: { checkedOn: '2026-11-15', checkedBy: 'test', conditions: 'synthetic only', decision: 'internal-use' } }, { id: 'author', kind: 'author-placeholder', description: 'synthetic author world', license: 'test', ref: 'test', status: 'placeholder', usedFor: [] }], species: [sp('foo'), sp('bar')], overlays: [] });
const world = () => ({ encounters: { source: 'author', tables: [{ mapId: 6, version: -1, types: { Cave: { stepChance: -5, slots: [{ species: 'foo', weight: 10, minLevel: 2, maxLevel: 5 }, { species: 'bar', weight: 20, minLevel: 3, maxLevel: 3 }, { species: 'foo', weight: 10, minLevel: 2, maxLevel: 5 }] } } }] }, regionMaps: { source: 'author', regions: [{ id: 0, nameKey: 'region.sample', points: [{ x: 1, y: 2, switchId: 0 }, { x: 1, y: 2, healingSpot: { mapId: 6, x: 4, y: 5 } }] }] }, mapConnections: { source: 'author', connections: [{ a: { mapId: 5, anchor: 'E', offset: 0 }, b: { mapId: 6, anchor: 'W', offset: 0 } }] } });
const dex = (queries = []) => ({ sha() { queries.push('sha'); return SHA; }, species(id) { queries.push('species:' + id); return { name: id, baseSpecies: id, types: ['Normal'], baseStats: { hp: 40, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 } }; }, move(id) { queries.push('move:' + id); return id === 'tackle' ? { name: id, id, pp: 35 } : null; }, type(id) { return id.toLowerCase() === 'normal' ? { name: 'Normal' } : null; }, heldItem(id) { queries.push('held:' + id); return ['oranberry', 'pearl', 'lumberry'].includes(id) ? { id, holdable: true, mail: false } : null; }, allMoves() { return [{ id: 'tackle', name: 'tackle', pp: 35 }]; }, allAbilities() { return []; } });
async function compile(raw = inputs()) { const [c] = await modules; const result = c.compileContent(raw, {}, { showdownSha: SHA }); assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.data; }
async function reject(edit, file, pattern) { const [c] = await modules, raw = inputs(); edit(raw); const result = c.compileContent(raw, {}, { showdownSha: SHA }); assert.equal(result.ok, false); assert.ok(result.errors.some(error => error.file === file && pattern.test(error.path + ' ' + error.message)), JSON.stringify(result.errors)); return result; }

test('B1 pipeline author2/cache5, absent world preserves prior input hash and cache4 requires rebuild', async () => {
  const [c, runtime, , schema] = await modules, raw = inputs(), cache = await compile(raw);
  assert.equal(schema.AUTHOR_SCHEMA_VERSION, 2); assert.equal(schema.COMPILED_SCHEMA_VERSION, 5); assert.equal(cache.schema, 5); assert.equal(Object.hasOwn(cache, 'world'), false);
  const expected = createHash('sha256').update(c.canonicalJson({ manifest: raw.manifest, sources: raw.sources, species: raw.species, overlays: raw.overlays, grants: raw.grants, settings: raw.settings, items: raw.items, shops: raw.shops, regionalDex: raw.regionalDex, mapMetadata: raw.mapMetadata, trainerTypes: raw.trainerTypes, trainers: raw.trainers })).digest('hex');
  assert.equal(cache.inputsHash, expected); assert.equal(runtime.loadCompiled(cache), cache);
  assert.throws(() => runtime.loadCompiled({ ...cache, schema: 4 }), /needs-rebuild/); assert.match(c.checkFresh({ ...cache, schema: 4 }, raw).message, /needs-rebuild/);
});
test('B1 each optional source envelope affects hash and survives compiled/runtime detached', async () => {
  const [c, runtime] = await modules, raw = { ...inputs(), ...world() }, before = clone(raw), cache = await compile(raw);
  assert.deepEqual(Object.keys(cache.world).sort(), ['encounters', 'mapConnections', 'regionMaps']);
  for (const key of ['encounters', 'regionMaps', 'mapConnections']) { const removed = clone(raw); delete removed[key]; assert.notEqual(c.hashInputs(removed), cache.inputsHash); assert.equal(cache.world[key].source, 'author'); }
  assert.deepEqual(cache.world.encounters.tables[0].types.Cave.slots.map(slot => [slot.species, slot.weight]), [['bar', 20], ['foo', 20]]);
  const result = runtime.assembleContent(cache, dex()); assert.deepEqual(result.errors, []); assert.deepEqual(result.content.world, cache.world); assert.deepEqual(raw, before);
  result.content.world.regionMaps.regions[0].points[0].x = 50; assert.equal(cache.world.regionMaps.regions[0].points[0].x, 1);
});
test('B1 compiled world tampering is rejected independently of compiler: unknown/source/merge/order', async () => {
  const [, runtime] = await modules, cache = await compile({ ...inputs(), ...world() });
  for (const edit of [data => { data.world.extra = true; }, data => { data.world.encounters.source = 'missing'; }, data => { data.world.encounters.tables[0].types.Missing = { slots: [], stepChance: 0 }; }, data => { data.world.encounters.tables[0].types.Cave.slots.reverse(); }, data => { data.world.encounters.tables[0].types.Cave.slots.push(clone(data.world.encounters.tables[0].types.Cave.slots[0])); }]) {
    const bad = clone(cache); edit(bad); assert.throws(() => runtime.loadCompiled(bad));
  }
});
test('B1 source failure prevents runtime Dex consumption, not merely later generation', async () => {
  const [, runtime] = await modules, cache = await compile({ ...inputs(), ...world() }), calls = [];
  cache.world.regionMaps.source = 'missing'; const result = runtime.assembleContent(cache, dex(calls)); assert.ok(result.errors.length); assert.deepEqual(calls, []);
});
test('B1 map metadata old region and new town region stay distinct through cache/runtime', async () => {
  const [, runtime] = await modules, raw = inputs(); raw.regionalDex = { source: 'author', regions: [{ id: 0, nameKey: 'region.dex', species: ['foo'] }] };
  raw.mapMetadata = { source: 'author', maps: { 6: { region: 0, flags: [], darkMap: false, outdoor: true, alwaysBicycle: false, weather: { type: 'HeavyRain', chance: 200 }, environment: 'cave', mapPosition: { regionId: 99, x: 13, y: 12 }, mapSize: { width: 3, shape: '10000' }, healingSpot: { mapId: 5, x: -2, y: 8 } } } };
  const cache = await compile(raw); assert.deepEqual(cache.mapMetadata, raw.mapMetadata); assert.deepEqual(runtime.assembleContent(cache, dex()).content.mapMetadata, raw.mapMetadata);
  for (const [field, bad] of [['outdoor', 1], ['weather', { type: 'rain', chance: 50 }], ['mapSize', { width: 1, shape: 'bad' }], ['healingSpot', { mapId: 5, x: 2 }], ['unexpected', true]]) { const changed = clone(raw); changed.mapMetadata.maps[6][field] = bad; const [c] = await modules; assert.equal(c.compileContent(changed).ok, false); }
});
test('B1 wild pools fall back as a whole, retain duplicates and never share form/sibling arrays', async () => {
  const [, runtime] = await modules, raw = inputs(); raw.species[0] = sp('foo', { wildItemCommon: ['oranberry', 'oranberry'], wildItemUncommon: ['pearl'], wildItemRare: ['lumberry'] });
  raw.species.push({ id: 'foo', form: 1, showdownId: 'fooone', source: 'author', wildItemRare: ['pearl'] }, { id: 'foo', form: 2, showdownId: 'footwo', source: 'author', wildItemCommon: [], wildItemUncommon: [], wildItemRare: [] }, { id: 'foo', form: 3, showdownId: 'foothree', source: 'author' });
  const cache = await compile(raw), records = form => cache.species.find(sp => sp.id === 'foo' && (sp.form ?? 0) === form);
  assert.equal(records(1).wildItemCommon, undefined); assert.equal(records(1).wildItemUncommon, undefined); assert.deepEqual(records(1).wildItemRare, ['pearl']);
  for (const form of [2, 3]) for (const key of ['wildItemCommon', 'wildItemUncommon', 'wildItemRare']) assert.deepEqual(records(form)[key], records(0)[key]);
  records(2).wildItemCommon.push('pearl'); assert.deepEqual(records(0).wildItemCommon, ['oranberry', 'oranberry']); assert.deepEqual(records(3).wildItemCommon, ['oranberry', 'oranberry']);
  const assembled = runtime.assembleContent(cache, dex()); assert.deepEqual(assembled.errors, []); assert.deepEqual(assembled.content.species.foo.wildItemCommon, ['oranberry', 'oranberry']); assembled.content.species.foo.wildItemCommon.push('pearl'); assert.equal(records(0).wildItemCommon.length, 2);
});
test('B1 overlays apply after pool inheritance; an explicit clear is not re-inherited at runtime', async () => {
  const [, runtime] = await modules, raw = inputs(); raw.species[0].wildItemCommon = ['oranberry']; raw.species.push({ id: 'foo', form: 1, showdownId: 'fooone', source: 'author' }); raw.overlays = [{ target: 'species/foo/1', set: { wildItemCommon: [], wildItemRare: ['pearl'] }, reason: 'author variant' }];
  const cache = await compile(raw), form = cache.species.find(sp => sp.form === 1); assert.deepEqual(form.wildItemCommon, []); assert.deepEqual(form.wildItemRare, ['pearl']); assert.deepEqual(runtime.assembleContent(cache, dex()).content.species.fooone.wildItemCommon, []);
});
test('B1 malformed pool types and sparse arrays reject before inherited/overlay use', async () => {
  for (const bad of [null, 'oranberry', [null], [''], [, 'oranberry']]) await reject(raw => { raw.species[0].wildItemCommon = bad; }, 'species.json', /wildItemCommon/);
  await reject(raw => { raw.overlays = [{ target: 'species/foo', set: { wildItemRare: 'pearl' }, reason: 'bad typed pool' }]; }, 'overlays.json', /wildItemRare/);
});
test('B1 pool getters are rejected without executing them in author, overlays and cache gates', async () => {
  let reads = 0;
  await reject(raw => Object.defineProperty(raw.species[0], 'wildItemCommon', { enumerable: true, get() { reads++; return ['oranberry']; } }), 'species.json', /own data/);
  await reject(raw => { const set = {}; Object.defineProperty(set, 'wildItemRare', { enumerable: true, get() { reads++; return ['pearl']; } }); raw.overlays = [{ target: 'species/foo', set, reason: 'getter' }]; }, 'overlays.json', /own data/);
  const [, runtime] = await modules, cache = await compile(); Object.defineProperty(cache.species[0], 'wildItemCommon', { enumerable: true, get() { reads++; return ['oranberry']; } }); assert.throws(() => runtime.loadCompiled(cache), /own data/); assert.equal(reads, 0);
});
test('B1 unknown or author-unholdable canonical pools fail assembly without weakening held-item policy', async () => {
  const [, runtime] = await modules, raw = inputs(); raw.species[0].wildItemCommon = ['missing']; const cache = await compile(raw); assert.match(runtime.assembleContent(cache, dex()).errors[0].message, /unsupported canonical wild held item/);
  raw.species[0].wildItemCommon = ['oranberry']; raw.items = [{ id: 'pokeball', flags: ['PokeBall'], battleUse: 'ball', source: 'author' }, { id: 'oranberry', flags: ['Unholdable'], source: 'author' }];
  const restricted = await compile(raw); assert.ok(runtime.assembleContent(restricted, dex()).errors.some(error => /wildItemCommon/.test(error.path)));
});
test('B1 PBS imports all three ordered pools and form one-pool overrides do not fill from base', async () => {
  const [, runtime, pbs] = await modules;
  const proposal = pbs.importPbsBundle({ sourceId: 'author', sourceProblem: () => null, baseFiles: [{ file: 'base.txt', read: () => '[FOO]\nGrowthRate=Medium\nBaseExp=64\nEVs=HP,1\nMoves=1,TACKLE\nWildItemCommon=ORANBERRY,ORANBERRY\nWildItemUncommon=PEARL\nWildItemRare=LUMBERRY\n' }], formFiles: [{ file: 'forms.txt', read: () => '[FOO,1]\nWildItemRare=PEARL\n[FOO,2]\nWildItemCommon=\nWildItemUncommon=\nWildItemRare=\n' }], resolveFormShowdownId: (_, form) => 'foo' + form });
  assert.equal(proposal.ok, true, JSON.stringify(proposal.errors)); assert.ok(proposal.records.every(record => record.later.every(field => !field.field.startsWith('WildItem'))));
  const one = proposal.species.find(sp => sp.form === 1), two = proposal.species.find(sp => sp.form === 2); assert.deepEqual(one.wildItemCommon, []); assert.deepEqual(one.wildItemUncommon, []); assert.deepEqual(one.wildItemRare, ['pearl']); assert.deepEqual(two.wildItemCommon, ['oranberry', 'oranberry']); assert.deepEqual(two.wildItemUncommon, ['pearl']); assert.deepEqual(two.wildItemRare, ['lumberry']);
  const raw = inputs(); raw.species = proposal.species; const cache = await compile(raw); assert.deepEqual(runtime.assembleContent(cache, dex()).errors, []);
  const deniedReads = []; const denied = pbs.importPbsBundle({ sourceId: 'blocked', sourceProblem: () => 'denied', baseFiles: [{ file: 'blocked.txt', read: () => { deniedReads.push(1); return ''; } }] }); assert.equal(denied.ok, false); assert.deepEqual(denied.species, []); assert.deepEqual(deniedReads, []);
});
test('B1 actual CLI reads/hashes all optional world files and invalid rebuild removes stale cache', async () => {
  const artifacts = process.env.PF55_WORLD_CONTENT_EVIDENCE || path.join(ROOT, 'build/test-world-content'); fs.mkdirSync(artifacts, { recursive: true }); const dir = fs.mkdtempSync(path.join(artifacts, 'world-cli-'));
  const raw = { ...inputs(), ...world() }, out = path.join(dir, 'compiled.json'); raw.species = []; raw.encounters.tables = [];
  const filename = key => ({ regionMaps: 'region-maps', mapConnections: 'map-connections' }[key] || key) + '.json'; for (const [key, value] of Object.entries(raw)) fs.writeFileSync(path.join(dir, filename(key)), JSON.stringify(value));
  const cli = process.env.PF55_CONTENT_CLI || path.join(ROOT, 'js/engine/build/content-cli.cjs'), run = command => spawnSync(process.execPath, [cli, command, '--src=' + dir, '--out=' + out], { encoding: 'utf8' });
  let result = run('build'); fs.writeFileSync(path.join(dir, 'first-build.log'), result.stdout + result.stderr); assert.equal(result.status, 0, result.stderr); const first = JSON.parse(fs.readFileSync(out)); assert.equal(first.schema, 5); assert.ok(first.world.regionMaps); assert.ok(first.world.mapConnections); assert.ok(first.world.encounters);
  raw.regionMaps.regions[0].nameKey = 'region.changed'; fs.writeFileSync(path.join(dir, 'region-maps.json'), JSON.stringify(raw.regionMaps)); assert.equal(run('check').status, 1); assert.equal(run('build').status, 0); assert.notEqual(JSON.parse(fs.readFileSync(out)).inputsHash, first.inputsHash);
  raw.encounters.source = 'missing'; fs.writeFileSync(path.join(dir, 'encounters.json'), JSON.stringify(raw.encounters)); result = run('build'); fs.writeFileSync(path.join(dir, 'invalid-build.log'), result.stdout + result.stderr); assert.equal(result.status, 1); assert.equal(fs.existsSync(out), false); assert.match(result.stderr, /encounters.json.*source/);
});
test('B1 shipped sample builds against real staged data with canonical wild pool and formal world envelopes', () => {
  const artifacts = process.env.PF55_WORLD_CONTENT_EVIDENCE || path.join(ROOT, 'build/test-world-content'); fs.mkdirSync(artifacts, { recursive: true }); const dir = fs.mkdtempSync(path.join(artifacts, 'world-sample-'));
  const cli = process.env.PF55_CONTENT_CLI || path.join(ROOT, 'js/engine/build/content-cli.cjs'), out = path.join(dir, 'sample-content.json');
  const result = spawnSync(process.execPath, [cli, 'build', '--src=' + path.join(ROOT, 'content/sample'), '--out=' + out], { encoding: 'utf8' }); fs.writeFileSync(path.join(dir, 'sample-build.log'), result.stdout + result.stderr); assert.equal(result.status, 0, result.stderr);
  const cache = JSON.parse(fs.readFileSync(out)); assert.equal(cache.schema, 5); assert.deepEqual(cache.species.find(sp => sp.id === 'pidgey').wildItemCommon, ['oranberry']);
  assert.equal(cache.world.encounters.source, 'author-placeholder'); assert.ok(cache.world.regionMaps.regions.length); assert.ok(cache.world.mapConnections.connections.length);
  // Map005 retains the old note path; the formal sample table must not create a simultaneous second path there.
  assert.ok(cache.world.encounters.tables.every(table => table.mapId !== 5));
});
