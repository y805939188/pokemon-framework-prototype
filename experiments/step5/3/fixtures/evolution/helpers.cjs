'use strict';
// All expectations in this directory derive from the approved formal specifications, not Ruby observations.
const {register} = require('node:module');
const {pathToFileURL} = require('node:url');
const {resolve} = require('node:path');
register('data:text/javascript,'+encodeURIComponent(`import {readFile} from 'node:fs/promises'; import {stripTypeScriptTypes} from 'node:module'; export async function load(url,context,next){if(url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(await readFile(new URL(url),'utf8'),{sourceUrl:url}),shortCircuit:true};return next(url,context);}`),pathToFileURL(__filename));
exports.rules = import(pathToFileURL(resolve(__dirname,'../../../../../src/framework/rules/evolution.ts')));
exports.success = import(pathToFileURL(resolve(__dirname,'../../../../../src/framework/rules/evolution-success.ts')));
exports.data = import(pathToFileURL(resolve(__dirname,'../../../../../src/framework/rules/evolution-data.ts')));
exports.growth = import(pathToFileURL(resolve(__dirname,'../../../../../src/framework/rules/growth.ts')));
const value = exports.value = value => ({status:'value',value});
exports.species = (extra={}) => ({base:{hp:60,atk:60,def:60,spa:60,spd:60,spe:60},growth:'medium',baseExp:60,evYield:{},catchRate:45,learnset:{},abilities:['Run Away','Adaptability'],hiddenAbilities:['Anticipation'],gender:127,types:['Dark'],...extra});
exports.content = (entries=[],extra={}) => ({species:{A:exports.species({evolutions:entries}),B:exports.species(),C:exports.species(),Extra:exports.species({base:{hp:1,atk:90,def:45,spa:30,spd:30,spe:40},abilities:['Wonder Guard'],gender:'N'})},abilities:{runaway:{id:'runaway',name:'Run Away'},adaptability:{id:'adaptability',name:'Adaptability'},anticipation:{id:'anticipation',name:'Anticipation'},trusted:{id:'trusted',name:'Trusted'}},...extra});
exports.member = (extra={}) => ({id:'M1',species:'A',form:0,nickname:'Buddy',level:30,exp:27000,hp:40,status:'par',statusCount:0,moves:[{id:'bubble',pp:7,maxpp:30,ppUps:0}],item:'waterstone',ability:'Run Away',nature:'modest',statNature:'hardy',gender:'M',personalID:10000*65536,abilityIndex:0,effectiveAbilityIndex:0,owner:{id:42,name:'Old OT',gender:1,language:2},origin:{method:1,map:7,text:'gift',level:5,receivedAt:123,hatchedMap:0,hatchedAt:null,compatibilityDefault:false},friendship:220,ivs:{hp:31,atk:31},evs:{hp:4,def:4},firstMoves:['bubble','growl','bubble','tackle','splash'],markings:[1,2,3,4,0,0],ribbons:['ribbon'],ball:'luxuryball',shiny:true,superShiny:false,cannotStore:true,cannotRelease:false,cannotTrade:false,isEgg:false,mail:null,readyToEvolve:true,evolutionReadiness:'known',...extra});
exports.facts = extra => ({hour:value(12),weather:value('Rain'),cycling:value(true),surfing:value(true),diving:value(true),mapId:value(7),mapMetadata:value({region:1,flags:['MossRock'],darkMap:true}),beauty:value(170),moveTypes:value({bubble:'Water'}),criticalHits:value(3),damageTaken:value(49),...extra});
exports.entry = (method='Level',parameter=undefined,target='B',extra={}) => ({method,target,...(parameter===undefined?{}:{parameter}),...extra});
exports.input = (entries,extra={}) => ({member:exports.member(),content:exports.content(entries),trigger:{family:'level'},facts:exports.facts(),party:[exports.member()],...extra});
exports.freeze = function freeze(obj) { if(obj && typeof obj==='object'){Object.freeze(obj);for(const child of Object.values(obj))freeze(child);}return obj; };
const level = (parameter=30, changes={}) => ({parameter,...changes,miss:{member:{level:29}}});
const happy = (changes={}) => ({...changes,miss:{member:{friendship:219}}});
const held = (changes={}) => ({parameter:'waterstone',...changes,miss:{member:{item:''}}});
const item = changes => ({family:'item',parameter:'waterstone',...changes,miss:{trigger:{family:'item',item:'firestone'}}});
const trade = changes => ({family:'trade',...changes,miss:{member:{item:'everstone'}}});
// Explicit 64-method execution registration. Positive and refusal inputs are independent from the source table.
exports.methods = {
  Level:level(),LevelMale:level(),LevelFemale:level(30,{member:{gender:'F'}}),
  LevelDay:level(),LevelNight:level(30,{facts:{hour:value(20)}}),LevelMorning:level(30,{facts:{hour:value(5)}}),LevelAfternoon:level(30,{facts:{hour:value(14)}}),LevelEvening:level(30,{facts:{hour:value(17)}}),
  LevelNoWeather:level(30,{facts:{weather:value('None')}}),LevelSun:level(30,{facts:{weather:value('Sun')}}),LevelRain:level(),LevelSnow:level(30,{facts:{weather:value('Blizzard')}}),LevelSandstorm:level(30,{facts:{weather:value('Sandstorm')}}),
  LevelCycling:level(),LevelSurfing:level(),LevelDiving:level(),LevelDarkness:level(),LevelDarkInParty:level(),
  AttackGreater:level(30,{stats:{atk:80,def:40}}),AtkDefEqual:level(30,{member:{evs:{}}}),DefenseGreater:level(30,{stats:{atk:40,def:80}}),
  Silcoon:level(),Cascoon:level(30,{member:{personalID:10005*65536}}),Ninjask:level(),
  Happiness:happy(),HappinessMale:happy(),HappinessFemale:happy({member:{gender:'F'}}),HappinessDay:happy(),HappinessNight:happy({facts:{hour:value(20)}}),HappinessMove:happy({parameter:'bubble'}),HappinessMoveType:happy({parameter:'Water'}),HappinessHoldItem:happy({parameter:'waterstone'}),
  MaxHappiness:{member:{friendship:255},miss:{member:{friendship:256}}},Beauty:{parameter:170,miss:{facts:{beauty:value(169)}}},
  HoldItem:held(),HoldItemMale:held(),HoldItemFemale:held({member:{gender:'F'}}),DayHoldItem:held(),NightHoldItem:held({facts:{hour:value(20)}}),HoldItemHappiness:held(),
  HasMove:{parameter:'bubble',miss:{member:{moves:[]}}},HasMoveType:{parameter:'Water',miss:{member:{moves:[]}}},HasInParty:{parameter:'A',miss:{party:[]}},
  Location:{parameter:7,miss:{facts:{mapId:value(8)}}},LocationFlag:{parameter:'mossrock',miss:{facts:{mapMetadata:{status:'absent'}}}},Region:{parameter:1,miss:{facts:{mapMetadata:{status:'absent'}}}},
  Item:item(),ItemMale:item(),ItemFemale:item({member:{gender:'F'}}),ItemDay:item(),ItemNight:item({facts:{hour:value(20)}}),ItemHappiness:item(),
  Trade:trade(),TradeMale:trade(),TradeFemale:trade({member:{gender:'F'}}),TradeDay:trade(),TradeNight:trade({facts:{hour:value(20)}}),TradeItem:trade({parameter:'waterstone'}),TradeSpecies:trade({parameter:'A'}),
  BattleDealCriticalHit:{family:'battle',parameter:3,miss:{facts:{criticalHits:value(2)}}},EventAfterDamageTaken:{family:'event',parameter:2,miss:{member:{readyToEvolve:false}}},Event:{family:'event',parameter:2,miss:{trigger:{family:'event',event:1}}},
  Shedinja:{family:'level',noTarget:true},None:{family:'level',noTarget:true},
};
exports.methodInput = (method,negative=false) => {
  const c=exports.methods[method], input=exports.input([exports.entry(method,c.parameter)]);
  input.trigger=c.family==='item'?{family:'item',item:'waterstone'}:c.family==='trade'?{family:'trade',partner:exports.member({id:'M2',item:''})}:c.family==='event'?{family:'event',event:2}:{family:c.family??'level'};
  Object.assign(input.member,c.member);Object.assign(input.facts,c.facts);
  if(c.stats)Object.assign(input.content.species.A.base,c.stats);
  if(negative){const n=c.miss??{};Object.assign(input.member,n.member);Object.assign(input.facts,n.facts);if(n.trigger)input.trigger=n.trigger;if(n.party)input.party=n.party;}
  return input;
};
exports.secondaryMisses={
  LevelMale:{member:{gender:'F'}},LevelFemale:{member:{gender:'M'}},LevelDay:{facts:{hour:value(20)}},LevelNight:{facts:{hour:value(12)}},LevelMorning:{facts:{hour:value(10)}},LevelAfternoon:{facts:{hour:value(17)}},LevelEvening:{facts:{hour:value(20)}},
  LevelNoWeather:{facts:{weather:value('Rain')}},LevelSun:{facts:{weather:value('None')}},LevelRain:{facts:{weather:value('None')}},LevelSnow:{facts:{weather:value('None')}},LevelSandstorm:{facts:{weather:value('None')}},
  LevelCycling:{facts:{cycling:value(false)}},LevelSurfing:{facts:{surfing:value(false)}},LevelDiving:{facts:{diving:value(false)}},LevelDarkness:{facts:{mapMetadata:value({darkMap:false})}},LevelDarkInParty:{party:[]},
  AttackGreater:{stats:{atk:60,def:60},member:{evs:{}}},AtkDefEqual:{stats:{atk:40,def:80}},DefenseGreater:{stats:{atk:80,def:40}},Silcoon:{member:{personalID:10005*65536}},Cascoon:{member:{personalID:10000*65536}},
  HappinessMale:{member:{gender:'F'}},HappinessFemale:{member:{gender:'M'}},HappinessDay:{facts:{hour:value(20)}},HappinessNight:{facts:{hour:value(12)}},HappinessMove:{member:{moves:[]}},HappinessMoveType:{facts:{moveTypes:value({bubble:'Fire'})}},HappinessHoldItem:{member:{item:''}},
  HoldItemMale:{member:{gender:'F'}},HoldItemFemale:{member:{gender:'M'}},DayHoldItem:{facts:{hour:value(20)}},NightHoldItem:{facts:{hour:value(12)}},HoldItemHappiness:{member:{friendship:219}},
  ItemMale:{member:{gender:'F'}},ItemFemale:{member:{gender:'M'}},ItemDay:{facts:{hour:value(20)}},ItemNight:{facts:{hour:value(12)}},ItemHappiness:{member:{friendship:219}},
  TradeMale:{member:{gender:'F'}},TradeFemale:{member:{gender:'M'}},TradeDay:{facts:{hour:value(20)}},TradeNight:{facts:{hour:value(12)}},TradeItem:{member:{item:''}},TradeSpecies:{partnerItem:'everstone'},
};
