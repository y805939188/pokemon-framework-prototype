'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {flush}=require('../f-native-preparation/nontransfer-production-fixture.cjs');
const clone=value=>structuredClone(value);
async function fixture(options={}){
 const events=[],audio=[],entries=[],leaves=[],initialAudio={name:'field',volume:60,pitch:100,pan:0,pos:3};
 const h=await require('../f-native-preparation/nontransfer-production-fixture.cjs').fixture({missingHome:options.destination==='missing',repel:options.repel??0,
  edit(game,content){
   if(options.direct)game.party[0].hp=options.capable?4:0;
   if(options.empty)game.party=[];
   if(options.poisonDisabled)content.settings.POISON_IN_FIELD=false;
   if(options.capable&&!options.direct)game.party[0].hp=4;
   if(options.destination==='center')game.world.recentCenter={mapId:7,x:2,y:1,direction:4};
   options.edit?.(game,content);
  },nativeSetup(n){const G=n.G,add=G.$gameMessage.add;
   G.$dataSystem.switches=['','StartingOver'];
   const params=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const raw=params(name);return name==='PS_World'?{...raw,TravelDebug:'true',CharacterHome:options.destination==='home'?JSON.stringify({mapId:7,x:1,y:1,direction:8}):options.destination==='missing'?JSON.stringify({mapId:99,x:1,y:1,direction:8}):'',GlobalHome:''}:raw;};
   G.$gameMessage.add=function(text){events.push({kind:'message',text,steps:G.$gameSystem._psGame.steps,hp:G.$gameSystem._psGame.party.map(m=>m.hp),count:G.$gameSystem._psGame.stats.blacked_out_count,checkpoint:clone(G.$gameSystem._psGame.world.pendingReturn),brightness:G.$gameScreen.brightness(),blocked:G.PSFlow._app.saveBlocked});options.onMessage?.(G,text);return Reflect.apply(add,this,[text]);};
   Object.assign(G.AudioManager,{_currentBgm:clone(initialAudio),_currentBgs:{...clone(initialAudio),name:'ambient'},
    saveBgm(){return clone(this._currentBgm||{name:''});},saveBgs(){return clone(this._currentBgs||{name:''});},
    stopBgm(){this._currentBgm=null;},stopBgs(){this._currentBgs=null;},
    playBgm(value){this._currentBgm=clone(value);},playBgs(value){this._currentBgs=clone(value);},
    fadeOutBgm(seconds){audio.push(['bgm-out',seconds]);this._currentBgm=null;options.audioEffect?.('bgm',G);},
    fadeOutBgs(seconds){audio.push(['bgs-out',seconds]);this._currentBgs=null;options.audioEffect?.('bgs',G);},
    replayBgm(value){audio.push(['bgm-restore',value.name]);this._currentBgm=clone(value);},
    replayBgs(value){audio.push(['bgs-restore',value.name]);this._currentBgs=clone(value);}});
   const out=G.$gameScreen.startFadeOut,back=G.$gameScreen.startFadeIn;
   G.$gameScreen.startFadeOut=function(duration){events.push({kind:'fade-out',duration,hp:G.$gameSystem._psGame.party.map(m=>m.hp),count:G.$gameSystem._psGame.stats.blacked_out_count});const result=Reflect.apply(out,this,[duration]);options.screenEffect?.(G);return result;};
   G.$gameScreen.startFadeIn=function(duration){events.push({kind:'fade-in',duration});return Reflect.apply(back,this,[duration]);};
   options.nativeSetup?.(n);
  }});
 const {G,app}=h;
 if(options.lang)G.PSFlow.translator=()=>h.E.i18n.translatorFor(options.lang);
 const enter=h.ports.blackout.enterField,leave=h.ports.blackout.leaveField;
 h.ports.blackout.enterField=async function(owner){const r={owner,result:null};entries.push(r);r.result=await Reflect.apply(enter,this,[owner]);return r.result;};
 h.ports.blackout.leaveField=function(...args){const result=Reflect.apply(leave,this,args);leaves.push({owner:args[0],result});return result;};
 const initial=clone(h.state());
 const pump=async(predicate,{clear=true,max=350}={})=>{for(let i=0;i<max;i++){if(predicate())return;if(clear)G.$gameMessage.clear();h.tick();await flush();}throw Error('field-entry pump exceeded '+JSON.stringify({blocked:app.saveBlocked,phase:h.state().world.pendingReturn,events,entries:entries.map(e=>e.result),diagnostics:G.PSWorld.diagnostics}));};
 const start=()=>{let result,error;const promise=options.direct?G.PSFlow.checkFieldBlackout(options.requestId??'field-direct'):G.PSFlow.runWorldTravel('field-connection',{kind:'connection'});promise.then(r=>{result=r;},e=>{error=e;});return {promise,result:()=>result,error:()=>error};};
 const installSave=()=>{if(!G.DataManager.makeSaveContents)G.DataManager.makeSaveContents=()=>({system:G.$gameSystem});vm.runInContext(fs.readFileSync(path.join(__dirname,'../../../../js/plugins/PS_SaveState.js'),'utf8'),G,{filename:'actual-production:PS_SaveState.js'});};
 const saveBlocked=async()=>{assert.equal(h.state().world.pendingReturn,null);assert.equal(app.saveBlocked,true);const before=h.saves.length;await assert.rejects(G.DataManager.saveGame(88),/saving|operation|pending/);assert.throws(()=>G.DataManager.makeSaveContents(),/operation|saving|pending/);assert.equal(h.saves.length,before);};
 const settled=()=>assert.equal(h.state().stats.blacked_out_count,initial.stats.blacked_out_count+1);
 const unsettled=()=>{assert.equal(h.state().stats.blacked_out_count,initial.stats.blacked_out_count);assert.deepEqual(h.state().party.map(m=>m.hp),initial.party.map(m=>options.direct?m.hp:0));assert.equal(h.state().world.pendingReturn,null);};
 return {...h,events,audio,entries,leaves,initial,pump,start,installSave,saveBlocked,settled,unsettled,clone};
}
module.exports={fixture,flush};
