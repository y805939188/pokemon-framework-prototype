'use strict';
// Input adapter for the original finite production cases. Authority remains in
// the current formal distribution and installed IIFEs; this module only binds inputs.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {createHash} = require('node:crypto'), {pathToFileURL} = require('node:url');
const H = require('../headless-regression-binding.cjs');
const INPUTS = require('./final-production-inputs.json');
const ROOT = fs.realpathSync(path.resolve(__dirname, '../..'));
const sha = data => createHash('sha256').update(data).digest('hex');
let prepared, captured, current, preparedFamily;
function regular(file) { assert(fs.lstatSync(file).isFile(), 'regular input required: ' + file); return fs.realpathSync(file); }
function pluginFile(name) {
  assert(INPUTS.plugins.includes(name), 'unknown production plugin: ' + name);
  return path.join(ROOT, 'js/plugins', name + '.js');
}
function sameExplicit(key, target) {
  if (process.env[key] !== undefined) assert.equal(fs.realpathSync(process.env[key]), fs.realpathSync(target), 'foreign production input: ' + key);
  process.env[key] = target;
}
async function prepare() {
  const family = process.env.PF_FINAL_PRODUCTION_FAMILY;
  const characterFamily = family === 'e1-fishing-character';
  let characterInputs;
  if (characterFamily || preparedFamily === 'e1-fishing-character') {
    if (prepared) assert.equal(family, preparedFamily, 'character preparation family changed');
    // Preserve the inherited group before any canonical environment writes, even
    // when this module already has a prepared promise. Only a wholly absent group
    // lets the formal producer supply all ten current, own-parent inputs.
    const admission = H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING, captured?.sha256);
    H.boundFiles(admission, ['scripts/tests/final-production-runtime.cjs', 'scripts/tests/e1-character-inputs.cjs']);
    characterInputs = require('./e1-character-inputs.cjs').environment(ROOT, admission);
  }
  if (prepared) {
    if (characterInputs) for (const [key, target] of Object.entries(characterInputs)) sameExplicit(key, target);
    return prepared;
  }
  preparedFamily = family;
  prepared = (async () => {
    assert.equal(process.version, 'v22.21.1', 'use project Node 22.21.1');
    sameExplicit('H3_RUNTIME_ROOT', ROOT);
    // Capture and bind the full fixture/native graph before a compiler or test child.
    captured = H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING);
    const files = H.boundFiles(captured, [...INPUTS.controlledInputs, ...INPUTS.plugins.map(name => 'js/plugins/' + name + '.js')]);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/reactor-source-manifest.json'), 'utf8'));
    for (const relative of INPUTS.pinnedNativeFiles)
      assert.equal(sha(fs.readFileSync(regular(path.join(ROOT, relative)))), manifest.runtime['runtime/' + relative.slice(3)], 'native source differs from project pin: ' + relative);
    assert.equal(require('../check-showdown-staging.cjs').checkShowdownStaging(ROOT), captured.identity.showdownSHA);
    const e3Family = ['e3-travel-current','e3-travel-diagnostic', 'e3-companion-current', 'e3-companion-remove', 'e3-companion-cold','e3-companion-empty-formal'].includes(process.env.PF_FINAL_PRODUCTION_FAMILY);
    const displayFamily = ['field-presentation-i18n','field-presentation-terminal','travel-presentation-initial','travel-presentation-source-controls'].includes(process.env.PF_FINAL_PRODUCTION_FAMILY);
    const fJointFamily = ['f-native-current','f-load-current'].includes(family);
    const coldFamily = e3Family || displayFamily || characterFamily || fJointFamily;
    if (coldFamily) {
      // Reuse the official cold parent's strict source/tool/output-bound emit, never a fixture/default builder.
      const {parent} = require('./c-regular-runtime.cjs').verify(ROOT, captured.binding);
      for (const [key, relative] of Object.entries({PF_FIELD_MOVE_APP_OUT:'out/src', PF_E2_PARENT_OUT:'out'})) sameExplicit(key, path.join(parent, relative));
      sameExplicit('PF_FIELD_MOVE_APP_BUNDLE', path.join(parent, 'bundles/field-move-operation.cjs'));
      sameExplicit('PF_E2_PARENT_ENGINE', path.join(ROOT, 'js/engine/build/production.cjs'));
      sameExplicit('PF_MZ_RUNTIME_OBJECTS', path.join(ROOT, 'js/reactor_objects.js'));
      sameExplicit('PF_MZ_BATTLE_SOURCE', path.join(ROOT, 'src/plugins/PS_BattleFlow.ts'));
      sameExplicit('PF_MZ_BATTLE_COMPILED', pluginFile('PS_BattleFlow'));
      sameExplicit('PF_E3_PARENT_BUNDLE', path.join(ROOT, 'tests/support/world/travel/parent-components.cjs'));
      sameExplicit('PF_E3_CORE_BUNDLE', path.join(ROOT, 'js/engine/build/core.cjs'));
      if(characterFamily) {
        for(const [key, target] of Object.entries(characterInputs)) sameExplicit(key, target);
      }
      if(['e3-travel-current','e3-travel-diagnostic'].includes(process.env.PF_FINAL_PRODUCTION_FAMILY)){
        const target=path.join(process.env.PF_E3_CASE_ROOT,'vehicle-source.json');
        if(process.env.PF_E3_MAPSOURCE_RESULTS!==undefined)assert.equal(process.env.PF_E3_MAPSOURCE_RESULTS,target,'foreign E3 observation output');
        process.env.PF_E3_MAPSOURCE_RESULTS=target;
      }
    }
    const out = path.join(ROOT, 'js/engine/build');
    // Existing explicit review groups remain supported when their paths are the
    // same source/runtime bytes admitted by this parent binding.
    if (process.env.PF_E3_JOINT_OUT !== undefined) {
      const explicit = process.env.PF_E3_JOINT_OUT;
      assert.equal(sha(fs.readFileSync(regular(path.join(explicit, 'production.cjs')))), sha(fs.readFileSync(path.join(out, 'production.cjs'))), 'foreign explicit production');
      for (const name of INPUTS.plugins) {
        const candidate = path.join(explicit, name + '.js');
        if (fs.existsSync(candidate)) assert.equal(sha(fs.readFileSync(regular(candidate))), sha(fs.readFileSync(pluginFile(name))), 'foreign explicit plugin: ' + name);
      }
    }
    sameExplicit('PF_E3_NATIVE_ROOT', ROOT);
    sameExplicit('PF_MZ_RUNTIME', path.join(ROOT, 'js/reactor_objects.js'));
    sameExplicit('PF_MZ_RUNTIME_MANAGERS', path.join(ROOT, 'js/reactor_managers.js'));
    sameExplicit('PF_MZ_RUNTIME_SCENES', path.join(ROOT, 'js/reactor_scenes.js'));
    sameExplicit('PF_SHORTCUT_TRAVEL_FIXTURE', path.join(ROOT, (['e1', 'e1-fishing-presentation'].includes(process.env.PF_FINAL_PRODUCTION_FAMILY) || characterFamily || e3Family)
      ? 'tests/support/field/ui-wire-world-fixtures.cjs' : (['e2-current-frontends', 'e2-party-surf-guards'].includes(process.env.PF_FINAL_PRODUCTION_FAMILY) || displayFamily)
        ? 'tests/support/world/field-frontends/world-base.cjs' : 'tests/support/saves/shortcut-capture/world-base.cjs'));
    sameExplicit('PF_SHORTCUT_PRODUCTION_BUNDLE', pluginFile('PS_Management'));
    for (const key of ['PF_D_NOTICE_BUNDLES', 'PF_D_MZ_COMPILER_ROOT', 'PF_D_MZ_ART'])
      assert.equal(process.env[key], undefined, 'independent private builder override refused: ' + key);
    process.env.PF_E3_JOINT_OUT = out;
    const compiled = characterFamily ? require('./e1-character-inputs.cjs').prepare(ROOT, captured)
      : require('../../tests/support/field/regular-field-action-test-runtime.cjs').prepare('world-scene');
    if(coldFamily) assert.equal(compiled.mode, 'explicit', 'current production family consumes only the existing cold parent emit');
    // Fixture content is data-only and uses the existing Node 22 TS loader.
    require('./ts-source-loader.cjs');
    const T = await import(pathToFileURL(path.join(ROOT, 'src/framework/tools/fixtures/content.ts')).href);
    current = {root: ROOT, out, E: require(path.join(out, 'production.cjs')), T,
      inventory: fs.readFileSync(pluginFile('PS_Inventory'), 'utf8'),
      world: fs.readFileSync(pluginFile('PS_World'), 'utf8'),
      flow: fs.readFileSync(pluginFile('PS_BattleFlow'), 'utf8'),
      compiled, parentBindingSHA256: captured.sha256, identity: captured.identity, files};
    return current;
  })();
  return prepared;
}
function get() { assert(current, 'await the source-bound production preparation before loading a fixture'); return current; }
function verify() { assert(captured, 'production inputs were not captured'); return H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING, captured.sha256); }
module.exports = {prepare, get, verify, pluginFile};
