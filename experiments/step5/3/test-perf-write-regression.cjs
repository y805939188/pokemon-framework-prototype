'use strict';
// Deterministic write-cost guards: no wall-clock budget and no source-string checks.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');
const E = require(path.resolve(__dirname, '../../../js/engine/build/engine.cjs'));
const { world } = require('./fixtures/postbattle/helpers.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => JSON.stringify(value, (_key, data) => data && typeof data === 'object' && !Array.isArray(data)
  ? Object.fromEntries(Object.keys(data).sort().map(key => [key, data[key]])) : data);

function fullWorld() {
  const full = clone(E.fixtures.makeGame()); full.party = full.party.slice(0, 1);
  const member = full.party[0]; let serial = 0;
  for (const box of full.storage.boxes) for (let i = 0; i < box.slots.length; i++) {
    box.slots[i] = { ...clone(member), id: 'SCALE-' + (serial++) };
  }
  const content = clone(E.fixtures.content), state = E.fakes.createMemoryState(full);
  const app = new E.app.GameApplication({ state, sessions: E.fakes.createFakeSessions({}), projection: E.fakes.createRecordingProjection(), content: () => ({ content }), random: () => 0, clock: () => 0 });
  const members = full.party.length + full.storage.boxes.reduce((n, box) => n + box.slots.filter(Boolean).length, 0);
  return { app, state, content, members };
}

function measure(chain) {
  const w = fullWorld(), counts = { memberDescriptorScans: 0, moveDirectoryValues: 0, stateJsonStringifyCalls: 0 };
  const descriptors = Object.getOwnPropertyDescriptors, values = Object.values, stringify = JSON.stringify;
  const isState = value => !!value && typeof value === 'object' && !Array.isArray(value) && value.schema === 7 && Array.isArray(value.party) && !!value.storage && Array.isArray(value.storage.boxes);
  try {
    Object.getOwnPropertyDescriptors = function(value) {
      const result = descriptors.call(this, value);
      if (result && Object.hasOwn(result, 'species') && Object.hasOwn(result, 'moves') && Object.hasOwn(result, 'evolutionReadiness')) counts.memberDescriptorScans++;
      return result;
    };
    Object.values = function(value) { if (value === w.content.moves) counts.moveDirectoryValues++; return values.call(this, value); };
    JSON.stringify = function(value, ...rest) {
      const result = stringify.call(this, value, ...rest);
      if (isState(value) && result !== undefined) counts.stateJsonStringifyCalls++;
      return result;
    };
    const outcome = chain === 'steps' ? w.app.recordSteps(1) : w.app.updatePokedex({ kind: 'view', value: { cursor: 1 } });
    assert.ok(['counted', 'applied', 'unchanged'].includes(outcome.status), JSON.stringify(outcome));
  } finally {
    Object.getOwnPropertyDescriptors = descriptors; Object.values = values; JSON.stringify = stringify;
  }
  return { ...counts, members: w.members };
}

test('P2-1 recordSteps keeps one strong gate without a second member view copy or per-member move directory scans', () => {
  const result = measure('steps'), violations = [];
  assert.equal(result.members, 1201);
  if (result.memberDescriptorScans > 2 * result.members) violations.push(`memberDescriptorScans=${result.memberDescriptorScans}`);
  if (result.moveDirectoryValues > 1) violations.push(`moveDirectoryValues=${result.moveDirectoryValues}`);
  assert.deepEqual(violations, [], JSON.stringify(result));
});

test('P2-1 dex view preserves both strong gates and bounds private snapshot canonicalization', () => {
  const result = measure('dex'), violations = [];
  assert.equal(result.members, 1201);
  if (result.memberDescriptorScans > 4 * result.members) violations.push(`memberDescriptorScans=${result.memberDescriptorScans}`);
  if (result.moveDirectoryValues > 2) violations.push(`moveDirectoryValues=${result.moveDirectoryValues}`);
  if (result.stateJsonStringifyCalls > 12) violations.push(`stateJsonStringifyCalls=${result.stateJsonStringifyCalls}`);
  assert.deepEqual(violations, [], JSON.stringify(result));
});

test('STEP4-DEX-CANONICAL-01 direct private key construction preserves both strong gates and all detached clones', () => {
  const result = measure('dex');
  assert.equal(result.members, 1201);
  assert.equal(result.memberDescriptorScans, 2 * result.members, JSON.stringify(result));
  // Six application clones/comparisons plus one JSON clone inside this suite's memory-state replacement port.
  assert.equal(result.stateJsonStringifyCalls, 7, JSON.stringify(result));
});

function rawWorld() {
  let state = clone(E.fixtures.makeGame()); state.party = state.party.slice(0, 1);
  const content = clone(E.fixtures.content); let writes = 0;
  const app = new E.app.GameApplication({
    state: { read: () => state, replace: next => { writes++; state = clone(next); } },
    sessions: E.fakes.createFakeSessions({}), projection: E.fakes.createRecordingProjection(),
    content: () => ({ content }), random: () => 0, clock: () => 0,
  });
  return { app, content, state: () => state, writes: () => writes };
}

test('P2-1 a same-object in-place content edit is not hidden by an identity cache', () => {
  const w = rawWorld();
  assert.equal(w.app.recordSteps(1).status, 'counted'); assert.equal(w.writes(), 1);
  const id = w.state().party[0].moves[0].id, move = Object.values(w.content.moves).find(value => value.id === id);
  assert(move); move.pp++;
  const before = clone(w.state()), outcome = w.app.recordSteps(1);
  assert.equal(outcome.status, 'refused'); assert.equal(outcome.reason, 'commit-failed');
  assert.equal(w.writes(), 1); assert.deepEqual(w.state(), before);
});

test('P2-1 an externally aliased member damaged in place is rejected with zero replacement', () => {
  const w = rawWorld();
  w.state().party[0].ability = 'missing-from-the-content';
  const before = clone(w.state()), outcome = w.app.recordSteps(1);
  assert.equal(outcome.status, 'refused'); assert.equal(outcome.reason, 'commit-failed');
  assert.equal(w.writes(), 0); assert.deepEqual(w.state(), before);
});

test('P2-1 step writes reject member accessors and JSON hooks without executing them', () => {
  for (const kind of ['accessor', 'toJSON', 'prototype']) {
    const w = rawWorld(), original = w.state(), member = original.party[0]; let calls = 0;
    if (kind === 'accessor') Object.defineProperty(member, 'nickname', { get() { calls++; return null; }, enumerable: true, configurable: true });
    if (kind === 'toJSON') Object.defineProperty(member, 'toJSON', { value() { calls++; return null; }, enumerable: true, configurable: true });
    if (kind === 'prototype') {
      const proto = Object.create(null); Object.defineProperty(proto, 'cannotTrade', { get() { calls++; return true; }, configurable: true });
      delete member.cannotTrade; Object.setPrototypeOf(member, proto);
    }
    const outcome = w.app.recordSteps(1);
    assert.equal(outcome.status, 'refused', kind); assert.equal(outcome.reason, 'commit-failed', kind);
    assert.equal(w.writes(), 0, kind); assert.equal(calls, 0, kind); assert.equal(w.state(), original, kind);
  }
});

test('P2-1 local item negatives remain per-member errors and duplicate move ids keep first base PP', () => {
  const w = rawWorld(), state = w.state();
  state.party[0].item = 'missing-item';
  state.storage.boxes[0].slots[0] = { ...clone(state.party[0]), id: 'OTHER-1' };
  const problems = E.saveSchema.validateGameContent(state, w.content);
  assert.deepEqual(problems.filter(p => p.path.endsWith('.item')).map(p => p.path), ['$.party[0].item', '$.storage.boxes[0].slots[0].item']);

  const good = rawWorld(), member = good.state().party[0], id = member.moves[0].id;
  const first = Object.values(good.content.moves).find(value => value.id === id);
  good.content.moves.Duplicate = { ...first, pp: first.pp + 1 };
  assert.deepEqual(E.saveSchema.validateGameContent(good.state(), good.content), []);
});

function dexWorld(kind) {
  const options = { entries: [] };
  if (kind === 'resolve-summary') Object.assign(options, {
    settings: { DEX_SHOWS_ALL_FORMS: true },
    extraContent: content => {
      content.forms = Object.fromEntries(Object.keys(content.species).map(id => [id, { 0: id }]));
      content.forms.Charizard = { 0: 'Charizard', 1: 'Charizard-Alt' };
      content.species['Charizard-Alt'] = { ...clone(content.species.Charizard), formName: 'Alternate', pokedexForm: 1 };
    },
  });
  const w = world(options), state = clone(w.state.current());
  state.dex.hasDex = kind !== 'begin';
  if (kind === 'begin-summary' || kind === 'resolve-summary') {
    const species = state.party[0].species;
    delete state.dex.lastSeenForm[species];
    if (kind === 'resolve-summary') {
      if (!state.dex.seen.includes(species)) state.dex.seen.push(species);
      state.dex.seenForms[species] = [
        { gender: 0, form: 0, shiny: false }, { gender: 0, form: 1, shiny: false },
      ];
    }
  }
  if (kind === 'resolve-entry') {
    if (!state.dex.seen.includes('Pidgey')) state.dex.seen.push('Pidgey');
    state.dex.owned = state.dex.owned.filter(id => id !== 'Pidgey');
    state.dex.seenForms.Pidgey = [{ gender: 0, form: 0, shiny: true }];
    state.dex.lastSeenForm.Pidgey = { gender: 0, form: 0, shiny: true };
  }
  w.state.replace(state); w.state.replaced.length = 0;
  return w;
}

function prepareDexPath(kind) {
  const w = dexWorld(kind), context = { kind, w, parentToken: null, memberId: null, species: null };
  if (kind === 'begin-summary' || kind === 'resolve-summary') {
    context.parentToken = w.app.beginManagement();
    context.memberId = w.state.current().party[0].id;
    context.species = w.state.current().party[0].species;
  }
  if (kind === 'resolve-summary') {
    const opened = w.app.beginSummaryPokedex(context.parentToken, context.memberId);
    assert.equal(opened.status, 'pending');
  }
  if (kind === 'resolve-entry') {
    const opened = w.app.receiveGift({ kind: 'normal', member: { species: 'Pidgey', level: 3 } });
    assert.equal(opened.status, 'applied');
    context.species = 'Pidgey'; context.memberId = w.app.pendingPokedex.entry.memberId;
  }
  w.state.replaced.length = 0;
  return context;
}

function runDexCommand(context) {
  const { kind, w } = context;
  if (kind === 'begin') return w.app.updatePokedex({ kind: 'entitlement', value: true });
  if (kind === 'begin-summary') return w.app.beginSummaryPokedex(context.parentToken, context.memberId);
  const pending = w.app.pendingPokedex;
  if (kind === 'resolve-summary') return w.app.resolvePokedex(pending.token, pending.revision, { kind: 'summary-form', baseFrontsEqual: false, selected: 2 });
  if (kind === 'resolve-entry') return w.app.resolvePokedex(pending.token, pending.revision, { kind: 'message-complete' });
  throw Error(`unknown path ${kind}`);
}

function pollutedDexScenario(kind, field, mode) {
  const context = prepareDexPath(kind), w = context.w, before = clone(w.state.current());
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, field);
  let outcome, error, hookCalls = 0;
  try {
    if (mode === 'data' || mode === 'readonly-data') Object.defineProperty(Object.prototype, field, {
      value: field === 'nextKey' ? canonical(before) : `inherited-${field}`,
      writable: mode === 'data', configurable: true, enumerable: false,
    });
    if (mode === 'accessor') Object.defineProperty(Object.prototype, field, {
      get() { hookCalls++; return undefined; }, set(_value) { hookCalls++; }, configurable: true, enumerable: false,
    });
    outcome = runDexCommand(context);
  } catch (caught) { error = caught; }
  finally {
    if (previous) Object.defineProperty(Object.prototype, field, previous);
    else delete Object.prototype[field];
  }
  return { context, w, before, after: clone(w.state.current()), outcome, error, hookCalls, field, mode };
}

function expectedDexState(context, before, after) {
  const expected = clone(before), { kind } = context;
  if (kind === 'begin') { expected.dex.hasDex = true; return expected; }
  let record;
  if (kind === 'resolve-summary') record = { gender: 0, form: 1, shiny: false };
  else {
    const member = kind === 'begin-summary' ? before.party[0] : [...after.party, ...after.storage.boxes.flatMap(box => box.slots.filter(Boolean))].find(value => value.id === context.memberId);
    assert(member, `${kind}: expected installed member`);
    record = { gender: member.gender === 'F' ? 1 : member.gender === 'N' ? 2 : 0, form: 0, shiny: member.shiny };
  }
  expected.dex.lastSeenForm[context.species] = record;
  return expected;
}

function assertDexScenario(scenario) {
  const { context, w, before, after, outcome, error, hookCalls, field, mode } = scenario;
  const label = `${context.kind}/${field}/${mode}`;
  assert.ifError(error, label);
  assert.equal(hookCalls, 0, label);
  assert.equal(w.state.replaced.length, 1, `${label}: exactly one real target installation`);
  assert.equal(outcome.status, context.kind === 'begin' ? 'applied' : 'pending', label);
  assert.deepEqual(after, expectedDexState(context, before, after), `${label}: complete state and exact write set`);
  if (context.kind === 'begin') {
    assert.equal(runDexCommand(context).status, 'unchanged', `${label}: idempotent replay`);
    assert.equal(w.state.replaced.length, 1, label);
  } else {
    const pending = w.app.pendingPokedex;
    assert(pending, `${label}: installed owner still present before close`);
    assert.equal(w.app.resolvePokedex(pending.token, pending.revision, { kind: 'close-entry' }).status, 'complete', label);
    assert.equal(w.state.replaced.length, 1, `${label}: close writes nothing`);
    assert.equal(w.app.resolvePokedex(pending.token, pending.revision, { kind: 'close-entry' }).status, 'refused', `${label}: stale duplicate`);
    assert.equal(w.state.replaced.length, 1, `${label}: stale duplicate writes nothing`);
    if (context.parentToken) assert.equal(w.app.endManagement(context.parentToken).status, 'unchanged', label);
  }
  assert.equal(w.app.saveBlocked, false, `${label}: owner released`);
  const management = w.app.beginManagement();
  assert.equal(w.app.endManagement(management).status, 'unchanged', `${label}: subsequent operation available`);
  assert.equal(w.state.replaced.length, 1, label);
}

for (const kind of ['begin', 'begin-summary', 'resolve-summary', 'resolve-entry']) {
  test(`PERF-ULTRA-01 ${kind} creates both cache slots as own data across all four creation paths`, () => {
    assertDexScenario(pollutedDexScenario(kind, 'beforeKey', 'clean'));
    for (const field of ['beforeKey', 'nextKey']) for (const mode of ['data', 'readonly-data', 'accessor']) {
      assertDexScenario(pollutedDexScenario(kind, field, mode));
    }
  });
}
