'use strict';
// Explicit Node control only. Installed interpreter/variables/switch/common-event
// bodies and Map scheduling; character rendering, transfer and object creation
// underneath DataManager are stand-ins. Never native qualification.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function installPrebattleWorld(G,ROOT,commands){
 const source=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8'),managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8');
 function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
 function method(text,marker){const a=text.indexOf(marker),b=text.indexOf('\n};',a);assert(a>=0&&b>a,marker);return text.slice(a,b+3);}
 const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8');vm.runInContext(method(core,'Math.randomInt = function'),G,{filename:'installed-reactor_core.js#randomInt'});
 vm.runInContext(section('function Game_Interpreter() {','// Equivalents of RPG Maker 2000/2003')+'\n'+section('function Game_Switches() {','// Game_SelfSwitches')+'\n'+section('function Game_CommonEvent() {','// Game_CharacterBase'),G,{filename:'installed-reactor_objects.js#interpreter-variables-common'});
 function MapWorld(){this._mapId=5;this._events=[];this._commonEvents=[];this._interpreter=new G.Game_Interpreter();}
 Object.assign(MapWorld.prototype,{mapId(){return this._mapId;},events(){return this._events.filter(Boolean);},requestRefresh(){this._needsRefresh=true;},refreshIfNeeded(){if(this._needsRefresh){for(const e of this._commonEvents)e.refresh();this._needsRefresh=false;}},updateScroll(){},updateVehicles(){},updateParallax(){},unlockEvent(){},setupStartingEvent(){return false;}});
 G.Game_Map=MapWorld;
 vm.runInContext(['Game_Map.prototype.update = function(sceneActive)','Game_Map.prototype.updateEvents = function()','Game_Map.prototype.updateInterpreter = function()'].map(m=>method(source,m)).join('\n'),G,{filename:'installed-reactor_objects.js#map-scheduling'});
 G.$dataSystem=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'),'utf8'));G.$dataCommonEvents=JSON.parse(fs.readFileSync(path.join(ROOT,'data/CommonEvents.json'),'utf8'));
 G.$gameMap=new MapWorld();G.$gameSwitches=new G.Game_Switches();G.$gameVariables=new G.Game_Variables();
 function Player(){}Object.assign(Player.prototype,{canMove:()=>true,executeEncounter:()=>false,increaseSteps(){},makeEncounterCount(){this.resets=(this.resets??0)+1;},reserveTransfer(map){G.$gameMap._mapId=map;},setupForNewGame(){G.$gameMap._mapId=5;}});G.Game_Player=Player;G.$gamePlayer=new Player();
 G.Scene_Map.prototype.update=function(){G.$gameMap.update(true);};
 G.PluginManager._commands=commands;vm.runInContext(method(managers,'PluginManager.callCommand = function'),G,{filename:'installed-reactor_managers.js#callCommand'});
 G.Utils.extractFileName=s=>String(s).split(/[\\/]/).at(-1).replace(/\.js$/i,'');
 G.DataManager.createGameObjects=()=>{G.$gameSystem=new G.Game_System();G.$gameMap=new MapWorld();G.$gameSwitches=new G.Game_Switches();G.$gameVariables=new G.Game_Variables();G.$gamePlayer=new Player();G.$gameParty={setupStartingMembers(){}};G.$gameMessage={clear(){},isBusy:()=>false,add(){}};};G.DataManager.selectSavefileForNewGame=()=>{};
 vm.runInContext(method(managers,'DataManager.setupNewGame = function()'),G,{filename:'installed-reactor_managers.js#setupNewGame'});
}
module.exports={installPrebattleWorld};
