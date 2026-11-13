'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const helper = require('../prepare-showdown-build-deps.cjs');
const scripts = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(scripts, 'showdown-build-deps/package.json')));
const lock = JSON.parse(fs.readFileSync(path.join(scripts, 'showdown-build-deps/package-lock.json')));
const pin = manifest.showdown.commit;
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
function packageFiles(directory) {
  fs.mkdirSync(directory, {recursive: true});
  writeJSON(path.join(directory, 'package.json'), {name: 'sql-template-strings', version: '2.2.2', main: 'index.js', typings: 'index.d.ts'});
  fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(directory, 'index.d.ts'), 'export declare const SQL: unknown;\n');
}
function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-showdown-build-test-')));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const source = path.join(directory, 'source'), definitions = path.join(directory, 'definitions');
  fs.mkdirSync(path.join(source, 'node_modules'), {recursive: true});
  fs.mkdirSync(definitions);
  const upstream = JSON.stringify({lockfileVersion: 2, packages: {'node_modules/sql-template-strings': {...lock.packages['node_modules/sql-template-strings'], optional: true}}}) + '\n';
  fs.writeFileSync(path.join(source, 'package-lock.json'), upstream);
  const definition = clone(manifest); definition.showdown.lockSHA256 = hash(upstream);
  writeJSON(path.join(definitions, 'package.json'), definition);
  writeJSON(path.join(definitions, 'package-lock.json'), lock);
  const calls = [];
  function run(command, args, options) {
    calls.push({command, args, cwd: options.cwd});
    if (command === 'git') return pin + '\n';
    assert.equal(command, 'npm');
    packageFiles(path.join(options.cwd, 'node_modules/sql-template-strings'));
    return '';
  }
  return {directory, source, definitions, definition, upstream, calls, run};
}
test('build-only lock names one exact official non-native dependency', () => {
  assert.deepEqual(manifest.dependencies, {'sql-template-strings': '2.2.2'});
  assert.deepEqual(Object.keys(lock.packages).sort(), ['', 'node_modules/sql-template-strings']);
  assert.equal(lock.packages['node_modules/sql-template-strings'].resolved, 'https://registry.npmjs.org/sql-template-strings/-/sql-template-strings-2.2.2.tgz');
});
test('matching full lock bytes and actual revision admit the definition', t => {
  const f = fixture(t);
  assert.equal(helper.validateDefinition(f.definition, lock, f.upstream, pin, pin).version, '2.2.2');
});
for (const field of ['version', 'resolved', 'integrity']) test('definition rejects ' + field + ' drift before npm', t => {
  const f = fixture(t), changed = clone(lock);
  changed.packages['node_modules/sql-template-strings'][field] = field === 'version' ? '2.2.3' : field === 'resolved' ? 'https://example.invalid/pkg.tgz' : 'sha512-' + 'A'.repeat(86) + '==';
  assert.throws(() => helper.validateDefinition(f.definition, changed, f.upstream, pin, pin));
});
test('source commit, pin and full lock-byte mismatch each refuse', t => {
  const f = fixture(t);
  assert.throws(() => helper.validateDefinition(f.definition, lock, f.upstream, '0'.repeat(40), pin), /revision/);
  assert.throws(() => helper.validateDefinition(f.definition, lock, f.upstream, pin, '0'.repeat(40)), /revision/);
  assert.throws(() => helper.validateDefinition(f.definition, lock, f.upstream + ' ', pin, pin), /lock bytes/);
});
for (const field of ['dependencies', 'optionalDependencies', 'hasInstallScript', 'link']) test('build dependency refuses unsupported ' + field, t => {
  const f = fixture(t), changed = clone(lock);
  changed.packages['node_modules/sql-template-strings'][field] = field.endsWith('Dependencies') || field === 'dependencies' ? {sqlite3: '*'} : true;
  assert.throws(() => helper.validateDefinition(f.definition, changed, f.upstream, pin, pin), /unsupported/);
});
test('extra native package or root lifecycle is never admitted', t => {
  const f = fixture(t), changed = clone(lock);
  changed.packages['node_modules/sqlite3'] = {version: '5.1.7', hasInstallScript: true};
  assert.throws(() => helper.validateDefinition(f.definition, changed, f.upstream, pin, pin), /unexpected packages/);
  f.definition.scripts = {install: 'unapproved'};
  assert.throws(() => helper.validateDefinition(f.definition, lock, f.upstream, pin, pin), /unsupported manifest/);
});
test('preparation uses isolated cache, ignores lifecycle, copies bytes and repeats without source edits', t => {
  const f = fixture(t), original = fs.readFileSync(path.join(f.source, 'package-lock.json'));
  helper.prepare(f); const first = helper.inspectPackage(path.join(f.source, 'node_modules/sql-template-strings'), '2.2.2');
  helper.prepare(f);
  assert.deepEqual(helper.inspectPackage(path.join(f.source, 'node_modules/sql-template-strings'), '2.2.2'), first);
  assert.deepEqual(fs.readFileSync(path.join(f.source, 'package-lock.json')), original);
  const npm = f.calls.filter(c => c.command === 'npm'); assert.equal(npm.length, 2);
  for (const c of npm) {
    assert.ok(c.args.includes('--ignore-scripts')); assert.ok(c.args.includes('--registry=https://registry.npmjs.org'));
    assert.equal(c.args[c.args.indexOf('--cache') + 1], path.join(c.cwd, 'npm-cache'));
    assert.notEqual(c.cwd, f.source); assert.equal(fs.existsSync(c.cwd), false);
  }
});
test('npm/download failure or missing installed dependency never modifies source dependencies', t => {
  for (const mode of ['throw', 'missing']) {
    const f = fixture(t);
    f.run = (command) => {if (command === 'git') return pin + '\n'; if (mode === 'throw') throw Error('controlled download failure');};
    assert.throws(() => helper.prepare(f));
    assert.deepEqual(fs.readdirSync(path.join(f.source, 'node_modules')), []);
    assert.ok(fs.readdirSync(f.directory).every(n => !n.startsWith('.pf-showdown-build-deps-')));
  }
});
test('corrupt or linked installed package is rejected before replacement', t => {
  const f = fixture(t), destination = path.join(f.source, 'node_modules/sql-template-strings');
  packageFiles(destination); fs.writeFileSync(path.join(destination, 'index.d.ts'), 'corrupt\n');
  assert.throws(() => helper.prepare(f), /existing package bytes differ/);
  assert.equal(fs.readFileSync(path.join(destination, 'index.d.ts'), 'utf8'), 'corrupt\n');
  fs.rmSync(destination, {recursive: true}); fs.symlinkSync(path.join(f.directory, 'missing'), destination);
  assert.throws(() => helper.prepare(f), /local/); assert.ok(fs.lstatSync(destination).isSymbolicLink());
});
test('installed lifecycle, missing typings and internal link each refuse', t => {
  const f = fixture(t), p = path.join(f.directory, 'package'); packageFiles(p);
  const metadata = JSON.parse(fs.readFileSync(path.join(p, 'package.json'))); metadata.scripts = {postinstall: 'unapproved'}; writeJSON(path.join(p, 'package.json'), metadata);
  assert.throws(() => helper.inspectPackage(p, '2.2.2'), /lifecycle/);
  delete metadata.scripts; writeJSON(path.join(p, 'package.json'), metadata); fs.unlinkSync(path.join(p, 'index.d.ts'));
  assert.throws(() => helper.inspectPackage(p, '2.2.2'), /incomplete/);
  fs.symlinkSync(path.join(f.directory, 'missing'), path.join(p, 'index.d.ts'));
  assert.throws(() => helper.inspectPackage(p, '2.2.2'), /links/);
});

// These instrumented subprocesses test real shell/helper ordering and fail-closed
// staging. The separately archived fresh-install experiment uses actual npm/tsc/build.
function pipeline(t, mode) {
  const f = fixture(t), game = path.join(f.directory, 'game'), bin = path.join(f.directory, 'bin');
  fs.mkdirSync(path.join(game, 'scripts'), {recursive: true}); fs.mkdirSync(bin);
  for (const name of ['build-showdown.sh', 'prepare-showdown-build-deps.cjs', 'showdown.env']) fs.copyFileSync(path.join(scripts, name), path.join(game, 'scripts', name));
  fs.cpSync(f.definitions, path.join(game, 'scripts/showdown-build-deps'), {recursive: true});
  fs.mkdirSync(path.join(f.source, '.git')); fs.writeFileSync(path.join(f.source, 'LICENSE'), 'fixture license\n');
  const stage = path.join(game, 'js/engine/showdown'); fs.mkdirSync(stage, {recursive: true}); fs.writeFileSync(path.join(stage, 'old'), 'last-good-stage\n');
  const format = path.join(game, 'js/engine/build/custom-formats.cjs'); fs.mkdirSync(path.dirname(format)); if (mode !== 'missing-format') fs.writeFileSync(format, 'fixture-format\n');
  const log = path.join(f.directory, 'events.jsonl'), config = path.join(f.directory, 'config.json');
  writeJSON(config, {source: f.source, mode, log, pin, node: process.execPath});
  function executable(name, body) {const file = path.join(bin, name); fs.writeFileSync(file, '#!' + process.execPath + '\n' + body); fs.chmodSync(file, 0o755);}
  const prefix = "const fs=require('fs'),path=require('path'),cp=require('child_process');const c=JSON.parse(fs.readFileSync(process.env.PF_BUILD_FIXTURE_CONFIG));const event=x=>fs.appendFileSync(c.log,JSON.stringify(x)+'\\n');";
  executable('git', prefix + "const a=process.argv.slice(2);if(a.includes('rev-parse')){console.log(c.pin);}else if(a.includes('diff')){const n=fs.existsSync(c.log)?fs.readFileSync(c.log,'utf8').split('git-diff').length-1:0;event('git-diff');if(c.mode==='dirty-source'||(c.mode==='dirty-after-build'&&n>0))process.exit(9);}else{process.exit(94);}");
  executable('npm', prefix + "if(process.cwd()===c.source){event('npm-root');if(c.mode==='npm-failure')process.exit(12);fs.mkdirSync('node_modules/typescript/bin',{recursive:true});fs.writeFileSync('node_modules/typescript/bin/tsc','fixture');fs.mkdirSync('node_modules/ts-chacha20',{recursive:true});fs.writeFileSync('node_modules/ts-chacha20/package.json','{}');}else{event('npm-helper');if(c.mode==='download-failure')process.exit(13);const p='node_modules/sql-template-strings';fs.mkdirSync(p,{recursive:true});fs.writeFileSync(p+'/package.json',JSON.stringify({name:'sql-template-strings',version:'2.2.2',typings:'index.d.ts',main:'index.js'}));fs.writeFileSync(p+'/index.js','module.exports = {};\\n');if(c.mode!=='missing-dependency')fs.writeFileSync(p+'/index.d.ts','export declare const SQL: unknown;\\n');}");
  executable('node', prefix + "const a=process.argv.slice(2);if(a[0]==='node_modules/typescript/bin/tsc'){event('typecheck');if(c.mode==='type-failure'){console.error('error TS9999: controlled type failure');process.exit(14);}}else if(a[0]==='build'){event('build');if(c.mode==='build-failure')process.exit(15);for(const n of ['sim','data','lib','config']){fs.mkdirSync('dist/'+n,{recursive:true});fs.writeFileSync('dist/'+n+'/fixture.js','fixture');}}else{const r=cp.spawnSync(c.node,a,{stdio:'inherit',env:process.env});process.exit(r.status===null?1:r.status);}");
  const env = {...process.env, SHOWDOWN_SRC: f.source, PF_BUILD_FIXTURE_CONFIG: config, PATH: bin + path.delimiter + process.env.PATH}; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  const result = spawnSync('bash', [path.join(game, 'scripts/build-showdown.sh')], {env, encoding: 'utf8'});
  const events = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return {result, events, stage, f};
}
test('shell pipeline prepares then typechecks then builds and stages on success', t => {
  const p = pipeline(t, 'success'); assert.equal(p.result.status, 0, p.result.stderr);
  assert.deepEqual(p.events.filter(x => x !== 'git-diff'), ['npm-root', 'npm-helper', 'typecheck', 'build']);
  assert.equal(fs.readFileSync(path.join(p.stage, 'SOURCE_SHA'), 'utf8'), pin + '\n'); assert.equal(fs.existsSync(path.join(p.stage, 'old')), false);
});
for (const mode of ['npm-failure', 'download-failure', 'missing-dependency', 'type-failure', 'build-failure', 'dirty-source', 'dirty-after-build', 'missing-format']) test('shell ' + mode + ' fails closed and preserves previous stage', t => {
  const p = pipeline(t, mode); assert.notEqual(p.result.status, 0, p.result.stdout);
  assert.deepEqual(fs.readdirSync(p.stage), ['old']); assert.equal(fs.readFileSync(path.join(p.stage, 'old'), 'utf8'), 'last-good-stage\n');
  if (['npm-failure', 'download-failure', 'missing-dependency', 'dirty-source', 'missing-format'].includes(mode)) assert.equal(p.events.includes('typecheck'), false);
  if (mode !== 'build-failure' && mode !== 'dirty-after-build') assert.equal(p.events.includes('build'), false);
});
