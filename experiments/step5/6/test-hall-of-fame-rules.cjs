'use strict';

const assert = require('node:assert/strict');
const {before, test} = require('node:test');
require('../../../scripts/tests/ts-source-loader.cjs');

let empty, register, snapshot;
before(async () => {
  ({emptyHallOfFame: empty, registerHallOfFame: register, snapshotHallOfFame: snapshot} =
    await import('../../../src/framework/rules/hall-of-fame.ts'));
});

function liveMember(n, extra = {}) {
  return {
    id: 'live-' + n, species: 'fixture-species', form: 2, nickname: 'Member ' + n,
    gender: 'F', level: 30 + n, owner: {id: 0x12340009, name: 'Test Owner'},
    shiny: true, superShiny: false, isEgg: false, hp: 40, item: 'fixture-item',
    moves: [{id:'fixture-move',pp:10}], ...extra,
  };
}

const numbers = view => view.entries.map(entry => entry.number);
const add = (history, n, limit) => register(history, [liveMember(n)], limit);

test('registers display values in party order including eggs, without retaining live member state', () => {
  const first = liveMember(1);
  const egg = liveMember(2, {isEgg:true});
  const party = [first, egg], initial = empty();
  const history = register(initial, party);
  first.nickname = 'Changed';
  first.level++;
  first.species = 'different-species';
  first.owner.id = 1;
  first.moves[0].pp = 1;
  egg.isEgg = false;
  party.splice(0,2,liveMember(3));
  const view = snapshot(history);
  assert.deepEqual(initial, {entryCount:0,entries:[]});
  assert.equal(history.entryCount, 1);
  assert.deepEqual(view, {entryCount:1,entries:[{number:1,members:[
    {species:'fixture-species',form:2,nickname:'Member 1',gender:'F',level:31,publicId:'00009',shiny:true,superShiny:false,isEgg:false},
    {species:'fixture-species',form:2,nickname:'Member 2',gender:'F',level:32,publicId:'?????',shiny:true,superShiny:false,isEgg:true},
  ]}]});
});

test('repeated parties make distinct entries and a viewer cannot mutate the source', () => {
  const party = [liveMember(1,{form:undefined,nickname:undefined,owner:undefined})];
  const first = register(empty(), party);
  const view = snapshot(first);
  const second = register(first, party);
  assert.equal(second.entryCount, 2);
  assert.deepEqual(numbers(snapshot(second)), [1,2]);
  assert.deepEqual(second.entries[0], second.entries[1]);
  assert.notEqual(second.entries[0][0], second.entries[1][0]);
  assert.notEqual(first.entries[0], view.entries[0].members);
  assert.notEqual(first.entries[0][0], view.entries[0].members[0]);
  assert.equal(view.entries[0].members[0].form, 0);
  assert.equal(view.entries[0].members[0].publicId, null);
  view.entries[0].members[0].nickname = 'Viewer local change';
  assert.equal(snapshot(first).entries[0].members[0].nickname, null);
  assert.deepEqual(numbers(view), [1]);
});

test('default limit retains only the newest 50 and the first ordinal is derived from the total', () => {
  let history = empty();
  for (let n = 1; n <= 51; n++) history = add(history, n);
  const view = snapshot(history);
  assert.equal(view.entryCount, 51);
  assert.equal(view.entries.length, 50);
  assert.equal(view.entries[0].number, 2);
  assert.equal(view.entries[0].members[0].nickname, 'Member 2');
  assert.equal(view.entries.at(-1).number, 51);
  assert.equal(view.entries.at(-1).members[0].nickname, 'Member 51');
});

test('negative limit retains every entry and lowering a positive limit removes only one on registration', () => {
  let history = empty();
  for (let n = 1; n <= 52; n++) history = add(history, n, -1);
  assert.equal(snapshot(history).entries.length, 52);
  assert.equal(snapshot(history).entries[0].number, 1);
  const next = snapshot(add(history, 53, 1));
  assert.equal(next.entryCount, 53);
  assert.equal(next.entries.length, 52);
  assert.equal(next.entries[0].number, 2);
  assert.equal(next.entries.at(-1).number, 53);
});

test('zero limit from empty retains no entries but advances the count on every registration', () => {
  const initial = empty(), once = add(initial, 1, 0), twice = add(once, 2, 0);
  assert.deepEqual(snapshot(initial), {entryCount:0,entries:[]});
  assert.deepEqual(snapshot(once), {entryCount:1,entries:[]});
  const view = snapshot(twice);
  assert.deepEqual(view, {entryCount:2,entries:[]});
  assert.equal(view.entries.at(-1), undefined);
  assert.deepEqual(numbers(snapshot(add(twice, 3, 2))), [3]);
});

test('zero limit on existing history replaces one oldest entry instead of clearing the archive', () => {
  const history = add(add(empty(), 1), 2);
  const view = snapshot(add(history, 3, 0));
  assert.equal(view.entryCount, 3);
  assert.deepEqual(numbers(view), [2,3]);
  assert.deepEqual(view.entries.map(e => e.members[0].nickname), ['Member 2','Member 3']);
  assert.deepEqual(numbers(snapshot(history)), [1,2]);
});
