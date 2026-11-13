'use strict';
// VM adapter evidence uses the pinned runtime's actual JsonEx, DataManager, StorageManager and pako. NW is separate.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const {E,T,J,workspace,ROOT}=require('./integration-helpers.cjs');
function host(dir=workspace()){
 const commands={};const ctx={console:{error(){},warn(){},log(){}},Promise,Date,Set,Utils:{isNwjs:()=>true},require:p=>p==='./js/engine/build/production.cjs'?E:require(p),PluginManager:{registerCommand:(p,n,fn)=>{commands[n]=fn;}},pako:require(path.join(ROOT,'js/libs/pako.min.js'))};ctx.window=ctx;
 vm.createContext(ctx);
 const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8'),at=core.indexOf('function JsonEx()'),end=core.indexOf('//-----------------------------------------------------------------------------',core.indexOf('JsonEx._decode = function'));
 vm.runInContext(core.slice(at,end),ctx);
 const mgr=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8');vm.runInContext(mgr.slice(0,mgr.indexOf('function ConfigManager()'))+mgr.slice(mgr.indexOf('function StorageManager()'),mgr.indexOf('function FontManager()')),ctx);
 vm.runInContext(`String.prototype.format=function(n){return this.replace('%1',n);};function Game_System(){};Game_System.prototype.isSaveEnabled=()=>true;`,ctx);
 const c=J(T.fixtures.content);let app;
 const create=()=>{ctx.$gameSystem=new ctx.Game_System();ctx.$gameSystem._psGame=J(T.fixtures.makeGame());ctx.$gameSystem._psGame.party[0].friendship=256;for(const n of ['Screen','Timer','Switches','Variables','SelfSwitches','Actors','Party','Map','Player'])ctx['$game'+n]={tag:n,progress:123};};create();
 ctx.$dataSystem={gameTitle:'fixture'};ctx.DataManager._globalInfo=[];ctx.DataManager.createGameObjects=create;ctx.DataManager.correctDataErrors=()=>{};ctx.DataManager.makeSavefileInfo=()=>({title:'fixture',timestamp:123});ctx.StorageManager.fileDirectoryPath=()=>dir+path.sep;
 ctx.PSFlow={running:false,operationPending:()=>app.saveBlocked,content:()=>c,speciesKeyResolver:()=>E.speciesKey.speciesKeyResolver(c),game:()=>ctx.$gameSystem._psGame,app:()=>app,stateReplaced:()=>app.stateReplacedByHost()};
 app=new E.app.GameApplication({state:{read:()=>ctx.$gameSystem._psGame,replace:n=>{ctx.$gameSystem._psGame=n;}},content:()=>({content:c}),sessions:{create:async()=>null},projection:{project(){}},random:()=>0});ctx.PSFlow._app=app;
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/plugins/PS_SaveState.js'),'utf8'),ctx);
 return {ctx,app,c,dir,commands,file:slot=>ctx.StorageManager.filePath(ctx.DataManager.makeSavename(slot)),save:async slot=>{await ctx.DataManager.saveGame(slot);await new Promise(r=>setImmediate(r));}};
}
module.exports={host};
