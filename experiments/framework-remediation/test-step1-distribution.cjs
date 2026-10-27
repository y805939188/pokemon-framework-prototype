'use strict';
// The generated local package is checked as a set: runtime, declarations, explicit dependencies and author CLI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'build/framework-cjs');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
    else assert.fail(`unexpected non-file in delivery: ${rel}`);
  }
  return out.sort();
}

test('manifest, SHA256SUMS and every delivered byte agree', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
  assert.match(manifest.source.sha, /^[0-9a-f]{40}$/);
  assert.match(manifest.source.tree, /^[0-9a-f]{40}$/);
  assert.match(manifest.source.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(typeof manifest.source.dirty, 'boolean');
  assert.equal(manifest.moduleFormat, 'CommonJS');
  assert.equal(manifest.toolchain.consumer.module, 'Node16');
  assert.equal(manifest.toolchain.consumer.moduleResolution, 'Node16');
  assert.equal(manifest.dependencies.showdown.sha, '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b');
  assert.equal(manifest.dependencies.nodeTypes.version, '22.20.4');
  assert.equal(manifest.dependencies.nodeTypes.transitive['undici-types'], '6.21.0');
  for (const [rel, expected] of Object.entries(manifest.files)) {
    assert.ok(!path.isAbsolute(rel) && !rel.split('/').includes('..'), rel);
    assert.equal(hash(path.join(DIST, rel)), expected, rel);
  }
  const lines = fs.readFileSync(path.join(DIST, 'SHA256SUMS'), 'utf8').trim().split('\n');
  const sums = new Map(lines.map(line => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(match, line);
    return [match[2], match[1]];
  }));
  assert.equal(sums.size, lines.length, 'no duplicate SHA256SUMS paths');
  const files = walk(DIST);
  assert.deepEqual([...sums.keys()].sort(), files.filter(rel => rel !== 'SHA256SUMS'));
  for (const [rel, expected] of sums) assert.equal(hash(path.join(DIST, rel)), expected, rel);
  assert.equal(Object.keys(manifest.files).length + 1, sums.size, 'manifest itself is covered');
  assert.equal(files.some(rel => rel.endsWith('.ts') && !rel.endsWith('.d.ts')), false, 'no TypeScript implementation sources leak into the package');
});

test('every package export target exists and runtime/declaration files come from this build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(DIST, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'commonjs');
  assert.equal(pkg.private, true);
  assert.equal(pkg.engines.node, '>=22.18');
  assert.equal(pkg.dependencies['@types/node'], '22.20.4');
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    assert.ok(!subpath.includes('src/'), subpath);
    if (typeof target === 'string') {
      assert.equal(fs.existsSync(path.join(DIST, target)), true, `${subpath}: ${target}`);
      continue;
    }
    for (const condition of ['types', 'require', 'default']) {
      assert.equal(fs.existsSync(path.join(DIST, target[condition])), true, `${subpath}: ${condition}`);
    }
  }
  for (const name of ['production.cjs', 'testing.cjs', 'engine.cjs', 'core.cjs', 'content-cli.cjs', 'custom-formats.cjs']) {
    assert.ok(fs.readFileSync(path.join(DIST, 'js/engine/build', name)).equals(fs.readFileSync(path.join(ROOT, 'js/engine/build', name))), name);
  }
  const staged = path.join(DIST, 'js/engine/showdown');
  assert.equal(fs.readFileSync(path.join(staged, 'SOURCE_SHA'), 'utf8').trim(), '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b');
  assert.ok(fs.readFileSync(path.join(staged, 'dist/config/custom-formats.js')).equals(fs.readFileSync(path.join(DIST, 'js/engine/build/custom-formats.cjs'))));
  assert.equal(fs.existsSync(path.join(staged, 'LICENSE')), true);
  assert.equal(fs.existsSync(path.join(staged, 'node_modules/ts-chacha20')), true);
});

test('the delivered production CLI builds and checks author content from the package root, not cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-dist-cli-'));
  try {
    const cli = path.join(DIST, 'js/engine/build/content-cli.cjs');
    const out = path.join(dir, 'nested/content.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const env = { ...process.env };
    delete env.NODE_PATH;
    for (const command of ['build', 'check']) {
      const r = spawnSync(process.execPath, [cli, command, '--src=content/examples/progression', `--out=${out}`], { cwd: dir, env, encoding: 'utf8' });
      assert.equal(r.status, 0, `${command}\n${r.stdout}${r.stderr}`);
      assert.match(r.stdout + r.stderr, new RegExp(command === 'build' ? 'content built' : 'compiled content is current'));
    }
    const compiled = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(compiled.contentId, 'progression-example');
    assert.ok(Array.isArray(compiled.species) && compiled.species.length > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
