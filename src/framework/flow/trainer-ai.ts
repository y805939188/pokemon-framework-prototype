/** Session-owned trainer resources, one-decision entitlement and rollback state. No engine objects cross here. */
import type { BattleDriver, DriverCheckpoint } from '../battle/driver';
import { bindTrainerSource, captureTrainerRequest, trainerCandidate, submitTrainerCandidate, rebindTrainerSource } from '../battle/trainer-ai-source';
import type { TrainerCapture, TrainerRequestTicket } from '../battle/trainer-ai-source';
import type { AssembledTrainerCatalog } from '../battle/trainer-ai-catalog';
import { createTrainerAiPolicy } from '../rules/trainer-ai';
import type { DecisionPlan, TrainerAiPolicy, TrainerAiSnapshot, TrainerResource } from '../rules/trainer-ai';
import { deriveTrainerRandom, trainerRandomN } from '../rules/trainer-ai-random';
import type { TrainerRandomState } from '../rules/trainer-ai-random';
import type { Content, TrainerBattleProjection } from '../rules/types';
import { semanticFingerprint } from '../rules/semantic';
import { validatedContentIdentity } from './content-runtime';
import type { BattleEvent } from '../battle/protocol';

export interface TrainerAiConfiguration {
  projection:TrainerBattleProjection; generation:number; contentIdentity:string;
  currentContent:()=>Content; isCurrent:()=>boolean;
}
interface Reservation { key:string; itemId:string; battleId:string; target:string; state:'reserved'|'consumed'|'refunded' }
interface Cache { capture:TrainerCapture; plan:DecisionPlan|null; attempted:string[]; submitted:boolean }
interface AiState { random:TrainerRandomState; resources:TrainerResource[]; resourceRevision:number; ledger:Reservation[] }
interface Channel {
  owner:object; driver:BattleDriver; lineage:object; catalog:AssembledTrainerCatalog; policy:TrainerAiPolicy;
  config:TrainerAiConfiguration; contentFingerprint:string; profile:TrainerAiSnapshot['profile']; state:AiState;
  cache:Cache|null; busy:boolean; retired:string|null;
}
const CHANNELS=new WeakMap<object,Channel>();
const CHECKPOINTS=new WeakMap<DriverCheckpoint,{session:object;lineage:object;state:AiState;cache:{snapshot:TrainerAiSnapshot;plan:DecisionPlan|null;attempted:string[];submitted:boolean}|null}>();
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
function fingerprint(content:Content):string{return semanticFingerprint(clone(content));}
export function bindTrainerAi(session:object,driver:BattleDriver,content:Content,config:TrainerAiConfiguration):void {
  if(CHANNELS.has(session))throw new Error('trainer-ai-already-bound');
  const owner={},source=bindTrainerSource(driver,owner,content,config.contentIdentity);
  const resources=config.projection.ai.items.map((r,i)=>({resourceKey:'trainer-resource:'+i,itemId:r.item,count:r.count}));
  CHANNELS.set(session,{owner,driver,lineage:source.lineage,catalog:source.catalog,policy:createTrainerAiPolicy(source.catalog.catalog),config:{...config,projection:clone(config.projection)},profile:clone({skillLevel:config.projection.ai.skillLevel,flags:config.projection.ai.flags}),contentFingerprint:fingerprint(content),state:{random:deriveTrainerRandom(source.seed),resources,resourceRevision:0,ledger:[]},cache:null,busy:false,retired:null});
}
function current(c:Channel,driver:BattleDriver):void {
  if(c.retired)throw new Error(c.retired);
  if(driver!==c.driver)throw new Error('trainer-ai-source-mismatch');
  if(!c.config.isCurrent()){c.retired='trainer-ai-stale-generation';throw new Error(c.retired);}
  const content=c.config.currentContent();
  if(validatedContentIdentity(content)!==c.config.contentIdentity||fingerprint(content)!==c.contentFingerprint){c.retired='trainer-ai-content-source-retired';throw new Error(c.retired);}
  if(!c.config.isCurrent()){c.retired='trainer-ai-stale-generation';throw new Error(c.retired);}
}
function channel(session:object,driver:BattleDriver):Channel {const c=CHANNELS.get(session);if(!c)throw new Error('trainer-ai-unknown-owner');current(c,driver);return c;}
function capture(c:Channel):Cache {
  const value=captureTrainerRequest(c.driver,c.owner,c.config.generation,c.profile,c.state.resources,c.state.resourceRevision);
  if(c.cache?.capture.ticket===value.ticket)return c.cache;
  return c.cache={capture:value,plan:null,attempted:[],submitted:false};
}
function decide(c:Channel,cache:Cache):DecisionPlan {
  if(cache.plan)return clone(cache.plan);
  cache.plan=c.policy.decide(cache.capture.snapshot,n=>trainerRandomN(c.state.random,n));
  return clone(cache.plan);
}
function refund(c:Channel,entry:Reservation):void {
  if(entry.state!=='reserved')return;
  const resource=c.state.resources.find(r=>r.resourceKey===entry.key);if(!resource)throw new Error('trainer-ai-refund-resource-missing');
  c.state.resources=c.state.resources.map(r=>r.resourceKey===entry.key?{...r,count:r.count+1}:r);entry.state='refunded';c.state.resourceRevision++;
}
/** The busy gate and all actual source bindings exist before any supplied content/host callback can reenter. */
export async function runTrainerAi(session:object,driver:BattleDriver):Promise<boolean> {
  const c=CHANNELS.get(session);if(!c)return false;
  if(c.busy)throw new Error('trainer-ai-operation-in-progress');c.busy=true;
  try{
    current(c,driver);let cache=capture(c),rebuilds=0;
    for(;;){
      const plan=decide(c,cache);if(plan.kind==='error')throw new Error('trainer-ai-policy-'+plan.reason);if(plan.kind==='none')return true;
      if(cache.submitted)throw new Error('trainer-ai-request-already-submitted');
      const order=plan.kind==='choose'?plan.retryOrder:plan.candidateIds;
      try{
        for(const candidateId of order){
          if(cache.attempted.includes(candidateId))continue;
          current(c,driver);
          const action=trainerCandidate(driver,c.owner,cache.capture.ticket,candidateId,c.state.resourceRevision);
          cache.attempted.push(candidateId);
          let reservation:Reservation|undefined;
          if(action.kind==='item'){
            const resource=c.state.resources.find(r=>r.resourceKey===action.resourceKey);
            if(!resource||resource.count<1)throw new Error('trainer-ai-item-resource-unavailable');
            reservation={key:resource.resourceKey,itemId:resource.itemId,battleId:action.battleId,target:action.target,state:'reserved'};
            c.state.resources=c.state.resources.map(r=>r===resource?{...r,count:r.count-1}:r);c.state.ledger.push(reservation);
            // The ticket still has the pre-reservation revision until the action is registered. No callback is run here.
          }
          const result=await submitTrainerCandidate(driver,c.owner,cache.capture.ticket,candidateId,c.state.resourceRevision);
          current(c,driver);
          if(result==='accepted'){cache.submitted=true;if(reservation)c.state.resourceRevision++;return true;}
          if(reservation){refund(c,reservation);throw new Error('trainer-ai-item-registration-refused');}
        }
        throw new Error('trainer-ai-legal-candidates-exhausted');
      }catch(error){
        const reason=error instanceof Error?error.message:'';
        if((reason==='trainer-ai-request-revision-changed'||reason==='trainer-ai-resource-revision-changed')&&rebuilds++===0){
          current(c,driver);const next=capture(c);
          if(next.capture.snapshot.binding.requestKey!==cache.capture.snapshot.binding.requestKey)throw error;
          cache=next;continue;
        }
        throw error;
      }
    }
  }finally{c.busy=false;}
}
export function trainerAiEvent(session:object,event:BattleEvent):void {
  const c=CHANNELS.get(session);if(!c||event.type!=='rpg')return;
  const [kind,side,item,target,result]=event.args;if(kind!=='item'||side!=='p2')return;
  const entry=c.state.ledger.find(e=>e.state==='reserved'&&e.battleId===item&&e.target===target);if(!entry)return;
  if(result==='ok'){entry.state='consumed';}else if(result==='noeffect'||result==='invalid'){refund(c,entry);}else{c.retired='trainer-ai-unknown-item-outcome';throw new Error(c.retired);}
}
export function checkpointTrainerAi(session:object,driver:BattleDriver,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;current(c,driver);capture(c);
  CHECKPOINTS.set(token,{session,lineage:c.lineage,state:clone(c.state),cache:c.cache?clone({snapshot:c.cache.capture.snapshot,plan:c.cache.plan,attempted:c.cache.attempted,submitted:c.cache.submitted}):null});
}
export function restoreTrainerAi(session:object,driver:BattleDriver,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;
  const cp=CHECKPOINTS.get(token);if(!cp||cp.session!==session||cp.lineage!==c.lineage)throw new Error('trainer-ai-restore-source-mismatch');
  // A source/generation retirement cannot be undone by rolling back numeric state.
  if(c.retired)throw new Error(c.retired);
  rebindTrainerSource(driver,c.owner,c.lineage,c.catalog);c.driver=driver;current(c,driver);
  c.state=clone(cp.state);c.cache=null;
  if(cp.cache){const value=capture(c);if(!cp.cache.submitted && semanticFingerprint(value.capture.snapshot)!==semanticFingerprint(cp.cache.snapshot))throw new Error('trainer-ai-restore-request-mismatch');value.plan=clone(cp.cache.plan);value.attempted=[...cp.cache.attempted];value.submitted=cp.cache.submitted;}
}
/** Detached diagnostics through the explicit testing entry; contains no owner, source or executable ticket. */
export function trainerAiDiagnostics(session:object):unknown {
  const c=CHANNELS.get(session);return c?clone({catalogIdentity:c.catalog.identity,authorIdentity:c.catalog.authorIdentity,moveCount:Object.keys(c.catalog.catalog.moves).length,typeCount:Object.keys(c.catalog.catalog.types).length,state:c.state,cache:c.cache?{snapshot:c.cache.capture.snapshot,plan:c.cache.plan,attempted:c.cache.attempted,submitted:c.cache.submitted}:null,retired:c.retired}):null;
}
/** Explicit diagnostic operations for capability tests. Production only calls runTrainerAi. */
export function inspectTrainerAiRequest(session:object,driver:BattleDriver):{ticket:TrainerRequestTicket;snapshot:TrainerAiSnapshot;plan:DecisionPlan} {
  const c=CHANNELS.get(session);if(!c||c.busy)throw new Error('trainer-ai-operation-in-progress');c.busy=true;
  try{current(c,driver);const cache=capture(c);return {ticket:cache.capture.ticket,snapshot:clone(cache.capture.snapshot),plan:decide(c,cache)};}finally{c.busy=false;}
}
export function captureTrainerAiRequest(session:object,driver:BattleDriver):TrainerCapture {
  const c=CHANNELS.get(session);if(!c||c.busy)throw new Error('trainer-ai-operation-in-progress');c.busy=true;
  try{current(c,driver);const value=capture(c).capture;return {ticket:value.ticket,snapshot:clone(value.snapshot)};}finally{c.busy=false;}
}
export function validateTrainerAiTicket(session:object,driver:BattleDriver,ticket:TrainerRequestTicket,candidateId:string):void {
  const c=CHANNELS.get(session);if(!c||c.busy)throw new Error('trainer-ai-operation-in-progress');c.busy=true;
  try{current(c,driver);trainerCandidate(driver,c.owner,ticket,candidateId,c.state.resourceRevision);}finally{c.busy=false;}
}
