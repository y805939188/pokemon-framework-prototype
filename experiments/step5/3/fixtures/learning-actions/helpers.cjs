'use strict';
// Synthetic source-checked content fixture, using the actual compiler and runtime assembly. No reference runtime.
const assert = require('node:assert/strict');
const SHA = 'a'.repeat(40);
const moves = [
  {id:'tackle',name:'Tackle',pp:35}, {id:'growl',name:'Growl',pp:40},
  {id:'cut',name:'Cut',pp:30}, {id:'chargebeam',name:'Charge Beam',pp:10},
  {id:'rest',name:'Rest',pp:5}, {id:'unlisted',name:'Only Egg Unknown',pp:7},
];
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const slot = (id,pp=1,maxpp=40,ppUps=2) => ({id,pp,maxpp,ppUps});
const member = (extra={}) => ({
  id:'learner1',species:'learner',form:0,nickname:'Kept',level:5,exp:125,hp:20,status:'',statusCount:0,
  moves:[slot('tackle')],item:'held.author.id',ball:'ball.author.id',ability:'Ability A',nature:'Hardy',statNature:null,gender:'N',
  friendship:99,personalID:7,owner:{id:3,name:'Owner',gender:2,language:1},ownerCompatibilityDefault:false,
  origin:{method:1,map:8,text:'Fixture',level:5,receivedAt:100,hatchedMap:0,hatchedAt:null,compatibilityDefault:false},
  abilityIndex:0,effectiveAbilityIndex:0,shiny:false,superShiny:false,firstMoves:['tackle'],markings:[1,0,0,0,0,0],
  ribbons:['history'],cannotStore:false,cannotRelease:false,cannotTrade:false,isEgg:false,mail:null,
  readyToEvolve:true,evolutionReadiness:'known', ...extra,
});
const full = (extra={}) => member({moves:[slot('cut',0,48,3),slot('tackle',3,56,3),slot('growl',2,64,3),slot('rest',4,8,3)],...extra});
const context = (extra={}) => ({shadow:false,friendship:{mapId:8,AFFECTION_EFFECTS:false},
  friendshipSource:{item:'soothebell',ball:'luxuryball',origin:{map:8}},...extra});
function inputs() {
  return {manifest:{schema:1,id:'learning-actions',title:'Learning composition fixture'},
    sources:[{id:'sd',kind:'showdown',description:'synthetic pinned fixture',license:'test',ref:'test',status:'confirmed',usedFor:[],
      usageCheck:{checkedOn:'2026-10-26',checkedBy:'test',conditions:'test only',decision:'internal-use'}},
      {id:'author',kind:'author-placeholder',description:'synthetic authored table',license:'test',ref:'test',status:'placeholder',usedFor:[]}],
    species:[{id:'learner',showdownId:'learner',nameKey:'species.learner',growth:'medium',baseExp:64,evYield:{},catchRate:45,
      learnset:[{level:1,move:'tackle'},{level:3,move:'growl'},{level:99,move:'rest'}],tutorMoves:['chargebeam'],source:'author'},
      {id:'learner',form:1,showdownId:'learnerone',source:'author',learnset:[{level:1,move:'tackle'}],tutorMoves:[]}],
    items:[{id:'TM57',name:'Hidden Machine',namePlural:'Hidden Machines',fieldUse:'tr',move:'chargebeam',pocket:4,consumable:true,source:'author'},
      {id:'TR.unlimited',name:'Record',fieldUse:'tm',move:'chargebeam',pocket:4,consumable:true,source:'author'},
      {id:'fake-tr',name:'Technical Record',fieldUse:'hm',move:'cut',pocket:4,consumable:true,source:'author'},
      {id:'record-free',name:'Free Record',fieldUse:'tr',move:'chargebeam',pocket:4,consumable:false,source:'author'},
      {id:'ordinary',name:'TR57',fieldUse:'none',pocket:1,source:'author'}],overlays:[]};
}
function dex() {
  return {sha:()=>SHA,species:id=>({name:id,baseSpecies:'learner',types:['Normal'],baseStats:{hp:40,atk:40,def:40,spa:40,spd:40,spe:40},abilities:['Ability A'],gender:'N'}),
    move:id=>moves.find(move=>move.id===id) ?? null,allMoves:()=>clone(moves),allAbilities:()=>[{id:'abilitya',name:'Ability A'}],
    levelUpMoves:()=>({})};
}
async function content(modules, change=()=>{}) {
  const raw=inputs(); change(raw);
  const compiled=modules.compileContent(raw,{}, {showdownSha:SHA});
  assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
  const assembled=modules.assembleContent(compiled.data,dex());
  assert.deepEqual(assembled.errors,[]);
  return assembled.content;
}
function inventory(modules,c,itemId='TM57',quantity=2) {
  return quantity ? modules.addItems(modules.newInventory(),itemId,quantity,modules.catalogOf(c),modules.inventoryPolicy(c)) : modules.newInventory();
}
module.exports={SHA,moves,clone,freeze,slot,member,full,context,inputs,dex,content,inventory};
