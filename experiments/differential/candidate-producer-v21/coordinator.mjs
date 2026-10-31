import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {verifyProducer,loaderPolicy,flags,readFile,need,PROTOCOL_FREEZE} from './identity.mjs';
import {boundedChild,LIMITS} from './bounded.mjs';
const send=m=>{if(process.connected)process.send(m);};
export function wrapLegacyOutcome(o){
 if(o.kind==='value')return {kind:'returned',outcome:{kind:'value',raw:structuredClone(o.raw)}};
 if(o.kind==='error-object')return {kind:'returned',outcome:{kind:'error-object',class:o.class,raw:structuredClone(o.raw)}};
 if(o.kind==='raised')return {kind:'raised',outcome:{kind:'raised',class:o.class,raw:structuredClone(o.raw)}};
 throw Error('CANDIDATE_OUTCOME_KIND');
}
export function observeChild(r,sub,testCase,{parseJson,validateRawResponse,sanitizePre54Outcome}){
 const validStart=m=>m&&Object.keys(m).sort().join(',')==='caseId,childRequestHash,phase'&&m.phase==='LEGACY_ENTRY_START'&&m.caseId===testCase.caseId&&m.childRequestHash===sub.requestHash;
 need(r.messages.length<=2,'CANDIDATE_WORKER_PROOF');
 const start=r.messages[0];
 if(!validStart(start)){
  // Missing entry proof is not evidence that business code did or did not run.
  need(false,'CANDIDATE_ENTRY_PROGRESS_UNKNOWN');
 }
 const technical=reason=>({observation:{kind:'unobserved',attempted:true,reason},randomKnown:false});
 if(r.status!=='success')return technical(r.timedOut?'TIMEOUT':'TECHNICAL_FAILURE');
 const finish=r.messages[1];
 if(!(finish&&Object.keys(finish).sort().join(',')==='caseId,childRequestHash,phase,randomCalls'&&finish.phase==='LEGACY_ENTRY_FINISHED'&&finish.caseId===testCase.caseId&&finish.childRequestHash===sub.requestHash&&Number.isSafeInteger(finish.randomCalls)&&finish.randomCalls>=0))return technical('TECHNICAL_FAILURE');
 let response;
 try{need(Buffer.from(r.stdout.toString('utf8'),'utf8').equals(r.stdout),'CANDIDATE_UTF8');response=parseJson(r.stdout.toString('utf8'));need(validateRawResponse(response,sub).status==='success','CANDIDATE_V1_RESPONSE');}
 catch{return technical('TECHNICAL_FAILURE');}
 if(finish.randomCalls!==0||response.random.seed!==null||response.random.drawCount!==0||response.random.draws.length!==0)return {observation:{kind:'unobserved',attempted:true,reason:'UNSUPPORTED_RANDOM'},randomKnown:false};
 const outcome=response.cases[0].outcome;
 try{sanitizePre54Outcome(outcome,testCase);return {observation:wrapLegacyOutcome(outcome),randomKnown:true};}
 catch(e){return {observation:{kind:'unobserved',attempted:true,reason:outcome.raw?.stateUnchanged===false||e.code==='PRE54_ERROR_STATE_UNPROVEN'?'INCOMPLETE_STATE':'OUTPUT_CONTRACT_UNSUPPORTED'},randomKnown:true};}
}
async function main(){
 loaderPolicy();const a=flags(process.argv.slice(2),['root','expected-producer','plan','run-dir']);const c=verifyProducer(a.root,a['expected-producer']);
 const lib=async p=>import(pathToFileURL(join(c.protocolRoot,'tools',p)));
 const {verifyBundle}=await lib('observation-v2/bundle.mjs'),{approvedDispatchPlan}=await lib('observation-v2/dispatch.mjs'),{validateRaw,RAW}=await lib('observation-v2/protocol.mjs'),{sealRequest,validateRawResponse}=await lib('lib/protocol.mjs'),{parseJson,strictStringify}=await lib('lib/json.mjs'),{sanitizePre54Outcome}=await lib('profiles/pre54-batch2.mjs');
 const ctx={...verifyBundle(c.protocolRoot,PROTOCOL_FREEZE),dispatchPlanId:a.plan},parent=ctx.kit.request,plan=approvedDispatchPlan(a.plan,parent),dir=resolve(a['run-dir']);
 const abort=new AbortController(),cancel=()=>abort.abort();process.on('SIGTERM',cancel);process.on('SIGINT',cancel);process.on('disconnect',cancel);
 const deadline=Date.now()+LIMITS.timeoutMs-500;let randomKnown=true;
 const raw={protocol:RAW,requestHash:parent.requestHash,observationFreezeHash:PROTOCOL_FREEZE,dispatch:{planId:a.plan,handledCaseIds:[]},random:{seed:null,drawCount:0,draws:[]},cases:parent.cases.map(x=>({caseId:x.caseId,requestHash:x.requestHash,observation:{kind:'unobserved',attempted:false,reason:'NOT_RUN'}}))};
 try{
  for(let i=0;i<plan.length;i++){
   need(!abort.signal.aborted,'CANDIDATE_CANCELLED');const remaining=deadline-Date.now();need(remaining>=100,'CANDIDATE_ENDPOINT_DEADLINE');
   const id=plan[i],testCase=parent.cases.find(x=>x.caseId===id),caseDir=join(dir,String(i+1).padStart(4,'0')+'-'+id);mkdirSync(caseDir);
   const sub=sealRequest({protocol:parent.protocol,selectionVersion:parent.selectionVersion,thresholdSource:parent.thresholdSource,capabilities:parent.capabilities,cases:[testCase]});
   const requestFile=join(caseDir,'request.json');writeFileSync(requestFile,strictStringify(sub,true)+'\n',{flag:'wx'});
   const argv=[process.execPath,join(c.root,'producer/worker.mjs'),'--root',c.root,'--expected-producer',c.producerFreezeHash,'--case',id,'--request',requestFile];
   const r=await boundedChild({argv,cwd:ctx.kit.root,signal:abort.signal,limits:{...LIMITS,timeoutMs:remaining},onSpawn:pid=>send({phase:'WORKER_STARTED',pid})});
   writeFileSync(join(caseDir,'stdout.bin'),r.stdout,{flag:'wx'});writeFileSync(join(caseDir,'stderr.bin'),r.stderr,{flag:'wx'});const {stdout,stderr,...receipt}=r;writeFileSync(join(caseDir,'receipt.json'),JSON.stringify({argv,derivedFromCaseHash:testCase.requestHash,childRequestHash:sub.requestHash,execution:receipt},null,2)+'\n',{flag:'wx'});
   if(r.cleanupVerified)send({phase:'WORKER_REAPED',pid:r.pid});
   const observed=observeChild(r,sub,testCase,{parseJson,validateRawResponse,sanitizePre54Outcome}),observation=observed.observation;randomKnown=randomKnown&&observed.randomKnown;
   raw.dispatch.handledCaseIds.push(id);raw.cases.find(x=>x.caseId===id).observation=observation;
   appendFileSync(join(dir,'observed-prefix.jsonl'),strictStringify({caseId:id,requestHash:testCase.requestHash,childRequestHash:sub.requestHash,observation})+'\n');
   if(observation.kind==='unobserved')break;
  }
  raw.random=randomKnown?{seed:null,drawCount:0,draws:[]}:null;validateRaw(raw,ctx);process.stdout.write(strictStringify(raw)+'\n');
 }finally{process.removeListener('SIGTERM',cancel);process.removeListener('SIGINT',cancel);process.removeListener('disconnect',cancel);if(process.connected)process.disconnect();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'CANDIDATE_COORDINATOR_ERROR');process.exitCode=1;if(process.connected)process.disconnect();});
