/** Session-owned decisions, bounded inference history and separately restorable execution rights. */
import type { BattleDriver, DriverCheckpoint } from '../battle/driver';
import { bindTrainerSource, captureTrainerRequest, trainerCandidate, submitTrainerCandidate, rebindTrainerSource, trainerSourceFinished, trainerDecisionKey } from '../battle/trainer-ai-source';
import type { TrainerCapture, TrainerRequestTicket } from '../battle/trainer-ai-source';
import type { AssembledTrainerCatalog } from '../battle/trainer-ai-catalog';
import { validateTrainerAiIntent } from './trainer-ai-strategy';
import type { PinnedTrainerAiStrategy, BoundTrainerAiStrategy } from './trainer-ai-strategy';
import { createTrainerAiSnapshotValidator } from '../rules/trainer-ai';
import type { DecisionPlan, TrainerAiSnapshot, TrainerResource } from '../rules/trainer-ai';
import { deriveTrainerRandom, trainerRandomN } from '../rules/trainer-ai-random';
import type { TrainerRandomState } from '../rules/trainer-ai-random';
import { freezeStrategyData } from '../rules/trainer-ai-strategy';
import type { TrainerAiTiming } from '../rules/trainer-ai-strategy';
export type { TrainerAiTiming } from '../rules/trainer-ai-strategy';
import type { Content, TrainerBattleProjection } from '../rules/types';
import { semanticFingerprint } from '../rules/semantic';
import { validatedContentIdentity } from './content-runtime';
import type { BattleEvent } from '../battle/protocol';

export interface TrainerAiConfiguration {
  strategy:PinnedTrainerAiStrategy; projection:TrainerBattleProjection; generation:number; contentIdentity:string;
  currentContent:()=>Content; isCurrent:()=>boolean; timing:TrainerAiTiming;
}
interface Reservation {key:string;itemId:string;battleId:string;target:string;state:'reserved'|'consumed'|'refunded'}
interface Cache {capture:TrainerCapture;plan:DecisionPlan|null;attempted:string[];submitted:boolean;key:string|null}
interface AiState {random:TrainerRandomState;resources:TrainerResource[];resourceRevision:number;ledger:Reservation[]}
interface DecisionRecord {
  key:string; snapshotHash:string; bindingHash:string; plan:DecisionPlan;
  before:TrainerRandomState; after:TrainerRandomState; fallbackReason:string|null;
}
interface Gate {cancelled:string|null}
interface Channel {
  owner:object;driver:BattleDriver;lineage:object;catalog:AssembledTrainerCatalog;policy:BoundTrainerAiStrategy;
  invoke:BoundTrainerAiStrategy['decide'];available:()=>boolean;bindingHash:string;
  validate:(snapshot:unknown)=>TrainerAiSnapshot;timing:TrainerAiTiming;
  config:TrainerAiConfiguration;contentFingerprint:string;profile:TrainerAiSnapshot['profile'];state:AiState;
  cache:Cache|null;gate:Gate|null;retired:string|null;epoch:number;pending:{cancel(reason:string):void}|null;
  journal:Map<string,DecisionRecord>;decided:Set<string>;lastAccepted:Map<string,string>;testFull:boolean;restoring:boolean;
}
interface AiCheckpoint {
  session:object;lineage:object;policy:BoundTrainerAiStrategy;bindingHash:string;terminal:boolean;state:AiState;
  cache:{snapshot:TrainerAiSnapshot;plan:DecisionPlan|null;attempted:string[];submitted:boolean;key:string|null;record:DecisionRecord|null}|null;
}
const CHANNELS=new WeakMap<object,Channel>(),CHECKPOINTS=new WeakMap<DriverCheckpoint,AiCheckpoint>();
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const fingerprint=(value:unknown):string=>semanticFingerprint(value);
const equal=(a:unknown,b:unknown):boolean=>fingerprint(a)===fingerprint(b);
function invalidate(c:Channel,reason:string):void {
  c.epoch++;
  if(c.gate)c.gate.cancelled=reason;
  c.pending?.cancel(reason);
}
export function retireTrainerAi(session:object):void {
  const c=CHANNELS.get(session);if(!c)return;
  c.retired=c.config.isCurrent()?'trainer-ai-owner-retired':'trainer-ai-stale-generation';invalidate(c,c.retired);
}
/** Cancellation closes pending random capabilities immediately; the Session still owns rollback/serialization. */
export function cancelTrainerAiDecision(session:object):boolean {
  const c=CHANNELS.get(session);if(!c?.gate)return false;invalidate(c,'trainer-ai-decision-cancelled');return true;
}
export function bindTrainerAi(session:object,driver:BattleDriver,content:Content,config:TrainerAiConfiguration):void {
  if(CHANNELS.has(session))throw new Error('trainer-ai-already-bound');
  const owner={},source=bindTrainerSource(driver,owner,content,config.contentIdentity);
  const policy=config.strategy.instantiate(source.catalog.catalog,source.catalog.identity),timing=config.timing;
  const resources=config.projection.ai.items.map((r,i)=>({resourceKey:'trainer-resource:'+i,itemId:r.item,count:r.count}));
  CHANNELS.set(session,{owner,driver,lineage:source.lineage,catalog:source.catalog,policy,invoke:policy.decide.bind(policy),available:policy.isAvailable?.bind(policy)??(()=>true),bindingHash:fingerprint(policy.binding),validate:createTrainerAiSnapshotValidator(source.catalog.catalog),timing:{now:timing.now.bind(timing),after:timing.after.bind(timing)},config:{...config,projection:clone(config.projection)},profile:clone({skillLevel:config.projection.ai.skillLevel,flags:config.projection.ai.flags}),contentFingerprint:fingerprint(clone(content)),state:{random:deriveTrainerRandom(source.seed),resources,resourceRevision:0,ledger:[]},cache:null,gate:null,retired:null,epoch:0,pending:null,journal:new Map(),decided:new Set(),lastAccepted:new Map(),testFull:false,restoring:false});
}
function current(c:Channel,driver:BattleDriver,retire=true):void {
  if(c.retired)throw new Error(c.retired);
  if(driver!==c.driver)throw new Error('trainer-ai-source-mismatch');
  const fail=(reason:string):never=>{if(retire){c.retired=reason;invalidate(c,reason);}throw new Error(reason);};
  if(!c.config.isCurrent())fail('trainer-ai-stale-generation');
  const content=c.config.currentContent();
  if(validatedContentIdentity(content)!==c.config.contentIdentity||fingerprint(clone(content))!==c.contentFingerprint)fail('trainer-ai-content-source-retired');
  if(!c.config.isCurrent())fail('trainer-ai-stale-generation');
  if(fingerprint(c.policy.binding)!==c.bindingHash)throw new Error('trainer-ai-strategy-binding-changed');
  if(c.available()!==true)throw new Error('trainer-ai-strategy-unavailable');
  if(c.retired)throw new Error(c.retired);
  if(!c.config.isCurrent())fail('trainer-ai-stale-generation');
}
function owned(c:Channel,gate:Gate):void {
  if(c.gate!==gate||gate.cancelled)throw new Error(gate.cancelled??'trainer-ai-operation-retired');
}
function begin(c:Channel):Gate {if(c.gate||c.restoring)throw new Error('trainer-ai-operation-in-progress');return c.gate={cancelled:null};}
function end(c:Channel,gate:Gate):void {if(c.gate===gate)c.gate=null;}
function capture(c:Channel):Cache {
  const value=captureTrainerRequest(c.driver,c.owner,c.config.generation,c.profile,c.state.resources,c.state.resourceRevision);
  if(c.cache?.capture.ticket===value.ticket)return c.cache;
  return c.cache={capture:value,plan:null,attempted:[],submitted:false,key:null};
}
function key(c:Channel,cache:Cache):string {
  const value=trainerDecisionKey(c.driver,c.owner,cache.capture.ticket,c.state.resourceRevision);
  if(cache.key!==null&&value!==cache.key)throw new Error('trainer-ai-request-revision-changed');
  cache.key=value;return value;
}
function fallback(snapshot:TrainerAiSnapshot):DecisionPlan {
  const r=snapshot.request;
  const first=r.kind==='move'?r.legalMoves[0]?.candidateId:r.kind==='force-switch'?r.legalSwitches[0]?.candidateId:undefined;
  if(!first)throw new Error('trainer-ai-no-legal-fallback');
  return {kind:'fallback',binding:clone(snapshot.binding),candidateIds:[first],reason:'no-normal-move',diagnostics:['first-legal-fallback']};
}
/** Returns synchronously for rule policies; only the scheduling layer waits for native Promise capabilities. */
function decide(c:Channel,cache:Cache,gate:Gate,allowFallback:boolean):DecisionPlan|Promise<DecisionPlan> {
  owned(c,gate);current(c,c.driver);
  if(cache.plan)return clone(cache.plan);
  const input=c.validate(cache.capture.snapshot); // collector faults are outside the strategy-fault boundary
  if(input.request.kind==='wait'||input.request.kind==='finished')return {kind:'none',binding:clone(input.binding),reason:input.request.kind};
  const identity=key(c,cache),snapshotHash=fingerprint(input),record=c.journal.get(identity);
  if(c.decided.has(identity)&&!record)throw new Error('trainer-ai-replay-record-missing');
  if(record){
    if(record.snapshotHash!==snapshotHash||record.bindingHash!==c.bindingHash)throw new Error('trainer-ai-replay-conflict');
    if(!equal(c.state.random,record.before))throw new Error('trainer-ai-replay-random-mismatch');
    c.state.random=clone(record.after);cache.plan=clone(record.plan);return clone(record.plan);
  }
  if(c.testFull||c.decided.size>=4096)throw new Error('trainer-ai-journal-full');
  const epoch=++c.epoch,before=clone(c.state.random),local=clone(before),started=c.timing.now();let open=true,calls=0;
  if(!Number.isFinite(started))throw new Error('trainer-ai-invalid-timing');
  const random=(n:number):number=>{
    if(!open||c.epoch!==epoch||c.gate!==gate||gate.cancelled)throw new Error('trainer-ai-random-closed');
    current(c,c.driver);if(c.timing.now()-started>=1000)throw new Error('trainer-ai-timeout');if(++calls>256)throw new Error('trainer-ai-random-budget');return trainerRandomN(local,n);
  };
  const finish=(ok:boolean,value:unknown):DecisionPlan=>{
    open=false;owned(c,gate);if(c.epoch!==epoch)throw new Error('trainer-ai-operation-retired');current(c,c.driver);key(c,cache);
    let plan:DecisionPlan,fault:string|null=null;
    if(ok){try{plan=validateTrainerAiIntent(value,input);if(plan.kind==='error')throw new Error('trainer-ai-policy-'+plan.reason);}catch(error){ok=false;value=error;}}
    if(!ok){
      if(!allowFallback)throw value;
      // Recheck genuine authority even when a strategy throws a source-looking error string.
      current(c,c.driver);key(c,cache);fault=value instanceof Error?value.message:'strategy-rejected';plan=fallback(input);
    }
    const after=ok?clone(local):clone(before);
    if(c.testFull||c.decided.size>=4096)throw new Error('trainer-ai-journal-full');
    const saved=freezeStrategyData({key:identity,snapshotHash,bindingHash:c.bindingHash,plan:clone(plan!),before,after,fallbackReason:fault});
    c.decided.add(identity);c.journal.set(identity,saved); // fixed before RNG publication and the first driver callback
    c.state.random=clone(after);cache.plan=clone(saved.plan);return clone(saved.plan);
  };
  let output:DecisionPlan|Promise<DecisionPlan>;
  try{output=c.invoke(input,random);}catch(error){return finish(false,error);}
  if(!(output instanceof Promise)){
    const elapsed=c.timing.now()-started;if(!Number.isFinite(elapsed)||elapsed<0){open=false;throw new Error('trainer-ai-invalid-timing');}
    return elapsed>=1000?finish(false,new Error('trainer-ai-timeout')):finish(true,output);
  }
  return new Promise<DecisionPlan>((resolve,reject)=>{
    let done=false,stop:(()=>void)|null=null;
    const cleanup=():void=>{open=false;if(c.pending===pending)c.pending=null;try{stop?.();}catch{/* stale timer cannot publish after done */}};
    const settle=(ok:boolean,value:unknown):void=>{
      if(done)return;done=true;cleanup();
      try {
        const elapsed=c.timing.now()-started;if(!Number.isFinite(elapsed)||elapsed<0)throw new Error('trainer-ai-invalid-timing');
        if(ok&&elapsed>=1000){ok=false;value=new Error('trainer-ai-timeout');}
        resolve(finish(ok,value));
      }catch(error){reject(error);}
    };
    const pending={cancel(reason:string):void{if(done)return;done=true;cleanup();reject(new Error(reason));}};
    c.pending=pending;
    Promise.prototype.then.call(output,(value:unknown)=>settle(true,value),(error:unknown)=>settle(false,error));
    try{
      const elapsed=c.timing.now()-started;if(!Number.isFinite(elapsed)||elapsed<0)throw new Error('trainer-ai-invalid-timing');
      if(elapsed>=1000)settle(false,new Error('trainer-ai-timeout'));
      else {stop=c.timing.after(1000-elapsed,()=>settle(false,new Error('trainer-ai-timeout')));if(done)stop();}
    }catch(error){pending.cancel(error instanceof Error?error.message:'trainer-ai-invalid-timing');}
  });
}
function refund(c:Channel,entry:Reservation,advanceRevision=true):void {
  if(entry.state!=='reserved')return;
  const resource=c.state.resources.find(r=>r.resourceKey===entry.key);if(!resource)throw new Error('trainer-ai-refund-resource-missing');
  c.state.resources=c.state.resources.map(r=>r.resourceKey===entry.key?{...r,count:r.count+1}:r);entry.state='refunded';if(advanceRevision)c.state.resourceRevision++;
}
export async function runTrainerAi(session:object,driver:BattleDriver):Promise<boolean> {
  const c=CHANNELS.get(session);if(!c)return false;const gate=begin(c);
  try{
    current(c,driver);let cache=capture(c),rebuilds=0;
    for(;;){try{
      owned(c,gate);if(cache.submitted)throw new Error('trainer-ai-request-already-submitted');
      let selected:readonly string[],extra:readonly string[]=[];
      if(cache.capture.automaticCandidateId)selected=[cache.capture.automaticCandidateId];
      else {
        const decision=decide(c,cache,gate,true),plan=decision instanceof Promise?await decision:decision;owned(c,gate);current(c,driver);
        if(plan.kind==='none')return true;if(plan.kind==='error')throw new Error('trainer-ai-policy-'+plan.reason);
        selected=plan.kind==='choose'?plan.retryOrder:plan.candidateIds;
        const r=cache.capture.snapshot.request;extra=r.kind==='move'?r.legalMoves.map(x=>x.candidateId):r.kind==='force-switch'?r.legalSwitches.map(x=>x.candidateId):[];
      }
      for(const candidateId of new Set([...selected,...extra])){
        if(cache.attempted.includes(candidateId))continue;
        owned(c,gate);current(c,driver);
        const action=trainerCandidate(driver,c.owner,cache.capture.ticket,candidateId,c.state.resourceRevision);cache.attempted.push(candidateId);
        let reservation:Reservation|undefined;
        if(action.kind==='item'){
          const resource=c.state.resources.find(r=>r.resourceKey===action.resourceKey);
          if(!resource||resource.count<1)throw new Error('trainer-ai-item-resource-unavailable');
          reservation={key:resource.resourceKey,itemId:resource.itemId,battleId:action.battleId,target:action.target,state:'reserved'};
          c.state.resources=c.state.resources.map(r=>r===resource?{...r,count:r.count-1}:r);c.state.ledger.push(reservation);
        }
        const result=await submitTrainerCandidate(driver,c.owner,cache.capture.ticket,candidateId,c.state.resourceRevision);
        owned(c,gate);current(c,driver);
        if(result==='accepted'&&cache.key)c.lastAccepted.set(cache.key,candidateId);
        if(result==='accepted'){cache.submitted=true;if(reservation)c.state.resourceRevision++;return true;}
        if(reservation){if(reservation.state!=='reserved')throw new Error('trainer-ai-item-registration-uncertain');refund(c,reservation,false);}
      }
      throw new Error('trainer-ai-legal-candidates-exhausted');
    }catch(error){
      const reason=error instanceof Error?error.message:'';
      if((reason==='trainer-ai-request-revision-changed'||reason==='trainer-ai-resource-revision-changed')&&rebuilds++===0){
        owned(c,gate);current(c,driver);const next=capture(c);
        if(next.capture.snapshot.binding.requestKey!==cache.capture.snapshot.binding.requestKey)throw error;
        cache=next;continue;
      }
      throw error;
    }}
  }finally{end(c,gate);}
}
export function trainerAiEvent(session:object,event:BattleEvent):void {
  const c=CHANNELS.get(session);if(!c||event.type!=='rpg')return;
  const [kind,side,item,target,result]=event.args;if(kind!=='item'||side!=='p2')return;
  const entry=c.state.ledger.find(e=>e.state==='reserved'&&e.battleId===item&&e.target===target);if(!entry)return;
  if(result==='ok')entry.state='consumed';else if(result==='noeffect'||result==='invalid')refund(c,entry);
  else{c.retired='trainer-ai-unknown-item-outcome';invalidate(c,c.retired);throw new Error(c.retired);}
}
export function assertTrainerAiCheckpointReady(session:object):void {
  if(CHANNELS.get(session)?.gate)throw new Error('trainer-ai-checkpoint-pending');
}
export function checkpointTrainerAi(session:object,driver:BattleDriver,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;assertTrainerAiCheckpointReady(session);current(c,driver);
  const terminal=trainerSourceFinished(driver,c.owner);if(!terminal){const value=capture(c);if(value.capture.snapshot.request.kind==='move'||value.capture.snapshot.request.kind==='force-switch')key(c,value);}
  const cache=!terminal&&c.cache?{snapshot:clone(c.cache.capture.snapshot),plan:clone(c.cache.plan),attempted:[...c.cache.attempted],submitted:c.cache.submitted,key:c.cache.key,record:c.cache.key?c.journal.get(c.cache.key)??null:null}:null;
  CHECKPOINTS.set(token,{session,lineage:c.lineage,policy:c.policy,bindingHash:c.bindingHash,terminal,state:clone(c.state),cache});
}
/** Read-only: invalid checkpoints must not cancel a live inference or call the engine restorer. */
export function preflightTrainerAiRestore(session:object,driver:BattleDriver,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;
  const cp=CHECKPOINTS.get(token);
  if(!cp||cp.session!==session||cp.lineage!==c.lineage||cp.policy!==c.policy||cp.bindingHash!==c.bindingHash)throw new Error('checkpoint-owner-mismatch');
  if(c.restoring)throw new Error('trainer-ai-restore-in-progress');
  current(c,driver,false);
  const value=cp.cache;if(!value)return;
  if(value.record&&c.journal.get(value.record.key)!==value.record)throw new Error('trainer-ai-replay-record-missing');
  const record=value.key?c.journal.get(value.key):undefined;
  if(value.key&&c.decided.has(value.key)&&!record)throw new Error('trainer-ai-replay-record-missing');
  if(record){
    if(record.bindingHash!==c.bindingHash||(!value.submitted&&record.snapshotHash!==fingerprint(value.snapshot)))throw new Error('trainer-ai-replay-conflict');
    if(!equal(cp.state.random,value.plan?record.after:record.before))throw new Error('trainer-ai-replay-random-mismatch');
  }
}
export function prepareTrainerAiRestore(session:object):void {
  const c=CHANNELS.get(session);if(c){c.restoring=true;invalidate(c,'trainer-ai-restore-retired-attempt');}
}
export function failTrainerAiRestore(session:object):void {const c=CHANNELS.get(session);if(c){c.restoring=false;c.retired='trainer-ai-restore-failed';invalidate(c,c.retired);}}
export function restoreTrainerAi(session:object,driver:BattleDriver,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;const cp=CHECKPOINTS.get(token)!;
  if(!cp||cp.session!==session||cp.lineage!==c.lineage||c.retired)throw new Error(c.retired??'trainer-ai-restore-source-mismatch');
  rebindTrainerSource(driver,c.owner,c.lineage,c.catalog);c.driver=driver;current(c,driver);
  if(trainerSourceFinished(driver,c.owner)!==cp.terminal)throw new Error('trainer-ai-restore-terminal-mismatch');
  c.state=clone(cp.state);c.cache=null;c.gate=null;c.restoring=false;
  if(cp.cache){
    const value=capture(c);
    if(!cp.cache.submitted&&!equal(value.capture.snapshot,cp.cache.snapshot))throw new Error('trainer-ai-restore-request-mismatch');
    value.plan=clone(cp.cache.plan);value.key=cp.cache.key;value.attempted=[...cp.cache.attempted];value.submitted=cp.cache.submitted;
  }
}
/** Existing diagnostic shape remains stable; immutable inference history is a separate diagnostic. */
export function trainerAiDiagnostics(session:object):unknown {
  const c=CHANNELS.get(session);return c?clone({strategyBinding:c.policy.binding,catalogIdentity:c.catalog.identity,authorIdentity:c.catalog.authorIdentity,moveCount:Object.keys(c.catalog.catalog.moves).length,typeCount:Object.keys(c.catalog.catalog.types).length,state:c.state,cache:c.cache?{snapshot:c.cache.capture.snapshot,plan:c.cache.plan,attempted:c.cache.attempted,submitted:c.cache.submitted}:null,retired:c.retired}):null;
}
export function trainerAiJournal(session:object):unknown {
  const c=CHANNELS.get(session);return c?clone({epoch:c.epoch,pending:!!c.pending,entries:[...c.journal.values()].map(row=>({...row,lastAcceptedCandidate:c.lastAccepted.get(row.key)??null}))}):null;
}
/** Explicit testing-only internal-corruption controls; never a production composition export. */
export function faultTrainerAiJournalForTest(session:object,fault:'missing-record'|'full'|'conflict-record'):void {
  const c=CHANNELS.get(session);if(!c||c.gate)throw new Error('trainer-ai-operation-in-progress');
  if(fault==='full')c.testFull=true;else {
    const first=c.journal.keys().next();if(!first.done){
      if(fault==='missing-record')c.journal.delete(first.value);
      else c.journal.set(first.value,freezeStrategyData({...c.journal.get(first.value)!,snapshotHash:'0'.repeat(64)}));
    }
  }
}
export function inspectTrainerAiRequest(session:object,driver:BattleDriver):{ticket:TrainerRequestTicket;snapshot:TrainerAiSnapshot;plan:DecisionPlan} {
  const c=CHANNELS.get(session);if(!c)throw new Error('trainer-ai-operation-in-progress');const gate=begin(c);
  try{
    current(c,driver);const cache=capture(c),plan=decide(c,cache,gate,false);
    if(plan instanceof Promise){invalidate(c,'trainer-ai-async-inspection-required');void plan.catch(()=>{});throw new Error('trainer-ai-async-inspection-required');}
    return {ticket:cache.capture.ticket,snapshot:clone(cache.capture.snapshot),plan};
  }finally{end(c,gate);}
}
export async function inspectTrainerAiRequestAsync(session:object,driver:BattleDriver):Promise<{snapshot:TrainerAiSnapshot;plan:DecisionPlan}> {
  const c=CHANNELS.get(session);if(!c)throw new Error('trainer-ai-operation-in-progress');const gate=begin(c);
  try{current(c,driver);const cache=capture(c);return {snapshot:clone(cache.capture.snapshot),plan:await decide(c,cache,gate,false)};}finally{end(c,gate);}
}
export function captureTrainerAiRequest(session:object,driver:BattleDriver):TrainerCapture {
  const c=CHANNELS.get(session);if(!c)throw new Error('trainer-ai-operation-in-progress');const gate=begin(c);
  try{current(c,driver);const value=capture(c).capture;return {ticket:value.ticket,snapshot:clone(value.snapshot)};}finally{end(c,gate);}
}
export function validateTrainerAiTicket(session:object,driver:BattleDriver,ticket:TrainerRequestTicket,candidateId:string):void {
  const c=CHANNELS.get(session);if(!c)throw new Error('trainer-ai-operation-in-progress');const gate=begin(c);
  try{current(c,driver);trainerCandidate(driver,c.owner,ticket,candidateId,c.state.resourceRevision);}finally{end(c,gate);}
}
