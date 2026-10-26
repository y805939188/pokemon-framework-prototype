'use strict';
// WP32 T4 / CX19. Valid application outcomes with explicit controlled V2 facts, not engine/NW observations.
const test=require('node:test'),assert=require('node:assert/strict'),{world,E,clone}=require('./fixtures/postbattle/helpers.cjs');
const endings=[['win',{kind:'win',winner:'Player'},1],['caught',null,2],['run',{kind:'run',winner:null},3],['loss',{kind:'win',winner:'Wild'},4],['tie',{kind:'tie',winner:null},4]];
for(const all of [false,true])for(const [name,outcome,code]of endings)for(const family of ['level','readiness'])test(`WP32 T4 / CX19 normal ${name}, all=${all}, ${family}`,async()=>{
 const readiness=family==='readiness',enabled=all||!['loss','tie'].includes(name),entries=readiness?[{method:'EventAfterDamageTaken',parameter:7,target:'Blastoise'}]:[{method:'Level',parameter:51,target:'Blastoise'}];
 const w=world({entries,settings:{CHECK_EVOLUTION_AFTER_ALL_BATTLES:all},...(readiness?{damage:49,patch:{level:50,exp:E.growth.minExp('parabolic',50)}}:{})});w.request.canLose=true;
 const h=await w.app.startBattle(w.request),made=w.sessions.created[0];if(outcome)made.result.outcome=outcome;else{const foe=made.setup.foes[0];Object.assign(made.result,{outcome:{kind:'caught',winner:null,target:foe.id,ball:'masterball'},bag:{masterball:-1},captured:[E.state.protocolMember({...foe,ball:'masterball'})]});}
 const raw=h.result(),done=w.app.finishBattle(h,w.request),member=w.state.current().party[0];assert.equal(done.commit,'applied');assert.equal(done.code,code);assert.equal(member.level,readiness?50:51);assert.equal(w.sessions.calls,1);assert.equal(w.state.replaced.length,1);assert.equal(w.state.current().appliedBattles[raw.battleId].hash,E.state.resultHash(raw));
 if(readiness){assert.deepEqual([member.readyToEvolve,member.evolutionReadiness],[enabled,'known']);assert.equal(w.app.pendingEvolution,null);}
 else{assert.equal(!!w.app.pendingEvolution,enabled);if(enabled){const p=w.app.pendingEvolution;assert.equal(p.selection.family,'level');w.app.resolveEvolution(p.token,p.revision,{kind:'cancel'});}}
 if(name==='caught')assert.equal(w.state.current().dex.capturedCounts.Pidgey,1);
 const installed=clone(w.state.current()),writes=w.state.replaced.length;assert.equal(w.app.finishBattle(h,w.request).commit,'already-applied');assert.deepEqual(w.state.current(),installed);assert.equal(w.state.replaced.length,writes);assert.equal(w.sessions.calls,1);assert(!w.app.saveBlocked);assert.deepEqual(E.saveSchema.validateGameContent(installed,w.content),[]);
});
for(const all of [false,true])test(`WP32 T4 technical abort0 is not a normal ending, all=${all}`,async()=>{
 const w=world({settings:{CHECK_EVOLUTION_AFTER_ALL_BATTLES:all},damage:49}),before=clone(w.state.current()),h=await w.app.startBattle(w.request);const out=w.app.abortBattle(w.request,Error('deliberate technical abort'));
 assert.equal(out.code,0);assert.equal(out.commit,'none');assert(out.aborted);assert.equal(w.app.finishBattle(h,w.request).commit,'none');assert.deepEqual(w.state.current(),before);assert.equal(w.sessions.calls,0);assert.equal(w.state.replaced.length,0);assert(!w.app.pendingEvolution&&!w.app.saveBlocked);
});
