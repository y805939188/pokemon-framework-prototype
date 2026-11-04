'use strict';
// WP67-A 3.2 / 9.1 and catalog K34: pure presentation contract only.
// Explicit command: node --test experiments/step5/4/test-brief-message.cjs
// No Scene consumer, shared test-list entry, NW, physical input or Ruby claim.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ROOT = path.resolve(__dirname, '../../..');
let temporary, BriefMessageStep, BattleSceneController;

test.before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-brief-message-'));
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: {
    outDir: temporary, minify: false, lib: {
      entry: { message: path.join(ROOT, 'src/plugins/battleflow/brief-message.ts'),
        controller: path.join(ROOT, 'src/plugins/battleflow/controller.ts') },
      formats: ['cjs'], fileName: (_format, name) => `${name}.cjs`,
    },
  } });
  ({ BriefMessageStep } = require(path.join(temporary, 'message.cjs')));
  ({ BattleSceneController } = require(path.join(temporary, 'controller.cjs')));
});
test.after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

function setup(text = 'A中😀B', instant = false) {
  const f = { current: true, update: 0, input: false, displayed: null, paints: [], closes: 0 };
  f.message = new BriefMessageStep(text, {
    current: () => f.current, update: () => f.update, useOrBack: () => f.input,
    paint: value => { f.displayed = value; f.paints.push(value); },
    close: () => { f.closes++; f.displayed = null; },
  }, { instantText: () => instant });
  f.tick = (now, input = false, step = f.message) => {
    f.update++; f.input = input; return step.advance(now);
  };
  return f;
}

test('Unicode typing releases the flow at full paint and leaves text resident', () => {
  const f = setup();
  assert.equal(f.tick(0, true), false); // First-draw input cannot skip text.
  assert.equal(f.displayed, '');
  assert.equal(f.tick(30), false);
  assert.equal(f.displayed, 'A');
  assert.equal(f.tick(90), false);
  assert.equal(f.displayed, 'A中😀');
  assert.equal(f.tick(120), true); // No extra update or one-second wait here.
  assert.equal(f.displayed, 'A中😀B');
  assert.equal(f.message.snapshot().phase, 'resident');
  assert.equal(f.message.snapshot().fullyShownAt, 120);
  assert.equal(f.tick(60000, true), true);
  assert.equal(f.displayed, 'A中😀B');
  assert.equal(f.closes, 0);
});

test('USE/BACK fast-forwards typing once without closing the resident message', () => {
  const f = setup();
  f.tick(0);
  f.input = true;
  assert.equal(f.message.advance(1), false); // Same host update is inert.
  assert.equal(f.displayed, '');
  assert.equal(f.tick(1, true), true);
  assert.equal(f.displayed, 'A中😀B');
  const paints = f.paints.length;
  assert.equal(f.message.advance(999), true);
  assert.equal(f.tick(1000, true), true);
  assert.equal(f.paints.length, paints);
  assert.equal(f.closes, 0);
});

test('the next-message gate adds a fresh second after arbitrarily long parallel work', () => {
  const f = setup('x');
  f.tick(0); f.tick(30);
  const next = f.message.beforeNextMessage();
  assert.equal(next, f.message.beforeNextMessage());
  assert.equal(next.advance(30), false); // Cannot start on the full-paint update.
  assert.equal(f.message.snapshot().replacementRequestedAt, null);
  assert.equal(f.tick(10000, true, next), false);
  assert.equal(f.message.snapshot().replacementRequestedAt, 10000);
  assert.equal(f.tick(10999, true, next), false); // Input does not skip this wait.
  assert.equal(f.displayed, 'x');
  assert.equal(f.tick(11000, false, next), true);
  assert.equal(f.displayed, null);
  assert.equal(f.closes, 1);
  assert.equal(f.tick(12000, true, next), true);
  assert.equal(f.closes, 1);
});

test('late full paint and empty text both release immediately, then wait before replacement', () => {
  for (const text of ['x', '']) {
    const f = setup(text);
    assert.equal(f.tick(0), text === '');
    if (text) assert.equal(f.tick(5000), true);
    assert.equal(f.message.snapshot().fullyShownAt, text ? 5000 : 0);
    const next = f.message.beforeNextMessage();
    assert.equal(f.tick(7000, false, next), false);
    assert.equal(f.tick(7999, false, next), false);
    assert.equal(f.tick(8000, false, next), true);
    assert.equal(f.closes, 1);
  }
});

test('animation clears only the brief marker, preserving text until replacement without a wait', () => {
  for (const alreadyWaiting of [false, true]) {
    const f = setup('Go!');
    f.tick(0); f.tick(90);
    const next = f.message.beforeNextMessage();
    if (alreadyWaiting) assert.equal(f.tick(100, false, next), false);
    f.message.clearBrief(); f.message.clearBrief();
    assert.equal(f.message.snapshot().waitBeforeNext, false);
    assert.equal(f.displayed, 'Go!');
    assert.equal(f.closes, 0);
    assert.equal(f.tick(101, false, next), true);
    f.message.cancel(); next.cancel();
    assert.equal(f.closes, 1);
    assert.equal(f.message.snapshot().replacementRequestedAt, alreadyWaiting ? 100 : null);
    assert.equal(f.displayed, null);
  }
});

test('owner retirement clears partial, resident and waiting presentations once', () => {
  for (const phase of ['typing', 'resident', 'waiting']) {
    const f = setup('x');
    f.tick(0);
    if (phase !== 'typing') f.tick(30);
    const next = f.message.beforeNextMessage();
    if (phase === 'waiting') f.tick(40, false, next);
    const paints = f.paints.length;
    f.current = false;
    assert.equal(f.tick(50, true, phase === 'waiting' ? next : f.message), true);
    assert.equal(f.tick(60000, true, next), true);
    f.message.cancel();
    assert.equal(f.paints.length, paints);
    assert.equal(f.displayed, null);
    assert.equal(f.closes, 1);
  }
});

test('noninteractive text fast-forward preserves the next-message one-second wait', () => {
  const f = setup('A中😀B', true);
  assert.equal(f.tick(0), true);
  assert.equal(f.displayed, 'A中😀B');
  const next = f.message.beforeNextMessage();
  assert.equal(f.tick(1, false, next), false);
  assert.equal(f.tick(1000, false, next), false);
  assert.equal(f.tick(1001, false, next), true);
});

test('a next-message gate cannot overtake unfinished text', () => {
  const f = setup();
  f.tick(0);
  assert.throws(() => f.message.beforeNextMessage().advance(30),
    /brief text must finish before replacement/);
  assert.equal(f.displayed, '');
  assert.equal(f.closes, 0);
  assert.equal(f.tick(120), true);
});

test('renderless queue runs subsequent animation while brief remains, then gates the next message', () => {
  const f = setup('Go!');
  let now = 0, animationStarted = false, animationDone = false, nextShown = false;
  const controller = new BattleSceneController({
    current: () => f.current, active: () => true, closedFailure: () => null,
    hideInput() {}, appendLine() { assert.fail('unexpected string presentation'); },
    refreshStatus() {}, afterMessages() {}, abort(error) { throw error; },
    unusableView(error) { throw error; }, now: () => now, actionMeasured() {},
  });
  const animation = { kind: 'visual', cancel() {}, advance() {
    animationStarted = true; assert.equal(f.displayed, 'Go!'); return animationDone;
  } };
  const next = { kind: 'visual', cancel() {}, advance() {
    nextShown = true; assert.equal(f.displayed, null); return true;
  } };
  controller.enqueue([f.message, animation, f.message.beforeNextMessage(), next]);
  const tick = at => { now = at; f.update++; controller.tick(false, 0); };
  tick(0); tick(90);
  assert.equal(controller.queue.length, 3);
  assert.equal(f.closes, 0);
  tick(91);
  assert.equal(animationStarted, true);
  assert.equal(nextShown, false);
  animationDone = true; tick(5090); tick(5091);
  tick(6090); assert.equal(nextShown, false); assert.equal(f.displayed, 'Go!');
  tick(6091); assert.equal(controller.queue.length, 1); assert.equal(f.closes, 1);
  tick(6092); assert.equal(nextShown, true); assert.equal(controller.queue.length, 0);
  controller.dispose();
});
