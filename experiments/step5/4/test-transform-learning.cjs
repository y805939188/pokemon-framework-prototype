'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./transform-learning-fixtures.cjs'),{E,open,actor,unchanged,cleanup,transform,knockout,dense,clone}=F;
for(const copied of [1,2,3])test('actual Transform with permanent four/copy '+copied+' survives exact checkpoint and remains playable',async()=>{
 const w=await open({copied,learnMoves:[]});try{
  await transform(w);const before=JSON.parse(w.s.gw.snapshot()),request=clone(w.s.currentRequest()),permanent=clone(w.s.gw.readState('p1'));
  await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(JSON.parse(w.s.gw.snapshot()),before);assert.deepEqual(w.s.currentRequest(),request);assert.deepEqual(w.s.gw.readState('p1'),permanent);
  assert.equal(actor(w).moveSlots.length,copied);assert.equal(actor(w).baseMoveSlots.length,4);dense(w);
  const pp=actor(w).moveSlots[0].pp;assert((await w.s.chooseMove(1)).ok);assert.equal(actor(w).moveSlots[0].pp,pp-1);assert.equal(w.s.gw.readState('p1')[0].pp.splash,40);unchanged(w);
 }finally{cleanup(w);}
});
for(const switchTo of [null,'P2'])test('normal Switch replacement preview and target clone after Transform, answer '+switchTo,async()=>{
 const w=await open({replacement:true,learnMoves:[]});try{
  const copied=await transform(w);await knockout(w);let offer=E.session.readTrainerReplacement(w.s);assert(offer);assert.equal(offer.playerId,'P1');assert.equal(offer.opponentSpecies,'Pidgey');
  assert.deepEqual(E.session.readTrainerReplacementTarget(w.s,offer.offerId,'P2'),{ok:true});
  const oldId=offer.offerId;await w.s._restoreCheckpoint(w.s._checkpoint());offer=E.session.readTrainerReplacement(w.s);assert(offer&&offer.offerId!==oldId);
  assert.deepEqual(await E.session.resolveTrainerReplacement(w.s,oldId,null),{ok:false,reason:'choice-rejected'});
  assert((await E.session.resolveTrainerReplacement(w.s,offer.offerId,switchTo)).ok);dense(w);assert.equal(w.s.gw.activeId('p1'),switchTo??'P1');
  if(switchTo===null){assert.equal(actor(w).transformed,true);assert.deepEqual(actor(w).storedStats,copied);}else{assert.equal(actor(w).transformed,false);assert.equal(actor(w).moveSlots.length,4);}
  unchanged(w);
 }finally{cleanup(w);}
});
for(const slot of [2,3])test('normal Transform learn prompt permanent slot '+slot+' stays dense through use, restore, switch and once-only commit',async()=>{
 const w=await open();try{
  const copied=await transform(w);await knockout(w);assert.equal(w.s.pendingLearn.move.id,'rest');assert.equal(w.s.party[0].level,51);
  const out=await w.s.decideLearn(slot);assert(out.some(m=>m.kind==='learned'&&m.move==='rest'));dense(w);
  assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','rest']);assert.deepEqual(actor(w).storedStats,copied);assert.equal(w.s.party[0].moves[slot].id,'rest');
  await w.s._restoreCheckpoint(w.s._checkpoint());dense(w);
  assert((await w.s.chooseMove(3)).ok);assert.equal(actor(w).moveSlots[2].pp,9);assert.equal(w.s.gw.readState('p1')[0].pp.rest,10);unchanged(w);
  for(let i=0;i<4&&actor(w).status==='slp';i++)assert((await w.s.chooseMove(1)).ok);assert.notEqual(actor(w).status,'slp','natural sleep ends before switch-back PP use');
  assert((await w.s.chooseSwitch('P2')).ok);assert((await w.s.chooseSwitch('P1')).ok);dense(w);
  assert.equal(actor(w).transformed,false);assert.deepEqual(w.s.currentRequest().active[0].moves.map(m=>m.id),w.s.party[0].moves.map(m=>m.id));assert.equal(actor(w).moveSlots.length,4);
  assert((await w.s.chooseMove(slot+1)).ok);assert.equal(w.s.gw.readState('p1')[0].pp.rest,9);assert.equal(w.s.party[0].moves[slot].pp,9);
  assert((await w.s.chooseSwitch('P2')).ok);const tackle=w.s.currentRequest().active[0].moves.findIndex(m=>m.id==='tackle')+1;assert((await w.s.chooseMove(tackle)).ok);assert(w.s.finished);unchanged(w);
  const result=w.s.result(),outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied');const saved=clone(w.state.read());assert.equal(w.state.replaced.length,1);assert.equal(saved.party[0].moves[slot].id,'rest');assert.equal(saved.party[0].moves[slot].pp,9);assert.equal(saved.party[0].species,'mew');
  assert.equal(saved.appliedBattles[w.request.battleId].hash,E.state.resultHash(result));w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);
 }finally{cleanup(w);}
});
for(const learnMoves of [['rest'],['rest','amnesia','agility']])test('normal Transform append exposes '+(4+learnMoves.length)+' temporary moves without changing permanent PP',async()=>{
 const w=await open({own:1,copied:4,learnMoves});try{
  const copied=await transform(w);await knockout(w);dense(w);assert.equal(w.s.pendingLearn,null);assert.equal(w.s.party[0].moves.length,1+learnMoves.length);
  assert.deepEqual(w.s.currentRequest().active[0].moves.map(m=>m.id),['splash','seismictoss','growl','tailwhip',...learnMoves]);assert.deepEqual(actor(w).storedStats,copied);
  const before=JSON.parse(w.s.gw.snapshot());await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(JSON.parse(w.s.gw.snapshot()),before);
  const last=learnMoves.at(-1),pp=w.s.gw.readState('p1')[0].pp[last];assert((await w.s.chooseMove(4+learnMoves.length)).ok);assert.equal(actor(w).moveSlots.at(-1).pp,pp-1);assert.equal(w.s.gw.readState('p1')[0].pp[last],pp);unchanged(w);
  assert((await w.s.chooseSwitch('P2')).ok);assert((await w.s.chooseSwitch('P1')).ok);assert.equal(actor(w).transformed,false);assert.deepEqual(w.s.currentRequest().active[0].moves.map(m=>m.id),['transform',...learnMoves]);dense(w);unchanged(w);
 }finally{cleanup(w);}
});

test('relearning the same out-of-range permanent slot replaces its earlier virtual copy after checkpoint',async()=>{
 const w=await open({learnMoves:['rest','amnesia']});try{
  await transform(w);await knockout(w);assert.equal(w.s.pendingLearn.move.id,'rest');await w.s.decideLearn(3);assert.equal(w.s.pendingLearn.move.id,'amnesia');assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','rest']);
  await w.s._restoreCheckpoint(w.s._checkpoint());await w.s.decideLearn(3);dense(w);assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','amnesia']);assert.equal(w.s.party[0].moves[3].id,'amnesia');assert.equal(w.s.gw.readState('p1')[0].pp.rest,undefined);unchanged(w);
 }finally{cleanup(w);}
});
test('replacing an automatically learned permanent move updates its appended virtual identity, not a copied slot',async()=>{
 const w=await open({own:3,copied:4,learnMoves:['rest','amnesia']});try{
  await transform(w);await knockout(w);assert.equal(w.s.pendingLearn.move.id,'amnesia');assert.equal(w.s.party[0].moves[3].id,'rest');assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','growl','tailwhip','rest']);
  await w.s._restoreCheckpoint(w.s._checkpoint());await w.s.decideLearn(3);dense(w);assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','growl','tailwhip','amnesia']);assert.equal(w.s.party[0].moves[3].id,'amnesia');unchanged(w);
 }finally{cleanup(w);}
});

test('sequential different permanent replacements preserve the earlier densely appended virtual move',async()=>{
 const w=await open({learnMoves:['rest','amnesia']});try{
  await transform(w);await knockout(w);assert.equal(w.s.pendingLearn.move.id,'rest');await w.s.decideLearn(3);assert.equal(w.s.pendingLearn.move.id,'amnesia');assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','rest']);
  await w.s._restoreCheckpoint(w.s._checkpoint());await w.s.decideLearn(2);dense(w);assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','rest','amnesia']);assert.deepEqual(w.s.party[0].moves.map(m=>m.id),['transform','splash','amnesia','rest']);
  assert((await w.s.chooseMove(4)).ok);assert.equal(actor(w).moveSlots[3].pp,19);assert.equal(w.s.gw.readState('p1')[0].pp.amnesia,20);assert.equal(w.s.gw.readState('p1')[0].pp.rest,10);unchanged(w);
  assert((await w.s.chooseSwitch('P2')).ok);assert((await w.s.chooseSwitch('P1')).ok);assert.equal(actor(w).transformed,false);assert.deepEqual(w.s.currentRequest().active[0].moves.map(m=>m.id),['transform','splash','amnesia','rest']);unchanged(w);
 }finally{cleanup(w);}
});

for (const own of [1,4]) test('learning a copied move keeps one full-PP learned selectable ID, permanent slots '+own, async()=>{
 const w=await open({own,copied:2,learnMoves:['seismictoss']});try{
  await transform(w);await knockout(w);
  if(own===4) await w.s.decideLearn(3);
  dense(w);assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss']);
  assert.equal(actor(w).moveSlots[1].pp,20);assert.equal(w.s.gw.readState('p1')[0].pp.seismictoss,20);
  await w.s._restoreCheckpoint(w.s._checkpoint());dense(w);
  assert.deepEqual(w.s.currentRequest().active[0].moves.map(m=>m.id),['splash','seismictoss']);
  assert((await w.s.chooseMove(2)).ok);assert.equal(actor(w).moveSlots[1].pp,19);
  assert.equal(w.s.gw.readState('p1')[0].pp.seismictoss,20);assert(w.s.finished);unchanged(w);
  assert.equal(w.app.finishBattle(w.s,w.request).commit,'applied');
  const saved=clone(w.state.read());assert.equal(saved.party[0].moves.find(m=>m.id==='seismictoss').pp,20);
  w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);
 }finally{cleanup(w);}
});
test('replacing a previously learned copy with an already copied ID removes only the superseded virtual slot',async()=>{
 const w=await open({learnMoves:['rest','seismictoss','amnesia']});try{
  await transform(w);await knockout(w);await w.s.decideLearn(3);
  assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss','rest']);
  await w.s.decideLearn(3);assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','seismictoss']);
  assert.equal(actor(w).moveSlots[1].pp,20);await w.s._restoreCheckpoint(w.s._checkpoint());
  await w.s.decideLearn(3);assert.deepEqual(actor(w).moveSlots.map(m=>m.id),['splash','amnesia']);dense(w);unchanged(w);
  assert((await w.s.chooseSwitch('P2')).ok);assert((await w.s.chooseSwitch('P1')).ok);
  assert.deepEqual(w.s.currentRequest().active[0].moves.map(m=>m.id),['transform','splash','growl','amnesia']);
 }finally{cleanup(w);}
});

for (const slot of [0,1,2,3]) test('full permanent/copied tables learn an overlapping ID in slot '+slot,async()=>{
 const w=await open({own:4,copied:4,learnMoves:['seismictoss']});try{
  await transform(w);await knockout(w);assert.equal(w.s.pendingLearn.move.id,'seismictoss');
  await w.s.decideLearn(slot);dense(w);
  const expected=['splash','seismictoss','growl','tailwhip'];expected.splice(slot,1,'new');
  const ids=expected.filter(m=>m!=='seismictoss').map(m=>m==='new'?'seismictoss':m);
  assert.deepEqual(actor(w).moveSlots.map(m=>m.id),ids);
  assert.equal(actor(w).moveSlots.find(m=>m.id==='seismictoss').pp,20);
  await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(w.s.currentRequest().active[0].moves.map(m=>m.id),ids);
  assert((await w.s.chooseMove(ids.indexOf('seismictoss')+1)).ok);
  assert.equal(actor(w).moveSlots.find(m=>m.id==='seismictoss').pp,19);
  assert.equal(w.s.gw.readState('p1')[0].pp.seismictoss,20);unchanged(w);
  assert.equal(w.app.finishBattle(w.s,w.request).commit,'applied');
  assert.equal(w.state.read().party[0].moves[slot].id,'seismictoss');assert.equal(w.state.read().party[0].moves[slot].pp,20);
  w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);
 }finally{cleanup(w);}
});
