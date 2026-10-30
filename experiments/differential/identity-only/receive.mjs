#!/usr/bin/env node
// Fixed identity metadata only. No Ruby, process launch, source export or readiness acceptance.
import {constants,closeSync,fstatSync,lstatSync,openSync,readSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseJson} from '../lib/json.mjs';
import {validateSchema} from '../lib/schema.mjs';

export const FILE_NAME='reference-object-identity.json';
const HERE=dirname(fileURLToPath(import.meta.url));
const LIMIT=16384;
const codes=new Set(['IDENTITY_ARGUMENTS_REJECTED','IDENTITY_NODE_POLICY_REJECTED','IDENTITY_SCHEMA_PIN_REJECTED','IDENTITY_SCHEMA_REJECTED','IDENTITY_JSON_REJECTED','IDENTITY_UTF8_REJECTED','IDENTITY_ROOT_REJECTED','IDENTITY_FILE_REJECTED','IDENTITY_FILE_CHANGED','IDENTITY_FACTS_INCONSISTENT','IDENTITY_OBSERVATION_INCOMPLETE','IDENTITY_STATUS_CODE_MISMATCH']);
const fail=code=>{throw Object.assign(new Error(code),{identityCode:code});};
const need=(value,code)=>{if(!value)fail(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash64=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)&&value!=='0'.repeat(64);

// A single bounded regular-file snapshot. Never follow links or expose parse diagnostics.
function snapshot(path,missingOK=false){
 let before;try{before=lstatSync(path);}catch(e){if(missingOK&&e.code==='ENOENT')return null;throw e;}
 need(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size<=LIMIT&&realpathSync(path)===path,'IDENTITY_FILE_REJECTED');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{
  const first=fstatSync(fd);
  need(first.dev===before.dev&&first.ino===before.ino&&first.size===before.size&&first.nlink===1,'IDENTITY_FILE_CHANGED');
  const buffer=Buffer.alloc(LIMIT+1),n=readSync(fd,buffer,0,buffer.length,0);bytes=buffer.subarray(0,n);
  const after=fstatSync(fd),named=lstatSync(path);
  need(n===before.size&&n<=LIMIT&&after.size===first.size&&after.mtimeMs===first.mtimeMs&&after.nlink===1&&named.dev===first.dev&&named.ino===first.ino&&named.nlink===1&&!named.isSymbolicLink()&&realpathSync(path)===path,'IDENTITY_FILE_CHANGED');
 }finally{closeSync(fd);}
 const text=bytes.toString('utf8');need(Buffer.from(text,'utf8').equals(bytes),'IDENTITY_UTF8_REJECTED');
 let value;try{value=parseJson(text);}catch{fail('IDENTITY_JSON_REJECTED');}
 return {value,sha256:hash(bytes)};
}

export function validateFacts(value,schema){
 need(validateSchema(schema,value).valid,'IDENTITY_SCHEMA_REJECTED');
 const {target,tag,headCommitSHA}=value.facts;
 function check(object,isTagRef){
  if(object.exists===null)need(object.objectType==='unknown'&&object.peeledCommitSHA===null&&(!isTagRef||object.objectSHA===null),'IDENTITY_FACTS_INCONSISTENT');
  else if(object.exists===false)need(object.objectType==='missing'&&object.peeledCommitSHA===null&&(!isTagRef||object.objectSHA===null),'IDENTITY_FACTS_INCONSISTENT');
  else{
   need(['commit','tag','tree','blob'].includes(object.objectType)&&(!isTagRef||object.objectSHA!==null),'IDENTITY_FACTS_INCONSISTENT');
   const objectSHA=isTagRef?object.objectSHA:value.targetObjectSHA;
   if(object.objectType==='commit')need(object.peeledCommitSHA===objectSHA,'IDENTITY_FACTS_INCONSISTENT');
   if(object.objectType==='tree'||object.objectType==='blob')need(object.peeledCommitSHA===null,'IDENTITY_FACTS_INCONSISTENT');
   if(object.objectType==='tag')need(object.peeledCommitSHA!==objectSHA,'IDENTITY_FACTS_INCONSISTENT');
  }
 }
 check(target,false);check(tag,true);
 // The same Git object ID cannot simultaneously denote two different object types.
 const types=new Map();
 function known(sha,type){if(sha===null)return;need(!types.has(sha)||types.get(sha)===type,'IDENTITY_FACTS_INCONSISTENT');types.set(sha,type);}
 if(target.exists===true)known(value.targetObjectSHA,target.objectType);
 if(tag.exists===true)known(tag.objectSHA,tag.objectType);
 known(target.peeledCommitSHA,'commit');known(tag.peeledCommitSHA,'commit');known(headCommitSHA,'commit');
 if(target.exists===false)need(!types.has(value.targetObjectSHA),'IDENTITY_FACTS_INCONSISTENT');
 // Repeated descriptions of one object must agree whenever both peels are known.
 const peels=new Map();
 for(const [sha,object]of [[value.targetObjectSHA,target],[tag.objectSHA,tag]]){
  if(object.exists!==true||object.peeledCommitSHA===null)continue;
  need(!peels.has(sha)||peels.get(sha)===object.peeledCommitSHA,'IDENTITY_FACTS_INCONSISTENT');
  peels.set(sha,object.peeledCommitSHA);
 }
 if(value.status==='OBSERVED'){
  need(value.code==='NONE','IDENTITY_STATUS_CODE_MISMATCH');
  need(target.exists!==null&&tag.exists!==null&&headCommitSHA!==null&&(![target,tag].some(x=>x.objectType==='tag'&&x.peeledCommitSHA===null)),'IDENTITY_OBSERVATION_INCOMPLETE');
 }else need(value.code!=='NONE','IDENTITY_STATUS_CODE_MISMATCH');
 return value;
}

const eq=(a,b)=>a===null||b===null?null:a===b;
export function summarize(value,artifactSHA256){
 const {target,tag,headCommitSHA}=value.facts;
 return {metadataGate:'VALID_IDENTITY_ONLY_METADATA',scope:'IDENTITY_DIAGNOSTIC_ONLY',status:value.status,code:value.code,artifactSHA256,
  protocol:value.protocol,observerRunId:value.observerRunId,candidateSHA:value.candidateSHA,freezeHash:value.freezeHash,requestHash:value.requestHash,targetObjectSHA:value.targetObjectSHA,targetTag:value.targetTag,
  facts:value.facts,relations:{targetEqualsTagObject:target.exists===true?eq(value.targetObjectSHA,tag.objectSHA):null,targetEqualsTagPeeledCommit:target.exists===true?eq(value.targetObjectSHA,tag.peeledCommitSHA):null,targetPeelsToTagCommit:eq(target.peeledCommitSHA,tag.peeledCommitSHA),headEqualsTargetPeeledCommit:eq(headCommitSHA,target.peeledCommitSHA)},
  sourceQualificationAccepted:false,referenceTargetChanged:false,readinessGateChanged:false,realRubyExecutionAccepted:false};
}

export function receiveIdentity({publicRoot,expectedSchemaSHA256}){
 need(hash64(expectedSchemaSHA256),'IDENTITY_SCHEMA_PIN_REJECTED');
 const schema=snapshot(join(HERE,'identity.schema.json'));
 need(schema.sha256===expectedSchemaSHA256,'IDENTITY_SCHEMA_PIN_REJECTED');
 const root=resolve(publicRoot);let directory;
 try{directory=lstatSync(root);}catch(e){if(e.code==='ENOENT')return {metadataGate:'NOT_YET_PUBLISHED',scope:'IDENTITY_DIAGNOSTIC_ONLY',sourceQualificationAccepted:false};throw e;}
 need(directory.isDirectory()&&!directory.isSymbolicLink()&&realpathSync(root)===root,'IDENTITY_ROOT_REJECTED');
 const data=snapshot(join(root,FILE_NAME),true);
 if(!data)return {metadataGate:'NOT_YET_PUBLISHED',scope:'IDENTITY_DIAGNOSTIC_ONLY',sourceQualificationAccepted:false};
 return summarize(validateFacts(data.value,schema.value),data.sha256);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  need(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&process.execArgv.length===0,'IDENTITY_NODE_POLICY_REJECTED');
  const a=process.argv.slice(2);need(a.length===4&&a[0]==='--public-root'&&a[2]==='--expected-schema','IDENTITY_ARGUMENTS_REJECTED');
  const result=receiveIdentity({publicRoot:a[1],expectedSchemaSHA256:a[3]});console.log(JSON.stringify(result));process.exitCode=result.metadataGate==='NOT_YET_PUBLISHED'?3:0;
 }catch(error){console.log(JSON.stringify({metadataGate:'REJECTED_WHOLE_IDENTITY',code:codes.has(error?.identityCode)?error.identityCode:'IDENTITY_LOCAL_ERROR',sourceQualificationAccepted:false}));process.exitCode=2;}
}
