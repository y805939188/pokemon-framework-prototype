'use strict';
// M1 intersections. Real default sessions except the explicitly synthetic receiving vector.
// The host injects only persistent state/install/checkpoint ports; no private engine access.
const assert=require('node:assert/strict');
const clone=x=>JSON.parse(JSON.stringify(x));
function content(E,sourceSha){
 const c=clone(E.fixtures.content),dex=E.dex.createDexLookup();
 for(const [id,sp]of Object.entries(c.species)){const d=dex.species(id);Object.assign(sp,{abilities:d.abilities,hiddenAbilities:d.hiddenAbilities,gender:d.gender});}
 c.moves={};for(const id of ['substitute','surgingstrikes','splash','tackle','rest','flamethrower','airslash','dragonpulse','roost','hydropump','icebeam','flashcannon','protect','gigadrain','sludgebomb','earthquake','synthesis']){const m=dex.move(id);c.moves[m.name]=m;}
 c.species.Charizard.learnset={1:['Substitute']};c.species.Charizard.evolutions=[{method:'EventAfterDamageTaken',parameter:7,target:'Blastoise'}];
 c.species.Blastoise.learnset={1:['Tackle']};c.species.Pidgey.learnset={1:['Splash']};c.species.Snorlax.learnset={1:['Surging Strikes']};
 c.settings={SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN:false};
 const inputsHash=E.digest.sha256Hex(E.contentCompile.canonicalJson(c)),compiledSemantics=E.contentSchema.COMPILED_SCHEMA_VERSION;
 c.meta={kind:'fixture',id:'M1-convergence',compiledSemantics,inputsHash,showdownSha:sourceSha,contentIdentity:E.digest.sha256Hex(E.contentCompile.canonicalJson({compiledSemantics,inputsHash,showdownSha:sourceSha}))};return c;
}
function fixture(E,sourceSha,host={},options={}){
 const c=content(E,sourceSha),hero=E.memberFactory.createMember({id:'M1-ORIGINAL',species:'Charizard',level:100,nature:'hardy',gender:'M'},c,n=>n-1);
 // Full IV31 player, zero EV. The ordinary opponent factory uses its own deterministic IV draws; this is not the old PX D68 fixture.
 hero.ivs={hp:31,atk:31,def:31,spa:31,spd:31,spe:31};hero.hp=E.growth.computeStats(c.species.Charizard.base,hero.ivs,hero.evs,100,hero.nature).hp;hero.friendship=99;
 const backup=E.memberFactory.createMember({id:'M1-BACKUP',species:'Venusaur',level:50},c,()=>0),initial=E.state.newGame({party:[hero,backup],bag:{masterball:2,potion:2},money:1000,content:c});
 initial.dex.hasDex=true;if(options.oldReady){Object.assign(initial.party[0],{readyToEvolve:true,evolutionReadiness:'known',hp:50});}
 const trusted=clone(c.meta);if(options.anonymous)delete c.meta;
 let state=initial,writes=0;host.install?.(c,clone(initial));const read=()=>host.read?host.read():state;
 const replace=next=>{writes++;if(host.replace)host.replace(next);else state=next;};
 const sessions=E.composition.createBattleSessionFactory({content:()=>c,seed:()=>[1,2,3,4]}),effects=sessions.effects,seals=[];let calls=0;
 sessions.effects=(...args)=>{calls++;const s=effects(...args);seals.push(clone(s));return s;};
 const app=new E.app.GameApplication({state:{read,replace},content:()=>({content:c}),sessions,projection:{project:()=>{}},random:()=>0,clock:()=>0,itemWorld:()=>({mapId:0})},{receivingProfile:{mode:1,naming:1}});host.bind?.(app,c);
 return{c,app,read,replace,seals,heroId:hero.id,restoreIdentity:()=>{c.meta=clone(trusted);},calls:()=>calls,writes:()=>writes,checkpoint:async(label,result)=>{assert.deepEqual(E.saveSchema.validateGameContent(read(),c),[]);assert(!app.saveBlocked);return host.checkpoint?.(label,{app,content:c,state:clone(read()),result:clone(result)});}};
}
function drain(app){for(let n=0;n<12&&app.pendingPokedex;n++){const p=app.pendingPokedex;assert.notEqual(p.phase,'failed');const r=app.resolvePokedex(p.token,p.revision,{kind:p.phase==='message'?'message-complete':'close-entry'});assert.notEqual(r.status,'refused');}assert(!app.pendingPokedex);}
function original(w){const s=w.read();return s.party.find(m=>m.id===w.heroId)??s.storage.boxes.flatMap(b=>b.slots).find(m=>m?.id===w.heroId);}
async function actualDamage(E,sourceSha,host){
 const w=fixture(E,sourceSha,host),request={battleId:'M1-real-D',kind:'wild',seq:1,foes:[{species:'Snorlax',level:50}]},h=await w.app.startBattle(request);
 assert.equal((await h.chooseMove(1)).ok,true);assert.equal((await h.throwBall('masterball')).ok,true);
 const raw=h.result(),done=w.app.finishBattle(h,request);assert.equal(done.commit,'applied');assert(w.app.pendingPokedex);assert(w.app.saveBlocked);
 const damage=w.seals[0].observer.members[w.heroId].damage;assert.equal(damage.status,'complete');assert.deepEqual(damage.value,{total:62,resetCoverage:'complete'});
 assert.deepEqual([original(w).readyToEvolve,original(w).evolutionReadiness],[true,'known']);assert.equal(original(w).species,'Charizard');
 assert.equal(w.read().stats.evolution_count,0);assert.equal(w.read().dex.capturedCounts.Snorlax,1);assert.equal(w.read().appliedBattles[raw.battleId].hash,E.state.resultHash(raw));
 await host?.blocked?.('capture-Info');drain(w.app);assert(!w.app.pendingEvolution&&!w.app.saveBlocked);
 const before=clone(w.read()),selected=w.app.beginEventEvolution({event:7,memberId:w.heroId});assert.equal(selected.status,'pending');assert(w.app.saveBlocked);assert.deepEqual(w.read(),before);await host?.blocked?.('event-selection');
 const p=w.app.pendingEvolution,r=w.app.resolveEvolution(p.token,p.revision,{kind:'cancel'});assert.equal(r.result.matched,true);assert.equal(r.result.evolved,false);const cancelled=clone(before);cancelled.stats.evolutions_cancelled++;assert.deepEqual(w.read(),cancelled);assert(!w.app.saveBlocked);
 assert.equal(w.app.commitResult(raw),'already-applied');assert.deepEqual(w.read(),cancelled);assert.equal(w.calls(),1);await w.checkpoint('actual-D-ready',raw);
 return{kind:'real default Showdown/session/application D=62; event selection cancelled explicitly',damage:damage.value.total,state:clone(w.read()),content:clone(w.c)};
}
async function unknownReadiness(E,sourceSha,host){
 const w=fixture(E,sourceSha,host,{oldReady:true,anonymous:true}),request={battleId:'M1-untrusted-source',kind:'wild',seq:1,foes:[{species:'Pidgey',level:5}]},h=await w.app.startBattle(request),xp=original(w).exp;
 assert.equal((await h.useItem('potion',w.heroId)).ok,true);assert.equal((await h.throwBall('masterball')).ok,true);const raw=h.result();assert(h.party[0].friendship>99);
 const done=w.app.finishBattle(h,request);assert.equal(done.commit,'applied');assert(w.app.pendingPokedex,'trusted primary capture may offer ordinary Info');assert.equal(w.calls(),0,'missing content authority must not fetch an auxiliary source');
 assert.deepEqual([original(w).readyToEvolve,original(w).evolutionReadiness,original(w).friendship],[true,'unknown',99]);assert.equal(original(w).exp,xp,'level100 fixture remains capped, not a claim about gained XP');
 const captured=w.read().party.at(-1);assert.equal(captured.species,'Pidgey');assert.equal(w.read().dex.capturedCounts.Pidgey,1);assert.equal(w.read().appliedBattles[raw.battleId].hash,E.state.resultHash(raw));
 drain(w.app);assert(!w.app.saveBlocked);assert.deepEqual([original(w).readyToEvolve,original(w).evolutionReadiness,original(w).friendship],[true,'unknown',99]);
 w.restoreIdentity();const before=clone(w.read()),blocked=w.app.beginEventEvolution({event:7,memberId:w.heroId});assert.equal(blocked.status,'unchanged');assert(blocked.result.diagnostics.length);assert.deepEqual(w.read(),before,'valid current content cannot backfill this battle');
 const t=w.app.beginManagement(),m=w.app.manage(t,'deposit',{kind:'move',source:{id:w.heroId,position:{kind:'party',index:0}},target:{kind:'box',box:0,slot:0},expectedTargetId:null});assert.equal(m.status,'applied');w.app.endManagement(t);
 assert(original(w).hp>50);assert.deepEqual([original(w).readyToEvolve,original(w).evolutionReadiness],[true,'unknown']);assert.equal(w.calls(),0);await w.checkpoint('unknown-R-deposited',raw);
 // A normal withdraw is another existing owner, not a synthesized readiness repair.
 const t2=w.app.beginManagement(),n=w.app.manage(t2,'withdraw',{kind:'move',source:{id:w.heroId,position:{kind:'box',box:0,slot:0}},target:{kind:'party',index:w.read().party.length},expectedTargetId:null});assert.equal(n.status,'applied');w.app.endManagement(t2);
 const unchanged=clone(w.read());assert.equal(w.app.beginEventEvolution({event:7,memberId:w.heroId}).status,'unchanged');assert.deepEqual(w.read(),unchanged);
 assert.equal(w.app.recoverAll().status,'healed');assert.deepEqual([original(w).readyToEvolve,original(w).evolutionReadiness],[false,'known']);assert.equal(w.read().dex.capturedCounts.Pidgey,1);assert.equal(w.app.commitResult(raw),'already-applied');await w.checkpoint('unknown-R-ordinary-recovery',raw);
 return{kind:'real default capture/item; deliberately missing authority; Info/storage/recovery; no synthetic battle facts',calls:w.calls(),state:clone(w.read()),content:clone(w.c)};
}
module.exports={actualDamage,unknownReadiness};
