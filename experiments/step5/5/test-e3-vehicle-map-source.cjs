'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {ordinaryObservers,flush}=require('./e3-mz-world-travel-fixture.cjs');
const {fixture,expectOrdinary,expectFoot,endObservation,receipt}=ordinaryObservers();test.afterEach(endObservation);
const rows=[],results=process.env.PF_E3_MAPSOURCE_RESULTS;if(!results)throw Error('explicit private source result path required');let random;test.before(()=>{random=Math.random;Math.random=()=>assert.fail('unregistered RNG');});test.after(()=>{Math.random=random;});
async function board(h){const G=h.G,v=G.$gameMap.boat();G.$dataSystem.boat.bgm={name:'',volume:0,pitch:100,pan:0};v.setLocation(5,h.player.x+1,h.player.y);assert.equal(h.player.getOnVehicle(),true);await h.pump(()=>h.player.isInVehicle()&&!h.player._vehicleGettingOn&&!h.player.isMoving()&&!h.app.saveBlocked&&!G.PSWorld.pending());assert.equal(v._driving,true);return v;}
for(const mode of ['normal','map-id-and-data','map-id-only','data-only'])test('native getOff source '+mode+' must stop stale pose writes and preserve the genuine prefix',async()=>{
 // Boarding advances a genuine Map005 step. Preserve its ordinary random opportunity; even
 // a rare positive roll must leave boarding (the subject of this test) free of a wild battle.
 const h=await fixture({move:'dig',repel:10,edit(game,content){
  assert.equal(game.party[0].level,5);const land=content.world.encounters.tables.find(row=>row.mapId===5).types.Land;
  assert.equal(land.stepChance,1);assert.equal(land.slots.length,1);land.slots[0].minLevel=land.slots[0].maxLevel=1;
 }}),G=h.G;expectOrdinary(h,[]);const v=await board(h);expectFoot(h,1);const boardDraws=receipt(h);
 const map=G.$gameMap,native=v.getOff,point={x:h.player.x,y:h.player.y};let called=0,providerPose;
 v.getOff=function(){called++;const result=Reflect.apply(native,this,arguments);if(mode==='map-id-and-data'||mode==='data-only')G.$dataMap=h.maps[6];if(mode==='map-id-and-data'||mode==='map-id-only')map.setup(6);providerPose={type:h.player._vehicleType,transparent:h.player.isTransparent(),driving:v._driving,mapId:map.mapId(),sameMap:G.$gameMap===map};return result;};
 const generation=h.app.stateGeneration,content=G.PSFlow.content(),scene=G.SceneManager._scene,sourceData=G.$dataMap;
 let outcome;const request=G.PSFlow.runWorldTravel('map-source-dismount-'+mode,{kind:'dig',memberId:'d-mz-player'});request.then(value=>{outcome=value;});await h.pump(()=>G.$gameMessage.isChoice());G.$gameMessage.onChoice(0);G.$gameMessage.clear();
 if(mode==='normal')await h.pump(()=>outcome!==undefined);
 else{
  // These cases invalidate this Scene's map source without creating a new Scene.
  let completed=false;
  for(let frame=0;frame<140;frame++){
   if(outcome!==undefined){
    assert.equal(outcome,await request);assert.equal(outcome.status,'failed');
    assert.equal(G.PSFlow._app,h.app);assert.equal(h.app.stateGeneration,generation);assert.equal(G.PSFlow.content(),content);assert.equal(G.SceneManager._scene,scene);
    assert.equal(G.$gameMap,map);assert.equal(map.mapId(),mode==='data-only'?5:6);assert.equal(G.$dataMap,mode==='map-id-only'?sourceData:h.maps[6]);
    if(!h.app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.worldAuthorInputPending()&&!h.player.isTransferring()){completed=true;break;}
   }
   G.$gameMessage.clear();h.tick();await flush();
  }
  assert.equal(completed,true,'this failed map-source request must return and release its public pending state within140 frames');
 }
 const observed={case:mode,outcome,called,providerPose,after:{type:h.player._vehicleType,transparent:h.player.isTransparent(),driving:v._driving,mapId:G.$gameMap.mapId(),sameMap:G.$gameMap===map,x:h.player.x,y:h.player.y},reserves:h.trace.filter(x=>x[0]==='native-reserve').length,draws:h.draws,ordinary:receipt(h),nativeDraws:h.nativeDraws};rows.push(observed);fs.writeFileSync(results,JSON.stringify(rows,null,2)+'\n');assert.equal(called,1);assert.equal(v._driving,false,'genuine native getOff prefix is retained');
 if(mode!=='normal'){assert.equal(outcome.status,'failed');assert.equal(providerPose.sameMap,true);assert.equal(providerPose.mapId,mode==='data-only'?5:6);assert.equal(providerPose.type,'boat');assert.equal(observed.reserves,0);assert.equal(h.player._vehicleType,'boat','old dismount must stop before pose writes when native map source changes');assert.equal(h.player.isTransparent(),true);assert(h.state().world.escapePoint);assert.equal(h.app.saveBlocked,false);}
 else {assert.equal(outcome.status,'awaiting-arrival');assert.equal(h.player._vehicleType,'walk');assert.equal(h.player.isTransparent(),false);assert.equal(observed.reserves,1);}
 assert.equal(h.player.x,point.x);assert.equal(h.player.y,point.y);expectFoot(h,1);assert.deepEqual(receipt(h),boardDraws,'getOff and the stale-source fence do not draw again');assert.deepEqual(h.nativeDraws,[]);
});
