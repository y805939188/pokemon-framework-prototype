'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const test=require('node:test');
const {E,T,clone}=require('./support.cjs');
const {inputs}=require('../trainer-ai-integration/fixtures.cjs');
const events=r=>r.messages.flatMap(m=>m.kind==='events'?m.events:[]);
async function run(status,move){
 const input=inputs({moves:['splash']});input.species.find(s=>s.id==='snorlax').learnset=[{level:1,move}];
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const content=assembled.content;
 const mon=E.memberFactory.createMember({id:'CAP-P1',species:'Snorlax',level:50},content,()=>0);
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(mon,content)],bag:{masterball:1}});game.badges.fill(true);game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),content:()=>({content}),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),random:()=>0,clock:()=>12345},{receivingProfile:{mode:0,naming:1}});
 const req={battleId:'status-capture-'+status,seq:1,kind:'wild',canLose:true,expGain:false,moneyGain:false,foes:[{species:'pidgey',level:50}]};
 const before=clone(state.read()),s=await app.startBattle(req);s.take();const inflict=await s.chooseMove(1);assert(inflict.ok);assert(events(inflict).some(e=>e.type==='-status'&&e.args[1]===status));
 const wild=clone(s.gw.readState('p2')[0]);assert.equal(wild.status,status);assert.deepEqual(state.read(),before);
 assert((await s.throwBall('masterball')).ok);assert(s.finished);const captured=s.result().captured[0];assert.equal(captured.status,status);assert.equal(captured.statusCount,wild.statusCount);assert.equal(captured.hp,wild.hp);assert.deepEqual(state.read(),before);
 const finish=app.finishBattle(s,req);assert.equal(finish.commit,'applied',JSON.stringify(finish));assert.equal(state.replaced.length,1);assert.equal(state.read().party.length,2);const received=clone(state.read().party[1]);assert.equal(received.status,status);assert.equal(received.hp,captured.hp);assert.equal(received.statusCount,captured.statusCount);assert.equal(E.inventory.aggregateBag(state.read().inventory).masterball??0,0);
 const committed=clone(state.read());assert.equal(app.finishBattle(s,req).commit,'already-applied');assert.equal(state.replaced.length,1);assert.deepEqual(state.read(),committed);
 const token=app.beginManagement();try{assert.equal(app.manage(token,'captured-to-lead-'+status,{kind:'move',source:{id:received.id,position:{kind:'party',index:1}},target:{kind:'party',index:0},expectedTargetId:'CAP-P1'}).status,'applied');}finally{app.endManagement(token);}
 const req2={...req,battleId:req.battleId+'-next',seq:2};const saved=clone(state.read()),n=state.replaced.length,next=await app.startBattle(req2);next.take();const read=()=>next.gw.readState('p1').find(m=>m.id===received.id);const initial=clone(read());assert.equal(next.gw.activeId('p1'),received.id);assert.equal(initial.status,status);assert.equal(initial.statusCount,received.statusCount);assert.equal(initial.hp,received.hp);
 if(status==='brn'){const r=await next.chooseMove(1);assert(r.ok);assert.equal(read().hp,initial.hp-Math.floor(initial.maxhp/16));assert.equal(read().pp.splash,initial.pp.splash-1);assert(events(r).some(e=>e.type==='-damage'&&e.args[0].includes(received.id)&&e.args.includes('[from] brn')));}
 else {assert(initial.statusCount>=1);for(let i=1;i<=initial.statusCount;i++){const r=await next.chooseMove(1);assert(r.ok);assert.equal(read().status,i===initial.statusCount?'':'slp');assert.equal(read().statusCount,initial.statusCount-i);assert.equal(read().pp.splash,initial.pp.splash-Number(i===initial.statusCount));assert.equal(events(r).filter(e=>e.type==='cant'&&e.args[0].includes(received.id)&&e.args[1]==='slp').length,Number(i<initial.statusCount));}}
 assert.deepEqual(state.read(),saved);for(let attempt=0;attempt<12&&!next.finished;attempt++){assert((await next.run()).ok);assert.deepEqual(state.read(),saved);}assert(next.finished,'bounded real escape must reach terminal before commit');assert.equal(next.ended.reason,'run','must escape, not faint or another terminal outcome');assert.deepEqual(next.result().outcome,{kind:'run',winner:null},'escape result, not defeat');assert.equal(app.finishBattle(next,req2).commit,'applied');assert.equal(state.replaced.length,n+1);
 const preheal=state.replaced.length;assert.equal(app.healParty().status,'healed');assert.equal(state.replaced.length,preheal+1);const healed=state.read().party[0];assert.equal(healed.status,'');assert.equal(healed.statusCount,0);assert.equal(healed.hp,initial.maxhp);assert(healed.moves.every(m=>m.pp===m.maxpp));
 const req3={...req,battleId:req.battleId+'-healed',seq:3},healedSaved=clone(state.read()),third=await app.startBattle(req3);third.take();const healthy=third.gw.readState('p1').find(m=>m.id===received.id);assert.equal(healthy.status,'');assert.equal(healthy.statusCount,0);assert.equal(healthy.hp,initial.maxhp);app.abortBattle(req3,Error('owned status capture test complete'));assert.deepEqual(state.read(),healedSaved);
 return {status,appliedMove:move,capturedId:received.id,capturedHP:received.hp,capturedCount:received.statusCount,nextOpening:initial,installs:state.replaced.length,scope:'real App Session Gen8; memory state; no Scene NW or disk'};
}
for(const [status,move] of [['brn','willowisp'],['slp','spore']]) {
 test(`capture ${status}, carry into next battle, heal and reopen healthy`,()=>run(status,move));
}
