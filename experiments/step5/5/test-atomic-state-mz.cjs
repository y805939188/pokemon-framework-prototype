'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('atomic');
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { types } = require('node:util');
const { createMZAtomicStatePort } = require(path.join(process.env.PF_E1_PARENT_OUT, 'src/plugins/world/atomic-state-mz.js'));
const fixture = () => {
  const root = { $gameSystem: { _psGame: { marker: 'old' } } }, calls = [];
  const legacy = { read() { calls.push('read'); return root.$gameSystem._psGame; }, replace() { throw Error('atomic must not use legacy replace'); } };
  return { root, calls, port: createMZAtomicStatePort(root, legacy, types.isProxy) };
};
test('native slot observes actual game after reentrant preparation then installs with no provider calls', () => {
  const h = fixture();
  const value = h.port.atomic(() => {
    h.root.$gameSystem._psGame = { marker: 'changed' }; h.calls.push('prepare');
    return actual => { assert.equal(actual.marker, 'changed'); h.calls.push('finish'); return { next: { marker: 'next' }, value: 41 }; };
  });
  assert.equal(value, 41); assert.deepEqual(h.calls, ['read', 'prepare', 'finish']); assert.equal(h.root.$gameSystem._psGame.marker, 'next');
});
test('observation-only access does not replace the actual state', () => {
  const h = fixture(), original = h.root.$gameSystem._psGame;
  assert.equal(h.port.atomic(() => actual => ({ value: actual })), original); assert.equal(h.root.$gameSystem._psGame, original);
});
test('throwing finisher keeps native slot unchanged', () => {
  const h = fixture(), original = h.root.$gameSystem._psGame;
  assert.throws(() => h.port.atomic(() => () => { throw Error('cancelled'); }), /cancelled/); assert.equal(h.root.$gameSystem._psGame, original);
});
for (const kind of ['getter', 'setter', 'readonly', 'system-proxy', 'game-proxy', 'save-error']) test('native slot rejects ' + kind + ' introduced during preparation', () => {
  const h = fixture(); let finished = false, traps = 0;
  assert.throws(() => h.port.atomic(() => {
    if (kind === 'getter' || kind === 'setter') Object.defineProperty(h.root.$gameSystem, '_psGame', { configurable: true, [kind === 'getter' ? 'get' : 'set']() { traps++; } });
    if (kind === 'readonly') Object.defineProperty(h.root.$gameSystem, '_psGame', { writable: false });
    if (kind === 'system-proxy') h.root.$gameSystem = new Proxy(h.root.$gameSystem, { getOwnPropertyDescriptor() { traps++; throw Error('trap'); } });
    if (kind === 'game-proxy') h.root.$gameSystem._psGame = new Proxy(h.root.$gameSystem._psGame, { get() { traps++; throw Error('trap'); } });
    if (kind === 'save-error') h.root.$gameSystem._psSaveError = { code: 'synthetic' };
    return () => { finished = true; return { value: 1 }; };
  }), /atomic-state-/); assert.equal(finished, false); assert.equal(traps, 0);
});
test('native slot rejects root Proxy before any descriptor trap', () => {
  let traps = 0; const root = new Proxy({}, { getOwnPropertyDescriptor() { traps++; } });
  assert.throws(() => createMZAtomicStatePort(root, {}, types.isProxy), /unsafe-object/); assert.equal(traps, 0);
});
