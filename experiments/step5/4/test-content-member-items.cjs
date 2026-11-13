'use strict';
// Content admission and the unchanged present-member/save directory must agree.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const E = require('../../../js/engine/build/engine.cjs');
const read = name => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../content/sample', name + '.json'), 'utf8'));
const inputs = () => Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants'].map(name => [name, read(name)]));
const clone = value => structuredClone(value);
const catalog = () => Object.values(E.itemCatalog.legacyCatalog()).map(item => ({ ...item, source: 'author-placeholder' }));
const compile = input => { const result = E.contentCompile.compileContent(input); assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.data; };
const coldDex = () => { let calls = 0; return { dex: new Proxy({}, { get() { calls++; throw Error('unexpected Dex read'); } }), calls: () => calls }; };
const heldPath = /members\[0\]\.item/;

for (const custom of [false, true]) test(`gift directory admission rejects an absent canonical Dex held item (${custom ? 'custom' : 'legacy'} catalog)`, () => {
  const input = inputs(); if (custom) input.items = catalog(); input.grants[0].members[0].item = 'lifeorb';
  assert.equal(E.dex.createDexLookup().heldItem('lifeorb').holdable, true, 'negative input is a real canonical native item');
  const before = clone(input), result = E.contentCompile.compileContent(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.file === 'grants.json' && heldPath.test(e.path) && /catalog/.test(e.message)), JSON.stringify(result.errors));
  assert.deepEqual(input, before);
});

test('cache consumption independently rejects an absent gift item before any Dex lookup', () => {
  const compiled = compile(inputs()); compiled.grants[0].members[0].item = 'lifeorb';
  const before = clone(compiled), probe = coldDex(), result = E.contentRuntime.assembleContent(compiled, probe.dex);
  assert.ok(result.errors.some(e => heldPath.test(e.path) && /catalog/.test(e.message)), JSON.stringify(result.errors));
  assert.equal(probe.calls(), 0); assert.deepEqual(compiled, before);
});

for (const mode of ['missing', 'wrong-use', 'alias-only', 'prototype']) test(`species content rejects an unusable default pokeball: ${mode}`, () => {
  const input = inputs(); input.grants = []; input.items = catalog().filter(item => item.id !== 'pokeball');
  if (mode === 'wrong-use') input.items.push({ id: 'pokeball', source: 'author-placeholder' });
  if (mode === 'alias-only') input.items.push({ id: 'author-ball', battleUse: 'ball', battleId: 'pokeball', legacyIds: ['pokeball'], source: 'author-placeholder' });
  if (mode === 'prototype') Object.setPrototypeOf(input.items, Object.assign(Object.create(Array.prototype), { pokeball: { id: 'pokeball', battleUse: 'ball' } }));
  const result = E.contentCompile.compileContent(input); assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.file === 'items.json' && e.path === '$.pokeball' && /default.*ball/.test(e.message)), JSON.stringify(result.errors));
});

test('cache consumption independently checks the default ball before any Dex lookup', () => {
  for (const wrong of [undefined, 'none']) {
    const compiled = compile(inputs()); compiled.items = catalog().filter(item => item.id !== 'pokeball');
    if (wrong) compiled.items.push({ id: 'pokeball', battleUse: wrong, source: 'author-placeholder' });
    const before = clone(compiled), probe = coldDex(), result = E.contentRuntime.assembleContent(compiled, probe.dex);
    assert.ok(result.errors.some(e => /pokeball/.test(e.path) && /default.*ball/.test(e.message)), JSON.stringify(result.errors));
    assert.equal(probe.calls(), 0); assert.deepEqual(compiled, before);
  }
});

test('item-only content needs no default ball and keeps Dex cold', () => {
  const input = inputs(); input.species = []; input.overlays = []; input.grants = []; input.items = [];
  const probe = coldDex(), result = E.contentRuntime.assembleContent(compile(input), probe.dex);
  assert.deepEqual(result.errors, []); assert.equal(probe.calls(), 0); assert.deepEqual(result.content.items, {});
});

test('registered held gift compiles, reloads, receives once, and satisfies the unchanged save gate', () => {
  const input = inputs(); input.items = catalog(); input.items.push({ id: 'lifeorb', source: 'author-placeholder' }); input.grants[0].members[0].item = 'lifeorb';
  const compiled = E.contentRuntime.loadCompiled(clone(compile(input))), dex = E.dex.createDexLookup();
  const assembled = E.contentRuntime.assembleContent(compiled, dex); assert.deepEqual(assembled.errors, []);
  const content = assembled.content, state = E.fakes.createMemoryState(E.state.newGame({ content, party: [] })); let draws = 0;
  const app = new E.app.GameApplication({ state, content: () => ({ content, dex }), sessions: E.fakes.createFakeSessions({}), projection: E.fakes.createRecordingProjection(), random: () => { draws++; return 0; }, clock: () => 1000 }, { receivingProfile: { mode: 1, naming: 1 } });
  assert.equal(app.claimGrant('starter').status, 'applied'); const count = draws;
  assert.equal(state.current().party[0].item, 'lifeorb'); assert.equal(state.current().party[0].ball, 'pokeball');
  assert.equal(app.claimGrant('starter').status, 'already-claimed'); assert.equal(draws, count); assert.equal(state.replaced.length, 1);
  assert.deepEqual(E.saveSchema.validateGameContent(state.current(), content), []);
  const absentHeld = clone(content); delete absentHeld.items.lifeorb;
  assert.ok(E.saveSchema.validateGameContent(state.current(), absentHeld).some(e => e.path.endsWith('.item')));
  const absentBall = clone(content); delete absentBall.items.pokeball;
  assert.ok(E.saveSchema.validateGameContent(state.current(), absentBall).some(e => e.path.endsWith('.ball')));
});
