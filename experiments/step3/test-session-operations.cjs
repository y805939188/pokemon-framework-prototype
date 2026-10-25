'use strict';
const I6 = require("../step5/2/test-support.cjs");
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const F = E.fixtures;
async function make({ bag = { potion: 3 }, doubles = false, ai } = {}) {
  const game = F.makeGame({ bag }); game.party[0].hp = 70;
  const s = await E.session.BattleSession.create({ game, content: F.content, battleId: 'operations', seed: [1, 2, 3, 4], doubles, ai,
    foe: { kind: 'wild', team: Array.from({ length: doubles ? 2 : 1 }, (_, i) => F.foeMember(`foe${i}`, 'Snorlax', 40, { moves: ['protect'] })) } });
  s.take(); return s;
}
const unresolved = s => s.ledger.filter(e => e.state === 'reserved');
const potion = s => s.useItem('potion', 'A-0001');
const state = s => ({ bag: { ...I6.bagOf(s) }, party: E.state.clone(s.party), ledger: E.state.clone(s.ledger), engine: JSON.parse(s.gw.snapshot()) });

test('concurrent duplicate item calls accept one, spend one and leave no reservation or missing request', async () => {
  const s = await make(); const responses = await Promise.all([potion(s), potion(s)]);
  assert.equal(responses.filter(r => r.ok).length, 1);
  assert.deepEqual(responses.find(r => !r.ok), { ok: false, reason: 'choice-rejected' });
  assert.equal(I6.bagOf(s).potion, 2); assert.equal(unresolved(s).length, 0);
  assert.equal(s.gw._debugBattle().turn, 2); assert.ok(s.currentRequest());
});

test('replacing a staged selection releases it before checking inventory; replacing it by a move spends nothing', async () => {
  const s = await make({ bag: { potion: 1 } });
  await s.useItem('potion', 'A-0001', { commit: false });
  assert.equal((await potion(s)).ok, true);
  assert.equal(I6.bagOf(s).potion, 0); assert.equal(unresolved(s).length, 0);
  const t = await make(); await t.useItem('potion', 'A-0001', { commit: false });
  assert.equal((await t.chooseMove(4)).ok, true);
  assert.equal(I6.bagOf(t).potion, 3); assert.equal(unresolved(t).length, 0);
});

test('an in-flight item excludes competing moves/cancel; a later cancel is idempotent', async () => {
  const s = await make(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const act = s.gw.act.bind(s.gw); s.gw.act = async (...args) => { await gate; return act(...args); };
  const first = potion(s);
  try {
    assert.equal((await s.chooseMove(4)).ok, false);
    await assert.rejects(s.cancel(), /in progress/);
  } finally { release(); }
  assert.equal((await first).ok, true); assert.equal(I6.bagOf(s).potion, 2);
  assert.equal(unresolved(s).length, 0);
  s.gw.act = act;
  await s.useItem('potion', 'A-0001', { commit: false });
  await s.cancel(); await s.cancel();
  assert.equal(I6.bagOf(s).potion, 2); assert.equal(unresolved(s).length, 0);
});

test('registration refusal and an exception before registration release funds and permit a retry', async () => {
  const s = await make(); const act = s.gw.act;
  s.gw.act = async () => false;
  assert.deepEqual(await potion(s), { ok: false, reason: 'not-registered' });
  assert.equal(I6.bagOf(s).potion, 3); assert.equal(unresolved(s).length, 0);
  s.gw.act = async () => { throw new Error('before registration'); };
  const before = state(s);
  await assert.rejects(potion(s), /before registration/); assert.deepEqual(state(s), before);
  s.gw.act = act;
  assert.equal((await potion(s)).ok, true); assert.equal(I6.bagOf(s).potion, 2);
});

test('an exception after registration restores both the engine choice and the session ledger', async () => {
  const s = await make(); const before = state(s); const act = s.gw.act.bind(s.gw);
  s.gw.act = async (...args) => { await act(...args); throw new Error('after registration'); };
  await assert.rejects(potion(s), /after registration/);
  assert.deepEqual(state(s), before);
  assert.equal((await potion(s)).ok, true); assert.equal(I6.bagOf(s).potion, 2);
});

test('an exception after engine execution rolls back HP/PP/RNG/events and can be retried once', async () => {
  const s = await make(); const before = state(s); const choose = s.gw.choose.bind(s.gw);
  s.gw.choose = async (...args) => { const ok = await choose(...args); if (args[0] === 'p2') throw new Error('after execution'); return ok; };
  await assert.rejects(potion(s), /after execution/);
  assert.deepEqual(state(s), before); assert.deepEqual(s.take(), []);
  assert.equal((await potion(s)).ok, true); assert.equal(I6.bagOf(s).potion, 2);
  assert.equal(s.gw._debugBattle().turn, 2); assert.equal(unresolved(s).length, 0);
});

test('AI exceptions and refused AI choices cannot leave a successful-looking unresolved turn', async () => {
  for (const ai of [() => { throw new Error('AI failed'); }, () => 'move 99']) {
    const s = await make({ ai }); const before = state(s);
    await assert.rejects(potion(s)); assert.deepEqual(state(s), before);
    s.ai = E.session.BattleSession.defaultAi;
    assert.equal((await potion(s)).ok, true); assert.equal(I6.bagOf(s).potion, 2);
  }
});

test('commitTurn resolves a staged action once; concurrent and repeated commits are refused', async () => {
  const s = await make(); await s.useItem('potion', 'A-0001', { commit: false });
  const responses = await Promise.all([s.commitTurn(), s.commitTurn()]);
  assert.equal(responses.filter(r => r.ok).length, 1);
  assert.equal((await s.commitTurn()).ok, false);
  assert.equal(I6.bagOf(s).potion, 2); assert.equal(unresolved(s).length, 0);
  assert.equal(s.gw._debugBattle().getSide('p2').isChoiceDone(), false);
});

test('doubles shares the operation guard and settles each accepted reservation', async () => {
  const s = await make({ doubles: true });
  const specs = () => [{ kind: 'item', item: 'potion', target: 'A-0001' }, { move: 4 }];
  const responses = await Promise.all([s.chooseDoubles(specs()), s.chooseDoubles(specs())]);
  assert.equal(responses.filter(r => r.ok).length, 1);
  assert.equal(I6.bagOf(s).potion, 2); assert.equal(unresolved(s).length, 0);
});

test('a failed foe replacement restores partial growth and can be retried', async () => {
  for (const replacement of [() => { throw new Error('replacement failed'); }, () => 'switch 99']) {
    const s = await E.session.BattleSession.create({ game: F.makeGame(), content: F.content, battleId: 'replacement', seed: [1, 2, 3, 4],
      ai: request => request.forceSwitch ? replacement() : E.session.BattleSession.defaultAi(request),
      foe: { kind: 'trainer', team: [F.foeMember('f1', 'Pidgey', 5), F.foeMember('f2', 'Pidgey', 5)] } });
    s.take(); const before = state(s);
    await assert.rejects(s.chooseMove(1), /replacement/);
    assert.deepEqual(state(s), before);
    s.ai = E.session.BattleSession.defaultAi;
    assert.equal((await s.chooseMove(1)).ok, true); assert.ok(s.currentRequest());
  }
});

// ---- added with the step 2 closeout: a rolled-back and retried operation looks exactly like a clean run
const strip = messages => JSON.parse(JSON.stringify(messages, (key, value) => (Array.isArray(value) && value.length && value.every(e => e && e.type === 't:') ? [] : value)))
  .map(m => (m.kind === 'events' ? { ...m, events: m.events.filter(e => e.type !== 't:') } : m));

test('after a rollback and retry the messages, their seq numbers and the gateway counter equal a clean run', async () => {
  for (const doubles of [false, true]) {
    const act = s => (doubles ? s.chooseDoubles([{ kind: 'item', item: 'potion', target: 'A-0001' }, { move: 4 }]) : potion(s));
    const clean = await make({ doubles }); const cleanResult = await act(clean);
    const hit = await make({ doubles }); const choose = hit.gw.choose.bind(hit.gw);
    hit.gw.choose = async (...args) => { const ok = await choose(...args); if (args[0] === 'p2') throw new Error('after execution'); return ok; };
    await assert.rejects(act(hit), /after execution/);
    const retried = await act(hit);
    assert.deepEqual(strip(retried.messages), strip(cleanResult.messages));
    const seqs = result => result.messages.filter(m => 'seq' in m).map(m => m.seq);
    assert.deepEqual(seqs(retried), seqs(cleanResult));
    assert.equal(hit.gw._seq, clean.gw._seq, 'the gateway counter continues from the same point');
    assert.deepEqual(I6.bagOf(hit), I6.bagOf(clean)); assert.deepEqual(hit.ledger.map(e => e.state), clean.ledger.map(e => e.state));
  }
});
