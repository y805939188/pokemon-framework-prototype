// Controlled support only: execute the installed host methods, with no configuration I/O.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function installNativeSettings(G,ROOT){
 const sources={managers:fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),windows:fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8'),scenes:fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8')};
 function method(source,name){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);return source.slice(a,b+3);}
 function Options(){this._list=[];this._index=0;this.sounds=0;}
 Options.prototype={addCommand(name,symbol,enabled=true){this._list.push({name,symbol,enabled});},index(){return this._index;},commandSymbol(i){return this._list[i].symbol;},isCommandEnabled(i){return this._list[i].enabled;},findSymbol(s){return this._list.findIndex(r=>r.symbol===s);},redrawItem(){},playCursorSound(){this.sounds++;},changeVolume(){this.volumeDelegated=true;}};
 G.ConfigManager={};G.Window_Options=Options;G.Scene_Options=function(){};G.TextManager={alwaysDash:'Dash',commandRemember:'Remember',touchUI:'Touch'};
 if(!vm.isContext(G))vm.createContext(G);
 vm.runInContext('Number.prototype.clamp=function(min,max){return Math.min(Math.max(this,min),max);};',G);
 for(const n of ['makeData','applyData','readFlag','readVolume'])vm.runInContext(method(sources.managers,'ConfigManager.'+n),G);
 for(const n of ['addGeneralOptions','statusText','processOk','cursorRight','cursorLeft','isVolumeSymbol','booleanStatusText','volumeStatusText','getConfigValue','setConfigValue','changeValue'])vm.runInContext(method(sources.windows,'Window_Options.prototype.'+n),G);
 vm.runInContext(method(sources.scenes,'Scene_Options.prototype.maxCommands'),G);
 // The exact installed terminate delegates to the scene base and ConfigManager.save.
 G.Scene_MenuBase??=function(){};G.Scene_MenuBase.prototype.terminate??=function(){};
 vm.runInContext(method(sources.scenes,'Scene_Options.prototype.terminate'),G);
 G.ConfigManager.applyData({});return G;
}
module.exports={installNativeSettings};
