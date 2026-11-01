// Parent pins are independent inputs. Validate qualification/admission BEFORE observations or business code.
import path from 'node:path';
import fs from 'node:fs';
import {verifyFreeze} from './freeze.mjs';
import {file,readJSON,noLinks,newOutput,parse,sha,validate,need,canonical,nonzero,S,HASH,writeNew} from './safe.mjs';
import {DispatchSchema,ConfigSchema,gateQualification,BundleSchema,gateRecord} from './schema.mjs';
import {PROFILE,PRODUCT,REFERENCE,RELEASE,CASES,SMOKE,O,A} from './constants.mjs';
export function admit({dispatchPath,dispatchSHA256,configPath,configSHA256,qualificationPath=null,qualificationSHA256=null,freezeSHA256,fixtureSHA256,producerSHA256}){
 for(const x of [dispatchSHA256,configSHA256,freezeSHA256,fixtureSHA256,producerSHA256])need(nonzero(x),'ADMISSION_NONZERO_EXTERNAL_PIN');
 const db=file(dispatchPath,1048576),cb=file(configPath,1048576);need(sha(db)===dispatchSHA256&&sha(cb)===configSHA256,'PARENT_FILE_HASH');
 const d=parse(db.toString('utf8')),c=parse(cb.toString('utf8'));validate(d,DispatchSchema);validate(c,ConfigSchema);
 need(d.authorized===true,'PARENT_NOT_AUTHORIZED');
 for(const k of ['profile','mode','runId','freezeSHA256','fixtureSHA256','producerSHA256','qualificationSHA256','cases'])need(canonical(d[k])===canonical(c[k]),'PARENT_CONFIG_BINDING');
 need(c.dispatchSHA256===dispatchSHA256,'CONFIG_DISPATCH_PIN');
 need(d.freezeSHA256===freezeSHA256&&d.fixtureSHA256===fixtureSHA256&&d.producerSHA256===producerSHA256,'ACTUAL_ARTIFACT_PIN');
 need(canonical(d.cases)===canonical(d.mode==='formal'?CASES:SMOKE),'CASE_SELECTION');
 need(d.runId===(d.mode==='formal'?'formal-0001':'qualification-0001'),'RUN_MODE');
 let q=null;
 if(d.mode==='formal'){
  need(qualificationPath&&nonzero(qualificationSHA256)&&d.qualificationSHA256===qualificationSHA256,'NEW_QUALIFICATION_REQUIRED');
  const qb=file(qualificationPath,1048576);need(sha(qb)===qualificationSHA256,'QUALIFICATION_FILE_HASH');q=parse(qb.toString('utf8'));gateQualification(q);
  for(const k of ['freezeSHA256','fixtureSHA256','producerSHA256'])need(q[k]===d[k],'QUALIFICATION_ARTIFACT_BINDING');
 }else need(d.qualificationSHA256===null&&qualificationSHA256===null&&qualificationPath===null,'QUALIFICATION_MODE_BINDING');
 return {status:'ADMITTED_ZERO_BUSINESS',mode:d.mode,cases:[...d.cases],runId:d.runId,businessCalls:0,dispatch:d,config:c,qualification:q};
}
export function makeParentFiles(dir,{freezeSHA256,fixtureSHA256,producerSHA256,mode='qualification',qualificationSHA256=null,authorized=false}){
 const d={schema:'capture-parent-dispatch-v1',profile:PROFILE,runId:mode==='formal'?'formal-0001':'qualification-0001',mode,authorized,freezeSHA256,fixtureSHA256,producerSHA256,qualificationSHA256,cases:mode==='formal'?[...CASES]:[...SMOKE],product:PRODUCT,reference:REFERENCE,release:RELEASE,observerTask:O,auditorTask:A};
 validate(d,DispatchSchema);const dp=path.join(dir,'dispatch.json');writeNew(dp,d);const dh=sha(file(dp));
 const c={schema:'capture-run-config-v1',profile:PROFILE,mode,runId:d.runId,dispatchSHA256:dh,qualificationSHA256,freezeSHA256,fixtureSHA256,producerSHA256,cases:d.cases};
 validate(c,ConfigSchema);const cp=path.join(dir,'config.json');writeNew(cp,c);return {dispatchPath:dp,dispatchSHA256:dh,configPath:cp,configSHA256:sha(file(cp)),qualificationSHA256,freezeSHA256,fixtureSHA256,producerSHA256};
}
export const AuditSchema=S.obj({schema:{const:'capture-execution-audit-v1'},profile:{const:PROFILE},status:{const:'PASS_SCOPED'},reason:{const:'NONE'},observerTask:{const:O},auditorTask:{const:A},runId:S.en('qualification-0001','formal-0001'),freezeSHA256:HASH,fixtureSHA256:HASH,producerSHA256:HASH,dispatchSHA256:HASH,qualificationSHA256:S.nullable(HASH),referenceSHA256:HASH,candidateSHA256:HASH,sourceManifestSHA256:HASH,privateAuditSHA256:HASH,referenceImplementationSHA256:HASH,referenceQualificationAuditSHA256:HASH,toolReviewSHA256:HASH,candidateReviewSHA256:HASH,referenceCalls:S.int(0,9),candidateCalls:S.int(0,9),referenceTerminalRecords:S.int(0,9),candidateTerminalRecords:S.int(0,9),checks:S.obj(Object.fromEntries(['sameQualifiedCore','sameQualifiedClosure','actualLoadedFiles','initialState','realCalls','nativeReturnBoundaries','noBusinessStub','allChangesDisclosed','rngCovered','allOwnedProcessesReaped','referenceSealedBeforeCandidate','projectionVerified'].map(k=>[k,{const:true}]))) });
export function receive({parent,frozenRoot,referencePath,candidatePath,auditPath,auditSHA256}){
 const admitted=admit(parent);need(typeof frozenRoot==='string','FREEZE_ROOT_REQUIRED');const fm=verifyFreeze(frozenRoot,parent.freezeSHA256);need(fm.fixtureSHA256===parent.fixtureSHA256&&fm.producerSHA256===parent.producerSHA256,'INTAKE_ARTIFACT');const expectedInitials=new Map(readJSON(path.join(frozenRoot,'inputs.json')).cases.map(f=>[f.definition.id,f.initialProjection]));need(nonzero(auditSHA256),'AUDIT_EXTERNAL_PIN');const publicRoot=noLinks(path.dirname(path.resolve(auditPath)));need(path.basename(publicRoot)==='public-capture-workflow-v1-0001'&&[referencePath,candidatePath,auditPath].every(p=>path.dirname(path.resolve(p))===publicRoot),'PUBLIC_ROOT');need(path.basename(auditPath)==='execution-audit.json'&&fs.readdirSync(publicRoot).sort().join(',')==='candidate-observations.json,execution-audit.json,reference-observations.json','PUBLIC_FILE_SET');const ab=file(auditPath,1048576);need(sha(ab)===auditSHA256,'AUDIT_FILE_HASH');const a=parse(ab.toString('utf8'));validate(a,AuditSchema);
 for(const k of ['freezeSHA256','fixtureSHA256','producerSHA256','dispatchSHA256','qualificationSHA256'])need(a[k]===admitted.config[k],'AUDIT_BINDING');need(a.runId===admitted.runId,'AUDIT_RUN');
 if(admitted.qualification){const q=admitted.qualification;need(a.referenceImplementationSHA256===q.referenceImplementationSHA256&&a.referenceQualificationAuditSHA256===q.referenceAuditSHA256&&a.toolReviewSHA256===q.toolReviewSHA256&&a.candidateReviewSHA256===q.candidateReviewSHA256,'AUDIT_QUALIFIED_SOURCE_BINDING');}
 for(const k of ['referenceSHA256','candidateSHA256','sourceManifestSHA256','privateAuditSHA256','referenceImplementationSHA256','referenceQualificationAuditSHA256','toolReviewSHA256','candidateReviewSHA256'])need(nonzero(a[k]),'AUDIT_ZERO_PIN');
 // Only these two approved behavior files are read after the closed, externally pinned audit was accepted.
 const results={};for(const [role,p]of [['reference',referencePath],['candidate',candidatePath]]){
  need(path.basename(p)===`${role}-observations.json`,'OBSERVATION_FILENAME');const b=file(p);need(sha(b)===a[`${role}SHA256`],'OBSERVATION_HASH');const v=parse(b.toString('utf8'));validate(v,BundleSchema);
  for(const k of ['freezeSHA256','fixtureSHA256','producerSHA256','dispatchSHA256'])need(v[k]===admitted.config[k],'OBSERVATION_BINDING');need(v.role===role&&v.runId===admitted.runId,'OBSERVATION_ROLE_RUN');
  need(v.records.length===a[`${role}TerminalRecords`]&&a[`${role}Calls`]>=v.records.length&&a[`${role}Calls`]<=admitted.cases.length,'AUDIT_COUNTS');
  v.records.forEach((r,i)=>{need(r.caseId===admitted.cases[i]&&r.integrity.role===role,'OBSERVATION_CASE_ORDER');gateRecord(r);need(canonical(r.initial)===canonical(expectedInitials.get(r.caseId)),'OBSERVATION_INITIAL_MISMATCH');});
  if(v.stop)need(v.records.length<admitted.cases.length&&v.stop.caseId===admitted.cases[v.records.length],'STOP_DISPATCH_ORDER');else need(v.records.length===admitted.cases.length,'MISSING_STOP');results[role]=v;
 }
 return {status:'VALID_CLOSED_CAPTURE_OBSERVATIONS',audit:a,...results};
}

/** Final controls are written once, then preflight reads these exact bytes. HOLD never supplies fake future Q pins. */
export function prepareControls({root,pin,mode,out,authorized=false,qualificationPath=null,qualificationSHA256=null}){
 const m=verifyFreeze(root,pin);need(['qualification','formal'].includes(mode),'CONTROL_MODE');
 if(authorized&&mode==='formal'){
  need(qualificationPath&&nonzero(qualificationSHA256),'NEW_QUALIFICATION_REQUIRED');const b=file(qualificationPath);need(sha(b)===qualificationSHA256,'QUALIFICATION_FILE_HASH');const q=parse(b.toString('utf8'));gateQualification(q);need(q.freezeSHA256===pin&&q.fixtureSHA256===m.fixtureSHA256&&q.producerSHA256===m.producerSHA256,'QUALIFICATION_ARTIFACT_BINDING');
 }
 if(mode==='qualification')need(qualificationPath===null&&qualificationSHA256===null,'QUALIFICATION_MODE_BINDING');
 out=newOutput(root,out);fs.mkdirSync(out);const pins=makeParentFiles(out,{freezeSHA256:pin,fixtureSHA256:m.fixtureSHA256,producerSHA256:m.producerSHA256,mode,qualificationSHA256,authorized});pins.qualificationPath=qualificationPath;
 const pinsPath=path.join(out,'parent-pins.json');writeNew(pinsPath,pins);
 let status='HOLD_NO_AUTHORIZED_DISPATCH';if(authorized)status=admit(pins).status;
 return {status,businessCalls:0,pinsPath,pinsSHA256:sha(file(pinsPath)),dispatchSHA256:pins.dispatchSHA256,configSHA256:pins.configSHA256,qualificationSHA256};
}
