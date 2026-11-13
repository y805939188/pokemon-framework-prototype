'use strict';
// A build-only dependency: keep the server's optional native modules out of the game build.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');

const name = 'sql-template-strings';
const packageKey = 'node_modules/' + name;
const definitionDirectory = path.join(__dirname, 'showdown-build-deps');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (actual, expected, reason) => assert.deepEqual(actual, expected, 'showdown-build-deps: ' + reason);

function validateDefinition(manifest, lock, sourceLockText, revision, pin) {
  same(manifest.private, true, 'manifest must be private');
  same(manifest.dependencies, {[name]: '2.2.2'}, 'only the exact required build dependency is allowed');
  for (const field of ['scripts', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
    same(manifest[field], undefined, 'unsupported manifest field ' + field);
  }
  same(revision, pin, 'actual source revision differs from repository pin');
  same(revision, manifest.showdown.commit, 'source revision differs from dependency definition');
  same(hash(sourceLockText), manifest.showdown.lockSHA256, 'upstream lock bytes changed');
  same(lock.lockfileVersion, 3, 'build dependency lock format');
  same(lock.name, manifest.name, 'lock package name');
  same(lock.version, manifest.version, 'lock package version');
  same(Object.keys(lock.packages).sort(), ['', packageKey], 'unexpected packages in build dependency lock');
  same(lock.packages[''], {name: manifest.name, version: manifest.version, dependencies: manifest.dependencies}, 'root lock definition');
  const dependency = lock.packages[packageKey];
  same(dependency.version, manifest.dependencies[name], 'dependency version');
  same(dependency.resolved, 'https://registry.npmjs.org/sql-template-strings/-/sql-template-strings-2.2.2.tgz', 'official locked registry URL');
  assert.match(dependency.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/, 'showdown-build-deps: SHA-512 integrity required');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'hasInstallScript', 'link', 'optional']) {
    same(dependency[field], undefined, 'unsupported dependency field ' + field);
  }
  const upstream = JSON.parse(sourceLockText).packages[packageKey];
  for (const field of ['version', 'resolved', 'integrity']) same(dependency[field], upstream[field], 'upstream ' + field + ' mismatch');
  return dependency;
}

function inspectPackage(directory, version) {
  const directoryStat = fs.lstatSync(directory);
  assert(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), 'showdown-build-deps: package directory must be local');
  const files = {};
  function visit(current) {
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'showdown-build-deps: package links are not allowed');
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort()) visit(path.join(current, entry));
    } else {
      assert(stat.isFile(), 'showdown-build-deps: package member must be a regular file');
      files[path.relative(directory, current)] = hash(fs.readFileSync(current));
    }
  }
  visit(directory);
  const metadata = readJSON(path.join(directory, 'package.json'));
  same(metadata.name, name, 'installed package name');
  same(metadata.version, version, 'installed package version');
  same(metadata.typings, 'index.d.ts', 'installed type entry');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    same(Object.keys(metadata[field] ?? {}), [], 'installed package has unexpected ' + field);
  }
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) same(metadata.scripts?.[script], undefined, 'unexpected package lifecycle');
  assert(files['index.js'] && files['index.d.ts'], 'showdown-build-deps: installed package is incomplete');
  return files;
}

function prepare({source, definitions = definitionDirectory, run = execFileSync}) {
  source = fs.realpathSync(source);
  const manifest = readJSON(path.join(definitions, 'package.json'));
  const lock = readJSON(path.join(definitions, 'package-lock.json'));
  const sourceLockText = fs.readFileSync(path.join(source, 'package-lock.json'), 'utf8');
  const pin = fs.readFileSync(path.join(__dirname, 'showdown.env'), 'utf8').match(/^SHOWDOWN_SHA=["']?([a-f0-9]{40})["']?$/m)?.[1];
  assert(pin, 'showdown-build-deps: repository source pin missing');
  const revision = run('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const dependency = validateDefinition(manifest, lock, sourceLockText, revision, pin);
  const nodeModules = path.join(source, 'node_modules');
  assert(fs.lstatSync(nodeModules).isDirectory() && !fs.lstatSync(nodeModules).isSymbolicLink(), 'showdown-build-deps: source dependencies must be local');
  const temporary = fs.mkdtempSync(path.join(path.dirname(source), '.pf-showdown-build-deps-'));
  let staging;
  try {
    for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(definitions, file), path.join(temporary, file));
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--cache', path.join(temporary, 'npm-cache')], {cwd: temporary, stdio: 'inherit'});
    same(fs.readdirSync(path.join(temporary, 'node_modules')).filter(entry => entry !== '.package-lock.json').sort(), [name], 'unexpected installed dependencies');
    const installed = path.join(temporary, 'node_modules', name);
    const files = inspectPackage(installed, dependency.version);
    const destination = path.join(nodeModules, name);
    if (fs.lstatSync(destination, {throwIfNoEntry: false})) {
      same(inspectPackage(destination, dependency.version), files, 'existing package bytes differ');
    } else {
      staging = fs.mkdtempSync(path.join(nodeModules, '.pf-build-dependency-'));
      const prepared = path.join(staging, name);
      fs.cpSync(installed, prepared, {recursive: true, force: false, errorOnExist: true});
      same(inspectPackage(prepared, dependency.version), files, 'copied package bytes differ');
      fs.renameSync(prepared, destination);
    }
    same(fs.readFileSync(path.join(source, 'package-lock.json'), 'utf8'), sourceLockText, 'upstream lock changed during preparation');
    console.log('Showdown build dependency ready:', name, dependency.version, dependency.integrity);
  } finally {
    if (staging) fs.rmSync(staging, {recursive: true, force: true});
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}

if (require.main === module) {
  try {
    assert(process.argv.length === 3, 'usage: node scripts/prepare-showdown-build-deps.cjs <Showdown source>');
    prepare({source: process.argv[2]});
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = {validateDefinition, inspectPackage, prepare};
