'use strict';
// Test-only data mapping into the real pure functions. No scoring or selection algorithm.
const ai=require(process.env.PF_TRAINER_AI_TEST_MODULE || '../../../../src/framework/rules/trainer-ai.ts');
const types=['normal','electric','water','fire','flying','ground','rock','poison','steel','grass','ghost'];
function catalog(){
 const chart=Object.fromEntries(types.map(a=>[a,Object.fromEntries(types.map(d=>[d,{numerator:1,denominator:1}]))]));
 for(const[a,d,n,k]of [['electric','water',2,1],['electric','flying',2,1],['electric','ground',0,1],['normal','ghost',0,1],['fire','water',1,2],['rock','flying',2,1],['water','fire',2,1],['fire','grass',2,1]])chart[a][d]={numerator:n,denominator:k};
 const move=(moveType,basePower,family='basic-damage')=>({family,moveType,basePower,accuracy:{kind:'percent',value:100}});
 return {gen:8,types:chart,moves:{tackle:move('normal',40),thunderbolt:move('electric',90),ember:move('fire',40),struggle:move('normal',50),growl:move('normal',0,'known-useless'),metronome:move('normal',0,'unmodeled')},
  items:{potion:{family:'heal-hp',estimateHp:20,cures:[],curesConfusion:false},hyperpotion:{family:'heal-hp',estimateHp:120,cures:[],curesConfusion:false},fullrestore:{family:'full-restore',estimateHp:999,cures:'all',curesConfusion:true},antidote:{family:'cure-status',estimateHp:0,cures:['psn','tox'],curesConfusion:false},awakening:{family:'cure-status',estimateHp:0,cures:['slp'],curesConfusion:false},fullheal:{family:'cure-status',estimateHp:0,cures:'all',curesConfusion:true},sitrusberry:{family:'heal-hp',estimateHp:1,cures:[],curesConfusion:false},ether:{family:'unsupported',estimateHp:0,cures:[],curesConfusion:false}}};
}
function snapshot(){
 const c=catalog();
 return {schema:'trainer-ai-public-v1',gen:8,format:'gen8rpgcustomgame',binding:{requestKey:'req',requestRevision:'r1',generation:1,turn:1,ownResourceRevision:0},profile:{skillLevel:100,flags:[]},
 own:{side:'p2',party:[{memberId:'npc1',partyOrder:0,active:true,hp:80,maxhp:100,status:'none',confusionTurns:0,types:['normal'],knownAbility:'',knownHeldItem:'',moves:[{slot:1,moveId:'tackle',pp:35,maxpp:35},{slot:2,moveId:'thunderbolt',pp:15,maxpp:15}]},{memberId:'npc2',partyOrder:1,active:false,hp:80,maxhp:100,status:'none',confusionTurns:0,types:['water'],knownAbility:'',knownHeldItem:'',moves:[{slot:1,moveId:'tackle',pp:35,maxpp:35}]}],resources:[]},
 opponent:{active:[{appearanceKey:'shown1',displayedSpecies:'PublicOpponent',displayedForm:0,level:50,shownTypes:['water'],hpBar:{parts:80,scale:100},status:'none',stages:{atk:0,def:0,spa:0,spd:0,spe:0,accuracy:0,evasion:0},revealedMoves:[],lastPublicMove:null,fainted:false,revealedAbility:null,revealedItem:null}]},field:{weather:'',terrain:'',publicConditions:[]},
 request:{kind:'move',actorId:'npc1',legalMoves:[{candidateId:'M1',slot:1,moveId:'tackle',mode:'normal',target:{kind:'opponent',appearanceKey:'shown1'},metadata:{...structuredClone(c.moves.tackle),publicTypeMultiplier:{numerator:1,denominator:1},publicFailure:'none',omittedModifiers:[]}},{candidateId:'M2',slot:2,moveId:'thunderbolt',mode:'normal',target:{kind:'opponent',appearanceKey:'shown1'},metadata:{...structuredClone(c.moves.thunderbolt),publicTypeMultiplier:{numerator:2,denominator:1},publicFailure:'none',omittedModifiers:[]}}],legalItems:[]}};
}
function addItem(s,itemId,candidateId=itemId){
 const data=catalog().items[itemId];const resourceKey='resource-'+candidateId;
 s.own.resources.push({resourceKey,itemId,count:1});
 s.request.legalItems.push({candidateId,resourceKey,itemId,targetMemberId:s.request.actorId,...structuredClone(data)});
}
const policy=ai.createTrainerAiPolicy(catalog());
function run(entry,input,random){
 switch(entry){
 case 'select-scored':return ai.selectTrainerMove(input.skill,input.candidates.map(c=>({candidateId:c.id,score:c.score,requestOrder:c.requestOrder})),random);
 case 'basic-score':return ai.scoreTrainerMove({basePower:input.basePower??0,stab:input.stab??false,publicTypeMultiplier:{numerator:input.publicTypeMultiplier?.[0]??1,denominator:input.publicTypeMultiplier?.[1]??1},accuracy:input.accuracy??100,family:input.family,scoreMoves:input.ScoreMoves,predictFailure:input.PredictMoveFailure,publicFailure:input.publicFailure??'none'});
 case 'profile-flags':return ai.effectiveTrainerAiFlags(input.skill,input.flags);
 case 'switch-score':return ai.scoreTrainerSwitch({...input,candidateId:'candidate',partyOrder:0,ownMoveAdvantages:input.ownMoveAdvantages.map(e=>({...e,publicTypeMultiplier:{numerator:e.publicTypeMultiplier[0],denominator:e.publicTypeMultiplier[1]}})),publicLastMoveRisks:input.publicLastMoveRisks.map(e=>({...e,publicTypeMultiplier:{numerator:e.publicTypeMultiplier[0],denominator:e.publicTypeMultiplier[1]}}))});
 case 'force-switch':return ai.chooseTrainerSwitch(input.flags??[],input.candidates.map(c=>({candidateId:c.id,partyOrder:c.partyOrder,score:c.score})),input.lastOwnerPartyOrder??5);
 case 'trainer-item-preference':return ai.preferTrainerItem({hp:input.hp,maxhp:input.maxhp,status:input.status,confusionTurns:input.confusion,eligible:input.eligible.map(c=>({candidateId:c.id,resourceKey:c.id,itemId:c.itemId??c.id,targetMemberId:'self',family:c.family,estimateHp:c.estimate??0,cures:c.family==='full-restore'||c.scope==='all'?'all':c.family==='cure-status'?[input.status==='none'?'psn':input.status]:[],curesConfusion:c.family==='full-restore'})),unsupportedResources:input.unsupportedResources??[]},random);
 case 'request-routing':{
  const s=snapshot();if(input.kind==='wait'||input.kind==='finished')s.request={kind:input.kind};
  else {s.request.legalMoves=s.request.legalMoves.slice(0,input.normalMoves.length);if(input.engineConfirmedAutoStruggle)s.request.legalMoves.push({candidateId:input.engineConfirmedAutoStruggle,slot:1,moveId:'struggle',mode:'engine-auto-struggle',target:{kind:'opponent',appearanceKey:'shown1'},metadata:{...catalog().moves.struggle,publicTypeMultiplier:{numerator:1,denominator:1},publicFailure:'none',omittedModifiers:[]}});}
  return policy.decide(s,random);
 }
 case 'request-validation':{const s=snapshot();s.request.legalMoves=[s.request.legalMoves[0]];s.own.party[0].moves[0].pp=input.legalMove.pp;return policy.decide(s,random);}
 default:throw Error('Unknown real SUT entry '+entry);
 }
}
module.exports={run,catalog,snapshot,addItem};
