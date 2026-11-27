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
test('public built core exposes worldTravel alongside the exact existing core key contract without a host', () => {
  const context = bareCore();
  const contract = fs.readFileSync(path.join(ROOT, 'tests/regression/application/test-core-independent.cjs'), 'utf8');
  const literal = contract.match(/Object\.keys\(core\)\.sort\(\), (\[[^\n]+\])\.sort\(\)\);/);
  assert(literal, 'canonical exact core key contract must remain present');
  assert.deepEqual(Object.keys(context.module.exports).sort(), Array.from(vm.runInNewContext(literal[1])).sort());
  assert.equal(typeof context.module.exports.worldTravel.planTravel, 'function');
});
test('public worldTravel consumer derives confirmed Teleport and cancelled Fly in the bare VM', () => {
  const context = bareCore();
  const actual = JSON.parse(vm.runInContext(`JSON.stringify((() => {
    const travel = module.exports.worldTravel;
    const places = { healingSpot: { mapId: 3, x: 4, y: 5 }, escapePoint: null, characterHome: { mapId: 9, x: 1, y: 1 }, globalHome: null };
    return { digNeeds: travel.travelNeedsConfirmation('dig'), flyNeeds: travel.travelNeedsConfirmation('fly'), needs: travel.travelNeedsConfirmation('teleport'), before: travel.planTravel('teleport', places),
      confirmed: travel.planTravel('teleport', places, { confirmation: 'confirmed' }), cancelled: travel.planTravel('fly', places, { flyDestination: null }) };
  })())`, context));
  assert.equal(actual.digNeeds, true); assert.equal(actual.flyNeeds, false);
  assert.equal(actual.needs, true); assert.deepEqual(actual.before, { status: 'confirmation-required' });
  assert.equal(actual.confirmed.status, 'planned');
  assert.deepEqual(actual.confirmed.plan.target, { mapId: 3, x: 4, y: 5, direction: 2 });
  assert.deepEqual(actual.confirmed.plan.effects.map(effect => effect.kind), ['animation', 'transfer', 'map-bgm', 'refresh', 'clear-escape-point']);
  assert.deepEqual(actual.cancelled, { status: 'cancelled' });
});
