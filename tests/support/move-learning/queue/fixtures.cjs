'use strict';
const slot = (id, pp = 7, maxpp = 35, ppUps = 0) => ({id, pp, maxpp, ppUps});
const member = (extra = {}) => ({
  id:'P1', species:'magnemite', form:0, level:5, exp:125, hp:17, status:'', statusCount:0,
  moves:[slot('tackle')], firstMoves:['tackle'], item:'soothebell', ability:'sturdy', nature:'hardy',
  gender:'N', personalID:42, friendship:80, ball:'luxuryball',
  owner:{id:7,name:'Author',gender:2,language:0}, origin:{method:0,map:8,text:'',level:5,receivedAt:1,hatchedMap:0,hatchedAt:null,compatibilityDefault:false},
  abilityIndex:0, effectiveAbilityIndex:0, shiny:false, superShiny:false, readyToEvolve:false, evolutionReadiness:'known', cannotTrade:false,
  ...extra,
});
const full = (extra = {}) => member({moves:[slot('surf',2,24,1),slot('growl',11,64,3),slot('tackle',0,56,3),slot('thunderwave',19,20,0)],...extra});
const move = (id = 'chargebeam', pp = 10) => ({id,pp,name:id});
const options = (extra = {}) => ({shadow:false,hmMoves:['surf'],keepMachinePp:false,compatibility:'compatible',...extra});
const machine = (entry = 'bag', kind = 'tr', extra = {}) => ({kind:'machine',entry,machine:kind,itemId:'TM57',consumable:true,...extra});
const freeze = value => { if(value && typeof value === 'object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value; };
module.exports={slot,member,full,move,options,machine,freeze};
