import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyFreeze} from './freeze.mjs';
import {admit} from './admission.mjs';
import {boundedChild,LIMITS} from './bounded.mjs';
import {newOutput,need,readJSON,writeNew,sha,file,parse,validate,S,HASH} from './safe.mjs';
import {gateRecord,BundleSchema} from './schema.mjs';
import {PROFILE,BOUNDS} from './constants.mjs';
export const ParentPinsSchema=S.obj({dispatchPath:S.str(4096,'^/'),dispatchSHA256:HASH,configPath:S.str(4096,'^/'),configSHA256:HASH,qualificationPath:S.nullable(S.str(4096,'^/')),qualificationSHA256:S.nullable(HASH),freezeSHA256:HASH,fixtureSHA256:HASH,producerSHA256:HASH});
export function preflight(root,pin,pins){const m=verifyFreeze(root,pin);validate(pins,ParentPinsSchema);need(pins.freezeSHA256===pin&&pins.fixtureSHA256===m.fixtureSHA256&&pins.producerSHA256===m.producerSHA256,'PINS_ARTIFACT');return admit(pins);}
export async function produce(root,pin,pins,out,{signal}={}){
 const a=preflight(root,pin,pins);out=newOutput(root,out);fs.mkdirSync(out);fs.mkdirSync(path.join(out,'execution'));
 const records=[],receipts=[];let stop=null;
 for(const id of a.cases){
  const argv=[process.execPath,path.join(root,'tools/worker.mjs'),root,pin,id];
  const r=await boundedChild({argv,cwd:root,limits:{...LIMITS,timeoutMs:BOUNDS.timeoutMs},signal});
  const {stdout,stderr,...meta}=r;receipts.push({caseId:id,argv,environment:{LANG:'C',TZ:'UTC',NODE_OPTIONS:'absent',NODE_PATH:'absent'},...meta});
  fs.writeFileSync(path.join(out,'execution',id+'-stdout.bin'),stdout,{flag:'wx'});fs.writeFileSync(path.join(out,'execution',id+'-stderr.bin'),stderr,{flag:'wx'});
  if(r.status!=='success'){stop={caseId:id,code:r.code==='TIMEOUT'?'TIMEOUT':r.code?.startsWith('CANCELLED')?'CANCELLED':r.code?.endsWith('_LIMIT')?'OUTPUT_LIMIT':!r.cleanupVerified?'CLEANUP_UNVERIFIED':'PROCESS_FAILURE'};break;}
  try{const v=parse(stdout.toString('utf8'));gateRecord(v);need(v.caseId===id&&v.integrity.role==='candidate','WORKER_ID');records.push(v);}catch{stop={caseId:id,code:'PROJECTION_UNSUPPORTED'};break;}
 }
 const bundle={schema:'capture-observations-v1',profile:PROFILE,role:'candidate',runId:a.runId,freezeSHA256:pin,fixtureSHA256:pins.fixtureSHA256,producerSHA256:pins.producerSHA256,dispatchSHA256:pins.dispatchSHA256,records,stop};validate(bundle,BundleSchema);
 fs.writeFileSync(path.join(out,'candidate-observations.json'),JSON.stringify(bundle)+'\n',{flag:'wx'});
 writeNew(path.join(out,'execution.json'),{schema:'capture-candidate-execution-v1',mode:a.mode,runId:a.runId,dispatchSHA256:pins.dispatchSHA256,configSHA256:pins.configSHA256,qualificationSHA256:pins.qualificationSHA256,freezeSHA256:pin,candidateSHA256:sha(file(path.join(out,'candidate-observations.json'))),terminalRecords:records.length,selectedCases:a.cases,stop,cleanupVerified:receipts.every(r=>r.cleanupVerified),receipts});
 return {status:stop?'BLOCKED':'CANDIDATE_ONLY_OBSERVED_NOT_SOURCE_AUDIT_OR_EQUIVALENCE',terminalRecords:records.length,stop,cleanupVerified:receipts.every(r=>r.cleanupVerified),candidateSHA256:sha(file(path.join(out,'candidate-observations.json'))),executionSHA256:sha(file(path.join(out,'execution.json')))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const ac=new AbortController(),cancel=()=>ac.abort();process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
 try{need(process.argv.length===6,'PRODUCER_ARGS');const [root,pin,pinsPath,out]=process.argv.slice(2);const r=await produce(path.resolve(root),pin,readJSON(pinsPath),path.resolve(out),{signal:ac.signal});console.log(JSON.stringify(r));process.exitCode=r.stop?1:0;}
 catch(e){console.log(JSON.stringify({status:'REJECTED',code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'PRODUCER_ERROR'}));process.exitCode=2;}
 finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
