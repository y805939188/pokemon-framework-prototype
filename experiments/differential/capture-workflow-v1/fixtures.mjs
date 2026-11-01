import {clone,hashJSON} from './safe.mjs';
import {CASES,PROFILE,PRODUCT} from './constants.mjs';
export const PLAYER={id:1234,name:'Synthetic',gender:2,language:2};
export function content(E){
 const species={
  Pidgey:{base:{hp:40,atk:45,def:40,spa:35,spd:35,spe:56},growth:'parabolic',baseExp:50,evYield:{spe:1},catchRate:255,learnset:{1:['Tackle']},abilities:['Keen Eye'],hiddenAbilities:[],gender:128,happiness:70,types:['Normal','Flying']},
  Caterpie:{base:{hp:45,atk:30,def:35,spa:20,spd:20,spe:45},growth:'medium',baseExp:39,evYield:{hp:1},catchRate:255,learnset:{1:['Tackle']},abilities:['Shield Dust'],hiddenAbilities:[],gender:128,happiness:70,types:['Bug']}
 };
 const c={species,moves:{Tackle:{id:'tackle',name:'Tackle',pp:35}},abilities:{keeneye:{id:'keeneye',name:'Keen Eye'},shielddust:{id:'shielddust',name:'Shield Dust'}},settings:{SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN:false},regionalDex:{national:['Pidgey','Caterpie'],regions:[],layoutIdentity:E.dexState.dexLayoutIdentity({national:['Pidgey','Caterpie'],regions:[]})}};
 const inputsHash=hashJSON(c),compiledSemantics=E.contentSchema.COMPILED_SCHEMA_VERSION,showdownSha='7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
 c.meta={kind:'fixture',id:'capture-complete-v1',compiledSemantics,inputsHash,showdownSha,contentIdentity:hashJSON({compiledSemantics,inputsHash,showdownSha})};return c;
}
export const definitions=Object.freeze(CASES.map((id,i)=>({id,operation:'capture.completeReception',internalBattle:id!=='C02',partySize:i>=3?6:1,occupiedBoxes:id==='C09'?1200:id==='C04'?30:0,currentBox:0,queueSize:id==='C08'?2:1,mode:id==='C07'?2:['C04','C08','C09'].includes(id)?1:0,naming:0,depositHeal:['C04','C05','C06','C07'].includes(id),alreadyOwned:id==='C03',repeat:id==='C08',decisions:id==='C03'?[{kind:'set-name',member:'Q01',value:'Sprout'}]:id==='C08'?[{kind:'keep-name',member:'Q01'},{kind:'keep-name',member:'Q02'}]:[{kind:'keep-name',member:'Q01'},...(['C05','C07'].includes(id)?[{kind:'BACK',member:'Q01'}]:[]),...(['C06','C07'].includes(id)?[{kind:'replace',member:'Q01',target:'P02'}]:[])]})));
export function makeInitial(E,def){
 const c=content(E);let fixtureDraws=0;
 const member=(id,species='Pidgey')=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id,species,form:0,level:5,owner:PLAYER,shiny:false,superShiny:false,context:{map:1,receivedAt:0,playerId:PLAYER.id}},c,n=>{fixtureDraws++;return n===65536?1:0;}),c);
 const party=Array.from({length:def.partySize},(_,i)=>member(`P${String(i+1).padStart(2,'0')}`));
 const state=E.state.newGame({party,money:123,player:PLAYER,content:c});state.dex.hasDex=true;state.storage.currentBox=def.currentBox;
 for(let i=0;i<def.occupiedBoxes;i++){const m=member(`B${String(i+1).padStart(4,'0')}`);state.storage.boxes[Math.floor(i/30)].slots[i%30]=m;}
 if(def.depositHeal&&state.party.length===6){state.party[1].hp=2;state.party[1].status='psn';state.party[1].statusCount=0;state.party[1].moves[0].pp=5;}
 for(let i=0;i<40;i++)state.storage.boxes[i].name=`Box${String(i+1).padStart(2,'0')}`;
 if(def.alreadyOwned){state.dex.seen=['Caterpie'];state.dex.owned=['Caterpie'];state.dex.capturedCounts={Caterpie:1};state.dex.seenForms={Caterpie:[{gender:0,shiny:false,form:0}]};}
 const upstream=Array.from({length:def.queueSize},(_,i)=>{
  const m=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:`Q0${i+1}`,species:'Caterpie',form:0,level:5,owner:PLAYER,context:{map:1,receivedAt:0,playerId:PLAYER.id}},c,()=>{fixtureDraws++;return 0;}),c);
  m.hp=3;m.status='psn';m.statusCount=0;m.moves=m.moves.map(x=>({...x,pp:7}));return m;
 });
 return {content:c,state,fixtureDraws,upstream,setupRandom:Array(def.queueSize*8).fill(0),postSuccessInjected:true};
}
export function freezeInputs(E){return {schema:'capture-workflow-inputs-v1',profile:PROFILE,product:PRODUCT,syntheticOnly:true,cases:definitions.map(d=>({definition:clone(d),...makeInitial(E,d)}))};}
