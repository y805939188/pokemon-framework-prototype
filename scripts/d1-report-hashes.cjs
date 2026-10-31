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
  process.stdout.write(JSON.stringify(hashes) + '\n');
} catch (error) {
  process.stderr.write('D1 report hash verification failed: ' + error.message + '\n');
  process.exitCode = 1;
}
