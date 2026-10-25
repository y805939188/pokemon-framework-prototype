'use strict';
// Formal-spec-derived candidate expectations (WP30 §6.3; GR-49/50), not reference runtime observations.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
const source = resolve(__dirname, '../../../src/framework/rules/learning.ts');
const rules = import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(source, 'utf8'), {sourceUrl: source})).toString('base64'));
const options = (moreMoves = false, shadow = false) => ({moreMoves, shadow});
const member = (extra = {}) => ({level:5, moves:[], firstMoves:[], ...extra});
const move = (level, id) => ({level, id});

test('P53-14 inclusive current level, level zero and future level boundaries', async () => {
  const {relearningCandidates} = await rules;
  const catalog = [move(0,'evolution'), move(1,'tackle'), move(4,'growl'), move(5,'vinewhip'), move(6,'razorleaf')];
  assert.deepEqual(relearningCandidates(member(), catalog, options()), ['evolution','tackle','growl','vinewhip']);
  assert.deepEqual(relearningCandidates(member({level:1}), catalog, options()), ['evolution','tackle']);
  assert.deepEqual(relearningCandidates(member({level:6}), catalog, options()), ['evolution','tackle','growl','vinewhip','razorleaf']);
});

test('P53-14 current known identities are filtered regardless of PP and slot order', async () => {
  const {relearningCandidates} = await rules;
  const m = member({moves:[{id:'growl',pp:0,maxpp:40,ppUps:0},{id:'tackle',pp:7,maxpp:56,ppUps:3}], firstMoves:['tackle','amnesia','growl']});
  assert.deepEqual(relearningCandidates(m, [move(1,'tackle'),move(3,'growl'),move(5,'vinewhip')], options(true)), ['amnesia','vinewhip']);
});

test('P53-14 duplicates keep first eligible table position, not the latest occurrence', async () => {
  const {relearningCandidates} = await rules;
  const catalog = [move(1,'tackle'),move(1,'growl'),move(3,'tackle'),move(3,'vinewhip'),move(5,'growl')];
  assert.deepEqual(relearningCandidates(member(), catalog, options()), ['tackle','growl','vinewhip']);
});

test('P53-14 first records precede levels only when enabled; overlaps keep level position', async () => {
  const {relearningCandidates} = await rules;
  const m = member({firstMoves:['growl','amnesia','amnesia','curse','tackle']});
  const catalog = [move(1,'tackle'),move(2,'growl'),move(3,'vinewhip')];
  assert.deepEqual(relearningCandidates(m, catalog, options(false)), ['tackle','growl','vinewhip']);
  assert.deepEqual(relearningCandidates(m, catalog, options(true)), ['amnesia','curse','tackle','growl','vinewhip']);
});

test('P53-14 more than four first records survive with order and input duplicates intact', async () => {
  const {relearningCandidates} = await rules;
  const firstMoves = ['amnesia','curse','ingrain','petaldance','skullbash','naturepower','charm','amnesia'];
  const m = member({firstMoves});
  assert.deepEqual(relearningCandidates(m, [move(1,'tackle')], options(true)), [...firstMoves.slice(0,7),'tackle']);
  assert.deepEqual(m.firstMoves, ['amnesia','curse','ingrain','petaldance','skullbash','naturepower','charm','amnesia']);
});

test('P53-14 canonical duplicate identity across known, records and multiple levels is emitted once', async () => {
  const {relearningCandidates} = await rules;
  const m = member({moves:[{id:'tackle'},{id:'tackle'}], firstMoves:['tackle','growl','growl','amnesia','amnesia']});
  assert.deepEqual(relearningCandidates(m, [move(1,'growl'),move(2,'growl'),move(3,'tackle')], options(true)), ['amnesia','growl']);
});

test('P53-14 future level entry does not suppress an actual first record', async () => {
  const {relearningCandidates} = await rules;
  assert.deepEqual(relearningCandidates(member({firstMoves:['razorleaf','amnesia']}), [move(1,'tackle'),move(6,'razorleaf')], options(true)), ['razorleaf','amnesia','tackle']);
});

test('P53-14 GR-49 all four controls use recorded moves, never the full species egg table', async () => {
  const {relearningCandidates} = await rules;
  // Amnesia is a species egg move but is not a level candidate at L5. Only an actual record may add it.
  const catalog = [move(1,'tackle'),move(1,'growl'),move(3,'vinewhip')];
  for (const moreMoves of [false,true]) for (const firstMoves of [[],['amnesia']]) {
    const m = member({moves:[{id:'tackle'},{id:'growl'},{id:'vinewhip'}], firstMoves});
    assert.deepEqual(relearningCandidates(m, catalog, options(moreMoves)), moreMoves && firstMoves.length ? ['amnesia'] : []);
  }
});

test('P53-14 GR-50 all-known Caterpie/Magikarp return an ordinary empty candidate list', async () => {
  const {relearningCandidates} = await rules;
  for (const ids of [['tackle','stringshot'], ['splash']]) {
    const m = member({level:1,moves:ids.map(id=>({id}))});
    assert.deepEqual(relearningCandidates(m, ids.map(id=>move(1,id)), options(true)), []);
  }
});

test('P53-14 zero current moves and missing first records remain valid inputs', async () => {
  const {relearningCandidates} = await rules;
  const m = {level:1,moves:[]};
  assert.deepEqual(relearningCandidates(m, [], options(true)), []);
  assert.deepEqual(relearningCandidates(m, [move(1,'tackle'),move(1,'stringshot')], options(true)), ['tackle','stringshot']);
});

test('P53-14 absent, egg and explicit Shadow members have no candidates', async () => {
  const {relearningCandidates} = await rules;
  const catalog = [move(1,'tackle')];
  for (const m of [undefined,null,member({isEgg:true})]) assert.deepEqual(relearningCandidates(m, catalog, options(true)), []);
  assert.deepEqual(relearningCandidates(member({firstMoves:['amnesia']}), catalog, options(true,true)), []);
});

test('P53-14 authoritative resolved catalog order is retained for moves at the same level', async () => {
  const {relearningCandidates} = await rules;
  assert.deepEqual(relearningCandidates(member(), [move(1,'growl'),move(1,'tackle'),move(1,'vinewhip')], options()), ['growl','tackle','vinewhip']);
});

test('P53-14 frozen inputs stay byte-equivalent and output mutation cannot change candidates', async () => {
  const {relearningCandidates} = await rules;
  const m = Object.freeze({level:5,moves:Object.freeze([Object.freeze({id:'tackle',pp:0,maxpp:35,ppUps:0})]),firstMoves:Object.freeze(['amnesia','growl','amnesia'])});
  const catalog = Object.freeze([Object.freeze(move(1,'tackle')),Object.freeze(move(2,'growl'))]);
  const config = Object.freeze(options(true));
  const before = JSON.stringify({m,catalog,config});
  const result = relearningCandidates(m, catalog, config);
  assert.deepEqual(result, ['amnesia','growl']);
  result.reverse(); result.push('curse');
  assert.deepEqual(relearningCandidates(m, catalog, config), ['amnesia','growl']);
  assert.equal(JSON.stringify({m,catalog,config}), before);
});
