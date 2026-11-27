'use strict';
// Same-source rules for regular Node tests; callers keep explicit PF_* overrides.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..'), RULES = path.join(ROOT, 'src/framework/rules');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => sha(fs.readFileSync(file));
function file(absolute) {
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) throw Error('regular world core tests need prepared input: ' + absolute);
  return absolute;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    if (!entry.isFile()) throw Error('unsupported regular world core input: ' + absolute);
    return [absolute];
  }).sort();
}
function sources() { return walk(RULES).filter(absolute => absolute.endsWith('.ts')); }
function config(outDir) {
  return { compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', strict: true,
    skipLibCheck: false, types: [], lib: ['ES2022'], noImplicitReturns: true,
    noFallthroughCasesInSwitch: true, noEmitOnError: true, rootDir: RULES, outDir }, files: sources() };
}
function inputs() {
  const compiler = fs.realpathSync(file(path.join(ROOT, 'src/node_modules/typescript/bin/tsc')));
  const compilerRoot = path.dirname(path.dirname(compiler));
  const actual = JSON.parse(fs.readFileSync(file(path.join(compilerRoot, 'package.json')), 'utf8'));
  const platformName = '@typescript/typescript-' + process.platform + '-' + process.arch;
  const platformRoot = path.dirname(require.resolve(platformName + '/package.json', { paths: [compilerRoot] }));
  const platform = JSON.parse(fs.readFileSync(file(path.join(platformRoot, 'package.json')), 'utf8'));
  const declared = JSON.parse(fs.readFileSync(file(path.join(ROOT, 'src/package.json')), 'utf8'));
  const lock = fs.readFileSync(file(path.join(ROOT, 'src/pnpm-lock.yaml')), 'utf8');
  if (declared.devDependencies.typescript !== actual.version || platform.version !== actual.version ||
    actual.optionalDependencies[platformName] !== platform.version || !lock.includes('specifier: ' + actual.version + '\n        version: ' + actual.version + '\n'))
    throw Error('regular world core tests need the tree-pinned TypeScript compiler');
  const sourceFiles = sources().concat(['src/package.json', 'src/pnpm-lock.yaml',
    'tests/support/world/regular-world-core-runtime.cjs'].map(relative => file(path.join(ROOT, relative)))).sort();
  return { node: process.version, source: Object.fromEntries(sourceFiles.map(absolute => [path.relative(ROOT, absolute), hashFile(absolute)])),
    compiler: { entry: compiler, version: actual.version,
      files: Object.fromEntries(walk(compilerRoot).map(absolute => [path.relative(compilerRoot, absolute), hashFile(absolute)])),
      platform: { name: platformName, root: platformRoot, version: platform.version,
        files: Object.fromEntries(walk(platformRoot).map(absolute => [path.relative(platformRoot, absolute), hashFile(absolute)])) } },
    config: config('<private-output>/out') };
}
function verify(directory, inputHash) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.inputHash !== inputHash || sha(JSON.stringify(manifest.inputs)) !== inputHash)
    throw Error('regular world core output binding mismatch: ' + directory);
  const configPath = path.join(directory, 'tsconfig.json'), out = path.join(directory, 'out');
  if (hashFile(configPath) !== manifest.configHash || fs.readFileSync(configPath, 'utf8') !== JSON.stringify(config(out), null, 2) + '\n')
    throw Error('regular world core compiler config changed: ' + directory);
  const files = walk(out);
  if (JSON.stringify(files.map(absolute => path.relative(out, absolute))) !== JSON.stringify(Object.keys(manifest.outputs).sort()))
    throw Error('regular world core output inventory changed: ' + directory);
  for (const absolute of files) if (hashFile(absolute) !== manifest.outputs[path.relative(out, absolute)])
    throw Error('regular world core output changed: ' + absolute);
  for (const absolute of sources().filter(absolute => !absolute.endsWith('.d.ts'))) file(path.join(out, path.relative(RULES, absolute).replace(/\.ts$/, '.js')));
  return out;
}
function output() {
  const before = inputs(), inputHash = sha(JSON.stringify(before));
  const directory = path.join(ROOT, 'build/test-world-core-runtime', inputHash), out = path.join(directory, 'out');
  if (fs.existsSync(directory)) return verify(directory, inputHash);
  fs.mkdirSync(directory, { recursive: true });
  const configPath = path.join(directory, 'tsconfig.json');
  fs.writeFileSync(configPath, JSON.stringify(config(out), null, 2) + '\n');
  const result = cp.spawnSync(process.execPath, [before.compiler.entry, '--pretty', 'false', '-p', configPath], { cwd: ROOT, encoding: 'utf8' });
  fs.writeFileSync(path.join(directory, 'compile.log'), (result.stdout || '') + (result.stderr || ''));
  if (result.error || result.status !== 0) throw Error('regular world core compile failed; preserve ' + directory + ': ' + (result.error || 'exit ' + result.status));
  if (sha(JSON.stringify(inputs())) !== inputHash) throw Error('regular world core inputs changed during compilation; preserve ' + directory);
  const head = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  const manifest = { format: 1, createdAt: new Date().toISOString(), inputHash, inputs: before,
    sourceHead: head.status === 0 ? head.stdout.trim() : null, configHash: hashFile(configPath),
    outputs: Object.fromEntries(walk(out).map(absolute => [path.relative(out, absolute), hashFile(absolute)])) };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return verify(directory, inputHash);
}
module.exports = { output };
