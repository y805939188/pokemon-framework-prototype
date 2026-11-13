'use strict';
// One build-time contract for local content, distribution and packaging. No install or upstream build.
const fs = require('node:fs');
const path = require('node:path');

function checkShowdownStaging(root) {
  const prepare = 'run pnpm --dir src build:engine, then scripts/build-showdown.sh';
  const fail = message => { throw new Error(`${message}; ${prepare}`); };
  const pinFile = path.join(root, 'scripts/showdown.env');
  const pin = /^SHOWDOWN_SHA="([a-f0-9]{40})"$/m.exec(fs.readFileSync(pinFile, 'utf8'))?.[1];
  if (!pin) fail('scripts/showdown.env has no valid SHOWDOWN_SHA');
  const stage = 'js/engine/showdown';
  for (const rel of ['dist/sim', 'dist/data', 'dist/lib', 'dist/config', 'node_modules/ts-chacha20', 'LICENSE', 'SOURCE_SHA']) {
    if (!fs.existsSync(path.join(root, stage, rel))) fail(`staged Showdown is incomplete: missing ${stage}/${rel}`);
  }
  const actual = fs.readFileSync(path.join(root, stage, 'SOURCE_SHA'), 'utf8').trim();
  if (actual !== pin) fail(`staged Showdown SHA ${actual} does not match ${pin}`);
  const built = 'js/engine/build/custom-formats.cjs';
  const staged = `${stage}/dist/config/custom-formats.js`;
  for (const rel of [built, staged]) if (!fs.existsSync(path.join(root, rel))) fail(`missing ${rel}`);
  if (!fs.readFileSync(path.join(root, built)).equals(fs.readFileSync(path.join(root, staged))))
    fail('staged Showdown custom-formats.js differs from the current build');
  return pin;
}

module.exports = { checkShowdownStaging };
if (require.main === module) {
  try { checkShowdownStaging(path.resolve(__dirname, '..')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
