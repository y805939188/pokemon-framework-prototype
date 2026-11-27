'use strict';
// Test-only defaults. Explicit review inputs keep their original meanings and never mix with defaults.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const HELPER = path.relative(ROOT, __filename);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const hashFile = file => sha(fs.readFileSync(file));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const ENTRIES = [
  'src/framework/app/game-application.ts', 'src/framework/app/field-move-operation.ts',
  'src/plugins/world/field-move-host.ts', 'src/plugins/world/field-facts-observation-mz.ts',
  'src/plugins/world/world-battle-scene-mz.ts', 'src/plugins/world/world-travel-mz.ts',
  'src/plugins/world/event-companion-ingress-mz.ts',
  'src/plugins/world/atomic-state-mz.ts', 'src/plugins/world/fishing-host.ts', 'src/plugins/host-input.ts',
  'src/plugins/world/world-weather-mz.ts',
  'src/plugins/world/business-random-mz.ts',
  'src/framework/app/field-shortcut-query.ts', 'src/plugins/world/field-shortcut-menu.ts',
  'src/plugins/world/party-field-actions.ts', 'src/plugins/world/field-shortcut-window.ts',
  'tests/support/field/fishing-composed-port.ts',
];
const UI = ['field-shortcut-query', 'field-shortcut-menu', 'party-field-actions', 'field-shortcut-window'];
const BUNDLES = Object.fromEntries([
  ['field-move-operation', 'src/framework/app/field-move-operation.ts'],
  ...UI.map(name => [name, (name === 'field-shortcut-query' ? 'src/framework/app/' : 'src/plugins/world/') + name + '.ts']),
]);
const PROFILES = {
  native: { required: ['PF_MZ_RUNTIME_OBJECTS'], optional: [], native: true },
  query: { required: ['PF_E2_PARENT_OUT'], optional: [] },
  leaf: { required: ['PF_FIELD_MOVE_APP_OUT', 'PF_MZ_RUNTIME_OBJECTS'], optional: ['PF_FIELD_MOVE_APP_BUNDLE'], native: true },
  parent: { required: ['PF_FIELD_MOVE_APP_OUT', 'PF_MZ_RUNTIME_OBJECTS', 'PF_E2_PARENT_OUT', 'PF_E2_PARENT_ENGINE'], optional: ['PF_FIELD_MOVE_APP_BUNDLE'], native: true, engine: true },
  'world-scene': { required: ['PF_FIELD_MOVE_APP_OUT', 'PF_MZ_RUNTIME_OBJECTS', 'PF_E2_PARENT_OUT', 'PF_E2_PARENT_ENGINE', 'PF_MZ_BATTLE_SOURCE', 'PF_MZ_BATTLE_COMPILED'], optional: ['PF_FIELD_MOVE_APP_BUNDLE'], native: true, engine: true, battleScene: true },
  'fishing-app': { required: ['PF_FISHING_APP_OUT'], optional: [], engine: true },
  'fishing-host': { required: ['PF_FISHING_HOST_OUT', 'PF_MZ_OBJECTS'], optional: [], native: true, windows: true, engine: true },
  'fishing-composed': { required: ['PF_FISHING_COMPOSED_OUT', 'PF_FISHING_HOST_OUT', 'PF_MZ_OBJECTS'], optional: [], native: true, windows: true, engine: true },
  atomic: { required: ['PF_E1_PARENT_OUT'], optional: [], engine: true },
  fishing: { required: ['PF_E1_PARENT_OUT', 'PF_FISHING_HOST_OUT', 'PF_MZ_OBJECTS'], optional: ['PF_E1_PARENT_ENGINE'], native: true, windows: true, engine: true },
  combined: { required: ['PF_FIELD_MOVE_APP_OUT', 'PF_MZ_RUNTIME_OBJECTS', 'PF_E2_PARENT_OUT', 'PF_E2_PARENT_ENGINE', 'PF_E1_PARENT_OUT', 'PF_FISHING_HOST_OUT', 'PF_MZ_OBJECTS'], optional: ['PF_FIELD_MOVE_APP_BUNDLE', 'PF_E1_PARENT_ENGINE'], native: true, windows: true, engine: true },
  ui: { required: [], optional: ['PF_SHORTCUT_UI_BUNDLE', 'PF_SHORTCUT_UI_OUT'], ui: UI.slice(0, 2) },
  'ui-menu': { required: [], optional: ['PF_SHORTCUT_UI_BUNDLE', 'PF_SHORTCUT_UI_OUT'], ui: UI },
};
const DEFAULTED = new Map();
const isDefaulted = key => DEFAULTED.has(key) && DEFAULTED.get(key) === process.env[key];
const isExplicit = key => own(process.env, key) && !isDefaulted(key);
function file(absolute) {
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) throw Error('field-action tests need prepared file: ' + absolute);
  return absolute;
}
function directory(absolute) {
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) throw Error('field-action tests need prepared directory: ' + absolute);
  return absolute;
}
function inventory(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const rel = prefix ? prefix + '/' + entry.name : entry.name, absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return inventory(absolute, rel);
    if (!entry.isFile()) throw Error('unsupported field-action inventory input: ' + absolute);
    return [[rel, hashFile(absolute)]];
  }).sort(([a], [b]) => a.localeCompare(b));
}
function sourceFiles(directoryName) {
  const root = path.join(ROOT, directoryName);
  return inventory(root).filter(([name]) => name.endsWith('.ts')).map(([name, hash]) => [directoryName + '/' + name, hash]);
}
function config(outDir) {
  return { compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', strict: true,
    noImplicitReturns: true, noFallthroughCasesInSwitch: true, noEmitOnError: true,
    skipLibCheck: false, types: ['node'], typeRoots: [path.join(ROOT, 'src/node_modules/@types')],
    lib: ['ES2022'], rootDir: ROOT, outDir }, files: ENTRIES.map(name => path.join(ROOT, name)) };
}
function packageRoot(name, from) {
  let resolved;
  try { resolved = require.resolve(name + '/package.json', { paths: [from] }); }
  catch { resolved = require.resolve(name, { paths: [from] }); }
  let current = path.dirname(fs.realpathSync(resolved));
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate) && JSON.parse(fs.readFileSync(candidate, 'utf8')).name === name) return current;
    current = path.dirname(current);
  }
  throw Error('cannot identify installed tool package: ' + name);
}
function toolchain() {
  const modules = fs.realpathSync(directory(path.join(ROOT, 'src/node_modules'))), packages = {}, visited = new Set();
  function add(name, from, optional = false) {
    let root;
    try { root = packageRoot(name, from); } catch (error) { if (optional && error.code === 'MODULE_NOT_FOUND') return; throw error; }
    if (!root.startsWith(modules + path.sep)) throw Error('tool package leaves this prepared node_modules: ' + root);
    if (visited.has(root)) return;
    visited.add(root);
    const meta = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    packages[path.relative(modules, root)] = { name: meta.name, version: meta.version, files: Object.fromEntries(inventory(root)) };
    for (const dep of Object.keys(meta.dependencies || {}).sort()) add(dep, root);
    for (const dep of Object.keys(meta.optionalDependencies || {}).sort()) add(dep, root, true);
  }
  for (const name of ['typescript', 'vite', '@types/node']) add(name, path.join(ROOT, 'src'));
  const compiler = fs.realpathSync(file(path.join(ROOT, 'src/node_modules/typescript/bin/tsc')));
  const compilerRoot = packageRoot('typescript', path.join(ROOT, 'src'));
  const ts = JSON.parse(fs.readFileSync(path.join(compilerRoot, 'package.json'), 'utf8'));
  const platformName = '@typescript/typescript-' + process.platform + '-' + process.arch;
  const platformRoot = packageRoot(platformName, compilerRoot);
  const platform = JSON.parse(fs.readFileSync(path.join(platformRoot, 'package.json'), 'utf8'));
  const declared = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/package.json'), 'utf8'));
  const viteRoot = packageRoot('vite', path.join(ROOT, 'src'));
  const vite = JSON.parse(fs.readFileSync(path.join(viteRoot, 'package.json'), 'utf8'));
  if (declared.devDependencies.typescript !== ts.version || platform.version !== ts.version ||
      ts.optionalDependencies[platformName] !== platform.version || declared.devDependencies.vite !== vite.version)
    throw Error('field-action tests require tree-pinned TypeScript/platform/Vite versions');
  const binary = fs.realpathSync(file(path.join(platformRoot, 'lib', process.platform === 'win32' ? 'tsc.exe' : 'tsc')));
  return { modules, compiler, binary, binaryHash: hashFile(binary), viteEntry: path.join(viteRoot, 'dist/node/index.js'),
    packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) };
}
function production() {
  const distribution = path.join(ROOT, 'build/framework-cjs'), manifestFile = file(path.join(distribution, 'manifest.json'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const { sourceFingerprint } = require(path.join(ROOT, 'scripts/framework-distribution-source.cjs'));
  const current = sourceFingerprint(ROOT);
  if (manifest.formatVersion !== 1 || manifest.source?.fingerprint !== current) throw Error('field-action production distribution source fingerprint mismatch');
  const expected = Object.keys(manifest.files).sort();
  const actual = inventory(distribution).map(([name]) => name).filter(name => name !== 'manifest.json' && name !== 'SHA256SUMS').sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('field-action distribution file inventory mismatch');
  for (const name of expected) if (hashFile(file(path.join(distribution, name))) !== manifest.files[name]) throw Error('field-action distribution hash mismatch: ' + name);
  const productionName = 'js/engine/build/production.cjs';
  if (!own(manifest.files, productionName)) throw Error('formal distribution has no production entry');
  const engine = file(path.join(ROOT, productionName));
  if (hashFile(engine) !== manifest.files[productionName]) throw Error('field-action production.cjs differs from same-source formal distribution');
  const runtimeFiles = {};
  for (const root of ['js/engine/build', 'js/engine/showdown']) {
    const currentFiles = Object.fromEntries(inventory(path.join(ROOT, root)));
    const shipped = Object.keys(manifest.files).filter(name => name.startsWith(root + '/')).map(name => name.slice(root.length + 1)).sort();
    if (JSON.stringify(Object.keys(currentFiles).sort()) !== JSON.stringify(shipped)) throw Error('field-action runtime inventory differs from formal distribution: ' + root);
    for (const [relative, hash] of Object.entries(currentFiles)) {
      if (manifest.files[root + '/' + relative] !== hash) throw Error('field-action runtime differs from formal distribution: ' + root + '/' + relative);
      runtimeFiles[root + '/' + relative] = hash;
    }
  }
  return { engine, manifest: manifestFile, manifestHash: hashFile(manifestFile), sourceFingerprint: current,
    distributionFiles: manifest.files, runtimeFiles };
}
function sceneBinding() {
  const binding = require(path.join(ROOT, 'scripts/headless-regression-binding.cjs'));
  const captured = binding.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING);
  return { parentBindingSHA256: captured.sha256, files: binding.boundFiles(captured,
    ['src/plugins/PS_BattleFlow.ts', 'js/plugins/PS_BattleFlow.js']) };
}
function inputs(profile) {
  // Default Scene units consume only the runner's already verified production IIFE.
  // Bind before loading any compiler or starting a child; explicit review groups retain their own paths.
  const battleScene = profile.battleScene ? sceneBinding() : null;
  const tools = toolchain(), sources = Object.fromEntries([
    ...['src/framework', 'src/plugins', 'src/types'].flatMap(sourceFiles),
    ...['src/package.json', 'src/pnpm-lock.yaml', HELPER, 'tests/support/field/fishing-composed-port.ts',
      'scripts/framework-distribution-source.cjs'].map(name => [name, hashFile(file(path.join(ROOT, name)))]),
  ].sort(([a], [b]) => a.localeCompare(b)));
  const native = {};
  if (profile.native) native['js/reactor_objects.js'] = hashFile(file(path.join(ROOT, 'js/reactor_objects.js')));
  if (profile.windows) native['js/reactor_windows.js'] = hashFile(file(path.join(ROOT, 'js/reactor_windows.js')));
  return { node: { version: process.version, executable: fs.realpathSync(process.execPath), hash: hashFile(process.execPath) },
    root: ROOT, sources, native, tools, battleScene, compilerConfig: config('<private-output>/out'), bundles: BUNDLES,
    production: profile.engine ? production() : null };
}
function explicit(profileName, profile) {
  const keys = [...profile.required, ...profile.optional];
  if (!keys.some(isExplicit)) return false;
  if (profile.ui) {
    const bundle = isExplicit('PF_SHORTCUT_UI_BUNDLE');
    const key = bundle ? 'PF_SHORTCUT_UI_BUNDLE' : 'PF_SHORTCUT_UI_OUT';
    const root = directory(process.env[key]);
    for (const name of profile.ui) file(path.join(root, bundle ? name + '.cjs' : (name === 'field-shortcut-query' ? 'framework/app/' : 'plugins/world/') + name + '.js'));
  } else {
    for (const key of profile.required) if (!isExplicit(key)) throw Error('explicit field-action ' + profileName + ' group is incomplete: ' + key);
    for (const key of keys) {
      if (!isExplicit(key)) continue;
      if (key.endsWith('_OUT')) directory(process.env[key]); else file(process.env[key]);
    }
    if (profile.windows) file(path.join(path.dirname(process.env.PF_MZ_OBJECTS), 'reactor_windows.js'));
  }
  for (const key of keys) if (isDefaulted(key)) { delete process.env[key]; DEFAULTED.delete(key); }
  return true;
}
function verify(directoryName, before, inputHash) {
  const manifest = JSON.parse(fs.readFileSync(file(path.join(directoryName, 'manifest.json')), 'utf8'));
  if (manifest.format !== 1 || manifest.inputHash !== inputHash || sha(JSON.stringify(manifest.inputs)) !== inputHash ||
      JSON.stringify(manifest.inputs) !== JSON.stringify(before)) throw Error('field-action cache source binding mismatch: ' + directoryName);
  const actual = Object.fromEntries(inventory(directoryName).filter(([name]) => name !== 'manifest.json'));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.outputs)) throw Error('field-action cache output inventory/hash mismatch: ' + directoryName);
  for (const [absolute, expected] of Object.entries(manifest.loadedInputs)) if (hashFile(file(absolute)) !== expected) throw Error('field-action loaded build input changed: ' + absolute);
  return { directory: directoryName, out: path.join(directoryName, 'out'), bundles: path.join(directoryName, 'bundles'), inputHash };
}
function output(profile) {
  const before = inputs(profile), inputHash = sha(JSON.stringify(before));
  const cache = path.join(ROOT, 'build/test-field-action-runtime', inputHash);
  if (fs.existsSync(cache)) return verify(cache, before, inputHash);
  fs.mkdirSync(cache, { recursive: true });
  const tsconfig = path.join(cache, 'tsconfig.json'), out = path.join(cache, 'out');
  fs.writeFileSync(tsconfig, JSON.stringify(config(out), null, 2) + '\n');
  const compiled = cp.spawnSync(process.execPath, [before.tools.compiler, '--pretty', 'false', '-p', tsconfig], { cwd: ROOT, encoding: 'utf8' });
  fs.writeFileSync(path.join(cache, 'compile.log'), (compiled.stdout || '') + (compiled.stderr || ''));
  if (compiled.error || compiled.status !== 0) throw Error('field-action strict emit failed; preserve ' + cache + ': ' + (compiled.error || compiled.status));
  const workerConfig = path.join(cache, 'bundle-config.json');
  fs.writeFileSync(workerConfig, JSON.stringify({ root: ROOT, out: path.join(cache, 'bundles'), entries: BUNDLES, viteEntry: before.tools.viteEntry }, null, 2) + '\n');
  const bundled = cp.spawnSync(process.execPath, [__filename, '--bundle-worker', workerConfig], { cwd: ROOT, encoding: 'utf8' });
  fs.writeFileSync(path.join(cache, 'bundle.log'), (bundled.stdout || '') + (bundled.stderr || ''));
  if (bundled.error || bundled.status !== 0) throw Error('field-action private bundle failed; preserve ' + cache + ': ' + (bundled.error || bundled.status));
  const loaded = JSON.parse(fs.readFileSync(path.join(cache, 'loaded-inputs.json'), 'utf8'));
  const known = new Map(Object.entries(before.sources).map(([rel, hash]) => [path.join(ROOT, rel), hash]));
  for (const [root, pkg] of Object.entries(before.tools.packages)) for (const [rel, hash] of Object.entries(pkg.files)) known.set(path.join(before.tools.modules, root, rel), hash);
  known.set(workerConfig, hashFile(workerConfig));
  for (const [absolute, hash] of Object.entries(loaded)) if (known.get(absolute) !== hash) throw Error('unbound actual Vite input; preserve ' + cache + ': ' + absolute);
  if (sha(JSON.stringify(inputs(profile))) !== inputHash) throw Error('field-action inputs changed while compiling; preserve ' + cache);
  const manifest = { format: 1, createdAt: new Date().toISOString(), inputHash, inputs: before, loadedInputs: loaded,
    outputs: Object.fromEntries(inventory(cache)) };
  fs.writeFileSync(path.join(cache, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return verify(cache, before, inputHash);
}
function prepare(profileName) {
  const profile = PROFILES[profileName];
  if (!profile) throw Error('unknown field-action test profile: ' + profileName);
  if (explicit(profileName, profile)) return { mode: 'explicit', profile: profileName };
  const built = output(profile), fields = {
    PF_FIELD_MOVE_APP_OUT: path.join(built.out, 'src'), PF_FIELD_MOVE_APP_BUNDLE: path.join(built.bundles, 'field-move-operation.cjs'),
    PF_E2_PARENT_OUT: built.out, PF_E2_PARENT_ENGINE: path.join(ROOT, 'js/engine/build/production.cjs'),
    PF_E1_PARENT_OUT: built.out, PF_E1_PARENT_ENGINE: path.join(ROOT, 'js/engine/build/production.cjs'),
    PF_FISHING_APP_OUT: path.join(built.out, 'src/framework'), PF_FISHING_COMPOSED_OUT: built.out,
    PF_FISHING_HOST_OUT: path.join(built.out, 'src'), PF_MZ_OBJECTS: path.join(ROOT, 'js/reactor_objects.js'),
    PF_MZ_RUNTIME_OBJECTS: path.join(ROOT, 'js/reactor_objects.js'), PF_SHORTCUT_UI_BUNDLE: built.bundles,
    PF_MZ_BATTLE_SOURCE: path.join(ROOT, 'src/plugins/PS_BattleFlow.ts'), PF_MZ_BATTLE_COMPILED: path.join(ROOT, 'js/plugins/PS_BattleFlow.js'),
  };
  const keys = profile.ui ? ['PF_SHORTCUT_UI_BUNDLE'] : [...profile.required, ...profile.optional];
  for (const key of keys) { if (!own(process.env, key) || isDefaulted(key)) { process.env[key] = fields[key]; DEFAULTED.set(key, fields[key]); } }
  return { mode: 'default', profile: profileName, ...built };
}
async function bundleWorker(configFile) {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8')), loadedLog = path.join(path.dirname(configFile), 'loaded-esm.jsonl');
  const { register } = require('node:module'), { pathToFileURL } = require('node:url');
  const hook = `import {appendFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';export async function load(url,context,next){const result=await next(url,context);if(url.startsWith('file:'))appendFileSync(${JSON.stringify(loadedLog)},JSON.stringify(fileURLToPath(url))+'\\n');return result;}`;
  register('data:text/javascript,' + encodeURIComponent(hook), pathToFileURL(__filename));
  const { build } = await import(pathToFileURL(config.viteEntry).href);
  const moduleFiles = new Set();
  for (const [name, rel] of Object.entries(config.entries)) await build({ configFile: false, root: path.join(config.root, 'src'), logLevel: 'error',
    plugins: [{ name: 'field-action-build-inputs', moduleParsed(info) { if (path.isAbsolute(info.id) && fs.existsSync(info.id)) moduleFiles.add(info.id); } }],
    build: { target: 'es2022', outDir: config.out, emptyOutDir: false, minify: false, sourcemap: true,
      lib: { entry: path.join(config.root, rel), formats: ['cjs'], fileName: () => name + '.cjs' },
      rolldownOptions: { platform: 'node', external: [/^node:/] } } });
  for (const p of Object.keys(require.cache)) moduleFiles.add(p);
  if (fs.existsSync(loadedLog)) for (const line of fs.readFileSync(loadedLog, 'utf8').trim().split('\n')) if (line) moduleFiles.add(JSON.parse(line));
  for (const p of process.report.getReport().sharedObjects) if (p.startsWith(config.root + path.sep)) moduleFiles.add(p);
  const files = [...moduleFiles].map(p => fs.realpathSync(p)).sort();
  fs.writeFileSync(path.join(path.dirname(configFile), 'loaded-inputs.json'), JSON.stringify(Object.fromEntries(files.map(p => [p, hashFile(p)])), null, 2) + '\n');
}
if (require.main === module && process.argv[2] === '--bundle-worker') bundleWorker(process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
else module.exports = { prepare };
