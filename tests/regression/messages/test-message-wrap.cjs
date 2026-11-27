'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {host} = require('./message-host.cjs');
const {rowGeometry} = require('./message-rows-host.cjs');
const {choicesHost} = require('./choices-host.cjs');

function measuredGeometry(G, context) {
  const geometry = rowGeometry(G, context);
  const measured = [];
  G.Bitmap.prototype.measureTextWidth = function (text) {
    measured.push({text, fontSize: this.fontSize, bold: this.fontBold, italic: this.fontItalic});
    return Array.from(text).reduce((width, char) => width + (char === ' ' ? 4 : 8), 0);
  };
  return {...geometry, measured};
}

function layoutHost(available, lang = 'en') {
  // Native geometry subtracts two 12px paddings and a 4px message inset.
  return host(lang, available + 28, 624, false, measuredGeometry);
}

function drawnLines(h) {
  const lines = new Map();
  for (const {text, y} of h.draws) lines.set(y, (lines.get(y) ?? '') + text);
  return [...lines.values()];
}

function showToPause(h, zh, en = zh) {
  h.show(zh, en);
  h.until(() => h.win.pause);
}

test('WP17 plain wrap reserves two units and moves a spaced word at width 21', () => {
  const h = layoutHost(21);
  showToPause(h, 'A B');
  assert.equal(h.win.innerWidth, 25);
  assert.equal(h.draws[0].x, 4);
  assert.deepEqual(drawnLines(h), ['A ', 'B']);
  assert.equal(h.G.$gameMessage.allText(), 'A B');
});

test('advance plus two exactly equal to width stays on the current line', () => {
  const h = layoutHost(22);
  showToPause(h, 'A B');
  assert.deepEqual(drawnLines(h), ['A B']);
});

test('a continuous overwide word stays whole at line start', () => {
  for (const text of ['AB', '你好世界']) {
    const h = layoutHost(12, 'zh');
    showToPause(h, text);
    assert.deepEqual(drawnLines(h), [text]);
    assert.equal(h.draws[1].x, 12);
  }
});

test('Chinese spaced words move together and language selection stays with ShowMessage', () => {
  const h = layoutHost(37, 'zh');
  showToPause(h, '你好 世界', 'unused English');
  assert.deepEqual(drawnLines(h), ['你好 ', '世界']);
});

test('blank runs survive while the following word moves, even when that word cannot fit', () => {
  const h = layoutHost(21);
  showToPause(h, 'A  BBBB ');
  assert.deepEqual(drawnLines(h), ['A  ', 'BBBB ']);
  const trailing = layoutHost(12);
  showToPause(trailing, 'A  ');
  assert.deepEqual(drawnLines(trailing), ['A  ']);
});

test('literal newlines, authored newlines and br reset measuring on the new line', () => {
  for (const separator of ['\n', '\\n', '<br>']) {
    const h = layoutHost(21);
    showToPause(h, 'A' + separator + 'B C');
    assert.deepEqual(drawnLines(h), ['A', 'B ', 'C']);
  }
});

test('literal expansions and escaped tags retain text and never become controls', () => {
  const h = layoutHost(21);
  h.G.$gameVariables.value = () => '\\C[2]';
  showToPause(h, 'A \\v[1] \\\\l[2] &lt;b&gt;');
  assert.deepEqual(drawnLines(h), ['A ', '\\C[2] ', '\\l[2] ', '<b>']);
  assert(h.draws.every(draw => draw.color === 'white' && !draw.bold));
  assert.equal(h.win.height, 176);
});

test('authored styling, timed waits and explicit pause keep their existing path', () => {
  const style = layoutHost(21);
  showToPause(style, '<b>A B</b>');
  assert.deepEqual(drawnLines(style), ['A B']);
  assert(style.draws.every(draw => draw.bold));

  const wait = layoutHost(21);
  wait.show('A \\wt[2]B\\!C');
  wait.until(() => wait.win.pause);
  assert.deepEqual(drawnLines(wait), ['A B']);
  wait.tick(0, 'ok');
  wait.until(() => wait.win.pause);
  assert.deepEqual(drawnLines(wait), ['A BC']);
});

test('native page break remains a page break with fresh horizontal advance', () => {
  const h = layoutHost(21);
  showToPause(h, 'A\f\nB C');
  assert.equal(h.text(), 'A');
  assert(h.win._textState);
  h.tick(0, 'ok');
  h.draws.length = 0;
  h.until(() => h.win.pause && !h.win._textState);
  assert.deepEqual(drawnLines(h), ['B ', 'C']);
});

test('generated breaks drive native pagination and keep explicit rows through a busy pause', () => {
  const h = layoutHost(21);
  const initialHeight = h.win.height;
  showToPause(h, '\\l[2]A B C');
  assert.equal(h.win.contents.height, 72);
  assert.deepEqual(drawnLines(h), ['A ', 'B ']);
  assert(h.win._textState && !h.G.$gamePlayer.canMove());
  const bitmap = h.win.contents;
  h.tick(0, 'cancel');
  h.draws.length = 0;
  h.until(() => h.win.pause && !h.win._textState);
  assert.equal(h.win.contents, bitmap);
  assert.deepEqual(drawnLines(h), ['C']);
  h.tick(0, 'ok');
  assert.equal(h.win.height, initialHeight);
  assert(h.G.$gamePlayer.canMove());
});

test('regular typing and idle frames measure each layout word only on message start', () => {
  const h = layoutHost(21);
  h.win.contents.fontSize = 52;
  h.win.contents.fontBold = true;
  h.show('A BBBB');
  assert.equal(h.measured.length, 0);
  h.tick(0);
  const wordMeasurements = () => h.measured.filter(m => m.text === 'BBBB');
  assert.deepEqual(wordMeasurements(), [{text:'BBBB', fontSize:28, bold:false, italic:false}]);
  h.until(() => h.win.pause);
  for (let i = 0; i < 30; ++i) h.tick(25);
  assert.equal(wordMeasurements().length, 1);
  assert.deepEqual(drawnLines(h), ['A ', 'BBBB']);
});

test('Show Text and ordinary game messages keep native unwrapped geometry', () => {
  const h = layoutHost(21);
  h.enter([
    {code:101, indent:0, parameters:['', 0, 0, 2, '']},
    {code:401, indent:0, parameters:['A B']},
    {code:0, indent:0, parameters:[]}
  ]);
  h.until(() => h.win.pause);
  assert.deepEqual(drawnLines(h), ['A B']);
  h.until(() => h.win._waitCount === 0);
  h.tick(0, 'ok');
  h.draws.length = 0;
  h.G.$gameMessage.add('A B');
  h.until(() => h.win.pause);
  assert.deepEqual(drawnLines(h), ['A B']);
});

test('inline choice waits for wrapped text on the last page and commits the index once', () => {
  const h = choicesHost('en', 49, 624, false, measuredGeometry);
  const height = h.win.height;
  h.enter([{
    code:357, indent:0,
    parameters:['PS_Management','ShowMessage','Message',{
      textZh:'不用', textEn:'\\l[2]A B C\\ch[13,0,X,Y]', position:'2'
    }]
  }, {code:0, indent:0, parameters:[]}]);
  h.until(() => h.win.pause);
  assert.deepEqual(drawnLines(h), ['A ', 'B ']);
  assert(!h.choice.active && !h.G.$gamePlayer.canMove());
  assert.equal(h.refreshCount(), 0);
  h.tick(0, 'ok');
  h.until(() => h.choice.active);
  assert(h.text().startsWith('A B C'));
  assert.equal(h.win.contents.height, 72);
  h.tick(0, 'down');
  h.tick(0, 'ok');
  assert.equal(h.G.$gameVariables.value(13), 1);
  assert.equal(h.refreshCount(), 1);
  h.tick(0, 'ok');
  assert.equal(h.refreshCount(), 1);
  assert.equal(h.win.height, height);
  assert(h.G.$gamePlayer.canMove());
  assert.deepEqual(h.writes, []);
});
