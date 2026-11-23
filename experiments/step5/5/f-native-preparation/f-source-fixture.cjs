'use strict';
const assert=require('node:assert/strict');
const {birthFixture,flush}=require('./map-birth-fixture.cjs');
async function sourceFixture(options={}){
 let h,owner,context,source,announced=0,release,waitResult;
 h=await birthFixture({noSaveRequest:true,applicationPorts(ports){
  source=ports.worldTravel.blackoutSource;assert(source,'actual Flow closure exposes the one real native source through its installed travel port');
  // Only the source stage is in scope. The genuine App's other F effects never receive a fake done.
  const unexpected=()=>{throw Error('outside-source-stage');};
  ports.blackout={configuration:()=>({characterHome:null,globalHome:null}),
   armSource(o,c){owner=o;context=c;return source.armSource(o,c);},
   async waitSource(o,c){waitResult=await source.waitSource(o,c,async guard=>{guard();await flush();h.tick();guard();});return waitResult;},
   retireSource:(o,c)=>source.retireSource(o,c),
   announce(){announced++;return new Promise(resolve=>{release=()=>resolve({status:'failed',reason:'bounded-source-observation-finished'});});},
   prepare:unexpected,requestMapRefresh:unexpected,adoptDeferredSave:unexpected,transferCompleted:unexpected};
 }});
 await h.fresh();
 if(options.menu){h.G.SceneManager.goto(h.G.Scene_MenuBase);h.tick();await flush();assert(h.G.SceneManager._scene instanceof h.G.Scene_MenuBase);}
 const saved={id:'actual-source-resume',origin:{kind:'field',sourceId:'saved-source'},selection:{branch:'home',target:{mapId:7,x:1,y:1,direction:8}},phase:'announce',branch:null};
 h.state().world.pendingReturn=saved;
 const begin=()=>h.app.recoverBlackoutReturn();
 const stop=async promise=>{h.app.cancelBlackoutReturn();release?.();if(promise)await promise;await flush();};
 return {...h,source,begin,stop,get owner(){return owner;},get context(){return context;},get announced(){return announced;},get waitResult(){return waitResult;}};
}
module.exports={sourceFixture,flush};
