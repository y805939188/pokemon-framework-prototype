'use strict';
const {types}=require('node:util'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require(process.env.PF_HOME_BUNDLE);process.env.PF_E3_PARENT_BUNDLE=process.env.PF_HOME_BUNDLE;
const {host}=require('../e3-parent-native-fixture.cjs');
const scenes=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_managers.js'),'utf8');
function install(root,vm,name,text){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),root,{filename:'actual-home-component:'+name});}
async function factory(parameters,legacyParameters){let component;const diagnostics=[];
 const h=await host({}, {beforeInstall({root,vm}){
  const a=managers.indexOf('function SceneManager() {'),b=managers.indexOf('\n}',a);assert(a>=0&&b>a);vm.runInContext(managers.slice(a,b+2),root,{filename:'actual-home-component:static-SceneManager'});
  root.SceneManager._scene={};root.SceneManager._nextScene=null;
  for(const name of ['goto','changeScene','updateScene'])install(root,vm,'SceneManager.'+name,managers);
  for(const name of ['create','isReady','update'])install(root,vm,'Scene_Map.prototype.'+name,scenes);
  // Read-only debug qualification provider; no App/owner or movement is admitted by this fixture.
  root.Game_Player.prototype.isDebugThrough=()=>false;
 },transferFactory({root}){if(legacyParameters)root.PluginManager={parameters:name=>name==='PS_BattleFlow'?legacyParameters:{}};component=E.createWorldTravelMZ(root,()=>null,new Map(),parameters,message=>diagnostics.push(message),types.isProxy);return component.transfer;}});
 return {...h,E,component,diagnostics};
}
module.exports={E,types,factory};
