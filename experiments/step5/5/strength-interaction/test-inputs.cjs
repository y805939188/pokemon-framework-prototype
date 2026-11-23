'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const{fixture,flush}=require('./fixture.cjs');
const id=process.env.PF_STRENGTH_CASE;const ids=['S01','S02','S03','S04','S05','S06','S07','S08','S09'];assert(ids.includes(id));
test(id+' real native Strength input',{timeout:120000},async()=>{
 const h=await fixture({block:id==='S03'?'source':id==='S04'?'target':undefined,ordinaryFailure:id==='S05',name:id==='S06'?'boulder':undefined}),{G,app}=h;let done=false;
 try{
 if(id==='S01'){h.touch();await h.answer(1);assert.equal(app.worldLocalState().strengthUsed,false);assert.equal(h.state().stats.strength_push_count,0);assert.equal(h.moves.length,0);assert.equal(h.requests.length,1);assert.equal(h.requests[0].action.entry,'interaction');assert.equal(h.requests[0].result.status,'cancelled');assert.equal(G.$gameTemp.isDestinationValid(),false);}
 else if(id==='S02'){
  await h.activate();assert.equal(h.state().steps,0);h.direction(6);h.tick();await h.pump(()=>h.moves.length===1);assert.equal(h.moves[0].moving,true,'actual native interpolation begins');assert.equal(h.state().stats.strength_push_count,1);assert.equal(h.state().steps,0,'boulder movement is not a player step');assert.equal(app.saveBlocked,true);assert.equal(G.$gamePlayer.x,2);assert.deepEqual(h.draws,[],'boulder-only phase draws no world RNG');
  await h.pump(()=>h.moves.length===2);h.direction(0);await h.pump(()=>!app.saveBlocked&&!G.PSWorld.pending());assert.equal(h.state().stats.strength_push_count,2,'held input admits a fresh push after the player genuinely advanced');assert.equal(G.$gamePlayer.x,3);assert.equal(h.state().steps,1);assert.equal(h.steps.length,1);assert.equal(h.ordinary.length,1);assert.equal(G.$gameMap.event(1).x,5);assert.equal(h.o.sounds.filter(s=>s.name==='Push').length,2);assert.equal(app.world.records.filter(r=>r.kind==='event-position').length,1);
  const before=h.state().steps;for(let i=0;i<8;i++){h.tick();await flush();}assert.equal(h.state().steps,before);assert.equal(h.moves.length,2);
 }else if(['S03','S04','S05'].includes(id)){
  await h.activate();h.direction(6);h.tick();h.direction(0);await h.pump(()=>h.requests.length===2&&h.requests[1].result!==undefined&&!app.saveBlocked);
  assert.equal(h.state().steps,0);assert.equal(h.steps.length,0);assert.equal(h.ordinary.length,0);assert.equal(G.$gameMap.event(1).x,3);assert.equal(h.o.sounds.filter(s=>s.name==='Push').length,0);
  if(id==='S05'){assert.equal(h.requests[1].result.status,'completed');assert.equal(h.state().stats.strength_push_count,1);assert.equal(h.moves.length,1);assert.equal(h.moves[0].moving,false);assert.equal(app.world.records.filter(r=>r.kind==='event-position').length,1);}
  else{assert.equal(h.requests[1].result.status,'refused');assert.equal(h.state().stats.strength_push_count,0);assert.equal(h.moves.length,0);assert.equal(app.world.records.length,0);}
 }else if(id==='S06'){
  h.pressOk();await flush();h.tick();assert.equal(h.requests.length,0);assert(h.nativeCalls.some(r=>r.key==='triggerButtonAction'&&r.receiver&&r.result===true));await h.pump(()=>!G.$gameMap.isEventRunning());assert.equal(G.$gameMap._interpreter._nativeStrengthFallback,1);assert.equal(h.state().stats.strength_push_count,0);
  G.$dataMap.events[1].name='Current strengthboulder';assert.equal(G.$gameMap.event(1).event().name,'Current strengthboulder');
  const token=app.beginInventoryOperation('item');assert.equal(typeof token,'string');h.pressOk();await flush();assert.equal(h.requests.length,0);assert.equal(app.saveBlocked,true);app.endInventoryOperation(token);for(let i=0;i<3;i++){h.tick();await flush();}assert.equal(h.requests.length,0,'busy input is never queued for later');assert.equal(app.worldLocalState().strengthUsed,false);assert.equal(h.state().steps,0);
 }else{
  h.pressOk();await h.pump(()=>G.$gameMessage._choices.length===2);const late=G.$gameMessage._choiceCallback;
  if(id==='S07'){G.PSFlow.stateReplaced();const token=app.beginInventoryOperation('item');assert.equal(typeof token,'string');late(0);G.$gameMessage.clear();for(let i=0;i<8;i++){h.tick();await flush();}assert.equal(app.saveBlocked,true,'old completion cannot clear successor inventory gate');app.endInventoryOperation(token);}
  else if(id==='S08'){const old=G.$gameMap.event(1);G.$gameMap._events[1]=new G.Game_Event(5,1);assert.notEqual(G.$gameMap.event(1),old);late(0);G.$gameMessage.clear();}
  else{G.PSFlow._content={...G.PSFlow._content,settings:{...G.PSFlow._content.settings,AFFECTION_EFFECTS:true}};late(0);G.$gameMessage.clear();}
  await h.pump(()=>h.requests[0].result!==undefined&&!app.saveBlocked&&!G.PSWorld.pending());assert.equal(app.worldLocalState().strengthUsed,false);assert.equal(h.state().stats.strength_push_count,0);assert.equal(h.moves.length,0);assert.equal(h.state().steps,0);
 }
 if(id!=='S02'){assert.deepEqual(h.draws,[],'Strength itself never draws world RNG');assert.deepEqual(h.nativeDraws,[]);}assert.equal(h.saves.length,0);done=true;
 }finally{h.record({status:done?'PASS':'FAIL',id});}
});
