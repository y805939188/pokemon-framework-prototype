'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ordinaryObservers,flush}=require('../travel-mz-world-travel-fixture.cjs');
const {fixture,expectOrdinary,endObservation}=ordinaryObservers();test.afterEach(endObservation);
const directions=[['E','W',6,9,2,0,2],['W','E',4,0,2,9,2],['N','S',8,2,0,2,7],['S','N',2,2,7,2,0]];
async function connection({from='E',to='W',direction=6,x=9,y=2,offset=0,failed=false}){
 const h=await fixture({
  connection:true,
  edit(game,c){c.world.mapConnections.connections=[{a:{mapId:5,anchor:from,offset},b:{mapId:6,anchor:to,offset:0}}];},
  nativeSetup(n){
   // Real Game_Player.locate initializes the native step countdown before Flow/World install.
   // Supply the source map's ordinary encounterStep (Map005 = 20) and distinguish this pair
   // from framework RNG used later to select target entry weather. Do not erase either tape.
   n.G.$dataMap.encounterStep=20;assert.equal(n.G.$gameMap.encounterStep(),20);
   assert.deepEqual(n.nativeDraws,[]);n.player.locate(x,y);n.player.setDirection(direction);
   assert.deepEqual(n.nativeDraws,[20,20]);
   if(failed){
    const XHR=n.G.XMLHttpRequest;
    n.G.XMLHttpRequest=class extends XHR{
     send(){if(/Map006\.json$/.test(this.url)){queueMicrotask(()=>this.onerror());return;}super.send();}
    };
   }
  }
 });
 const G=h.G;G.$gameSystem.disableEncounter();let result;const calls=[],run=h.app.runWorldTravel.bind(h.app);h.app.runWorldTravel=(...args)=>{calls.push(args);return Reflect.apply(run,h.app,args).then(value=>{result=value;return value;});};
 const before={state:structuredClone(h.state()),data:G.$dataMap,player:[h.player.x,h.player.y],draws:h.draws.slice()};expectOrdinary(h,[],'weather',[20,20]);G.Input.dir4=direction;h.tick();G.Input.dir4=0;await h.pump(()=>result!==undefined);
 return{...h,G,before,result,calls};
}
for(const[from,to,direction,x,y,tx,ty]of directions)test('current actual Flow/native '+from+' connection commits one target step',async()=>{
 const h=await connection({from,to,direction,x,y});assert.equal(h.result.status,'awaiting-arrival');await h.pump(()=>!h.app.saveBlocked&&!h.G.PSWorld.pending()&&h.G.SceneManager._scene._started);assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].kind,'connection');assert.deepEqual([h.G.$gameMap.mapId(),h.player.x,h.player.y],[6,tx,ty]);assert.equal(h.state().steps,h.before.state.steps+1);assert.equal(h.state().stats.distance_walked,h.before.state.stats.distance_walked+1);assert.equal(h.arrivals(),1);assert.equal(h.trace.filter(r=>r[0]==='native-reserve').length,1);expectOrdinary(h,[100],'weather',[20,20]);assert.equal((await h.app.finishWorldTravelArrival(h.result.receipt)).status,'completed');assert.equal(h.state().steps,h.before.state.steps+1);assert.equal(h.arrivals(),1);assert.equal(h.sessions.length,0,'no fake/real battle Session used for travel acceptance');
});
test('current actual Flow/native offset connection uses distinct anchor coordinates',async()=>{
 const h=await connection({offset:1});assert.equal(h.result.status,'awaiting-arrival');await h.pump(()=>!h.app.saveBlocked&&!h.G.PSWorld.pending());assert.deepEqual([h.G.$gameMap.mapId(),h.player.x,h.player.y],[6,0,1]);assert.equal(h.state().steps,h.before.state.steps+1);assert.equal(h.arrivals(),1);assert.equal(h.trace.filter(r=>r[0]==='native-reserve').length,1);
});
test('current actual Flow/native connection load failure keeps source without target step',async()=>{
 const h=await connection({failed:true});assert.equal(h.result.status,'failed');await h.pump(()=>!h.app.saveBlocked&&!h.G.PSWorld.pending());assert.equal(h.G.$gameMap.mapId(),5);assert.deepEqual([h.player.x,h.player.y],h.before.player);assert.strictEqual(h.G.$dataMap,h.before.data);assert.deepEqual(h.state(),h.before.state);assert.equal(h.arrivals(),0);assert.equal(h.trace.filter(r=>r[0]==='native-reserve').length,0);expectOrdinary(h,[],'weather',[20,20]);assert.deepEqual(h.draws,h.before.draws);assert(h.requests.some(row=>/Map006\.json$/.test(row[1])));
});
for(const move of['dig','teleport'])test('current actual '+move+' confirmed old native Map/receipt cannot affect new generation raw201',async()=>{
 const h=await fixture({move}),G=h.G,sourceScene=G.SceneManager._scene;let result,error,settled=false;G.PSFlow.runWorldTravel('late-'+move,{kind:move,memberId:h.state().party[0].id}).then(value=>{result=value;settled=true;},value=>{error=value;settled=true;});await h.pump(()=>G.$gameMessage.isChoice());G.$gameMessage.onChoice(0);G.$gameMessage.clear();await h.pump(()=>settled,100);if(error)throw error;assert(result);assert.equal(result.status,'awaiting-arrival');assert(h.player.isTransferring());
 // Observe publication in the old Map update, before the next changeScene can consume it.
 await h.pump(()=>G.SceneManager._nextScene!==null,100);const old=G.SceneManager._nextScene;assert(old instanceof G.Scene_Map);assert.strictEqual(G.SceneManager._scene,sourceScene);G.PSFlow.stateReplaced();const state=structuredClone(h.state()),data=G.$dataMap,scene=G.SceneManager._scene;
 h.player.reserveTransfer(7,2,3,8,0);try{old.isReady();}catch(e){assert.match(String(e),/travel-|world-|stale|retired|source|construct/);}assert.notEqual((await h.app.finishWorldTravelArrival(result.receipt)).status,'completed');assert.equal(h.player.isTransferring(),true);assert.deepEqual([h.player._newMapId,h.player._newX,h.player._newY,h.player._newDirection],[7,2,3,8]);assert.deepEqual(h.state(),state);assert.strictEqual(G.$dataMap,data);assert.strictEqual(G.SceneManager._scene,scene);assert.equal(h.app.saveBlocked,false);
});

test('current native resource loading prevents target D until actual readiness',async()=>{
 const h=await fixture({connection:true}),G=h.G;G.$gameSystem.disableEncounter();h.bitmap._loadingState='loading';let result;G.PSFlow.runWorldTravel('resource-wait',{kind:'connection'}).then(value=>{result=value;});for(let i=0;i<100&&!result;i++)await flush();assert.equal(result?.status,'awaiting-arrival');for(let i=0;i<3;i++){h.tick();await flush();}assert.equal(G.SceneManager._scene._started,false);assert.equal(h.state().steps,0);assert.equal(h.stepCalls.length,0);assert.equal(h.arrivals(),0);assert.equal(h.saves.length,0);assert.equal(h.app.saveBlocked,true);h.bitmap._loadingState='loaded';await h.pump(()=>!h.app.saveBlocked&&!G.PSWorld.pending());assert.equal(h.state().steps,1);assert.equal(h.arrivals(),1);assert.equal((await h.app.finishWorldTravelArrival(result.receipt)).status,'completed');expectOrdinary(h,[100]);
});
test('current native resource error propagates original LoadError and never acknowledges target D',async()=>{
 const h=await fixture({connection:true}),G=h.G,sourceScene=G.SceneManager._scene,readiness=[],loadErrors=[];
 const imageReady=G.ImageManager.isReady,loadError=G.ImageManager.throwLoadError;
 G.ImageManager.isReady=function(...args){const scene=G.SceneManager._scene;readiness.push({scene,started:scene._started,mapLoaded:scene._mapLoaded});return Reflect.apply(imageReady,this,args);};
 G.ImageManager.throwLoadError=function(...args){loadErrors.push(args[0]);return Reflect.apply(loadError,this,args);};
 assert.equal(!!G.$dataSystem.rrSkipMissingImages,false,'this case exercises the native strict missing-image policy');
 G.$gameSystem.disableEncounter();h.bitmap._loadingState='error';let result;G.PSFlow.runWorldTravel('resource-error',{kind:'connection'}).then(value=>{result=value;});for(let i=0;i<100&&!result;i++)await flush();assert.equal(result?.status,'awaiting-arrival');
 // A Map update first queues the target; a later manager tick consumes its real readiness.
 await assert.rejects(async()=>{for(let i=0;i<100;i++){h.tick();await flush();}},error=>Array.isArray(error)&&error[0]==='LoadError'&&error[1]===h.bitmap.url&&typeof error[2]==='function');
 assert(readiness.some(row=>row.scene===G.SceneManager._scene&&row.scene!==sourceScene&&row.scene instanceof G.Scene_Map&&row.started===false&&row.mapLoaded===true));assert.equal(loadErrors.length,1);assert.strictEqual(loadErrors[0],h.bitmap);
 assert.equal(h.state().steps,0);assert.equal(h.stepCalls.length,0);assert.equal(h.arrivals(),0);assert.equal(h.saves.length,0);assert.equal(h.app.saveBlocked,true);assert.equal(h.app.cancelWorldTravel('resource-error').status,'cancelled');assert.notEqual((await h.app.finishWorldTravelArrival(result.receipt)).status,'completed');
});

test('current actual native gateway target-facts retry never repeats physical/B/D prefix',require('./case-connection-retry.cjs'));
