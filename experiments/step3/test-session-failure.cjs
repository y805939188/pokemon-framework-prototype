'use strict';
// A failed operation whose rollback also fails leaves the session in an unknown state: it must be closed for good,
// both errors kept, and nothing from it may reach the persistent game state.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const F = E.fixtures;
const { BattleSession, SessionBrokenError } = E.session;
const Gateway = E.gateway.BattleGateway;

async function make({ doubles = false } = {}) {
  const game = F.makeGame({ bag: { potion: 3, pokeball: 3 } }); game.party[0].hp = 70;
  const s = await BattleSession.create({ game, content: F.content, battleId: 'broken', seed: [1, 2, 3, 4], doubles,
    foe: { kind: 'wild', team: Array.from({ length: doubles ? 2 : 1 }, (_, i) => F.foeMember(`foe${i}`, 'Snorlax', 40, { moves: ['protect'] })) } });
  s.take(); return { s, game };
}
// the operation fails after the engine accepted the choice, then the rollback itself fails
async function breakSession(s) {
  const act = s.gw.act.bind(s.gw); const restore = Gateway.restore;
  s.gw.act = async (...args) => { await act(...args); throw new Error('operation failed'); };
  Gateway.restore = async () => { throw new Error('rollback failed'); };
  try { await s.useItem('potion', 'A-0001'); assert.fail('must reject'); } catch (error) { return error; } finally { Gateway.restore = restore; }
}
const snapshot = s => JSON.stringify({ bag: s.bag, ledger: s.ledger, party: s.party, engine: s.gw.snapshot() });

test('a failed rollback closes the session and reports both errors', async () => {
  const { s } = await make(); const error = await breakSession(s);
  assert.ok(error instanceof SessionBrokenError);
  assert.equal(error.original.message, 'operation failed'); assert.equal(error.restoreError.message, 'rollback failed');
  assert.match(error.message, /operation failed/); assert.match(error.message, /rollback failed/);
  assert.equal(s.broken, error); assert.equal(s._operation, false, 'the lock is released, the session is closed by state');
});

test('every later write or result access is refused with the same error; nothing is deducted or refunded', async () => {
  const { s } = await make(); const error = await breakSession(s); const frozen = snapshot(s);
  const calls = [() => s.useItem('potion', 'A-0001'), () => s.chooseMove(4), () => s.chooseSwitch('A-0002'), () => s.chooseForcedSwitch('A-0002'),
    () => s.throwBall('pokeball'), () => s.run(), () => s.commitTurn(), () => s.cancel(), () => s.decideLearn(null),
    () => s.chooseDoubles([{ move: 4 }]), async () => s.result(), async () => s.take()];
  for (const call of calls) await assert.rejects(call, e => e === error);
  assert.equal(snapshot(s), frozen, 'refused calls change nothing');
});

test('a closed doubles session is refused as well', async () => {
  const { s } = await make({ doubles: true }); const error = await breakSession(s);
  await assert.rejects(() => s.chooseDoubles([{ move: 4 }, { move: 4 }]), e => e === error);
});

test('the untrusted result cannot reach the persistent game state', async () => {
  const { s, game } = await make(); const before = JSON.stringify(game); await breakSession(s);
  assert.throws(() => s.result(), e => e instanceof SessionBrokenError && e === s.broken);
  assert.equal(JSON.stringify(game), before, 'the caller game object is untouched');
  assert.equal(s.finished, false);
});

test('a rollback that succeeds still lets the caller retry, and the session is not marked broken', async () => {
  const { s } = await make(); const act = s.gw.act.bind(s.gw);
  s.gw.act = async (...args) => { await act(...args); throw new Error('operation failed'); };
  await assert.rejects(() => s.useItem('potion', 'A-0001'), /operation failed/);
  assert.equal(s.broken, null);
  assert.equal((await s.useItem('potion', 'A-0001')).ok, true); assert.equal(s.bag.potion, 2);
});

test('the failure is logged once with both messages and no secrets', async () => {
  const lines = []; const game = F.makeGame({ bag: { potion: 3 } }); game.party[0].hp = 70;
  const s = await BattleSession.create({ game, content: F.content, battleId: 'broken-log', seed: [1, 2, 3, 4], logger: l => lines.push(l),
    foe: { kind: 'wild', team: [F.foeMember('foe0', 'Snorlax', 40, { moves: ['protect'] })] } });
  s.take(); await breakSession(s);
  const entries = lines.filter(l => l.kind === 'session.broken');
  assert.equal(entries.length, 1);
  assert.deepEqual([entries[0].level, entries[0].data.original, entries[0].data.rollback], ['error', 'operation failed', 'rollback failed']);
});
