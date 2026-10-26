'use strict';
// Actual compiler/assembly/rule/application chain with controlled authored data. No Ruby or breeding/runtime claim.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs'),F=require('./fixtures/learning-actions/helpers.cjs');
const M={...E.contentCompile,...E.contentRuntime,...E.learningActions},clone=F.clone;
const teacher=(c,member=F.member({item:''}),moveId='unlisted')=>E.learningActions.planTeachingAction(member,c,{kind:'generic',moveId},F.context());
function ancestor(base,id,eggs){return {...clone(base),id,showdownId:id,nameKey:'species.'+id,tutorMoves:[],eggMoves:eggs,evolutions:[{target:'learner',method:'Level',parameter:16}]};}
function compile(raw){const r=E.contentCompile.compileContent(raw,{}, {showdownSha:F.SHA});assert.equal(r.ok,true,JSON.stringify(r.errors));return r.data;}
test('author1 egg list reaches cache3 and canonical runtime move identity; absent and explicit empty remain distinct',async()=>{
 const c=await F.content(M,raw=>raw.species[0].eggMoves=['unlisted']);assert.equal(c.meta.compiledSemantics,3);assert.deepEqual(c.species.learner.eggMoves,['Only Egg Unknown']);assert.equal(teacher(c).status,'ready');
 const unknown=await F.content(M);assert.equal(Object.hasOwn(unknown.species.learner,'eggMoves'),false);assert.equal(teacher(unknown).reason,'compatibility-unavailable');
 const empty=await F.content(M,raw=>raw.species[0].eggMoves=[]);assert.deepEqual(empty.species.learner.eggMoves,[]);assert.equal(teacher(empty).reason,'incompatible');
});
test('form omission inherits once but explicit empty does not borrow base egg table',async()=>{
 const inherited=await F.content(M,raw=>raw.species[0].eggMoves=['unlisted']);assert.equal(teacher(inherited,F.member({form:1})).status,'ready');
 const explicit=await F.content(M,raw=>{raw.species[0].eggMoves=['unlisted'];raw.species[1].eggMoves=[];});assert.equal(teacher(explicit,F.member({form:1})).reason,'incompatible');assert.equal(teacher(explicit).status,'ready');
 const over=await F.content(M,raw=>{raw.species[0].eggMoves=['unlisted'];raw.overlays=[{target:'species/learner',set:{eggMoves:[]},reason:'explicit known-empty base'}];});assert.deepEqual(over.species.learner.eggMoves,[]);assert.deepEqual(over.species.learnerone.eggMoves,['Only Egg Unknown']);
});
test('only an empty current egg table uses first registered predecessor; current nonempty never unions another table',async()=>{
 const c=await F.content(M,raw=>{const root=raw.species[0];root.eggMoves=[];raw.species.unshift(ancestor(root,'early',['unlisted']),ancestor(root,'later',['chargebeam']));});assert.equal(teacher(c).status,'ready');
 const reversed=await F.content(M,raw=>{const root=raw.species[0];root.eggMoves=[];raw.species.unshift(ancestor(root,'later',['chargebeam']),ancestor(root,'early',['unlisted']));});assert.equal(teacher(reversed).reason,'incompatible');
 const own=await F.content(M,raw=>{const root=raw.species[0];root.eggMoves=['growl'];raw.species.unshift(ancestor(root,'early',['unlisted']));});assert.equal(teacher(own).reason,'incompatible');
});
test('unknown current/pred data is unavailable, no predecessor is known absence, tutor/level positives do not need eggs',async()=>{
 for(const current of [false,true]){const c=await F.content(M,raw=>{const root=raw.species[0];if(current)root.eggMoves=[];const pre=ancestor(root,'previous',[]);delete pre.eggMoves;raw.species.unshift(pre);});assert.equal(teacher(c).reason,'compatibility-unavailable');assert.equal(teacher(c,undefined,'chargebeam').status,'ready');assert.equal(teacher(c,undefined,'rest').status,'ready');}
 const c=await F.content(M,raw=>raw.species[0].eggMoves=[]);delete c.registrationOrder;assert.equal(teacher(c).reason,'compatibility-unavailable');
});
test('author/overlay/cache malformed egg tables reject, missing pinned move is a located assembly error',()=>{
 for(const value of [null,1,{},[1],[''],new Array(1)]){const raw=F.inputs();raw.species[0].eggMoves=value;const r=E.contentCompile.compileContent(raw,{}, {showdownSha:F.SHA});assert.equal(r.ok,false);assert.equal(r.data,undefined);assert(r.errors.some(e=>e.path.includes('eggMoves')));}
 const raw=F.inputs();raw.species[0].eggMoves=['not-a-move'];const cache=compile(raw),r=E.contentRuntime.assembleContent(cache,F.dex());assert(r.errors.some(e=>e.path.endsWith('.eggMoves[0]')));
 const broken=clone(cache);broken.species[0].eggMoves=42;assert.throws(()=>E.contentRuntime.loadCompiled(broken),/eggMoves/);
 const overlay=F.inputs();overlay.overlays=[{target:'species/learner',set:{eggMoves:null},reason:'invalid'}];assert.equal(E.contentCompile.compileContent(overlay,{}, {showdownSha:F.SHA}).ok,false);
});
test('cache2 requires rebuild; save schema stays7; egg data and semantic version alter strong identity without relayout',()=>{
 const raw=F.inputs(),unknown=compile(raw);raw.species[0].eggMoves=[];const empty=compile(raw);assert.equal(empty.schema,3);assert.notEqual(unknown.inputsHash,empty.inputsHash);assert.notEqual(unknown.contentIdentity,empty.contentIdentity);assert.equal(unknown.regionalDex.layoutIdentity,empty.regionalDex.layoutIdentity);
 assert.throws(()=>E.contentRuntime.loadCompiled({...empty,schema:2}),/needs-rebuild/);assert.match(E.contentCompile.checkFresh({...empty,schema:2},raw).message,/needs-rebuild/);
 const {content:c}=E.contentRuntime.assembleContent(empty,F.dex());const old=clone(c);old.meta.compiledSemantics=2;old.meta.contentIdentity=E.digest.sha256Hex(E.contentCompile.canonicalJson({compiledSemantics:2,inputsHash:old.meta.inputsHash,showdownSha:old.meta.showdownSha}));assert.equal(E.contentRuntime.validatedContentIdentity(old),null);assert(E.contentRuntime.validatedContentIdentity(c));
});
test('PBS EggMoves imported at base/form with source identity; missing stays unknown and malformed/empty text fails atomically',()=>{
 const required='GrowthRate=Medium\nBaseExp=64\nEVs=HP,1\nMoves=1,TACKLE\n',file=(name,text)=>({file:name,read:()=>text});
 const run=(value,forms)=>E.pbsImport.importPbsBundle({sourceId:'author',sourceProblem:()=>null,baseFiles:[file('pokemon.txt','[LEARNER]\n'+required+(value===undefined?'':'EggMoves='+value+'\n'))],formFiles:forms?[file('forms.txt','[LEARNER,1]\nEggMoves=GROWL\n')]:[],resolveFormShowdownId:()=> 'learnerone'});
 const r=run('UNLISTED,REST',true);assert.equal(r.ok,true,JSON.stringify(r.errors));assert.deepEqual(r.species[0].eggMoves,['unlisted','rest']);assert.deepEqual(r.species[1].eggMoves,['growl']);assert(!JSON.stringify(r.report?.deferred??r.deferred??[]).includes('EggMoves'));
 assert.equal(Object.hasOwn(run(undefined).species[0],'eggMoves'),false);
 assert.deepEqual(run('TACKLE,').species[0].eggMoves,['tackle']);for(const value of ['',',','not-valid!']){const bad=run(value);assert.equal(bad.ok,false);assert.deepEqual(bad.species,[]);assert(bad.errors.some(e=>e.path.endsWith('.EggMoves')));}
});
test('egg table permits actual machine transaction through application; no egg pool leaks into reminder candidates',async()=>{
 const c=await F.content(M,raw=>{raw.items.push({id:'pokeball',name:'Poke Ball',pocket:3,battleUse:'ball',battleId:'pokeball',flags:['PokeBall'],fieldUse:'none',source:'author'});raw.species[0].tutorMoves=[];raw.species[0].eggMoves=['unlisted'];raw.items[0].move='unlisted';}),member=E.memberFactory.createMember({id:'egg-learner',species:'learner',form:0,level:5,context:{map:8,receivedAt:100}},c,()=>0);
 const game=E.state.newGame({party:[member],bag:{TM57:1},content:c}),state=E.fakes.createMemoryState(game);assert.equal(game.schema,7);assert.deepEqual(E.saveSchema.validateGameContent(game,c),[]);
 const app=new E.app.GameApplication({state,content:()=>({content:c}),sessions:{create(){throw Error('not in scope');}},projection:{project(){}},itemWorld:()=>({mapId:8})});const parent=app.beginInventoryOperation('bag');
 assert.equal(app.beginLearning({kind:'teach',memberId:member.id,source:{kind:'machine',itemId:'TM57',entry:'bag'}},{kind:'inventory',token:parent}).status,'committed');assert(state.current().party[0].moves.some(m=>m.id==='unlisted'));assert.equal(E.inventory.itemQuantity(state.current().inventory,'TM57',c.items),0);assert.equal(state.current().stats.moves_taught_by_item,1);assert.equal(state.replaced.length,1);app.endInventoryOperation(parent);
 const reminder=E.learningActions.planRelearningAction(member,c,{shadow:false});assert.equal(reminder.status,'empty');
});
test('predecessor egg fallback uses the selected form relation rather than borrowing its base form table',async()=>{
 const c=await F.content(M,raw=>{const base=raw.species[0];base.eggMoves=[];raw.species[1].eggMoves=[];const pre=ancestor(base,'previous',['growl']);
  raw.species.unshift(pre,{id:'previous',form:1,showdownId:'previousone',source:'author',eggMoves:['unlisted']});});
 assert.equal(teacher(c,F.member({form:1})).status,'ready');assert.equal(teacher(c,F.member({form:0})).reason,'incompatible');
});
