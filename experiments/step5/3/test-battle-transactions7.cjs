'use strict';
// E2a primary/effects atomic transaction. Synthetic receipts are explicit; one default real session is separate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../../../js/engine/build/engine.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
const sourceSha=fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim();
function content(strong=true){const c=clone(E.fixtures.content),dex=E.dex.createDexLookup();
 for(const [name,data] of Object.entries(c.species)){const d=dex.species(name);data.abilities=d.abilities;data.hiddenAbilities=d.hiddenAbilities;data.gender=d.gender;}
 const ids=['flamethrower','airslash','dragonpulse','roost','hydropump','icebeam','flashcannon','protect','gigadrain','sludgebomb','earthquake','synthesis','tackle','rest'];c.moves=Object.fromEntries(ids.map(id=>{const m=dex.move(id);return[m.name,m];}));c.species.Pidgey.learnset={1:['Tackle']};c.species.Snorlax.learnset={1:['Rest']};
 if(strong){const inputsHash='1'.repeat(64),compiledSemantics=2;c.meta={kind:'fixture',id:'effects-transaction',inputsHash,compiledSemantics,showdownSha:sourceSha,contentIdentity:E.digest.sha256Hex(E.contentCompile.canonicalJson({compiledSemantics,inputsHash,showdownSha:sourceSha}))};}else delete c.meta;return c;}
const raw=(id,extra={})=>({protocol:1,battleId:id,outcome:{kind:'run',winner:null},members:{},bag:{},captured:[],dex:{seen:[],owned:[]},...extra});
const complete=value=>({status:'complete',value}),faint=()=>({coverage:{status:'complete'},positiveOccurrences:[]});
function fakeFactory(builder,friendAfter=100){
 const f={created:[],calls:0,failEffects:false,
  async create(request,game,setup){const r=builder({request,game,setup}),h={result:()=>clone(r)};f.created.push({request,game,setup,raw:r,handle:h});return h;},
  effects(h,binding){f.calls++;if(f.failEffects)throw Error('synthetic source unavailable');const x=f.created.find(x=>x.handle===h),ctx=x.setup.evidenceContext;
   return {version:2,binding:{...binding},context:{playerIds:[...ctx.playerIds],L0:clone(ctx.initialLevels),engineRosterIds:x.game.party.map(m=>m.id),foeIds:x.setup.foes.map(m=>m.id),internalBattle:true},
    observer:{appearances:Object.fromEntries(x.setup.foes.map((m,i)=>[m.id,complete(i?[]:[{memberId:m.id,sourceOrder:1,display:{battleSpecies:m.species,gender:m.gender==='F'?1:m.gender==='M'?0:2,shiny:!!m.shiny}}])])),defeats:{},members:Object.fromEntries(x.game.party.map(m=>[m.id,{critical:complete(0),damage:complete({total:0,resetCoverage:'complete'}),faint:faint()}]))},
    control:{members:Object.fromEntries(x.game.party.map((m,i)=>{const before=m.friendship,after=i?before:friendAfter;return[m.id,{faint:faint(),friendship:complete({before,current:after,changes:after===before?[]:[{method:'battleitem',before,after}]})}];}))}};
  }};return f;
}
const capture=({request,game,setup})=>raw(request.battleId,{outcome:{kind:'caught',winner:null,target:setup.foes[0].id,ball:'masterball'},members:{[game.party[0].id]:{exp:game.party[0].exp+5}},bag:{masterball:-1},captured:[E.state.protocolMember({...setup.foes[0],ball:'masterball'})],dex:{seen:setup.foes.map(m=>m.species),owned:[setup.foes[0].species]}});
function world({strong=true,builder=capture,initial,friendAfter=100,real=false,port}={}){
 let c=content(strong),blocked=false;const g=initial??E.fixtures.makeGame();g.party[0].friendship=99;const state=E.fakes.createMemoryState(g);
 const sessions=real?E.composition.createBattleSessionFactory({content:()=>c,seed:()=>[1,2,3,4]}):fakeFactory(builder,friendAfter);
 const projection=E.fakes.createRecordingProjection();const statePort=port?port(state):state;
 const app=new E.app.GameApplication({state:statePort,sessions,projection,content:()=>{if(blocked)throw Error('current content deliberately unavailable');return {content:c};},random:n=>0,clock:()=>0,itemWorld:()=>({mapId:123})},{receivingProfile:{mode:1,naming:1}});
 return {app,state,sessions,projection,content:()=>c,setContent:v=>{c=v;},blockContent:()=>{blocked=true;},request:{battleId:'transaction-1',kind:'wild',seq:1,foes:[{species:'Pidgey',level:5}]}};
}
test('E2a real default session installs acknowledged friendship, capture, XP, forms/count and original hash once',async()=>{
 const g=E.fixtures.makeGame();g.party[0].hp=50;const w=world({initial:g,real:true});const h=await w.app.startBattle(w.request),before=clone(w.state.current());
 await h.useItem('potion',before.party[0].id);await h.throwBall('masterball');const r=h.result(),expected=h.party[0].friendship,o=w.app.finishBattle(h,w.request),now=w.state.current();
 assert.equal(o.commit,'applied');assert.equal(now.party[0].friendship,expected);assert(expected>99);assert(now.party[0].exp>before.party[0].exp);assert.equal(now.party.length,before.party.length+1);
 assert(now.dex.owned.includes('Pidgey'));assert.equal(now.dex.capturedCounts.Pidgey,1);assert(now.dex.seenForms.Pidgey.length);assert.equal(now.appliedBattles[r.battleId].hash,E.state.resultHash(r));assert.equal(w.state.replaced.length,1);assert.equal(w.app.saveBlocked,false);assert.deepEqual(E.saveSchema.validateGameContent(now,w.content()),[]);
});
test('E2a raw whole-foe seen remains validated but only actual synthetic displayed foe is recorded',async()=>{
 const w=world({builder:({request,setup})=>raw(request.battleId,{dex:{seen:setup.foes.map(m=>m.species),owned:[]}})});w.request.foes.push({species:'Snorlax',level:5});const h=await w.app.startBattle(w.request);assert.equal(w.app.finishBattle(h,w.request).commit,'applied');
 assert(w.state.current().dex.seen.includes('Pidgey'));assert.equal(w.state.current().dex.seen.includes('Snorlax'),false);assert.equal(w.sessions.calls,1);
});
test('E2a unavailable effects retain legal capture/XP and persist only the old true unknown barrier',async()=>{
 const g=E.fixtures.makeGame();g.party[0].readyToEvolve=true;g.party[0].evolutionReadiness='known';const w=world({initial:g});w.sessions.failEffects=true;
 const before=clone(w.state.current()),h=await w.app.startBattle(w.request),o=w.app.finishBattle(h,w.request),now=w.state.current();
 assert.equal(o.commit,'applied');assert.equal(now.party[0].friendship,99);assert.equal(now.party[0].readyToEvolve,true);assert.equal(now.party[0].evolutionReadiness,'unknown');assert(now.party[0].exp>before.party[0].exp);assert.equal(now.party.length,before.party.length+1);assert.equal(now.dex.capturedCounts.Pidgey,1);assert.equal(now.dex.owned.includes('Pidgey'),true);assert.deepEqual(E.saveSchema.validateGameContent(now,w.content()),[]);
});
test('E2a reliable primary HP0 clears R even with missing effects; defeat heal/money and ledger share one install',async()=>{
 const g=E.fixtures.makeGame();g.party[0].readyToEvolve=true;g.party[0].evolutionReadiness='known';const w=world({initial:g,builder:({request,game})=>raw(request.battleId,{outcome:{kind:'win',winner:'Wild'},members:{[game.party[0].id]:{hp:0}}})});w.sessions.failEffects=true;
 const h=await w.app.startBattle(w.request),o=w.app.finishBattle(h,w.request),now=w.state.current();assert.equal(o.commit,'applied');assert(o.defeat.moneyLost>0);assert(now.party[0].hp>0);assert.deepEqual([now.party[0].readyToEvolve,now.party[0].evolutionReadiness],[false,'known']);assert.equal(w.state.replaced.length,1);assert(now.appliedBattles[w.request.battleId]);
});
test('E2a missing metadata A to B and changed compiled semantics cannot authorize auxiliary writes',async()=>{
 for(const variant of ['anonymous','semantics']){
  const g=E.fixtures.makeGame();g.party[0].readyToEvolve=true;g.party[0].evolutionReadiness='known';const w=world({strong:variant!=='anonymous',initial:g});const h=await w.app.startBattle(w.request),changed=clone(w.content());
  if(variant==='anonymous')changed.species.Pidgey.baseExp+=1;else changed.meta.compiledSemantics=3;
  w.setContent(changed);const o=w.app.finishBattle(h,w.request);assert.equal(o.commit,'applied',variant);assert.equal(w.sessions.calls,0,variant);assert.equal(w.state.current().party[0].friendship,99);assert.deepEqual([w.state.current().party[0].readyToEvolve,w.state.current().party[0].evolutionReadiness],[true,'unknown']);assert(w.state.current().dex.owned.includes('Pidgey'));
 }
});
test('E2a exact replay needs neither current content nor capture templates nor a late effects lookup',async()=>{
 const w=world(),h=await w.app.startBattle(w.request),r=h.result();assert.equal(w.app.finishBattle(h,w.request).commit,'applied');const before=clone(w.state.current());w.blockContent();w.sessions.failEffects=true;
 assert.equal(w.app.commitResult(r),'already-applied');assert.equal(w.sessions.calls,1);assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,1);
 const bad={...r,unexpected:true};assert.throws(()=>w.app.commitResult(bad),/unexpected.*unknown field/);assert.deepEqual(w.state.current(),before);
});
test('E2a failed install retries the frozen source once; later repaired or changed source is never backfilled',async()=>{
 for(const unavailable of [false,true]){
  const w=world();w.sessions.failEffects=unavailable;const h=await w.app.startBattle(w.request),before=clone(w.state.current());w.state.failReplace=Error('synthetic prewrite failure');
  const first=w.app.finishBattle(h,w.request);assert.equal(first.pending,true);assert.equal(w.app.saveBlocked,true);assert.equal(w.sessions.calls,1);assert.deepEqual(w.state.current(),before);
  w.state.failReplace=null;w.sessions.failEffects=!unavailable;const second=w.app.resolveReceiving(first.receivingToken);assert.equal(second.commit,'applied');assert.equal(w.sessions.calls,1);assert.equal(w.state.replaced.length,1);assert.equal(w.state.current().party[0].friendship,unavailable?99:100);assert.equal(w.app.saveBlocked,false);
 }
});
test('E2a raw and receiving-pending paths validate every dex reference before fetching a source',async()=>{
 const w=world({builder:x=>({...capture(x),dex:{seen:['not-in-content'],owned:['Pidgey']}})}),h=await w.app.startBattle(w.request),before=clone(w.state.current());const o=w.app.finishBattle(h,w.request);
 assert.equal(o.commit,'none');assert.equal(o.aborted,true);assert.match(o.error,/has no persistent species key/);assert.equal(w.sessions.calls,0);assert.deepEqual(w.state.current(),before);assert.equal(w.app.saveBlocked,false);
});
test('E2a private owner covers replace and host projection; recursive finishing cannot release it',async()=>{
 let app,observed=0;const w=world({port:state=>({read:()=>state.read(),replace:next=>{assert.equal(app.saveBlocked,true);assert.throws(()=>app.beginManagement(),/operation-active/);observed++;state.replace(next);}})});app=w.app;
 const h=await app.startBattle(w.request);w.projection.project=()=>{assert.equal(app.saveBlocked,true);assert.equal(app.finishBattle(h,w.request).error,'battle-finish-active');assert.equal(app.saveBlocked,true);};
 const o=app.finishBattle(h,w.request);assert.equal(o.commit,'applied');assert.equal(observed,1);assert.equal(app.saveBlocked,false);
});
test('E2a postwrite host error is verified as complete installation and cannot pay a second time',async()=>{
 let writes=0;const w=world({port:state=>({read:()=>state.read(),replace:next=>{writes++;state.replace(next);throw Error('synthetic postwrite ACK failure');}})}),h=await w.app.startBattle(w.request);
 const o=w.app.finishBattle(h,w.request);assert.equal(o.commit,'applied');assert(o.diagnostics.some(s=>s.includes('完整安装')));assert.equal(w.app.finishBattle(h,w.request).commit,'already-applied');assert.equal(writes,1);assert.equal(w.sessions.calls,1);assert.equal(w.app.saveBlocked,false);
});
test('E2a a proved zero-write repeated failure can terminate, and its late handle cannot commit',async()=>{
 const w=world(),h=await w.app.startBattle(w.request),before=clone(w.state.current());w.state.failReplace=Error('synthetic repeated failure');const o=w.app.finishBattle(h,w.request);
 assert.equal(o.pending,true);assert.deepEqual(w.app.terminateBattleCommit(o.receivingToken),{status:'aborted'});assert.equal(w.app.saveBlocked,false);w.state.failReplace=null;assert.equal(w.app.finishBattle(h,w.request).error,'battle-commit-terminated');assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);
});
test('E2a an unproved partial host write stays blocked until complete save replacement; no blind retry',async()=>{
 let writes=0;const w=world({port:state=>({read:()=>state.read(),replace:next=>{writes++;const partial=clone(state.current());partial.money=next.money+1;state.replace(partial);throw Error('synthetic partial write');}})}),h=await w.app.startBattle(w.request),o=w.app.finishBattle(h,w.request);
 assert.equal(o.pending,true);assert.match(o.error,/did not|partial write/);assert.equal(w.app.saveBlocked,true);assert.equal(w.app.terminateBattleCommit(o.receivingToken).status,'reload-required');assert.equal(w.app.resolveReceiving(o.receivingToken).pending,true);assert.equal(writes,1);w.app.stateReplacedByHost();assert.equal(w.app.saveBlocked,false);assert.equal(w.app.finishBattle(h,w.request).commit,'none');assert.equal(writes,1);
});
test('E2a a started handle cannot relabel a valid raw result as another battle',async()=>{
 const w=world(),h=await w.app.startBattle(w.request),before=clone(w.state.current());w.sessions.created[0].raw.battleId='another-battle';
 const o=w.app.finishBattle(h,w.request);assert.equal(o.commit,'none');assert.match(o.error,/owner-mismatch/);assert.equal(w.sessions.calls,0);assert.deepEqual(w.state.current(),before);assert.equal(w.app.saveBlocked,false);
});
test('E2a a source callback that loads a new game cannot install or abort the new same-id battle',async()=>{
 const w=world(),h=await w.app.startBattle(w.request),effects=w.sessions.effects;let replacement,newHandle;
 w.sessions.effects=(...args)=>{const seal=effects(...args);replacement=E.fixtures.makeGame();replacement.money=1234;w.state.replace(replacement);w.app.stateReplacedByHost();newHandle=w.app.startBattle(w.request);return seal;};
 const old=w.app.finishBattle(h,w.request);assert.equal(old.commit,'none');assert.equal(old.aborted,true);assert.deepEqual(w.state.current(),replacement);assert.equal(w.state.replaced.length,1);assert.equal(w.app.saveBlocked,true);assert.equal(w.projection.outcomes.length,0);
 const fresh=await newHandle;assert.equal(w.app.saveBlocked,true);w.app.abortBattle(w.request,Error('end isolated replacement fixture'));assert.equal(w.app.saveBlocked,false);assert.equal(w.app.finishBattle(h,w.request).commit,'none');assert.deepEqual(w.state.current(),replacement);assert(fresh);
});
test('E2a legal primary friendship outside the auxiliary domain survives complete ACK evidence and exact replay',async()=>{
 for(const value of [256,Number.MAX_SAFE_INTEGER]){
  const w=world({builder:({request,game})=>raw(request.battleId,{members:{[game.party[0].id]:{friendship:value}},money:7})}),h=await w.app.startBattle(w.request),r=h.result();
  assert.equal(w.app.finishBattle(h,w.request).commit,'applied');assert.equal(w.state.current().party[0].friendship,value);assert.equal(w.sessions.calls,1);assert.equal(w.state.replaced.length,1);assert.deepEqual(E.saveSchema.validateGameContent(w.state.current(),w.content()),[]);
  assert.equal(w.state.current().appliedBattles[r.battleId].hash,E.state.resultHash(r));const before=clone(w.state.current());assert.equal(w.app.finishBattle(h,w.request).commit,'already-applied');assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.current(),before);
 }
});
