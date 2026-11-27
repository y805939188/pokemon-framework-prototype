'use strict';
// Deterministic App lifecycle only. No statistical-run mode exists in this driver.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), crypto = require('node:crypto'), { builtinModules } = require('node:module');
const { pathToFileURL } = require('node:url');
const { fixture } = require('./application-lifecycle-fixture.cjs'), O = require('./application-lifecycle-oracle.cjs');
const V = require('./application-lifecycle-vectors.json'), S = require('./application-lifecycle-source-map.json');
const ROOT = path.resolve(__dirname, '../../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const record = p => ({ path: p, bytes: fs.statSync(p).size, sha256: sha(fs.readFileSync(p)) });
const write = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const git = (...args) => cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
function identity() { return { commit: git('rev-parse', 'HEAD'), src: git('rev-parse', 'HEAD:src'), tree: git('rev-parse', 'HEAD^{tree}'), worktree: ROOT,
  dirty: git('status', '--porcelain'), node: process.version, execPath: process.execPath, platform: process.platform, arch: process.arch }; }
function options(argv) {
  const mode = argv.shift(), result = { mode };
  assert(['--prepare', '--exercise'].includes(mode), 'only --prepare / --exercise; no statistics');
  while (argv.length) { const key = argv.shift(); assert(['--out', '--compiler-root', '--prepared', '--expected-commit', '--old-p5-evidence', '--mz-runtime'].includes(key), key); assert(argv.length); assert(!Object.hasOwn(result, key.slice(2))); result[key.slice(2)] = argv.shift(); }
  assert(result.out && path.isAbsolute(result.out), '--out is a NEW absolute directory'); return result;
}
function verify(rows) { for (const row of rows) assert.equal(record(row.path).sha256, row.sha256, 'changed input ' + row.path); }
function files(root) { const rows = []; for (const name of fs.readdirSync(root).sort()) { const p = path.join(root, name); if (fs.statSync(p).isDirectory()) rows.push(...files(p)); else rows.push(record(p)); } return rows; }
// Bind every local lifecycle input, including the surf host stored with field fixtures.
function harness() {
  const names = fs.readdirSync(__dirname).filter(name => name.startsWith('application-lifecycle-'));
  for (const name of ['entry.ts','fixture.cjs','oracle.cjs','run.cjs','source-map.json','vectors.json'])
    assert(names.includes('application-lifecycle-' + name), 'missing lifecycle harness input: ' + name);
  names.push('application-lifecycle.md', '../field/application-lifecycle-surf-host.cjs');
  return names.sort().map(name => record(path.join(__dirname, name)));
}
function precheck() {
  assert.equal(process.version, 'v22.21.1'); const current = identity(); assert.equal(current.dirty, '', 'fixed clean dedicated harness required');
  assert.equal(V.statisticalSamples, 0); assert.equal(current.src, S.candidateSrcTree, 'candidate changed: prepare a new explicit source mapping');
  const map = S.productionSources.map(row => { const actual = record(path.join(ROOT, row.path)); return { ...row, actualSha256: actual.sha256, sameAsFormalFirst: actual.sha256 === row.formalFirstSha256 }; });
  for (const row of map) assert.equal(row.actualSha256, row.candidateSha256, row.path);
  return { current, map };
}
async function prepare(opts, out) {
  const { current, map } = precheck(); assert(opts['compiler-root'] && opts['old-p5-evidence']); if (opts['expected-commit']) assert.equal(current.commit, opts['expected-commit']);
  const inputFiles = harness(), protectedOld = files(opts['old-p5-evidence']);
  const contracts = ['docs/contracts/world-operations.md', 'docs/testing/encounter-statistics.md', 'tests/support/saves/legacy-migration/fixtures.cjs'].map(p => record(path.join(ROOT, p)));
  if (opts['mz-runtime']) { assert(path.isAbsolute(opts['mz-runtime'])); contracts.push(record(opts['mz-runtime'])); }
  const compilerPath = require.resolve('vite', { paths: [opts['compiler-root']] }), vite = await import(pathToFileURL(compilerPath)), included = new Set();
  await vite.build({ configFile: false, root: ROOT, logLevel: 'warn', plugins: [{ name: 'p5-app-lifecycle-binding', transform(_code, id) { if (id.startsWith(ROOT + '/') && id.endsWith('.ts')) included.add(id); } }],
    build: { target: 'es2022', outDir: path.join(out, 'private-bundle'), emptyOutDir: false, minify: false,
      lib: { entry: path.join(__dirname, 'application-lifecycle-entry.ts'), formats: ['cjs'], fileName: () => 'product.cjs' }, rolldownOptions: { platform: 'node', external: [...builtinModules, /^node:/] } } });
  assert.deepEqual(identity(), current); verify(inputFiles); verify(protectedOld); verify(contracts);
  const receipt = { status: 'PREPARED_DETERMINISTIC_ONLY', at: new Date().toISOString(), identity: current, inputFiles, contracts, productionModules: [...included].sort().map(record),
    compiler: { version: vite.version, entry: record(compilerPath) }, bundle: record(path.join(out, 'private-bundle/product.cjs')), protectedOld, mzRuntime: opts['mz-runtime'] ?? null,
    original20CellModuleMapping: map, statisticalSamples: 0, target: 'real GameApplication public entries; explicit synthetic session/host; native atomic adapter' };
  write(path.join(out, 'PREPARED.json'), receipt); return { status: receipt.status, moduleCount: included.size, statisticalSamples: 0 };
}
function snapshot(w) {
  const game = w.state(); return { runtimeObservation: w.runtime().observation, runtime: w.runtime().value, persistentStateSha256: sha(JSON.stringify(game)),
    steps: game.steps, encounterVersion: game.world.encounterVersion, repelSteps: game.world.repelSteps, surfing: game.world.surfing, weather: game.world.weather,
    visitedMaps: game.world.visitedMaps, healingSpot: game.world.healingSpot, sessions: w.sessions.length, saveBlocked: w.app.saveBlocked, appliedBattles: Object.keys(game.appliedBattles) };
}
function oracleChain(rows) {
  let runtime = O.initial(); const all = [];
  for (const row of rows) { const step = O.transition(runtime, row); assert.deepEqual(step.runtime, row.expected.runtime, 'literal/oracle runtime ' + row.id); assert.equal(step.reason, row.expected.reason, row.id); all.push({ id: row.id, status: 'ORACLE_ONLY', before: runtime, ...step }); runtime = step.runtime; }
  return all;
}
async function chain(name, rows, P, out, runtimePath) {
  const w = fixture(P, { runtimePath }), trace = []; write(path.join(out, name + '-INITIAL.json'), { game: w.initialGame, content: w.content, snapshot: snapshot(w) });
  for (const row of rows) {
    const before = snapshot(w); let observed;
    try {
      observed = await w.perform(row);
      const after = snapshot(w), record = { id: row.id, status: observed.status, before, after, observed };
      fs.appendFileSync(path.join(out, name + '-TRACE.ndjson'), JSON.stringify(record) + '\n'); trace.push(record);
      if (observed.status === 'NOT_READY') return { status: 'PARTIAL_NOT_READY', completedActions: trace.length - 1, blockedAt: row.id, reason: observed.reason, trace, hostTrace: w.hostTrace };
      const expected = row.expected, reason = observed.result.reason ?? observed.result.commit ?? observed.result.status;
      assert.equal(reason, expected.reason, row.id + ' outcome'); assert.deepEqual(after.runtime, expected.runtime, row.id + ' runtime');
      for (const key of ['steps', 'sessions', 'saveBlocked', 'repelSteps', 'surfing']) assert.equal(after[key], expected[key], row.id + ' ' + key);
      assert.deepEqual(observed.draws.map(({ n, value }) => ({ n, value })), row.tape, row.id + ' full RNG prefix');
      if (row.world) { assert.equal(after.weather.type, row.world.weather); assert.deepEqual(after.visitedMaps, row.world.visitedMaps); assert.deepEqual(after.healingSpot, row.world.healingSpot); }
      if (row.kind === 'session-start') { const setup = w.sessions[w.sessions.length - 1].setup; assert.equal(setup.foes.length, 1); assert.deepEqual({ species: setup.foes[0].species, level: setup.foes[0].level }, name === 'prefix' ? { species: 'B', level: 2 } : { species: 'C', level: 3 }); }
      if (row.kind === 'session-finish') assert.equal(after.appliedBattles.length, w.sessions.length, row.id + ' primary ledger commit');
    } catch (error) {
      fs.appendFileSync(path.join(out, name + '-FAILURE.ndjson'), JSON.stringify({ id: row.id, before, after: snapshot(w), observed, error: String(error), stack: error.stack }) + '\n'); throw error;
    }
  }
  return { status: 'PASS_APP_SCOPED', completedActions: trace.length, trace, hostTrace: w.hostTrace };
}
async function exercise(opts, out) {
  const { current } = precheck(); assert(opts.prepared && path.isAbsolute(opts.prepared)); const prepared = JSON.parse(fs.readFileSync(opts.prepared, 'utf8'));
  assert.equal(prepared.status, 'PREPARED_DETERMINISTIC_ONLY'); assert.deepEqual(current, prepared.identity); verify([...prepared.inputFiles, ...prepared.contracts, ...prepared.productionModules, ...prepared.protectedOld, prepared.bundle]);
  const oracle = { prefix: oracleChain(V.prefixChain), combined: oracleChain(V.combinedPublicApiChain), status: 'PASS_ORACLE_ONLY', statisticalSamples: 0 }; write(path.join(out, 'ORACLE.json'), oracle);
  const P = require(prepared.bundle.path), prefix = await chain('prefix', V.prefixChain, P, out, prepared.mzRuntime), combined = await chain('combined', V.combinedPublicApiChain, P, out, prepared.mzRuntime);
  const result = { status: combined.status === 'PASS_APP_SCOPED' ? 'PASS_APP_LIFECYCLE_WITH_SYNTHETIC_PORTS' : 'PARTIAL_APP_EXECUTED_FULL_P5_NOT_READY', at: new Date().toISOString(), identity: current,
    prefix, combined, statisticalSamples: 0, first20CellResultReused: 'module mapping only; no old formal run repeated or reclassified',
    limitations: ['synthetic host facts and session port; production GameApplication/WorldOperation/rules/native atomic adapter executed', 'NW/real engine/audio/keyboard/focus not exercised', 'Surf requires real E2 App parent and production field host; no hand-written applyStage surrogate', 'current C domain completion and statistics are separate evidence; this driver alone does not accept full P5/C'] };
  verify([...prepared.inputFiles, ...prepared.contracts, ...prepared.productionModules, ...prepared.protectedOld, prepared.bundle]); assert.deepEqual(identity(), current); write(path.join(out, 'RESULT.json'), result);
  return { status: result.status, prefix: prefix.status, prefixActions: prefix.completedActions, combined: combined.status, combinedActions: combined.completedActions, blockedAt: combined.blockedAt, statisticalSamples: 0 };
}
async function main() {
  const opts = options(process.argv.slice(2)), out = opts.out; fs.mkdirSync(out); write(path.join(out, 'ATTEMPT.json'), { at: new Date().toISOString(), argv: process.argv, identity: identity(), statisticalSamples: 0 });
  try { const result = opts.mode === '--prepare' ? await prepare(opts, out) : await exercise(opts, out); write(path.join(out, 'EXIT.json'), { code: 0, result }); process.stdout.write(JSON.stringify(result) + '\n'); }
  catch (error) { write(path.join(out, 'FAILURE.json'), { at: new Date().toISOString(), code: 1, error: String(error), stack: error.stack }); process.stderr.write(error.stack + '\n'); process.exitCode = 1; }
}
main();
