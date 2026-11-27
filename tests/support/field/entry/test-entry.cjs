'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('./fixture.cjs'),id=process.env.PF_F_FIELD_CASE,out=process.env.PF_F_FIELD_OUTPUT;
const ids=['ENTRY-ORDER','ENTRY-HOME','ENTRY-NOHOME','ENTRY-MISSING','DIRECT-EMPTY','DIRECT-DEAD','DIRECT-CAPABLE','DIRECT-BUSY','DUPLICATE','D-NOT-EXTINCT','D-POISON-OFF','WAIT-SAVE','CANCEL-MESSAGE','CANCEL-FADE','FAIL-MESSAGE','FAIL-AUDIO','FAIL-SCREEN','CONTENT-CHANGE','OWNER-CHANGE','LOAD-LATE','NEWGAME-LATE','SUCCESSOR','NEWER-FADE','NEWER-AUDIO','ZH-NOHOME','ZH-MISSING','INVALID-REQUEST','D-REPEAT','CONTENT-FADE','SOURCE-CHANGE','NEWGAME-FADE','LOAD-FADE','FAIL-RETURN-MESSAGE','HOOK-GETTER','SNAPSHOT-GETTER','RESTORE-RETRY'];
assert(ids.includes(id),'explicit finite field-entry selector required');assert(out&&!fs.existsSync(path.join(out,'RESULT.json')));
test(id+' actual App and installed native field-entry chain',{timeout:30000},async()=>{
 let h,run;const facts={id};
 try{
  const direct=!id.startsWith('ENTRY-')&&!id.startsWith('D-')&&id!=='WAIT-SAVE'&&id!=='CANCEL-MESSAGE';
  const destination=id==='ENTRY-HOME'?'home':id.endsWith('MISSING')?'missing':id==='ENTRY-ORDER'||id==='WAIT-SAVE'||id==='CANCEL-MESSAGE'?'center':'no-home';
  const options={direct,destination,empty:id==='DIRECT-EMPTY',capable:id==='DIRECT-CAPABLE'||id==='D-NOT-EXTINCT',poisonDisabled:id==='D-POISON-OFF',lang:id.startsWith('ZH-')?'zh':undefined};
  let returnFailure=false,traps=0,restoreFailure=false;
  if(id==='FAIL-MESSAGE')options.onMessage=(_G,text)=>{if(text==='You blacked out!')throw Error('injected-message-failure');};
  if(id==='FAIL-RETURN-MESSAGE')options.onMessage=(_G,text)=>{if(text.startsWith('Your party was restored.')&&!returnFailure){returnFailure=true;throw Error('injected-return-message-failure');}};
  if(id==='FAIL-AUDIO')options.audioEffect=channel=>{if(channel==='bgs')throw Error('injected-audio-failure');};
  if(id==='FAIL-SCREEN')options.screenEffect=()=>{throw Error('injected-screen-failure');};
  h=await fixture(options);const {G,app}=h;facts.initial=h.initial;
  if(id==='HOOK-GETTER')Object.defineProperty(G.AudioManager,'fadeOutBgm',{configurable:true,get(){traps++;throw Error('getter must not run');}});
  if(id==='SNAPSHOT-GETTER')G.AudioManager.saveBgm=()=>Object.defineProperty({},'name',{enumerable:true,get(){traps++;throw Error('snapshot getter must not run');}});
  if(id==='RESTORE-RETRY'){const replay=G.AudioManager.replayBgm;G.AudioManager.replayBgm=function(value){if(!restoreFailure){restoreFailure=true;throw Error('injected-restore-once');}return Reflect.apply(replay,this,[value]);};}
  if(id==='DIRECT-BUSY'){
   const token=app.beginManagement();assert.deepEqual(await G.PSFlow.checkFieldBlackout('busy'),{status:'refused',reason:'operation-active'});app.endManagement(token);assert.equal(h.entries.length,0);h.unsettled();return;
  }
  if(id==='INVALID-REQUEST'){
   for(const value of [null,{},'', 'x'.repeat(129)])assert.deepEqual(await G.PSFlow.checkFieldBlackout(value),{status:'refused',reason:'invalid-request-id'});
   assert.equal(h.entries.length,0);h.unsettled();return;
  }
  if(id==='WAIT-SAVE'||id==='CANCEL-MESSAGE')h.installSave();
  run=h.start();
  if(id==='D-REPEAT'){
   await h.pump(()=>h.events.some(e=>e.text==='You have no Pokémon that can battle!'));assert.equal(app.cancelBlackoutReturn().status,'cancelled');await h.pump(()=>h.entries[0].result!==null&&!app.saveBlocked);
   const prefix=h.clone(h.state());assert.equal(h.stepCalls.length,1);const repeated=await app.completeWorldStep(h.stepCalls[0]);assert.equal(repeated.status,'blackout-required');assert.deepEqual(h.state(),prefix);assert.equal(h.entries.length,1);assert.equal(h.state().steps,4);
   const retry=G.PSFlow.checkFieldBlackout('explicit-field-retry');await h.pump(()=>h.entries.length===2&&h.entries[1].result!==null&&!app.saveBlocked);await retry;h.settled();assert.equal(h.state().steps,4);return;
  }
  if(['CONTENT-FADE','SOURCE-CHANGE','NEWGAME-FADE','LOAD-FADE'].includes(id)){
   await h.pump(()=>id==='SOURCE-CHANGE'?h.events.some(e=>e.text==='You have no Pokémon that can battle!'):G.$gameScreen._fadeOutDuration>0);
   if(id==='CONTENT-FADE')G.PSFlow._content={...h.content,settings:{...h.content.settings,POISON_IN_FIELD:false}};
   else if(id==='SOURCE-CHANGE')G.$gameMap=Object.assign(Object.create(Object.getPrototypeOf(G.$gameMap)),G.$gameMap);
   else if(id==='NEWGAME-FADE')G.PSFlow.startNewGame();
   else {G.PSFlow.stateReplaced();G.$gameSystem._psGame={...h.clone(h.initial),money:417};}
   const installed=h.clone(h.state());await h.pump(()=>run.result()!==undefined);for(let i=0;i<28;i++){h.tick();await flush();}
   assert.deepEqual(h.state(),installed);assert.equal(h.state().stats.blacked_out_count,0);assert.equal(G.$gameScreen.brightness(),255);assert.equal(G.AudioManager._currentBgm.name,'field');return;
  }
  if(['FAIL-RETURN-MESSAGE','HOOK-GETTER','SNAPSHOT-GETTER','RESTORE-RETRY'].includes(id)){
   await h.pump(()=>run.result()!==undefined);assert.equal(run.result().status,'failed');assert.equal(traps,0);
   if(id==='HOOK-GETTER'||id==='SNAPSHOT-GETTER'){h.unsettled();assert.equal(h.audio.length,0);return;}
   h.settled();assert.equal(h.entries.length,1);assert.equal(app.saveBlocked,false);
   if(id==='FAIL-RETURN-MESSAGE')assert.equal(h.state().world.pendingReturn.phase,'announce');else assert.equal(h.state().world.pendingReturn,null);
   let recovered;app.recoverBlackoutReturn().then(value=>{recovered=value;});await h.pump(()=>recovered!==undefined&&!app.saveBlocked);
   assert.equal(recovered.status,'completed');h.settled();assert.equal(h.state().world.pendingReturn,null);assert.equal(h.entries.length,1,'resume never repeats fresh field entry');assert.equal(h.events.filter(e=>e.text==='You blacked out!').length,1);
   for(let i=0;i<28;i++){h.tick();await flush();}assert.equal(G.$gameScreen.brightness(),255);assert.equal(G.AudioManager._currentBgm.name,'field');return;
  }
  if(id==='DIRECT-CAPABLE'){
   assert.deepEqual(await run.promise,{status:'not-required'});assert.equal(h.entries.length,0);assert.deepEqual(h.state(),h.initial);return;
  }
  if(id==='D-NOT-EXTINCT'||id==='D-POISON-OFF'){
   await h.pump(()=>run.result()!==undefined&&!app.saveBlocked);assert.equal(h.state().steps,4);assert.equal(h.entries.length,0);assert.equal(h.state().stats.blacked_out_count,h.initial.stats.blacked_out_count);assert.equal(h.events.some(e=>e.text==='You blacked out!'),false);assert.equal(h.state().party[0].hp,id==='D-NOT-EXTINCT'?3:1);return;
  }
  const first=()=>h.events.some(e=>e.text===(id.startsWith('ZH-')?'没有能战斗的宝可梦！':'You have no Pokémon that can battle!'));
  if(['WAIT-SAVE','CANCEL-MESSAGE','DUPLICATE','CONTENT-CHANGE','OWNER-CHANGE','LOAD-LATE','NEWGAME-LATE','SUCCESSOR'].includes(id)){
   await h.pump(first);
   if(id==='WAIT-SAVE'||id==='CANCEL-MESSAGE')await h.saveBlocked();
   if(id==='WAIT-SAVE')assert.equal(h.state().steps,4);
   if(id==='DUPLICATE'){
    assert.equal(G.PSFlow.checkFieldBlackout('field-direct'),run.promise);assert.deepEqual(await G.PSFlow.checkFieldBlackout('other-id'),{status:'refused',reason:'operation-active'});
   }else if(id==='CANCEL-MESSAGE'){
    assert.equal(app.cancelBlackoutReturn().status,'cancelled');await h.pump(()=>h.entries[0].result!==null);h.unsettled();assert.equal(h.state().steps,4);assert.equal(h.audio.length,0);return;
   }else if(id==='CONTENT-CHANGE'){
    G.PSFlow._content={...h.content,settings:{...h.content.settings,POISON_IN_FIELD:false}};
    await h.pump(()=>run.result()!==undefined);assert.equal(run.result().status,'failed');h.unsettled();assert.equal(h.audio.length,0);return;
   }else if(id==='OWNER-CHANGE'){
    const successor={stateGeneration:app.stateGeneration};G.PSFlow._app=successor;G.$gameMessage.clear();for(let i=0;i<4;i++){h.tick();await flush();}
    assert.equal(h.entries[0].result.status,'failed');assert.equal(G.PSFlow._app,successor);assert.equal(h.audio.length,0);assert.deepEqual(h.state(),h.initial);return;
   }else if(id==='LOAD-LATE'||id==='NEWGAME-LATE'){
    if(id==='NEWGAME-LATE')G.PSFlow.startNewGame();else{G.PSFlow.stateReplaced();G.$gameSystem._psGame={...h.clone(h.initial),money:417};}
    const installed=h.clone(h.state());G.$gameScreen=new G.Game_Screen();G.AudioManager.playBgm({name:'successor',volume:40,pitch:100,pan:0});
    await h.pump(()=>h.entries[0].result!==null);assert.deepEqual(h.state(),installed);assert.equal(G.AudioManager._currentBgm.name,'successor');assert.equal(G.$gameScreen.brightness(),255);return;
   }else if(id==='SUCCESSOR'){
    assert.equal(app.cancelBlackoutReturn().status,'cancelled');G.$gameMessage.clear();
    const second=G.PSFlow.checkFieldBlackout('successor');await h.pump(()=>h.entries.length===2&&h.entries[1].result!==null&&!app.saveBlocked);await second;
    const after=h.clone(h.state()),audioCount=h.audio.length;await h.pump(()=>h.entries[0].result!==null);for(let i=0;i<28;i++){h.tick();await flush();}
    assert.deepEqual(h.state(),after);assert.equal(h.audio.length,audioCount);h.settled();assert.equal(h.entries.filter(e=>e.result.status==='done').length,1);return;
   }
  }
  if(['CANCEL-FADE','NEWER-FADE','NEWER-AUDIO'].includes(id)){
   await h.pump(()=>G.$gameScreen._fadeOutDuration>0);
   if(id==='NEWER-FADE')G.$gameScreen.startFadeOut(6);
   if(id==='NEWER-AUDIO')G.AudioManager.playBgm({name:'new-intent',volume:70,pitch:100,pan:0});
   assert.equal(app.cancelBlackoutReturn().status,'cancelled');await h.pump(()=>run.result()!==undefined);h.unsettled();
   for(let i=0;i<28;i++){h.tick();await flush();}
   if(id==='NEWER-FADE')assert.equal(G.$gameScreen.brightness(),0,'leave newer fade untouched');else assert.equal(G.$gameScreen.brightness(),255);
   if(id==='NEWER-AUDIO')assert.equal(G.AudioManager._currentBgm.name,'new-intent');else assert.equal(G.AudioManager._currentBgm.name,'field');return;
  }
  if(id.startsWith('FAIL-')){
   await h.pump(()=>run.result()!==undefined);assert.equal(run.result().status,'failed');h.unsettled();assert.equal(app.saveBlocked,false);
   for(let i=0;i<28;i++){h.tick();await flush();}assert.equal(G.$gameScreen.brightness(),255);assert.equal(G.AudioManager._currentBgm.name,'field');assert.equal(G.AudioManager._currentBgs.name,'ambient');return;
  }
  await h.pump(()=>run.result()!==undefined&&!app.saveBlocked);assert.equal(run.error(),undefined);h.settled();
  const messages=h.events.filter(e=>e.kind==='message'),firstIndex=messages.findIndex(e=>e.text===(id.startsWith('ZH-')?'没有能战斗的宝可梦！':'You have no Pokémon that can battle!'));
  assert(firstIndex>=0,'missing whole-party incapacity message');assert.equal(messages[firstIndex+1].text,id.startsWith('ZH-')?'眼前一黑！':'You blacked out!');
  assert(messages[firstIndex].hp.every(hp=>hp===0));assert.equal(messages[firstIndex].count,h.initial.stats.blacked_out_count);assert.equal(messages[firstIndex].checkpoint,null);assert.equal(messages[firstIndex].blocked,true);
  const fade=h.events.find(e=>e.kind==='fade-out');assert(fade);assert(fade.hp.every(hp=>hp===0));assert.equal(fade.count,h.initial.stats.blacked_out_count);
  assert(messages.filter(e=>e.text.startsWith('Your party was restored.')).every(e=>e.brightness===0),'actual return runs inside completed screen fade');
  assert.deepEqual(h.audio.slice(0,2).map(e=>e[0]),['bgm-out','bgs-out']);assert.equal(h.entries.length,1);assert.equal(h.entries[0].result.status,'done');
  assert.equal(h.state().money,h.initial.money);assert.equal(h.state().steps,direct?3:4);assert.equal(h.state().world.pendingReturn,null);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
  if(destination==='missing')assert.deepEqual(h.state().world.escapePoint,h.initial.world.escapePoint);else assert.equal(h.state().world.escapePoint,null);
  if(id==='DIRECT-EMPTY')assert.deepEqual(h.state().party,[]);
  if(id==='ZH-MISSING'){
   assert.deepEqual(h.announcements,[{kind:'debug-missing-home',selection:'home',target:{mapId:99,x:1,y:1,direction:8}}]);
   assert.equal(G.PSFlow.translator().t('world.blackout.missingHome'),'无法载入回家的地图。');
   assert.deepEqual(messages.map(e=>e.text),['没有能战斗的宝可梦！','眼前一黑！'],'an ordinary build cannot display the translated debug-only line, even with TravelDebug=true');
  }
  if(id==='ZH-NOHOME'){
   assert.deepEqual(h.announcements.map(a=>[a.kind,a.selection]),[['show-return-message','no-home']]);
   assert(messages.some(e=>e.text==='宝可梦们恢复了精神。返回家中。'));
  }
  if(id==='DUPLICATE'){const after=h.clone(h.state());await G.PSFlow.checkFieldBlackout('field-direct');assert.deepEqual(h.state(),after);assert.equal(h.entries.length,1);}
  for(let i=0;i<28;i++){h.tick();await flush();}assert.equal(G.$gameScreen.brightness(),255);
 }catch(error){facts.status='FAIL';facts.error=error.stack;throw error;}
 finally{
  if(h){facts.final=h.clone(h.state());facts.events=h.events;facts.announcements=h.announcements;facts.nativeNonTransfer=h.captured.completions.map(x=>x.result);facts.audio=h.audio;facts.entries=h.entries.map(e=>e.result);facts.leaves=h.leaves.map(e=>e.result);facts.trace=h.trace;facts.draws=h.draws;facts.nativeDraws=h.nativeDraws;facts.saveCount=h.saves.length;if(run)facts.result=run.result();}
  facts.status??='PASS';fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(facts,null,2)+'\n',{flag:'wx'});
 }
});
