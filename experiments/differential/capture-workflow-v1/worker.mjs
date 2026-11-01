import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {formalEntry} from './freeze.mjs';
import {readJSON,need,noLinks,writeNew,sha} from './safe.mjs';
import {runCase} from './candidate.mjs';
import {gateRecord} from './schema.mjs';
const [root,pin,id,nativeDir]=process.argv.slice(2);
try{need(process.argv.length===6,'WORKER_ARGUMENTS');formalEntry(root,pin,import.meta.url,'worker.mjs');const fixture=readJSON(path.join(root,'inputs.json')).cases.find(c=>c.definition.id===id);need(fixture,'WORKER_CASE');
 const E=createRequire(import.meta.url)(path.join(root,'runtime/production.cjs'));need(path.basename(nativeDir)===id+'-native'&&path.basename(path.dirname(nativeDir))==='execution'&&!fs.existsSync(nativeDir),'NATIVE_EVIDENCE_PATH');noLinks(path.dirname(nativeDir));fs.mkdirSync(nativeDir);const calls=[];const r=await runCase(E,fixture,{onNative({ordinal,role,lifecycle,bytes}){const name=String(ordinal).padStart(2,'0')+'.bin';fs.writeFileSync(path.join(nativeDir,name),bytes,{flag:'wx'});calls.push({ordinal,role,lifecycle,path:name,bytes:bytes.length,sha256:sha(bytes)});}});gateRecord(r);writeNew(path.join(nativeDir,'NATIVE-MANIFEST.json'),{schema:'capture-candidate-private-native-evidence-v1',caseId:id,codec:'node-v8-serialize',node:process.version,calls});process.stdout.write(JSON.stringify(r));}
catch(e){process.stderr.write(/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'WORKER_ERROR');process.exitCode=2;}
