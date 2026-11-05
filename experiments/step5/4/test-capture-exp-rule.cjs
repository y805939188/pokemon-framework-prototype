'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),ROOT=path.resolve(process.env.PF_CAPTURE_EXP_ROOT||path.resolve(__dirname,'../../..'));
const F=require(path.join(ROOT,'experiments/step5/4/trainer-ai-integration/fixtures.cjs')),{E,T}=F,clone=v=>JSON.parse(JSON.stringify(v));
const growth=m=>({level:m.level,exp:m.exp,evs:clone(m.evs),moves:m.moves.map(({id,maxpp})=>({id,maxpp}))});
async function open({expGain,wild=false,captureSetting,mutateInFactory=false}={}){
 const input=F.inputs({party:2,moves:['splash']});for(const mon of input.trainers[0].party)mon.level=3;input.species.find(s=>s.id==='snorlax').learnset=[{level:1,move:'tackle'},{level:6,move:'growl'}];
 if(captureSetting!==undefined)input.settings={...input.settings,GAIN_EXP_FOR_CAPTURE:captureSetting};
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const content=assembled.content;
 const game=E.state.newGame({content,party:[],money:1000,bag:{masterball:1}}),mon=E.memberFactory.createMember({id:'P1',species:'Snorlax',level:5},content,()=>0);mon.exp=E.growth.minExp(content.species.Snorlax.growth,6)-1;mon.moves=[{id:'tackle',pp:35,maxpp:35}];game.party=[E.speciesKey.toPersistentMember(mon,content)];game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),before=JSON.stringify(state.read()),projection=T.fakes.createRecordingProjection(),factory=E.composition.createBattleSessionFactory({content:()=>{if(mutateInFactory)content.settings.GAIN_EXP_FOR_CAPTURE=true;return content;},seed:()=>[1,2,3,4]}),app=new E.app.GameApplication({state,projection,sessions:factory,content:()=>({content}),random:()=>0,clock:()=>12345},{receivingProfile:{mode:0,naming:1}});
 const request={battleId:'exp-gain-'+(wild?'wild':'trainer'),seq:1,canLose:true,expGain,...(wild?{kind:'wild',foes:[{species:'pidgey',level:3}]}:{trainer:{id:'c-basic',version:1}})};
 const s=wild?await app.startBattle(request):await app.startTrainerBattle(request),foe=s.gw.activeId('p2');s.take();return{s,app,request,state,before,foe,content,original:growth(s.party[0]),cleanup(){app.abortBattle(request,Error('owned exp-rule cleanup'));if(!state.replaced.length)assert.equal(JSON.stringify(state.read()),before);}};
}
async function firstKo(w){const messages=[];for(let n=0;n<10&&w.s.gw.activeId('p2')===w.foe;n++){const r=await w.s.chooseMove(1);assert(r.ok);messages.push(...r.messages);}assert.notEqual(w.s.gw.activeId('p2'),w.foe,'first actual foe must have been replaced');return messages;}
async function finish(w){for(let n=0;n<10&&!w.s.finished;n++)assert((await w.s.chooseMove(1)).ok);assert(w.s.finished);assert.equal(w.state.replaced.length,0);const result=w.app.finishBattle(w.s,w.request);assert.equal(result.commit,'applied',JSON.stringify(result));assert.equal(w.state.replaced.length,1);w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);}

test('CEXP01 author capture EXP is a strict boolean with the Gen8 default enabled',()=>{
 assert.equal(E.config.resolveConfig().GAIN_EXP_FOR_CAPTURE,true);
 for(const value of [false,true]){assert.deepEqual(E.config.checkOverrides({GAIN_EXP_FOR_CAPTURE:value}),[]);assert.equal(E.config.resolveConfig({GAIN_EXP_FOR_CAPTURE:value}).GAIN_EXP_FOR_CAPTURE,value);}
 for(const value of [null,0,'false',{},[]])assert(E.config.checkOverrides({GAIN_EXP_FOR_CAPTURE:value}).some(p=>p.path==='$.GAIN_EXP_FOR_CAPTURE'));
});
test('CEXP02 false captures normally without EV/EXP/learning and reception installs the same result once',async()=>{
 const w=await open({wild:true,captureSetting:false});try{
  assert.equal(w.s.captureExpGain,false);const r=await w.s.throwBall('masterball');assert(r.ok);assert(w.s.finished);assert.equal(w.s.ended.reason,'caught');assert(!r.messages.some(m=>['growth','learned','learn-prompt'].includes(m.kind)));assert.deepEqual(growth(w.s.party[0]),w.original);assert(w.s.participants[w.foe].has('P1'));assert.equal(JSON.stringify(w.state.read()),w.before);
  const result=w.s.result();assert.equal(result.captured.length,1);assert.equal(result.bag.masterball,-1);assert.equal(result.members.P1.exp,w.original.exp);const out=w.app.finishBattle(w.s,w.request);assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.state.replaced.length,1);assert.equal(w.state.read().party.length,2);assert.deepEqual(growth(w.state.read().party[0]),w.original);assert.equal(w.state.read().money,1000);assert.equal(w.state.read().inventory.pockets.flat().some(x=>x.itemId==='masterball'&&x.quantity>0),false);w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);
 }finally{w.cleanup();}
});
for(const captureSetting of [undefined,true])test('CEXP03 '+String(captureSetting)+' preserves default capture growth',async()=>{
 const w=await open({wild:true,captureSetting});try{const r=await w.s.throwBall('masterball');assert(r.ok);assert.equal(w.s.captureExpGain,true);assert(r.messages.some(m=>m.kind==='growth'));assert(w.s.party[0].exp>w.original.exp);assert(w.s.party[0].evs.spe>w.original.evs.spe);assert(w.s.party[0].moves.some(m=>m.id==='growl'));assert.equal(w.s.result().captured.length,1);assert.equal(w.state.replaced.length,0);}finally{w.cleanup();}
});
test('CEXP04 disabling capture growth does not disable normal KO growth',async()=>{
 const w=await open({captureSetting:false});try{const m=await firstKo(w);assert.equal(w.s.captureExpGain,false);assert(m.some(x=>x.kind==='growth'));assert(w.s.party[0].exp>w.original.exp);assert(w.s.party[0].evs.spe>w.original.evs.spe);await finish(w);}finally{w.cleanup();}
});
for(const captureSetting of [true,false])test('CEXP05 per-battle expGain=false remains the stronger gate ('+captureSetting+')',async()=>{
 const w=await open({wild:true,captureSetting,expGain:false});try{const r=await w.s.throwBall('masterball');assert(r.ok);assert.equal(w.s.expGain,false);assert(!r.messages.some(m=>m.kind==='growth'));assert.deepEqual(growth(w.s.party[0]),w.original);assert.equal(w.s.result().bag.masterball,-1);}finally{w.cleanup();}
});
test('CEXP06 App captures the author setting before the real factory content callback',async()=>{
 const w=await open({wild:true,captureSetting:false,mutateInFactory:true});try{assert.equal(w.content.settings.GAIN_EXP_FOR_CAPTURE,true);assert.equal(w.s.captureExpGain,false);const cp=w.s._checkpoint();assert((await w.s.throwBall('masterball')).ok);assert.deepEqual(growth(w.s.party[0]),w.original);await w.s._restoreCheckpoint(cp);assert.equal(w.s.captureExpGain,false);assert((await w.s.throwBall('masterball')).ok);assert.deepEqual(growth(w.s.party[0]),w.original);assert.equal(w.s.result().captured.length,1);assert.equal(w.state.replaced.length,0);}finally{w.cleanup();}
});
test('CEXP07 direct Session uses the content default before driver work and rejects malformed carrier values',async()=>{
 let calls=0;for(const captureExpGain of [null,0,'false',{}])await assert.rejects(E.session.BattleSession.create({game:{},foe:{},content:{},captureExpGain,driver:{async moveNames(){calls++;throw Error('must not call');}}}),/captureExpGain must be boolean/);assert.equal(calls,0);
 const B=require(path.join(ROOT,'experiments/step2/s3/fixtures.cjs')),content={...B.content,settings:{GAIN_EXP_FOR_CAPTURE:false}},game=B.makeGame();game.inventory=E.inventory.inventoryFromBag({masterball:1},E.itemCatalog.catalogOf(content));const s=await E.session.BattleSession.create({game,content,battleId:'capture-exp-direct',seed:[1,2,3,4],foe:{kind:'wild',team:[B.foeMember('F-1','Pidgey',5)]}});s.take();const before=growth(s.party[0]);content.settings.GAIN_EXP_FOR_CAPTURE=true;assert.equal(s.captureExpGain,false);const r=await s.throwBall('masterball');assert(r.ok);assert(!r.messages.some(m=>m.kind==='growth'));assert.deepEqual(growth(s.party[0]),before);assert.equal(s.result().captured.length,1);
});
