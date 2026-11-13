'use strict';
// Compile real host consumers. A dynamically loaded runtime must not erase application/port types.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const HOST = path.join(ROOT, 'src/plugins/application-host').split(path.sep).join('/');
const APP = path.join(ROOT, 'src/framework/app').split(path.sep).join('/');
const PRODUCTION = path.join(ROOT, 'src/framework/production').split(path.sep).join('/');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-host-types-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
// Compile an isolated copy of the actual IIFE consumer, with its unchanged imports linked read-only.
// This catches a regression where the exported view is typed but the local accessor/constructor remains any.
function compilePlugin(name, mutate = source => source) {
  const sandbox = fs.mkdtempSync(path.join(dir, 'plugin-'));
  const plugins = path.join(sandbox, 'src/plugins');
  fs.mkdirSync(plugins, { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'src/framework'), path.join(sandbox, 'src/framework'), 'dir');
  for (const entry of fs.readdirSync(path.join(ROOT, 'src/plugins'))) {
    if (entry !== name + '.ts') fs.symlinkSync(path.join(ROOT, 'src/plugins', entry), path.join(plugins, entry));
  }
  const file = path.join(plugins, name + '.ts');
  fs.writeFileSync(file, mutate(fs.readFileSync(path.join(ROOT, 'src/plugins', name + '.ts'), 'utf8')));
  const config = path.join(sandbox, 'tsconfig.json');
  fs.writeFileSync(config, JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    noEmit: true, skipLibCheck: false, lib: ['ES2022'], types: [],
    typeRoots: [path.join(ROOT, 'src/vendor/rpgreactor/types/compat')],
  }, files: [file, ...['globals.d.ts', 'compat/lib.dom.generated.d.ts'].map(p => path.join(ROOT, 'src/vendor/rpgreactor/types', p))] }));
  const result = spawnSync(process.execPath, [path.join(ROOT, 'src/node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { code: result.status, output: result.stdout + result.stderr };
}
function compile(name, source) {
  const file = path.join(dir, name + '.ts');
  fs.writeFileSync(file, source);
  const config = path.join(dir, name + '.json');
  fs.writeFileSync(config, JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    noEmit: true, skipLibCheck: false, lib: ['ES2022'], types: ['node'],
    typeRoots: [path.join(ROOT, 'src/node_modules/@types')],
  }, files: [file] }));
  const result = spawnSync(process.execPath, [path.join(ROOT, 'src/node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { code: result.status, output: result.stdout + result.stderr };
}
const imports = `import type { ApplicationHost, HostApplication, ProductionRuntime, LearningApplication } from ${JSON.stringify(HOST)};\nimport type { BattleHandle, GameApplicationPorts } from ${JSON.stringify(APP)};\n`;
test('host accessor, production constructor and narrow learning view retain real application signatures', () => {
  const r = compile('consumer', imports + `
type IsAny<T> = 0 extends (1 & T) ? true : false;
type NoAny<T extends false> = T;
type AccessorIsTyped = NoAny<IsAny<ReturnType<ApplicationHost['app']>>>;
type ConstructorIsTyped = NoAny<IsAny<ProductionRuntime['app']['GameApplication']>>;
type LearningIsTyped = NoAny<IsAny<ReturnType<LearningApplication['beginLearning']>>>;
type FacadeIsTyped = NoAny<IsAny<ReturnType<ApplicationHost['resolveEvolution']>>>;
declare const actual: typeof import(${JSON.stringify(PRODUCTION)});
const checked: ProductionRuntime = actual;
declare const host: ApplicationHost, runtime: ProductionRuntime;
declare const ports: ConstructorParameters<ProductionRuntime['app']['GameApplication']>[0];
const created = new runtime.app.GameApplication(ports);
const application: HostApplication = host.app();
const learning: LearningApplication = application;
const outcome = learning.beginLearning({ kind: 'forget', memberId: 'P1' });
if (outcome.status === 'pending') learning.resolveLearning(outcome.view.token, outcome.view.revision, { kind: 'forget', slot: null });
void created;
`);
  assert.equal(r.code, 0, r.output);
});
for (const [name, source] of [
  ['accessor-argument', `declare const host: ApplicationHost; host.app().resolveLearning('token', 'wrong revision', {kind:'retry'});`],
  ['facade-argument', `declare const host: ApplicationHost; host.resolveEvolution('token', 'wrong revision', {kind:'retry'});`],
  ['learning-intent', `declare const app: LearningApplication; app.beginLearning({kind:'forget',memberId:42});`],
  ['port-return', `const state: GameApplicationPorts<BattleHandle>['state'] = {read:()=>42,replace:()=>{}};`],
  ['production-port', `declare const runtime: ProductionRuntime; new runtime.app.GameApplication({state:{read:()=>42,replace:()=>{}},sessions:{create:async()=>({result:()=>42})},content:()=>({content:{species:{}}}),projection:{project:()=>{}}});`],
  ['narrow-view', `declare const app: LearningApplication; app.startNewGame();`],
]) test(`invalid ${name} remains a compiler error`, () => {
  const r = compile(name, imports + source);
  assert.notEqual(r.code, 0, 'invalid host consumer compiled');
  assert.match(r.output, /TS(?:2322|2345|2339|2353)/, r.output);
  assert.doesNotMatch(r.output, /Cannot find module|Cannot find type definition/, r.output);
});
for (const plugin of ['PS_BattleFlow', 'PS_Progression']) test(`actual ${plugin} application call chain is checked, without ambient Node types`, () => {
  const positive = compilePlugin(plugin);
  assert.equal(positive.code, 0, positive.output);
  const negative = compilePlugin(plugin, source => {
    const marker = plugin === 'PS_BattleFlow' ? '  W.PSFlow = PSFlow;' : ' const tr=';
    assert(source.includes(marker), 'consumer mutation point must exist');
    const call = plugin === 'PS_BattleFlow' ? 'PSFlow.app()' : 'app()';
    return source.replace(marker, `${call}.resolveLearning('token', 'invalid revision', {kind:'retry'});\n${marker}`);
  });
  assert.notEqual(negative.code, 0, 'actual application accessor lost its type');
  assert.match(negative.output, /TS2345/, negative.output);
});
test('actual production construction rejects a wrongly wired state port', () => {
  const result = compilePlugin('PS_BattleFlow', source => {
    const marker = 'state: { read: () => PSFlow.game()';
    assert(source.includes(marker));
    return source.replace(marker, 'state: { read: () => 42');
  });
  assert.notEqual(result.code, 0, 'production port configuration lost its type');
  assert.match(result.output, /TS2322/, result.output);
});
for (const [plugin, call] of [
  ['PS_Inventory', "app().inventoryRequest('token', 42, {kind:'browse',pocket:1,index:0});"],
  ['PS_Management', "app().manage('token', 42, {kind:'cancel'});"],
  ['PS_Evolution', 'app().describeLearningMove(42);'],
  ['PS_Pokedex', "flow().app().resolvePokedex('token', 'invalid revision', {kind:'technical-terminate'});"],
]) test(`actual ${plugin} local application cannot erase argument types`, () => {
  const positive = compilePlugin(plugin);
  assert.equal(positive.code, 0, positive.output);
  const negative = compilePlugin(plugin, source => {
    const marker = ' class Controller {';
    assert(source.includes(marker));
    return source.replace(marker, call + '\n' + marker);
  });
  assert.notEqual(negative.code, 0, 'UI application accessor became any');
  assert.match(negative.output, /TS2345/, negative.output);
});
