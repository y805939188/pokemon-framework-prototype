// Explicit worker only: each original case runs in its own fresh Node process.
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {workerInput} = require('./final-production-runner.cjs');
const input = workerInput(process.env);
const runtime = require('./final-production-runtime.cjs');
await runtime.prepare();
require('node:test').after(() => runtime.verify());
require(input.entry);
