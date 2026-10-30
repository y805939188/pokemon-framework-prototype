'use strict';
// Child process for the real-exit test: commits a result and dies (SIGKILL) at the requested point.
const fs = require('fs');
const { SaveStore } = require('../../../js/engine/game/store.cjs');
const [file, resultFile] = process.argv.slice(2);
const at = process.env.CRASH_AT;
const store = require('../../../js/engine/build/engine.cjs').fakes.createFixtureSaveStore(file, { at: point => { if (point === at) process.kill(process.pid, 'SIGKILL'); } }, require('../../../js/engine/build/engine.cjs').speciesKey.identityKeys, require('../../../js/engine/build/engine.cjs').fixtures.content);
const r = store.commit(JSON.parse(fs.readFileSync(resultFile, 'utf8')));
console.log(JSON.stringify(r));
