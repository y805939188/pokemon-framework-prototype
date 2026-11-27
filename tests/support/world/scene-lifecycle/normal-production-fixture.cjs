'use strict';
const assert=require('node:assert/strict');const {fixture:prior,flush}=require('./nontransfer-production-fixture.cjs');
const companion=()=>({originMapId:5,originEventId:2,name:'Actual companion',location:{mapId:5,x:1,y:1,direction:2},visible:true,appearance:{characterName:'WalkFixture',characterIndex:0,tileId:0,pattern:1,opacity:255,blendMode:0,walkAnime:true,stepAnime:false}});
const event=()=>({id:2,name:'Companion source',x:1,y:1,pages:[{conditions:{switch1Valid:false,switch2Valid:false,variableValid:false,selfSwitchValid:false,itemValid:false,actorValid:false},image:{tileId:0,characterName:'WalkFixture',characterIndex:0,direction:2,pattern:1},priorityType:1,through:false,trigger:0,moveType:0,moveSpeed:3,moveFrequency:3,moveRoute:{list:[{code:0,parameters:[]}],repeat:true,skippable:false,wait:false},walkAnime:true,stepAnime:false,directionFix:false,list:[{code:0,parameters:[]}]}]});
async function fixture(options={}){
 const rendering={parents:[],sprites:[],events:[],clear:[],refresh:[],raw:[],original:[],reserves:[]};let h;
 h=await prior({edit(game,content){game.world.companions=[companion()];game.world.recentCenter=options.home?null:{mapId:7,x:2,y:1,direction:4};game.world.healingSpot={mapId:6,x:1,y:2};options.edit?.(game,content);},nativeSetup(n){const G=n.G,p=G.Scene_Map.prototype;
  G.$dataMap.events[2]=event();G.$gameMap._events[2]=new G.Game_Event(5,2);G.$dataSystem.optFollowers=true;G.$dataSystem.switches=["","StartingOver"];G.$gamePlayer.followers()._visible=true;
  function Parent(){this.children=[];rendering.parents.push(this);}Parent.prototype.addChild=function(sprite){if(sprite.parent)sprite.parent.removeChild(sprite);this.children.push(sprite);sprite.parent=this;return sprite;};Parent.prototype.removeChild=function(sprite){rendering.events.push(['remove',G.$gameSystem._psGame.world.companions.length]);this.children=this.children.filter(x=>x!==sprite);if(sprite.parent===this)sprite.parent=null;return sprite;};
  G.Sprite_Character=function(character){this._character=character;this.destroyed=false;this.parent=null;rendering.sprites.push(this);};G.Sprite_Character.prototype.destroy=function(){rendering.events.push(['destroy',G.$gameSystem._psGame.world.companions.length]);if(this.parent)this.parent.removeChild(this);this.destroyed=true;};
  const display=p.createDisplayObjects;p.createDisplayObjects=function(...args){const result=Reflect.apply(display,this,args);this._spriteset={_tilemap:new Parent()};return result;};
  const pars=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const value=pars(name);return name==='PS_World'?{...value,CharacterHome:options.characterHomeAbsent?'':JSON.stringify({mapId:7,x:1,y:1,direction:8}),GlobalHome:JSON.stringify({mapId:5,x:2,y:2,direction:2})}:value;};
  const original=p.requestAutosave;p.requestAutosave=function(...args){rendering.original.push({scene:this,args,map:G.$gameMap.mapId(),blocked:G.PSFlow._app?.saveBlocked});return Reflect.apply(original,this,args);};
  const refresh=G.Game_Map.prototype.requestRefresh;G.Game_Map.prototype.requestRefresh=function(...args){rendering.refresh.push({map:this.mapId(),checkpoint:G.$gameSystem._psGame.world.pendingReturn?.phase??null});return Reflect.apply(refresh,this,args);};
  options.nativeSetup?.(n);
 }});
 const {G,app}=h;assert.equal(rendering.sprites.length,1,'true idle bootstrap creates nonempty owned native projection');assert.equal(rendering.parents.reduce((n,p)=>n+p.children.length,0),1);assert.equal(G.$gamePlayer.followers().isVisible(),false,'actual event mask hides only effective native followers');const originalEvent=G.$gameMap._events[2];assert(originalEvent);
 const clear=app.clearBlackoutCompanionProjection;app.clearBlackoutCompanionProjection=async function(owner){const before=h.state().world.companions.length,r=await Reflect.apply(clear,this,[owner]);rendering.clear.push({before,after:h.state().world.companions.length,result:r,owner});return r;};
 const reserve=h.ports.worldTravel.reserve;h.ports.worldTravel.reserve=function(owner,receipt,resource){rendering.reserves.push({owner,receipt,blackout:app.isBlackoutOwner(owner),phase:h.state().world.pendingReturn?.phase??null});return Reflect.apply(reserve,this,[owner,receipt,resource]);};
 const raw=G.Scene_Map.prototype.requestAutosave;G.Scene_Map.prototype.requestAutosave=function(...args){const marker=G.$gameMap.mapId()===6?'inherited-source-closure':'target-native-request';const actual=[...args,marker];rendering.raw.push({scene:this,args:actual,map:G.$gameMap.mapId()});if(G.$gameMap.mapId()===7)options.beforeTargetRequest?.(h);return Reflect.apply(raw,this,actual);};
 rendering.original.length=0;rendering.refresh.length=0;
 const expected=options.characterHomeAbsent?{mapId:5,x:2,y:2,direction:2}:options.home?{mapId:7,x:1,y:1,direction:8}:{mapId:7,x:2,y:1,direction:4};
 return {...h,rendering,expected,originalEvent};
}
module.exports={fixture,flush};
