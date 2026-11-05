/** Opt-in replacement ports. A future Scene consumes these; no new protocol-v1 message/prototype methods. */
import type { BattleSession, TurnResult } from './session';
import type { BattleDriver, DriverCheckpoint } from '../battle/driver';
import { bindReplacementSource,replacementEligible,prepareReplacementSource,readReplacementSource,replacementTarget,submitReplacementSource,retireReplacementSource } from '../battle/replacement-source';
import type { ReplacementTicket,ReplacementView } from '../battle/replacement-source';
import { prepareTrainerReplacement,restorePreparedTrainerReplacement,commitPreparedTrainerReplacement } from './trainer-ai';
import type { PreparedTrainerReplacement } from './trainer-ai';
export interface TrainerReplacementOffer extends ReplacementView { offerId:number; allowSwitch:boolean }
interface Pending { id:number; source:ReplacementTicket; ai:PreparedTrainerReplacement; memberId:string; view:ReplacementView }
interface Channel { owner:object; lineage:object; driver:BattleDriver; retired:boolean; pending?:Pending }
const CHANNELS=new WeakMap<BattleSession,Channel>();
let nextOfferId=0; // UI stale-input selector; real authority stays in the private source ticket.
const CHECKPOINTS=new WeakMap<DriverCheckpoint,{session:BattleSession;lineage:object;pending?:{memberId:string;view:ReplacementView}}>();
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
export function bindReplacementOffer(session:BattleSession,enabled:boolean):void {
  if(!enabled)return;const owner={},lineage=bindReplacementSource(session.gw,owner);CHANNELS.set(session,{owner,lineage,driver:session.gw,retired:false});
}
export function hasReplacementOffer(session:BattleSession):boolean {const c=CHANNELS.get(session);return !!c&&!c.retired&&!!c.pending;}
function current(session:BattleSession,c:Channel):void {if(c.retired||c.driver!==session.gw)throw new Error('replacement-operation-retired');}
/** Returns true only when this operation is now waiting for the new companion UI. */
export async function prepareReplacementOffer(session:BattleSession):Promise<boolean> {
  const c=CHANNELS.get(session);if(!c)return false;current(session,c);if(c.pending)return true;
  if(!replacementEligible(c.driver,c.owner))return false;
  const decision=await prepareTrainerReplacement(session,c.driver);current(session,c);
  const prepared=prepareReplacementSource(c.driver,c.owner,decision.memberId);
  c.pending={id:++nextOfferId,source:prepared.token,ai:decision.token,memberId:decision.memberId,view:prepared.view};return true;
}
export function readTrainerReplacement(session:BattleSession):TrainerReplacementOffer|null {
  const c=CHANNELS.get(session);if(!c||c.retired||!c.pending||session._operation)return null;current(session,c);
  const view=readReplacementSource(c.driver,c.owner,c.pending.source);return {...view,offerId:c.pending.id,allowSwitch:session.canSwitch};
}
export function readTrainerReplacementTarget(session:BattleSession,offerId:number,id:string):{ok:true}|{ok:false;reason:'stale'|'switch-disabled'|'invalid-target'|'trapped'} {
  const c=CHANNELS.get(session);if(!c||c.retired||!c.pending||c.pending.id!==offerId||session._operation)return {ok:false,reason:'stale'};current(session,c);
  if(!session.canSwitch)return {ok:false,reason:'switch-disabled'};
  return replacementTarget(c.driver,c.owner,c.pending.source,id);
}
/** null is No/list-cancel, not abort. The declared foe choice stays fixed throughout the question. */
export async function resolveTrainerReplacement(session:BattleSession,offerId:number,id:string|null):Promise<TurnResult> {
  session._assertUsable();const c=CHANNELS.get(session),p=c?.pending;
  if(!c||c.retired||!p||p.id!==offerId||session._operation||session.finished||session.pendingLearn)return {ok:false,reason:'choice-rejected'};
  current(session,c);
  if(id!==null&&(typeof id!=='string'||!readTrainerReplacementTarget(session,offerId,id).ok))return {ok:false,reason:'choice-rejected'};
  return session._exclusive(async()=>{
    current(session,c);if(c.pending!==p)throw new Error('replacement-offer-stale');
    await submitReplacementSource(c.driver,c.owner,p.source,id,()=>commitPreparedTrainerReplacement(session,c.driver,p.ai));
    current(session,c);c.pending=undefined;session._ingest();await session._continueGrowth();session._syncWorkingFromEngine(true);
    return {ok:true,messages:session.take()};
  });
}
export function retireReplacementOffer(session:BattleSession):void {
  const c=CHANNELS.get(session);if(c){c.retired=true;c.pending=undefined;retireReplacementSource(c.driver,c.owner);}
}
export function checkpointReplacementOffer(session:BattleSession,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;current(session,c);
  if(c.pending)readReplacementSource(c.driver,c.owner,c.pending.source);
  CHECKPOINTS.set(token,{session,lineage:c.lineage,...(c.pending?{pending:{memberId:c.pending.memberId,view:copy(c.pending.view)}}:{})});
}
export function preflightReplacementOffer(session:BattleSession,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;const cp=CHECKPOINTS.get(token);current(session,c);
  if(!cp||cp.session!==session||cp.lineage!==c.lineage)throw new Error('replacement-checkpoint-owner-mismatch');
}
export function restoreReplacementOffer(session:BattleSession,token:DriverCheckpoint):void {
  const c=CHANNELS.get(session);if(!c)return;const cp=CHECKPOINTS.get(token);if(!cp||cp.session!==session||cp.lineage!==c.lineage||c.retired)throw new Error('replacement-checkpoint-owner-mismatch');
  retireReplacementSource(c.driver,c.owner);bindReplacementSource(session.gw,c.owner,c.lineage);c.driver=session.gw;c.pending=undefined;
  if(cp.pending){
    const ai=restorePreparedTrainerReplacement(session,c.driver,cp.pending.memberId),prepared=prepareReplacementSource(c.driver,c.owner,ai.memberId);
    if(JSON.stringify(prepared.view)!==JSON.stringify(cp.pending.view))throw new Error('replacement-checkpoint-view-mismatch');
    c.pending={id:++nextOfferId,source:prepared.token,ai:ai.token,memberId:ai.memberId,view:prepared.view};
  }
}
