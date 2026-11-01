import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {verifyFreeze} from './freeze.mjs';
import {readJSON,need} from './safe.mjs';
import {runCase} from './candidate.mjs';
import {gateRecord} from './schema.mjs';
const [root,pin,id]=process.argv.slice(2);
try{need(process.argv.length===5,'WORKER_ARGUMENTS');verifyFreeze(root,pin);const fixture=readJSON(path.join(root,'inputs.json')).cases.find(c=>c.definition.id===id);need(fixture,'WORKER_CASE');
 const E=createRequire(import.meta.url)(path.join(root,'runtime/production.cjs'));const r=await runCase(E,fixture);gateRecord(r);process.stdout.write(JSON.stringify(r));}
catch(e){process.stderr.write(/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'WORKER_ERROR');process.exitCode=2;}
