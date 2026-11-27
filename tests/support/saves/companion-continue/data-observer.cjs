'use strict';
// Observation only, for the explicitly trusted JSON fixture realms. This never
// invokes event(), JSON serialization hooks, accessors or an arbitrary prototype.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {types: {isProxy}} = require('node:util');

function ownData(object, key) {
  assert(object !== null && typeof object === 'object', 'OBS_OBJECT_REQUIRED');
  assert.equal(isProxy(object), false, 'OBS_PROXY_REJECTED');
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  assert(descriptor && Object.hasOwn(descriptor, 'value'), 'OBS_OWN_DATA_REQUIRED: ' + key);
  return descriptor.value;
}

function trustedRealms(context) {
  return {objects: [Object.prototype, vm.runInContext('Object.prototype', context)],
    arrays: [Array.prototype, vm.runInContext('Array.prototype', context)]};
}

function snapshot(value, realms) {
  const seen = new Map();
  function visit(input) {
    if (input === null) return {type: 'null'};
    const type = typeof input;
    if (type === 'undefined') return {type};
    if (type === 'boolean' || type === 'string') return {type, value: input};
    if (type === 'number') return {type, value: Object.is(input, -0) ? '-0' : String(input)};
    assert.equal(type, 'object', 'OBS_NON_DATA_' + type);
    // Node's native isProxy does not run Proxy traps, even for revoked proxies.
    assert.equal(isProxy(input), false, 'OBS_PROXY_REJECTED');
    if (seen.has(input)) return {reference: seen.get(input)};
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    assert((array ? realms.arrays : realms.objects).includes(prototype), 'OBS_UNTRUSTED_PROTOTYPE');
    const id = seen.size;
    seen.set(input, id);
    const fields = [];
    for (const key of Reflect.ownKeys(input)) {
      assert.equal(typeof key, 'string', 'OBS_SYMBOL_KEY');
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      assert(descriptor && Object.hasOwn(descriptor, 'value'), 'OBS_ACCESSOR_REJECTED');
      assert.notEqual(key, 'toJSON', 'OBS_TOJSON_REJECTED');
      fields.push({key, enumerable: descriptor.enumerable, configurable: descriptor.configurable,
        writable: descriptor.writable, value: visit(descriptor.value)});
    }
    return {id, type: array ? 'Array' : 'Object', fields};
  }
  return visit(value);
}

function captureSource({G, application, generation, map, mapId, eventIds, realms}) {
  const data = ownData(G, '$dataMap'), events = ownData(data, 'events'), nativeEvents = ownData(map, '_events');
  assert.equal(ownData(map, '_mapId'), mapId);
  const rows = eventIds.map(eventId => {
    const event = ownData(nativeEvents, String(eventId)), source = ownData(events, String(eventId));
    assert.equal(ownData(event, '_eventId'), eventId);
    assert.equal(ownData(event, '_mapId'), mapId);
    return {eventId, event, source, before: snapshot(source, realms)};
  });
  return {application, generation, map, mapId, data, events, nativeEvents, rows, before: snapshot(data, realms)};
}

function assertSourceUnchanged(source, realms) {
  assert.strictEqual(ownData(source.data, 'events'), source.events, 'old data owns its original events array');
  assert.strictEqual(ownData(source.map, '_events'), source.nativeEvents, 'old native map keeps its original event array');
  assert.equal(ownData(source.map, '_mapId'), source.mapId);
  for (const row of source.rows) {
    assert.strictEqual(ownData(source.nativeEvents, String(row.eventId)), row.event);
    assert.equal(ownData(row.event, '_eventId'), row.eventId);
    assert.equal(ownData(row.event, '_mapId'), source.mapId);
    assert.strictEqual(ownData(source.events, String(row.eventId)), row.source);
    assert.deepEqual(snapshot(row.source, realms), row.before, 'original source events are not mutated by teardown');
  }
  assert.deepEqual(snapshot(source.data, realms), source.before, 'original source map data remains unchanged');
}

function expectedLoadedMap(responseText) {
  // The response is an actual XHR string. JSON.parse cannot invoke an input hook.
  const data = JSON.parse(responseText);
  assert(data && typeof data === 'object' && Array.isArray(data.events));
  // Independent expectation for the pinned DataManager.onLoad map branch and
  // extractMetadata rule (reactor_managers.js), not a call to that native method.
  function metadata(row) {
    const note = ownData(row, 'note');
    assert.equal(typeof note, 'string', 'fixture note must be JSON text');
    const meta = {}, pattern = /<([^<>:]+)(:?)([^>]*)>/g;
    for (let match; (match = pattern.exec(note));) {
      // This fixture has ordinary metadata names, not Object.prototype setters.
      assert(!['__proto__', 'constructor', 'prototype'].includes(match[1]), 'unsupported fixture metadata name');
      Object.defineProperty(meta, match[1], {value: match[2] === ':' ? match[3] : true,
        writable: true, enumerable: true, configurable: true});
    }
    Object.defineProperty(row, 'meta', {value: meta, writable: true, enumerable: true, configurable: true});
  }
  metadata(data);
  for (const row of data.events) if (row !== null && Object.hasOwn(row, 'note')) metadata(row);
  return data;
}

function observeMapLoads(G, readIdentity) {
  const rows = [], original = G.DataManager.onXhrLoad;
  G.DataManager.onXhrLoad = function(xhr, name, src, url) {
    const selected = name === '$dataMap';
    const input = selected ? {responseText: ownData(xhr, 'responseText'), status: ownData(xhr, 'status'), src, url} : null;
    const result = Reflect.apply(original, this, [xhr, name, src, url]);
    if (selected && input.status < 400) rows.push({...input, ...readIdentity(), data: ownData(G, '$dataMap')});
    return result;
  };
  return rows;
}

function assertLoadedSource({G, application, generation, physicalMapId, producer, source, loads, loadStart, realms}) {
  const map = ownData(G, '$gameMap'), data = ownData(G, '$dataMap');
  assert.strictEqual(application, source.application);
  assert.equal(generation, source.generation + 1);
  assert.equal(physicalMapId, producer.source.map);
  assert.equal(ownData(map, '_mapId'), physicalMapId, 'current map matches the actual physical save map id');
  assert.notStrictEqual(map, source.map, 'formal load installs a new native map');
  assert.notStrictEqual(data, source.data, 'formal XHR installs independent current data');
  const matching = loads.slice(loadStart).filter(row => row.data === data);
  assert.equal(matching.length, 1, 'current data comes from one actual post-load map XHR');
  const row = matching[0], filename = 'Map' + String(physicalMapId).padStart(3, '0') + '.json';
  assert.equal(row.src, filename); assert.equal(row.url, 'data/' + filename);
  assert.strictEqual(row.application, application); assert.equal(row.generation, generation);
  assert.strictEqual(row.map, map);
  const transported = JSON.parse(row.responseText);
  assert.deepEqual(snapshot(transported, realms), snapshot(ownData(producer.maps, String(physicalMapId)), realms),
    'actual current XHR bytes carry this P00 producer map, independently of old source data');
  assert.deepEqual(snapshot(data, realms), snapshot(expectedLoadedMap(row.responseText), realms),
    'current loaded data matches this XHR plus pinned metadata processing');
  const nativeEvents = ownData(map, '_events'), events = ownData(data, 'events');
  for (const old of source.rows) {
    const current = ownData(nativeEvents, String(old.eventId));
    assert.equal(ownData(current, '_eventId'), old.eventId);
    assert.equal(ownData(current, '_mapId'), physicalMapId);
    assert.notStrictEqual(current, old.event);
    assert.deepEqual(snapshot(ownData(events, String(old.eventId)), realms),
      snapshot(ownData(ownData(expectedLoadedMap(row.responseText), 'events'), String(old.eventId)), realms));
  }
}

module.exports = {ownData, trustedRealms, snapshot, captureSource, assertSourceUnchanged,
  expectedLoadedMap, observeMapLoads, assertLoadedSource};
