'use strict';
// Formal-spec-derived, synthetic data. No reference implementation or real save is used.
const clone = value => JSON.parse(JSON.stringify(value));
const {createHash} = require('node:crypto');
const identity = layout => createHash('sha256').update(JSON.stringify({national:layout.national,regions:layout.regions.map(({id,species})=>({id,species}))})).digest('hex');
function content(E, regions = [['A','B'],['B','A']]) {
  const species = {};
  for (const name of ['A','B','C','constructor','__proto__','toString']) Object.defineProperty(species,name,{value:{base:{hp:50,atk:50,def:50,spa:50,spd:50,spe:50},growth:'medium',baseExp:50,evYield:{},catchRate:255,learnset:{1:['tackle']},abilities:['Known'],hiddenAbilities:[null,'Hidden'],gender:'N'},enumerable:true,writable:true});
  const regionalDex = {national:['A','B','C'],regions:regions.map((species,id)=>({id,nameKey:`region.${id}`,species}))};
  regionalDex.layoutIdentity=identity(regionalDex);
  return {species,items:E.itemCatalog.legacyCatalog(),moves:{Tackle:{id:'tackle',name:'Tackle',pp:35},Growl:{id:'growl',name:'Growl',pp:40}},abilities:{known:{id:'known',name:'Known'},hidden:{id:'hidden',name:'Hidden'},legacy:{id:'legacyoverride',name:'Legacy Override'}},regionalDex};
}
function member(id='M1',extra={}) {return {id,species:'A',form:0,level:5,exp:125,hp:0,status:'',statusCount:0,moves:[{id:'tackle',pp:7,maxpp:35,ppUps:0}],item:'',ability:'Known',nature:'hardy',gender:'N',friendship:256,abilityIndex:null,effectiveAbilityIndex:null,readyToEvolve:true,...extra};}
function legacy6(E,C=content(E)) {
  const game=E.state.newGame({party:[member()],bag:{potion:17,pokeball:3},money:765432,content:C});
  game.schema=6;game.dex={seen:['A'],owned:['B']};
  game.appliedBattles=JSON.parse('{"__proto__":{"hash":"'+'a'.repeat(64)+'"},"constructor":{"hash":"'+'b'.repeat(64)+'"}}');
  game.claims=JSON.parse('{"constructor":{"kind":"grant"}}');
  game.steps=123;game.stats.wild_battles_won=17;
  for(const m of game.party){delete m.evolutionReadiness;delete m.cannotTrade;}
  return game;
}
function version(E,schema,C=content(E)) {
  const game=legacy6(E,C);
  game.schema=schema;
  if(schema<6){game.bag=E.inventory.aggregateBag(game.inventory);delete game.inventory;delete game.badges;}
  if(schema<5){game.boxes=game.storage.boxes.flatMap(b=>b.slots.filter(Boolean));delete game.storage;delete game.player;delete game.nextMemberOrdinal;}
  for(const m of [...game.party,...(game.boxes??[])]){
    if(schema<6){delete m.statNature;for(const move of m.moves)delete move.ppUps;}
    if(schema<5){m.ot=m.owner.name;for(const key of ['personalID','owner','ownerCompatibilityDefault','origin','abilityIndex','effectiveAbilityIndex','shiny','superShiny','firstMoves','markings','ribbons','cannotStore','cannotRelease','isEgg','mail','readyToEvolve'])delete m[key];}
    if(schema<4)delete m.form;
  }
  if(schema<4){delete game.stats;delete game.steps;}
  if(schema<3)delete game.claims;
  return game;
}
function transition(from,to,regionMap=[{from:0,to:1},{from:1,to:0},{from:-1,to:-1}]) {return {source:'checked-fixture',from:from.layoutIdentity,to:to.layoutIdentity,oldLayout:{national:clone(from.national),regions:from.regions.map(({id,species})=>({id,species:clone(species)}))},regionMap};}
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
module.exports={clone,identity,content,member,legacy6,version,transition,freeze};
