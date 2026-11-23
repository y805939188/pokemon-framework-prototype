const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture:base,flush}=require('../g-native-commands/e3-ingress-base.cjs');
const {callWithReceipt}=require('../companion-cold-native-joint/empty-receipt-input-support.cjs');
const {countCharacterUpdates}=require('./phase-observer-support.cjs');
const sprites=fs.readFileSync(process.env.PF_E3_NATIVE_ROOT+'/js/reactor_sprites.js','utf8');
function visuals(n,{maps}){
 const G=n.G;
 const scenes=fs.readFileSync(process.env.PF_E3_NATIVE_ROOT+'/js/reactor_scenes.js','utf8');const name='Scene_Map.prototype.isReady',aReady=scenes.indexOf(name+' = function'),bReady=scenes.indexOf('\n};',aReady);assert(aReady>=0&&bReady>aReady);vm.runInContext(scenes.slice(aReady,bReady+4),G,{filename:'pinned-Reactor:Scene_Map.isReady'});G.DataManager.isMapLoaded=()=>G.$dataMap!==null;G.Scene_Message.prototype.isReady=()=>true;
 function Sprite(){this.initialize();}Object.assign(Sprite.prototype,{initialize(){this.anchor={};this.scale={};this.skew={};this.children=[];this.visible=true;},update(){},updateVisibility(){this.visible=true;},setFrame(){},addChild(c){if(c.parent)c.parent.removeChild(c);this.children.push(c);c.parent=this;return c;},removeChild(c){this.children=this.children.filter(x=>x!==c);if(c.parent===this)c.parent=null;return c;},destroy(){this.destroyed=true;if(this.parent)this.parent.removeChild(this);}});
 G.Sprite=Sprite;G.ImageManager.isObjectCharacter=()=>false;G.ImageManager.isBigCharacter=()=>false;G.ImageManager.loadCharacter=()=>({width:576,height:384});G.ImageManager.loadTileset=()=>({width:768,height:768});G.Reactor3D={shouldRender3D:()=>false,viewport:()=>null,updateMapModelSprite(){},beginPrepare(){},isPrepared:()=>true};
 const a=sprites.indexOf('function Sprite_Character()'),b=sprites.indexOf('function Sprite_Battler()',a);assert(a>=0&&b>a);vm.runInContext(sprites.slice(a,b),G,{filename:'pinned-Reactor:Sprite_Character'});
 const page={conditions:{switch1Valid:false,switch2Valid:false,variableValid:false,selfSwitchValid:false,itemValid:false,actorValid:false},image:{tileId:0,characterName:'Actor2',characterIndex:1,direction:2,pattern:1},priorityType:1,through:false,trigger:0,moveType:0,moveSpeed:3,moveFrequency:3,moveRoute:{list:[{code:0,parameters:[]}],repeat:true,skippable:false,wait:false},walkAnime:true,stepAnime:false,directionFix:false,list:[{code:0,parameters:[]}]};
 for(const id of[1,2])maps[5].events[id]={id,name:'source'+id,x:id,y:1,pages:[structuredClone(page)]};
 G.$dataMap=maps[5];G.$gameMap._events=[];for(const id of[1,2])G.$gameMap._events[id]=new G.Game_Event(5,id);
 G.$gamePlayer.followers().show();const parent=new Sprite();G.SceneManager._scene._spriteset={_tilemap:parent};
 G.$dataSystem.switches=Array(10).fill('');return{parent};
}
async function fixture(options={}){
 const nativeConsumer=require('./native-consumer-observer.cjs').observer();
 let visual,h,prepareCount=0,channelCount=0,controller,preparedSeen,service,mapFrames=0;const characterUpdates=new Map(),sourceReceiptErrors=[];
 h=await base({connection:true,edit:options.edit,applicationPorts(ports){
   const connect=ports.blackoutProjection.connect;
   nativeConsumer.observePorts(ports);
   options.observePorts?.(ports);options.capturePorts?.(ports);
   ports.blackoutProjection={connect(connection){service=connection.service;channelCount++;const real=Reflect.apply(connect,this,[connection]);controller=real.controller;
     options.connected?.({connection,real});
     return{...real,companions:{...real.companions,
       async prepare(...args){prepareCount++;const result=await Reflect.apply(real.companions.prepare,real.companions,args);if(result.status==='value')preparedSeen=result.value;await options.afterPrepare?.({h,connection,real,result,intent:args[0]});return result;},
       bind(prepared,binding){const actual=Reflect.apply(real.companions.bind,real.companions,[prepared,binding]);options.bound?.({h,prepared,binding,actual});
         return{source:(...args)=>{options.sourceRead?.({h,prepared,args});return callWithReceipt(actual.source,actual,args,options.sourceReceipt,sourceReceiptErrors,{h,prepared});},trail:{...actual.trail,canEnter(...args){options.beforeCanEnter?.({h,prepared,binding,args});return Reflect.apply(actual.trail.canEnter,actual.trail,args);}},move:(...args)=>Reflect.apply(actual.move,actual,args),
           async project(...args){options.beforeProject?.({h,visual,prepared,binding,real,projection:args[0]});const value=await Reflect.apply(actual.project,actual,args);options.afterProject?.({h,prepared,binding,projection:args[0]});return value;}};
       }
     }};
   }};
 },nativeSetup(n,more){visual=visuals(n,more);const G=n.G,frame=G.Scene_Map.prototype.update,character=G.Game_Character.prototype.update;G.Scene_Map.prototype.update=function(...args){mapFrames++;return Reflect.apply(frame,this,args);};G.Game_Character.prototype.update=countCharacterUpdates(character,characterUpdates);const original=n.G.Scene_Map.prototype.createDisplayObjects;n.G.Scene_Map.prototype.createDisplayObjects=function(...args){const out=Reflect.apply(original,this,args);this._spriteset={_tilemap:visual.parent};return out;};options.nativeSetup?.(n,more);}});
 async function settle(promise){let result,error,done=false;Promise.resolve(promise).then(v=>{result=v;done=true;},e=>{error=e;done=true;});for(let i=0;i<90&&!done;i++){h.G.$gameMessage.clear();await flush();}assert(done,'bounded companion completion');if(error)throw error;return result;}
 nativeConsumer.install(h.G,h.app);
 const previous=h.G.SceneManager._scene;h.G.PSWorld.loadSucceeded();h.G.SceneManager.goto(h.G.Scene_Map);await h.pump(()=>h.G.SceneManager._scene!==previous&&h.G.SceneManager._scene?._started===true);h.G.SceneManager._scene._spriteset={_tilemap:visual.parent};
 await h.pump(()=>nativeConsumer.ready()&&!h.G.PSWorld.pending()&&!h.G.PSFlow.companionNativePending()&&!h.app.saveBlocked);const initialized=await settle(h.app.initializeBlackoutCompanions());assert(initialized&&initialized.status==='completed',JSON.stringify(initialized));
 return{...h,visual,settle,nativeConsumer,sourceReceiptErrors,get channelCount(){return channelCount;},get controller(){return controller;},get service(){return service;},get mapFrames(){return mapFrames;},get characterUpdates(){return characterUpdates;},get preparedSeen(){return preparedSeen;},get prepareCount(){return prepareCount;},records:()=>h.state().world.companions};
}
module.exports={fixture,flush};
