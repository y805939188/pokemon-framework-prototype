'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {createContinueHost}=require('./continue-host.cjs'),{makeContent}=require('./mz-slot-worker.cjs'),{sha}=require('./mz-slot-host.cjs');
const ROOT=path.resolve(__dirname,'../../..'),PLAN=require('./e-continue-contracts.json'),SOURCE=require('./e-mz-slot-contracts.json');
const hostRoot=process.env.PF_MZ_SLOT_HOST_ROOT,productRoot=process.env.PF_MZ_SLOT_PRODUCT_ROOT;
assert(hostRoot&&productRoot,'explicit installed host and accepted built product are required; no skip or fallback');
assert(Number(process.versions.node.split('.')[0])>22||(Number(process.versions.node.split('.')[0])===22&&Number(process.versions.node.split('.')[1])>=18),'Node >=22.18 required');
function child(file,args){const result=spawnSync(process.execPath,[path.join(__dirname,file),...args],{cwd:ROOT,encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024});assert.equal(result.error,undefined,result.error?.message);assert.equal(result.signal,null);assert.equal(result.status,0,result.stdout+result.stderr);const row=JSON.parse(result.stdout);assert.equal(row.pid,result.pid);assert.equal(row.ppid,process.pid);return row;}
function owned(id,run){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pf-e-mz-slot-'));return Promise.resolve().then(()=>run(folder)).finally(()=>fs.rmSync(folder,{recursive:true,force:true}));}
for(const c of PLAN.cases)test(c.id+' '+c.expect,()=>owned(c.id,folder=>{
 fs.writeFileSync(path.join(folder,'OWNED.json'),JSON.stringify({planVersion:SOURCE.version,caseId:c.sourceCase}));
 const producer=child('mz-slot-worker.cjs',['producer',c.sourceCase,folder,hostRoot,productRoot,path.join(__dirname,'e-mz-slot-contracts.json')]);
 if(c.corrupt)fs.writeFileSync(path.join(folder,'file1.rmmzsave'),'owned damaged ordinary slot');
 const bytes=fs.readFileSync(path.join(folder,'file1.rmmzsave'));
 const consumer=child('continue-worker.cjs',[c.id,folder,hostRoot,productRoot,path.join(__dirname,'e-continue-contracts.json')]);assert.notEqual(producer.pid,consumer.pid);assert.equal(consumer.id,c.id);assert.equal(consumer.slotBefore,sha(bytes));
 if(c.corrupt){assert(consumer.loadRejected);assert.equal(consumer.slotAfter,sha(bytes));assert.deepEqual(consumer.writes,[]);}
 else{assert.deepEqual(consumer.loaded,producer.final,'new process loaded the actual prior full framework document via Scene_Load');assert.equal(consumer.slotBefore,producer.slotAfter);assert.equal(consumer.loadedHash,producer.finalHash);assert.equal(consumer.installs,1);}
 console.log('E_CONTINUE_OBSERVATION '+JSON.stringify({id:c.id,folder,producer,consumer,NW:0}));
}));
test('ECONT04 no ordinary saved global entry disables the real Continue command',()=>owned('ECONT04',async folder=>{
 const h=createContinueHost(hostRoot,productRoot,folder,makeContent('consume'),PLAN.host);await h.readGlobal();const commands=h.commands();assert.deepEqual(commands.map(c=>[c.symbol,c.enabled]),[['newGame',true],['continue',false],['options',true]]);assert.equal(h.context.PSFlow.replacements,0);assert.equal(h.io.length,0);assert.equal(h.trace.filter(x=>x.kind==='push'||x.kind==='goto').length,0);assert.deepEqual(fs.readdirSync(folder),[]);
 console.log('E_CONTINUE_EMPTY_OBSERVATION '+JSON.stringify({id:'ECONT04',commands,trace:h.trace,NW:0}));
}));
