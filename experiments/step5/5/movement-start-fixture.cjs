'use strict';
// Complete installed Reactor objects.js in VM; passage/render/followers/facts/completed-counter
// controllers are synthetic. No actual App statistics port or shared production hook is installed.
require('../../../scripts/tests/ts-source-loader.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{types}=require('node:util'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const ROOT=path.resolve(__dirname,'../../..');
const INPUTS=['experiments/step5/5/movement-start-fixture.cjs','experiments/step5/5/test-movement-start-observer.cjs','scripts/tests/ts-source-loader.cjs','scripts/reactor-source-manifest.json','scripts/versions.env','js/reactor_core.js','js/reactor_objects.js'];
let E,D,nativeSources,prepared;
function pinnedNativeSources(){
 const pin=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/reactor-source-manifest.json'),'utf8')),versions=fs.readFileSync(path.join(ROOT,'scripts/versions.env'),'utf8');
 const version=name=>{const match=versions.match(new RegExp('^'+name+'="([^"\\n]+)"$','m'));assert(match,'missing fixed Reactor version: '+name);return match[1];};
 assert.equal(pin.schema,1);assert.equal(pin.repository,version('REACTOR_REPO'));assert.equal(pin.commit,version('REACTOR_COMMIT'));
 return Object.fromEntries(['reactor_core.js','reactor_objects.js'].map(name=>{
  const file=path.join(ROOT,'js',name);assert(fs.lstatSync(file).isFile(),'fixed native source must be a regular file: '+name);
  const bytes=fs.readFileSync(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.runtime['runtime/'+name],'installed Reactor differs from project pin: '+name);
  return[name,bytes.toString('utf8')];
 }));
}
// The regular parent owns the fresh distribution binding. A limited direct entry still
// uses project source + strict pinned native bytes; it never falls back to private emits.
async function loadMovement(){
 if(!prepared)prepared=(async()=>{
  if(process.env.PF_HEADLESS_REGRESSION_BINDING){const binding=require('../../../scripts/headless-regression-binding.cjs');binding.boundFiles(binding.capture(ROOT,process.env.PF_HEADLESS_REGRESSION_BINDING),INPUTS);}
  nativeSources=pinnedNativeSources();
  [E,D]=await Promise.all(['src/plugins/world/movement-start-mz.ts','src/framework/rules/movement-distance.ts'].map(file=>import(pathToFileURL(path.join(ROOT,file)).href)));
  return{fixture,D};
 })();
 return prepared;
}
const value=value=>({status:'value',value}),fact=(v,name)=>typeof v==='boolean'?value(v):{status:'unavailable',reason:name};
function fixture(options={}){
 let generation=0,application={},pass=options.pass!==false,rng=0,completed=0,nativeSteps=0,nested=false;
 const events=[],observations=[],unavailable=[],mode={surfing:false,diving:false,cycling:false,ice:false,bridge:false,ledge:false,...options.mode};
 const math=Object.create(Math);math.random=math.randomInt=()=>{rng++;throw Error('unexpected native RNG');};
 const root={Math:math,Input:{_onKeyDown(){},_onKeyUp(){}},$dataSystem:{rrLegacyMotion:!!options.legacyMotion},$dataMap:{width:options.width??6,height:6,scrollType:options.scroll??0},console};vm.createContext(root);
 const core=nativeSources['reactor_core.js'];
 for(const name of ['Number.prototype.mod','Number.prototype.clamp']){const start=core.indexOf(name+' = function'),end=core.indexOf('\n};',start);if(start<0||end<start)throw Error('fixed native numeric helper unavailable');vm.runInContext(core.slice(start,end+4),root);}
 vm.runInContext(nativeSources['reactor_objects.js'],root,{filename:'fixed-full-reactor-objects.js'});
 const map=root.$gameMap=Object.create(root.Game_Map.prototype);map._mapId=1;
 Object.assign(map,{isLadder:()=>false,isBush:()=>false,isEventRunning:()=>false,setupStartingEvent:()=>false});
 const player=root.$gamePlayer=Object.create(root.Game_Player.prototype);
 Object.assign(player,{_x:options.x??1,_y:1,_realX:options.x??1,_realY:1,_direction:2,_directionFix:false,_movementSuccess:false,_vehicleType:options.vehicle??'walk',_moveRouteForcing:false,
  _moveSpeed:4,_dashing:false,_jumpCount:0,_jumpPeak:0,_stopCount:0,_priorityType:1,_bushDepth:0,_walkAnime:false,_stepAnime:false,_characterName:'Actor1',_characterIndex:0,_pattern:1,
  _reactorCanFace:()=>false,canPass:()=>pass,canPassDiagonally:()=>pass,checkEventTriggerTouchFront(){events.push('touch');},
  checkEventTriggerHere(){events.push('arrival');},triggerAction:()=>false,updateEncounterCount(){events.push('encounter');},
  isOnBicycle(){return mode.cycling;},_followers:{updateMove(){},jumpAll(){if(options.nestedJump&&!nested){nested=true;player.jump(...options.nestedJump);}}}});
 if(options.noBicycle)delete player.isOnBicycle;
 root.$gameParty={increaseSteps(){nativeSteps++;events.push('native-increase');},onPlayerWalk(){completed++;events.push('completed');}};
 root.$gameTemp={clearDestination(){events.push('clear-destination');}};
 let movement;
 const originalIncrease=player.increaseSteps;
 // Synthetic sole installer: marker only, then the exact existing native method once.
 root.Game_Player.prototype.increaseSteps=function(...args){movement.increased(this);if(options.duplicateMarker)movement.increased(this);return Reflect.apply(originalIncrease,this,args);};
 const stockStraight=root.Game_Player.prototype.moveStraight,stockJump=root.Game_Player.prototype.jump;
 if(options.nativeWrapper)root.Game_Player.prototype.moveStraight=function(...args){const result=Reflect.apply(stockStraight,this,args);return options.nativeWrapper(result);};
 const current=()=>({application,generation,player:root.$gamePlayer,map:root.$gameMap,mapId:root.$gameMap._mapId});
 const facts=()=>{options.onFacts?.(h);return{surfing:fact(mode.surfing,'surfing'),diving:fact(mode.diving,'diving'),cycling:typeof player.isOnBicycle==='function'?fact(player.isOnBicycle(),'cycling'):{status:'unavailable',reason:'cycling-capability-missing'},
  nativeVehicle:value(player._vehicleType),ice:fact(mode.ice,'ice'),bridge:fact(mode.bridge,'bridge'),ledge:fact(mode.ledge,'ledge'),forcedRoute:fact(player.isMoveRouteForcing(),'forced-route')};};
 movement=E.createMovementStartMZ({root,current,facts,isProxy:types.isProxy,consumer:{observe(o){events.push('distance');observations.push(o);},unavailable:r=>unavailable.push(r)}});
 root.Game_Player.prototype.moveStraight=movement.moveStraight;root.Game_Player.prototype.jump=movement.jump;root.Game_Player.prototype.moveDiagonally=movement.moveDiagonally;
 const delta=()=>{const total={distance_walked:0,distance_cycled:0,distance_surfed:0,distance_slid_on_ice:0};for(const o of observations){const amount=o.kind==='straight'?1:Math.abs(o.to.x-o.from.x)+Math.abs(o.to.y-o.from.y),m=Object.fromEntries(['surfing','cycling','diving','ice','nativeVehicle'].map(k=>[k,o.facts[k].value])),r=D.movementDistanceDelta(amount,m);if(r.status!=='value')throw Error(r.reason);for(const k of Object.keys(total))total[k]+=r.delta[k];}return total;};
 const h={root,player,map,mode,movement,originalJump:stockJump,events,observations,unavailable,delta,get rng(){return rng;},get completed(){return completed;},get nativeSteps(){return nativeSteps;},
  setPass(v){pass=v;},newGeneration(){generation++;},newApplication(){application={};},
  complete(){for(let i=0;i<80&&player.isMoving();i++)player.updateMove();player.updateNonmoving(true,true);},
 };
 return h;
}
module.exports={loadMovement};
