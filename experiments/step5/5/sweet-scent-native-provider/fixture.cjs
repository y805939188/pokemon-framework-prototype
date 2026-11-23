'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
// The inherited headless driver manually decremented flash duration. Replace only that driver:
// actual Scene_Map.updateMain invokes the real Game_Screen.update once per update.
const frame=require('../d-mz-native-frame-support.cjs'),originalFrame=frame.frameFixture;
frame.frameFixture=async(...args)=>{const h=await originalFrame(...args),G=h.G;h.tick=()=>{G.Graphics.frameCount++;G.SceneManager.changeScene();G.SceneManager.updateScene();h.input.trigger.clear();h.input.repeat.clear();};return h;};
const {fixture:base,flush}=require('../ui-wire-travel-fixtures.cjs');
async function fixture(options={}){const observed={flashes:[],screenUpdates:0,flashUpdates:0,opening:0,aborts:0};const h=await base({...options,nativeSetup(n,context){const G=n.G,p=G.Game_Screen.prototype;for(const key of ['update','updateFlash','startFlash']){const method=p[key];p[key]=function(...args){if(key==='startFlash')observed.flashes.push({frame:G.Graphics.frameCount,args:structuredClone(args),tone:[...this._tone],screen:this});else if(key==='update')observed.screenUpdates++;else observed.flashUpdates++;return Reflect.apply(method,this,args);};}options.nativeSetup?.(n,context);}});
 const {G}=h;const world=G.SceneManager._scene;G.PSWorld.loadSucceeded();G.SceneManager.goto(G.Scene_Map);await h.pump(()=>G.SceneManager._scene!==world&&G.SceneManager._scene?._started===true);await h.pump(()=>!G.PSFlow.companionNativePending()&&!h.app.saveBlocked);
 const open=G.PSFlow.openAdmittedWorldBattle;G.PSFlow.openAdmittedWorldBattle=function(...args){observed.opening++;return Reflect.apply(open,this,args);};const abort=h.app.abortAdmittedWorldBattle;h.app.abortAdmittedWorldBattle=function(...args){observed.aborts++;return Reflect.apply(abort,this,args);};
 return{...h,observed};}
function dump(id,h,extra){const safe={...h.observed,flashes:h.observed.flashes.map(({screen,...row})=>row)};fs.writeFileSync(path.join(process.env.PF_SCENT_OUTPUT,id+'.json'),JSON.stringify({id,observed:safe,draws:h.draws,nativeDraws:h.nativeDraws,steps:h.state().steps,stats:h.state().stats,diagnostics:h.G.PSWorld.diagnostics,calls:h.calls.map(x=>({kind:x.kind,status:x.result?.status,reason:x.result?.reason})),extra},null,2)+'\n',{flag:'wx'});}
const edit=(game,content)=>{content.moves.sweetscent={id:'sweetscent',name:'Sweet Scent',pp:20};game.party[0].moves=[{id:'sweetscent',pp:20,maxpp:20,ppUps:0}];};
async function begin(h){assert(h.G.PSManagement.openFieldShortcuts());h.tick();h.press('ok');await h.pump(()=>h.G.$gameScreen._flashDuration>0);const row=h.calls.find(x=>x.kind==='execute');assert(row);return row.args[0];}
module.exports={fixture,flush,dump,edit,begin};
