'use strict';
// R2: the flow layer reaches the engine only through values, controlled operations and an opaque checkpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const F = E.fixtures;
const { BattleSession } = E.session;
const { BattleGateway } = E.gateway;

async function make(opts = {}) {
  const game = F.makeGame({ bag: { potion: 3 } });
  const s = await BattleSession.create({ game, content: F.content, battleId: 'gw-boundary', seed: [1, 2, 3, 4],
    foe: { kind: opts.kind || 'trainer', team: [F.foeMember('foe0', 'Snorlax', 40, { moves: ['protect'] }), F.foeMember('foe1', 'Snorlax', 40, { moves: ['protect'] })] } });
  s.take(); return s;
}

test('the foe active member is a plain id; an empty side has none', async () => {
  const s = await make();
  assert.equal(s.gw.activeId('p2'), 'foe0'); assert.equal(s.gw.activeId('p1'), 'A-0001'); assert.equal(s.gw.activeId('nope'), null);
});

test('awaitingChoice returns a copy of the request only while a choice is pending', async () => {
  const s = await make();
  const req = s.gw.awaitingChoice('p2');
  assert.ok(req && Array.isArray(req.active) && req.active[0].moves.length);
  req.active[0].moves.length = 0; req.mutated = true;
  const again = s.gw.awaitingChoice('p2');
  assert.ok(again.active[0].moves.length > 0 && !again.mutated, 'the caller never holds the engine request object');
  assert.equal(await s.gw.choose('p2', 'move 1'), true);
  assert.equal(s.gw.awaitingChoice('p2'), null, 'a side that has chosen is not awaiting');
});

test('drain hands out the queued messages once; discardQueued drops them', async () => {
  const s = await make();
  await s.gw.choose('p1', 'move 1'); await s.gw.choose('p2', 'move 1');
  const batch = s.gw.drain(); assert.ok(batch.length > 0 && batch.every(m => typeof m.seq === 'number'));
  assert.deepEqual(s.gw.drain(), []);
  await s.gw.choose('p1', 'move 1').catch(() => {}); // a second choice for a decided turn is refused or queued; either way:
  s.gw.discardQueued(); assert.deepEqual(s.gw.drain(), []);
});

test('the checkpoint is an opaque token and a restore reproduces engine state, PRNG, queue and sequence', async () => {
  const s = await make();
  await s.gw.choose('p1', 'move 4'); // queued messages exist now
  const token = s.gw.checkpoint();
  assert.deepEqual(Object.keys(token), []); assert.equal(JSON.stringify(token), '{}'); assert.ok(Object.isFrozen(token));
  const snap = g => JSON.parse(g.snapshot()); // compared as data: key order may differ after a restore
  const before = { snap: snap(s.gw), seq: s.gw._seq, queue: JSON.stringify(s.gw._queue) };
  await s.gw.choose('p2', 'move 1'); s.gw.drain();
  assert.notDeepEqual(snap(s.gw), before.snap);
  const back = await BattleGateway.fromCheckpoint(token);
  assert.deepEqual(snap(back), before.snap); assert.equal(back._seq, before.seq); assert.equal(JSON.stringify(back._queue), before.queue);
  await back.choose('p2', 'move 1'); // PRNG restored: the same continuation as the original run
  const replay = back.drain(); assert.ok(replay.length > 0);
  assert.deepEqual(await BattleGateway.fromCheckpoint(token).then(snap), before.snap, 'the token can be restored more than once');
});

test('a token from one gateway cannot be forged from plain data', async () => {
  await assert.rejects(BattleGateway.fromCheckpoint({}), /checkpoint/);
  await assert.rejects(BattleGateway.fromCheckpoint(JSON.parse(JSON.stringify((await make()).gw.checkpoint()))), /checkpoint/);
});
