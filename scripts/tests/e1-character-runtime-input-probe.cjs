'use strict';
// Fresh-process pure admission probe. Stops after both real explicit profiles;
// it never imports an App, emitted product module, or business fixture.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Module = require('node:module'), cp = require('node:child_process'), os = require('node:os');
const root = path.resolve(__dirname, '../..'), H = require('../headless-regression-binding.cjs');
const [scenario, key] = process.argv.slice(2);
const captured = H.capture(root, process.env.PF_HEADLESS_REGRESSION_BINDING);
H.boundFiles(captured, ['scripts/tests/e1-character-runtime-input-probe.cjs', 'scripts/tests/e1-character-inputs.cjs', 'scripts/tests/final-production-runtime.cjs', 'tests/support/field/regular-field-action-test-runtime.cjs']);
const input = require('./e1-character-inputs.cjs'), wanted = input.environment(root, captured, {});
for (const name of [...input.KEYS, ...input.STALE]) delete process.env[name];
process.env.PF_FINAL_PRODUCTION_FAMILY = 'e1-fishing-character';
if (scenario !== 'empty' && scenario !== 'single') Object.assign(process.env, wanted);
let expected, temporary;
if (scenario === 'single') { process.env[key] = wanted[key]; expected = /partial character input group/; }
else if (scenario === 'missing') { delete process.env[key]; expected = /partial character input group/; }
else if (scenario === 'foreign') { process.env[key] = '/tmp/foreign-character-input'; expected = /foreign character input/; }
else if (scenario === 'mixed') { process.env.PF_FISHING_HOST_OUT = wanted.PF_E2_PARENT_OUT; expected = /foreign character input: PF_FISHING_HOST_OUT/; }
else if (scenario === 'stale') { process.env[key] = '/tmp/legacy-builder'; expected = /stale character input refused/; }
else if (scenario === 'equal-foreign') {
 temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-character-admission-'));
 const other = path.join(temporary, 'PS_BattleFlow.ts'); fs.copyFileSync(wanted.PF_MZ_BATTLE_SOURCE, other);
 assert.deepEqual(fs.readFileSync(other), fs.readFileSync(wanted.PF_MZ_BATTLE_SOURCE));
 process.env.PF_MZ_BATTLE_SOURCE = other; expected = /foreign character input: PF_MZ_BATTLE_SOURCE/;
} else if (scenario === 'binding-source') {
 temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-character-admission-'));
 const file = path.join(temporary, 'binding.json'), foreign = structuredClone(captured.binding);
 foreign.source.head = '0'.repeat(40); fs.writeFileSync(file, JSON.stringify(foreign));
 process.env.PF_HEADLESS_REGRESSION_BINDING = file; expected = /candidate source changed/;
} else assert(['empty', 'complete', 'warm-partial', 'warm-foreign', 'warm-binding', 'warm-family'].includes(scenario), 'unknown pure probe');
const load = Module._load, spawn = cp.spawnSync;
const counters = {profileImports: 0, prepareCalls: 0, compilerCalls: 0, productImports: 0}, modes = [];
const stop = Error('OWN_POSITIVE_STOP_AFTER_EXPLICIT_PROFILES');
function zero() { for (const key of Object.keys(counters)) counters[key] = 0; modes.length = 0; }
async function refusal(runtime, pattern) {
 let caught; try { await runtime.prepare(); } catch (error) { caught = error; }
 assert(caught, 'actual runtime must refuse the input');
 assert.notStrictEqual(caught, stop, 'refusal must precede the positive stop');
 assert.match(caught.message, pattern);
 assert.deepEqual(counters, {profileImports: 0, prepareCalls: 0, compilerCalls: 0, productImports: 0});
 return caught.message;
}
(async () => {
 let result;
 try {
  cp.spawnSync = function () { counters.compilerCalls++; throw Error('UNEXPECTED_COMPILER'); };
  Module._load = function (request, parent, ...args) {
   if (typeof request === 'string' && request.endsWith('regular-field-action-test-runtime.cjs')) {
    counters.profileImports++;
    const actual = Reflect.apply(load, this, [request, parent, ...args]);
    return {prepare(name) {
     counters.prepareCalls++; const prepared = actual.prepare(name);
     modes.push({profile: name, mode: prepared.mode}); assert.equal(prepared.mode, 'explicit');
     if (name === 'fishing-host') throw stop;
     return prepared;
    }};
   }
   if (typeof request === 'string' && (request.includes('/build/test-field-action-runtime/') || request.endsWith('/js/engine/build/production.cjs') || request.includes('/src/framework/') && request.endsWith('.ts'))) {
    counters.productImports++; throw Error('UNEXPECTED_PRODUCT_IMPORT');
   }
   return Reflect.apply(load, this, [request, parent, ...args]);
  };
  const runtime = require('./final-production-runtime.cjs');
  const before = Object.fromEntries(input.KEYS.map(name => [name, process.env[name] ?? null]));
  if (expected) {
   result = {rejected: true, reason: await refusal(runtime, expected)};
   assert.deepEqual(Object.fromEntries(input.KEYS.map(name => [name, process.env[name] ?? null])), before, 'admission cannot canonicalize the rejected original group');
  } else {
   let caught; try { await runtime.prepare(); } catch (error) { caught = error; }
   assert.strictEqual(caught, stop, 'positive must reach the deliberate stop after real profiles');
   assert.deepEqual(modes, [{profile: 'world-scene', mode: 'explicit'}, {profile: 'fishing-host', mode: 'explicit'}]);
   assert.deepEqual(counters, {profileImports: 1, prepareCalls: 2, compilerCalls: 0, productImports: 0});
   for (const name of input.KEYS) assert.equal(process.env[name], wanted[name]);
   result = {positive: true, modes: [...modes]};
   if (scenario.startsWith('warm-')) {
    zero(); let pattern;
    if (scenario === 'warm-partial') { delete process.env.PF_MZ_OBJECTS; pattern = /partial character input group/; }
    if (scenario === 'warm-foreign') { process.env.PF_MZ_OBJECTS = '/tmp/foreign-native'; pattern = /foreign character input/; }
    if (scenario === 'warm-family') { process.env.PF_FINAL_PRODUCTION_FAMILY = 'e3-companion-current'; pattern = /character preparation family changed/; }
    if (scenario === 'warm-binding') {
     temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-character-admission-'));
     const file = path.join(temporary, 'binding.json'); fs.writeFileSync(file, JSON.stringify(captured.binding));
     process.env.PF_HEADLESS_REGRESSION_BINDING = file; pattern = /parent candidate binding changed or transplanted/;
    }
    result.reentry = {rejected: true, reason: await refusal(runtime, pattern)};
   }
  }
  console.log(JSON.stringify({scenario, key, pid: process.pid, result, counters, modes, businessLoaded: false, temporary: temporary ?? null}));
 } finally { Module._load = load; cp.spawnSync = spawn; }
})().catch(error => { console.error(error); process.exitCode = 1; });
