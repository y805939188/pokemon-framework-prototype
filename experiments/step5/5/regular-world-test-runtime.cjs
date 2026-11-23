'use strict';
// Regular Node tests own this output. Explicit independent-review PF_* paths remain authoritative.
// No product bundle, installed runtime, player data or existing evidence is written here.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const DEFAULTED = new Set();
const ENTRIES = [
  'src/framework/app/game-application.ts',
  'src/plugins/world/atomic-state-mz.ts',
  'src/plugins/world/world-weather-mz.ts',
  'experiments/step5/5/fishing-composed-port.ts',
];
const REQUIRED_OUTPUTS = [
  'src/framework/app/game-application.js', 'src/framework/app/fishing-operation.js',
  'src/framework/rules/state.js', 'src/framework/rules/stats.js', 'src/framework/rules/world-state.js',
  'src/framework/rules/dex-state.js', 'src/framework/rules/world-data.js', 'src/framework/rules/item-catalog.js',
  'src/plugins/world/atomic-state-mz.js', 'src/plugins/world/world-weather-mz.js',
  'src/plugins/world/fishing-host.js', 'src/plugins/host-input.js',
  'experiments/step5/5/fishing-composed-port.js',
];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => sha(fs.readFileSync(file));
function file(file) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw Error('regular world tests need prepared input: ' + file);
  return file;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    if (!entry.isFile()) throw Error('unsupported regular test input: ' + absolute);
    return [absolute];
  }).sort();
}
function reactorFiles() {
  const objects = path.resolve(process.env.PF_MZ_OBJECTS || path.join(ROOT, 'js/reactor_objects.js'));
  return ['reactor_objects.js', 'reactor_windows.js', 'reactor_managers.js', 'reactor_scenes.js']
    .map(name => file(name === 'reactor_objects.js' ? objects : path.join(path.dirname(objects), name)));
}
function config(outDir) {
  return { compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', strict: true,
    skipLibCheck: false, types: [], lib: ['ES2022'], noImplicitReturns: true,
    noFallthroughCasesInSwitch: true, noEmitOnError: true, rootDir: ROOT, outDir },
    files: ENTRIES.map(relative => path.join(ROOT, relative)) };
}
function inputs() {
  const compiler = fs.realpathSync(file(path.join(ROOT, 'src/node_modules/typescript/bin/tsc')));
  const compilerRoot = path.dirname(path.dirname(compiler));
  const packageJson = JSON.parse(fs.readFileSync(path.join(compilerRoot, 'package.json'), 'utf8'));
  const platformName = '@typescript/typescript-' + process.platform + '-' + process.arch;
  const platformRoot = path.dirname(require.resolve(platformName + '/package.json', { paths: [compilerRoot] }));
  const platformJson = JSON.parse(fs.readFileSync(path.join(platformRoot, 'package.json'), 'utf8'));
  if (platformJson.version !== packageJson.version || packageJson.optionalDependencies[platformName] !== platformJson.version)
    throw Error('regular world tests need the matching TypeScript platform compiler');
  const binary = fs.realpathSync(file(path.join(platformRoot, 'lib', process.platform === 'win32' ? 'tsc.exe' : 'tsc')));
  const sourceFiles = ['src/framework', 'src/plugins', 'src/types'].flatMap(relative => walk(path.join(ROOT, relative)))
    .concat(['src/package.json', 'src/pnpm-lock.yaml', 'experiments/step5/5/fishing-composed-port.ts',
      'experiments/step5/5/regular-world-test-runtime.cjs'].map(relative => file(path.join(ROOT, relative)))).sort();
  return { node: process.version, source: Object.fromEntries(sourceFiles.map(absolute => [path.relative(ROOT, absolute), hashFile(absolute)])),
    compiler: { entry: compiler, version: packageJson.version,
      files: Object.fromEntries(walk(compilerRoot).map(absolute => [path.relative(compilerRoot, absolute), hashFile(absolute)])),
      platform: { name: platformName, root: platformRoot, version: platformJson.version, binary, binaryHash: hashFile(binary),
        files: Object.fromEntries(walk(platformRoot).map(absolute => [path.relative(platformRoot, absolute), hashFile(absolute)])) } },
    reactor: Object.fromEntries(reactorFiles().map(absolute => [absolute, hashFile(absolute)])),
    config: config('<private-output>/out') };
}
function verify(directory, inputHash) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.inputHash !== inputHash || sha(JSON.stringify(manifest.inputs)) !== inputHash)
    throw Error('regular world test output binding mismatch: ' + directory);
  if (hashFile(path.join(directory, 'tsconfig.json')) !== manifest.configHash ||
    fs.readFileSync(path.join(directory, 'tsconfig.json'), 'utf8') !== JSON.stringify(config(path.join(directory, 'out')), null, 2) + '\n')
    throw Error('regular world test compiler config changed: ' + directory);
  const out = path.join(directory, 'out'), files = walk(out);
  const expected = Object.keys(manifest.outputs).sort();
  if (JSON.stringify(files.map(absolute => path.relative(out, absolute)).sort()) !== JSON.stringify(expected))
    throw Error('regular world test output inventory changed: ' + directory);
  for (const absolute of files) if (hashFile(absolute) !== manifest.outputs[path.relative(out, absolute)])
    throw Error('regular world test output changed: ' + absolute);
  for (const relative of REQUIRED_OUTPUTS) file(path.join(out, relative));
  return out;
}
function output() {
  const before = inputs(), inputHash = sha(JSON.stringify(before));
  const directory = path.join(ROOT, 'build/test-world-runtime', inputHash), out = path.join(directory, 'out');
  if (fs.existsSync(directory)) return verify(directory, inputHash);
  fs.mkdirSync(directory, { recursive: true });
  const configPath = path.join(directory, 'tsconfig.json');
  fs.writeFileSync(configPath, JSON.stringify(config(out), null, 2) + '\n');
  const result = cp.spawnSync(process.execPath, [before.compiler.entry, '--pretty', 'false', '-p', configPath], { cwd: ROOT, encoding: 'utf8' });
  fs.writeFileSync(path.join(directory, 'compile.log'), (result.stdout || '') + (result.stderr || ''));
  if (result.error || result.status !== 0) throw Error('regular world test compile failed; preserve ' + directory + ': ' + (result.error || 'exit ' + result.status));
  if (sha(JSON.stringify(inputs())) !== inputHash) throw Error('regular world test inputs changed during compilation; preserve ' + directory);
  for (const relative of REQUIRED_OUTPUTS) file(path.join(out, relative));
  const head = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  const manifest = { format: 1, createdAt: new Date().toISOString(), inputHash, inputs: before,
    sourceHead: head.status === 0 ? head.stdout.trim() : null, configHash: hashFile(configPath),
    outputs: Object.fromEntries(walk(out).map(absolute => [path.relative(out, absolute), hashFile(absolute)])) };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return verify(directory, inputHash);
}
function prepare(keys) {
  const suffixes = { PF_FISHING_APP_OUT: 'src/framework', PF_FISHING_HOST_OUT: 'src', PF_FISHING_COMPOSED_OUT: '', PF_E1_PARENT_OUT: '' };
  let out;
  for (const key of keys) {
    if (process.env[key] !== undefined) continue;
    if (key === 'PF_MZ_OBJECTS') process.env[key] = reactorFiles()[0];
    else {
      if (!Object.hasOwn(suffixes, key)) throw Error('unknown regular test output: ' + key);
      out ||= output(); process.env[key] = path.join(out, suffixes[key]);
    }
    DEFAULTED.add(key);
  }
}
function prepareParent() {
  const authorOutput = process.env.PF_E1_PARENT_OUT !== undefined && !DEFAULTED.has('PF_E1_PARENT_OUT');
  prepare(['PF_E1_PARENT_OUT', 'PF_MZ_OBJECTS']);
  if (!authorOutput && process.env.PF_E1_PARENT_ENGINE === undefined) {
    const engine = file(path.join(ROOT, 'js/engine/build/production.cjs'));
    const distribution = JSON.parse(fs.readFileSync(file(path.join(ROOT, 'build/framework-cjs/manifest.json')), 'utf8'));
    const { sourceFingerprint } = require(path.join(ROOT, 'scripts/framework-distribution-source.cjs'));
    if (distribution.source?.fingerprint !== sourceFingerprint(ROOT) || distribution.files?.['js/engine/build/production.cjs'] !== hashFile(engine))
      throw Error('regular world tests need a current formal distribution/production.cjs from this source');
    process.env.PF_E1_PARENT_ENGINE = engine; DEFAULTED.add('PF_E1_PARENT_ENGINE');
  }
}
module.exports = { prepare, prepareParent, output };
