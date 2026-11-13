#!/usr/bin/env node
'use strict';

// Pin the bytes actually copied by setup-reactor, independently of writable
// installed manifests and runtime version/revision comments.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sourceManifest } = require('./reactor-types.cjs');

function runtimeManifest(runtimeRoot) {
  const files = [];
  function directory(relative) {
    const target = path.join(runtimeRoot, relative);
    if (!fs.lstatSync(target).isDirectory()) throw new Error(`Runtime directory is missing or is a symlink: ${relative || 'runtime'}`);
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (!relative && (file === 'reactor_plugins.js' || !/^reactor_.*\.js$/.test(file))) continue;
      if (entry.isSymbolicLink()) throw new Error(`Runtime contains a symlink: ${file}`);
      if (entry.isDirectory() && relative) directory(file);
      else if (entry.isFile()) files.push(file);
      else throw new Error(`Unexpected runtime file type: ${file}`);
    }
  }
  // The top-level copy is reactor_*.js plus the entire libs directory.
  directory('');
  directory('libs');
  for (const file of ['reactor_main.js', 'libs/pixi.js', 'libs/pixi_compat.js']) {
    if (!files.includes(file)) throw new Error(`Runtime source is missing ${file}`);
  }
  return Object.fromEntries(files.sort().map(file => [`runtime/${file}`,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(runtimeRoot, file))).digest('hex')]));
}

function pinnedManifest(repository, commit) {
  const pin = JSON.parse(fs.readFileSync(path.join(__dirname, 'reactor-source-manifest.json'), 'utf8'));
  if (pin.schema !== 1 || pin.repository !== repository || pin.commit !== commit || !pin.runtime || !pin.declarations) {
    throw new Error('Pinned Reactor source manifest does not match versions.env; update both pins deliberately.');
  }
  return pin;
}

function sameFiles(actual, expected, label) {
  for (const file of Object.keys(expected).sort()) {
    if (actual[file] !== expected[file]) throw new Error(`${label} is missing or modified against the selected source: ${file}`);
  }
  for (const file of Object.keys(actual).sort()) {
    if (!Object.hasOwn(expected, file)) throw new Error(`${label} contains an unexpected source file: ${file}`);
  }
}

function selectedManifest(source, repository, commit, assurance) {
  if (assurance === 'strict') return pinnedManifest(repository, commit);
  if (assurance !== 'development' || !source || source === '-') throw new Error('Invalid Reactor source assurance mode.');
  return { runtime: runtimeManifest(path.join(source, 'runtime')), declarations: sourceManifest(source) };
}

function main() {
  const [mode, target, ...args] = process.argv.slice(2);
  try {
    if (mode === 'validate') {
      const [repository, commit, assurance] = args;
      const expected = selectedManifest(target, repository, commit, assurance);
      sameFiles(runtimeManifest(path.join(target, 'runtime')), expected.runtime, 'Runtime source');
      sameFiles(sourceManifest(target), expected.declarations, 'Declaration source');
    } else if (mode === 'check' || mode === 'runtime-check') {
      const [source, repository, commit, assurance] = args;
      const expected = selectedManifest(source, repository, commit, assurance);
      sameFiles(runtimeManifest(path.join(target, 'js')), expected.runtime, 'Installed runtime');
      if (mode === 'check') {
        sameFiles(sourceManifest(path.join(target, 'src/vendor/rpgreactor')), expected.declarations, 'Installed declarations');
      }
    } else {
      throw new Error('Usage: reactor-source.cjs validate SOURCE REPO COMMIT strict|development; check|runtime-check PROJECT SOURCE|- REPO COMMIT strict|development');
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { runtimeManifest, pinnedManifest, sameFiles };
if (require.main === module) main();
