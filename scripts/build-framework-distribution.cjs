'use strict';
/**
 * Build the step-1 local CommonJS delivery from this worktree's current sources.
 * No install, fetch, npm publish, stale artifact fallback or host launch is performed.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ENGINE = path.join(ROOT, 'js/engine');
const BUILD = path.join(ENGINE, 'build');
const OUT = path.join(ROOT, 'build/framework-cjs');
const PACKAGE_NAME = '@pokemon-framework/engine';
const MANIFEST = 'manifest.json';
const SUMS = 'SHA256SUMS';

function run(command, args) {
  const shown = [command, ...args].join(' ');
  console.log(`+ ${shown}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (result.error) throw new Error(`${shown}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${shown}: exit ${result.status}`);
}

function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute, rel));
    else if (entry.isFile()) out.push(rel);
    else if (!entry.isSymbolicLink()) throw new Error(`unsupported distribution input: ${absolute}`);
  }
  return out.sort();
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sourceFingerprint() {
  const hash = crypto.createHash('sha256');
  const inputs = [
    'src/framework', 'src/vite.engine.config.mts', 'src/package.json', 'src/pnpm-lock.yaml',
    'scripts/showdown.env', 'scripts/build-framework-distribution.cjs',
    'js/engine/fixtures', 'js/engine/game', 'js/engine/rpg',
    'js/engine/gateway.cjs', 'js/engine/harness.cjs', 'js/engine/matrix.cjs',
    'content/sample', 'content/examples/progression',
    'docs/framework-remediation/step1-api.zh.md', 'docs/step5/distribution.md',
  ];
  for (const input of inputs) {
    const absolute = path.join(ROOT, input);
    if (!fs.existsSync(absolute)) throw new Error(`missing distribution source input: ${input}`);
    const files = fs.statSync(absolute).isDirectory() ? walk(absolute).map(rel => `${input}/${rel}`) : [input];
    for (const rel of files.sort()) {
      hash.update(rel.replaceAll(path.sep, '/'));
      hash.update('\0');
      hash.update(fs.readFileSync(path.join(ROOT, rel)));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', env: process.env });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

function copyFile(rel) {
  const from = path.join(ROOT, rel), to = path.join(OUT, rel);
  if (!fs.existsSync(from)) throw new Error(`missing distribution input: ${rel}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(rel) {
  const from = path.join(ROOT, rel), to = path.join(OUT, rel);
  if (!fs.existsSync(from)) throw new Error(`missing distribution input directory: ${rel}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}

function copyAndRename(fromRel, toRel) {
  const from = path.join(ROOT, fromRel), to = path.join(OUT, toRel);
  if (!fs.existsSync(from)) throw new Error(`missing distribution input: ${fromRel}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function stagedShowdownSha() {
  const pinText = fs.readFileSync(path.join(ROOT, 'scripts/showdown.env'), 'utf8');
  const sha = /^SHOWDOWN_SHA="([a-f0-9]{40})"$/m.exec(pinText)?.[1];
  if (!sha) throw new Error('scripts/showdown.env has no valid SHOWDOWN_SHA');
  const staged = path.join(ENGINE, 'showdown');
  for (const rel of ['dist/sim', 'dist/data', 'dist/lib', 'dist/config', 'node_modules/ts-chacha20', 'LICENSE', 'SOURCE_SHA']) {
    if (!fs.existsSync(path.join(staged, rel))) throw new Error(`staged Showdown is incomplete: missing js/engine/showdown/${rel}`);
  }
  const actual = fs.readFileSync(path.join(staged, 'SOURCE_SHA'), 'utf8').trim();
  if (actual !== sha) throw new Error(`staged Showdown SHA ${actual} does not match ${sha}`);
  const builtFormat = path.join(BUILD, 'custom-formats.cjs');
  const stagedFormat = path.join(staged, 'dist/config/custom-formats.js');
  if (!fs.existsSync(builtFormat) || !fs.existsSync(stagedFormat) || !fs.readFileSync(builtFormat).equals(fs.readFileSync(stagedFormat)))
    throw new Error('staged Showdown custom-formats.js differs from the current build; run the approved local staging step');
  return sha;
}

function entry(types, runtime) {
  return { types, require: runtime, default: runtime };
}

function packageJson() {
  const build = name => `./js/engine/build/${name}`;
  const legacy = {
    './legacy/gateway.cjs': ['./types/battle/gateway.d.ts', './js/engine/gateway.cjs'],
    './legacy/harness.cjs': ['./types/tools/harness.d.ts', './js/engine/harness.cjs'],
    './legacy/matrix.cjs': ['./types/tools/matrix.d.ts', './js/engine/matrix.cjs'],
    './legacy/fixtures/game.cjs': ['./types/tools/fixtures/game.d.ts', './js/engine/fixtures/game.cjs'],
    './legacy/game/store.cjs': ['./types/tools/save-store.d.ts', './js/engine/game/store.cjs'],
    './legacy/game/state.cjs': ['./types/rules/state.d.ts', './js/engine/game/state.cjs'],
    './legacy/game/session.cjs': ['./types/flow/session.d.ts', './js/engine/game/session.cjs'],
    './legacy/game/growth.cjs': ['./types/rules/growth.d.ts', './js/engine/game/growth.cjs'],
    './legacy/game/describe.cjs': ['./types/flow/describe.d.ts', './js/engine/game/describe.cjs'],
    './legacy/rpg/rules.cjs': ['./types/rules/rules.d.ts', './js/engine/rpg/rules.cjs'],
  };
  return {
    name: PACKAGE_NAME,
    version: '0.0.0-step1',
    private: true,
    license: 'UNLICENSED',
    type: 'commonjs',
    main: build('production.cjs'),
    types: './types/production.d.ts',
    engines: { node: '>=22.18' },
    // Public declarations name Node builtins and NodeJS.ErrnoException. Runtime dependencies are already staged.
    dependencies: { '@types/node': '22.20.4' },
    exports: {
      '.': entry('./types/production.d.ts', build('production.cjs')),
      './production': entry('./types/production.d.ts', build('production.cjs')),
      './testing': entry('./types/testing.d.ts', build('testing.cjs')),
      './core': entry('./types/rules/index.d.ts', build('core.cjs')),
      './legacy': entry('./types/index.d.ts', build('engine.cjs')),
      './content-cli': entry('./types/tools/content-cli.d.ts', build('content-cli.cjs')),
      './content/sample.json': './data/framework/content.json',
      './manifest.json': './manifest.json',
      './package.json': './package.json',
      ...Object.fromEntries(Object.entries(legacy).map(([subpath, [types, runtime]]) => [subpath, entry(types, runtime)])),
    },
  };
}

const before = sourceFingerprint();
run('pnpm', ['--dir', SRC, 'build:engine']);
const showdownSha = stagedShowdownSha();
run('pnpm', ['--dir', SRC, 'content:build']);

// Only this script's ignored output is removed. Source, prior evidence and all other build directories stay untouched.
if (fs.existsSync(OUT) && fs.lstatSync(OUT).isSymbolicLink()) throw new Error(`refusing to replace symlinked output ${OUT}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const tsc = path.join(SRC, 'node_modules/typescript/bin/tsc');
if (!fs.existsSync(tsc)) throw new Error('local TypeScript compiler is missing; dependencies must be prepared before this build');
run(process.execPath, [tsc, '--pretty', 'false', '-p', path.join(SRC, 'framework/tsconfig.declarations.json')]);

for (const rel of ['js/engine/build', 'js/engine/showdown', 'js/engine/fixtures', 'js/engine/game', 'js/engine/rpg', 'content/sample', 'content/examples/progression']) copyDir(rel);
for (const rel of ['js/engine/gateway.cjs', 'js/engine/harness.cjs', 'js/engine/matrix.cjs', 'scripts/showdown.env', 'data/framework/content.json']) copyFile(rel);
copyAndRename('docs/framework-remediation/step1-api.zh.md', 'README.zh.md');
copyAndRename('docs/step5/distribution.md', 'THIRD-PARTY-NOTICES.md');
for (const rel of ['types/production.d.ts', 'types/testing.d.ts', 'types/index.d.ts', 'types/rules/index.d.ts', 'types/tools/content-cli.d.ts'])
  if (!fs.existsSync(path.join(OUT, rel))) throw new Error(`declaration build did not produce ${rel}`);
fs.writeFileSync(path.join(OUT, 'package.json'), `${JSON.stringify(packageJson(), null, 2)}\n`);

const after = sourceFingerprint();
if (after !== before) throw new Error(`source inputs changed during the build: ${before} -> ${after}`);
const artifactHashes = {};
for (const rel of walk(OUT)) if (![MANIFEST, SUMS].includes(rel)) artifactHashes[rel] = hashFile(path.join(OUT, rel));
const manifest = {
  formatVersion: 1,
  package: PACKAGE_NAME,
  moduleFormat: 'CommonJS',
  source: {
    sha: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    dirty: git('status', '--porcelain') !== '',
    fingerprint: after,
  },
  toolchain: {
    node: process.version,
    typescript: '7.0.2',
    vite: '8.3.1',
    declarationConfig: 'src/framework/tsconfig.declarations.json',
    consumer: { module: 'Node16', moduleResolution: 'Node16', target: 'ES2022', strict: true, skipLibCheck: false },
  },
  dependencies: {
    showdown: {
      sha: showdownSha,
      source: 'https://github.com/smogon/pokemon-showdown',
      license: 'MIT (see js/engine/showdown/LICENSE; redistribution review remains open)',
      path: 'js/engine/showdown',
    },
    nodeTypes: {
      version: '22.20.4',
      source: 'https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node',
      license: 'MIT',
      purpose: 'TypeScript declarations only',
      transitive: { 'undici-types': '6.21.0' },
    },
  },
  files: artifactHashes,
};
fs.writeFileSync(path.join(OUT, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
const sums = walk(OUT).filter(rel => rel !== SUMS).map(rel => `${hashFile(path.join(OUT, rel))}  ${rel}`).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, SUMS), sums);
console.log(`distribution: ${OUT}`);
console.log(`source: ${manifest.source.sha}${manifest.source.dirty ? ' (dirty; not a fixed candidate)' : ' (clean)'}`);
console.log(`artifacts: ${Object.keys(artifactHashes).length} hashed inputs, ${walk(OUT).length} total files`);
console.log(`SHA256SUMS sha256: ${hashFile(path.join(OUT, SUMS))}`);
