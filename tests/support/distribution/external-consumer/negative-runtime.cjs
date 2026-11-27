'use strict';
const assert = require('node:assert/strict');
const production = require('@pokemon-framework/engine/production');

async function main() {
  await assert.rejects(
    production.gateway.BattleGateway.create({}),
    error => {
      assert.equal(error.code, 'MODULE_NOT_FOUND');
      assert.match(error.message, /js\/engine\/showdown\/dist\/sim/);
      return true;
    },
  );
  console.log('missing Showdown: MODULE_NOT_FOUND at the package-local dist/sim; no fallback');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
