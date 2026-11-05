'use strict';
// Uses selected, unchanged installed host classes; substitutes only the non-rendering game objects and save directory.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..'),E=require(path.join(ROOT,'js/engine/build/production.cjs'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function section(source,begin,end){const a=source.indexOf(begin),b=end?source.indexOf(end,a+begin.length):source.length;assert(a>=0&&b>a,'exact installed class boundaries');return source.slice(a,b);}
function createHost(hostRoot,productRoot,folder,content,manifest){
 const hashes={};function read(root,relative){const bytes=fs.readFileSync(path.join(root,relative)),h=sha(bytes);assert.equal(h,manifest[relative],'bound host/product bytes '+relative);hashes[relative]=h;return bytes.toString('utf8');}
 const managers=read(hostRoot,'js/reactor_managers.js'),core=read(hostRoot,'js/reactor_core.js'),pako=read(hostRoot,'js/libs/pako.min.js'),plugin=read(productRoot,'js/plugins/PS_SaveState.js');
 const io=[],errors=[],writes=[],checked=file=>{const value=path.resolve(file);assert(value===folder||value.startsWith(folder+path.sep),'owned synthetic save path only');return value;};
 const safeFs={existsSync:file=>fs.existsSync(checked(file)),mkdirSync:file=>fs.mkdirSync(checked(file)),unlinkSync:file=>fs.unlinkSync(checked(file)),renameSync:(a,b)=>fs.renameSync(checked(a),checked(b)),readFileSync:(file,...args)=>fs.readFileSync(checked(file),...args),writeFileSync:(file,...args)=>{io.push({operation:'write',file:path.basename(checked(file))});return fs.writeFileSync(checked(file),...args);}};
 const context={console:{error:(...args)=>errors.push(args.map(String).join(' ')),warn:(...args)=>errors.push(args.map(String).join(' '))},Date,Promise,Utils:{isNwjs:()=>true},Graphics:{frameCount:0},require:name=>{if(name==='fs')return safeFs;if(name==='path')return path;assert.equal(name,'./js/engine/build/production.cjs');return E;}};
 context.window=context;context.PSFlow={running:false,operationPending:()=>false,content:()=>content,speciesKeyResolver:()=>E.speciesKey.speciesKeyResolver(content),stateReplaced(){this.replacements++;},replacements:0};
 vm.createContext(context);
 vm.runInContext(`String.prototype.format=function(...args){return this.replace(/%([0-9]+)/g,(_,n)=>args[Number(n)-1]);};
 for(const name of ['Game_Temp','Game_System','Game_Screen','Game_Timer','Game_Message','Game_Switches','Game_Variables','Game_SelfSwitches','Game_Actors','Game_Party','Game_Troop','Game_Map','Game_Player']){globalThis[name]={[name]:function(){this.testHostObject=name;}}[name];}
 Game_System.prototype.isSaveEnabled=function(){return true;};Game_System.prototype.playtimeText=function(){return '00:00:00';};
 Game_Party.prototype.charactersForSavefile=function(){return [];};Game_Party.prototype.facesForSavefile=function(){return [];};Game_Party.prototype.removeInvalidMembers=function(){};`,context,{filename:'minimal-nonrendering-host-objects'});
 vm.runInContext(section(managers,'function DataManager()','function ConfigManager()'),context,{filename:'installed-DataManager.js'});
 vm.runInContext(section(managers,'function StorageManager()','function FontManager()'),context,{filename:'installed-StorageManager.js'});
 vm.runInContext(section(core,'function JsonEx()'),context,{filename:'installed-JsonEx.js'});
 vm.runInContext(pako,context,{filename:'installed-pako.min.js'});
 context.$dataSystem={gameTitle:'Synthetic MZ Slot Contract',advanced:{gameId:544}};
 context.StorageManager.fileDirectoryPath=()=>folder+path.sep;
 const originalSaveObject=context.StorageManager.saveObject;
 context.StorageManager.saveObject=function(name,value){const record={name,started:true,completed:false};writes.push(record);const pending=originalSaveObject.call(this,name,value);record.promise=pending.then(v=>{record.completed=true;record.success=true;return v;},e=>{record.completed=true;record.success=false;throw e;});return record.promise;};
 context.DataManager._globalInfo=[];
 context.DataManager.createGameObjects();
 vm.runInContext(plugin,context,{filename:'bound-PS_SaveState.js'});
 return{context,hashes,io,errors,writes,async drain(){await Promise.all(writes.map(w=>w.promise));},records:()=>writes.map(({promise,...record})=>record)};
}
module.exports={createHost,sha,section};
