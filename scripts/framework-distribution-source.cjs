'use strict';
// Shared by the distribution builder and its headless regression verifier.
// Keep one definition of the builder's source fingerprint; no build is run here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCE_INPUTS = [
  'src/framework', 'src/vite.engine.config.mts', 'src/package.json', 'src/pnpm-lock.yaml',
  'scripts/showdown.env', 'scripts/build-framework-distribution.cjs', 'scripts/framework-distribution-source.cjs',
  'scripts/check-showdown-staging.cjs',
  'js/engine/fixtures', 'js/engine/game', 'js/engine/rpg',
  'js/engine/gateway.cjs', 'js/engine/harness.cjs', 'js/engine/matrix.cjs',
  'content/sample', 'content/examples/progression',
  'docs/framework-remediation/step1-api.zh.md', 'docs/step5/distribution.md',
];
function walk(directory, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
    else if (!entry.isSymbolicLink()) throw new Error(`unsupported distribution input: ${path.join(directory, entry.name)}`);
  }
  return out.sort();
}
function sourceFingerprint(root) {
  const hash = crypto.createHash('sha256');
  for (const input of SOURCE_INPUTS) {
    const absolute = path.join(root, input);
    if (!fs.existsSync(absolute)) throw new Error(`missing distribution source input: ${input}`);
    const files = fs.statSync(absolute).isDirectory() ? walk(absolute).map(relative => `${input}/${relative}`) : [input];
    for (const relative of files.sort()) {
      hash.update(relative.replaceAll(path.sep, '/')); hash.update('\0');
      hash.update(fs.readFileSync(path.join(root, relative))); hash.update('\0');
    }
  }
  return hash.digest('hex');
}
module.exports = {SOURCE_INPUTS, sourceFingerprint};
