'use strict';
// Controlled render/map resources around pinned native Scene scheduling. Install
// before production hooks; only those hooks issue the native Map construction.
const assert=require('node:assert/strict');
function install(root,ROOT){
 const base=root.Scene_MenuBase.prototype;
 const initialize=base.initialize;
 base.initialize=function(...args){const result=initialize.apply(this,args);this.children=[];this._started=false;return result;};
 base.create??=function(){this._windowLayer={};this.children.push(this._windowLayer);};
 base.start??=function(){this._started=true;};base.isStarted??=function(){return this._started;};
 root.SceneManager.pushed=[];root.Input??={};root.DataManager??={};root.$dataMap??={};
 root.$gameMap._mapId=root.$gameMap.mapId();
 Object.assign(root.$gamePlayer,{_x:8,_realX:8,_y:9,_realY:9,_direction:2,_transferring:false,_vehicleType:'walk',_moveRouteForcing:false});
 require('../../tests/support/battle-host/victory-native-scenes.cjs').install(root,ROOT);
}
function enter(root){
 // Normal MZ reaches a Map from an existing Boot/Title scene. A null source
 // deliberately cannot issue a native Map birth. Consume a real native queue
 // for this controlled Boot first; never publish a Map record by hand.
 if(root.SceneManager._scene===null||root.SceneManager._scene===undefined){
  function Boot(){this.initialize();}Boot.prototype=Object.create(root.Scene_MenuBase.prototype);Boot.prototype.constructor=Boot;
  root.SceneManager.goto(Boot);root.SceneManager.changeScene();
 }
 root.SceneManager.goto(root.Scene_Map);root.SceneManager.changeScene();root.SceneManager.updateScene();
 assert.equal(root.SceneManager._nextScene,null);assert.equal(root.SceneManager._scene.isStarted(),true);
}
module.exports={install,enter};
