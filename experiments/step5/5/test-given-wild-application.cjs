'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {E,copy,member,fixture,realContent}=require('./given-wild-support.cjs');
const request=(m,id='given')=>({battleId:id,seq:1,member:m});
const next=()=>new Promise(setImmediate);
test('given App copies a complete individual, preserves identity, and needs no generation ports',async()=>{
 const h=fixture({noRandom:true}),provided=h.provided,before=copy(provided),n=h.state().nextMemberOrdinal;
 const session=await h.app.startGivenWildBattle(request(provided));assert(session);assert.equal(h.sessions.length,1);
 assert.deepEqual(h.sessions[0].setup.foes[0],E.speciesKey.toBattleMember(before,h.content));assert.deepEqual(provided,before);
 provided.personalID=7;provided.owner.name='changed';provided.moves[0].pp=0;
 assert.equal(h.sessions[0].setup.foes[0].personalID,before.personalID);assert.equal(h.sessions[0].setup.foes[0].owner.name,before.owner.name);
 assert.equal(h.state().nextMemberOrdinal,n);assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);assert.equal(h.counts.clock,0);assert.equal(h.counts.context,0);
 await assert.rejects(h.app.startGivenWildBattle(request(before,'duplicate-active')),/active/);assert.equal(h.sessions.length,1);
 h.app.abortBattle({battleId:'given'},Error('test complete'));assert.equal(h.app.saveBlocked,false);
});
for(const kind of ['member-getter','nested-getter','toJSON','function','sparse','inherited','extra-tag'])test('given rejects '+kind+' without executing user hooks',async()=>{
 const h=fixture(),m=copy(h.provided);let calls=0,input=request(m);
 if(kind==='member-getter')Object.defineProperty(input,'member',{enumerable:true,get(){calls++;return m;}});
 if(kind==='nested-getter')Object.defineProperty(m.owner,'name',{enumerable:true,get(){calls++;return 'Author';}});
 if(kind==='toJSON')m.toJSON=function(){calls++;return copy(h.provided);};
 if(kind==='function')m.extension=function(){calls++;return 1;};
 if(kind==='sparse')m.moves.length=3;
 if(kind==='inherited')input=Object.assign(Object.create({member:m}),{battleId:'given',seq:1});
 if(kind==='extra-tag')input.given=true;
 await assert.rejects(h.app.startGivenWildBattle(input),/given-wild/);assert.equal(calls,0);assert.equal(h.sessions.length,0);assert.deepEqual(h.draws,[]);assert.equal(h.writes.length,0);assert.equal(h.app.saveBlocked,false);
});
for(const kind of ['species','form','held','move','id-collision'])test('given content rejects '+kind+' before Session and generation RNG',async()=>{
 const h=fixture(),m=copy(h.provided);
 if(kind==='species')m.species='unknown';if(kind==='form')m.form=63;if(kind==='held')m.item='native-only-unknown';if(kind==='move')m.moves[0].id='unknown';if(kind==='id-collision')m.id=h.state().party[0].id;
 await assert.rejects(h.app.startGivenWildBattle(request(m)),/given-wild/);assert.deepEqual(h.draws,[]);assert.equal(h.sessions.length,0);assert.equal(h.writes.length,0);
});
for(const kind of ['content-replace','state-replace','generation'])test('given pending Session rejects late '+kind+' and never settles old writes',async()=>{
 let resolve;const h=fixture({create(){return new Promise(done=>resolve=done);}}),before=copy(h.state());
 const promise=h.app.startGivenWildBattle(request(h.provided));await next();assert.equal(typeof resolve,'function');
 if(kind==='content-replace')h.replaceContent(copy(h.content));if(kind==='state-replace')h.replaceGame(copy(h.state()));if(kind==='generation')h.app.stateReplacedByHost();
 resolve({result(){throw Error('must never settle');}});await assert.rejects(promise,/changed|aborted|late/);assert.equal(h.app.saveBlocked,false);assert.equal(h.writes.length,0);assert.deepEqual(h.state(),before);assert.deepEqual(h.draws,[]);
});
test('given finite dynamic fallback survives real Session capture, formal receiving and full-party storage once',async()=>{
 const {content,dex}=realContent(),party=Array.from({length:6},(_,i)=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P'+(i+1),species:'Snorlax',level:50},content,()=>0),content));
 let game=E.state.newGame({content,party,bag:{masterball:1}}),seeds=0,draws=0,clock=0,context=0;
 const given={...member(content,'Given62','milcery-test'),form:62,item:'ribbonsweet',gender:'F'},original=copy(given);
 const factory=E.composition.createBattleSessionFactory({content:()=>content,seed(){seeds++;return[1,2,3,4];}});
 const app=new E.app.GameApplication({state:{read:()=>game,replace:next=>{game=next;}},content:()=>({content,dex}),sessions:factory,projection:{project(){}},random(){draws++;throw Error('generation forbidden');},clock(){clock++;throw Error('origin clock forbidden');},creationContext(){context++;throw Error('creation context forbidden');}});
 const s=await app.startGivenWildBattle(request(given,'given-capture'));given.personalID=9;given.owner.name='external';s.take();assert.equal((await s.throwBall('masterball')).ok,true);assert.equal(s.finished,true);const raw=s.result();
 let out=app.finishBattle(s,{battleId:'given-capture',kind:'wild',foes:[],seq:1});assert.equal(out.pending,true,JSON.stringify(out));out=app.resolveReceiving(out.receivingToken,{[raw.captured[0].id]:{nickname:{kind:'keep'},placement:{kind:'box'}}});assert.equal(out.commit,'applied',JSON.stringify(out));
 const stored=game.storage.boxes.flatMap(b=>b.slots).find(m=>m?.id===original.id);assert(stored);
 for(const key of ['species','form','personalID','owner','origin','ivs','evs','nature','gender','shiny','superShiny','item','nickname'])assert.deepEqual(stored[key],original[key],key);
 assert.equal(stored.ball,'masterball');assert.deepEqual(stored.firstMoves,stored.moves.map(m=>m.id));assert.equal(game.party.length,6);assert.equal(game.dex.capturedCounts['milcery-test'],1);
 assert.equal(app.finishBattle(s,{battleId:'given-capture',kind:'wild',foes:[],seq:1}).commit,'already-applied');assert.equal(game.dex.capturedCounts['milcery-test'],1);assert.equal(seeds,1);assert.equal(draws,0);assert.equal(clock,0);assert.equal(context,0);
});
