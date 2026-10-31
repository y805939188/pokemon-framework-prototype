// One unchanged legacy TS runner invocation; derived carrier contains one exact frozen case.
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyProducer,loaderPolicy,flags,readFile,need,PROTOCOL_FREEZE} from './identity.mjs';
const send=m=>new Promise((resolve,reject)=>process.send?process.send(m,e=>e?reject(e):resolve()):reject(Error('WORKER_IPC_REQUIRED')));
async function main(){
 loaderPolicy();const a=flags(process.argv.slice(2),['root','expected-producer','case','request']);const c=verifyProducer(a.root,a['expected-producer']);
 const {sealRequest}=await import(pathToFileURL(join(c.protocolRoot,'tools/lib/protocol.mjs')));const {parseJson,canonicalStringify}=await import(pathToFileURL(join(c.protocolRoot,'tools/lib/json.mjs')));
 // verifyProducer has checked every protocol byte against the immutable f100 freeze.
 // Do not revalidate all354 semantic cases inside each one-case worker.
 const kitRoot=join(c.protocolRoot,'legacy-kit'),parent=parseJson(readFile(join(kitRoot,'requests/wp30-r2.json')).toString('utf8')),testCase=parent.cases.find(x=>x.caseId===a.case);need(testCase,'WORKER_UNKNOWN_CASE');
 const expected=sealRequest({protocol:parent.protocol,selectionVersion:parent.selectionVersion,thresholdSource:parent.thresholdSource,capabilities:parent.capabilities,cases:[testCase]});
 const sub=parseJson(readFile(a.request).toString('utf8'));need(canonicalStringify(sub)===canonicalStringify(expected),'WORKER_DERIVED_REQUEST_MISMATCH');
 await send({phase:'LEGACY_ENTRY_START',caseId:testCase.caseId,childRequestHash:sub.requestHash});
 const original=Math.random;let randomCalls=0;Math.random=function(){randomCalls++;return Reflect.apply(original,Math,[]);};
 try{
  const runner=join(kitRoot,'runners/ts-runner.mjs');process.argv=[process.execPath,runner,'--request',a.request,'--core',join(kitRoot,'core/core.cjs')];
  await import(pathToFileURL(runner));
 }finally{Math.random=original;await send({phase:'LEGACY_ENTRY_FINISHED',caseId:testCase.caseId,childRequestHash:sub.requestHash,randomCalls});if(process.connected)process.disconnect();}
}
main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'CANDIDATE_WORKER_ERROR');process.exitCode=1;if(process.connected)process.disconnect();});
