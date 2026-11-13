'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,acquireReady,E,clone,runtime,candidate,candidateBinding}=require('./support.cjs');
test.after(()=>{if(candidate)candidateBinding.verify(runtime,candidate.binding);});
for(const source of ['give','gift','grant','trade','capture-party','capture-box','capture-replace'])for(const mode of ['commit','abort','zero-write-retry'])test(`normal released source ${source} -> consume -> ${mode}`,async()=>{
 const w=fixture(source);assert(w.app.heldItemSourcesEnabled());await acquireReady(w);
 const before=clone(w.state.read()),writes=w.state.replaced.length,req={battleId:'H3-R-'+source+'-'+mode,seq:2,trainer:{id:'h3-npc',version:1},canLose:true,expGain:false,moneyGain:false};
 const h=await w.app.startTrainerBattle(req);assert.equal(h.party[0].item,'lumberry');assert((await h.chooseMove(1)).ok);const rest=await h.chooseMove(2);assert(rest.ok);assert.equal(rest.messages.flatMap(m=>m.kind==='events'?m.events:[]).filter(e=>e.type==='-enditem'&&e.args[1]==='Lum Berry').length,1);
 assert.deepEqual(w.state.read(),before);assert.equal(w.state.replaced.length,writes);
 if(mode==='abort'){w.app.abortBattle(req,Error('owned normal source abort'));assert.deepEqual(w.state.read(),before);assert.equal(w.state.replaced.length,writes);assert(!w.app.saveBlocked);return;}
 assert((await h.chooseMove(3)).ok);assert(h.finished);const raw=h.result();
 const replace=w.state.replace.bind(w.state);let attempts=0;if(mode==='zero-write-retry')w.state.replace=next=>{if(++attempts===1)throw Error('owned zero-write failure');return replace(next);};
 let out=w.app.finishBattle(h,req);if(mode==='zero-write-retry'){assert.equal(out.commit,'none');assert(out.pending);assert.deepEqual(w.state.read(),before);assert.equal(w.state.replaced.length,writes);out=w.app.resolveReceiving(out.receivingToken);}
 assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.state.replaced.length,writes+1);assert.equal(w.state.read().party[0].item,'');assert.deepEqual(w.state.read().inventory,before.inventory);
 assert.equal(w.state.read().stats.trainer_battles_won,before.stats.trainer_battles_won+1);assert.equal(w.state.read().dex.defeatedCounts.pidgey,(before.dex.defeatedCounts.pidgey??0)+1);
 assert.equal(w.state.read().appliedBattles[raw.battleId].hash,E.state.resultHash(raw));assert.match(w.state.read().appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);
 const installed=clone(w.state.read());assert.equal(w.app.finishBattle(h,req).commit,'already-applied');assert.deepEqual(w.state.read(),installed);assert.equal(w.state.replaced.length,writes+1);
});
