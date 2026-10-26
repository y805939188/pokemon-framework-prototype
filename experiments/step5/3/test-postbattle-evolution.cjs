'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{world,E,clone}=require('./fixtures/postbattle/helpers.cjs');
const valid=w=>assert.deepEqual(E.saveSchema.validateGameContent(w.state.current(),w.content),[]);
test('postbattle: primary and prefix readiness install under reserved owner; evolution and each move resume without replay',async()=>{
 const observed=[];const w=world({targetMoves:['Tackle','Gust'],port:(state,app)=>({read:()=>state.read(),replace:next=>{observed.push(app().saveBlocked);state.replace(next);}})}),{h,outcome}=await w.finish();
 assert.equal(outcome.commit,'applied');assert.equal(outcome.pending,true);assert.equal(w.state.replaced.length,1);assert.equal(w.state.current().party[0].species,'Charizard');assert.equal(w.app.saveBlocked,true);assert.equal(w.projection.outcomes.length,0);
 const raw=h.result(),pending=w.app.pendingEvolution;assert.equal(pending.phase,'evolution');assert.equal(pending.selection.target.species,'Blastoise');
 await assert.rejects(()=>w.app.startBattle({...w.request,battleId:'blocked'}),/evolution-operation-active/);assert.throws(()=>w.app.beginManagement(),/operation-active/);assert.throws(()=>w.app.beginInventoryOperation(),/operation-active/);
 assert.equal(w.app.finishBattle(h,w.request).continuationToken,pending.token);assert.equal(w.state.replaced.length,1);
 const evolved=w.answer({kind:'complete'});assert.equal(evolved.pending,true);assert.equal(w.app.pendingEvolution.phase,'learning');assert.equal(w.state.current().party[0].species,'Blastoise');assert.equal(w.state.current().stats.evolution_count,1);assert.equal(w.state.replaced.length,2);assert(w.state.current().dex.owned.includes('Blastoise'));
 assert.equal(w.app.resolveEvolution(pending.token,pending.revision,{kind:'complete'}).reason,'stale-decision');
 const one=w.answer({kind:'learn',answer:{kind:'replace',slot:0}});assert.equal(one.pending,true);assert.equal(w.state.current().party[0].moves[0].id,'tackle');assert.equal(w.state.replaced.length,3);
 const done=w.answer({kind:'learn',answer:{kind:'decline',giveUp:true}});assert.equal(done.commit,'applied');assert.equal(done.pending,undefined);assert.equal(w.app.pendingEvolution,null);assert.equal(w.app.saveBlocked,false);assert.equal(w.state.current().stats.evolution_count,1);assert.equal(w.sessions.calls,1);assert.equal(w.state.replaced.length,3);assert.equal(w.projection.outcomes.length,1);assert(observed.every(Boolean));
 assert.equal(w.state.current().appliedBattles[raw.battleId].hash,E.state.resultHash(raw));assert.equal(w.app.finishBattle(h,w.request).commit,'already-applied');assert.equal(w.state.replaced.length,3);valid(w);
});
test('postbattle: declining then confirming give-up replaces the same pending answer, and invalid answers do not poison history',async()=>{
 const w=world({targetMoves:['Tackle']});await w.finish();w.answer({kind:'complete'});
 assert.equal(w.answer({kind:'learn',answer:{kind:'replace',slot:99}}).status,'refused');assert.equal(w.app.pendingEvolution.phase,'learning');
 w.answer({kind:'learn',answer:{kind:'decline'}});assert.equal(w.app.pendingEvolution.learning.kind,'give-up');
 const done=w.answer({kind:'learn',answer:{kind:'decline',giveUp:true}});assert.equal(done.pending,undefined);assert.equal(w.state.current().party[0].species,'Blastoise');assert.equal(w.state.current().party[0].moves.some(m=>m.id==='tackle'),false);assert.equal(w.state.current().stats.evolution_count,1);assert.equal(w.app.saveBlocked,false);
});
test('postbattle: selected upgrade cancellation never falls through to critical achievement or automatic chains',async()=>{
 const w=world({entries:[{method:'Level',parameter:51,target:'Blastoise'},{method:'BattleDealCriticalHit',parameter:3,target:'Venusaur'}],critical:3,extraContent:c=>{c.species.Blastoise.evolutions=[{method:'Level',parameter:1,target:'Venusaur'}];}});await w.finish();
 const done=w.answer({kind:'cancel'});assert.equal(done.pending,undefined);assert.equal(w.state.current().party[0].species,'Charizard');assert.equal(w.state.current().stats.evolutions_cancelled,1);assert.equal(w.state.current().stats.evolution_count,0);assert.equal(w.app.saveBlocked,false);
 const yes=world({extraContent:c=>{c.species.Blastoise.evolutions=[{method:'Level',parameter:1,target:'Venusaur'}];}});await yes.finish();yes.answer({kind:'complete'});assert.equal(yes.state.current().party[0].species,'Blastoise');assert.equal(yes.app.pendingEvolution,null);assert.equal(yes.state.current().stats.evolution_count,1);
});
test('postbattle: complete D plan earns R with primary; unavailable upgrade family skips only its complete member plan',async()=>{
 const entry={method:'EventAfterDamageTaken',parameter:7,target:'Blastoise'};
 const w=world({entries:[entry],damage:49,patch:{level:50,exp:E.growth.minExp('parabolic',50)}});const{outcome}=await w.finish();assert.equal(outcome.pending,undefined);assert.equal(w.state.replaced.length,1);assert.deepEqual([w.state.current().party[0].readyToEvolve,w.state.current().party[0].evolutionReadiness],[true,'known']);valid(w);
 const x=world({entries:[{method:'LevelRain',parameter:1,target:'Blastoise'},entry],damage:49});const{outcome:o}=await x.finish();assert.equal(o.pending,undefined);assert.equal(x.state.current().party[0].readyToEvolve,false);assert(o.diagnostics.some(d=>d.includes('weather')));assert.equal(x.app.saveBlocked,false);assert.equal(x.state.current().party[0].level,51);
});
test('postbattle: canLose pair uses the correct pre/post-heal fainted gate and late defeat healing clears R',async()=>{
 for(const canLose of [false,true]){
  const w=world({settings:{CHECK_EVOLUTION_FOR_FAINTED_POKEMON:false},patch:{hp:0}});w.request.canLose=canLose;
  const h=await w.app.startBattle(w.request);w.sessions.created[0].result.outcome={kind:'win',winner:'Wild'};const result=w.app.finishBattle(h,w.request);
  assert(w.state.current().party[0].hp>0);assert(result.defeat.moneyLost>0);assert.equal(!!result.pending,canLose);assert.equal(w.state.replaced.length,1);
  if(canLose)w.answer({kind:'technical-terminate'});assert.equal(w.app.saveBlocked,false);valid(w);
 }
 const x=world({entries:[{method:'EventAfterDamageTaken',parameter:7,target:'Blastoise'}],damage:49});const h=await x.app.startBattle(x.request);x.sessions.created[0].result.outcome={kind:'win',winner:'Wild'};x.app.finishBattle(h,x.request);assert.deepEqual([x.state.current().party[0].readyToEvolve,x.state.current().party[0].evolutionReadiness],[false,'known']);
});
test('postbattle: later party checks read preceding evolution; completed initial snapshot never includes new extra entities',async()=>{
 const initial=E.fixtures.makeGame(),second={...clone(initial.party[0]),id:'second',species:'Venusaur',ability:'Overgrow'};initial.party.push(second);
 const w=world({initial,extraContent:c=>{c.species.Venusaur.evolutions=[{method:'HasInParty',parameter:'Blastoise',target:'Snorlax'}];}});
 const h=await w.app.startBattle(w.request);w.sessions.created[0].result.members.second={level:51,exp:E.growth.minExp('parabolic',51)};w.app.finishBattle(h,w.request);
 assert.equal(w.app.pendingEvolution.memberId,initial.party[0].id);w.answer({kind:'complete'});assert.equal(w.app.pendingEvolution.memberId,'second');assert.equal(w.app.pendingEvolution.selection.target.species,'Snorlax');w.answer({kind:'complete'});assert.equal(w.state.current().party.find(m=>m.id==='second').species,'Snorlax');assert.equal(w.state.current().stats.evolution_count,2);assert.equal(w.app.pendingEvolution,null);valid(w);
 const x=world({entries:[{method:'Ninjask',parameter:51,target:'Blastoise'},{method:'Shedinja',target:'Pidgey'}],extraContent:c=>{c.species.Pidgey.evolutions=[{method:'Level',parameter:1,target:'Snorlax'}];}}),ids=x.state.current().party.map(m=>m.id),pid=x.state.current().party[0].personalID;
 await x.finish();x.answer({kind:'complete'});const extra=x.state.current().party.find(m=>!ids.includes(m.id));assert(extra);assert.equal(extra.species,'Pidgey');assert.equal(extra.personalID,pid);assert.equal(x.state.current().stats.evolution_count,1);assert.equal(x.app.pendingEvolution,null);valid(x);
});
test('postbattle: level priority unknown does not suppress another member or let world provider forge private critical count',async()=>{
 const initial=E.fixtures.makeGame();initial.party.push({...clone(initial.party[0]),id:'second',species:'Venusaur',ability:'Overgrow'});
 const w=world({initial,critical:3,entries:[{method:'LevelRain',parameter:1,target:'Blastoise'},{method:'BattleDealCriticalHit',parameter:3,target:'Snorlax'}],extraContent:c=>{c.species.Venusaur.evolutions=[{method:'Level',parameter:1,target:'Blastoise'}];}}),h=await w.app.startBattle(w.request);w.sessions.created[0].result.members.second={level:51,exp:E.growth.minExp('parabolic',51)};w.app.finishBattle(h,w.request);
 assert.equal(w.app.pendingEvolution.memberId,'second');w.answer({kind:'complete'});assert.equal(w.state.current().party[0].species,'Charizard');assert.equal(w.state.current().party.find(m=>m.id==='second').species,'Blastoise');assert.equal(w.app.saveBlocked,false);
 const x=world({critical:0,entries:[{method:'BattleDealCriticalHit',parameter:3,target:'Blastoise'}],worldFacts:()=>({criticalHits:{status:'value',value:999}})});assert.equal((await x.finish()).outcome.pending,undefined);assert.equal(x.state.current().stats.evolution_count,0);
});
test('postbattle: zero-write evolution failure retries original plan once; unknown partial write cannot terminate unsafely',async()=>{
 const w=world();await w.finish();const primary=clone(w.state.current());w.state.failReplace=Error('synthetic evolution install failure');const failed=w.answer({kind:'complete'});assert.equal(failed.pending,true);assert.equal(w.app.pendingEvolution.phase,'failed');assert.deepEqual(w.state.current(),primary);assert.equal(w.state.replaced.length,1);w.state.failReplace=null;const done=w.answer({kind:'retry'});assert.equal(done.pending,undefined);assert.equal(w.state.current().stats.evolution_count,1);assert.equal(w.state.replaced.length,2);assert.equal(w.app.saveBlocked,false);
 let partial=false;const x=world({port:(state)=>({read:()=>state.read(),replace:next=>{if(partial){const broken=clone(state.current());broken.money++;state.replace(broken);throw Error('synthetic partial');}state.replace(next);}})});await x.finish();const good=clone(x.state.current());partial=true;x.answer({kind:'complete'});assert.equal(x.app.pendingEvolution.reloadRequired,true);assert.match(x.answer({kind:'technical-terminate'}).reason,/reload-required/);assert.equal(x.app.saveBlocked,true);x.state.replace(good);x.app.stateReplacedByHost();assert.equal(x.app.saveBlocked,false);assert.equal(x.app.pendingEvolution,null);
});
test('postbattle: postwrite error verifies full evolution; technical termination preserves committed primary and species',async()=>{
 let fail=false;const w=world({port:state=>({read:()=>state.read(),replace:next=>{state.replace(next);if(fail)throw Error('synthetic host ACK');}})});await w.finish();fail=true;const done=w.answer({kind:'complete'});assert.equal(done.pending,undefined);assert.equal(w.state.current().stats.evolution_count,1);assert.equal(w.state.replaced.length,2);assert(done.diagnostics.some(d=>d.includes('host-error')));
 const x=world({targetMoves:['Tackle','Gust']});await x.finish();x.answer({kind:'complete'});const before=clone(x.state.current());const o=x.answer({kind:'technical-terminate'});assert.equal(o.pending,undefined);assert.deepEqual(x.state.current(),before);assert.equal(x.state.current().party[0].species,'Blastoise');assert.equal(x.state.current().stats.evolution_count,1);assert.equal(x.state.current().stats.evolutions_cancelled,0);assert.equal(x.app.saveBlocked,false);
});
test('postbattle: technical termination after lost readback never installs unrequested later learning',async()=>{
 let lost=false;const w=world({targetMoves:['Tackle'],port:state=>({read:()=>{if(lost)throw Error('synthetic lost readback');return state.read();},replace:next=>{state.replace(next);if(next.party[0].species==='Blastoise')lost=true;}})});await w.finish();const failed=w.answer({kind:'complete'});assert.equal(failed.pending,true);assert.equal(w.state.replaced.length,2);lost=false;
 const installed=clone(w.state.current()),done=w.answer({kind:'technical-terminate'});assert.equal(done.pending,undefined);assert.deepEqual(w.state.current(),installed);assert.equal(w.state.replaced.length,2);assert.equal(w.state.current().party[0].moves.some(m=>m.id==='tackle'),false);assert.equal(w.app.saveBlocked,false);
});
test('postbattle: reception replacement cannot lend the boxed old member K/L0 to its new party slot',async()=>{
 const initial=E.fixtures.makeGame();while(initial.party.length<6)initial.party.push({...clone(initial.party[0]),id:'extra-'+initial.party.length});
 const w=world({initial,critical:3,entries:[{method:'BattleDealCriticalHit',parameter:3,target:'Blastoise'}],extraContent:c=>{c.species.Pidgey.evolutions=[{method:'BattleDealCriticalHit',parameter:3,target:'Snorlax'},{method:'Level',parameter:1,target:'Snorlax'}];}});w.request.forceParty=true;
 const h=await w.app.startBattle(w.request),made=w.sessions.created[0],foe=made.setup.foes[0],old=initial.party[0].id;
 Object.assign(made.result,{outcome:{kind:'caught',winner:null,target:foe.id,ball:'masterball'},bag:{masterball:-1},captured:[E.state.protocolMember({...foe,ball:'masterball'})]});
 const pending=w.app.finishBattle(h,w.request);assert(pending.pending);assert.equal(w.state.replaced.length,0);
 const done=w.app.resolveReceiving(pending.receivingToken,{[foe.id]:{placement:{kind:'replace',target:{id:old,position:{kind:'party',index:0}}}}});
 assert.equal(done.commit,'applied');assert.equal(done.pending,undefined);assert.equal(w.state.current().party[0].id,foe.id);assert.equal(w.state.current().party[0].species,'Pidgey');assert.equal(w.state.current().stats.evolution_count,0);assert.equal(E.storage.locateMember(w.state.current(),old).position.kind,'box');assert.equal(w.app.saveBlocked,false);valid(w);
});
test('postbattle: selection locks world facts, while reload invalidates old revisions without touching a new battle',async()=>{
 let hour=12;const w=world({entries:[{method:'LevelDay',parameter:1,target:'Blastoise'}],worldFacts:()=>({hour:{status:'value',value:hour}})});const{h}=await w.finish();hour=1;assert.equal(w.answer({kind:'complete'}).pending,undefined);assert.equal(w.state.current().party[0].species,'Blastoise');assert.equal(w.state.current().stats.evolution_count,1);
 const x=world();await x.finish();const old=x.app.pendingEvolution;x.app.stateReplacedByHost();const next=await x.app.startBattle({...x.request,battleId:'new-generation'});assert.equal(x.app.resolveEvolution(old.token,old.revision,{kind:'complete'}).reason,'stale-evolution-operation');assert.equal(x.app.saveBlocked,true);x.app.abortBattle({battleId:'new-generation'},Error('end fixture'));assert.equal(x.app.saveBlocked,false);assert(next&&h);
});
