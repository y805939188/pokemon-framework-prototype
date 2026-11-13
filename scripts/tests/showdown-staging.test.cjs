'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const pin = '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-stage-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, text) => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  for (const dir of ['sim', 'data', 'lib', 'config']) fs.mkdirSync(path.join(root, 'js/engine/showdown/dist', dir), { recursive: true });
  fs.mkdirSync(path.join(root, 'js/engine/showdown/node_modules/ts-chacha20'), { recursive: true });
  write('scripts/showdown.env', `SHOWDOWN_SHA="${pin}"\n`);
  write('js/engine/showdown/SOURCE_SHA', `${pin}\n`);
  write('js/engine/showdown/LICENSE', 'fixture license');
  write('js/engine/build/custom-formats.cjs', 'fixture format');
  write('js/engine/showdown/dist/config/custom-formats.js', 'fixture format');
  write('js/engine/build/content-cli.cjs', "require('node:fs').writeFileSync('../content-ran', 'yes');\n");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/package.json'), 'utf8'));
  write('src/package.json', JSON.stringify({ private: true, scripts: { 'content:build': pkg.scripts['content:build'] } }));
  const helper = path.join(ROOT, 'scripts/check-showdown-staging.cjs');
  if (fs.existsSync(helper)) fs.copyFileSync(helper, path.join(root, 'scripts/check-showdown-staging.cjs'));
  return { root, write, run: () => spawnSync('pnpm', ['--dir', path.join(root, 'src'), 'content:build'], { encoding: 'utf8', env: process.env }) };
}

test('normal local content build consumes matching staged rules without an upstream build', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(f.root, 'content-ran'), 'utf8'), 'yes');
});

for (const [name, change, diagnostic] of [
  ['missing runtime', f => fs.rmSync(path.join(f.root, 'js/engine/showdown'), { recursive: true }), /missing .*showdown/],
  ['incomplete runtime', f => fs.rmSync(path.join(f.root, 'js/engine/showdown/dist/sim'), { recursive: true }), /missing .*dist\/sim/],
  ['wrong pinned revision', f => f.write('js/engine/showdown/SOURCE_SHA', '0'.repeat(40)), /SHA .*does not match/],
  ['stale staged rules', f => f.write('js/engine/showdown/dist/config/custom-formats.js', 'old format'), /custom-formats.*differs/],
  ['missing built rules', f => fs.rmSync(path.join(f.root, 'js/engine/build/custom-formats.cjs')), /missing .*custom-formats\.cjs/],
]) {
  test(`normal local content build rejects ${name} before consuming Dex`, t => {
    const f = fixture(t); change(f); const result = f.run();
    assert.notEqual(result.status, 0, 'stale or missing staging must fail');
    assert.equal(fs.existsSync(path.join(f.root, 'content-ran')), false);
    assert.match(result.stdout + result.stderr, diagnostic);
    assert.match(result.stdout + result.stderr, /pnpm --dir src build:engine.*scripts\/build-showdown\.sh/);
  });
}
