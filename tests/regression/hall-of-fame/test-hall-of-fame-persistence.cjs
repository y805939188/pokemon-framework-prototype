'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {before, test} = require('node:test');
const {createHost, sha} = require('../../../experiments/step5/4/mz-slot-host.cjs');
const F = require('../../../experiments/step5/3/fixtures-migration7/fixtures.cjs');
const E = require('../../../js/engine/build/production.cjs');
require('../../../scripts/tests/ts-source-loader.cjs');

const root = path.resolve(__dirname, '../../..');
const native = ['js/reactor_core.js', 'js/reactor_managers.js', 'js/libs/pako.min.js', 'js/plugins/PS_SaveState.js'];
const manifest = Object.fromEntries(native.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
let register;
before(async () => {
  ({registerHallOfFame: register} = await import('../../../src/framework/rules/hall-of-fame.ts'));
});

function setup(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-hof-persistence-'));
  t.after(() => fs.rmSync(folder, {recursive:true, force:true}));
  const content = F.content(E), h = createHost(root, root, folder, content, manifest), g = h.context;
  const current = () => g.$gameSystem._psGame;
  const fresh = (party = []) => E.state.newGame({party, money:7, content});
  g.$gameSystem._psGame = fresh();
  const app = new E.app.GameApplication({
    state:{read:current, replace(){assert.fail('history is read-only through the application query');}},
    content:() => ({content}),
    projection:{project(){assert.fail('no projection');}},
    sessions:{create(){assert.fail('no battle');}},
  });
  function rawSlot(slot, state) {
    const contents = g.DataManager.makeSaveContents();
    if (state === undefined) delete contents.system._psGame;
    else contents.system._psGame = state;
    return g.StorageManager.saveObject(g.DataManager.makeSavename(slot), contents);
  }
  function fileImage() {
    return Object.fromEntries(fs.readdirSync(folder).sort().map(file => [file, fs.readFileSync(path.join(folder, file))]));
  }
  async function save(slot) {
    assert.equal(await g.DataManager.saveGame(slot), 0);
    await h.drain();
  }
  return {g, h, app, current, fresh, rawSlot, fileImage, save};
}

const numbers = view => view.entries.map(entry => entry.number);
const checkpoint = {
  id:'synthetic-return', origin:{kind:'field',sourceId:'synthetic-poison'},
  selection:{branch:'home', target:{mapId:1,x:2,y:3,direction:2}}, phase:'ready', branch:'home',
};

test('new-game known empty survives a normal save; an older MZ slot without framework state remains unavailable', async t => {
  const x = setup(t), {g, h, app} = x;
  const empty = {entryCount:0, entries:[]};
  assert.deepEqual(app.hallOfFameSnapshot(), empty);
  await x.save(2);
  await x.rawSlot(1);
  const before = x.fileImage(), writes = h.records();
  await g.DataManager.loadGame(1);
  assert.equal(g.$gameSystem._psSaveInfo.created, 'empty');
  assert.equal(app.hallOfFameSnapshot(), null);
  await g.DataManager.loadGame(2);
  assert.deepEqual(app.hallOfFameSnapshot(), empty);
  assert.deepEqual(h.records(), writes);
  assert.deepEqual(x.fileImage(), before);
});

test('schema 11 loads on a copy and remains without history after multiple explicit saves', async t => {
  const x = setup(t), {g, h, app} = x;
  const old = x.fresh();
  old.schema = 11;
  delete old.hallOfFame;
  old.money = 543;
  old.stats.hall_of_fame_entry_count = 9;
  old.stats.time_to_enter_hall_of_fame = 150.5;
  old.world.pendingReturn = structuredClone(checkpoint);
  await x.rawSlot(1, old);
  await x.save(2);
  const before = x.fileImage(), writes = h.records();
  await g.DataManager.loadGame(1);
  const expected = {...old, schema:12, hallOfFame:null};
  assert.deepEqual(x.current(), expected);
  assert.equal(app.hallOfFameSnapshot(), null);
  assert.equal(g.$gameSystem._psSaveInfo.from, 11);
  assert.deepEqual(h.records(), writes);
  assert.deepEqual(x.fileImage(), before);

  for (const slot of [3,0,3]) {
    await x.save(slot);
    await g.DataManager.loadGame(slot);
    assert.deepEqual(x.current(), expected);
    assert.equal(g.$gameSystem._psSaveInfo.migrated, false);
    const after = x.fileImage();
    for (const file of ['file1.rmmzsave','file2.rmmzsave']) assert.deepEqual(after[file], before[file], file);
  }
});

test('the persisted retention window and its ordinals survive saves with no live members', async t => {
  const x = setup(t), {g, app} = x;
  g.$gameSystem._psGame = x.fresh([F.member('fixture-a', {nickname:'Before'}), F.member('fixture-egg', {isEgg:true})]);
  const game = x.current();
  for (let n = 1; n <= 4; n++) {
    game.party[0].nickname = 'Registration ' + n;
    game.hallOfFame = register(game.hallOfFame, game.party, 2);
  }
  game.party[0].nickname = 'Live rename';
  game.party[0].hp = 10;
  game.party.length = 0;
  const before = structuredClone(game.hallOfFame);
  const history = app.hallOfFameSnapshot();
  assert.deepEqual(numbers(history), [3,4]);
  assert.equal(history.entries[0].members[0].nickname, 'Registration 3');
  assert.equal(history.entries[1].members[1].publicId, '?????');
  assert.deepEqual(Object.keys(history.entries[0].members[0]).sort(),
    ['species','form','nickname','gender','level','publicId','shiny','superShiny','isEgg'].sort());
  history.entries[0].members[0].nickname = 'Viewer-local change';
  assert.deepEqual(game.hallOfFame, before);

  for (const slot of [1,0,1]) {
    await x.save(slot);
    await g.DataManager.loadGame(slot);
    assert.deepEqual(x.current().hallOfFame, before);
    assert.deepEqual(x.current().party, []);
    assert.deepEqual(numbers(app.hallOfFameSnapshot()), [3,4]);
  }
});

test('cap 0 persists a positive ordinal with an empty retained window', async t => {
  const x = setup(t), {g, app} = x;
  const game = x.current();
  game.hallOfFame = register(game.hallOfFame, [F.member()], 0);
  game.hallOfFame = register(game.hallOfFame, [F.member()], 0);
  await x.save(1);
  await g.DataManager.loadGame(1);
  assert.deepEqual(app.hallOfFameSnapshot(), {entryCount:2, entries:[]});

  // A limit lowered to zero still removes one oldest entry per registration.
  const seed = register(register(x.fresh().hallOfFame, [F.member()], -1), [F.member()], -1);
  x.current().hallOfFame = register(seed, [F.member()], 0);
  await x.save(1);
  await g.DataManager.loadGame(1);
  assert.deepEqual(numbers(app.hallOfFameSnapshot()), [2,3]);
});

test('bad current archives refuse at the normal read and write gates before persistence', async t => {
  const x = setup(t), {g, h} = x;
  await x.save(1);
  const good = x.current();
  const baseline = () => {
    const game = x.fresh();
    game.hallOfFame = register(game.hallOfFame, [F.member()], 5);
    return game;
  };
  for (const [damage, field] of [
    [game => {delete game.hallOfFame;}, '$.hallOfFame'],
    [game => {game.hallOfFame.entryCount = 0;}, '$.hallOfFame.entries'],
    [game => {game.hallOfFame.entries[0][0].hp = 5;}, '$.hallOfFame.entries[0][0].hp'],
    [game => {game.hallOfFame.entries[0][0].publicId = '?????';}, '$.hallOfFame.entries[0][0].publicId'],
  ]) {
    const bad = baseline();
    damage(bad);
    await x.rawSlot(2, bad);
    const before = x.fileImage(), writes = h.records();
    await assert.rejects(g.DataManager.loadGame(2), /state-unusable: invalid: the original schema 12 document is invalid/);
    assert.equal(x.current(), good);
    g.$gameSystem._psGame = bad;
    await assert.rejects(g.DataManager.saveGame(1), error => error.message.includes(field));
    g.$gameSystem._psGame = good;
    assert.deepEqual(h.records(), writes);
    assert.deepEqual(x.fileImage(), before);
  }
});
