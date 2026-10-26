'use strict';
// Accepted F public exports + B shape composition. Actual event sources/installations remain E work.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs'),K=require('../../../js/engine/build/core.cjs');
const F=require('./fixtures/pokedex/support.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));

test('F public core and engine agree; normalized recent values stay valid B save data',()=>{
 for(const name of ['pokedex','pokedexQuery'])assert.deepEqual(Object.keys(E[name]).sort(),Object.keys(K[name]).sort());
 const content=clone(E.fixtures.content),game=E.fixtures.makeGame(),m=game.party[0],before=clone(game);
 for(const runtime of [E,K]){
  const appearance=runtime.pokedex.normalizeDexAppearance(content,{species:m.species,form:m.form,gender:0,shiny:false},'recent');assert.ok(appearance);
  const plan=runtime.pokedex.planDexLastSeen(game.dex,m.species,appearance);assert.equal(plan.status,'ok');
  const next={...game,dex:runtime.pokedex.applyDexPatch(game.dex,plan.patch)};
  assert.deepEqual(Object.keys(next.dex.lastSeenForm[m.species]).sort(),['form','gender','shiny']);
  assert.deepEqual(runtime.saveSchema.validateGameContent(next,content),[]);
 }
 assert.deepEqual(game,before);
});
test('F complete entry keeps numbering -1 while actual no-map Area resolves region0',()=>{
 const layout=F.layout(),dex=F.dex(layout,{view:{region:-1,indices:[0,0,0],mode:0}}),before=clone(dex);
 for(const runtime of [E,K]){
  const number=runtime.pokedexQuery.dexCompleteEntryNumber(dex,layout,'c',{locale:'en',currentRegion:-1,useCurrentRegion:true});
  assert.equal(number.region,-1);assert.equal(number.number,1);assert.equal(number.sceneRegion,0);
  const area=runtime.pokedexQuery.dexArea('c',{region:number.sceneRegion,encounterVersion:0,tables:[{mapId:1,version:0,species:['c']}],maps:[{mapId:1,region:0,x:2,y:3}],points:[{region:0,x:2,y:3,visible:true}]});
  assert.deepEqual(area,{status:'known',points:[{x:2,y:3}],diagnostics:[]});
 }
 assert.deepEqual(dex,before);
});
