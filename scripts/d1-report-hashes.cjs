'use strict';
// Recompute the driver's JSON.stringify hashes independently; never hash a selected subset of game state.
const fs = require('node:fs');
const crypto = require('node:crypto');
try {
  const raw = fs.readFileSync(0);
  const numberSources = new WeakMap();
  const report = JSON.parse(raw.toString('utf8'), function (key, value, context) {
    if (typeof value === 'number') {
      if (!context || typeof context.source !== 'string') throw new Error('Node JSON source context required (project Node 22+)');
      let entries = numberSources.get(this);
      if (!entries) numberSources.set(this, entries = new Map());
      entries.set(key, context.source);
    }
    return value;
  });
  const benchmark = report.d1;
  if (!benchmark || typeof benchmark !== 'object') throw new Error('missing benchmark');
  function digest(field, hashField) {
    const value = benchmark[field];
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
      throw new Error('missing complete object: ' + field);
    }
    function check(object) {
      for (const [key, child] of Object.entries(object)) {
        if (typeof child === 'number') {
          // Native JSON.stringify emits canonical binary64 tokens. Reject underflow/overflow or rounded aliases.
          if (!Number.isFinite(child) || numberSources.get(object)?.get(key) !== JSON.stringify(child)) {
            throw new Error('unsupported/noncanonical number in ' + field);
          }
        } else if (child && typeof child === 'object') check(child);
      }
    }
    check(value);
    const actual = crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const claimed = benchmark[hashField];
    if (typeof claimed !== 'string' || !/^[a-f0-9]{64}$/.test(claimed) || claimed !== actual) {
      throw new Error('hash mismatch: ' + field);
    }
    return actual;
  }
  const hashes = {
    inputHash: digest('input', 'inputHash'),
    initialStateHash: digest('initialState', 'initialStateHash'),
    finalStateHash: digest('finalState', 'finalStateHash'),
    reportSHA256: crypto.createHash('sha256').update(raw).digest('hex'),
    serialization: 'ECMAScript JSON.stringify, entire input/initialState/finalState; canonical native number tokens',
  };
  if (process.argv[2] === '--game-core') {
    const corePath = require('node:path').resolve(process.argv[3]);
    const core = require(corePath);
    for (const key of ['initialState', 'finalState']) {
      const state = benchmark[key];
      if (state.schema !== core.state.GAME_SCHEMA) throw new Error('current complete game schema required: ' + key);
      const problems = core.saveSchema.validateGame(state);
      if (problems.length) throw new Error('invalid complete game state: ' + key + ': ' + JSON.stringify(problems.slice(0, 3)));
    }
    const ids = benchmark.input.cases.slice(0, benchmark.requestedCount).map(row => row.id);
    if (!Number.isInteger(benchmark.requestedCount) || benchmark.requestedCount < 1 || ids.length !== benchmark.requestedCount) throw new Error('invalid state case count');
    if (Object.keys(benchmark.initialState.appliedBattles).length) throw new Error('initial fixture ledger must be empty');
    const ledger = benchmark.finalState.appliedBattles;
    if (Object.keys(ledger).length !== ids.length || ids.some(id => !Object.hasOwn(ledger, id) || !/^[a-f0-9]{64}$/.test(ledger[id].settlement?.pairHash ?? ''))) throw new Error('final case ledger/pair identity mismatch');
    for (const row of benchmark.rows) {
      if (row.outcome?.battleId !== row.id || row.outcome?.commit !== 'applied') throw new Error('case commit identity mismatch');
      if (!/^[a-f0-9]{64}$/.test(row.afterStateHash ?? '')) throw new Error('invalid per-case state hash');
    }
    if (benchmark.rows.at(-1)?.afterStateHash !== hashes.finalStateHash) throw new Error('last case state differs from complete final state');
    hashes.gameValidation = {corePath, coreSHA256: crypto.createHash('sha256').update(fs.readFileSync(corePath)).digest('hex'), schema: core.state.GAME_SCHEMA, cases: ids.length, intermediateStateHashes: 'format only; per-case complete states are not present'};
  }
  hashes.verifier = {node: process.version, executable: process.execPath, scriptSHA256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')};
  process.stdout.write(JSON.stringify(hashes) + '\n');
} catch (error) {
  process.stderr.write('D1 report hash verification failed: ' + error.message + '\n');
  process.exitCode = 1;
}
