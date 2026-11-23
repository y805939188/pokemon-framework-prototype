'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture,flush}=require('../e3-mz-world-travel-fixture.cjs');
const root=process.env.PF_E3_NATIVE_ROOT;if(!root)throw Error('explicit pinned native root required');
const scenes=fs.readFileSync(path.join(root,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(root,'js/reactor_managers.js'),'utf8');
function install(G,source,name){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(source.slice(a,b+4),G,{filename:'actual-F-native:'+name});}
async function birthFixture(options={}){
 let ports,held=options.hold===true,requested=null,h;
 h=await fixture({noSaveRequest:options.noSaveRequest,applicationPorts:value=>{ports=value;options.applicationPorts?.(value);},nativeSetup(n){const G=n.G;
  install(G,scenes,'Scene_Base.prototype.isReady');G.Scene_Message.prototype.isReady=G.Scene_Base.prototype.isReady;G.ImageManager.isReady=()=>true;G.EffectManager.isReady=()=>true;G.FontManager={isReady:()=>true};
  install(G,scenes,'Scene_Map.prototype.isReady');install(G,managers,'DataManager.isMapLoaded');install(G,managers,'DataManager.checkError');G.DataManager._errors=[];G.DataManager._checkStalledDataFiles=()=>{};
  const a=scenes.indexOf('const _reactorSceneMapOnMapLoaded ='),b=scenes.indexOf('// The database sidecar decides',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b),G,{filename:'actual-F-native:final-Reactor-Map-overlays'});
  const load=G.DataManager.loadMapData;G.DataManager.loadMapData=function(id){if(held){requested=id;G.$dataMap=null;return;}return Reflect.apply(load,this,[id]);};
 }});
 assert(ports?.state?.atomicWorldContent,'actual Flow construction supplies the real native atomic port');
 const lifecycle=()=>ports.state.atomicWorldContent(()=>actual=>({value:actual.lifecycle}));
 const go=()=>h.G.SceneManager.goto(h.G.Scene_Map);
 const release=()=>{assert(requested);held=false;h.G.$dataMap=h.maps[requested];};
 const fresh=async()=>{go();await h.pump(()=>h.G.SceneManager._scene.isStarted()&&lifecycle().travelLease?.mapBirth?.frame);return lifecycle().travelLease.mapBirth;};
 return {...h,ports,lifecycle,go,release,fresh};
}
module.exports={birthFixture,flush};
