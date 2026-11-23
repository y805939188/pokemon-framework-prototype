'use strict';
const vm=require('node:vm');

// Create the real static namespace before any frame closure or production hook
// captures it. Copying descriptors to a replacement later splits the queue.
function createNativeSceneManager(G,source){
 const start=source.indexOf('function SceneManager() {'),end=source.indexOf('\n}',start);
 if(start<0||end<=start)throw Error('missing native SceneManager declaration');
 vm.runInContext(source.slice(start,end+2),G,{filename:'native-frame:SceneManager'});
 const manager=G.SceneManager;
 Object.assign(manager,{_scene:null,_nextScene:null,_stack:[],_exiting:false,isGameActive:()=>true,onSceneTerminate(){},onSceneCreate(){},onBeforeSceneStart(){},onSceneStart(){}});
 for(const name of ['goto','push','pop','isSceneChanging','isCurrentSceneBusy','changeScene','updateScene']){
  const a=source.indexOf('SceneManager.'+name+' = function'),b=source.indexOf('\n};',a);
  if(a<0||b<=a)throw Error('missing native SceneManager.'+name);
  vm.runInContext(source.slice(a,b+4),G,{filename:'native-frame:SceneManager.'+name});
 }
 return manager;
}

function createNativeFrameTick(G,manager,input){
 return ()=>{G.Graphics.frameCount++;if(G.$gameScreen._flashDuration>0)G.$gameScreen._flashDuration--;manager.changeScene();manager.updateScene();input.trigger.clear();input.repeat.clear();};
}

module.exports={createNativeSceneManager,createNativeFrameTick};
