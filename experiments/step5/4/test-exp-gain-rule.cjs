'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./trainer-ai-integration/fixtures.cjs'),{E,T}=F,clone=v=>JSON.parse(JSON.stringify(v));
const growth=m=>({level:m.level,exp:m.exp,evs:clone(m.evs),moves:m.moves.map(({id,maxpp})=>({id,maxpp}))});
async function open({expGain,wild=false}={}){
 const input=F.inputs({party:2,moves:['splash']});for(const mon of input.trainers[0].party)mon.level=3;input.species.find(s=>s.id==='snorlax').learnset=[{level:1,move:'tackle'},{level:6,move:'growl'}];
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const content=assembled.content;
 const game=E.state.newGame({content,party:[],money:1000,bag:{masterball:1}}),mon=E.memberFactory.createMember({id:'P1',species:'Snorlax',level:5},content,()=>0);mon.exp=E.growth.minExp(content.species.Snorlax.growth,6)-1;mon.moves=[{id:'tackle',pp:35,maxpp:35}];game.party=[E.speciesKey.toPersistentMember(mon,content)];game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),before=JSON.stringify(state.read()),projection=T.fakes.createRecordingProjection(),factory=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),app=new E.app.GameApplication({state,projection,sessions:factory,content:()=>({content}),random:()=>0,clock:()=>12345},{receivingProfile:{mode:0,naming:1}});
 const request={battleId:'exp-gain-'+(wild?'wild':'trainer'),seq:1,canLose:true,expGain,...(wild?{kind:'wild',foes:[{species:'pidgey',level:3}]}:{trainer:{id:'c-basic',version:1}})};
 const s=wild?await app.startBattle(request):await app.startTrainerBattle(request),foe=s.gw.activeId('p2');s.take();return{s,app,request,state,before,foe,original:growth(s.party[0]),cleanup(){app.abortBattle(request,Error('owned exp-rule cleanup'));if(!state.replaced.length)assert.equal(JSON.stringify(state.read()),before);}};
}
async function firstKo(w){const messages=[];for(let n=0;n<10&&w.s.gw.activeId('p2')===w.foe;n++){const r=await w.s.chooseMove(1);assert(r.ok);messages.push(...r.messages);}assert.notEqual(w.s.gw.activeId('p2'),w.foe,'first actual foe must have been replaced');return messages;}
async function finish(w){for(let n=0;n<10&&!w.s.finished;n++)assert((await w.s.chooseMove(1)).ok);assert(w.s.finished);assert.equal(w.state.replaced.length,0);const result=w.app.finishBattle(w.s,w.request);assert.equal(result.commit,'applied',JSON.stringify(result));assert.equal(w.state.replaced.length,1);w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);}
test('EXP01 false reaches the real factory, skips EV/EXP/learning at a nonterminal KO, and retains participants',async()=>{
 const w=await open({expGain:false});try{const messages=await firstKo(w);assert.deepEqual(growth(w.s.party[0]),w.original);assert(!messages.some(m=>['growth','learned','learn-prompt'].includes(m.kind)));assert.equal(w.s.pendingLearn,null);assert.equal(w.s.expGain,false);assert(w.s.participants[w.foe].has('P1'));assert.equal(JSON.stringify(w.state.read()),w.before);const spent=35-w.s.party[0].moves[0].pp;assert(spent>0);await finish(w);assert.deepEqual(growth(w.state.read().party[0]),w.original);assert(w.state.read().party[0].moves[0].pp<35);assert(w.state.read().money>1000,'money is independently enabled');
 }finally{w.cleanup();}
});
for(const expGain of [undefined,true])test('EXP02 '+String(expGain)+' preserves normal EV, level-up and empty-slot learning',async()=>{
 const w=await open({expGain});try{const messages=await firstKo(w);assert.equal(w.s.expGain,true);assert(messages.some(m=>m.kind==='growth'));assert(w.s.party[0].exp>w.original.exp);assert(w.s.party[0].evs.spe>w.original.evs.spe);assert(w.s.party[0].level>=6);assert(w.s.party[0].moves.some(m=>m.id==='growl'));assert.equal(JSON.stringify(w.state.read()),w.before);await finish(w);assert(w.state.read().party[0].exp>w.original.exp);
 }finally{w.cleanup();}
});
test('EXP03 request mutation and checkpoint restore cannot change the captured false policy',async()=>{
 const w=await open({expGain:false});try{w.request.expGain=true;const cp=w.s._checkpoint();await firstKo(w);assert.deepEqual(growth(w.s.party[0]),w.original);await w.s._restoreCheckpoint(cp);assert.equal(w.s.expGain,false);await firstKo(w);assert.deepEqual(growth(w.s.party[0]),w.original);assert.equal(w.state.replaced.length,0);
 }finally{w.cleanup();}
});
test('EXP04 false also suppresses capture EV/EXP while retaining ball consumption and the captured result',async()=>{
 const w=await open({expGain:false,wild:true});try{const r=await w.s.throwBall('masterball');assert(r.ok);assert(w.s.finished);assert.equal(w.s.ended.reason,'caught');assert(!r.messages.some(m=>['growth','learned','learn-prompt'].includes(m.kind)));assert.deepEqual(growth(w.s.party[0]),w.original);const result=w.s.result();assert.equal(result.captured.length,1);assert.equal(result.bag.masterball,-1);assert.equal(result.members.P1.exp,w.original.exp);assert.deepEqual(result.members.P1.evs,w.original.evs);assert.equal(JSON.stringify(w.state.read()),w.before);
 }finally{w.cleanup();}
});
test('EXP05 invalid application values reject before a session or persistent write',async()=>{
 const content=F.content(),game=E.state.newGame({content,party:[],money:1000}),state=T.fakes.createMemoryState(game);let calls=0;
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:{async create(){calls++;throw Error('must not create');}},content:()=>({content}),random:()=>0});
 for(const expGain of [null,0,'false',{}])await assert.rejects(app.startBattle({battleId:'invalid-exp',kind:'wild',foes:[{species:'pidgey',level:3}],seq:1,expGain}),/expGain must be boolean/);assert.equal(calls,0);assert.equal(state.replaced.length,0);
});
test('EXP06 direct Session validates the flag before calling any driver',async()=>{
 let calls=0;const driver={async moveNames(){calls++;throw Error('must not load');}};
 for(const expGain of [null,0,'false',{}])await assert.rejects(E.session.BattleSession.create({game:{},foe:{},content:{},battleId:'invalid-exp',expGain,driver}),/expGain must be boolean/);assert.equal(calls,0);
});
