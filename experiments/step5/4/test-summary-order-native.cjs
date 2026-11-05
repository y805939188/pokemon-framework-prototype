'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const host=require('./summary-order-scene-host.cjs'),plan=require('./summary-order-native-plan.json');
const ROOT=path.resolve(__dirname,'../../..');let mod,temp;
test.before(async()=>{
 await host.prepare();temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-summary-exercise-'));
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:temp,emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-summary-order.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});mod=require(path.join(temp,'entry.cjs'));
});test.after(()=>{host.cleanup();if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open(c){const content=host.makeContent();content.species.Snorlax.learnset={1:['Splash']};return host.open({lang:c.language,members:1,hurt:false,leadMoves:plan.moves,fast:false,suppliedContent:content,foeSpecies:plan.foe.species,foeLevel:plan.foe.level});}
function ports(h,change){return{...h.p,evidence:async row=>{
 assert(row.window.contents,'actual compiled shared window created');assert(row.view.text.some(text=>text.includes(' PP')),'actual shared rendering records');
 if(change)return change(row,h);
 return{id:row.id,stage:row.stage,evidenceKind:'CONTROLLED_DRAW_RECORD_NOT_NATIVE_PIXELS',text:[...row.view.text],moves:row.moves};
}};}
for(const c of plan.cases)test(c.id+' '+c.language+' complete normal shared Summary exercise',async()=>{
 const h=await open(c);try{const row=await mod.exerciseBattleSummaryOrder(ports(h),c);assert.equal(row.installs,1);assert(row.rootReleased);assert.equal(row.nativeClaim,'NOT_SELF_QUALIFIED');assert.deepEqual(row.renders.map(r=>r.stage),plan.renderStages);assert.deepEqual(row.after.party[0].moves,[{id:'splash',pp:7,maxpp:40,ppUps:0},{id:'tackle',pp:31,maxpp:56,ppUps:3}]);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});console.log('SUMMARY_ORDER_EXERCISE '+JSON.stringify(row));}finally{h.cleanup();}
});
test('wrong case/stage evidence cannot qualify the actual Scene exercise',async()=>{
 const c=plan.cases[0],h=await open(c);try{await assert.rejects(mod.exerciseBattleSummaryOrder(ports(h,row=>({id:row.id,stage:'after-use'})),c),/evidence matches exact case and stage/);assert.equal(h.flow.running,false);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('extra state installation is rejected even if the final battle outcome says applied',async()=>{
 const c=plan.cases[0],h=await open(c);try{const app=h.flow.app(),finish=app.finishBattle;app.finishBattle=function(...args){const out=finish.apply(this,args);if(out.commit==='applied')h.G.$gameSystem._psGame=JSON.parse(JSON.stringify(h.flow.game()));return out;};await assert.rejects(mod.exerciseBattleSummaryOrder(ports(h),c),/single final state installation/);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);}finally{h.cleanup();}
});
test('evidence failure retires only the owned root and restores the state observer',async()=>{
 const c=plan.cases[1],h=await open(c);try{await assert.rejects(mod.exerciseBattleSummaryOrder(ports(h,()=>{throw Error('CONTROL_CAPTURE_FAILURE');}),c),/CONTROL_CAPTURE_FAILURE/);assert.equal(h.flow.running,false);assert(!h.flow.app().saveBlocked);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
