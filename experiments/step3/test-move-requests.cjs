'use strict';
// Engine/session integration plus a DOM-free invocation of the real menu source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { BattleSession } = require('../../js/engine/game/session.cjs');
const F = require('../../js/engine/fixtures/game.cjs');
const ROOT = path.resolve(__dirname, '../..');
let pluginDirectory, pluginText;
test.before(() => {
  pluginDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-menu-source-'));
  const built = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', pluginDirectory], {cwd:ROOT, env:{...process.env,RR_PLUGIN:'PS_BattleFlow'}, encoding:'utf8'});
  assert.equal(built.status,0,built.stdout+built.stderr);
  pluginText = fs.readFileSync(path.join(pluginDirectory,'PS_BattleFlow.js'),'utf8');
});
test.after(() => { if(pluginDirectory)fs.rmSync(pluginDirectory,{recursive:true,force:true}); });

function menu(session) {
  function Base() {}
  const nodeRequire = id => require(id.startsWith('./') ? path.join(ROOT, id) : id);
  nodeRequire.resolve = id => require.resolve(path.join(ROOT, id));
  const ctx = { window: {}, require: nodeRequire, performance, console,
    PluginManager: { registerCommand() {} }, Window_Base: Base, Window_Command: Base,
    Scene_MenuBase: Base, Game_Interpreter: Base };
  vm.createContext(ctx);
  vm.runInContext(pluginText, ctx);
  ctx.window.PSFlow.translator = () => ({ t: (_key, v) => `${v.move} PP ${v.pp}/${v.maxpp}` });
  const scene = Object.create(ctx.window.Scene_PSBattle.prototype);
  scene._session = session;
  let items;
  scene.show = (_mode, value) => { items = value; };
  scene.showMoves();
  return items;
}
async function make(game, foe, options = {}) {
  const session = await BattleSession.create({ game, experimentalHeldBattle: true, content: F.content, battleId: 'move-request', seed: [1, 2, 3, 4],
    foe: { kind: 'trainer', team: [foe] }, ...options });
  session.take(); return session;
}
const mon = (id, moves = ['protect']) => F.foeMember(id, 'Snorlax', 100, { moves });

test('ordinary menu rejects empty/disabled moves and engine rejects an illegal index without advancing', async () => {
  const game = F.makeGame(); game.party[0].moves[0].pp = 0;
  const s = await make(game, mon('foe'));
  assert.equal(menu(s)[0].enabled, false); assert.equal(menu(s)[1].enabled, true);
  const before = s.gw._debugBattle().turn;
  assert.equal((await s.chooseMove(99)).ok, false);
  assert.equal(s.gw._debugBattle().turn, before);
  assert.equal((await s.chooseMove(4)).ok, true);
});

test('Struggle with no PP fields is selectable, executes and never displays undefined PP', async () => {
  const game = F.makeGame(); game.party[0].moves.forEach(m => { m.pp = 0; });
  const s = await make(game, mon('foe'));
  assert.equal(s.currentRequest().active[0].moves[0].id, 'struggle');
  assert.equal(menu(s)[0].enabled, true);
  assert.doesNotMatch(menu(s)[0].name, /undefined/);
  const before = s.gw._debugBattle().turn;
  const response = await s.chooseMove(1);
  assert.equal(response.ok, true); assert.ok(s.gw._debugBattle().turn > before);
});

test('Fly locks the next request to a PP-less move; its second turn completes', async () => {
  const game = F.makeGame(); game.party[0].moves = [{ id: 'fly', pp: 15, maxpp: 15 }];
  const s = await make(game, mon('foe'));
  await s.chooseMove(1);
  assert.equal(s.currentRequest().active[0].moves[0].id, 'fly');
  assert.equal(s.currentRequest().active[0].moves[0].pp, undefined);
  assert.equal(menu(s)[0].enabled, true);
  const response = await s.chooseMove(1);
  assert.ok(response.messages.some(m => m.kind === 'events' && m.events.some(e => e.type === 'move' && e.args[1] === 'Fly')));
  assert.equal(s.gw._debugBattle().turn, 3);
});

test('default singles AI advances a no-PP Struggle request', async () => {
  const foe = mon('foe', ['tackle']); foe.moves[0].pp = 0;
  const s = await make(F.makeGame(), foe);
  assert.equal(BattleSession.defaultAi(s.gw._debugBattle().getSide('p2').activeRequest), 'move 1');
  const response = await s.chooseMove(4);
  assert.equal(response.ok, true); assert.equal(s.gw._debugBattle().turn, 2);
  assert.ok(!response.messages.some(m => m.kind === 'error'));
});

test('default AI handles a real recharge request and a doubles PP-less slot', async () => {
  const foe = F.foeMember('foe', 'Snorlax', 40);
  foe.moves = [{ id: 'hyperbeam', pp: 5, maxpp: 5 }];
  const s = await make(F.makeGame(), foe);
  // Surviving Hyper Beam forces a PP-less Recharge request on the following turn.
  await s.chooseMove(4);
  const request = s.gw._debugBattle().getSide('p2').activeRequest;
  assert.equal(request.active[0].moves[0].id, 'recharge');
  assert.equal(BattleSession.defaultAi(request), 'move 1');
  await s.chooseMove(4); assert.equal(s.gw._debugBattle().turn, 3);
  const exhausted = F.foeMember('foe1', 'Snorlax', 40, { moves: ['tackle'] }); exhausted.moves[0].pp = 0;
  const d = await BattleSession.create({ game: F.makeGame(), content: F.content, battleId: 'double-pp', seed: [1, 2, 3, 4], doubles: true,
    foe: { kind: 'trainer', team: [exhausted, F.foeMember('foe2', 'Snorlax', 40, { moves: ['protect'] })] } });
  assert.match(BattleSession.defaultAiDoubles(d.gw._debugBattle().getSide('p2').activeRequest), /^move 1, move 1$/);
  const response = await d.chooseDoubles([{ move: 4 }, { move: 4 }]);
  assert.equal(response.ok, true); assert.equal(d.gw._debugBattle().turn, 2);
});

// ---- guards added with the step 2 closeout: the disabled branch, and the scripted demo policy
const E = require('../../js/engine/build/engine.cjs');
const selectable = E.moveRequests.isSelectableMove;

test('isSelectableMove: disabled wins over any PP; PP-less requests are selectable unless disabled', () => {
  assert.equal(selectable({ pp: 5 }), true);
  assert.equal(selectable({ pp: 5, disabled: true }), false, 'PP left but disabled');
  assert.equal(selectable({ pp: 5, disabled: 'Disable' }), false, 'a truthy disabled marker also blocks');
  assert.equal(selectable({}), true, 'PP-less (Struggle/locked/Recharge) request');
  assert.equal(selectable({ disabled: true }), false, 'PP-less but disabled');
  assert.equal(selectable({ pp: 0 }), false);
  assert.equal(selectable({ pp: 0, disabled: false }), false);
});

test('real disabled moves: a Choice item locks the other moves in the menu and for the default AI', async () => {
  const game = F.makeGame(); game.party[0].item = 'choiceband';
  const foe = mon('foe', ['protect', 'tackle']); foe.item = 'choiceband';
  const s = await make(game, foe);
  assert.deepEqual(menu(s).map(m => m.enabled), [true, true, true, true]);
  await s.chooseMove(4); // the other three moves are now disabled although they have PP
  const moves = s.currentRequest().active[0].moves;
  assert.deepEqual(moves.map(m => [m.disabled, m.pp > 0]), [[true, true], [true, true], [true, true], [false, true]]);
  assert.deepEqual(menu(s).map(m => m.enabled), [false, false, false, true]);
  const foeRequest = s.gw._debugBattle().getSide('p2').activeRequest;
  assert.equal(foeRequest.active[0].moves[1].disabled, true);
  assert.equal(BattleSession.defaultAi(foeRequest), 'move 1', 'the AI skips the locked-out move');
  assert.equal((await s.chooseMove(1)).ok, false, 'choosing a disabled move is still refused by the engine');
});

test('the scripted demo policy uses the same rule: Struggle, locked and disabled requests', () => {
  const { decide } = E.harness;
  const request = moves => ({ active: [{ moves }], side: { pokemon: [] } });
  assert.equal(decide(request([{ move: 'Struggle', id: 'struggle' }])), 'move 1');
  assert.equal(decide(request([{ move: 'A', pp: 3, disabled: true }, { move: 'B', pp: 2 }])), 'move 2');
  assert.equal(decide(request([{ move: 'A', pp: 0 }, { move: 'B', disabled: true }, { move: 'Fly', id: 'fly' }])), 'move 3');
});
