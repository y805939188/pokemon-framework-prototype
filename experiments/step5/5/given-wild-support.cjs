'use strict';
// Formal complete-individual input; no real save. Factories are used only to prepare test data, before counters begin.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require(process.env.PF_GIVEN_ENGINE||'../../../js/engine/build/production.cjs');
const F=require('../../../tests/support/saves/legacy-migration/fixtures.cjs');
const copy=structuredClone;
function member(content,id='Given1',species='B'){
 const name=E.speciesKey.battleNameOf(content,{species,form:0})??species;
 const m=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id,species:name,level:5,owner:{id:987654,name:'Author',gender:1,language:2}},content,()=>0),content);
 return {...m,personalID:0x12345678,nature:'modest',gender:'F',shiny:true,superShiny:false,ivs:{hp:1,atk:2,def:3,spa:4,spd:5,spe:6},evs:{hp:6,atk:5,def:4,spa:3,spd:2,spe:1},nickname:'Given nickname',origin:{...m.origin,receivedAt:42,map:7},firstMoves:['tackle']};
}
function fixture(options={}){
 let content=F.content(E);content.moves.tackle=content.moves.Tackle;content.settings={AFFECTION_EFFECTS:false};options.edit?.(content);
 const party=options.party||[member(content,'P1','A')];let game=E.state.newGame({party,content});
 const sessions=[],draws=[],writes=[],counts={clock:0,context:0,content:0};let app;
 const ports={state:{read:()=>game,replace:next=>{writes.push(next);game=next;}},content(){counts.content++;options.onContent?.({app,game,content});return {content};},sessions:{async create(request,view,setup){sessions.push({request,view,setup});return options.create?options.create({app,request,view,setup}):{result(){throw Error('unfinished');}};}},projection:{project(){}},random(n){draws.push(n);return 0;},clock(){counts.clock++;return 1000;},creationContext(){counts.context++;return{};}};
 if(options.noRandom)delete ports.random;
 app=new E.app.GameApplication(ports);
 return {app,content,sessions,draws,writes,counts,provided:member(content),state:()=>game,replaceGame(next){game=next;},replaceContent(next){content=next;}};
}
function realContent(){
 const sample=path.resolve(__dirname,'../../../content/sample'),names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
 const input=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(sample,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(sample,n+'.json'),'utf8'))]));
 input.species.push({...copy(input.species.find(s=>s.id==='pidgey')),id:'milcery-test',showdownId:'milcery',nameKey:'species.milcery_test'});
 input.items=[...Object.values(E.itemCatalog.legacyCatalog()).map(i=>({...i,source:'author-placeholder'})),{id:'ribbonsweet',name:'Ribbon Sweet',namePlural:'Ribbon Sweets',pocket:1,order:999,price:0,sellPrice:0,flags:[],fieldUse:'none',battleUse:'none',battleId:'ribbonsweet',legacyIds:[],consumable:true,source:'author-placeholder'}];
 input.settings={...input.settings,GAIN_EXP_FOR_CAPTURE:false};const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);return{content:assembled.content,dex};
}
module.exports={E,F,copy,member,fixture,realContent};
