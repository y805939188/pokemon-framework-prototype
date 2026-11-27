'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture:base,flush}=require('./ingress-fixture.cjs');
const managers=fs.readFileSync(process.env.PF_E3_NATIVE_ROOT+'/js/reactor_managers.js','utf8');
// The formal family observes the exact World IIFE already captured by its parent.
// Keep the historical explicit-output observation available to standalone cases.
function worldHeader(){return process.env.PF_FINAL_PRODUCTION_FAMILY==='g-native-commands'?require('../../../../scripts/tests/final-production-runtime.cjs').get().world:fs.readFileSync(path.join(process.env.PF_E3_JOINT_OUT,'PS_World.js'),'utf8');}
function method(G,text,name){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'pinned-G-command:'+name});}
async function fixture(options={}){const h=await base({...options,nativeSetup(n,more){n.G.PluginManager._commands={};for(const name of ['registerCommand','callCommand'])method(n.G,managers,'PluginManager.'+name);options.nativeSetup?.(n,more);}});const{G}=h;
 const command=(name,args={},interpreter=new G.Game_Interpreter(),plugin='PS_World')=>{interpreter.setup([{code:357,indent:0,parameters:[plugin,name,'G real command',args]},{code:0,indent:0,parameters:[]}],0);const returned=interpreter.executeCommand();return{interpreter,returned};};
 const finish=async c=>{for(let i=0;i<140;i++){G.$gameMessage.clear();await flush();const wait=c.interpreter.updateWaitMode();if(!wait){return c.interpreter._psWorldAuthorOutcome;}h.tick();}throw Error('actual author wait exceeded '+JSON.stringify({command:c.interpreter.currentCommand(),pending:G.PSFlow.worldAuthorInputPending(),blocked:h.app.saveBlocked,diag:G.PSWorld.diagnostics}));};
 return{...h,command,finish,worldHeader};}
function record(id,h,extra={}){fs.writeFileSync(path.join(process.env.PF_G_NATIVE_OUTPUT,id+'.json'),JSON.stringify({id,records:h.records(),draws:h.draws,nativeDraws:h.nativeDraws,trace:h.trace,diagnostics:h.G.PSWorld.diagnostics,extra},null,2)+'\n',{flag:'wx'});}
module.exports={fixture,record,flush,method};
