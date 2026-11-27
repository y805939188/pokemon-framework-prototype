'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const {snapshot, trustedRealms, captureSource, assertSourceUnchanged, expectedLoadedMap,
  observeMapLoads, assertLoadedSource} = require('./data-observer.cjs');
const context = vm.createContext({}), realms = trustedRealms(context), snap = value => snapshot(value, realms);
const same = (left, right) => assert.deepEqual(snap(left), snap(right));
const different = (left, right) => assert.throws(() => same(left, right), {code: 'ERR_ASSERTION'});

test('OBS01 trusted Node and VM JSON data compare with strict typed snapshots', () => {
  const input = {id: 1, enabled: false, text: 'source', pages: [{list: [{code: 0, parameters: []}]}]};
  const current = vm.runInContext('(' + JSON.stringify(input) + ')', context);
  assert.throws(() => assert.deepEqual(input, current), {code: 'ERR_ASSERTION'});
  same(input, current);
});
test('OBS02 primitive types and exact numeric values stay distinct', () => {
  for (const pair of [[1, 2], [1, '1'], [false, 0], [null, undefined], [0, -0], [NaN, null], [Infinity, -Infinity]])
    different({value: pair[0]}, {value: pair[1]});
});
test('OBS03 own key presence and order stay distinct', () => {
  different({x: 1}, {x: 1, y: undefined});
  different({x: 1, y: 2}, {y: 2, x: 1});
});
test('OBS04 all own data descriptor attributes stay distinct', () => {
  for (const key of ['writable', 'enumerable', 'configurable']) {
    const left = {x: 1}, right = {x: 1}; Object.defineProperty(right, 'x', {[key]: false}); different(left, right);
  }
});
test('OBS05 array object length and holes stay distinct', () => {
  for (const pair of [[[1], {'0': 1, length: 1}], [[], [undefined]], [Array(1), [undefined]], [Array(1), Array(2)]])
    different(...pair);
});
test('OBS06 shared references remain different from duplicated records', () => {
  const row = {value: 1}; different({a: row, b: row}, {a: {value: 1}, b: {value: 1}});
});
test('OBS07 cycles and their reference topology are retained', () => {
  const left = {}, right = {}; left.self = left; right.self = right; same(left, right);
  const other = {}; other.self = {self: other}; different(left, other);
});
test('OBS08 null foreign class and mismatched prototypes reject explicitly', () => {
  const foreign = vm.runInNewContext('({x:1})');
  for (const input of [Object.create(null), foreign, new Date(), new (class Record {})(), Object.create({}),
    Object.setPrototypeOf([], Object.prototype), Object.setPrototypeOf({}, Array.prototype)])
    assert.throws(() => snap(input), /OBS_UNTRUSTED_PROTOTYPE/);
});
test('OBS09 getter and setter descriptors reject with zero independent hook calls', () => {
  let getterCalls = 0, setterCalls = 0;
  for (const descriptor of [{get() { getterCalls++; throw Error('GETTER_CALLED'); }},
    {set() { setterCalls++; throw Error('SETTER_CALLED'); }}]) {
    const input = Object.defineProperty({}, 'x', {...descriptor, enumerable: true});
    assert.throws(() => snap(input), /OBS_ACCESSOR_REJECTED/);
  }
  assert.equal(getterCalls, 0); assert.equal(setterCalls, 0);
});
test('OBS10 nested and revoked Proxy reject with zero independent trap calls', () => {
  const counts = {get: 0, ownKeys: 0, getPrototypeOf: 0, getOwnPropertyDescriptor: 0};
  const handler = Object.fromEntries(Object.keys(counts).map(key => [key, () => { counts[key]++; throw Error('TRAP_CALLED'); }]));
  const proxy = new Proxy({x: 1}, handler), revoked = Proxy.revocable({}, handler); revoked.revoke();
  for (const input of [proxy, {nested: proxy}, revoked.proxy]) assert.throws(() => snap(input), /OBS_PROXY_REJECTED/);
  assert.deepEqual(counts, {get: 0, ownKeys: 0, getPrototypeOf: 0, getOwnPropertyDescriptor: 0});
});
test('OBS11 function and toJSON inputs reject with zero independent hook calls', () => {
  let calls = 0; const fn = () => { calls++; throw Error('FUNCTION_CALLED'); };
  assert.throws(() => snap({fn}), /OBS_NON_DATA_function/);
  assert.throws(() => snap({toJSON: fn}), /OBS_TOJSON_REJECTED/);
  assert.equal(calls, 0);
});
test('OBS12 symbol keys values and bigint reject explicitly', () => {
  assert.throws(() => snap({[Symbol('x')]: 1}), /OBS_SYMBOL_KEY/);
  for (const input of [{x: Symbol('x')}, {x: 1n}]) assert.throws(() => snap(input), /OBS_NON_DATA_/);
});

function sources() {
  const application = {}, originalEvent = {_eventId: 1, _mapId: 5};
  let eventCalls = 0;
  originalEvent.event = () => { eventCalls++; throw Error('EVENT_LOOKUP_CALLED'); };
  const oldData = {note: '', data: [], events: [null, {id: 1, note: '', name: 'old-only'}]};
  const map = {_mapId: 5, _events: [null, originalEvent]}, G = {$dataMap: oldData, $gameMap: map};
  const source = captureSource({G, application, generation: 3, map, mapId: 5, eventIds: [1], realms});
  const transported = {note: '<Outdoor><Zone:new>', data: [], events: [null, {id: 1, note: '<Role:current>', name: 'loaded-only'}]};
  const responseText = JSON.stringify(transported), currentData = expectedLoadedMap(responseText);
  const currentMap = {_mapId: 5, _events: [null, {_eventId: 1, _mapId: 5}]};
  G.$dataMap = currentData; G.$gameMap = currentMap;
  const producer = {physicalMapId: 5, source: {map: 5}, maps: {5: transported}};
  const loads = [{src: 'Map005.json', url: 'data/Map005.json', responseText, status: 0,
    application, generation: 4, map: currentMap, data: currentData}];
  const loaded = () => assertLoadedSource({G, application, generation: 4, physicalMapId: producer.physicalMapId,
    producer, source, loads, loadStart: 0, realms});
  return {G, application, source, oldData, currentData, currentMap, producer, loads, loaded, eventCalls: () => eventCalls};
}
test('OBS13 old source and independent loaded map use separate expectations without event lookup', () => {
  const h = sources(); assertSourceUnchanged(h.source, realms); h.loaded(); assert.equal(h.eventCalls(), 0);
  assert.notDeepEqual(snap(h.oldData), snap(h.currentData));
});
test('OBS14 old retained data mutation rejects even while current global data remains correct', () => {
  const h = sources(); h.oldData.events[1].name = 'mutated'; h.loaded();
  assert.throws(() => assertSourceUnchanged(h.source, realms), {code: 'ERR_ASSERTION'}); assert.equal(h.eventCalls(), 0);
});
test('OBS15 current loaded data mutation rejects independently of untouched old source', () => {
  const h = sources(); h.currentData.events[1].name = 'mutated'; assertSourceUnchanged(h.source, realms);
  assert.throws(h.loaded, {code: 'ERR_ASSERTION'}); assert.equal(h.eventCalls(), 0);
});
test('OBS16 producer map generation app and XHR provenance changes reject', () => {
  for (const change of [h => { h.producer.source.map = 6; }, h => { h.loads[0].generation++; },
    h => { h.loads[0].application = {}; }, h => { h.loads[0].map = {}; }, h => { h.loads[0].src = 'Map006.json'; },
    h => { h.loads[0].url = 'data/Map006.json'; }, h => { h.producer.maps[5].events[1].name = 'other-input'; }]) {
    const h = sources(); change(h); assert.throws(h.loaded, {code: 'ERR_ASSERTION'});
  }
});
test('OBS17 source event identity replacement rejects even if data is unchanged', () => {
  const h = sources(); h.source.nativeEvents[1] = {_eventId: 1, _mapId: 5};
  assert.throws(() => assertSourceUnchanged(h.source, realms), {code: 'ERR_ASSERTION'});
});
test('OBS18 XHR observer retains the real call arguments return and installed response reference', () => {
  const currentData = {note: '', data: [], events: []}, map = {_mapId: 5}, application = {}, calls = [];
  const G = {$dataMap: null, DataManager: {onXhrLoad(...args) { calls.push({receiver: this, args}); G.$dataMap = currentData; return 'native-return'; }}};
  const rows = observeMapLoads(G, () => ({application, generation: 4, map}));
  const xhr = {status: 0, responseText: '{"note":"","data":[],"events":[]}'};
  assert.equal(G.DataManager.onXhrLoad(xhr, '$dataMap', 'Map005.json', 'data/Map005.json'), 'native-return');
  assert.equal(calls.length, 1); assert.strictEqual(calls[0].receiver, G.DataManager);
  assert.deepEqual(calls[0].args, [xhr, '$dataMap', 'Map005.json', 'data/Map005.json']);
  assert.strictEqual(rows[0].data, currentData); assert.strictEqual(rows[0].application, application);
});
