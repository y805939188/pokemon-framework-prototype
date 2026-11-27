'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {navigationHost, E} = require('../interface/navigation-host.cjs');

const end = {code:0, indent:0, parameters:[]};
const register = (args = {}) => ({code:357, indent:0, parameters:['PS_Management','RegisterHallOfFame','Register Hall of Fame',args]});
const pcCommand = () => ({code:357, indent:0, parameters:['PS_Management','ShowPC','PC',{}]});

function setup(options = {}) {
  const h = navigationHost({lang:'en', ...options});
  const forbidden = () => assert.fail('registration must not save, play audio or start a presentation');
  h.G.DataManager.saveGame = forbidden;
  h.G.StorageManager.saveObject = forbidden;
  h.G.AudioManager = {playBgm:forbidden, playMe:forbidden, playSe:forbidden};
  function invoke(args) {
    const before = h.scene();
    const following = {code:999, indent:0, parameters:[]};
    let continued = 0;
    h.G.Game_Interpreter.prototype.command999 = () => { continued++; return true; };
    const interpreter = h.enter([register(args), following, {...end}]);
    assert.equal(continued, 1);
    assert.equal(interpreter._waitMode, '');
    assert(!interpreter.isRunning());
    assert.equal(h.scene(), before);
    assert.equal(h.G.SceneManager._nextScene, null);
    assert.equal(h.G.SceneManager._stack.length, 0);
    assert.deepEqual(h.writes, []);
  }
  function openHistory() {
    const interpreter = h.enter([pcCommand(), {...end}]);
    h.transition(); h.ready();
    assert.equal(h.scene().constructor, h.G.Scene_PSPC);
    assert(interpreter.updateWaitMode());
    const start = h.draws.length;
    h.choose('hallOfFame');
    h.press('ok');
    return h.draws.slice(start).map(row => row.text);
  }
  return {...h, invoke, openHistory};
}

test('actual author event invokes App once and PC reads the historically registered party', () => {
  const h = setup({edit(game) {
    game.party[0].nickname = 'Before event';
    game.party[1].isEgg = true;
  }});
  const initial = h.x.state.current();
  const generation = h.app.stateGeneration;
  assert.deepEqual(h.app.hallOfFameSnapshot(), {entryCount:0, entries:[]});
  h.invoke();
  const state = h.x.state.current(), history = h.app.hallOfFameSnapshot();
  assert.equal(h.x.state.replaced.length, 1);
  assert.equal(h.app.stateGeneration, generation);
  assert.deepEqual({...state, hallOfFame:initial.hallOfFame}, initial);
  assert.equal(history.entryCount, 1);
  assert.equal(history.entries[0].members[0].nickname, 'Before event');
  assert.equal(history.entries[0].members[1].publicId, '?????');
  assert.equal(Object.hasOwn(history.entries[0].members[0], 'hp'), false);
  assert.equal(Object.hasOwn(history.entries[0].members[0], 'id'), false);

  const changed = structuredClone(state);
  changed.party[0].nickname = 'Current party rename';
  changed.party[0].hp = 1;
  h.x.state.replace(changed);
  const beforePC = h.x.state.current();
  const shown = h.openHistory();
  assert(shown.includes('Hall of Fame No. 1'));
  assert(shown.includes('Before event  (1/3)'));
  assert(!shown.join('\n').includes('Current party rename'));
  h.press('cancel');
  assert.equal(h.scene().constructor, h.G.Scene_PSPC);
  assert.equal(h.scene()._commands.currentSymbol(), 'storage');
  assert.equal(h.x.state.current(), beforePC);
  assert.deepEqual(h.writes, []);
});

test('the first real registration after schema 11 migration starts at one and keeps old statistics', () => {
  const h = setup({edit(game, content) {
    const legacy = {...game, schema:11};
    delete legacy.hallOfFame;
    legacy.stats.hall_of_fame_entry_count = 9;
    legacy.stats.time_to_enter_hall_of_fame = 875;
    const converted = E.saveSchema.migrateGame(legacy, {content});
    assert.equal(converted.ok, true, JSON.stringify(converted));
    Object.assign(game, converted.state);
  }});
  assert.equal(h.app.hallOfFameSnapshot(), null);
  const before = h.x.state.current();
  h.invoke();
  const now = h.x.state.current();
  assert.equal(now.schema, 12);
  assert.deepEqual(now.stats, before.stats);
  assert.equal(h.app.hallOfFameSnapshot().entries[0].number, 1);
  assert.equal(h.app.hallOfFameSnapshot().entryCount, 1);
  assert.equal(h.x.state.replaced.length, 1);
  assert.deepEqual(h.writes, []);
});

test('legitimate repeated calls append, and the limit removes only one oldest record per call', () => {
  const h = setup();
  const numbers = () => h.app.hallOfFameSnapshot().entries.map(entry => entry.number);
  for (let n = 0; n < 3; n++) h.invoke({historyLimit:'-7'});
  assert.deepEqual(numbers(), [1,2,3]);
  h.invoke({historyLimit:'1'});
  assert.deepEqual(numbers(), [2,3,4]);
  h.invoke({historyLimit:'0'});
  assert.deepEqual(numbers(), [3,4,5]);
  assert.equal(h.app.hallOfFameSnapshot().entryCount, 5);
  assert.equal(h.x.state.replaced.length, 5);
});

test('zero-limit author command keeps an eligible PC entry with a safe empty view', () => {
  const h = setup({lang:'zh'});
  h.invoke({historyLimit:'0'});
  assert.deepEqual(h.app.hallOfFameSnapshot(), {entryCount:1, entries:[]});
  const before = h.x.state.current(), shown = h.openHistory();
  assert(shown.includes('已访问名人堂。'));
  assert(shown.includes('暂无保留的名人堂记录。'));
  assert.equal(h.x.state.current(), before);
  assert.equal(h.x.state.replaced.length, 1);
});

test('an invalid author limit safely refuses despite raw test, without any state or storage write', () => {
  for (const historyLimit of ['1e2', '1.5', '9007199254740992']) {
    const h = setup(), logs = [], before = h.x.state.current();
    h.G.Utils.isOptionValid = key => key === 'test';
    h.G.console = {error:(...args) => logs.push(args)};
    assert.throws(() => h.enter([register({historyLimit}), {...end}]), /RegisterHallOfFame.*WP07-EVENT/);
    assert.deepEqual(logs, [], 'raw test flag is not authenticated author diagnostics');
    assert.equal(h.x.state.current(), before);
    assert.equal(h.x.state.replaced.length, 0);
    assert.deepEqual(h.writes, []);
  }
});

test('ordinary authored trainer victory commits its normal records without registering', async () => {
  const battleId = 'ordinary-trainer-fixture';
  const sessions = E.fakes.createFakeSessions({
    protocol:1, battleId, outcome:{kind:'win', winner:'Player'},
    members:{}, bag:{}, captured:[], dex:{seen:[], owned:[]},
  });
  const h = setup({ports:{sessions}, edit(_game, content) {
    const type = {id:'ordinary-npc', nameKey:'trainer.ordinary', gender:0, baseMoney:10, skillLevel:0, flags:[], items:[]};
    const trainer = {id:'ordinary-route', type:type.id, name:'Trainer', version:0, party:[{species:'Pidgey', level:5, moves:['tackle']}]};
    content.species.Pidgey.abilities = ['Keen Eye'];
    content.species.Pidgey.gender = 'M';
    content.registrationOrder = [{species:'Pidgey', form:0}];
    content.trainerTypeOrder = [type.id];
    content.trainerTypes = {[type.id]:type};
    content.trainers = {[trainer.id]:[trainer]};
  }});
  const request = {battleId, trainer:{id:'ordinary-route', version:0}, seq:1, canLose:true};
  const handle = await h.app.startTrainerBattle(request);
  const preWin = h.x.state.current();
  assert.throws(() => h.G.PluginManager.callCommand({},'PS_Management','RegisterHallOfFame',{}), /WP07-HOST/);
  assert.throws(() => h.app.registerHallOfFame(), /operation-active/);
  assert.equal(h.x.state.current(), preWin);
  const outcome = h.app.finishBattle(handle, request);
  assert.equal(outcome.code, 1, JSON.stringify(outcome));
  assert.equal(outcome.commit, 'applied');
  assert.deepEqual(h.x.state.current().defeatedTrainers['ordinary-route@0'], {id:'ordinary-route', version:0});
  assert.deepEqual(h.app.hallOfFameSnapshot(), {entryCount:0, entries:[]});
  assert.equal(h.x.state.replaced.length, 1);
  assert.deepEqual(h.writes, []);
});

test('a replacement during state validation cannot install the old archive on the new game', () => {
  let content;
  let onContent = () => {};
  const h = setup({edit(_game, value) { content = value; }, ports:{content() {
    onContent();
    return {content};
  }}});
  const newGame = structuredClone(h.x.state.current());
  newGame.money = 164;
  onContent = () => {
    onContent = () => {};
    h.x.state.replace(newGame);
    h.app.stateReplacedByHost();
  };
  assert.throws(() => h.enter([register(), {...end}]), /WP07-HOST/);
  assert.deepEqual(h.x.state.current(), newGame);
  assert.deepEqual(h.app.hallOfFameSnapshot(), {entryCount:0, entries:[]});
  assert.equal(h.x.state.replaced.length, 1);
  assert.deepEqual(h.writes, []);
});
