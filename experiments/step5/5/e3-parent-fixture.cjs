'use strict';
const assert = require('node:assert/strict'), { types } = require('node:util');
const E = require(process.env.PF_E3_PARENT_BUNDLE);
const F = require('../3/fixtures-migration7/fixtures.cjs');
const {host, location} = require('./e3-parent-native-fixture.cjs');
const initialScene = require('./e3-production/native-source-scene.cjs');
const value = value => ({status:'value',value}), clone = value => structuredClone(value), flush = () => new Promise(setImmediate);
async function fixture(options={}) {
  let app, instance, owner, lastReceipt, confirmed, confirmationError;
  const native = await host({
    nativeIsProxy:types.isProxy,
    isOwnerCurrent:o=>app?.isWorldTravelOwner(o)===true,
    isCurrent:(o,r)=>app?.isWorldTravelReceipt(o,r)===true,
    beforePerform:(o,r)=>app?.canPerformWorldTravel(o,r)===true,
    confirmArrival(o,r,observation){confirmed=app.confirmWorldTravelArrival(o,r,observation); options.afterConfirm?.(instance,confirmed); return confirmed;},
    transferFailed(o,r,reason,observation){app.failWorldTravelTransfer(o,r,reason,observation);},
    diagnostic:reason=>{confirmationError=reason;},
    ...(options.surf?{surf:{passageMode:'boat',terrain:tag=>value({canSurf:true,waterfall:false,waterfallCrest:false})}}:{}),
  },{surf:options.surf===true,beforeInstall:options.nativeSetup??initialScene.install});
  const {root,map,player}=native;
  map._mapId=map.id;Object.defineProperty(map,'id',{get(){return this._mapId;},set(value){this._mapId=value;}});
  player._x=player.x;player._y=player.y;
  for(const key of ['x','y'])Object.defineProperty(player,key,{get(){return this['_'+key];},set(value){this['_'+key]=value;}});
  if(options.nativeSetup)root.SceneManager._scene={};root.$gameSwitches._data=[];
  const content=F.content(E);for(const kind of ['fly','dig','teleport'])content.moves[kind]={id:kind,name:kind,pp:10};
  content.mapMetadata={source:'e3-parent-fixture',maps:{1:{outdoor:true,mapPosition:{regionId:0,x:0,y:0}},2:{outdoor:true,healingSpot:{mapId:2,x:2,y:1},weather:{type:'Rain',chance:100}},3:{outdoor:true,healingSpot:{mapId:3,x:1,y:1}}}};
  content.world={regionMaps:{source:'literal',regions:[{id:0,nameKey:'r0',points:[{x:5,y:6,healingSpot:{mapId:2,x:1,y:1}}]},{id:1,nameKey:'r1',points:[{x:2,y:3,healingSpot:{mapId:3,x:1,y:1}}]}]},mapConnections:{source:'literal',connections:[{a:{mapId:1,anchor:'E',offset:0},b:{mapId:2,anchor:'W',offset:0}}]}};
  options.editContent?.(content);
  const loaded={current:content}, state=E.state.newGame({content,party:[F.member('P1',{hp:10,friendship:70,moves:[{id:options.move??'fly',pp:0,maxpp:10,ppUps:0}]})]});
  state.badges=Array(9).fill(true);state.world.visitedMaps=[1,2,3];state.world.escapePoint=location(3,1,1,8);state.world.healingSpot={mapId:2,x:1,y:1};
  options.editState?.(state);root.$gameSystem={_psGame:state};
  const draws=[],effects=[],legacyWrites=[],saves=[],arrivals=[],connectionPortCalls=[]; const stepOwner={};
  const legacy={read(){options.onRead?.(instance);return root.$gameSystem._psGame;},replace(next){legacyWrites.push(next);root.$gameSystem._psGame=next;}};
  const atomic=E.createMZAtomicStatePort(root,legacy,types.isProxy,{owner:loaded,key:'current'},native.transfer.nativeLeaseSource);
  for(const key of ['atomic','atomicWorld','atomicWorldContent','atomicFieldQuery']){const call=atomic[key];if(typeof call==='function')atomic[key]=function(...args){try{return Reflect.apply(call,this,args);}catch(error){console.error('E3_REAL_ATOMIC_THROW',key,error?.stack??String(error));throw error;}};}
  const travel={...native.transfer,
    async preload(o,t){owner=o;options.onPreload?.(instance,o,t);return native.transfer.preload(o,t);},
    reserve(o,r,m){lastReceipt=r;options.onReserve?.(instance,o,r,m);return native.transfer.reserve(o,r,m);},
    facts(){options.onFacts?.(instance);return {characterHome:null,globalHome:null,switches:options.switches??{},debug:false,connectionBypass:false};},
    async confirm(kind,target){effects.push('confirm:'+kind);return options.confirm?options.confirm(kind,target,instance):'confirmed';},
    async effect(kind){effects.push(kind);return options.effect?options.effect(kind,instance):{status:'done'};},
    async waitFlyTail(ms){effects.push('wait:'+ms);return options.wait?options.wait(ms,instance):{status:'done'};},
    // Explicit synthetic void host ports for this App component only; no native gateway/ACK claim.
    finishConnectionStep(o,r,outcome){connectionPortCalls.push({kind:'finish',owner:o,receipt:r,outcome});console.error('E3_COMPONENT_VOID_PORT',JSON.stringify({kind:'finish',ordinal:connectionPortCalls.length,ownerMatchesCurrent:o===owner,receiptMatchesCurrent:r===lastReceipt,outcome:outcome.status,stepCommitted:outcome.prefix.stepCommitted}));},
    cancelConnectionStep(o,r){connectionPortCalls.push({kind:'cancel',owner:o,receipt:r});console.error('E3_COMPONENT_VOID_PORT',JSON.stringify({kind:'cancel',ordinal:connectionPortCalls.length,ownerMatchesCurrent:o===owner,receiptMatchesCurrent:r===lastReceipt}));},
    connectionStepFacts(o,r){options.onStepFacts?.(instance);return {ice:false,regionId:0,terrainTag:0,sceneActive:true};},
    releaseRecoveredArrival(o,physical,birth,guard){
      options.onRecoveryRelease?.(instance,o,physical,birth,guard);
      return E.releaseRecoveredArrivalMZ(root,()=>app,native.transfer,physical,birth,guard,types.isProxy);
    },
    resumeDeferredSave(){saves.push('resume');options.onSave?.(instance);},
    retireTransfer(o,r){if(options.onRetire)return options.onRetire(instance,o,r);return typeof native.transfer.retireTransfer==='function'?native.transfer.retireTransfer(o,r):{status:'failed',reason:'native-retirement-not-implemented'};},
  };
  const current=()=>({hostOwner:stepOwner,generation:app.stateGeneration,player,map,mapId:map._mapId,x:player._x,y:player._y});
  if(!options.nativeSetup)initialScene.start(root);
  app=new E.GameApplication({state:options.noAtomic?legacy:atomic,content(){options.onContent?.(instance);return {content:loaded.current};},sessions:{async create(){throw Error('unexpected battle');}},projection:{project(){}},worldTravel:travel,
    clock:()=>1000,random(n){draws.push(n);options.onRandom?.(instance,n);return 0;},
    worldHost:{read(){return {mapId:value(map._mapId),hour:value(12),cycling:value(false),diving:value(false)};}},
    completedSteps:{current,async openRepelSelection(){return {status:'cancelled'};},async present({effect}){return {id:effect.id,status:'completed'};},dispatchArrival(request){arrivals.push(request.step);return {status:'event-dispatched'};}},
  });
  // Bounded component composition: the canonical publisher reads the exact installed App/game/content cells.
  root.PSFlow={_app:app,_content:content};
  native.transfer.installMovementStart({readState:()=>({application:app,game:root.$gameSystem._psGame,content:root.PSFlow._content})});
  const complete=app.world.completeStep;app.world.completeStep=function(...args){const pending=Reflect.apply(complete,this,args);pending.then(result=>console.error('E3_REAL_D_RESULT',JSON.stringify(result)),error=>console.error('E3_REAL_D_THROW',error?.stack??String(error)));return pending;};
  const retry=app.retryWorldTravel;app.retryWorldTravel=function(...args){const pending=Reflect.apply(retry,this,args);pending.then(result=>console.error('E3_REAL_RETRY_RESULT',JSON.stringify({result,scene:{started:root.SceneManager._scene?._started,active:root.SceneManager._scene?._active,mapLoaded:root.SceneManager._scene?._mapLoaded},point:[map._mapId,player._x,player._y],transferring:player.isTransferring()})),error=>console.error('E3_REAL_RETRY_THROW',error?.stack??String(error)));return pending;};
  instance={E,app,native,root,player,map,travel,content,loaded,draws,effects,legacyWrites,saves,arrivals,connectionPortCalls,
    get state(){return root.$gameSystem._psGame;},get owner(){return owner;},get receipt(){return lastReceipt;},get confirmed(){return confirmed;},get confirmationError(){return confirmationError;},
    run(kind='fly',requestId='travel'){return app.runWorldTravel(requestId,typeof kind==='string'?{kind,...(kind==='fly'?{selection:{regionId:0,x:5,y:6,pointIndex:0,target:{mapId:2,x:1,y:1}}}:{}),...(kind==='dig'||kind==='teleport'?{memberId:'P1'}:{})}:kind);},
    arrive(){try{if(!options.nativeSetup&&player.isTransferring()){root.SceneManager.goto(root.Scene_Map);root.SceneManager.changeScene();root.SceneManager.updateScene();}else player.performTransfer();return confirmed;}catch(error){
      // This component deliberately injects synchronous facts faults inside native perform.
      // Finish only the same already-landed receiver's real loading lifecycle, then rethrow the original fault.
      const manager=root.SceneManager,scene=manager._scene,target=lastReceipt?.target;
      if(!options.nativeSetup&&target&&lastReceipt.generation===app.stateGeneration&&loaded.current===content&&!player.isTransferring()&&manager._nextScene===null&&scene instanceof root.Scene_Map&&!scene.isStarted()&&map._mapId===target.mapId&&player._x===target.x&&player._y===target.y&&player._direction===target.direction){
       const game=root.$gameSystem._psGame,prior=draws.slice(),generation=app.stateGeneration;try{manager.updateScene();assert.equal(manager._scene,scene);assert.equal(app.stateGeneration,generation);assert.equal(root.$gameSystem._psGame,game);assert.deepEqual(draws,prior);console.error('E3_COMPONENT_RECEIVER_SETTLED',JSON.stringify({started:scene._started,mapLoaded:scene._mapLoaded,noGameWrite:root.$gameSystem._psGame===game,noDraw:draws.length===prior.length}));}catch(settleError){console.error('E3_COMPONENT_RECEIVER_SETTLE_THROW',String(settleError));if(settleError instanceof assert.AssertionError)throw settleError;}
      }throw error;
    }},finish(){const pending=app.finishWorldTravelArrival(lastReceipt);pending.then(result=>{if(result.status!=='completed')console.error('E3_REAL_FINISH_RESULT',JSON.stringify({result,hostMethods:{finishConnectionStep:typeof travel.finishConnectionStep,cancelConnectionStep:typeof travel.cancelConnectionStep},receipt:lastReceipt}));},error=>console.error('E3_REAL_FINISH_THROW',String(error)));return pending;},flush,
    external(change){const next=clone(this.state);change(next);root.$gameSystem._psGame=next;},
  };
  return instance;
}
module.exports={fixture,clone,value,location,flush};
