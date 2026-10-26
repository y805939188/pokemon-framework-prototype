/** Field item planning only. No RNG, host callbacks, mutation of input, evolution or machine teaching. */
import {clone} from './value.ts';
import {catalogOf,consumesItem,itemOf} from './item-catalog.ts';
import {itemQuantity,positiveQuantity,removeItems,safeAdd} from './inventory.ts';
import {resolveConfig} from './config.ts';
import {computeStats,levelForExp,maxExp,minExp,NATURES} from './growth.ts';
import {computedNature,baseMovePp,totalPp} from './member-metadata.ts';
import {speciesDataOf} from './species-key.ts';
import {resolveAbility} from './member-identity.ts';
import {healMember} from './heal.ts';
import {fieldEffectProblem} from './item-families.ts';
import {planFriendshipChange} from './friendship.ts';
import {planLearningQueue,levelLearningIntents} from './learning.ts';
import type {Content,Member,MoveSlot,StatKey} from './types.ts';
import type {GameState} from './state.ts';
export interface ItemWorldContext {mapId?:number;shadowIds?:string[];hyperIds?:string[];hmMoves?:string[]}
export type LearnAnswer={kind:'replace';slot:number}|{kind:'decline';giveUp?:boolean};
export interface ItemAnswers {confirmed?:boolean;cancelled?:boolean;moveIndex?:number;learning?:LearnAnswer[]}
export interface ItemIntent {itemId:string;quantity:number;memberId?:string}
export interface ItemPending {kind:'confirm'|'move'|'learn'|'give-up';answerIndex?:number;move?:{id:string;name:string;pp:number};moves?:MoveSlot[];reason?:string}
export interface ItemResult {itemId:string;quantity:number;memberId?:string;learned:string[];skipped:string[];actualHp:number;expGained?:number;oldLevel?:number;newLevel?:number;abilityChange?:{candidate:string;requestedIndex:number;resolved:string;effectiveIndex:number|null}}
export type ItemPlan={status:'pending';selection:ItemPending}|{status:'cancelled'}|{status:'ready';state:GameState;result:ItemResult};
export class ItemRefused extends Error {readonly reason:string;constructor(reason:string){super(reason);this.reason=reason;}}
const refuse=(reason:string):never=>{throw new ItemRefused(reason);};
const stats=(m:Member,c:Content)=>{const s=speciesDataOf(c,m);if(!s)return refuse('unknown-species');return computeStats(s.base,m.ivs,m.evs,m.level,computedNature(m));};
const sum=(m:Member)=>Object.values(m.evs??{}).reduce((a,b)=>safeAdd(a,b),0);
const key=(raw:unknown):StatKey=>{if(typeof raw!=='string'||!['hp','atk','def','spa','spd','spe'].includes(raw))return refuse('invalid-effect-stat');return raw as StatKey;};
const integer=(raw:unknown):number=>{if(typeof raw!=='number'||!Number.isSafeInteger(raw)||raw<1)return refuse('invalid-effect-parameter');return raw;};
const moveIdentity=(name:string):string=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
export function changeFriendship(m:Member,method:string,c:Content,world:ItemWorldContext):void {
 const catalog=catalogOf(c),source={...m,item:itemOf(catalog,m.item)?.battleId??m.item,ball:m.ball?(itemOf(catalog,m.ball)?.battleId??m.ball):m.ball};
 const plan=planFriendshipChange(source,['vitamin','wing','evberry','powder','energyroot','revivalherb'].includes(method)?method:'',
  {mapId:world.mapId,AFFECTION_EFFECTS:resolveConfig(c.settings).AFFECTION_EFFECTS});
 if(plan.status==='refused')return refuse(plan.reason);
 m.friendship=plan.after;
}
function recalcHp(m:Member,oldMax:number,c:Content,rare=false):void {const sp=speciesDataOf(c,m)!;const next=stats(m,c).hp,delta=next-oldMax;m.hp=rare&&sp.base.hp===1?1:m.hp>0?Math.min(next,Math.max(1,m.hp+delta)):Math.max(0,delta);}
const supported=new Set(['hp','status','full-restore','revive','sacred-ash','rage-candy','pp','pp-up','vitamin','wing','ev-berry','mint','ability-capsule','ability-patch','rare-candy','exp-candy']);
export function itemReadiness(c:Content,id:string):boolean {const item=itemOf(catalogOf(c),id);return !!item?.effect&&supported.has(item.effect.family)&&['member','direct','field'].includes(item.fieldUse);}
function common(m:Member,world:ItemWorldContext,family:string):void {if(m.isEgg)return refuse('egg');if(world.hyperIds?.includes(m.id))return refuse('hyper-mode');if(world.shadowIds?.includes(m.id)&&['rare-candy','exp-candy','evolution'].includes(family))return refuse('shadow');}
function checkAnswers(answers:ItemAnswers):void {
 if(!answers||typeof answers!=='object'||Array.isArray(answers))return refuse('invalid-answers');
 for(const [key,value] of Object.entries(answers)){
  if(['confirmed','cancelled'].includes(key)){if(typeof value!=='boolean')return refuse('invalid-answers');}
  else if(key==='moveIndex'){if(!Number.isSafeInteger(value)||(value as number)<0)return refuse('invalid-answers');}
  else if(key==='learning'){
   if(!Array.isArray(value))return refuse('invalid-answers');
   for(const answer of value){
    if(!answer||typeof answer!=='object'||Array.isArray(answer))return refuse('invalid-answers');
    if(answer.kind==='replace'){if(Object.keys(answer).some(k=>!['kind','slot'].includes(k))||!Number.isSafeInteger(answer.slot)||answer.slot<0)return refuse('invalid-answers');}
    else if(answer.kind==='decline'){if(Object.keys(answer).some(k=>!['kind','giveUp'].includes(k))||answer.giveUp!==undefined&&typeof answer.giveUp!=='boolean')return refuse('invalid-answers');}
    else return refuse('invalid-answers');
   }
  }else return refuse('invalid-answers');
 }
}
export function itemUseLimit(game:GameState,c:Content,intent:ItemIntent,world:ItemWorldContext={}):number {
 const item=itemOf(catalogOf(c),intent.itemId);if(!item)return refuse('unknown-item');if(!itemReadiness(c,item.id))return refuse('not-ready');const owned=itemQuantity(game.inventory,item.id,catalogOf(c));if(!owned)return 0;
 if(fieldEffectProblem(item.effect!))return refuse('invalid-effect-parameter');
 const m=game.party.find(m=>m.id===intent.memberId),f=item.effect!.family,p=item.effect!.parameters,config=resolveConfig(c.settings);
 if(f==='sacred-ash')return 1;if(!m)return refuse('invalid-target');common(m,world,f);
 if(!config.USE_MULTIPLE_STAT_ITEMS_AT_ONCE)return 1;
 let limit=1;
 if(f==='vitamin'||f==='wing'){const k=key(p.stat),step=f==='wing'?1:10,cap=f==='vitamin'&&!config.NO_VITAMIN_EV_CAP?100:252;limit=Math.max(0,Math.ceil(Math.min(cap-(m.evs?.[k]??0),510-sum(m))/step));}
 if(f==='ev-berry'){const k=key(p.stat);let copies=0;const sample=clone(m);while((sample.friendship??70)<255){const before=sample.friendship;changeFriendship(sample,'evberry',c,world);if(before===sample.friendship)break;copies++;}limit=Math.max(Math.ceil((m.evs?.[k]??0)/10),copies);}
 if(f==='exp-candy'){const sp=speciesDataOf(c,m);if(!sp)return refuse('unknown-species');limit=Math.ceil((maxExp(sp.growth)-m.exp)/integer(p.exp));}
 return Math.min(owned,Math.max(1,limit));
}
/** Replays answers against a fresh plan. Pending output contains only presentation data, never authority. */
export function planItemUse(game:GameState,c:Content,intent:ItemIntent,answers:ItemAnswers={},world:ItemWorldContext={}):ItemPlan {
 checkAnswers(answers);
 const catalog=catalogOf(c),item=itemOf(catalog,intent.itemId);if(!item)return refuse('unknown-item');if(!itemReadiness(c,item.id))return refuse('not-ready');positiveQuantity(intent.quantity);
 const family=item.effect!.family,p=item.effect!.parameters,q=intent.quantity;if(family==='rare-candy'&&q!==1)return refuse('invalid-quantity');
 if(answers.cancelled||answers.confirmed===false)return {status:'cancelled'};
 if(itemQuantity(game.inventory,item.id,catalog)<q)return refuse('not-enough-items');if(q>itemUseLimit(game,c,intent,world))return refuse('quantity-exceeds-limit');
 const next=clone(game),learned:string[]=[],skipped:string[]=[];let actualHp=0;const details:Pick<ItemResult,'expGained'|'oldLevel'|'newLevel'|'abilityChange'>={};
 if(family==='sacred-ash'){
  let changed=false;next.party=next.party.map(m=>{if(m.isEgg||m.hp!==0)return m;changed=true;const healed=healMember(m,c);actualHp+=healed.hp;return healed;});if(!changed)return refuse('no-effect');
 }else{
  const m=next.party.find(m=>m.id===intent.memberId);if(!m)return refuse('invalid-target');common(m,world,family);const oldHp=m.hp,oldMax=stats(m,c).hp,config=resolveConfig(c.settings);
  if(['mint','ability-capsule','ability-patch'].includes(family)&&answers.confirmed!==true)return {status:'pending',selection:{kind:'confirm'}};
  let active=family;if(active==='rage-candy')active=config.RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS?'status':'hp';
  if(active==='hp'||active==='full-restore'){
   if(m.hp<=0||active==='hp'&&m.hp>=oldMax||active==='full-restore'&&m.hp>=oldMax&&!m.status)return refuse('no-effect');
   const amount=active==='full-restore'||p.full?oldMax:p.fraction?Math.floor(oldMax/integer(p.fraction)):family==='rage-candy'?20:integer(config.REBALANCED_HEALING_ITEM_AMOUNTS?p.amount:p.oldAmount??p.amount);m.hp=Math.min(oldMax,m.hp+amount);if(active==='hp'&&m.hp===oldHp)return refuse('no-effect');if(active==='full-restore'){m.status='';m.statusCount=0;}
  }else if(active==='status'){
   if(m.hp<=0||!m.status||p.status!==undefined&&m.status!==p.status)return refuse('no-effect');m.status='';m.statusCount=0;
  }else if(active==='revive'){
   if(m.hp!==0)return refuse('no-effect');m.hp=p.fraction?Math.max(1,Math.floor(oldMax/integer(p.fraction))):oldMax;m.status='';m.statusCount=0;
  }else if(active==='pp'||active==='pp-up'){
   const all=active==='pp'&&p.all===true;if(!all&&answers.moveIndex===undefined)return {status:'pending',selection:{kind:'move',moves:clone(m.moves)}};
   const index=answers.moveIndex;if(!all&&(!Number.isInteger(index)||index!<0||index!>=m.moves.length))return refuse('invalid-move');let changed=false;
   for(const [i,move]of m.moves.entries()){if(!all&&i!==index)continue;const base=baseMovePp(c,move.id);if(base===undefined)return refuse('unknown-move');if(active==='pp-up'){if(base<=1||(move.ppUps??0)>=3)return refuse('no-effect');move.ppUps=p.max?3:(move.ppUps??0)+1;move.maxpp=totalPp(base,move.ppUps);move.pp=Math.min(move.pp,move.maxpp);changed=true;}else if(move.maxpp>0&&move.pp<move.maxpp){move.pp=p.full?move.maxpp:Math.min(move.maxpp,move.pp+integer(p.amount));changed=true;}}
   if(!changed)return refuse('no-effect');
  }else if(active==='vitamin'||active==='wing'){
   const stat=key(p.stat),step=active==='wing'?1:10,cap=active==='vitamin'&&!config.NO_VITAMIN_EV_CAP?100:252;m.evs={hp:0,atk:0,def:0,spa:0,spd:0,spe:0,...m.evs};for(let i=0;i<q;i++){const add=Math.min(step,cap-m.evs[stat]!,510-sum(m));if(add<=0)return refuse('no-effect');const before=stats(m,c).hp;m.evs[stat]!+=add;if(stat==='hp')recalcHp(m,before,c);changeFriendship(m,active==='wing'?'wing':'vitamin',c,world);}
  }else if(active==='ev-berry'){
   const stat=key(p.stat);if((m.evs?.[stat]??0)===0&&(m.friendship??70)===255)return refuse('no-effect');m.evs={hp:0,atk:0,def:0,spa:0,spd:0,spe:0,...m.evs};m.evs[stat]=Math.max(0,m.evs[stat]!-10*q);if(stat==='hp')recalcHp(m,oldMax,c);for(let i=0;i<q;i++)changeFriendship(m,'evberry',c,world);
  }else if(active==='mint'){
   const nature=p.nature;if(typeof nature!=='string'||!Object.hasOwn(NATURES,nature))return refuse('invalid-nature');if(computedNature(m).toLowerCase()===nature)return refuse('no-effect');m.statNature=nature;
  }else if(active==='ability-capsule'||active==='ability-patch'){
   const sp=speciesDataOf(c,m)!;if((sp.ruleSpecies??m.species).toLowerCase()==='zygarde')return refuse('no-effect');const slot=m.abilityIndex;if(slot===null||slot===undefined)return refuse('unknown-ability-slot');if(slot>=2)return refuse('no-effect');const candidates=[...(sp.abilities??[]).map((ability,index)=>({ability,index})),...(sp.hiddenAbilities??[]).map((ability,index)=>({ability,index:index+2}))].filter(x=>x.ability);
   const requested=active==='ability-capsule'?1-slot:2,target=candidates.filter(x=>x.index===requested).at(-1);if(!target||active==='ability-capsule'&&![0,1].every(i=>candidates.some(x=>x.index===i)))return refuse('no-effect');Object.assign(m,resolveAbility(m.personalID!,sp,requested));details.abilityChange={candidate:target.ability!,requestedIndex:requested,resolved:m.ability!,effectiveIndex:m.effectiveAbilityIndex??null};
  }else if(active==='rare-candy'||active==='exp-candy'){
   if(m.level>=100)return refuse(active==='rare-candy'?'evolution-not-ready':'max-level');const sp=speciesDataOf(c,m)!,oldLevel=m.level,oldExp=m.exp;const rawGain=active==='exp-candy'?integer(p.exp)*q:0;if(!Number.isSafeInteger(rawGain))return refuse('integer-overflow');const exp=active==='rare-candy'?minExp(sp.growth,m.level+1):Math.min(maxExp(sp.growth),safeAdd(m.exp,rawGain));if(!Number.isSafeInteger(exp))return refuse('integer-overflow');if(exp===m.exp)return refuse('no-effect');
   for(let i=0;i<q;i++)changeFriendship(m,'vitamin',c,world);m.exp=exp;m.level=levelForExp(sp.growth,exp);recalcHp(m,oldMax,c,active==='rare-candy');
   details.expGained=exp-oldExp;details.oldLevel=oldLevel;details.newLevel=m.level;
   const protectedMoves=new Set([...(world.hmMoves??[]),...Object.values(catalog).filter(x=>x.fieldUse==='hm').map(x=>x.move!)].map(moveIdentity));
   const intents=levelLearningIntents(oldLevel,m.level,Object.entries(sp.learnset).flatMap(([level,refs])=>refs.map(id=>({level:Number(level),id}))));
   if(intents.status==='refused')return refuse(intents.reason);
   const moves=intents.moves.map(entry=>{const move=Object.values(c.moves??{}).find(x=>x.name===entry.id||x.id===moveIdentity(entry.id));if(!move)return refuse('unknown-move');return move;});
   const learning=planLearningQueue(m,moves,{kind:'level'},{shadow:false,hmMoves:[...protectedMoves],keepMachinePp:config.TAUGHT_MACHINES_KEEP_OLD_PP},answers.learning);
   if(learning.status==='refused')return refuse(learning.reason==='unexpected-answer'?'unexpected-learning-answer':learning.reason==='invalid-answer'?'invalid-answers':learning.reason);
   if(learning.status==='pending')return {status:'pending',selection:{kind:learning.selection.kind,answerIndex:learning.selection.answerIndex,move:{...learning.selection.move,name:learning.selection.move.name??learning.selection.move.id},moves:learning.selection.moves,...(learning.selection.reason?{reason:learning.selection.reason}:{})}};
   m.moves=learning.patch.moves;
   for(const outcome of learning.outcomes){if(outcome.outcome==='learned')learned.push(outcome.moveId);else if(outcome.outcome==='gave-up')skipped.push(outcome.moveId);}

  }else return refuse('not-ready');
  if(typeof p.friendship==='string')changeFriendship(m,p.friendship,c,world);actualHp=m.hp-oldHp;
 }
 if(consumesItem(item))next.inventory=removeItems(next.inventory,item.id,q,catalog);
 return {status:'ready',state:next,result:{itemId:item.id,quantity:q,...(intent.memberId?{memberId:intent.memberId}:{}),learned,skipped,actualHp,...details}};
}
