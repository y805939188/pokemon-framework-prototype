'use strict';const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');const{fixture,flush,formalDarkLoads}=require('./fixture.cjs');const id=process.env.PF_FINAL_CASE;assert(['A1','A2','B1','B2','B3','C1','C2','C3','C4'].includes(id));
const args={kind:'wild',foes:'Pidgey:5',battleId:'legacy-final',defaultWeather:'inherit',defaultTerrain:'none',battleEnvironment:'inherit',battleTime:'0',battleEffects:'on',canLose:'true'};
test(id+' actual final production caller',async()=>{
 const h=await fixture({realSession:id[0]==='B',weather:id==='B1'?'HeavyRain':undefined,dark:id[0]==='C',fieldEvents:id==='C1',edit(game,content){if(id==='C3'){game.world.flashUsed=true;content.mapMetadata.maps[6].darkMap=true;delete content.mapMetadata.maps[6].weather;}}}),{G,app,o}=h,p=G.$gamePlayer;
 if(id==='A1'){
  const old=structuredClone(h.state().world.healingSpot),prefix=h.draws.slice();h.event([h.command('PS_World','RecordRecentCenter'),{code:355,indent:0,parameters:['this._seenCenter=JSON.stringify($gameSystem._psGame.world.recentCenter);']},h.command('PS_World','RecordCaveEntrance'),{code:355,indent:0,parameters:['this._seenEscape=JSON.stringify($gameSystem._psGame.world.escapePoint);']},h.command('PS_World','ClearCaveEscapePoint')]);
  const I=G.$gameMap._interpreter;assert.deepEqual(JSON.parse(I._seenCenter),{mapId:5,x:2,y:2,direction:6});assert.deepEqual(JSON.parse(I._seenEscape),{mapId:5,x:1,y:2,direction:4});assert.equal(h.state().world.escapePoint,null);assert.deepEqual(h.state().world.healingSpot,old);assert.equal(G.PSFlow.worldAuthorInputPending(),false);assert.equal(I._waitMode,'');assert.deepEqual(h.draws,prefix);h.record({outcome:I._psWorldAuthorOutcome});
 }else if(id==='A2'){
  const before=structuredClone(h.state().world.recentCenter);let getters=0;const bad={};Object.defineProperty(bad,'mapId',{enumerable:true,get(){getters++;throw Error('getter invoked');}});h.event([h.command('PS_World','RecordRecentCenter',bad)]);assert.equal(getters,0);assert.equal(G.$gameMap._interpreter._psWorldAuthorOutcome.status,'refused');assert.deepEqual(h.state().world.recentCenter,before);p.reserveTransfer(5,3,3,6,0);h.event([h.command('PS_World','RecordRecentCenter')]);assert.equal(G.$gameMap._interpreter._psWorldAuthorOutcome.status,'refused');assert.deepEqual(h.state().world.recentCenter,before);assert.equal(p.isTransferring(),true);h.record({outcome:G.$gameMap._interpreter._psWorldAuthorOutcome});
 }else if(id==='B1'||id==='B2'){
  const prefix=h.draws.slice();if(id==='B2'){G.ConfigManager.psBattleStyle='set';G.PSFlow.fast=false;}h.event([h.command('PS_BattleFlow',id==='B1'?'StartBattle':'StartTrainerBattle',id==='B1'?args:{...args,trainerId:'npc',defaultWeather:'',defaultTerrain:'none',battleEnvironment:'none'})]);if(id==='B2'){assert.equal(o.sessions.length,0);assert.deepEqual(h.draws,prefix);}await h.pump(()=>G.SceneManager._scene?._controller?.ready);const s=G.SceneManager._scene._session;assert(s&&G.PSFlow._op?.session===s,JSON.stringify({failure:String(G.SceneManager._scene._failure?.stack??G.SceneManager._scene._failure),last:G.PSFlow.lastOutcome,op:!!G.PSFlow._op,sessions:o.sessions.length}));assert.equal(s.constructor.name,'BattleSession');assert.equal(o.sessions.length,1);assert.deepEqual(o.sessions[0].setup.worldCapture,{timeOfDay:2,fishing:false});if(id==='B1'){assert.equal(o.sessions[0].setup.initialField.weather,'rain');assert.equal(o.sessions[0].setup.initialField.environment,'cave');}else {assert.equal(o.sessions[0].setup.initialField,undefined);assert.equal(o.sessions[0].setup.battleStyle,'set');}assert.deepEqual(h.draws.slice(0,prefix.length),prefix);h.record({sessionClass:s.constructor.name,operationRequest:G.PSFlow._op.request});
 }else if(id==='B3'){
  let traps=0;const bad=new Proxy({}, {ownKeys(){traps++;throw Error('trap');},get(){traps++;throw Error('trap');},getOwnPropertyDescriptor(){traps++;throw Error('trap');}});assert.throws(()=>h.event([h.command('PS_BattleFlow','StartBattle',bad)]),/arguments-proxy/);assert.equal(traps,0);
  const mgr=G.SceneManager,push=mgr.push,stack=mgr._stack,prefix=stack.slice(),source=[G.$gameMap.mapId(),p.x,p.y];
  const frame=()=>G.Graphics.frameCount, tick=async()=>{h.tick();await flush();};
  const stamp=()=>{const before=G.$gameSystem._psGame,e=h.ports.state.atomicWorldContent(()=>actual=>({value:actual.lifecycle.travelLease?.nativeEpoch}));
   assert.strictEqual(G.$gameSystem._psGame,before);assert(e&&typeof e==='object');return e;};
  let pushes=0,oldGuard,first,successor,atPush;const initial=stamp();
  mgr.push=function(C){
   pushes++;atPush=frame();p.reserveTransfer(5,p.x,p.y,6,0);first=stamp();assert.notStrictEqual(first,initial);
   p.clearTransferInfo();assert.strictEqual(stamp(),first);oldGuard=h.ports.worldTravel.captureNativeReservationGuard(p);oldGuard();
   p.reserveTransfer(5,3,3,8,0);successor=stamp();assert.notStrictEqual(successor,first);return Reflect.apply(push,this,[C]);
  };
  h.event([h.command('PS_BattleFlow','StartBattle',args)]);const commandFrame=frame();assert(G.PSFlow._op);assert.equal(pushes,0);assert.equal(p.isTransferring(),false);
  for(let n=0;n<180&&!pushes;n++)await tick();
  assert.equal(pushes,1);assert(atPush>commandFrame);assert.strictEqual(stamp(),successor);
  const target=()=>[p._newMapId,p._newX,p._newY,p._newDirection];
  assert(p.isTransferring());assert.deepEqual(target(),[5,3,3,8]);
  for(let n=0;n<8;n++)await tick();
  const msg=G.$gameMessage,scene=mgr._scene,queued=msg.allText();
  assert(scene instanceof G.Scene_Map&&scene.isStarted()&&scene.isActive()&&!mgr.isSceneChanging());
  assert(msg.isBusy()&&!scene.isSceneChangeOk());assert.equal(msg.isChoice()||msg.isNumberInput()||msg.isItemChoice(),false);
  assert(queued.includes('travel-native-idle-source-changed'));assert.strictEqual(mgr._stack,stack);assert.equal(stack.length,prefix.length);prefix.forEach((v,i)=>assert.strictEqual(stack[i],v));
  // The map shell has no drawable message window. Drive the real Window_Message
  // in a controlled rendering VM on the same queue, never clearing it by hand.
  assert.equal(typeof scene._messageWindow.updateInput,'undefined');
  const ui=require('../../../../tests/regression/messages/message-host.cjs').host('en',816,624,true);ui.G.$gameMessage=msg;
  const bytes=require('node:fs').readFileSync(require('node:path').join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_core.js'));
  const sha=v=>require('node:crypto').createHash('sha256').update(v).digest('hex');
  assert.equal(sha(bytes),'b18c5f887be92cd3ee199660f371d2dd9a3b383003925c42a16219aee44201ec');
  const core=bytes.toString('utf8'),marker='Utils.containsArabic = function',a=core.indexOf(marker),b=core.indexOf('\n};\n',a);
  assert(a>0&&a===core.lastIndexOf(marker)&&b>a);const method=core.slice(a,b+4);assert.equal(sha(method),'344c60a7dee5b196c7610061ceb0ebd3055560e427370ce46ab6fa78b739f282');
  for(const realm of [G,ui.G]){vm.runInContext(method,realm,{filename:'pinned-Reactor:Utils.containsArabic'});assert.equal(realm.Utils.containsArabic('أ'),true);assert.equal(realm.Utils.containsArabic('abc'),false);}
  const hold=()=>{assert.equal(app.saveBlocked,false);assert.equal(G.PSFlow.lastOutcome?.code,0);assert.equal(G.PSFlow.lastOutcome?.commit,'none');assert.match(G.PSFlow.lastOutcome.error,/travel-native-idle-source-changed/);assert.strictEqual(G.$gameMessage,msg);assert(msg.isBusy()&&p.isTransferring());assert.strictEqual(stamp(),successor);
   assert.deepEqual(target(),[5,3,3,8]);assert.deepEqual([G.$gameMap.mapId(),p.x,p.y],source);assert.equal(o.sessions.length,0);};
  let uiFrames=0;const update=async(key)=>{ui.setTime(++uiFrames*1000/60);ui.G.Graphics.frameCount++;ui.keys.clear();if(key)ui.keys.add(key);ui.win.update();ui.keys.clear();await tick();};
  const waiting=()=>ui.win.pause===true&&!ui.win._textState&&ui.win._waitCount===0;
  for(let n=0;n<300&&!waiting();n++){hold();await update();}
  hold();assert(waiting());assert(ui.text().includes('travel-native-idle-source-changed'));
  const fullyPaintedFrame=frame();await update('ok');const acknowledged=frame();assert.strictEqual(ui.G.$gameMessage,msg);assert.equal(msg.isBusy(),false);assert.deepEqual(ui.writes,[]);
  const arrived=()=>!p.isTransferring()&&G.$gameMap.mapId()===5&&p.x===3&&p.y===3&&p.direction()===8&&mgr._scene instanceof G.Scene_Map&&mgr._scene.isStarted()&&!mgr.isSceneChanging();
  for(let n=0;n<90&&!arrived();n++)await tick();
  assert(arrived());assert.equal(pushes,1);assert.equal(o.sessions.length,0);assert.equal(app.saveBlocked,false);
  assert.throws(oldGuard,/travel-native-idle-source-changed/);h.ports.worldTravel.captureNativeReservationGuard(p)();
  h.record({lateRejected:true,successor201Preserved:true,commandFrame,atPush,fullyPaintedFrame,acknowledged,arrivalFrame:frame(),confirmations:1,headlessWindow:true});
 }else if(id==='C1'){
  const prefix=h.draws.slice(),memberId=h.state().party[0].id;for(const moveId of ['cut','rocksmash','strength']){const r=await h.run({kind:'use',moveId,entry:'party',memberId});assert.equal(r.status,'completed',JSON.stringify(r));}
  const push=await h.run({kind:'strength-push',playSound:true});assert.equal(push.status,'completed',JSON.stringify(push));assert.deepEqual(o.sounds.map(x=>x.name),['Slash1','Crash','Push']);assert.equal(o.audioHardwareCalls,3);assert.equal(G.$gameMap.event(1)._erased,true);assert.equal(G.$gameMap.event(2)._erased,true);assert.equal(G.$gameMap.event(3).x,4);assert.deepEqual(h.draws.slice(0,prefix.length),prefix);h.record({push});
 }else if(id==='C2'){
  const r=await h.run({kind:'use',moveId:'flash',entry:'party',memberId:h.state().party[0].id});assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(h.state().world.flashUsed,true);assert.equal(h.state().stats.flash_count,1);assert.equal(o.effects,1);assert(o.radii.includes(176));assert.equal(p.isAnimationPlaying(),false);h.record({result:r});
 }else if(id==='C3'){
  assert(o.radii.includes(176));const source=G.SceneManager._scene,sourceLayer=source.children.find(c=>c.bitmap);p.reserveTransfer(6,1,2,6,0);await h.pump(()=>G.$gameMap.mapId()===6&&!G.$gamePlayer.isTransferring()&&G.SceneManager._scene.isStarted());h.tick();assert.equal(h.state().world.flashUsed,true);assert.equal(sourceLayer.destroyed,true);assert.equal(G.SceneManager._scene.children.filter(c=>c.bitmap).length,1);
  G.$gamePlayer.reserveTransfer(6,1,2,6,0);await h.pump(()=>!G.$gamePlayer.isTransferring()&&G.SceneManager._scene.isStarted());h.tick();assert.equal(G.SceneManager._scene.children.filter(c=>c.bitmap).length,1);
  const loads=await formalDarkLoads(h);G.$gamePlayer.reserveTransfer(7,1,2,6,0);await h.pump(()=>G.$gameMap.mapId()===7&&!G.$gamePlayer.isTransferring()&&G.SceneManager._scene.isStarted());h.tick();assert.equal(h.state().world.flashUsed,false);assert.equal(G.SceneManager._scene.children.filter(c=>c.bitmap).length,0);h.record({loads,darkToNormalRetired:true});
 }else if(id==='C4'){
  const animation=G.$dataAnimations[40];G.$dataAnimations[40]=null;const r=await h.run({kind:'use',moveId:'flash',entry:'party',memberId:h.state().party[0].id});assert.notEqual(r.status,'completed');assert.equal(h.state().world.flashUsed,false);assert.equal(h.state().stats.flash_count,0);G.$dataAnimations[40]=animation;o.failExpansion=true;const post=await h.run({kind:'use',moveId:'flash',entry:'party',memberId:h.state().party[0].id});assert.notEqual(post.status,'completed');assert.equal(h.state().world.flashUsed,true);assert.equal(h.state().stats.flash_count,1);const old=G.SceneManager._scene;p.reserveTransfer(5,p.x,p.y,6,0);await h.pump(()=>G.SceneManager._scene!==old&&G.SceneManager._scene.isStarted()&&!G.$gamePlayer.isTransferring());h.tick();const newer=G.SceneManager._scene.children.find(c=>c.bitmap);assert(newer);old.terminate();assert.equal(newer.destroyed,undefined);assert(o.radii.includes(176));h.record({pre:r,post,newerPreserved:true});
 }else throw Error('C1 source input not yet frozen');
});
