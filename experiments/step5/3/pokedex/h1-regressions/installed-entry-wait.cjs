'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const bundleDir=fs.mkdtempSync(path.join(os.tmpdir(),'ps53-installed-wait-'));
try {
for(const name of ['PS_BattleFlow','PS_Pokedex']){const p=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',bundleDir],{env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);}
function Base(){}for(const m of ['initialize','create','start','update','terminate','clear'])Base.prototype[m]=function(){};Base.prototype.setWaitMode=function(m){this._waitMode=m;};Base.prototype.updateWaitMode=function(){return false;};Base.prototype.addWindow=function(){};Base.prototype.popScene=function(){};
function Win(){}Win.prototype.initialize=function(){};Win.prototype.activate=function(){};
function MenuCommand(){}MenuCommand.prototype.addOriginalCommands=function(){};MenuCommand.prototype.addCommand=function(){};MenuCommand.prototype.setHandler=function(){};
const G={console,structuredClone,performance:{now:()=>0},Window_Base:Win,Window_Command:Win,Window_MenuCommand:MenuCommand,Scene_MenuBase:Base,Scene_Menu:class{},SceneManager:{push(){},isSceneChanging(){return false;}},PluginManager:{registerCommand(){},parameters(){return{};}},Game_Interpreter:Base,Input:{clear(){}},TouchInput:{clear(){}},Graphics:{frameCount:0,boxWidth:816,boxHeight:624},Rectangle:function(){},$gameMessage:{add(){}}};G.window=G;
vm.runInNewContext(fs.readFileSync(path.join(bundleDir,'PS_BattleFlow.js'),'utf8'),G);
const app={pendingPokedex:{token:'installed-entry',revision:1},saveBlocked:true,stateGeneration:0,encounterBlocked:true};G.PSFlow._app=app;G.PSFlow.app=()=>app;
const interpreter=new G.Game_Interpreter();assert.equal(G.PSFlow.waitForPokedex(interpreter),true);const before=interpreter.updateWaitMode();assert.equal(before,true,'accepted BattleFlow waiter must wait before H plugin');
vm.runInNewContext(fs.readFileSync(path.join(bundleDir,'PS_Pokedex.js'),'utf8'),G);
const after=interpreter.updateWaitMode();console.log(JSON.stringify({before,after,pendingStillPresent:!!app.pendingPokedex,waitModeAfter:interpreter._waitMode,tokenAfter:interpreter._psPokedexToken}));
assert.equal(after,true,'installed acquisition/capture/evolution entry must keep its interpreter waiting');

const other=new G.Game_Interpreter();G.PSFlow.waitForPokedex(other);interpreter.clear();assert.equal(other.updateWaitMode(),true,'unrelated interpreter clear cannot release the installed token');
app.pendingPokedex={token:'successor-entry',revision:1};assert.equal(other.updateWaitMode(),false,'old waiter does not wait for successor');assert.equal(other._psPokedexToken,undefined);G.PSFlow.waitForPokedex(other);assert.equal(other.updateWaitMode(),true);app.pendingPokedex=null;assert.equal(other.updateWaitMode(),false,'exact completed entry releases wait');

} finally {fs.rmSync(bundleDir,{recursive:true,force:true});}
