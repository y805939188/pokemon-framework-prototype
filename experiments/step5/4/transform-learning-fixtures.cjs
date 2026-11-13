'use strict';
// Synthetic authored Mew learning tables, real content compilation and App/Session/Gen8.
const assert=require('node:assert/strict');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs');
const clone=v=>structuredClone(v);
function authored({own=4,copied=2,learnMoves=['rest']}={}) {
 const moves=['splash','seismictoss','growl','tailwhip'].slice(0,copied),input=inputs({party:2,moves});
 input.species.push({id:'mew',showdownId:'mew',nameKey:'species.mew',growth:'medium',baseExp:270,evYield:{hp:1},catchRate:45,
  learnset:[...['transform','splash','growl','protect'].slice(0,own).map(move=>({level:1,move})),...learnMoves.map(move=>({level:51,move}))],source:'author-placeholder'});
 input.trainers[0].party.forEach(m=>{m.level=5;});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const p=E.memberFactory.createMember({id:'P1',species:'Mew',level:50,abilityIndex:0},content,()=>0),backup=E.memberFactory.createMember({id:'P2',species:'Snorlax',level:50},content,()=>0);
 p.exp=E.growth.minExp(content.species.Mew.growth,51)-1;
 const game=E.state.newGame({content,party:[p,backup].map(m=>E.speciesKey.toPersistentMember(m,content)),money:1000});game.nextMemberOrdinal='3';
 return {content,game};
}
async function open(options={}) {
 const {content,game}=authored(options),state=T.fakes.createMemoryState(game),initial=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4],replacementOffers:!!options.replacement}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:'transform-learning',trainer:{id:'c-basic',version:1},seq:1,canLose:true,battleStyle:options.replacement?'switch':'set'},s=await app.startTrainerBattle(request);s.take();
 return {content,s,app,request,state,initial};
}
const actor=w=>w.s.gw._debugBattle().sides[0].pokemon.find(p=>p.name==='P1');
const unchanged=w=>{assert.deepEqual(w.state.read(),w.initial);assert.equal(w.state.replaced.length,0);};
const cleanup=w=>w.app.abortBattle(w.request,Error('owned Transform learning regression cleanup'));
async function transform(w){const r=await w.s.chooseMove(1);assert(r.ok,JSON.stringify(r));assert.equal(actor(w).transformed,true);unchanged(w);return clone(actor(w).storedStats);}
async function knockout(w){const i=w.s.currentRequest().active[0].moves.findIndex(m=>m.id==='seismictoss')+1;assert(i>0);const r=await w.s.chooseMove(i);assert(r.ok,JSON.stringify(r));return r;}
function dense(w){const p=actor(w);for(const slots of [p.moveSlots,p.baseMoveSlots])assert(Array.from(slots).every(s=>s&&typeof s.id==='string'));const req=w.s.currentRequest();if(req?.active)assert(req.active[0].moves.every(m=>m&&m.id));assert.equal(w.s.broken,null);}
module.exports={E,T,authored,open,actor,unchanged,cleanup,transform,knockout,dense,clone};
