// Every fact below is synthetic infrastructure data, never a real reference observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,symlinkSync,linkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {FILE_NAME,receiveIdentity} from './receive.mjs';

const here=dirname(fileURLToPath(import.meta.url)),entry=join(here,'receive.mjs');
const schemaSHA=createHash('sha256').update(readFileSync(join(here,'identity.schema.json'))).digest('hex');
const root=process.env.IDENTITY_TEST_ARTIFACTS||mkdtempSync(join(tmpdir(),'pre54-identity-only-'));
mkdirSync(root,{recursive:true});
const target='8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b';
const fake=s=>createHash('sha1').update('INFRASTRUCTURE-SELF-TEST:'+s).digest('hex');
function value(){return {protocol:'pre54-reference-object-identity-v1',observerRunId:'pre54-8c-observer-20261030',candidateSHA:'8c9951c16cad74a595dfd30ac63aa307a5d13eae',freezeHash:'ebda61d9abdbc43cb7d3b27857b9b9a0deb5da6877068db105959b41c151555d',requestHash:'19c09762f7166fef2a7b540c159ded9bd76cbde25903c44a5c3171338a90c133',targetObjectSHA:target,targetTag:'v21.1',status:'OBSERVED',code:'NONE',facts:{target:{exists:true,objectType:'commit',peeledCommitSHA:target},tag:{exists:true,objectType:'tag',objectSHA:fake('tag-object'),peeledCommitSHA:fake('older-tag-commit')},headCommitSHA:fake('older-tag-commit')},rubyExecuted:false};}
let sequence=0;
function fixture(){const p=join(root,String(++sequence).padStart(3,'0'));mkdirSync(p);const file=join(p,FILE_NAME);writeFileSync(file,JSON.stringify(value(),null,2)+'\n');return {p,file};}
function inspect(p,pin=schemaSHA){return receiveIdentity({publicRoot:p,expectedSchemaSHA256:pin});}
function cli(p,{extra=[],env={},pin=schemaSHA}={}){
 const r=spawnSync(process.execPath,[...extra,entry,'--public-root',p,'--expected-schema',pin],{encoding:'utf8',env:{...process.env,...env},timeout:10000,maxBuffer:65536});
 assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.stderr,'');
 const v=JSON.parse(r.stdout);writeFileSync(join(root,'cli-'+String(++sequence).padStart(3,'0')+'.json'),JSON.stringify({scope:'INFRASTRUCTURE-SELF-TEST_NOT_OBSERVATION',exit:r.status,output:v},null,2)+'\n');return {r,v};
}
function modify(f,fn){const v=value();fn(v);writeFileSync(f.file,JSON.stringify(v)+'\n');}
function rejected(name,fn,code='IDENTITY_SCHEMA_REJECTED'){
 test(name,()=>{const f=fixture();assert.equal(inspect(f.p).metadataGate,'VALID_IDENTITY_ONLY_METADATA');modify(f,fn);const {r,v}=cli(f.p);assert.equal(r.status,2);assert.deepEqual(v,{metadataGate:'REJECTED_WHOLE_IDENTITY',code,sourceQualificationAccepted:false});assert.equal(r.stdout.includes('SYNTHETIC_PRIVATE_TOKEN'),false);});
}

test('synthetic fixed commit can differ from both tag and working HEAD without rejection',()=>{
 const f=fixture(),{r,v}=cli(f.p);assert.equal(r.status,0);assert.equal(v.relations.targetPeelsToTagCommit,false);assert.equal(v.relations.headEqualsTargetPeeledCommit,false);assert.equal(v.sourceQualificationAccepted,false);assert.equal(v.referenceTargetChanged,false);assert.equal(v.readinessGateChanged,false);assert.equal(v.realRubyExecutionAccepted,false);
});
test('synthetic annotated target and tag can identify the same tag object and peeled commit',()=>{
 const f=fixture();modify(f,v=>{v.facts.target={exists:true,objectType:'tag',peeledCommitSHA:fake('peeled')};v.facts.tag={exists:true,objectType:'tag',objectSHA:target,peeledCommitSHA:fake('peeled')};v.facts.headCommitSHA=fake('peeled');});const v=inspect(f.p);assert.equal(v.relations.targetEqualsTagObject,true);assert.equal(v.relations.targetEqualsTagPeeledCommit,false);assert.equal(v.relations.targetPeelsToTagCommit,true);assert.equal(v.sourceQualificationAccepted,false);
});
test('synthetic lightweight tag can point directly to the fixed commit',()=>{
 const f=fixture();modify(f,v=>{v.facts.tag={exists:true,objectType:'commit',objectSHA:target,peeledCommitSHA:target};});const v=inspect(f.p);assert.equal(v.relations.targetEqualsTagObject,true);assert.equal(v.relations.targetEqualsTagPeeledCommit,true);
});
test('known missing target is a receivable identity fact, never qualified source',()=>{
 const f=fixture();modify(f,v=>{v.facts.target={exists:false,objectType:'missing',peeledCommitSHA:null};});const v=inspect(f.p);assert.equal(v.facts.target.exists,false);assert.equal(v.relations.targetPeelsToTagCommit,null);assert.equal(v.sourceQualificationAccepted,false);
});
test('missing tag does not prevent receiving facts about a distinct existing fixed commit',()=>{
 const f=fixture();modify(f,v=>{v.facts.tag={exists:false,objectType:'missing',objectSHA:null,peeledCommitSHA:null};});const v=inspect(f.p);assert.equal(v.facts.target.peeledCommitSHA,target);assert.equal(v.relations.targetEqualsTagObject,null);
});
for(const type of ['tree','blob'])test('non-commit '+type+' is diagnostic data and no source pass',()=>{
 const f=fixture();modify(f,v=>{v.facts.target={exists:true,objectType:type,peeledCommitSHA:null};});assert.equal(inspect(f.p).sourceQualificationAccepted,false);
});
test('blocked unknown facts preserve nulls instead of inventing observed hashes',()=>{
 const f=fixture();modify(f,v=>{v.status='BLOCKED';v.code='TOOL_DENIED';v.facts={target:{exists:null,objectType:'unknown',peeledCommitSHA:null},tag:{exists:null,objectType:'unknown',objectSHA:null,peeledCommitSHA:null},headCommitSHA:null};});const v=inspect(f.p);assert.equal(v.status,'BLOCKED');assert.equal(v.relations.targetPeelsToTagCommit,null);
});
test('blocked partial tag query may preserve a genuinely unknown peel',()=>{
 const f=fixture();modify(f,v=>{v.status='BLOCKED';v.code='OBJECT_QUERY_FAILED';v.facts.tag.peeledCommitSHA=null;});assert.equal(inspect(f.p).facts.tag.peeledCommitSHA,null);
});
for(const status of ['OBSERVED','BLOCKED']){
 test('same tag object rejects two known different peels even when '+status,()=>{
  const f=fixture();assert.equal(inspect(f.p).metadataGate,'VALID_IDENTITY_ONLY_METADATA');
  modify(f,v=>{v.status=status;v.code=status==='BLOCKED'?'OBJECT_QUERY_FAILED':'NONE';v.facts.target={exists:true,objectType:'tag',peeledCommitSHA:fake('target-peel')};v.facts.tag={exists:true,objectType:'tag',objectSHA:target,peeledCommitSHA:fake('other-peel')};v.facts.headCommitSHA=fake('other-peel');});
  const {r,v}=cli(f.p);assert.equal(r.status,2);assert.equal(v.code,'IDENTITY_FACTS_INCONSISTENT');assert.equal(v.sourceQualificationAccepted,false);
 });
 test('same tag object accepts the same known peel when '+status,()=>{
  const f=fixture();modify(f,v=>{v.status=status;v.code=status==='BLOCKED'?'OBJECT_QUERY_FAILED':'NONE';v.facts.target={exists:true,objectType:'tag',peeledCommitSHA:fake('same-peel')};v.facts.tag={exists:true,objectType:'tag',objectSHA:target,peeledCommitSHA:fake('same-peel')};v.facts.headCommitSHA=fake('same-peel');});
  const {r,v}=cli(f.p);assert.equal(r.status,0);assert.equal(v.relations.targetEqualsTagObject,true);assert.equal(v.relations.targetPeelsToTagCommit,true);assert.equal(v.sourceQualificationAccepted,false);
 });
}
test('different tag objects may have different known peels',()=>{
 const f=fixture();modify(f,v=>{v.facts.target={exists:true,objectType:'tag',peeledCommitSHA:fake('target-peel')};v.facts.tag={exists:true,objectType:'tag',objectSHA:fake('other-tag'),peeledCommitSHA:fake('other-peel')};v.facts.headCommitSHA=fake('other-peel');});
 const {r,v}=cli(f.p);assert.equal(r.status,0);assert.equal(v.relations.targetEqualsTagObject,false);assert.equal(v.relations.targetPeelsToTagCommit,false);
});
for(const unknown of ['target','tag'])test('same tag object retains one unknown '+unknown+' peel when blocked',()=>{
 const f=fixture();modify(f,v=>{v.status='BLOCKED';v.code='OBJECT_QUERY_FAILED';v.facts.target={exists:true,objectType:'tag',peeledCommitSHA:fake('known-peel')};v.facts.tag={exists:true,objectType:'tag',objectSHA:target,peeledCommitSHA:fake('known-peel')};v.facts[unknown].peeledCommitSHA=null;v.facts.headCommitSHA=fake('known-peel');});
 const {r,v}=cli(f.p);assert.equal(r.status,0);assert.equal(v.facts[unknown].peeledCommitSHA,null);assert.equal(v.relations.targetPeelsToTagCommit,null);assert.equal(v.sourceQualificationAccepted,false);
});
for(const field of ['privateSource','path','raw','reason','sourceQualificationAccepted'])rejected('closed top-level rejects '+field,v=>{v[field]='SYNTHETIC_PRIVATE_TOKEN';});
rejected('closed nested facts reject path',v=>{v.facts.tag.path='SYNTHETIC_PRIVATE_TOKEN';});
rejected('free text cannot be a reason code',v=>{v.code='SYNTHETIC_PRIVATE_TOKEN';});
rejected('invalid object enum is rejected',v=>{v.facts.target.objectType='SYNTHETIC_PRIVATE_TOKEN';});
for(const bad of ['0'.repeat(40),'a'.repeat(39),'g'.repeat(40),'A'.repeat(40),'SYNTHETIC_PRIVATE_TOKEN'])rejected('invalid hash '+bad.slice(0,8),v=>{v.facts.headCommitSHA=bad;});
rejected('frozen target cannot be replaced',v=>{v.targetObjectSHA=fake('new-target');});
rejected('business candidate cannot be replaced with control commit',v=>{v.candidateSHA='a1f3ecd67a5a25886a58667b8081ef703b51d689';});
rejected('wrong batch freeze is rejected',v=>{v.freezeHash='f'.repeat(64);});
rejected('Ruby execution cannot be attested by an identity-only packet',v=>{v.rubyExecuted=true;});
rejected('existing target cannot have missing type',v=>{v.facts.target.objectType='missing';},'IDENTITY_FACTS_INCONSISTENT');
rejected('missing target cannot retain a commit hash',v=>{v.facts.target.exists=false;},'IDENTITY_FACTS_INCONSISTENT');
rejected('commit peel must be that exact commit',v=>{v.facts.target.peeledCommitSHA=fake('other-commit');},'IDENTITY_FACTS_INCONSISTENT');
rejected('same object cannot be both tag and commit',v=>{v.facts.tag.objectSHA=target;},'IDENTITY_FACTS_INCONSISTENT');
rejected('tag object cannot peel to its own object id',v=>{v.facts.tag.peeledCommitSHA=v.facts.tag.objectSHA;},'IDENTITY_FACTS_INCONSISTENT');
rejected('target missing contradicts HEAD being that commit',v=>{v.facts.target={exists:false,objectType:'missing',peeledCommitSHA:null};v.facts.headCommitSHA=target;},'IDENTITY_FACTS_INCONSISTENT');
rejected('missing tag must not retain an object SHA',v=>{v.facts.tag.exists=false;},'IDENTITY_FACTS_INCONSISTENT');
rejected('observed status must not conceal unknown target query',v=>{v.facts.target={exists:null,objectType:'unknown',peeledCommitSHA:null};},'IDENTITY_OBSERVATION_INCOMPLETE');
rejected('observed status must not conceal unqueried tag peel',v=>{v.facts.tag.peeledCommitSHA=null;},'IDENTITY_OBSERVATION_INCOMPLETE');
rejected('blocked status requires a closed non-NONE code',v=>{v.status='BLOCKED';},'IDENTITY_STATUS_CODE_MISMATCH');
rejected('observed status cannot carry an error code',v=>{v.code='OBJECT_QUERY_FAILED';},'IDENTITY_STATUS_CODE_MISMATCH');
test('duplicate JSON keys fail without raw diagnostics',()=>{const f=fixture();writeFileSync(f.file,'{"protocol":"SYNTHETIC_PRIVATE_TOKEN","protocol":"again"}');const {r,v}=cli(f.p);assert.equal(r.status,2);assert.equal(v.code,'IDENTITY_JSON_REJECTED');assert.equal(r.stdout.includes('SYNTHETIC_PRIVATE_TOKEN'),false);});
test('non-UTF8 input rejects without echoing bytes',()=>{const f=fixture();writeFileSync(f.file,Buffer.from([0xff,0xfe]));assert.equal(cli(f.p).v.code,'IDENTITY_UTF8_REJECTED');});
test('oversized input rejects before parsing',()=>{const f=fixture();writeFileSync(f.file,' '.repeat(16385));assert.equal(cli(f.p).v.code,'IDENTITY_FILE_REJECTED');});
test('symlink public file rejects',()=>{const f=fixture(),other=join(f.p,'other');writeFileSync(other,readFileSync(f.file));unlinkSync(f.file);symlinkSync(other,f.file);assert.equal(cli(f.p).v.code,'IDENTITY_FILE_REJECTED');});
test('hardlink public file rejects',()=>{const f=fixture();linkSync(f.file,join(f.p,'other'));assert.equal(cli(f.p).v.code,'IDENTITY_FILE_REJECTED');});
test('symlink root rejects',()=>{const f=fixture(),alias=join(root,'root-alias');symlinkSync(f.p,alias);assert.equal(cli(alias).v.code,'IDENTITY_ROOT_REJECTED');});
test('external schema pin is mandatory and cannot be self-chosen from a response',()=>{const f=fixture();assert.equal(cli(f.p,{pin:'f'.repeat(64)}).v.code,'IDENTITY_SCHEMA_PIN_REJECTED');});
test('missing publication is NOT_YET_PUBLISHED exit3, not observed facts',()=>{const p=join(root,'absent');const {r,v}=cli(p);assert.equal(r.status,3);assert.deepEqual(v,{metadataGate:'NOT_YET_PUBLISHED',scope:'IDENTITY_DIAGNOSTIC_ONLY',sourceQualificationAccepted:false});});
for(const [name,opts]of [['NODE_PATH',{env:{NODE_PATH:'SYNTHETIC_PRIVATE_TOKEN'}}],['execArgv',{extra:['--no-warnings']}],['NODE_OPTIONS',{env:{NODE_OPTIONS:'--no-warnings'}}]])test('bare Node rejects '+name,()=>{const f=fixture(),{r,v}=cli(f.p,opts);assert.equal(r.status,2);assert.equal(v.code,'IDENTITY_NODE_POLICY_REJECTED');assert.equal(r.stdout.includes('SYNTHETIC_PRIVATE_TOKEN'),false);});
