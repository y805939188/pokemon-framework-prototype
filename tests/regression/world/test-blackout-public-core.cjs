'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../../..');
function bareCore() {
  const exports = {}, context = vm.createContext({ module: { exports }, exports });
  const source = fs.readFileSync(path.join(ROOT, 'js/engine/build/core.cjs'), 'utf8');
  for (const pattern of [/\brequire\s*\(/, /\bprocess\./, /\bBuffer\b/, /__dirname|__filename/, /["']node:/, /\bwindow\.[A-Za-z]|\bdocument\.[A-Za-z]|\$game[A-Z]/]) assert.doesNotMatch(source, pattern);
  vm.runInContext(source, context, { filename: 'core.cjs' });
  for (const name of ['require', 'process', 'Buffer', 'TextEncoder', 'setTimeout', 'window', 'document'])
    assert.equal(vm.runInContext('typeof ' + name, context), 'undefined', name);
  return context;
}
test('public built core exposes blackout alongside the exact existing core key contract without a host', () => {
  const context = bareCore();
  const contract = fs.readFileSync(path.join(ROOT, 'tests/regression/application/test-core-independent.cjs'), 'utf8');
  const literal = contract.match(/Object\.keys\(core\)\.sort\(\), (\[[^\n]+\])\.sort\(\)\);/);
  assert(literal, 'canonical exact core key contract must remain present');
  assert.deepEqual(Object.keys(context.module.exports).sort(), Array.from(vm.runInNewContext(literal[1])).sort());
  assert.equal(typeof context.module.exports.blackout.planBlackoutReturn, 'function');
});
test('public blackout consumer plans no-home settlement and refuses an unavailable center in the bare VM', () => {
  const context = bareCore();
  const actual = JSON.parse(vm.runInContext(`JSON.stringify((() => {
    const blackout = module.exports.blackout;
    const origin = { kind: 'field', sourceId: 'public-core' };
    const noHome = blackout.planBlackoutReturn({ origin, world: { recentCenter: null }, mapResource() { throw Error('no-home must not read resources'); } });
    const center = blackout.planBlackoutReturn({ origin, world: { recentCenter: { mapId: 2, x: 3, y: 4, direction: 2 } }, mapResource() { return { status: 'unavailable' }; } });
    return { noHome, center };
  })())`, context));
  assert.equal(actual.noHome.status, 'planned');
  assert.deepEqual(actual.noHome.plan.destination, { branch: 'no-home' });
  assert.deepEqual(actual.noHome.plan.settlement, { owner: 'field', effects: ['count-blackout', 'heal-party'] });
  assert.deepEqual(actual.noHome.plan.effects, ['show-return-message', 'heal-party', 'clear-escape-point']);
  assert.equal(actual.center.status, 'refused'); assert.equal(actual.center.reason, 'map-unavailable');
});
