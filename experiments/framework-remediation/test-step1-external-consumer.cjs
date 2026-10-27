'use strict';
// Build an actually external consumer from the delivery only. src is used solely for the pinned compiler/type packages
// during setup; consumer runtime and type resolution never reference the implementation tree or NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'build/framework-cjs');
const TEMPLATE = path.join(__dirname, 'external-consumer');
const TSC = path.join(SRC, 'node_modules/typescript/bin/tsc');
const preserved = process.env.PF_STEP1_CONSUMER_DIR ? path.resolve(process.env.PF_STEP1_CONSUMER_DIR) : null;
const work = preserved ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pf-step1-consumer-'));
const consumer = path.join(work, 'consumer');
const env = { ...process.env };
delete env.NODE_PATH;
delete env.PF_STEP1_CONSUMER_DIR;

function copyTemplate(destination) {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(TEMPLATE, destination, { recursive: true, force: true, dereference: true });
}
function copyPackage(destination, withShowdown = true) {
  const target = path.join(destination, 'node_modules/@pokemon-framework/engine');
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(DIST, target, {
    recursive: true, force: true, dereference: true,
    filter: source => withShowdown || !path.relative(DIST, source).split(path.sep).join('/').startsWith('js/engine/showdown'),
  });
}
function installDeclarationDependencies(destination) {
  const nodeTypes = require.resolve('@types/node/package.json', { paths: [SRC] });
  for (const [name, version] of [['@types/node', '22.20.4'], ['undici-types', '6.21.0']]) {
    // pnpm places the transitive package beside @types/node in its isolated dependency closure, not at src/node_modules.
    const resolutionPaths = name === 'undici-types' ? [path.dirname(nodeTypes)] : [SRC];
    const manifest = require.resolve(`${name}/package.json`, { paths: resolutionPaths });
    const source = path.dirname(manifest);
    assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).version, version, `${name} must come from the locked local dependency`);
    const target = path.join(destination, 'node_modules', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, force: true, dereference: true });
  }
}
function run(t, args, cwd = consumer) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
function successful(result, label) {
  assert.equal(result.status, 0, `${label}\n${result.stdout}${result.stderr}`);
}

test.before(() => {
  assert.equal(fs.existsSync(path.join(DIST, 'manifest.json')), true, 'run pnpm --dir src build:distribution first');
  assert.equal(fs.existsSync(TSC), true);
  if (preserved) {
    fs.mkdirSync(preserved, { recursive: true });
    assert.deepEqual(fs.readdirSync(preserved), [], 'the preserved consumer directory must be new/empty; no old evidence is overwritten');
  }
  copyTemplate(consumer);
  copyPackage(consumer);
  installDeclarationDependencies(consumer);
  const compiled = run(null, [TSC, '--pretty', 'false', '-p', 'tsconfig.json']);
  successful(compiled, 'external TypeScript compilation');
});

test.after(() => {
  if (!preserved) fs.rmSync(work, { recursive: true, force: true });
});

test('external declarations compile strictly, and an invalid port is still a type error', t => {
  assert.equal(fs.existsSync(path.join(consumer, 'out/consumer.js')), true);
  const negative = run(t, [TSC, '--pretty', 'false', '-p', 'tsconfig.negative.json']);
  assert.notEqual(negative.status, 0, 'the invalid consumer port must not compile');
  assert.match(negative.stdout + negative.stderr, /TS2322/);
  assert.match(negative.stdout + negative.stderr, /GameState/);
  t.diagnostic(`negative type probe retained: ${(negative.stdout + negative.stderr).trim().split('\n').slice(0, 2).join(' | ')}`);
});

test('external Node CJS runs core, application failure/recovery, real Showdown, legacy and CLI', t => {
  const result = run(t, ['out/consumer.js']);
  successful(result, 'external consumer runtime');
  const lines = result.stdout.trim().split('\n');
  const summary = JSON.parse(lines.at(-1));
  assert.equal(summary.ok, true);
  assert.equal(summary.realShowdown, 'run/applied/already-applied');
  assert.equal(summary.cli, 'progression-example');
  assert.equal(summary.nominalIdentity, 'production/testing/legacy');
  t.diagnostic(`consumer runtime: ${lines.at(-1)}`);
});

test('core/production declarations are host-type-free; testing accurately requires its explicit Node types', t => {
  const dir = path.join(work, 'missing-types');
  copyTemplate(dir);
  copyPackage(dir);
  const pure = run(t, [TSC, '--pretty', 'false', '-p', 'tsconfig.declaration-only.json'], dir);
  successful(pure, 'core/production declarations must not force ambient Node types on pure consumers');
  const result = run(t, [TSC, '--pretty', 'false', '-p', 'tsconfig.testing-declaration.json'], dir);
  assert.notEqual(result.status, 0, `testing declarations must report missing @types/node\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout + result.stderr, /TS2503.*Cannot find namespace 'NodeJS'/);
  t.diagnostic(`missing testing declaration dependency retained: ${(result.stdout + result.stderr).trim().split('\n').slice(0, 3).join(' | ')}`);
});

test('missing package-local Showdown fails at dist/sim without a source or fixture fallback', t => {
  const dir = path.join(work, 'missing-showdown');
  copyTemplate(dir);
  copyPackage(dir, false);
  assert.equal(fs.existsSync(path.join(dir, 'node_modules/@pokemon-framework/engine/js/engine/showdown')), false);
  const result = run(t, ['negative-runtime.cjs'], dir);
  successful(result, 'missing Showdown negative probe');
  assert.match(result.stdout, /MODULE_NOT_FOUND/);
  t.diagnostic(result.stdout.trim());
});

test('external production/testing/legacy identity survives multiple fresh loading orders', t => {
  for (const order of [
    'production,testing,legacy',
    'testing,legacy,production',
    'legacy,production,testing',
    'legacy,testing,production',
  ]) {
    const result = run(t, ['load-order.cjs', order]);
    successful(result, order);
    assert.match(result.stdout, /identity OK/);
  }
  t.diagnostic('4 external fresh-process loading orders passed');
});
