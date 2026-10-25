'use strict';
const I6 = require("../2/test-support.cjs");
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const E=require('../../../js/engine/build/engine.cjs');const S=E.state;const T=E.storage;const clone=x=>JSON.parse(JSON.stringify(x));
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'../../../content/sample',f),'utf8'));
const content=E.contentRuntime.assembleContent(E.contentCompile.compileContent({manifest:read('manifest.json'),sources:read('sources.json'),species:read('species.json'),overlays:read('overlays.json'),grants:read('grants.json')}).data,E.dex.createDexLookup()).content;
const auto={mode:1,naming:1};
function setup({size=1,boxes=0,options={},partyLimit=6}={}){const game=S.newGame({content,party:[],player:{id:0x12345678,name:'Trainer',gender:1,language:1},bag:{pokeball:5,potion:1}});for(let i=0;i<size;i++)game.party.push(E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:`OLD-${i}`,species:'Charmander',level:5,owner:game.player},content,()=>0),content));for(let i=0;i<boxes;i++)T.placeInBox(game.storage,{...clone(game.party[0]),id:`B-${i}`});game.nextMemberOrdinal=E.memberIdentity.initialOrdinal(T.allMembers(game).map(m=>m.id));const state=E.fakes.createMemoryState(game),sessions=E.fakes.createFakeSessions({}),projection=E.fakes.createRecordingProjection();let draws=0;const app=new E.app.GameApplication({state,sessions,projection,content:()=>({content}),random:n=>{draws++;return 0;},clock:()=>1234567890000},{...options,limits:{...E.limits.DEFAULT_LIMITS,party:partyLimit}});return {app,state,sessions,game,projection,get draws(){return draws;}};}
const ref=(g,id)=>({id,position:T.locateMember(g,id).position});
async function caught(x,{forceParty=false}={}){const request={battleId:'capture#1',kind:'wild',foes:[{species:'pidgey',level:3}],seq:1,forceParty};const handle=await x.app.startBattle(request);const foe=x.sessions.created[0].setup.foes[0];const result={protocol:1,battleId:request.battleId,outcome:{kind:'caught',winner:null,target:foe.id,ball:'pokeball'},members:{},bag:{pokeball:-1},captured:[S.protocolMember({...foe,hp:1})],dex:{seen:[foe.species],owned:[foe.species]}};x.sessions.next=result; // fake handles close over original source; provide a stable result function from the start below
return {handle,request,foe,result};}
async function battle(x,opts={}){let result; x.sessions.next=()=>result;const r=await caught(x,opts);result=r.result;return r;}

test('P51-14: capture pending retains save lock and all raw state; decline nickname then atomically joins party',async()=>{
 const x=setup(),r=await battle(x);const raw=JSON.stringify(x.state.current());const pending=x.app.finishBattle(r.handle,r.request);assert.equal(pending.pending,true);assert.equal(x.app.saveBlocked,true);assert.equal(JSON.stringify(x.state.current()),raw);assert.equal(x.projection.outcomes.length,0);
 const done=x.app.resolveReceiving(pending.receivingToken,{[r.foe.id]:{nickname:{kind:'keep'}}});assert.equal(done.commit,'applied');assert.equal(x.app.saveBlocked,false);assert.equal(x.state.replaced.length,1);const member=T.locateMember(x.state.current(),r.foe.id).member;
 assert.equal(member.personalID,r.foe.personalID);assert.deepEqual(member.owner,r.foe.owner);assert.equal(member.origin.receivedAt,1234567890);assert.equal(member.hp,1);assert.equal(member.species,'pidgey');assert.deepEqual(member.firstMoves,member.moves.map(m=>m.id));assert.equal(I6.bagOf(x.state.current()).pokeball,4);
 const same=x.app.resolveReceiving(pending.receivingToken,{});assert.deepEqual(same,done);assert.equal(x.state.replaced.length,1);assert.equal(x.app.finishBattle(r.handle,r.request).commit,'already-applied');
});
test('P51-14: full party chooses replacement by ID; template PID/form/owner kept and raw result hash unchanged',async()=>{
 const x=setup({size:6}),r=await battle(x);const pending=x.app.finishBattle(r.handle,r.request);const old=x.game.party[2].id;const hash=S.resultHash(r.result);
 const done=x.app.resolveReceiving(pending.receivingToken,{[r.foe.id]:{nickname:{kind:'set',value:'小风'},placement:{kind:'replace',target:ref(x.game,old)}}});assert.equal(done.commit,'applied');const g=x.state.current();assert.equal(g.party.length,6);assert.equal(g.party[2].id,r.foe.id);assert.equal(g.party[2].nickname,'小风');assert.equal(T.boxedMembers(g)[0].id,old);assert.equal(g.appliedBattles[r.request.battleId].hash,hash);
});
test('P51-14: full box still allows party room; dual full disables ball and failed placement spends nothing',async()=>{
 const room=setup({size:1,boxes:1200,options:{receivingProfile:auto}}),r=await battle(room);assert.equal(room.sessions.created[0].setup.noBall,false);assert.equal(room.app.finishBattle(r.handle,r.request).commit,'applied');
 const full=setup({size:6,boxes:1200,options:{receivingProfile:auto}}),other=await battle(full);assert.equal(full.sessions.created[0].setup.noBall,true);const raw=clone(full.state.current());assert.equal(full.app.finishBattle(other.handle,other.request).aborted,true);assert.deepEqual(full.state.current(),raw);
});
test('P51-14: force overrides auto; only explicit scene failure selects last legal replacement, new member never boxed',async()=>{
 const x=setup({size:6,options:{receivingProfile:auto}}),r=await battle(x,{forceParty:true});const pending=x.app.finishBattle(r.handle,r.request);assert.equal(pending.pending,true);
 assert.equal(x.app.resolveReceiving(pending.receivingToken,{},'timeout').reason,'invalid-recovery-signal');assert.equal(x.state.replaced.length,0);
 const done=x.app.resolveReceiving(pending.receivingToken,{},'rebuild-failed');assert.equal(done.commit,'applied');assert.equal(x.state.current().party[5].id,r.foe.id);assert.equal(T.boxedMembers(x.state.current())[0].id,x.game.party[5].id);
});
test('P51-14/21: old receiving token and old finish after state replacement do not affect a new battle',async()=>{
 const x=setup(),r=await battle(x);const pending=x.app.finishBattle(r.handle,r.request);x.app.stateReplacedByHost();const before=clone(x.state.current());assert.equal(x.app.resolveReceiving(pending.receivingToken,{}).reason,'stale-operation');assert.equal(x.app.finishBattle(r.handle,r.request).aborted,true);assert.deepEqual(x.state.current(),before);
 x.sessions.next=()=>{throw Error('not ended');};await x.app.startBattle({...r.request,battleId:'new#2'});assert.equal(x.app.finishBattle(r.handle,r.request).aborted,true);assert.equal(x.app.saveBlocked,true);
});
test('P51-14: public missing-template refusal precedes replay ledger; explicit templates without decisions returns pending',async()=>{
 const x=setup(),r=await battle(x);x.app.abortBattle(r.request,'test switches to public caller');const before=clone(x.state.current());assert.equal(x.app.commitResult(r.result),'no-template');assert.deepEqual(x.state.current(),before);
 const template=E.speciesKey.toPersistentMember(r.foe,content);assert.equal(x.app.commitResult(r.result,{templates:{[r.foe.id]:template},nextMemberOrdinal:'999'}),'pending');const token=x.app.pendingReceiving.token;assert.equal(x.app.saveBlocked,true);
 assert.equal(x.app.resolveReceiving(token,{[r.foe.id]:{nickname:{kind:'keep'}}}).status,'applied');assert.equal(x.app.commitResult(r.result),'no-template');assert.equal(x.app.commitResult(r.result,{templates:{[r.foe.id]:template},profile:auto}),'already-applied');assert.equal(x.state.replaced.length,1);
});
test('P51-15: multi-member grant collects decisions before whole grant/claim/items/money; repeat pending never rerolls',()=>{
 const x=setup({size:0});let pending=x.app.claimGrant('starter');assert.equal(pending.status,'pending');const raw=clone(x.state.current()),draws=x.draws;assert.equal(x.app.claimGrant('starter').token,pending.token);assert.equal(x.draws,draws);assert.deepEqual(x.state.current(),raw);
 const m=x.app.pendingReceiving.members[0];const result=x.app.resolveReceiving(pending.token,{[m.id]:{nickname:{kind:'set',value:'火火'}}});assert.equal(result.status,'applied');assert.equal(x.state.replaced.length,1);assert.equal(x.state.current().claims.starter.kind,'grant');assert.equal(x.state.current().party[0].nickname,'火火');assert.equal(x.app.claimGrant('starter').status,'already-claimed');
});
test('P51-15/16: gift modes preserve existing attributes, foreign truncates nickname without asking; held sources refuse before creation',()=>{
 const x=setup({size:0});assert.equal(x.app.receiveGift({kind:'silent',member:{species:'pidgey',level:3}}).status,'applied');const original=clone(x.state.current().party[0]);original.id='EXTERNAL';original.nickname='原名';const pending=x.app.receiveGift({kind:'normal',member:{existing:original}});assert.equal(pending.status,'pending');assert.equal(x.app.resolveReceiving(pending.token,{[original.id]:{nickname:{kind:'keep'}}}).status,'applied');assert.equal(x.state.current().party[1].nickname,'原名');assert.equal(x.state.current().party[1].personalID,original.personalID);
 const result=x.app.receiveGift({kind:'foreign',member:{species:'pidgey',level:3},foreignOwner:{name:'NPC'},nickname:'一二三四五六七八九十十一'});assert.equal(result.status,'applied');const foreign=x.state.current().party[2];assert.equal(foreign.nickname,'一二三四五六七八九十');assert.notEqual(foreign.owner.id,x.game.player.id);assert.equal(foreign.owner.name,'NPC');
 const before=clone(x.state.current()),draws=x.draws;assert.equal(x.app.receiveGift({kind:'silent',member:{species:'pidgey',level:3,item:'leftovers'}}).reason,'held-item-source-disabled');assert.deepEqual(x.state.current(),before);assert.equal(x.draws,draws);
});
test('P51-14/15: party limits p=1/3/6 and party-only failure never sends member to a box',()=>{
 for(const p of [1,3,6]){const x=setup({size:p,partyLimit:p});assert.equal(x.app.receiveGift({kind:'party-silent',member:{species:'pidgey',level:3}}).reason,'party-full');assert.equal(T.boxedMembers(x.state.current()).length,0);assert.equal(x.app.receiveGift({kind:'silent',member:{species:'pidgey',level:3}}).status,'applied');assert.equal(x.state.current().party.length,p);assert.equal(T.boxedMembers(x.state.current()).length,1);}
});
test('P51-14: ordinary scene-failure fallback stores in named current box and notice survives until acknowledged',async()=>{
 const x=setup({size:6});const prepared=clone(x.state.current());prepared.storage.currentBox=3;prepared.storage.boxes[3].name='新家';x.state.replace(prepared);const r=await battle(x);const pending=x.app.finishBattle(r.handle,r.request);assert.equal(x.app.receivingNotifications.length,0);
 const done=x.app.resolveReceiving(pending.receivingToken,{},'scene-aborted');assert.equal(done.commit,'applied');const notices=x.app.receivingNotifications;assert.deepEqual(notices,[{token:pending.receivingToken,placements:[{id:r.foe.id,to:'boxes',box:3,boxName:'新家'}]}]);x.app.acknowledgeReceivingNotification(pending.receivingToken);assert.deepEqual(x.app.receivingNotifications,[]);
});
test('P51-14/22: replace failure keeps raw result/template/lock for a single retry, no RNG reroll or partial resource loss',async()=>{
 const x=setup({options:{receivingProfile:auto}}),r=await battle(x);const draws=x.draws,before=clone(x.state.current());x.state.failReplace=Error('injected replacement failure');const pending=x.app.finishBattle(r.handle,r.request);assert.equal(pending.pending,true);assert.match(pending.error,/commit-failed/);assert.deepEqual(x.state.current(),before);assert.equal(x.app.saveBlocked,true);x.state.failReplace=null;
 const done=x.app.resolveReceiving(pending.receivingToken,{});assert.equal(done.commit,'applied');assert.equal(x.draws,draws);assert.equal(x.state.replaced.length,1);assert.equal(x.state.current().stats.wild_battles_won,1);assert.equal(I6.bagOf(x.state.current()).pokeball,4);
});
test('P51-15: multi-member grant is all-or-none across pending decisions and commit failure',()=>{
 const members=clone(content);members.grants.pair={id:'pair',members:[{species:'Pidgey',level:3},{species:'Caterpie',level:3}],items:{potion:2},money:100};const base=S.newGame({content:members,party:[],bag:{potion:1}});const state=E.fakes.createMemoryState(base);let draws=0;const app=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),projection:E.fakes.createRecordingProjection(),content:()=>({content:members}),random:()=>{draws++;return 0;},clock:()=>1000});
 const pending=app.claimGrant('pair');assert.equal(pending.status,'pending');const templates=app.pendingReceiving.members,first=templates[0].id,second=templates[1].id;const expectedDraws=draws;
 assert.equal(app.resolveReceiving(pending.token,{[first]:{nickname:{kind:'keep'}}}).status,'pending');assert.deepEqual(state.current(),base);assert.equal(draws,expectedDraws);
 state.failReplace=Error('fail');const rejected=app.resolveReceiving(pending.token,{[second]:{nickname:{kind:'keep'}}});assert.equal(rejected.status,'pending');assert.equal(rejected.reason,'commit-failed');assert.deepEqual(state.current(),base);state.failReplace=null;
 assert.equal(app.resolveReceiving(pending.token,{}).status,'applied');assert.equal(draws,expectedDraws);assert.equal(state.replaced.length,1);assert.equal(state.current().party.length,2);assert.equal(I6.bagOf(state.current()).potion,3);assert.equal(state.current().money,100);assert.deepEqual(state.current().claims,{pair:{kind:'grant'}});
});
test('P51-15: normal/silent/party/foreign default to level 1; party-silent missing level explicitly refuses',()=>{
 for(const kind of ['normal','silent','party','foreign']){const x=setup({size:0,options:{receivingProfile:auto}});assert.equal(x.app.receiveGift({kind,member:{species:'pidgey'}}).status,'applied',kind);assert.equal(x.state.current().party[0].level,1);}
 const x=setup({size:0});assert.equal(x.app.receiveGift({kind:'party-silent',member:{species:'pidgey'}}).reason,'level-required');assert.equal(x.state.replaced.length,0);
});
test('P51-03/04/14: new provenance is injected once; unknown legacy owner flag is separate from origin',()=>{
 const existing=E.memberIdentity.completeIndividual({...S.protocolMember(E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'legacy',species:'Pidgey',level:3},content,()=>0),content)),form:0},content.species.Pidgey);existing.statNature=null;existing.moves=existing.moves.map(m=>({...m,ppUps:0}));assert.equal(existing.ownerCompatibilityDefault,true);assert.equal(existing.origin.compatibilityDefault,true);
 const x=setup({size:0});assert.equal(x.app.receiveGift({kind:'foreign',member:{existing},foreignOwner:{name:'Known'}}).status,'applied');const received=x.state.current().party[0];assert.equal(received.ownerCompatibilityDefault,false);assert.equal(received.origin.compatibilityDefault,true,'old obtain location/time remains unknown after assigning a known foreign owner');
});
test('P51-09/14: eggs do not make a party battle-able and unsupported egg/mail gift sources refuse',async()=>{
 const x=setup();const g=clone(x.state.current());g.party[0].isEgg=true;x.state.replace(g);await assert.rejects(x.app.startBattle({battleId:'egg',kind:'wild',seq:1,foes:[{species:'pidgey',level:3}]}),/no party member can battle/);assert.equal(x.sessions.created.length,0);
 for(const field of ['isEgg','mail']){const y=setup({size:0}),member=clone(g.party[0]);member.id='gift';member.isEgg=field==='isEgg';member.mail=field==='mail'?'letter':null;assert.equal(y.app.receiveGift({kind:'silent',member:{existing:member}}).reason,field==='isEgg'?'egg-not-supported':'mail-not-supported');assert.equal(y.state.replaced.length,0);}
});
test('P51-01: receiving an external M-id advances the shared counter and never rerolls individual attributes',()=>{
 const x=setup({size:0});const external=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'Mzz',species:'Pidgey',level:3},content,()=>0),content);assert.equal(x.app.receiveGift({kind:'silent',member:{existing:external}}).status,'applied');assert.equal(x.state.current().nextMemberOrdinal,'1296');assert.equal(x.state.current().party[0].personalID,external.personalID);assert.equal(E.memberIdentity.allocateMemberId(x.state.current().nextMemberOrdinal,new Set()).id,'M100');
});
