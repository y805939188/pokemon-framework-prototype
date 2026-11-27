'use strict';const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const{fixture,flush}=require('./fixture.cjs');const kind=process.env.PF_COLD_CASE_KIND;assert(['P01','C01','C02'].includes(kind));const positions=h=>h.records().map(r=>[r.location.mapId,r.location.x,r.location.y]);
// Count the real ordinary Flow draw and its one native Node entropy fill, without
// authorizing the dormant developer RNG seam or supplying a replacement value.
function observeOrdinaryColdEntropy(){
 assert.equal(process.env.PF_FINAL_PRODUCTION_FAMILY,'e3-companion-cold');
 assert.equal(process.env.PF_FINAL_PRODUCTION_SELECTOR,kind);
 const crypto=require('node:crypto'),randomFill=crypto.randomFillSync,bounds=[],rows=[];
 let G,flow,request=null,restoreRequire,restoreFlow,flowAttempts=0,cryptoImports=0,cryptoFills=0,phase='new';
 const view=Object.freeze({randomFillSync(target){
  assert(request&&request.fills===0,'only the currently observed Flow draw may fill');
  assert.equal(Object.prototype.toString.call(target),'[object Uint32Array]');
  assert.equal(target.length,2);
  const result=Reflect.apply(randomFill,crypto,[target]);
  assert.strictEqual(result,target);
  request.fills++;cryptoFills++;
  return result;
 }});
 function installRequire(){
  const descriptor=Object.getOwnPropertyDescriptor(G,'require'),original=descriptor?.value;
  assert(typeof original==='function'&&descriptor.writable);
  const resolve=Object.getOwnPropertyDescriptor(original,'resolve');
  assert.equal(typeof resolve?.value,'function','preserve the original require resolution');
  const observed=function(...args){
   const result=Reflect.apply(original,this,args);
   if(args[0]!=='node:crypto'||!request)return result;
   assert.strictEqual(result,crypto);
   cryptoImports++;
   return view;
  };
  Object.defineProperty(observed,'resolve',resolve);
  Object.defineProperty(G,'require',{...descriptor,value:observed});
  restoreRequire=()=>{
   assert.strictEqual(G.require,observed);
   Object.defineProperty(G,'require',descriptor);
   assert.deepEqual(Object.getOwnPropertyDescriptor(G,'require'),descriptor);
   restoreRequire=undefined;
  };
 }
 return {bounds,
  installBeforeApp(host){
   assert.equal(phase,'new');assert(host);
   G=host;flow=G.PSFlow;
   const descriptor=Object.getOwnPropertyDescriptor(flow,'random'),original=descriptor?.value;
   assert(typeof original==='function'&&descriptor.writable);
   const observed=function(...args){
    flowAttempts++;
    assert.strictEqual(this,flow);
    const [bound]=args;
    assert(!request&&args.length===1&&Number.isSafeInteger(bound)&&bound>0);
    const frame=request={bound,fills:0};
    try{
     const result=Reflect.apply(original,this,args);
     assert.equal(frame.fills,1,'real ordinary Flow call must reach the observed native entropy channel');
     assert(Number.isInteger(result)&&result>=0&&result<bound);
     assert(rows.length<64,'unbounded ordinary cold draw observation');
     bounds.push(bound);
     rows.push({bound,fills:frame.fills,frame:G.Graphics.frameCount,
      nativeMapId:Object.getOwnPropertyDescriptor(G.$gameMap,'_mapId')?.value,actualResultWithinBound:true});
     return result;
    }finally{request=null;}
   };
   Object.defineProperty(flow,'random',{...descriptor,value:observed});
   restoreFlow=()=>{
    assert.strictEqual(flow.random,observed);
    Object.defineProperty(flow,'random',descriptor);
    assert.deepEqual(Object.getOwnPropertyDescriptor(flow,'random'),descriptor);
    restoreFlow=undefined;
   };
   installRequire();phase='pre-app';
  },
  beforeStorage(host){
   assert.equal(phase,'pre-app');assert.strictEqual(host,G);assert.strictEqual(G.PSFlow,flow);
   assert.equal(flowAttempts,0,'boot must not draw or bind the business entropy source');
   assert.equal(bounds.length,0);
   assert.equal(cryptoImports,0);assert.equal(cryptoFills,0);
   restoreRequire();phase='installing-storage';
  },
  afterStorage(host){
   assert.equal(phase,'installing-storage');assert.strictEqual(host,G);
   assert.equal(G.nw.App.argv.length,0,'ordinary project storage, not an isolated developer grant');
   assert.equal(flowAttempts,0,'isolated saving plugin installation must not read business entropy');
   installRequire();phase='storage-bound';
  },
  snapshot(){assert.strictEqual(G.PSFlow,flow);return{phase,flowAttempts,cryptoImports,cryptoFills,bounds:[...bounds],rows:structuredClone(rows)};},
  restore(){
   try{restoreRequire?.();}
   finally{restoreFlow?.();}
   phase='restored';
  },
 };
}
test(kind+' actual normal companion crossmap formal file and fresh load',async()=>{
 const consumer=kind!=='P01',entropy=observeOrdinaryColdEntropy();
 try{
 const h=await fixture({consumer,mismatch:kind==='C02',ordinaryColdEntropy:entropy}),G=h.G;
 assert.strictEqual(h.draws,entropy.bounds);
 assert.equal(G.$gameSystem.isEncounterEnabled(),false);
 if(!consumer){
  for(const id of [1,2])assert.equal((await h.command('RegisterEventCompanion',{eventId:String(id),name:'buddy'+id})).status,'completed');
  const prefix=h.draws.slice(),beforeEntropy=entropy.snapshot(),steps=h.state().steps,stats=structuredClone(h.state().stats);G.Input.dir4=6;h.tick();G.Input.dir4=0;await h.pump(()=>G.$gameMap.mapId()===6&&!h.app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.companionNativePending());
  assert.deepEqual(positions(h),[[5,9,2],[5,8,2]]);assert.deepEqual(h.render().map(x=>x.x).sort((a,b)=>a-b),[-2,-1]);assert.equal(h.state().steps,steps+1);assert.equal(h.state().stats.distance_walked,stats.distance_walked+1);assert.deepEqual(h.draws.slice(prefix.length),[100]);
  const afterMove=entropy.snapshot();
  assert.equal(afterMove.flowAttempts-beforeEntropy.flowAttempts,1);
  assert.equal(afterMove.cryptoImports-beforeEntropy.cryptoImports,1);assert.equal(afterMove.cryptoFills-beforeEntropy.cryptoFills,1);
  assert.deepEqual(afterMove.rows.slice(beforeEntropy.rows.length).map(({bound,fills,nativeMapId})=>({bound,fills,nativeMapId})),[{bound:100,fills:1,nativeMapId:6}]);
  assert.equal(h.state().world.weather.type,'Rain','Map 6 100% entry weather is independent of the natural result');
  assert.equal(h.state().world.pendingReturn,null);new G.Game_Interpreter().command216([1]);h.tick();await flush();assert.equal(G.$gamePlayer.followers()._visible,false);
  G.$gameSystem.onBeforeSave();await G.DataManager.saveGame(1);await h.pump(()=>fs.existsSync(path.join(h.io.saveRoot,'global.rmmzsave')));h.io.assertPaths();const file=path.join(h.io.saveRoot,'file1.rmmzsave');assert(fs.statSync(file).size>0);const source={state:structuredClone(h.state()),content:h.content,maps:h.maps,nativeVisible:G.$gamePlayer.followers()._visible,gameVersion:G.$gameSystem.versionId(),draws:h.draws,nativeDraws:h.nativeDraws};fs.writeFileSync(path.join(process.env.PF_COLD_CASE_ROOT,'P01-input.json'),JSON.stringify(source,null,2)+'\n',{flag:'wx'});h.record('P01-result');return;
 }
 const beforeLoadDraws=h.draws.slice(),beforeNative=h.nativeDraws.slice(),beforeLoadEntropy=entropy.snapshot();const m=G.SceneManager;m.goto(G.Scene_Load);m.changeScene();m.updateScene();const scene=m._scene;assert(scene instanceof G.Scene_Load);const loadSuccess=scene.onLoadSuccess;let successes=0;scene.onLoadSuccess=function(...args){successes++;return Reflect.apply(loadSuccess,this,args);};scene.executeLoad(1);
 await h.pump(()=>successes===1&&m._scene instanceof G.Scene_Map&&m._scene._started&&!h.app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.companionNativePending());
 assert.equal(h.observed.loads,1);assert.equal(h.state().world.pendingReturn,null);assert.deepEqual(positions(h),[[5,9,2],[5,8,2]]);assert.deepEqual(h.render().map(x=>x.x).sort((a,b)=>a-b),[-2,-1]);assert.equal(G.$gamePlayer.followers()._visible,false);assert(h.render().every(r=>r.transparent===true));assert.deepEqual(h.state().stats,h.input.state.stats);assert.equal(h.state().steps,h.input.state.steps);assert.deepEqual(h.state().world.visitedMaps,h.input.state.world.visitedMaps);assert.deepEqual(h.state().world.weather,h.input.state.world.weather);assert.deepEqual(h.draws,beforeLoadDraws);assert.deepEqual(entropy.snapshot(),beforeLoadEntropy,'cold restore must not call real Flow RNG or native crypto');assert.equal(G.$gameMap.mapId(),6);assert.equal(G.$dataMap.width,h.input.maps[6].width);const data=G.$dataMap;
 assert.deepEqual(h.observed.rawReserves.map(x=>x[0]),kind==='C02'?[6]:[],'only original version-mismatch reload201; no raw carry/re-reserve');assert(h.requests.some(row=>/Map005\.json$/.test(row[1])),'oldmap read through actual private XHR adapter');assert(h.observed.mapLoads.slice(1).every(id=>id===6),'never setup/load old map through global DataManager');
 const afterLoadDraws=h.draws.slice(),afterLoadNative=h.nativeDraws.slice(),afterLoadEntropy=entropy.snapshot();h.record(kind+'-loaded');new G.Game_Interpreter().command216([0]);h.tick();await flush();assert.equal(G.$gamePlayer.followers()._visible,true);assert(h.render().every(r=>r.transparent===false));
 for(let n=0;n<2;n++){G.Input.dir4=6;h.tick();G.Input.dir4=0;await h.pump(()=>!G.$gamePlayer.isMoving()&&!h.app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.companionNativePending());}
 assert.deepEqual(positions(h),[[6,1,2],[6,0,2]]);assert.strictEqual(G.$dataMap,data);assert.equal(h.state().steps,h.input.state.steps+2);assert.equal(h.state().stats.distance_walked,h.input.state.stats.distance_walked+2);assert.equal(G.$gamePlayer.followers()._visible,true);h.record(kind+'-followed');fs.writeFileSync(path.join(process.env.PF_COLD_CASE_ROOT,'RNG-LOAD.json'),JSON.stringify({frameworkBefore:beforeLoadDraws,frameworkAfterLoad:afterLoadDraws,nativeBefore:beforeNative,nativeAfterLoad:afterLoadNative,afterFollow:h.draws,ordinaryEntropy:{beforeLoad:beforeLoadEntropy,afterLoad:afterLoadEntropy,afterFollow:entropy.snapshot()}},null,2)+'\n',{flag:'wx'});
 }finally{entropy.restore();}
});
