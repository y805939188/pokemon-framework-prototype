'use strict';
// Finite current-kernel audit only. No random stream, statistical sampling, or old runner execution.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const opts={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];assert(['--out','--old-prepared','--old-results'].includes(key)&&!opts[key]&&process.argv[i+1]);opts[key]=process.argv[i+1];}
for(const key of ['--out','--old-prepared','--old-results'])assert(path.isAbsolute(opts[key]),key+' must be absolute');
const out=opts['--out'];fs.mkdirSync(out);const write=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const git=(...args)=>cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
const identity=()=>({head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),src:git('rev-parse','HEAD:src'),dirty:git('status','--porcelain')});
const before=identity();write('ATTEMPT.json',{argv:process.argv,identity:before,statisticalSamples:0});
try{
 assert.equal(process.version,'v22.21.1');assert.equal(before.dirty,'');const H=require('../../../scripts/headless-regression-binding.cjs'),captured=H.capture(ROOT,process.env.PF_HEADLESS_REGRESSION_BINDING);
 assert.equal(captured.binding.source.head,before.head);const prepared=JSON.parse(fs.readFileSync(opts['--old-prepared'],'utf8'));
 const protectedFiles=[{path:opts['--old-prepared'],sha256:hash(opts['--old-prepared'])}];
 const source=prepared.harness.find(row=>row.path.endsWith('/p5-product-fixture.cjs'));assert(source);for(const row of prepared.harness){assert.equal(hash(row.path),row.sha256);protectedFiles.push(row);}
 const old=require(source.path),engine=require(path.join(ROOT,'js/engine/build/production.cjs'));
 const P={...engine.encounterTrigger,...engine.encounterSelection,...engine.wildGeneration,...engine.contentCompile,...engine.contentRuntime,...engine.dex,...engine.config};
 const fixture=old.prepareFixture(P,ROOT,path.join(ROOT,'js/engine/showdown'),captured.binding.showdownSHA);assert.deepEqual(fixture.identity,prepared.fixture);
 const run=(id,tuples)=>{const calls=[];let cursor=0;const result=old.runCell(P,fixture,id,n=>{const row=tuples[cursor++];assert(row,id+' extra RNG '+n);assert.equal(n,row[0],id+' RNG domain');assert(Number.isInteger(row[1])&&row[1]>=0&&row[1]<n);calls.push([n,row[1]]);return row[1];});assert.equal(cursor,tuples.length,id+' unconsumed tape');return{result,calls};};
 const results=[];for(let i=1;i<=20;i++){const id='P'+String(i).padStart(2,'0'),file=path.join(opts['--old-results'],id+'.json'),record=JSON.parse(fs.readFileSync(file,'utf8'));protectedFiles.push({path:file,sha256:hash(file)});assert.equal(record.id,id);assert(record.prefixes.length>0);for(const vector of record.prefixes){const actual=run(id,vector.calls);assert.equal(actual.result.success,vector.success,id);assert.deepEqual(actual.result.observation,vector.observation,id);}results.push({id,kind:'original-literal-prefix-replay',cases:record.prefixes.length,status:'PASS'});}
 const base=JSON.parse(fs.readFileSync(path.join(opts['--old-results'],'P14.json'),'utf8')).prefixes[0].calls.slice(0,8);
 for(const [id,expected,improved]of [['P14',50,false],['P15',5,false],['P16',1,false],['P17',60,true],['P18',20,true],['P19',5,true]]){let count=0;for(let tier=0;tier<100;tier++){const selected=tier<(improved?85:56),tape=[...base,[100,tier],...(selected?[[1,0]]:[])];if(run(id,tape).result.success)count++;}assert.equal(count,expected,id+' exact finite tier count');results.push({id,kind:'complete-tier-domain',cases:100,count,expected,status:'PASS'});}
 let females=0;for(let value=0;value<3;value++){if(run('P20',[...base,[3,value]]).result.success)females++;}assert.equal(females,2);results.push({id:'P20',kind:'complete-CuteCharm-domain',cases:3,count:females,expected:2,status:'PASS'});
 for(const row of protectedFiles)assert.equal(hash(row.path),row.sha256);assert.deepEqual(identity(),before);assert.equal(H.capture(ROOT,process.env.PF_HEADLESS_REGRESSION_BINDING,captured.sha256).sha256,captured.sha256);
 const result={status:'PASS_CURRENT_FINITE_KERNEL_DOMAINS',identity:before,bindingSHA256:captured.sha256,statisticalSamples:0,finiteCases:results.reduce((n,r)=>n+r.cases,0),results,protectedFiles,limitations:['literal prefix replay plus seven finite marginal domains; historical2M not repeated','App lifecycle/complete forms/shared31/32/real-event chains are separately tested','no reference runtime equivalence/NW/real clock distribution claim']};write('RESULT.json',result);console.log(JSON.stringify({status:result.status,finiteCases:result.finiteCases,statisticalSamples:0}));
}catch(error){write('FAILURE.json',{error:String(error),stack:error.stack});console.error(error.stack);process.exitCode=1;}
