'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture,flush}=require('./fixture.cjs'),id=process.env.PF_F_FIELD_CASE,out=process.env.PF_F_FIELD_OUTPUT;
assert(['SCRIPT-EMPTY','SCRIPT-DEAD','SCRIPT-CAPABLE','SCRIPT-BUSY','SCRIPT-LATE','SCRIPT-FOREIGN','SCRIPT-CHILD'].includes(id));
test(id+' genuine command355 interpreter wait and calling list',{timeout:30000},async()=>{
 let h;const observed={id};
 try{
  h=await fixture({direct:true,empty:id==='SCRIPT-EMPTY',capable:id==='SCRIPT-CAPABLE',destination:'no-home',nativeSetup(n){
   // Pin native interpreter dispatch BEFORE production hooks capture it.
   const source=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_objects.js'),'utf8'),name='Game_Map.prototype.updateInterpreter',a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(source.slice(a,b+4),n.G,{filename:'pinned-native-field-script:'+name});
  }});
  const {G,app}=h,interpreter=G.$gameMap._interpreter;
  await h.pump(()=>!G.PSFlow.companionNativePending());
  G.__fieldScriptMarker=0;
  const command=script=>({code:355,indent:0,parameters:[script]}),end={code:0,indent:0,parameters:[]};
  if(id==='SCRIPT-FOREIGN'){
   const foreign=new G.Game_Interpreter();foreign.setup([command('0'),end],9);
   assert.deepEqual(h.clone(await G.PSFlow.waitFieldBlackout(foreign,'foreign')),{status:'refused',reason:'blackout-script-caller-unavailable'});assert.equal(h.entries.length,0);h.unsettled();return;
  }
  const script=(id==='SCRIPT-BUSY'?'globalThis.__fieldManagement = PSFlow.app().beginManagement(); ':'')+"globalThis.__fieldScriptPromise = PSFlow.waitFieldBlackout(this, 'actual-event-check');";
  const child=[command(script),end],list=id==='SCRIPT-CHILD'?[{code:117,indent:0,parameters:[1]},command('globalThis.__fieldScriptMarker++'),end]:[command(script),command('globalThis.__fieldScriptMarker++'),end];
  if(id==='SCRIPT-CHILD')G.$dataCommonEvents[1]={id:1,name:'Field check child',list:child,trigger:0,switchId:1};
  interpreter.setup(list,1);assert.equal(G.$gameMap.isEventRunning(),true);
  observed.before={appBlocked:app.saveBlocked,hostPending:G.PSWorld.pending(),companionPending:G.PSFlow.companionNativePending(),authorPending:G.PSFlow.worldAuthorInputPending(),interpreterIndex:interpreter._index,wait:interpreter._waitMode,waitCount:interpreter._waitCount,started:G.SceneManager._scene.isStarted(),mapUpdate:String(G.$gameMap.updateInterpreter),update:String(interpreter.update),execute:String(interpreter.executeCommand)};
  G.$gameMap.updateInterpreter();
  observed.after={appBlocked:app.saveBlocked,hostPending:G.PSWorld.pending(),interpreterIndex:interpreter._index,wait:interpreter._waitMode,promise:!!G.__fieldScriptPromise};
  const caller=id==='SCRIPT-CHILD'?interpreter._childInterpreter:interpreter;
  assert(caller);assert.equal(caller._waitMode,'psFieldBlackout');assert.equal(G.__fieldScriptMarker,0,'command after check cannot run inside the initial command355 loop');
  observed.eventRunningAtAdmission=G.$gameMap.isEventRunning();observed.actualCallerIsChild=caller!==interpreter;
  const advance=async(clear=true)=>{if(clear)G.$gameMessage.clear();G.$gameMap.updateInterpreter();h.tick();await flush();};
  const pump=async predicate=>{for(let i=0;i<350;i++){if(predicate())return;await advance();}throw Error('actual script pump exceeded');};
  if(id==='SCRIPT-BUSY'){
   const result=await G.__fieldScriptPromise;assert.deepEqual(result,{status:'refused',reason:'operation-active'});
   assert.equal(caller.updateWaitMode(),false,'this rejected check never waits an unrelated management owner');assert.equal(caller._waitMode,'');assert.equal(app.encounterBlocked,true);
   app.endManagement(G.__fieldManagement);G.$gameMap.updateInterpreter();assert.equal(G.__fieldScriptMarker,1);assert.equal(h.entries.length,0);h.unsettled();return;
  }
  if(id==='SCRIPT-CAPABLE'){
   assert.deepEqual(await G.__fieldScriptPromise,{status:'not-required'});await pump(()=>G.__fieldScriptMarker===1);assert.equal(h.entries.length,0);assert.deepEqual(h.state(),h.initial);return;
  }
  await pump(()=>h.events.some(e=>e.text==='You have no Pokémon that can battle!'));
  assert.equal(G.$gameMap.isEventRunning(),true);assert.equal(G.__fieldScriptMarker,0);assert.equal(h.state().world.pendingReturn,null);assert.equal(app.saveBlocked,true);
  if(id==='SCRIPT-LATE'){
   G.PSFlow.stateReplaced();interpreter.clear();const successor=[command('globalThis.__fieldScriptMarker+=10'),end];interpreter.setup(successor,2);interpreter.setWaitMode('message');G.$gameMessage.clear();G.$gameMessage.add('new event owns this message');
   const installed=h.clone(h.state());for(let i=0;i<5;i++)await advance(false);
   assert.equal(h.entries[0].result.status,'failed');assert.equal(interpreter._list,successor);assert.equal(interpreter._waitMode,'message');assert.equal(G.__fieldScriptMarker,0);assert.deepEqual(h.state(),installed);
   await advance();assert.equal(G.__fieldScriptMarker,10);assert.equal(interpreter.isRunning(),false);return;
  }
  await pump(()=>G.__fieldScriptMarker===1&&!app.saveBlocked);await G.__fieldScriptPromise;
  h.settled();assert.equal(h.state().steps,3);assert.equal(h.entries.length,1);assert.equal(interpreter.isRunning(),false);assert.equal(h.state().world.pendingReturn,null);
 }catch(error){observed.status='FAIL';observed.error=error.stack;throw error;}
 finally{if(h){observed.initial=h.initial;observed.final=h.clone(h.state());observed.events=h.events;observed.audio=h.audio;observed.entries=h.entries.map(e=>e.result);observed.marker=h.G.__fieldScriptMarker;observed.draws=h.draws;observed.nativeDraws=h.nativeDraws;}observed.status??='PASS';fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(observed,null,2)+'\n',{flag:'wx'});}
});
