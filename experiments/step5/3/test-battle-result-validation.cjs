'use strict';
// Finite v1 structural checks only. A passing value still needs fresh primary planning.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
require('../../../scripts/tests/ts-source-loader.cjs');
const vm = require('node:vm');
const golden = require('../../step3/fixtures/result-hash-golden.json');
const frozen = require('../../../docs/step2/protocol-v1.frozen.json');
const S = require('../../../src/framework/rules/state.ts');
const source = resolve(__dirname, '../../../src/framework/rules/battle-result-validation.ts');
const rules = import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(source, 'utf8'), {sourceUrl: source})).toString('base64'));
const copy = value => JSON.parse(JSON.stringify(value));
const raw = () => ({protocol: 1, battleId: 'battle', outcome: {kind: 'run', winner: null}, members: {}, bag: {}, captured: [], dex: {seen: [], owned: []}});
const capture = () => copy(golden.entries.find(entry => entry.name === 'caught with master ball').result);
const invalid = (check, value, expected = /invalid battle result/) => assert.throws(() => check(value), expected);

test('all frozen real harness and historical hash vectors retain the exact received value and hash', async () => {
  const {assertBattleResultShape: check} = await rules;
  for (const entry of golden.entries) {
    const result = copy(entry.result), before = copy(result);
    check(result);
    assert.deepEqual(result, before, entry.name);
    assert.equal(S.resultHash(result), entry.hash, entry.name);
  }
});

test('current protocolMember projection has exactly the frozen fields and no persistent metadata', async () => {
  const {assertBattleResultShape: check} = await rules;
  const result = capture();
  result.captured[0] = S.protocolMember({...result.captured[0], form: 9, owner: {name: 'Original'}, shiny: true, cannotTrade: true});
  assert.deepEqual(Object.keys(result.captured[0]).sort(), frozen.capturedMemberKeys);
  assert.equal(result.captured[0].ot, 'Original');
  check(result);
});

test('partial patches, optional omissions, PartialStats and safe friendship beyond 255 preserve compatibility', async () => {
  const {assertBattleResultShape: check} = await rules;
  const result = capture();
  result.members = {'A-0001': {friendship: Number.MAX_SAFE_INTEGER, evs: {atk: 1}}};
  // PartialStats is an existing v1 type. This says nothing about whether replacing a saved
  // block with it forms a valid next state: fresh primary planning owns that decision.
  result.captured[0].ivs = {hp: 31};
  result.captured[0].evs = {};
  check(result);
  for (const key of ['nickname', 'statusCount', 'ivs', 'evs', 'friendship', 'ball', 'ot']) delete result.captured[0][key];
  result.money = -10;
  check(result);
  for (const key of ['nickname', 'statusCount', 'ivs', 'evs', 'friendship', 'ball', 'ot']) {
    const bad = copy(result); bad.captured[0][key] = undefined; invalid(check, bad);
  }
});

test('each field uses its existing id domain, including constructor and unrestricted nonempty battle IDs', async () => {
  const {assertBattleResultShape: check} = await rules;
  for (const battleId of ['constructor', '@battle/😀', '__proto__', ' ', 'battle'.repeat(100)]) {
    const result = raw(); result.battleId = battleId;
    result.members = {constructor: {hp: 1}, ['__proto__']: {friendship: 300}};
    result.bag = {constructor: -1};
    check(result);
  }
  const result = capture(); result.outcome.target = result.captured[0].id = '__proto__'; check(result);
  result.dex = {seen: ['Species @ Form'], owned: ['constructor']}; check(result);
  for (const change of [r => r.battleId = '', r => r.battleId = 1, r => r.members = {'@bad': {}}, r => r.bag = {'@bad': -1}]) {
    const bad = raw(); change(bad); invalid(check, bad);
  }
});

test('required root, outcome, capture, move and dex fields reject before downstream work', async () => {
  const {assertBattleResultShape: check} = await rules;
  for (const key of frozen.resultKeys) { const bad = raw(); delete bad[key]; invalid(check, bad); }
  for (const key of ['kind', 'winner', 'target', 'ball']) { const bad = capture(); delete bad.outcome[key]; invalid(check, bad); }
  for (const key of ['id', 'species', 'level', 'exp', 'hp', 'status', 'moves', 'item', 'ability', 'nature', 'gender']) {
    const bad = capture(); delete bad.captured[0][key]; invalid(check, bad);
  }
  for (const key of frozen.moveKeys) { const bad = capture(); delete bad.captured[0].moves[0][key]; invalid(check, bad); }
  for (const key of ['seen', 'owned']) { const bad = raw(); delete bad.dex[key]; invalid(check, bad); }
});

test('unknown fields at every finite record and indexed-array extras cannot be washed away', async () => {
  const {assertBattleResultShape: check} = await rules;
  for (const change of [
    r => r.trusted = true,
    r => r.outcome.trusted = true,
    r => r.members['A-0001'].species = 'Pidgey',
    r => r.members['A-0001'].moves[0].ppUps = 0,
    r => r.members['A-0001'].evs.special = 0,
    r => r.captured[0].form = 0,
    r => r.captured[0].owner = {name: 'X'},
    r => r.captured[0].ivs.special = 0,
    r => r.dex.forms = {},
    r => r.dex.seen.extra = 'Pidgey',
  ]) { const bad = capture(); change(bad); invalid(check, bad); }
});

test('dense arrays are required for captures, moves and both dex lists', async () => {
  const {assertBattleResultShape: check} = await rules;
  for (const change of [
    r => delete r.captured[0],
    r => delete r.members['A-0001'].moves[0],
    r => delete r.captured[0].moves[0],
    r => r.dex.seen = new Array(1),
    r => r.dex.owned = new Array(1),
  ]) { const bad = capture(); change(bad); invalid(check, bad, /dense/); }
});

test('numeric ranges, status, nature, gender and primitive types are enforced without current content', async () => {
  const {assertBattleResultShape: check} = await rules;
  for (const change of [
    r => r.protocol = 2,
    r => r.members['A-0001'].level = 101,
    r => r.members['A-0001'].level = 0,
    r => r.members['A-0001'].hp = -1,
    r => r.members['A-0001'].exp = Number.MAX_SAFE_INTEGER + 1,
    r => r.members['A-0001'].statusCount = 0.5,
    r => r.members['A-0001'].friendship = -1,
    r => r.members['A-0001'].status = 'tox',
    r => r.members['A-0001'].moves[0].pp = 999,
    r => r.members['A-0001'].moves[0].maxpp = 0,
    r => r.members['A-0001'].moves.push(...copy(r.members['A-0001'].moves)),
    r => r.members['A-0001'].evs.atk = 256,
    r => r.bag.masterball = 0.5,
    r => r.money = Infinity,
    r => r.captured[0].ivs.atk = 32,
    r => r.captured[0].nature = 'constructor',
    r => r.captured[0].gender = 'unknown',
    r => r.captured[0].nickname = 1,
    r => r.captured[0].item = null,
    r => r.dex.seen = [''],
    r => r.dex.owned = [false],
  ]) { const bad = capture(); change(bad); invalid(check, bad); }
});

test('frozen outcomes and capture IDs are internally consistent without inventing a capture count limit', async () => {
  const {assertBattleResultShape: check} = await rules;
  for (const change of [
    r => r.outcome.kind = 'defeat',
    r => r.outcome.winner = 'Player',
    r => r.outcome.target = 'missing',
    r => r.captured[0].ball = 'pokeball',
    r => r.captured.push(copy(r.captured[0])),
    r => r.members[r.captured[0].id] = {hp: 1},
  ]) { const bad = capture(); change(bad); invalid(check, bad); }
  for (const kind of ['run', 'tie', 'win']) {
    const result = raw(); result.outcome = {kind, winner: kind === 'win' ? 'Foe' : null}; check(result);
    result.outcome.target = 'F1'; invalid(check, result);
  }
  const badWin = raw(); badWin.outcome = {kind: 'win', winner: null}; invalid(check, badWin);
  const several = capture(), second = copy(several.captured[0]); second.id = 'W2-2'; several.captured.push(second);
  check(several); // source/receiving eligibility belongs to fresh primary planning
});

test('ordinary same/cross-realm and null-prototype records pass; class or inherited-data records reject', async () => {
  const {assertBattleResultShape: check} = await rules;
  const foreign = vm.runInNewContext(`(${JSON.stringify(capture())})`); check(foreign);
  const result = raw(); Object.setPrototypeOf(result, null); Object.setPrototypeOf(result.members, null); check(result);
  const inherited = Object.create(raw()); invalid(check, inherited);
  class Result { constructor() { Object.assign(this, raw()); } }
  invalid(check, new Result());
  const altered = capture(); Object.setPrototypeOf(altered.captured[0].moves, Object.create(Array.prototype)); invalid(check, altered);
});

test('getters, own/inherited toJSON, symbols and hidden fields never execute caller code', async () => {
  const {assertBattleResultShape: check} = await rules;
  let calls = 0;
  for (const target of [r => [r, 'battleId'], r => [r.outcome, 'winner'], r => [r.members, 'A-0001'], r => [r.captured[0], 'nickname'], r => [r.captured[0].moves, '0'], r => [r.captured[0].ivs, 'atk']]) {
    const bad = capture(), [owner, key] = target(bad);
    Object.defineProperty(owner, key, {enumerable: true, get() { calls++; throw new Error('getter ran'); }});
    invalid(check, bad);
  }
  for (const hook of [false, true]) {
    const bad = capture();
    Object.defineProperty(bad.captured[0], 'toJSON', hook ? {enumerable: true, get() { calls++; return () => {}; }} : {enumerable: true, value() { calls++; }});
    invalid(check, bad);
  }
  for (const proto of ['Object', 'Array']) {
    const context = vm.createContext({calls: 0});
    const foreign = vm.runInContext(`Object.defineProperty(${proto}.prototype, 'toJSON', {get() { calls++; return () => {}; }}); (${JSON.stringify(capture())})`, context);
    invalid(check, foreign); assert.equal(context.calls, 0);
  }
  const inheritedOptional = vm.runInNewContext(`Object.defineProperty(Object.prototype, 'friendship', {get() { throw new Error('inherited getter ran'); }}); (${JSON.stringify(raw())})`);
  inheritedOptional.members = {P1: vm.runInNewContext('Object.defineProperty(Object.prototype, "friendship", {get() { throw new Error("inherited getter ran"); }}); ({hp: 1})')};
  invalid(check, inheritedOptional, /inherited fields/);
  const hidden = raw(); Object.defineProperty(hidden, 'money', {value: 1}); invalid(check, hidden);
  const symbolic = raw(); symbolic[Symbol('extra')] = 1; invalid(check, symbolic);
  assert.equal(calls, 0);
});
