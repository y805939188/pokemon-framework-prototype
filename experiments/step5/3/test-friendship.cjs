'use strict';
// Formal-spec-derived expectations (WP30 §7; GR-35/36/37/42, R6-U14-GR05), not reference runtime observations.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
// The standalone rules have only type imports. Execute the actual source without modifying a public bundle entry.
const source = resolve(__dirname, '../../../src/framework/rules/friendship.ts');
const rules = import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(source, 'utf8'), {sourceUrl: source})).toString('base64'));
const member = (friendship, extra = {}) => ({friendship, item: '', ...extra});
const context = (AFFECTION_EFFECTS = false, mapId) => ({AFFECTION_EFFECTS, mapId});
const expectedRows = {
  walking: [2, 2, 1], levelup: [5, 4, 3], groom: [10, 10, 4], evberry: [10, 5, 2],
  vitamin: [5, 3, 2], wing: [3, 2, 1], machine: [1, 1, 0], battleitem: [1, 1, 0],
  faint: [-1, -1, -1], faintbad: [-5, -5, -10], powder: [-5, -5, -10],
  energyroot: [-10, -10, -15], revivalherb: [-15, -15, -20],
};

for (const [method, row] of Object.entries(expectedRows)) test('P53-09 full method table and tier boundaries: ' + method, async () => {
  const {planFriendshipChange} = await rules;
  for (const h of [0, 99, 100, 199, 200, 254, 255]) {
    const after = Math.max(0, Math.min(255, h + row[Math.floor(h / 100)]));
    assert.deepEqual(planFriendshipChange(member(h), method, context()), {status: 'ready', method, before: h, after, delta: after - h});
  }
});

test('P53-09 GR-35 map then luxury then floor bell; soft cap applies last', async () => {
  const {planFriendshipChange} = await rules;
  const bonuses = {origin: {map: 7}, ball: 'luxuryball', item: 'soothebell'};
  assert.equal(planFriendshipChange(member(80, bonuses), 'walking', context(false, 7)).after, 86);
  assert.equal(planFriendshipChange(member(99, bonuses), 'vitamin', context(false, 7)).after, 109);
  assert.equal(planFriendshipChange(member(175, bonuses), 'walking', context(true, 7)).after, 179);
  // floor(3*1.5)=4; bonus order is observable for an odd increment.
  assert.equal(planFriendshipChange(member(80, {item: 'soothebell'}), 'wing', context()).delta, 4);
});

test('P53-09 GR-36 179 is only a positive-delta soft limit; evberry is exempt', async () => {
  const {planFriendshipChange} = await rules;
  for (const [h, after] of [[175,177], [178,179], [179,179], [180,180], [200,200], [255,255]]) {
    assert.equal(planFriendshipChange(member(h), 'walking', context(true)).after, after);
  }
  for (const [h, after] of [[178,183], [179,184], [200,202], [254,255], [255,255]]) {
    assert.equal(planFriendshipChange(member(h), 'evberry', context(true)).after, after);
  }
  assert.equal(planFriendshipChange(member(178, {origin:{map:7}, ball:'luxuryball', item:'soothebell'}), 'evberry', context(true,7)).after, 188);
});

test('P53-09 negative methods ignore every positive modifier and soft limit', async () => {
  const {planFriendshipChange} = await rules;
  for (const method of ['faint', 'faintbad', 'powder', 'energyroot', 'revivalherb']) {
    for (const h of [0, 80, 179, 200, 250]) {
      const after = Math.max(0, h + expectedRows[method][Math.floor(h / 100)]);
      const m = member(h, {origin: {map: 7}, ball: 'luxuryball', item: 'soothebell'});
      assert.equal(planFriendshipChange(m, method, context(true, 7)).after, after);
    }
  }
});

test('P53-09 zero machine/battleitem increments do not acquire positive bonuses', async () => {
  const {planFriendshipChange} = await rules;
  for (const method of ['machine', 'battleitem']) {
    assert.equal(planFriendshipChange(member(200, {origin: {map: 7}, ball: 'luxuryball', item: 'soothebell'}), method, context(false, 7)).delta, 0);
  }
});

test('P53-09 unknown current/obtained maps never match each other; known map zero does', async () => {
  const {planFriendshipChange} = await rules;
  for (const origin of [undefined, {map: null}]) for (const mapId of [undefined, null, 7]) {
    assert.equal(planFriendshipChange(member(80, {origin}), 'walking', context(false, mapId)).delta, 2);
  }
  assert.equal(planFriendshipChange(member(80, {origin: {map: 7}}), 'walking', context(false)).delta, 2);
  assert.equal(planFriendshipChange(member(80, {origin: {map: 7}}), 'walking', context(false, 8)).delta, 2);
  assert.equal(planFriendshipChange(member(80, {origin: {map: 0}}), 'walking', context(false, 0)).delta, 3);
});

test('P53-09 ball and held item match stable identities, with existing case handling', async () => {
  const {planFriendshipChange} = await rules;
  assert.equal(planFriendshipChange(member(80, {ball:'LUXURYBALL', item:'SOOTHEBELL'}), 'walking', context()).delta, 4);
  assert.equal(planFriendshipChange(member(80, {ball:'friendball', item:''}), 'walking', context()).delta, 2);
  assert.equal(planFriendshipChange(member(80, {ball:'Luxury Ball', item:'Soothe Bell'}), 'walking', context()).delta, 2);
});

test('P53-09 unknown and prototype-looking method names are explicitly refused', async () => {
  const {planFriendshipChange} = await rules;
  for (const method of ['', 'WALKING', 'unknown', '__proto__', 'constructor', 'toString']) {
    assert.deepEqual(planFriendshipChange(member(80), method, context()), {status:'refused', reason:'unknown-friendship-method', method});
  }
});

test('P53-09 author 256 stays out of domain; 255 is a normal calculation input', async () => {
  const {planFriendshipChange, deriveAffection} = await rules;
  for (const h of [256, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const m = Object.freeze(member(h));
    for (const method of Object.keys(expectedRows)) {
      assert.deepEqual(planFriendshipChange(m, method, context()), {status:'refused', reason:'friendship-out-of-domain', value:h});
    }
    assert.deepEqual(deriveAffection(m), {status:'refused', reason:'friendship-out-of-domain', value:h});
    assert.ok(Object.is(m.friendship, h));
  }
  assert.equal(planFriendshipChange(member(255), 'faintbad', context()).after, 245);
  assert.equal(planFriendshipChange(member(255), 'walking', context()).after, 255);
});

test('P53-09 GR-42 affection is derived at every tier edge without a second field', async () => {
  const {deriveAffection} = await rules;
  for (const [h, affection] of [[0,0],[99,0],[100,1],[149,1],[150,2],[199,2],[200,3],[229,3],[230,4],[254,4],[255,5]]) {
    const m = Object.freeze(member(h));
    assert.deepEqual(deriveAffection(m), {status:'ready', affection});
    assert.deepEqual(Object.keys(m), ['friendship','item']);
  }
});

test('P53-09 existing missing friendship fallback and frozen inputs are never installed', async () => {
  const {planFriendshipChange, deriveAffection} = await rules;
  const m = Object.freeze({item:'soothebell', ball:'luxuryball', origin:Object.freeze({map:7})});
  const c = Object.freeze(context(false, 7));
  const before = JSON.stringify({m,c});
  const result = planFriendshipChange(m, 'walking', c);
  assert.deepEqual(result, {status:'ready', method:'walking', before:70, after:76, delta:6});
  result.after = 0;
  assert.equal(planFriendshipChange(m, 'walking', c).after, 76);
  assert.deepEqual(deriveAffection(m), {status:'ready', affection:0});
  assert.equal(JSON.stringify({m,c}), before);
});
