'use strict';
// App-only controlled issuer fixture: extracted methods and a local ticket constructor, not the production IIFE issuer.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function installNativePhase(h,makePort){
 const G=h.root,W=G,E=h.E;let opening,starts=0;
 function Base(){}Base.prototype.initialize=function(){};Base.prototype.create=function(){};Base.prototype.addWindow=function(){};
 function Win(){}for(const key of ['setHandler','deactivate','hide'])Win.prototype[key]=function(){};
 function Scene_PSBattle(){const ticket=new.target===Scene_PSBattle?port.beginConstruction():null;this.initialize();if(ticket){if(Object.getPrototypeOf(this)!==P)throw Error('world-battle-scene-construction-stale');port.bindConstruction(this,ticket);}}Scene_PSBattle.prototype=Object.create(Base.prototype);Scene_PSBattle.prototype.constructor=Scene_PSBattle;const P=Scene_PSBattle.prototype;
 P.onMenuOk=function(){};P.onMenuCancel=function(){};P._psBindHost=function(){};
 Object.assign(G,{performance:{now:()=>0},Graphics:{boxWidth:816,boxHeight:624},Scene_MenuBase:Base,Scene_PSBattle,Rectangle:function(){},PluginManager:{parameters:()=>({})},$gameMessage:{isBusy:()=>false},productionLimits:E.limits});G.$gamePlayer.isTransferring=()=>false;
 const flow=G.PSFlow={_app:h.app,_op:null,running:false,app:()=>h.app,content:()=>h.content,game:()=>h.state,limits:()=>E.limits.DEFAULT_LIMITS,perf:{},assertBattleAllowed(){},_prepareBattlePresentation(){}};
 const port=makePort(); // The real leaf captures this stable Flow identity before any admission or constructor runs.
 const sceneSource=fs.readFileSync(process.env.PF_MZ_BATTLE_SOURCE,'utf8'),init=sceneSource.indexOf('  P.initialize = function () {'),create=sceneSource.indexOf('  P.create = function () {',init),end=sceneSource.indexOf('  P.isReady = function () {',create);assert(init>=0&&create>init&&end>create);
 const fixedFlow=fs.readFileSync(process.env.PF_MZ_BATTLE_COMPILED,'utf8'),body=(a,b)=>{const start=fixedFlow.indexOf(a),stop=fixedFlow.indexOf(b,start);assert(start>=0&&stop>start);return fixedFlow.slice(start,stop).trim();};
 const compiledInit=fixedFlow.indexOf('P.initialize = function() {'),compiledEnd=fixedFlow.indexOf('P.isReady = function() {',compiledInit);assert(compiledInit>=0&&compiledEnd>compiledInit);const initializeAndCreate=fixedFlow.slice(compiledInit,compiledEnd);
 const code=`(function(G,W,P,PSFlow){const Window_PSText=G.testWin,Window_PSMenu=G.testWin,BattleMenuCursor=class{};
 function sceneController(scene,initial){return {isCurrent(){return G.SceneManager._scene===scene&&PSFlow._op===scene._psOp;},present(fn){return fn();},open(fn){G.actualOpening=fn();}};}
 ${initializeAndCreate}
 let openingBattle=null;const NAME='PS_BattleFlow',effectiveBattleEffects=()=>true,effectiveBattleStyle=()=> 'switch',battlebackContext=()=>({time:0}),prebattlePlan=()=>({}),musicSettings=()=>({}),battleMusic={capture:()=>({})},prebattle={open:()=>false},engine=()=>({B:{limits:G.productionLimits}}),withInitialField=r=>r;
 Object.assign(PSFlow,{${body('openAdmittedWorldBattle(app, admission) {','/** Player-facing entries')}${body('async begin() {','/** End the battle of')}});
 })(globalThis,globalThis,globalThis.Scene_PSBattle.prototype,globalThis.PSFlow);`;
 G.testWin=Win;G.actualScenePort=port;vm.runInContext(code,G,{filename:'fixed-MZ-actual-initialize-create-begin'});
 G.SceneManager.push=C=>{G.SceneManager._scene=new C();G.SceneManager._scene.create();};
 return {flow,port,get opening(){return G.actualOpening;},get starts(){return starts;}};
}

module.exports={installNativePhase};
