'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process'), {createHash} = require('node:crypto');
const H = require('../headless-regression-binding.cjs');
const INPUTS = require('./final-production-inputs.json');
const ROOT = fs.realpathSync(path.resolve(__dirname, '../..'));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const families = INPUTS.families;
const states = new Map();
// These finite ordinary production chains use the engine's default local save path.
const ordinaryProjectSave = new Set(['t16', 'defeat', 'e3-companion-cold', 'e3-companion-empty-formal', 'f-load-current']);
const caseSaves = (family, scope) => ordinaryProjectSave.has(family)
  ? path.join(scope, 'profile', 'project', 'save') : path.join(scope, 'save');
const isConsumer = (family, selector) => family === 'f-load-current' && ['L01','L02','L03','L04'].includes(selector)
  || selector === 'C01' || ['defeat','e3-companion-cold'].includes(family) && selector === 'C02'
  || family === 'e3-companion-empty-formal' && ['E01','E02','E03'].includes(selector);
function spec(family, selector) {
  assert(Object.hasOwn(families, family), 'unknown production family: ' + family);
  const record = families[family];
  assert(record.cases.includes(selector), 'unknown production selector: ' + selector);
  const entry = path.join(ROOT, record.entries[selector]);
  assert(fs.lstatSync(entry).isFile(), 'missing explicit case file');
  return {family, selector, record, entry};
}
function inside(file, root) {
  assert.equal(typeof file, 'string');
  const target = path.resolve(file), relative = path.relative(root, target);
  assert(relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'output leaves current private root');
  let cursor = root;
  assert(fs.lstatSync(cursor).isDirectory() && !fs.lstatSync(cursor).isSymbolicLink());
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) break;
    assert(!fs.lstatSync(cursor).isSymbolicLink(), 'linked output refused');
  }
  return target;
}
function inheritedInputs(env) {
  for (const name of ['PF_E3_CASE', 'PF_E3_CASE_ROOT', 'PF_E3_COMPANION_CASE', 'PF_COMPANION_INGRESS_OUTPUT', 'PF_CASE_KIND', 'PF_CASE_ROOT', 'PF_COLD_CASE_KIND', 'PF_COLD_CASE_ROOT', 'PF_COLD_PRODUCER_INPUT', 'PF_E3_MAPSOURCE_RESULTS', 'PF_G_COMMAND_CASE', 'PF_F_FIELD_CASE', 'PF_F_FIELD_OUTPUT', 'PF_E2_FRONT_CASE', 'PF_E2_FRONT_ROOT', 'PF_HOST3_CASE', 'PF_HOST3_ROOT', 'PF_STRENGTH_CASE', 'PF_STRENGTH_ROOT', 'PF_F_NATIVE_CASE', 'PF_F_NATIVE_ROOT', 'PF_F_LOAD_CASE', 'PF_F_LOAD_CASE_ROOT', 'PF_F_LOAD_PRIOR', 'PF_C1_AUTHOR_OUTPUT', 'PF_N11_SOURCE_FIXED', 'PF_F_BRANCH_CASE', 'PF_F_BRANCH_ROOT', 'PF_FINAL_CASE', 'PF_FINAL_CASE_ROOT', 'PF_CHAIN_CASE', 'PF_CHAIN_CASE_ROOT', 'PF_CHAIN_PRODUCER', 'PF_CHAIN_CONTENT', 'PF_CHAIN_PRODUCER_SAVE', 'PF_T16_CASE', 'PF_T16_CASE_ROOT', 'PF_T16_PRODUCER', 'PF_T16_PRODUCER_SAVE', 'PF_E1_CHARACTER_CASE', 'PF_E1_POSE_CASE', 'PF_PRESENTATION_CASE', 'PF_PRESENTATION_OUTPUT', 'PF_TERMINAL_ORIGINAL', 'PF_TRAVEL_ORIGINAL', 'PF_E1_SCENARIO', 'PF_E1_CASE_ROOT', 'PF_E1_BASELINE', 'PF_G_RETRY_CASE', 'PF_G_NATIVE_OUTPUT', 'PF_EVENT_ARTIFACT', 'PF_FINAL_PRODUCTION_FAMILY', 'PF_FINAL_PRODUCTION_SELECTOR', 'PF_FINAL_PRODUCTION_RUN', 'PF_FINAL_PRODUCTION_RECEIPT'])
    assert.equal(env[name], undefined, 'stale case input refused: ' + name);
}
function assertFamilyReceipt(receipt, selected) {
  if (selected.family !== 'f-load-current') return;
  assert.equal(receipt.family, 'f-load-current', 'F pending producer must belong to this family');
  assert.equal(receipt.producerSelector, 'P00', 'F recovery requires its real pending producer');
  assert.deepEqual(Object.keys(receipt.consumerEnv), ['PF_COLD_PRODUCER_INPUT']);
  assert.equal(path.basename(receipt.consumerEnv.PF_COLD_PRODUCER_INPUT), 'P00-input.json');
  assert.deepEqual(receipt.saveFiles.map(row => row.name), ['file8.rmmzsave','global.rmmzsave']);
  assert.deepEqual(receipt.files.map(row => row.path), [receipt.consumerEnv.PF_COLD_PRODUCER_INPUT,...receipt.saveFiles.map(row => row.path)]);
}
function receiptCheck(file, run, captured, selected) {
  inside(file, run);
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  assertFamilyReceipt(receipt, selected);
  assert.equal(receipt.parentBindingSHA256, captured.sha256, 'producer parent binding differs');
  assert.deepEqual(receipt.identity, captured.identity, 'producer source/runtime differs');
  assert.equal(receipt.run, run, 'foreign producer run');
  for (const record of receipt.files) { inside(record.path, run); assert.equal(sha(record.path), record.sha256, 'producer bytes changed'); }
  return receipt;
}
function workerInput(env) {
  const selected = spec(env.PF_FINAL_PRODUCTION_FAMILY, env.PF_FINAL_PRODUCTION_SELECTOR);
  const run = inside(env.PF_FINAL_PRODUCTION_RUN, path.join(ROOT, 'build/headless-final-production'));
  const scope = inside(env[selected.record.scopeEnv], run);
  assert.equal(scope, path.join(run, selected.selector), 'case scope must belong to selected run');
  assert.equal(env[selected.record.selectorEnv], selected.record.selectorValues?.[selected.selector] ?? selected.selector);
  assert.equal(env.PF_E1_POSE_CASE, selected.family === 'e1-fishing-character' && /^POSE\d{2}$/.test(selected.selector) ? selected.selector : undefined, 'unexpected fishing pose selector');
  for (const key of ['PF_TERMINAL_ORIGINAL','PF_TRAVEL_ORIGINAL']) assert.equal(env[key], undefined, 'bootstrap override refused: ' + key);
  assert.equal(process.argv.slice(2).length, 0, 'worker accepts no extra arguments');
  const captured = H.capture(ROOT, env.PF_HEADLESS_REGRESSION_BINDING);
  H.boundFiles(captured, INPUTS.controlledInputs);
  if (isConsumer(selected.family, selected.selector)) {
    const receipt = receiptCheck(env.PF_FINAL_PRODUCTION_RECEIPT, run, captured, selected);
    for (const [key, value] of Object.entries(receipt.consumerEnv)) assert.equal(env[key], value, 'consumer input differs: ' + key);
  }
  if (selected.family === 'e1' && selected.selector === 'visual') {
    const baseline = inside(path.join(run, 'bag/RESULT.json'), run);
    assert.equal(env.PF_E1_BASELINE, baseline, 'visual baseline must be this run\'s preceding Bag result');
    assert(fs.lstatSync(baseline).isFile());
  }
  return {...selected, run, scope};
}
function state(family) {
  if (states.has(family)) return states.get(family);
  inheritedInputs(process.env);
  assert.equal(process.version, 'v22.21.1');
  const captured = H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING);
  H.boundFiles(captured, [...INPUTS.controlledInputs, ...INPUTS.plugins.map(name => 'js/plugins/' + name + '.js')]);
  const parent = inside(path.join(ROOT, 'build/headless-final-production'), ROOT);
  fs.mkdirSync(parent, {recursive: true});
  const run = fs.mkdtempSync(path.join(parent, family + '-'));
  const value = {family, captured, run, completed: [], receipt: null};
  fs.writeFileSync(path.join(run, 'INPUT-BINDING.json'), JSON.stringify({parentBindingSHA256: captured.sha256, identity: captured.identity, inputs: INPUTS}, null, 2) + '\n', {flag: 'wx'});
  states.set(family, value);
  return value;
}
function runCase(family, selector) {
  const selected = spec(family, selector); // Reject selectors before any child or output.
  const s = state(family), {record} = selected;
  const index = record.cases.indexOf(selector);
  assert.deepEqual(s.completed, record.cases.slice(0, index), 'finite cases must run once in declared order');
  H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING, s.captured.sha256);
  let producer;
  if (isConsumer(family, selector)) { assert(s.receipt, 'consumer requires successful same-run producer'); producer = receiptCheck(s.receipt, s.run, s.captured, selected); }
  const scope = inside(path.join(s.run, selector), s.run); assert(!fs.existsSync(scope), 'case output already exists'); fs.mkdirSync(scope);
  const env = {...process.env, PF_FINAL_PRODUCTION_FAMILY: family, PF_FINAL_PRODUCTION_SELECTOR: selector,
    PF_FINAL_PRODUCTION_RUN: s.run, [record.selectorEnv]: record.selectorValues?.[selector] ?? selector, [record.scopeEnv]: scope};
  if (family === 'e1-fishing-character' && /^POSE\d{2}$/.test(selector)) env.PF_E1_POSE_CASE = selector;
  if (['f-native-current','f-load-current','e1-fishing-character','field-presentation-i18n','field-presentation-terminal','travel-presentation-initial','travel-presentation-source-controls','e3-travel-current','e3-travel-diagnostic','e3-companion-current','e3-companion-remove','e3-companion-cold','e3-companion-empty-formal'].includes(family) || family === 'legacy-capture-compat' || family === 'g-native-commands' || family === 'f-field-entry' || family === 'e1' || family === 'g-retry' || family === 'f-branches' || family === 'strength' || family === 'e3-host3' || family === 'e2-current-frontends' || family === 'e2-party-surf-guards') {
    for (const name of ['tmp', 'cache', 'profile']) fs.mkdirSync(inside(path.join(scope, name), s.run));
    env.TMPDIR = path.join(scope, 'tmp'); env.XDG_CACHE_HOME = path.join(scope, 'cache');
  }
  // Establish private profile roots first, before an ordinary save root nests under profile/project.
  fs.mkdirSync(inside(caseSaves(family, scope), s.run), {recursive:true});
  delete env.NODE_TEST_CONTEXT; // This is a separately selected Node test process.
  if (family === 'defeat') env.PF_EVENT_ARTIFACT = path.join(scope, 'producer-observation.json');
  if (family === 'e1' && selector === 'visual') env.PF_E1_BASELINE = inside(path.join(s.run, 'bag/RESULT.json'), s.run);
  if (producer) { Object.assign(env, producer.consumerEnv); env.PF_FINAL_PRODUCTION_RECEIPT = s.receipt; }
  if (producer) {
    const targetSave = inside(caseSaves(family, scope), s.run);
    for (const item of producer.saveFiles) {
      const target = inside(path.join(targetSave, item.name), scope);
      fs.copyFileSync(item.path, target, fs.constants.COPYFILE_EXCL);
      assert.equal(sha(target), item.sha256, 'consumer must read exact same-run physical producer bytes');
    }
  }
  // All arguments, case directories, logs and save/profile roots are fixed before Popen.
  const argv = ['--test', '--test-concurrency=1', '--test-reporter=tap', path.join(__dirname, 'final-production-worker.mjs')];
  const launch = {family, selector, argv: [process.execPath, ...argv], cwd: ROOT, scope, startedAt: new Date().toISOString(), state: 'BEFORE_POPEN'};
  const launchFile = path.join(scope, 'launch.json');
  fs.writeFileSync(launchFile, JSON.stringify(launch, null, 2) + '\n', {flag: 'wx'});
  const result = spawnSync(process.execPath, argv, {cwd: ROOT, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000});
  fs.writeFileSync(path.join(scope, 'raw.tap'), (result.stdout || '') + (result.stderr || ''), {flag: 'wx'});
  Object.assign(launch, {state: 'FINISHED', pid: result.pid, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null,
    endedAt: new Date().toISOString(), synchronousChildWaited: true, rawSHA256: sha(path.join(scope, 'raw.tap'))});
  fs.writeFileSync(launchFile, JSON.stringify(launch, null, 2) + '\n');
  H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING, s.captured.sha256);
  assert.equal(result.error, undefined, 'worker launch failed; preserve ' + scope);
  assert.equal(result.status, 0, 'original case failed; preserve ' + scope + '\n' + result.stdout + result.stderr);
  const count = record.testCounts?.[selector] ?? 1;
  for (const line of ['# tests ' + count, '# pass ' + count, '# fail 0', '# cancelled 0', '# skipped 0']) assert(result.stdout.split('\n').includes(line), 'unexpected original case TAP: ' + line);
  if (family === 'f-load-current' && selector === 'P00') {
    const completed = inside(path.join(scope, 'P00-input.json'), s.run);
    const value = JSON.parse(fs.readFileSync(completed, 'utf8'));
    assert(value.state?.world?.pendingReturn, 'F load producer must save a real pending checkpoint');
    const save = inside(caseSaves(family, scope), scope);
    const saveFiles = ['file8.rmmzsave','global.rmmzsave'].map(name => {
      const file = inside(path.join(save, name), scope);
      const expected = name === 'file8.rmmzsave' ? value.fileSHA256 : value.globalSHA256;
      assert.equal(sha(file), expected, 'F pending producer physical observation differs');
      return {name, path: file, sha256: sha(file)};
    });
    const receipt = {family, producerSelector: selector, run: s.run, parentBindingSHA256: s.captured.sha256,
      identity: s.captured.identity, consumerEnv: {PF_COLD_PRODUCER_INPUT: completed},
      files: [completed,...saveFiles.map(row => row.path)].map(file => ({path: file, sha256: sha(file)})), saveFiles};
    assertFamilyReceipt(receipt, selected);
    s.receipt = path.join(scope, 'PRODUCER-SEAL.json');
    fs.writeFileSync(s.receipt, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  } else if (selector === 'P01' && family === 'e3-companion-cold' || selector === 'P00' && family === 'e3-companion-empty-formal') {
    const completed = inside(path.join(scope, selector+'-input.json'), s.run);
    const save = inside(caseSaves(family, scope), s.run);
    assert(fs.lstatSync(completed).isFile(), 'formal companion producer input missing');
    const saveFiles = ['file1.rmmzsave','global.rmmzsave'].map(name => {
      const file = inside(path.join(save, name), scope);assert(fs.lstatSync(file).isFile());return {name,path:file,sha256:sha(file)};
    });
    const files = [completed,...saveFiles.map(row=>row.path)].map(file=>({path:file,sha256:sha(file)}));
    const receipt = {run:s.run,parentBindingSHA256:s.captured.sha256,identity:s.captured.identity,
      consumerEnv:{PF_COLD_PRODUCER_INPUT:completed},files,saveFiles};
    s.receipt=path.join(scope,'PRODUCER-SEAL.json');fs.writeFileSync(s.receipt,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  } else if (selector === 'P01' && family !== 'native') {
    const completed = path.join(scope, family === 'defeat' ? 'completed.json' : 'producer-input.json');
    const value = JSON.parse(fs.readFileSync(completed, 'utf8'));
    const content = family === 'defeat' ? path.join(scope, 'content.json') : null;
    const save = caseSaves(family, scope);
    const consumerEnv = family === 'defeat'
      ? {PF_CHAIN_PRODUCER: completed, PF_CHAIN_CONTENT: content, PF_CHAIN_PRODUCER_SAVE: save}
      : {PF_T16_PRODUCER: completed, PF_T16_PRODUCER_SAVE: save};
    const saveFiles = Object.keys(value.files).map(name => {
      const file = inside(path.join(save, name + '.rmmzsave'), s.run);
      assert.equal(sha(file), value.files[name].sha256, 'producer physical file matches original body observation');
      return {name: path.basename(file), path: file, sha256: sha(file)};
    });
    const files = [completed, ...(content ? [content] : []), ...saveFiles.map(item => item.path)].map(file => ({path: inside(file, s.run), sha256: sha(file)}));
    const receipt = {run: s.run, parentBindingSHA256: s.captured.sha256, identity: s.captured.identity, consumerEnv, files, saveFiles};
    s.receipt = path.join(scope, 'PRODUCER-SEAL.json'); fs.writeFileSync(s.receipt, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  }
  s.completed.push(selector);
  console.log('original case ' + family + '/' + selector + ' PASS; evidence ' + scope);
  return {scope, run: s.run};
}
module.exports = {spec, inheritedInputs, inside, workerInput, runCase, isConsumer, assertFamilyReceipt};
