import {mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {verifyProducer,loaderPolicy,flags,readFile,hash,need,PROTOCOL_FREEZE,inventory} from './identity.mjs';
import {boundedChild,LIMITS,executionView} from './bounded.mjs';
export function pathsOverlap(a,b){
 const within=r=>r===''||(!isAbsolute(r)&&r.split(sep)[0]!=='..');
 return within(relative(a,b))||within(relative(b,a));
}
export async function produce(args){
 loaderPolicy();const a=flags(args,['root','expected-producer','plan','out']);const c=verifyProducer(a.root,a['expected-producer']);
 const lib=async p=>import(pathToFileURL(join(c.protocolRoot,'tools',p)));
 const {verifyBundle}=await lib('observation-v2/bundle.mjs'),{approvedDispatchPlan}=await lib('observation-v2/dispatch.mjs'),{normalizeResponse,normalizeFailure,counts}=await lib('observation-v2/protocol.mjs'),{parseJson,strictStringify}=await lib('lib/json.mjs');
 const ctx={...verifyBundle(c.protocolRoot,PROTOCOL_FREEZE),dispatchPlanId:a.plan};approvedDispatchPlan(a.plan,ctx.kit.request);
 const out=resolve(a.out);need(realpathSync(dirname(out))===dirname(out),'CANDIDATE_OUTPUT_LINK');need(!pathsOverlap(c.root,out),'CANDIDATE_OUTPUT_OVERLAP');mkdirSync(out);mkdirSync(join(out,'private'));
 const metadata={role:'candidate',entryId:'ts-core-v1',source:{...ctx.kit.manifest.source,tag:null,files:[{role:'runner',sha256:ctx.kit.hashes.get('runners/ts-runner.mjs')},{role:'core-bundle',sha256:ctx.kit.hashes.get('core/core.cjs')}]},runtime:{name:'node',version:process.version,dependencies:[{name:'node',version:process.version}]}};
 const abort=new AbortController(),cancel=()=>abort.abort(),active=new Set();process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
 const argv=[process.execPath,join(c.root,'producer/coordinator.mjs'),'--root',c.root,'--expected-producer',c.producerFreezeHash,'--plan',a.plan,'--run-dir',join(out,'private')];
 let r;
 try{r=await boundedChild({argv,cwd:ctx.kit.root,signal:abort.signal,extraGroups:active,onMessage:m=>{need(Object.keys(m).sort().join(',')==='phase,pid'&&Number.isSafeInteger(m.pid)&&m.pid>0&&['WORKER_STARTED','WORKER_REAPED'].includes(m.phase),'PRODUCER_CHILD_EVENT');if(m.phase==='WORKER_STARTED')active.add(m.pid);else{need(active.has(m.pid),'PRODUCER_CHILD_EVENT');active.delete(m.pid);}}});}
 finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
 writeFileSync(join(out,'private','coordinator-stdout.bin'),r.stdout,{flag:'wx'});writeFileSync(join(out,'private','coordinator-stderr.bin'),r.stderr,{flag:'wx'});const {stdout,stderr,...receipt}=r;writeFileSync(join(out,'private','coordinator-receipt.json'),JSON.stringify({argv,cwd:ctx.kit.root,environment:{LANG:'C',TZ:'UTC',NODE_OPTIONS:'absent',NODE_PATH:'absent'},execution:receipt},null,2)+'\n',{flag:'wx'});
 let result;
 if(r.status==='success'){
  try{need(Buffer.from(r.stdout.toString('utf8'),'utf8').equals(r.stdout),'CANDIDATE_UTF8');result=normalizeResponse({response:parseJson(r.stdout.toString('utf8')),metadata,execution:executionView(r),observedAtUTC:new Date().toISOString()},ctx);}
  catch(e){r.status='protocol-error';r.code='CANDIDATE_NORMALIZATION_REJECTED';}
 }
 if(!result)result=normalizeFailure({metadata,execution:executionView(r),observedAtUTC:new Date().toISOString()},ctx);
 const target=join(out,'candidate-observations.json');writeFileSync(target,strictStringify(result,true)+'\n',{flag:'wx'});
 const files=inventory(out).map(path=>{const b=readFile(join(out,path),32*1024*1024,false);return {path,bytes:b.length,sha256:hash(b)};});
 const manifest={protocol:'pre54-candidate-production-receipt-v1',producerFreezeSHA256:c.producerFreezeHash,observationFreezeSHA256:PROTOCOL_FREEZE,legacyFreezeSHA256:ctx.kit.freeze.hash,requestHash:ctx.kit.request.requestHash,dispatchPlanId:a.plan,underlyingRunnerSHA256:ctx.kit.hashes.get('runners/ts-runner.mjs'),underlyingCoreSHA256:ctx.kit.hashes.get('core/core.cjs'),actualProducerArgv:[process.execPath,...process.argv.slice(1)],candidatePackageSHA256:hash(readFile(target)),coordinatorStatus:r.status,coordinatorCode:r.code,cleanupVerified:r.cleanupVerified,unacknowledgedGroupCount:active.size,counts:counts(result),files};
 writeFileSync(join(out,'producer-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return {summary:{status:r.status==='success'?'CANDIDATE_PRODUCED_NOT_DUAL_ACCEPTANCE':'CANDIDATE_EXECUTION_FAILED',producerFreezeSHA256:c.producerFreezeHash,candidatePackageSHA256:manifest.candidatePackageSHA256,producerManifestSHA256:hash(readFile(join(out,'producer-manifest.json'))),cleanupVerified:r.cleanupVerified,counts:manifest.counts},exitCode:r.status!=='success'?1:manifest.counts.unobserved?3:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))produce(process.argv.slice(2)).then(r=>{console.log(JSON.stringify(r.summary));process.exitCode=r.exitCode;}).catch(e=>{console.log(JSON.stringify({status:'REJECTED',code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'CANDIDATE_PRODUCER_ERROR'}));process.exitCode=2;});
