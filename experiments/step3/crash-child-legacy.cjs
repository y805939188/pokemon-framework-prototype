'use strict';
// Child process for the real-kill test of a LEGACY save: commits a result and dies (SIGKILL) at the requested point.
const fs = require('fs');
const { SaveStore } = require('../../js/engine/build/engine.cjs').store;
const [file, resultFile] = process.argv.slice(2);
const at = process.env.CRASH_AT;
const store = new SaveStore(file, { at: point => { if (point === at) process.kill(process.pid, 'SIGKILL'); } }, require('../../js/engine/build/engine.cjs').speciesKey.identityKeys, require('../../js/engine/build/engine.cjs').fixtures.content);
console.log(JSON.stringify(store.commit(JSON.parse(fs.readFileSync(resultFile, 'utf8')))));
