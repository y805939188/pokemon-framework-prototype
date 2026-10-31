import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJson} from '../lib/json.mjs';
import {formalContext,publicFiles,byteHash} from './bundle.mjs';
import {gatePackage,gateAdmission,counts,requireV2,gateAdmissionMetadata} from './protocol.mjs';
export function receive(args,entryURL,name){
 requireV2(args.length===8&&args[0]==='--bundle'&&args[2]==='--expected-freeze'&&args[4]==='--public-root'&&args[6]==='--expected-audit','ARGUMENTS');
 const unboundContext=formalContext(args[1],args[3],entryURL,name);
 const b=publicFiles(args[5]);
 const ab=b['execution-audit.json'];requireV2(/^[0-9a-f]{64}$/.test(args[7])&&byteHash(ab)===args[7],'EXTERNAL_AUDIT_HASH');
 const a=gateAdmissionMetadata(parseJson(ab.toString('utf8')),unboundContext);
 const context={...unboundContext,dispatchPlanId:a.dispatchPlanId};
 // Pin public byte identities BEFORE parsing/consuming any behavior fields.
 requireV2(a.referencePackageSHA256===byteHash(b['reference-observations.json'])&&a.candidatePackageSHA256===byteHash(b['candidate-observations.json']),'AUDIT_PACKAGE_BYTES');
 const reference=parseJson(b['reference-observations.json'].toString('utf8')),candidate=parseJson(b['candidate-observations.json'].toString('utf8'));
 gatePackage(reference,{...context,role:'reference'});gatePackage(candidate,{...context,role:'candidate'});
 gateAdmission(a,{...context,referenceHash:byteHash(b['reference-observations.json']),candidateHash:byteHash(b['candidate-observations.json']),reference});
 return {context,reference,candidate,auditHash:args[7]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=receive(process.argv.slice(2),import.meta.url,'receive.mjs');console.log(JSON.stringify({status:'VALID_CLOSED_OBSERVATIONS',auditSHA256:r.auditHash,observationFreezeHash:r.context.freezeHash,dispatchPlanId:r.context.dispatchPlanId,totalCaseCount:354,counts:{reference:counts(r.reference),candidate:counts(r.candidate)},scope:'parent-pinned-A-metadata-not-independent-task-verification'}));}
 catch(e){console.log(JSON.stringify({status:'REJECTED_WHOLE_PACKAGE',code:/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'OBS2_RECEIVE_REJECTED'}));process.exitCode=2;}
}
