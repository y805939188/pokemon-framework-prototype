'use strict';
// Portable current-build fixtures; frozen admission hashes remain in H3's separate suite.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const runtime=path.resolve(__dirname,'../../../..');
const E=require(path.join(runtime,'js/engine/build/production.cjs'));
const T=require(path.join(runtime,'js/engine/build/testing.cjs'));
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(source) {
  const names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
  const input=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(runtime,'content/sample',n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(runtime,'content/sample',n+'.json'),'utf8'))]));
  input.species.find(s=>s.id==='snorlax').learnset=['splash','rest','payday','trick'].map(move=>({level:1,move}));
  input.species.find(s=>s.id==='pidgey').learnset=[{level:1,move:source.startsWith('capture')?'splash':'tackle'}];
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
module.exports={E,T,clone,fixture};
