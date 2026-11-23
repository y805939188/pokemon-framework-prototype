'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {frameFixture,build}=require('./d-mz-native-frame-support.cjs');
async function fixture(options={}){
 const h=await frameFixture({integrated:true,terrainTags:JSON.stringify({'0':{landAllowed:true,fishable:false,environment:'grass'}}),...options,edit(game,content){
  for(const[name,species]of Object.entries(content.species)){species.ruleSpecies='Fixture'+name;species.types=['Normal'];}
  content.settings={AFFECTION_EFFECTS:false};content.mapMetadata={source:'test',maps:{5:{environment:'cave'}}};options.edit?.(game,content);
 }});
 const B=await build(),flow=h.G.PSFlow;
 // Install the exact compiled production bridge/begin/abort bodies; presentation devices remain controlled.
 const body=(start,end)=>{const a=B.flow.indexOf(start),b=B.flow.indexOf(end,a);assert(a>=0&&b>a,start);return B.flow.slice(a,b).trim();};
 const bridge=body('openAdmittedWorldBattle(app, admission) {','/** Player-facing entries');
 const begin=body('async begin() {','/** End the battle of');
 Object.assign(flow,{running:false,request:null,_op:null,perf:{},assertBattleAllowed(){},game:h.state,limits:()=>h.E.limits.DEFAULT_LIMITS,_prepareBattlePresentation(){},
  abort(error,op){if(op!==this._op)return;h.app.abortAdmittedWorldBattle(op.worldAdmission,String(error));this.running=false;this.lastOutcome={code:0,error:String(error)};},
 });
 h.G.Scene_PSBattle=h.G.Scene_Battle;
 // Capture and reproduce only visual/audio dependencies; admission/start and all business providers stay actual.
 const script=`(function(G,W,PSFlow){let openingBattle=null;const NAME='PS_BattleFlow';
 const effectiveBattleEffects=()=>true,effectiveBattleStyle=()=> 'switch',battlebackContext=()=>({time:0}),prebattlePlan=()=>({}),musicSettings=()=>({});
 const battleMusic={capture(){return G.visualCapture?G.visualCapture():{};}};const prebattle={open(){return false;}};
 const engine=()=>({B:{limits:G.productionLimits}}),withInitialField=(r)=>r;
 Object.assign(PSFlow,{${bridge}${begin}});
 })(globalThis,globalThis,globalThis.PSFlow);`;
 h.G.productionLimits=h.E.limits;vm.runInContext(script,h.G,{filename:'compiled-production:world-admission+begin'});
 h.flow=flow;return h;
}
module.exports={fixture,flush:()=>new Promise(setImmediate)};
