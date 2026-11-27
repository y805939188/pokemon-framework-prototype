'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {navigationHost, E} = require('../interface/navigation-host.cjs');

const storageRows = ['storage', 'logoff'];
const historyRows = ['storage', 'hallOfFame', 'logoff'];
const symbols = pc => Array.from(pc._commands._list, row => row.symbol);
const member = (nickname, patch = {}) => ({
  species:'Charizard', form:0, nickname, gender:'F', level:42, publicId:'00128',
  shiny:false, superShiny:false, isEgg:false, ...patch,
});
const command = {code:357, indent:0, parameters:['PS_Management','ShowPC','PC',{}]};
const stop = {code:0, indent:0, parameters:[]};

function setup(history, options = {}) {
  const h = navigationHost({lang:'en', ...options, edit(game) {
    game.hallOfFame = history;
    game.stats.hall_of_fame_entry_count = 71;
  }});
  const g = h.G;
  g.DataManager.saveGame = () => assert.fail('a read-only PC must not save');
  const original = h.app.hallOfFameSnapshot;
  let snapshots = 0;
  h.app.hallOfFameSnapshot = function () { snapshots++; return original(); };
  const interpreter = h.enter([structuredClone(command), {...stop}]);
  h.transition();
  h.ready();
  assert.equal(h.scene().constructor, g.Scene_PSPC);
  assert(interpreter.updateWaitMode());
  const pc = h.scene();

  function lines(action) {
    const from = h.draws.length;
    action();
    return h.draws.slice(from).map(row => row.text);
  }
  function open() {
    const access = lines(() => h.choose('hallOfFame'));
    assert.notEqual(h.scene().constructor, g.Scene_PSPC);
    return access;
  }
  function assertReturned() {
    assert.equal(h.scene().constructor, g.Scene_PSPC);
    assert(h.scene()._commands.active);
    assert.equal(h.scene()._commands.currentSymbol(), 'storage');
    assert(interpreter.updateWaitMode());
  }
  function assertUnchanged(before, replacements = []) {
    assert.equal(JSON.stringify(h.x.state.current()), before);
    assert.deepEqual(h.x.state.replaced, replacements);
    assert.deepEqual(h.writes, []);
  }
  return {...h, pc, interpreter, lines, open, assertReturned, assertUnchanged, get snapshots(){return snapshots;}};
}

for (const [label, history] of [['unavailable', null], ['never registered', {entryCount:0, entries:[]}]]) {
  test('ordinary ShowPC hides ' + label + ' even with a positive legacy statistic', () => {
    const h = setup(history), before = JSON.stringify(h.x.state.current());
    assert.deepEqual(symbols(h.pc), storageRows);
    assert.equal(h.snapshots, 0);
    h.choose('logoff');
    h.tick();
    assert.equal(h.scene().constructor, h.G.Scene_Map);
    assert(!h.interpreter.isRunning());
    h.assertUnchanged(before);
  });
}

test('positive cap-zero history opens a localized safe empty screen and returns to PC through its touch button', () => {
  const h = setup({entryCount:8, entries:[]}, {lang:'zh', width:512, height:384, touchUI:true});
  const before = JSON.stringify(h.x.state.current());
  assert.deepEqual(symbols(h.pc), historyRows);
  assert.equal(h.pc._commands._list[1].name, '名人堂');
  assert(h.open().includes('已访问名人堂。'));
  assert.equal(h.snapshots, 1);
  const rows = h.lines(() => h.press('ok'));
  assert(rows.includes('暂无保留的名人堂记录。'));
  assert(!rows.some(text => text.includes('第 8 届')));
  h.frame('ok','right');
  assert.notEqual(h.scene().constructor, h.G.Scene_PSPC);
  const cancel = h.scene()._cancelButton;
  cancel.onClick();
  h.transition();
  h.assertReturned();
  assert.equal(h.snapshots, 1);
  h.assertUnchanged(before);
});

test('a retained zero-member entry has its own numbered empty state and can browse older entries', () => {
  const h = setup({entryCount:10, entries:[[member('Older')], []]});
  const before = JSON.stringify(h.x.state.current());
  h.open();
  const empty = h.lines(() => h.press('ok'));
  assert(empty.includes('Hall of Fame No. 10'));
  assert(empty.includes('This entry has no members.'));
  const older = h.lines(() => h.press('ok'));
  assert(older.includes('Hall of Fame No. 9'));
  assert(older.includes('Older  (1/1)'));
  const backToEmpty = h.lines(() => h.press('left'));
  assert(backToEmpty.includes('This entry has no members.'));
  h.press('cancel');
  h.assertReturned();
  h.assertUnchanged(before);
});

test('latest entry is detached, opens once, and displays localized names, egg masks and missing species', () => {
  const literal = 'Saved \\C[2] <name>';
  const history = {entryCount:12, entries:[[member('Older')], [
    member(literal, {form:2}),
    member('Hidden Egg Name', {species:'Hidden Egg Species', isEgg:true, publicId:'?????'}),
    member(null, {species:'retired-species', publicId:null}),
  ]]};
  const h = setup(history);
  const lookups = [];
  h.G.PSFlow.speciesName = (species, form) => {
    lookups.push([species,form]);
    return species === 'Charizard' ? 'Charizard Form Two' : '';
  };
  assert.deepEqual(symbols(h.pc), historyRows);
  assert.equal(h.pc._commands._list[1].name, 'Hall of Fame');
  assert.equal(h.snapshots, 0, 'menu availability does not copy the archive');
  assert(h.open().includes('Accessed the Hall of Fame.'));
  h.pc._commands.callHandler('hallOfFame');
  assert.equal(h.snapshots, 1);
  const updated = structuredClone(h.x.state.current());
  updated.hallOfFame.entries[1][0].nickname = 'Changed archive fixture';
  updated.party[0].nickname = 'Live rename';
  h.x.state.replace(updated);
  const replacements = [...h.x.state.replaced];
  const before = JSON.stringify(h.x.state.current());
  const latest = h.lines(() => h.press('ok'));
  assert(latest.includes('Hall of Fame No. 12'));
  assert(latest.includes(literal + '  (1/3)'));
  assert(latest.some(line => line.endsWith('Charizard Form Two ♀')));
  assert(latest.includes('Level 42'));
  assert(latest.includes('ID No. 00128'));
  assert.deepEqual(lookups, [['Charizard',2]]);
  const egg = h.lines(() => h.press('right'));
  assert(egg.includes('Egg  (2/3)') && egg.includes('Egg') && egg.includes('ID No. ?????'));
  assert(!egg.some(text => text.includes('Hidden Egg') || text.startsWith('Level')));
  assert.equal(lookups.length, 1);
  const missing = h.lines(() => h.press('right'));
  assert(missing.includes('retired-species  (3/3)'));
  assert(missing.includes('ID No. —'));
  const older = h.lines(() => h.press('right'));
  assert(older.includes('Hall of Fame No. 11') && older.includes('Older  (1/1)'));
  const newer = h.lines(() => h.press('left'));
  assert(newer.includes('Hall of Fame No. 12') && newer.includes('retired-species  (3/3)'));
  h.press('cancel');
  h.assertReturned();
  assert.equal(h.snapshots, 1);
  h.open();
  const reopened = h.lines(() => h.press('ok'));
  assert(reopened.includes('Changed archive fixture  (1/3)'));
  assert.equal(h.snapshots, 2);
  h.press('cancel');
  h.assertReturned();
  h.assertUnchanged(before, replacements);
});

for (const [keys, expected] of [
  [['left'], null],
  [['right'], ['Hall of Fame No. 18','Two  (2/3)']],
  [['left','right'], ['Hall of Fame No. 19','One  (1/3)']],
  [['cancel','ok','left','right'], null],
]) {
  test('WP67-B same-frame order at one retained entry: ' + keys.join('+'), () => {
    const h = setup({entryCount:18, entries:[[member('One'),member('Two'),member('Three')]]});
    const before = JSON.stringify(h.x.state.current());
    h.open();
    h.press('ok');
    // Native Input only returns the latest trigger. The pressed-state sampling must
    // still see independent simultaneous button edges in the production browser.
    h.G.Input.isPressed = key => h.keys.has(key);
    h.G.Input.isTriggered = key => key === keys.at(-1) && h.keys.has(key);
    const rows = h.lines(() => h.frame(...keys));
    if (expected) {
      for (const text of expected) assert(rows.includes(text));
      assert.notEqual(h.scene().constructor, h.G.Scene_PSPC);
      h.frame();
      h.press('cancel');
    } else {
      assert.deepEqual(rows, []);
      h.transition();
    }
    h.assertReturned();
    h.assertUnchanged(before);
  });
}

test('USE is handled before LEFT and RIGHT, jumping once to the older entry', () => {
  const h = setup({entryCount:5, entries:[[member('Older 1'),member('Older 2')],[member('Latest')]]});
  const before = JSON.stringify(h.x.state.current());
  h.open();
  h.press('ok');
  const rows = h.lines(() => h.frame('right','left','ok'));
  assert(rows.includes('Hall of Fame No. 4'));
  assert(rows.includes('Older 1  (1/2)'));
  h.press('ok');
  h.assertReturned();
  h.assertUnchanged(before);
});

test('language redraw keeps the current member and does not query the archive again', () => {
  const h = setup({entryCount:5, entries:[[member('One'),member('Two')]]});
  const before = JSON.stringify(h.x.state.current());
  h.open();
  h.press('ok');
  h.press('right');
  assert.deepEqual(h.lines(() => h.frame()), []);
  h.G.PSFlow.translator = () => E.i18n.translatorFor('zh');
  const localized = h.lines(() => h.frame());
  assert(localized.includes('名人堂 第 5 届'));
  assert(localized.includes('Two　（2/2）'));
  assert(localized.includes('等级 42'));
  assert.equal(h.snapshots, 1);
  h.press('cancel');
  h.assertReturned();
  h.assertUnchanged(before);
});

test('host state replacement retires the history request and lets a new PC event open', () => {
  const h = setup({entryCount:2, entries:[[member('Old timeline')]]});
  h.open();
  h.app.stateReplacedByHost();
  const next = structuredClone(h.x.state.current());
  next.hallOfFame = null;
  h.x.state.replace(next);
  assert.deepEqual(h.lines(() => h.frame('ok','right')), []);
  h.transition(); // stale parent drains to the map
  h.transition();
  h.tick();
  assert(!h.interpreter.isRunning());
  assert.equal(h.scene().constructor, h.G.Scene_Map);
  assert.equal(h.G.SceneManager._stack.length, 0);
  assert.equal(h.snapshots, 1);
  h.enter([structuredClone(command), {...stop}]);
  h.transition();
  assert.deepEqual(symbols(h.scene()), storageRows);
  assert.deepEqual(h.writes, []);
  assert.equal(h.snapshots, 1);
});
