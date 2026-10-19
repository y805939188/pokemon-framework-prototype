'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const { BattleSession } = E.session;
const F = E.fixtures;
async function make(game, team) {
  const s = await BattleSession.create({ game, content: F.content, battleId: 'pp-sync', seed: [1, 2, 3, 4],
    foe: { kind: 'wild', team: team || [F.foeMember('foe', 'Snorlax', 40, { moves: ['protect'] })] } });
  s.take(); return s;
}

test('persistent max PP and all four PP-Up levels survive import, use and switching', async () => {
  for (let ups = 0; ups <= 3; ups++) {
    const game = F.makeGame(); game.party[0].moves = [{ id: 'hydropump', pp: 4, maxpp: 5 + ups }];
    const s = await make(game);
    assert.equal(s.currentRequest().active[0].moves[0].maxpp, 5 + ups);
    assert.equal(s.gw._debugBattle().getSide('p1').active[0].ppUps[0], ups);
    await s.chooseMove(1);
    assert.equal(s.gw.readState('p1').find(m => m.id === 'A-0001').pp.hydropump, 3);
    await s.chooseSwitch('A-0002'); await s.chooseSwitch('A-0001');
    assert.equal(s.currentRequest().active[0].moves[0].maxpp, 5 + ups);
    assert.equal(s.currentRequest().active[0].moves[0].pp, 3);
  }
});

test('Leppa restoration respects each persistent cap; the result commits and reloads as a valid save', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pp-sync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (let ups = 0; ups <= 3; ups++) {
    const game = F.makeGame();
    game.party[0].moves = [{ id: 'hydropump', pp: 1, maxpp: 5 + ups }]; game.party[0].item = 'leppaberry';
    const s = await make(game);
    await s.chooseMove(1);
    assert.equal(s.gw.readState('p1').find(m => m.id === 'A-0001').pp.hydropump, 5 + ups);
    await s.run(); assert.equal(s.finished, true);
    assert.deepEqual(s.result().members['A-0001'].moves[0], { id: 'hydropump', pp: 5 + ups, maxpp: 5 + ups });
    const file = path.join(dir, `${ups}.json`); fs.writeFileSync(file, JSON.stringify(game));
    const store = new E.store.SaveStore(file);
    assert.equal(store.commit(s.result()).status, 'applied');
    assert.deepEqual(E.saveSchema.validateGame(store.load()), []);
    assert.equal(store.commit(s.result()).status, 'already-applied');
  }
});

test('learning resets the replaced move PP-Up count and keeps the new cap after switching', async () => {
  const game = F.makeGame();
  game.party[0].moves[0].maxpp = 24;
  game.party[0].exp = E.growth.minExp('parabolic', 51) - 1;
  const s = await make(game, [F.foeMember('foe1', 'Pidgey', 5), F.foeMember('foe2', 'Snorlax', 40, { moves: ['protect'] })]);
  await s.chooseMove(1); assert.equal(s.pendingLearn.move.id, 'slash');
  await s.decideLearn(0);
  assert.equal(s.gw._debugBattle().getSide('p1').active[0].ppUps[0], 0);
  await s.chooseSwitch('A-0002'); await s.chooseSwitch('A-0001');
  const move = s.currentRequest().active[0].moves[0];
  assert.deepEqual([move.id, move.pp, move.maxpp], ['slash', 20, 20]);
  await s.run(); assert.deepEqual(E.saveSchema.validateGame(E.state.applyBattleResult(game, s.result()).state), []);
});

test('invalid current PP or an unrepresentable cap is diagnosed before any seed write', async () => {
  const s = await make(F.makeGame());
  const before = s.gw.snapshot();
  for (const move of [{ id: 'flamethrower', pp: 16, maxpp: 15 }, { id: 'flamethrower', pp: 1, maxpp: 999 }]) {
    assert.throws(() => s.gw.seedState('p1', [{ ...s.party[0], hp: 1, moves: [move] }]), /PP/);
    assert.equal(s.gw.snapshot(), before, 'failed seed must not change HP or PP');
  }
});

// ---- supported range (step 2 closeout): spec total PP = base + floor(base * ups / 5), ups 0-3; the bridge follows the pinned simulator
test('the supported range is stated by tests: ups 0-3 accepted, other caps and Trump Card boosts rejected before the battle starts', async () => {
  const create = move => { const game = F.makeGame(); game.party[0].moves = [move]; return make(game); };
  await create({ id: 'hydropump', pp: 8, maxpp: 8 });           // 3 PP-Ups
  await create({ id: 'trumpcard', pp: 5, maxpp: 5 });           // the pinned simulator never boosts it
  await create({ id: 'struggle', pp: 1, maxpp: 1 });            // total PP <= 1: no boost possible (spec WP28 PPUP rule)
  for (const move of [
    { id: 'hydropump', pp: 5, maxpp: 9 },                       // a raw count of 4 is not representable
    { id: 'hydropump', pp: 1, maxpp: 4 },                       // a negative count is not representable
    { id: 'trumpcard', pp: 5, maxpp: 6 },                       // spec formula would allow it; the simulator does not
    { id: 'struggle', pp: 1, maxpp: 2 },
  ]) await assert.rejects(create(move), /invalid PP maximum/, JSON.stringify(move));
});
