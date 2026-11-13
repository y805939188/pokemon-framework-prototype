'use strict';
// Normal production H3 fixtures: no developer capability overrides at compile, assembly or App creation.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
// Historical runtime-plan.json is retained byte-for-byte; this successor uses its own strict current binding.
const current = require('../capture-run-current-headless-runtime.json');
const runtime = process.env.H3_RUNTIME_ROOT;
assert(runtime, 'explicit frozen runtime root required');
const candidateBinding=require(path.join(runtime,'scripts/headless-regression-binding.cjs'));
const candidate=process.env.PF_HEADLESS_REGRESSION_BINDING?candidateBinding.capture(runtime,process.env.PF_HEADLESS_REGRESSION_BINDING):null;
if(candidate)assert.equal(candidate.binding.showdownSHA,current.showdownSHA,'fixed H3-vector Showdown pin');
if(!candidate){
assert.equal(current.schema,'capture-run-current-headless-v1');assert.equal(Object.keys(current.runtime).length,9);
assert.equal(require('node:child_process').execFileSync('git',['rev-parse','HEAD:src'],{cwd:runtime,encoding:'utf8'}).trim(),current.productSrcTree,'current product source tree');
for (const [name, expected] of Object.entries(current.runtime)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,name))).digest('hex'),expected,name);
assert.equal(fs.readFileSync(path.join(runtime,'js/engine/showdown/SOURCE_SHA'),'utf8').trim(),current.showdownSHA);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,'js/engine/showdown/dist/config/custom-formats.js'))).digest('hex'),current.runtime['js/engine/build/custom-formats.cjs'],'current staged extension');
}
const currentCommit=candidate?.binding.source.head??require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:runtime,encoding:'utf8'}).trim();
const E = require(path.join(runtime,'js/engine/build/production.cjs'));
const T = require(path.join(runtime,'js/engine/build/testing.cjs'));
const clone = x => JSON.parse(JSON.stringify(x));
const capabilities = {allowHeldItemSources:true,allowExperimentalHeldItemBattle:true};
function fixture(source) {
  const names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
  const input=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(runtime,'content/sample',n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(runtime,'content/sample',n+'.json'),'utf8'))]));
  input.species.find(s=>s.id==='snorlax').learnset=['splash','rest','payday',source.startsWith('capture')?'fling':'trick'].map(move=>({level:1,move}));
  input.species.find(s=>s.id==='pidgey').learnset=[{level:1,move:source.startsWith('capture')?'splash':'tackle'}];
  if(source.startsWith('capture')) input.species.push({id:'meowth',showdownId:'meowth',nameKey:'species.meowth',growth:'medium',baseExp:50,evYield:{},catchRate:255,source:'author-placeholder',learnset:['splash','rest','payday'].map(move=>({level:1,move}))});
  input.items=Object.values(E.itemCatalog.legacyCatalog()).map(item=>({...item,source:'author-placeholder'}));
  if(!input.items.some(i=>i.id==='lumberry'))input.items.push({id:'lumberry',name:'Lum Berry',namePlural:'Lum Berries',pocket:5,price:0,source:'author-placeholder'});
  input.grants=[{id:'h3-held',source:'author-placeholder',members:[{species:'snorlax',level:50,item:'lumberry'}],items:{},money:0}];
  input.trainerTypes=[{id:'h3-type',nameKey:'trainer.h3',gender:0,baseMoney:0,skillLevel:0,flags:[],items:[],source:'author-placeholder'}];
  input.trainers=[{id:'h3-npc',type:'h3-type',name:'H3',version:1,source:'author-placeholder',items:[],party:[{species:'pidgey',level:5,moves:['tackle']}]}];
  const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
  const dex=E.dex.createDexLookup(), assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);
  const content=assembled.content, game=E.state.newGame({content,party:[],bag:{lumberry:2,leftovers:1,masterball:2}});
  game.badges.fill(true); // Existing B obedience precondition, not a battle-state patch.
  if(!['gift','grant'].includes(source)) game.party.push(E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},content,()=>0),content));
  if(['capture-box','capture-replace'].includes(source)) for(let i=2;i<=6;i++) game.party.push(E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P'+i,species:'Snorlax',level:50},content,()=>0),content));
  game.nextMemberOrdinal=String(game.party.length+1);
  const state=T.fakes.createMemoryState(game);
  const app=new E.app.GameApplication({state,content:()=>({content,dex}),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),projection:T.fakes.createRecordingProjection(),random:()=>0,clock:()=>12345},{receivingProfile:{mode:1,naming:1}});
  return {app,state,source,content,dex};
}
function acquire(w) {
  const {app,state,source}=w;
  if(source==='gift')return app.receiveGift({kind:'silent',member:{species:'snorlax',level:50,item:'lumberry'}});
  if(source==='grant')return app.claimGrant('h3-held');
  if(source==='trade') {
    let out=app.beginTrade('h3-trade',{outgoingId:state.current().party[0].id,incoming:{species:'snorlax',item:'lumberry'}});
    for(const decision of [{kind:'confirm',accept:true},{kind:'presented'},{kind:'commit'}]) {assert.equal(out.status,'pending');out=app.resolveTrade(out.view.token,out.view.revision,decision);}
    return out;
  }
  const token=app.beginManagement();
  try{return app.manage(token,'h3-give',{kind:'give-item',source:{id:state.current().party[0].id,position:{kind:'party',index:0}},item:'lumberry'});}finally{app.endManagement(token);}
}

async function acquireUnchecked(w) {
 const out=acquire(w);assert.equal(out.status,w.source==='trade'?'committed':'applied');
 if(!w.source.startsWith('capture'))return;
 const {app,state,source}=w,before=clone(state.read()),writes=state.replaced.length;
 const req={battleId:'H3-'+source+':capture-source',kind:'wild',seq:1,canLose:true,expGain:false,moneyGain:false,foes:[{species:'meowth',level:50}],...(source==='capture-replace'?{forceParty:true}:{})};
 let h;
 try{
 h=await app.startBattle(req);
 const fling=await h.chooseMove(4);assert(fling.ok);const events=fling.messages.flatMap(m=>m.kind==='events'?m.events:[]);
 assert.equal(events.filter(e=>e.type==='-enditem'&&e.args[1]==='Lum Berry'&&e.args.includes('[from] move: Fling')).length,1);
 assert.equal(events.filter(e=>e.type==='-item'&&e.args[1]==='Lum Berry'&&e.args.includes('[from] ability: Pickup')).length,1);
 assert((await h.throwBall('masterball')).ok);assert(h.finished);
 assert.deepEqual(state.read(),before);assert.equal(state.replaced.length,writes);
 const raw=h.result(),id=raw.captured[0].id;assert.equal(raw.captured[0].item,'lumberry');let result=app.finishBattle(h,req);
 if(source==='capture-replace'){assert(result.pending);result=app.resolveReceiving(result.receivingToken,{[id]:{placement:{kind:'replace',target:{id:'P1',position:{kind:'party',index:0}}}}});}
 assert.equal(result.commit,'applied',JSON.stringify(result));assert.equal(state.replaced.length,writes+1);
 const original=E.storage.locateMember(state.read(),'P1');assert.equal(original.member.item,'','Fling retired the player source; capture must not duplicate it');
 const held=[...state.read().party,...state.read().storage.boxes.flatMap(box=>box.slots)].filter(m=>m&&m.item==='lumberry');assert.equal(held.length,1,'exactly one held Lum after capture');
 const found=E.storage.locateMember(state.read(),id);assert.equal(found.member.item,'lumberry');assert.equal(found.position.kind,source==='capture-box'?'box':'party');
 if(found.position.kind!=='party'||found.position.index!==0){const token=app.beginManagement();try{assert.equal(app.manage(token,'H3-place-captured',{kind:'move',source:{id,position:found.position},target:{kind:'party',index:0},expectedTargetId:state.read().party[0].id}).status,'applied');}finally{app.endManagement(token);}}
 assert.equal(state.read().party[0].id,id);assert.equal(state.read().party[0].item,'lumberry');
 }finally{if(h&&!h.finished)app.abortBattle(req,Error('owned capture source cleanup'));}
}
async function acquireReady(w) {
 const before=clone(w.state.read());await acquireUnchecked(w);const next=w.state.read();
 const expectedStats=clone(before.stats),expectedDex=clone(before.dex);
 if(w.source==='trade')expectedStats.trade_count++;
 if(w.source.startsWith('capture'))expectedStats.wild_battles_won++;
 if(w.source!=='give'){
  const species=w.source.startsWith('capture')?'meowth':'snorlax';
  expectedDex.seen=[...new Set([...expectedDex.seen,species])];expectedDex.owned=[...new Set([...expectedDex.owned,species])];
  // Frozen synthetic author input: RNG always returns 0, native species gender/appearance; no engine reference equivalence claim.
  const appearance={gender:1,form:0,shiny:true};
  expectedDex.seenForms[species]=[appearance];expectedDex.lastSeenForm[species]=appearance;
  if(w.source.startsWith('capture')) {
   expectedDex.capturedCounts[species]=(expectedDex.capturedCounts[species]??0)+1;
   // Battle also publicly shows the player's original Snorlax; it is seen, not newly owned.
   expectedDex.seen=[...new Set([...expectedDex.seen,'snorlax'])].sort();
   expectedDex.seenForms.snorlax=[appearance];expectedDex.lastSeenForm.snorlax=appearance;
  }
 }
 assert.deepEqual(next.stats,expectedStats,'whole stats oracle for source '+w.source);
 assert.deepEqual(next.dex,expectedDex,'whole dex oracle for source '+w.source);
}
module.exports={fixture,acquire,acquireReady,E,T,clone,runtime,capabilities,currentCommit,candidate,candidateBinding};
