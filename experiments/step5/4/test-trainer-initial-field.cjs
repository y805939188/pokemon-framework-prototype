'use strict';
// Real public App/Session + pinned Gen8. Authored synthetic content, no NW or reference replay.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, D, inputs, clone } = require('./trainer-ai-integration/fixtures.cjs');

const fields = [
  ['omitted', undefined], ['empty', {}],
  ['none', { weather: 'none', terrain: 'none', environment: 'none' }],
  ['sun', { weather: 'sun' }], ['rain', { weather: 'rain' }],
  ['grassy', { terrain: 'grassy' }], ['cave', { environment: 'cave' }],
];
function hooks(battle) {
  const table = battle.events;
  const entries = Object.entries(table ?? {}).map(([key, values]) => [key, values, [...values]]);
  return () => {
    assert.equal(battle.events, table, 'serialization restores the exact event table');
    assert.deepEqual(Object.keys(table ?? {}), entries.map(([key]) => key));
    for (const [key, values, records] of entries) {
      assert.equal(table[key], values, key + ' array identity');
      assert.deepEqual(table[key], records, key + ' exact records');
    }
  };
}
function observe(t, w, name) {
  const record = { name, request: clone(w.request), before: clone(w.state.current()), rounds: [] };
  t.after(() => {
    record.after = clone(w.state.current());
    record.installs = w.state.replaced.length;
    if (process.env.COMBO_FIELD_OBSERVATIONS) {
      fs.mkdirSync(process.env.COMBO_FIELD_OBSERVATIONS, { recursive: true });
      fs.writeFileSync(path.join(process.env.COMBO_FIELD_OBSERVATIONS, name + '.json'), JSON.stringify(record, null, 2) + '\n');
    }
  });
  return record;
}
async function world(t, { kind = 'trainer', field, moves = ['splash'], refuse } = {}) {
  const raw = inputs({ party: 1, moves });
  raw.species.find(s => s.id === 'snorlax').learnset = [{ level: 1, move: 'splash' }];
  let decisions = 0;
  const registry = E.composition.createTrainerAiStrategyRegistry();
  if (refuse) {
    raw.trainers[0].aiStrategy = { id: 'combo-field-refusal', version: '1', parameters: {} };
    registry.register({
      id: 'combo-field-refusal', version: '1', implementationIdentity: 'test-only/combo-field-refusal/1',
      validateParameters(p) { assert.deepEqual(p, {}); },
      create() { return { decide(s) {
        decisions++;
        const candidate = s.request.legalMoves[0];
        return { kind: 'choose', binding: s.binding, candidateId: candidate.candidateId, retryOrder: [candidate.candidateId], diagnostics: [] };
      } }; },
    });
  }
  const built = E.contentCompile.compileContent(raw);
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  const assembled = E.contentRuntime.assembleContent(built.data, E.dex.createDexLookup());
  assert.deepEqual(assembled.errors, []);
  const content = assembled.content;
  const member = E.memberFactory.createMember({ id: 'COMBO-P1', species: 'Snorlax', level: 50 }, content, () => 0);
  assert.deepEqual(member.moves.map(m => m.id), ['splash']);
  const game = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], money: 1000 });
  game.nextMemberOrdinal = '2';
  const state = T.fakes.createMemoryState(game);
  const sessions = E.composition.createBattleSessionFactory({ content: () => content, seed: () => [1, 2, 3, 4], trainerAiStrategies: registry });
  const app = new E.app.GameApplication({ state, projection: T.fakes.createRecordingProjection(), sessions, content: () => ({ content }), random: () => 0, clock: () => 12345 });
  const request = { battleId: 'combo-field', seq: 1, canLose: true, expGain: false,
    ...(kind === 'trainer' ? { trainer: { id: 'c-basic', version: 1 } } : { kind: 'wild', foes: [{ species: 'pidgey', level: 50 }] }),
    ...(field === undefined ? {} : { initialField: clone(field) }) };
  const proto = E.gateway.BattleGateway.prototype, original = proto.choose, attempts = [];
  if (refuse) proto.choose = async function(side, choice) {
    if (side === 'p2' && /^(move|switch) /.test(choice)) {
      attempts.push(choice);
      const response = await refuse.call(this, choice, attempts.length, original);
      if (response !== undefined) return response;
    }
    return original.call(this, side, choice);
  };
  let session;
  try { session = await app[kind === 'trainer' ? 'startTrainerBattle' : 'startBattle'](request); }
  finally { proto.choose = original; }
  t.after(() => app.abortBattle(request, Error('owned combo-field cleanup')));
  return { app, request, session, gw: session.gw, state, attempts, decisions: () => decisions };
}

for (const kind of ['trainer', 'wild']) for (const [name, field] of fields) {
  test('COMBO-P2-01 ' + kind + ' ' + name + ' completes two ordinary public App rounds', async t => {
    const w = await world(t, { kind, field }), b = w.gw._debugBattle();
    const record = observe(t, w, kind + '-' + name), before = clone(w.state.current());
    assert.equal(w.session.broken, null);
    assert.equal(w.gw.readState('p1')[0].pp.splash, 40);
    assert.equal(w.gw.readState('p2')[0].pp.splash, 40);
    for (let round = 1; round <= 2; round++) {
      const restore = hooks(b), snap = w.gw.snapshot();
      restore();
      assert.doesNotMatch(snap, /onSetWeather|onModifySecondaries/);
      const result = await w.session.chooseMove(1);
      record.rounds.push({ round, result: clone(result), turn: b.turn, player: clone(w.gw.readState('p1')), foe: clone(w.gw.readState('p2')) });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(w.session.broken, null);
      assert.equal(b.turn, round + 1);
      assert.equal(w.gw.readState('p1')[0].pp.splash, 40 - round);
      assert.equal(w.gw.readState('p2')[0].pp.splash, 40 - round);
      assert.deepEqual(w.state.current(), before);
      assert.equal(w.state.replaced.length, 0);
    }
    if (kind === 'trainer') assert.ok(D.trainerAiDiagnostics(w.session));
    if (field?.weather === 'sun') assert.equal(b.field.weather, 'sunnyday');
    if (field?.weather === 'rain') assert.equal(b.field.weather, 'raindance');
    if (field?.terrain === 'grassy') assert.equal(b.field.terrain, 'grassyterrain');
    if (field?.environment === 'cave') assert.equal(b.rpg.initialField.environment, 'cave');
  });
}

for (const [name, field] of fields.filter(([name]) => !['omitted', 'empty'].includes(name))) {
  test('COMBO-P2-01 ' + name + ' safe AI refusal retries one original candidate and consumes ticket once', async t => {
    const w = await world(t, { field, moves: ['splash', 'growl'], refuse: (_choice, n) => n === 1 ? false : undefined });
    observe(t, w, 'safe-refusal-' + name);
    const before = clone(w.state.current()), b = w.gw._debugBattle(), restore = hooks(b);
    assert.equal(await D.runTrainerAi(w.session, w.gw), true);
    restore();
    assert.deepEqual(w.attempts, ['move 1', 'move 2']);
    assert.equal(w.decisions(), 1);
    assert.equal(b.sides[1].choice.actions.length, 1);
    assert.equal(b.sides[1].choice.actions[0].moveid, 'growl');
    await assert.rejects(D.runTrainerAi(w.session, w.gw), /already-submitted/);
    assert.equal(w.attempts.length, 2);
    assert.equal(D.trainerAiDiagnostics(w.session).state.random.draws, 0);
    assert.deepEqual(w.state.current(), before);
    assert.equal(w.state.replaced.length, 0);
  });
}

test('COMBO-P2-01 sun action then false preserves unknown-effects rejection and spent ticket', async t => {
  const w = await world(t, { field: { weather: 'sun' }, moves: ['splash', 'growl'],
    refuse: async function(choice, _n, original) { await original.call(this, 'p2', choice); return false; } });
  observe(t, w, 'unknown-effects');
  const b = w.gw._debugBattle(), restore = hooks(b), before = clone(w.state.current());
  await assert.rejects(D.runTrainerAi(w.session, w.gw), /rejection-has-unknown-effects/);
  restore();
  await assert.rejects(D.runTrainerAi(w.session, w.gw), /already-submitted/);
  assert.deepEqual(w.attempts, ['move 1']);
  assert.equal(b.sides[1].choice.actions.length, 1);
  assert.equal(w.decisions(), 1);
  assert.deepEqual(w.state.current(), before);
  assert.equal(w.state.replaced.length, 0);
});

test('COMBO-P2-01 refused AI post-snapshot throw restores exact owned hook registry', async t => {
  const w = await world(t, { field: { weather: 'sun', environment: 'cave' }, refuse: () => false });
  observe(t, w, 'post-snapshot-finally');
  const b = w.gw._debugBattle(), original = b.toJSON, restore = hooks(b);
  let serializations = 0;
  b.toJSON = function() { if (++serializations === 2) throw Error('controlled post-refusal serializer fault'); return original.call(this); };
  try { await assert.rejects(D.runTrainerAi(w.session, w.gw), /controlled post-refusal serializer fault/); }
  finally { b.toJSON = original; }
  assert.equal(serializations, 2);
  restore();
  assert.deepEqual(w.attempts, ['move 1']);
  assert.equal(b.sides[1].choice.actions.length, 0);
  assert.equal(w.state.replaced.length, 0);
});
