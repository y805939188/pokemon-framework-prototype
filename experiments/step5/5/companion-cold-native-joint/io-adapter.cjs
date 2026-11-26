'use strict';
// Actual pinned Storage/DataManager/JsonEx/pako, with pre-syscall path confinement.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function inside(file,root){assert.equal(typeof file,'string');const target=path.resolve(file),r=path.relative(root,target);assert(r===''||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r),'outside isolated root '+file);let cursor=root;assert(!fs.lstatSync(root).isSymbolicLink());for(const part of r.split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if(!fs.existsSync(cursor))break;assert(!fs.lstatSync(cursor).isSymbolicLink(),'symlink refused');}return target;}
function method(G,text,name){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'pinned-native:'+name});}
function install(G,scope,nativeRoot,out,options={}){
 assert(options.globalInfoProfile===undefined||options.globalInfoProfile==='formal-empty-load','unknown globalInfo test profile');
 assert(options.saveLocation===undefined||options.saveLocation==='project','unknown storage path profile');
 const projectSave=options.saveLocation==='project',project=inside(path.join(scope,'profile/project'),scope),
   saveRoot=inside(projectSave?path.join(project,'save'):path.join(scope,'save'),scope),trace=[];
 if(projectSave)fs.mkdirSync(saveRoot,{recursive:true});
 fs.mkdirSync(path.join(project,'js'),{recursive:true});fs.writeFileSync(path.join(project,'js/plugins.js'),'// owned identity placeholder; not a production plugin list\n',{flag:'wx'});
 const guarded={};for(const name of ['existsSync','mkdirSync','renameSync','unlinkSync','readFileSync','writeFileSync'])guarded[name]=(...args)=>{const targets=name==='renameSync'?[args[0],args[1]]:[args[0]];for(const file of targets){if(name==='existsSync'&&path.resolve(file).startsWith(project+path.sep))inside(file,project);else inside(file,saveRoot);}const row={sequence:trace.length+1,method:name,targets:[...targets],allowed:true};trace.push(row);try{const value=Reflect.apply(fs[name],fs,args);row.result=typeof value==='boolean'?value:'RETURNED';return value;}catch(error){row.error=String(error);throw error;}};
 const core=fs.readFileSync(path.join(nativeRoot,'js/reactor_core.js'),'utf8'),managers=fs.readFileSync(path.join(nativeRoot,'js/reactor_managers.js'),'utf8');
 vm.runInContext(core.slice(0,core.indexOf('function Utils()')),G,{filename:'pinned:JsExtensions'});
 const j=core.indexOf('function JsonEx()'),je=core.indexOf('//-----------------------------------------------------------------------------',core.indexOf('JsonEx._decode =',j));vm.runInContext(core.slice(j,je),G,{filename:'pinned:JsonEx'});
 const s=managers.indexOf('function StorageManager()'),se=managers.indexOf('//-----------------------------------------------------------------------------',managers.indexOf('StorageManager.forageTestKey =',s));vm.runInContext(managers.slice(s,se),G,{filename:'pinned:StorageManager'});
 for(const name of ['saveGame','makeSavefileInfo','makeSaveContents','makeSavename','extractSaveContents','saveGlobalInfo','loadGlobalInfo','removeInvalidGlobalInfo','savefileExists','loadGame','createGameObjects','correctDataErrors'])method(G,managers,'DataManager.'+name);
 if(options.globalInfoProfile==='formal-empty-load'){
  const initial=managers.match(/^DataManager\._globalInfo = null;$/gm);assert(initial&&initial.length===1,'pinned native globalInfo initializer');
  vm.runInContext(initial[0],G,{filename:'pinned-native:DataManager-initial-globalInfo'});method(G,managers,'DataManager.isGlobalInfoLoaded');
 }else G.DataManager._globalInfo=vm.runInContext('[]',G);
 G.$gameParty=new G.Game_Party();G.$gameTimer=new G.Game_Timer();G.$dataSystem.gameTitle='Headless isolated F load';G.process={platform:'darwin'};G.nw={App:{argv:projectSave?[]:['--ps-save-dir='+saveRoot],manifest:{name:'HEADLESS_F_LOAD_JOINT'}}};
 const baseRequire=G.require,req=request=>{if(request==='fs'||request==='node:fs')return guarded;if(request==='path'||request==='node:path')return path;if(request==='os'||request==='node:os')return{homedir(){throw Error('DEFAULT_PLAYER_DIRECTORY_FORBIDDEN');}};if(request==='util'||request==='node:util')return require('node:util');if(request==='node:crypto')return crypto;if(request==='./js/engine/build/production.cjs')return baseRequire(request);throw Error('unregistered save require '+request);};
 req.resolve=request=>{if(request==='./js/plugins.js')return path.join(project,'js/plugins.js');if(request==='./js/engine/build/production.cjs')return path.join(out,'production.cjs');throw Error('unregistered save resolution '+request);};G.require=req;
 method(G,core,'Utils.isNwjs');vm.runInContext(fs.readFileSync(path.join(nativeRoot,'js/libs/pako.min.js'),'utf8'),G,{filename:'pinned:pako'});
 for(const name of ['PS_SaveLocation','PS_SaveState'])vm.runInContext(fs.readFileSync(require('../../../../scripts/tests/final-production-runtime.cjs').pluginFile(name),'utf8'),G,{filename:'fixed-e2:'+name});
 assert.equal(path.resolve(G.PSSaveLocation.dir),saveRoot);assert.equal(G.PSSaveLocation.why,projectSave?'project folder':'--ps-save-dir');assert.equal(G.StorageManager.fileDirectoryPath(),saveRoot+path.sep);assert.equal(G.StorageManager.isLocalMode(),true);
 const globalInfo=options.globalInfoProfile==='formal-empty-load'?require('./global-info-input-support.cjs').observeGlobalInfo(G):undefined;
 return{trace,saveRoot,project,globalInfo,sha(file){return crypto.createHash('sha256').update(fs.readFileSync(inside(file,saveRoot))).digest('hex');},assertPaths(){for(const row of trace)for(const file of row.targets){if(row.method==='existsSync'&&path.resolve(file).startsWith(project+path.sep))inside(file,project);else inside(file,saveRoot);}}};
}
module.exports={inside,method,install};
