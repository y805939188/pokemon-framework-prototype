'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../../../../js/engine/build/production.cjs'),T=require('../../../../js/engine/build/testing.cjs');
const D=T.trainerAiDiagnostics,clone=v=>JSON.parse(JSON.stringify(v));
const source=path.resolve(__dirname,'../../../../content/sample');
function content({items=[],moves=['tackle','growl'],party=2,skill=100}={}){
 const input=Object.fromEntries(['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'].filter(n=>fs.existsSync(path.join(source,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),JSON.parse(fs.readFileSync(path.join(source,n+'.json'),'utf8'))]));
 input.species.find(s=>s.id==='pidgey').learnset=moves.map(move=>({level:1,move}));
 input.species.find(s=>s.id==='snorlax').learnset=['splash','tackle','growl','protect'].map(move=>({level:1,move}));
 input.items=Object.values(E.itemCatalog.legacyCatalog()).map(item=>({...item,source:'author-placeholder'}));
 for(const battleId of ['fullrestore','ether'])if(!input.items.some(i=>i.id===battleId))input.items.push({id:battleId,battleId,battleUse:'member',name:battleId,namePlural:battleId,pocket:2,source:'author-placeholder'});
 const full=input.items.find(i=>i.id==='fullrestore');full.battleId='fullrestore';full.battleUse='member';
 input.trainerTypes=[{id:'c-trainer',nameKey:'trainer.type.c',gender:0,source:'author-placeholder',baseMoney:20,skillLevel:skill,flags:[],items}];
 input.trainers=[{id:'c-basic',type:'c-trainer',name:'C Trainer',version:1,source:'author-placeholder',party:Array.from({length:party},(_,i)=>({species:'pidgey',level:50,moves}))}];
 const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
 const result=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(result.errors,[]);return result.content;
}
async function fixture(options={}){
 let c=content(options),worldDraws=0;
 const game=E.state.newGame({content:c,party:[],money:1000});
 const member=E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},c,()=>0);
 game.party=[E.speciesKey.toPersistentMember(member,c)];game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),projection=T.fakes.createRecordingProjection();
 let onContent=null;
 const factory=E.composition.createBattleSessionFactory({content:()=>{if(onContent)onContent();return c;},...(options.unseeded?{}:{seed:()=>options.seed??[1,2,3,4]})});
 const app=new E.app.GameApplication({state,projection,sessions:factory,content:()=>({content:c}),random:n=>{worldDraws++;return 0;},clock:()=>12345});
 const request={battleId:options.battleId??'C-integration',trainer:{id:'c-basic',version:1},seq:1,canLose:true};
 const session=await app.startTrainerBattle(request);
 return {app,session,gw:session.gw,request,state,projection,get content(){return c;},setContent:v=>{c=v;},setOnContent:f=>{onContent=f;},worldDraws:()=>worldDraws};
}
const inspect=w=>D.inspectTrainerAiRequest(w.session,w.session.gw),diag=w=>D.trainerAiDiagnostics(w.session);
module.exports={E,T,D,clone,content,fixture,inspect,diag};
