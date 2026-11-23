'use strict';
// True installed IIFE/App/atomic adapter; spies only delegate real factory/install methods.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture,record,flush}=require('./commands-fixture.cjs');
const ids=["IF-WILD-META", "IF-TRAINER-META", "IF-WILD-SESSION", "IF-TRAINER-SESSION", "IF-WILD-ARGS", "IF-TRAINER-ARGS", "IF-SOURCE", "IF-CONTENT", "IF-GENERATION", "IF-HOUR", "IF-INVALID-META", "IF-BUSY-APIS"];
const id=process.env.PF_G_COMMAND_CASE;assert(ids.includes(id),'unknown legacy capture control');
const choices={weather:'none',terrain:'none',environment:'none'};
async function host(extra={}){
 const counts={factoryCalls:0,factorySuccess:0,atomicInstalls:0,legacyReplaces:0},handles=[],entryFailures=[];
 const E=require('../../../../scripts/tests/final-production-runtime.cjs').get().E,dex=E.dex.createDexLookup();
 let nativeReflect;
 const h=await fixture({
  edit(game,content){
   // Registered content IDs retain real supported Showdown rule species for positive Sessions.
   const rules={A:'Pidgey',B:'Rattata',C:'Pidgeotto'},canonical={},forms={},speciesKeys={},speciesIds={};
   for(const [id,name]of Object.entries(rules)){assert(Object.hasOwn(rules,id));assert.equal(typeof name,'string');const definition=dex.species(name);assert(definition);canonical[name]={...content.species[id],contentId:id,form:0,ruleSpecies:name,base:{...definition.baseStats},types:[...definition.types],abilities:['Keen Eye'],gender:'M'};forms[id]={'0':name};speciesKeys[name]={species:id,form:0};speciesIds[id]=name;}
   // Formal species-key contract: storage uses ABC; content.species/Session use actual engine battle names.
   content.species=canonical;content.forms=forms;content.speciesKeys=speciesKeys;content.speciesIds=speciesIds;
   content.abilities.keeneye={id:'keeneye',name:'Keen Eye'};
   // Authored initial member, before the measured request; no acceptance sampling.
   game.party[0]=E.speciesKey.toPersistentMember(E.memberFactory.createMember({species:'Pidgey',level:5,id:game.party[0].id,owner:game.player},content,()=>0),content);
   game.party[0].moves=[{id:'tackle',pp:35,maxpp:35,ppUps:0}];
   content.trainerTypes={ace:{id:'ace',nameKey:'type.ace',gender:0,baseMoney:10,skillLevel:0,flags:[],items:[],source:'literal'}};
   content.registrationOrder=Object.keys(rules).map(species=>({species,form:0}));content.trainerTypeOrder=['ace'];content.trainers={npc:[{id:'npc',type:'ace',name:'Tester',version:0,party:[{species:'A',level:5,moves:['tackle']}],source:'literal'}]};
  },
  applicationPorts(ports){
   const actual=ports.sessions,create=actual.create;
   // Legacy no-held composition explicitly observes dynamic create on this exact private factory key.
   actual.create=async function(...args){counts.factoryCalls++;try{const handle=await Reflect.apply(create,actual,args);counts.factorySuccess++;handles.push(handle);return handle;}catch(error){entryFailures.push({at:'real-factory',error:String(error?.stack??error)});throw error;}};assert.equal(ports.sessions,actual);
   const replace=ports.state.replace;ports.state.replace=function(...args){counts.legacyReplaces++;return Reflect.apply(replace,this,args);};
  },
  nativeSetup(n){
   const parameters=n.G.PluginManager.parameters;
   // Synthetic authored content uses the existing explicit real-engine no-held fixture root.
   n.G.PluginManager.parameters=function(name){const current=Reflect.apply(parameters,this,[name]);return name==='PS_BattleFlow'?{...current,contentSource:'fixture'}:current;};
   nativeReflect=vm.runInContext('Reflect',n.G);const define=nativeReflect.defineProperty;
   nativeReflect.defineProperty=function(target,key,descriptor){if(target===n.G.$gameSystem&&key==='_psGame')counts.atomicInstalls++;return Reflect.apply(define,this,[target,key,descriptor]);};
  },
  afterPrepare:extra.afterPrepare,
 });
 const begin=h.flow.begin;h.flow.begin=async function(...args){try{return await Reflect.apply(begin,this,args);}catch(error){entryFailures.push({at:'real-flow-begin',error:String(error?.stack??error)});throw error;}};
 h.flow._dex=dex;assert(h.app.trainerRecord('npc',0),'actual legal Trainer must be registered');
 assert.equal(h.sessions.length,0,'fixture fake sessions are not the production Session factory');
 return {...h,counts,handles,entryFailures,ruleSpeciesTypes:Object.entries(h.content.species).map(([name,species])=>({name,type:typeof species.ruleSpecies}))};
}
function snapshot(h){return{game:structuredClone(h.state()),identity:h.state(),op:h.flow._op,running:h.flow.running,blocked:h.app.saveBlocked,generation:h.app.stateGeneration,seq:h.G.$gameSystem._psBattleSeq||0,counts:{...h.counts}};}
function delta(h,b){return Object.fromEntries(Object.keys(h.counts).map(k=>[k,h.counts[k]-b.counts[k]]));}
function unchanged(h,b,{generationChanged=false}={}){
 assert.equal(h.counts.factoryCalls-b.counts.factoryCalls,0);assert.equal(h.counts.factorySuccess-b.counts.factorySuccess,0);
 assert.equal(h.counts.atomicInstalls-b.counts.atomicInstalls,0);assert.equal(h.counts.legacyReplaces-b.counts.legacyReplaces,0);
 assert.equal(h.flow._op,b.op);assert.equal(h.flow.running,b.running);assert.equal(h.state(),b.identity);assert.deepEqual(h.state(),b.game);
 if(!generationChanged){assert.equal(h.app.saveBlocked,b.blocked);assert.equal(h.app.stateGeneration,b.generation);}
}
function args(trainer){return{battleId:id,...(trainer?{trainerId:'npc',version:'0'}:{foes:'A:5'}),canLose:'false',canSwitch:'true',battleStyle:'set',expGain:'true',battleEffects:'inherit',noRun:'false',noBall:'false'};}
function invoke(h,trainer,overrides={}){return h.command(trainer?'StartTrainerBattle':'StartBattle',{...args(trainer),...overrides},new h.G.Game_Interpreter(),'PS_BattleFlow');}
function save(h,b,extra={}){record(id,h,{fixtureRuleSpeciesTypes:h.ruleSpeciesTypes,sessionMode:'real-engine legacy-no-held fixture content; original registered factory identity preserved',realFactoryAndNativeAtomicCounts:{before:b.counts,after:{...h.counts},delta:delta(h,b)},hostSequence:{before:b.seq,after:h.G.$gameSystem._psBattleSeq||0},actualAppGeneration:{before:b.generation,after:h.app.stateGeneration},...extra});}

test(id+' actual installed consumer preserves private busy distinction and nonbusy rejection',async()=>{
 if(id==='IF-BUSY-APIS'){
  let armed=false,release;const h=await host({afterPrepare({result}){if(armed&&result.status==='value'){armed=false;return new Promise(r=>release=r);}}});
  armed=true;const pending=h.command('RegisterEventCompanion',{eventId:'1'});for(let i=0;i<30&&!release;i++)await flush();assert(release);const b=snapshot(h);
  const actual=h.app.latchLegacyBattleContext(choices),fields=h.app.latchLegacyBattleFields({weather:'inherit',terrain:'none',environment:'none'}),generated=h.app.latchGeneratedWildBattleContext(choices);
  assert.equal(actual.status,'busy');assert.equal(fields.status,'unavailable');assert.equal(generated.status,'unavailable');unchanged(h,b);assert.equal(h.flow.worldAuthorInputPending(),true);
  const observed={actual,fields,generated};save(h,b,{observed,unrelatedOwnerPreserved:true});pending.interpreter.clear();release();await flush();return;
 }
 const h=await host(),trainer=id.startsWith('IF-TRAINER'),b=snapshot(h);assert.equal(b.blocked,false);assert.equal(b.running,false);
 if(id.endsWith('-META')&&id!=='IF-INVALID-META'){
  const content=h.flow.content(),metadata=content.mapMetadata;delete content.mapMetadata;
  try{assert.throws(()=>invoke(h,trainer),/map metadata: world-provider-unavailable/);unchanged(h,b);assert.equal(h.G.$gameSystem._psBattleSeq,b.seq+1);save(h,b,{postStateAssertionsReached:true,legalTrainer:trainer});}
  finally{content.mapMetadata=metadata;}return;
 }
 if(id.endsWith('-ARGS')){
  assert.throws(()=>invoke(h,trainer,{battleEnvironment:'unknown-environment'}),/unsupported world battle environment/);unchanged(h,b);assert.equal(h.G.$gameSystem._psBattleSeq||0,b.seq);save(h,b,{unknownValueRejectedBeforeSequenceAndCapture:true});return;
 }
 if(id.endsWith('-SESSION')){
  const c=invoke(h,trainer);assert.equal(c.returned,true);assert.equal(c.interpreter._waitMode,'psBattle');
  try{await h.pump(()=>{if(h.entryFailures.length)throw Error('real entry failure: '+JSON.stringify(h.entryFailures));return h.handles.length===1&&h.flow._op?.session===h.handles[0];},200);}catch(error){save(h,b,{positiveControlFailure:String(error),entryFailures:h.entryFailures,lastOutcome:h.flow.lastOutcome??null,sessionObserved:h.handles.length,realFactoryCounters:{...h.counts}});throw error;}
  assert.equal(h.counts.factoryCalls-b.counts.factoryCalls,1);assert.equal(h.counts.factorySuccess-b.counts.factorySuccess,1);assert.equal(h.sessions.length,0);assert.equal(h.flow.running,true);assert.equal(h.G.$gameSystem._psBattleSeq,b.seq+1);
  const op=h.flow._op;save(h,b,{positiveRealSession:true,kind:op.request.kind,sessionFactoryFulfilled:true,hostSessionSameActualHandle:op.session===h.handles[0]});
  h.app.abortBattle({battleId:op.request.battleId},Error('bounded-positive-control-stop'));h.flow.close(0,op,false);return;
 }
 if(id==='IF-GENERATION'){
  const issued=h.app.latchLegacyBattleContext(choices);assert.equal(issued.status,'value');h.flow.stateReplaced();assert(h.app.stateGeneration>b.generation);
  assert.equal(h.app.isLegacyBattleFieldCurrent(issued.value),false);const accepted=h.flow.tryOpenBattle({battleId:id,kind:'wild',foes:[{species:'A',level:5}],seq:1},undefined,issued.value);assert.equal(accepted,false);
  unchanged(h,b,{generationChanged:true});save(h,b,{actualStateReplaced:true,genuineOldLatchRejected:true,consumer:'real PSFlow.tryOpenBattle'});return;
 }
 if(id==='IF-HOUR'){
  h.flow.clock=()=>NaN;assert.throws(()=>invoke(h,false),/world hour/);unchanged(h,b);save(h,b,{unknownHourRejected:true});return;
 }
 if(id==='IF-INVALID-META'){
  h.content.mapMetadata.maps[5].environment='unknown-environment';assert.throws(()=>invoke(h,false),/invalid map battle environment|map metadata/);unchanged(h,b);save(h,b,{invalidMetadataRejected:true});return;
 }
 if(id==='IF-SOURCE'||id==='IF-CONTENT'){
  let armed=true,changed=false;const original=h.flow.clock;
  h.flow.clock=()=>{if(armed){armed=false;changed=true;if(id==='IF-SOURCE')h.player._x++;else h.flow._content=structuredClone(h.content);}return original();};
  assert.throws(()=>invoke(h,false),/legacy-world-(?:capture|source|business|weather)|atomic-/);assert(changed);unchanged(h,b);save(h,b,{actualTrustedClockFault:id,realSourceOrContentChanged:true});return;
 }
 throw Error('unimplemented explicit legacy control '+id);
});
