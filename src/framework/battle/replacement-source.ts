/** Internal forced-replacement capability. UI never receives the engine, choices, or a mintable token. */
import type { BattleDriver, DriverCheckpoint } from './driver';
import { loadFormatExtension, restoreSimBattle } from './showdown-loader';
import type { LoadedSim } from './showdown-loader';
import type { ShowdownBattle, ShowdownPokemon } from './showdown-types';
export interface ReplacementTicket { readonly opaque?: never }
export interface ReplacementView { playerId:string; opponentSpecies:string; candidates:string[] }
interface Source { driver:BattleDriver; battle:ShowdownBattle; env:LoadedSim; snapshot:()=>string; lineage:object; owner?:object; retired:boolean; current?:ReplacementTicket }
interface Ticket { source:Source; owner:object; snapshot:string; foeId:string; view:ReplacementView; spent:boolean }
const SOURCES=new WeakMap<BattleDriver,Source>(),TICKETS=new WeakMap<ReplacementTicket,Ticket>();
const CHECKPOINTS=new WeakMap<DriverCheckpoint,{lineage:object}>();
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const snapshot=(s:Source):string=>s.snapshot();
/** Restore the private field callbacks before any native preview/trapping event runs. */
function probe(s:Source,sealed:string):ShowdownBattle {
  const b=restoreSimBattle(s.env,sealed);
  if(b.rpg?.initialField){
    const fields=loadFormatExtension(s.env.root).initialFields;
    if(!fields)throw new Error('initial-field-extension-unavailable');
    fields.attach(b);
  }
  return b;
}
export function attachReplacementSource(driver:BattleDriver,battle:ShowdownBattle,env:LoadedSim,snapshot:()=>string):void {
  // Capture the gateway's serializer at attachment, not a later caller-visible method.
  SOURCES.set(driver,{driver,battle,env,snapshot,lineage:{},retired:false});
}
function source(driver:BattleDriver,owner:object):Source {
  const s=SOURCES.get(driver);if(!s||s.owner!==owner||s.retired)throw new Error('replacement-source-unavailable');return s;
}
export function bindReplacementSource(driver:BattleDriver,owner:object,lineage?:object):object {
  const s=SOURCES.get(driver);if(!s||s.retired||s.owner||lineage&&s.lineage!==lineage)throw new Error('replacement-source-owner-mismatch');s.owner=owner;return s.lineage;
}
/** Plain fields only: unlike isChoiceDone(), this gate cannot append a pass action. */
function gate(s:Source):boolean {
  const b=s.battle;if(b.gen!==8||b.format.id!=='gen8rpgcustomgame'||b.gameType!=='singles')throw new Error('replacement-single-adapter-only');
  const [p1,p2]=b.sides,lead=p1?.active[0];
  return !b.ended&&!b.rpg?.wild&&b.requestState==='switch'&&!!p2?.activeRequest?.forceSwitch?.[0]
    &&!!p2.active[0]?.fainted&&!!p1?.activeRequest?.wait&&p1.active.length===1
    &&!!lead&&!lead.fainted&&lead.hp>0&&lead.activeTurns>0&&!lead.volatiles.lockedmove
    &&p1.choice.actions.length===0&&p2.choice.actions.length===0
    &&p1.pokemon.some((p:ShowdownPokemon)=>!p.isActive&&!p.fainted&&p.hp>0);
}
export function replacementEligible(driver:BattleDriver,owner:object):boolean {return gate(source(driver,owner));}
function data(driver:BattleDriver,owner:object,token:ReplacementTicket):Ticket {
  const s=source(driver,owner),t=TICKETS.get(token);
  if(!t||t.source!==s||t.owner!==owner||t.spent||s.current!==token||snapshot(s)!==t.snapshot)throw new Error('replacement-offer-stale');return t;
}
export function prepareReplacementSource(driver:BattleDriver,owner:object,foeId:string):{token:ReplacementTicket;view:ReplacementView} {
  const s=source(driver,owner);if(!gate(s))throw new Error('replacement-offer-ineligible');
  const target=s.battle.sides[1].pokemon.find((p:ShowdownPokemon)=>p.name===foeId&&!p.isActive&&!p.fainted&&p.hp>0);if(!target)throw new Error('replacement-foe-unavailable');
  const sealed=snapshot(s),preview=probe(s,sealed),incoming=preview.sides[1].pokemon.find((p:ShowdownPokemon)=>p.name===foeId);
  // Use the native switch-in prefix on the clone: it activates/reorders the member before BeforeSwitchIn.
  // Calling an ability event on an inactive reserve would suppress Illusion and expose the real species.
  if (!preview.actions.switchIn(incoming, 0)) throw new Error('replacement-preview-unavailable');
  const shown=incoming.illusion||incoming;
  const view:ReplacementView={playerId:s.battle.sides[0].active[0].name,opponentSpecies:shown.species.name,
    candidates:s.battle.sides[0].pokemon.filter((p:ShowdownPokemon)=>!p.isActive&&!p.fainted&&p.hp>0).map((p:ShowdownPokemon)=>String(p.name))};
  if(snapshot(s)!==sealed)throw new Error('replacement-source-changed');
  const token=Object.freeze({});TICKETS.set(token,{source:s,owner,snapshot:sealed,foeId,view:copy(view),spent:false});s.current=token;return {token,view:copy(view)};
}
export function readReplacementSource(driver:BattleDriver,owner:object,token:ReplacementTicket):ReplacementView {return copy(data(driver,owner,token).view);}
/** True trapping is recomputed by native events on an isolated battle, never on the live query target. */
export function replacementTarget(driver:BattleDriver,owner:object,token:ReplacementTicket,id:string):{ok:true}|{ok:false;reason:'invalid-target'|'trapped'} {
  const t=data(driver,owner,token),s=t.source,b=probe(s,t.snapshot),side=b.sides[0],lead=side.active[0];
  const target=side.pokemon.find((p:ShowdownPokemon)=>p.name===id&&!p.isActive&&!p.fainted&&p.hp>0);
  if(!target)return {ok:false,reason:'invalid-target'};
  lead.trapped=lead.maybeTrapped=false;b.runEvent('TrapPokemon',lead);
  if(snapshot(s)!==t.snapshot)throw new Error('replacement-source-changed');
  return lead.trapped?{ok:false,reason:'trapped'}:{ok:true};
}
/** The callback is the existing source-checked AI commit, not an arbitrary replacement chooser. */
export async function submitReplacementSource(driver:BattleDriver,owner:object,token:ReplacementTicket,id:string|null,commit:()=>Promise<boolean>):Promise<boolean> {
  const t=data(driver,owner,token),s=t.source,p1=s.battle.sides[0];
  if(id!==null&&!replacementTarget(driver,owner,token,id).ok)return false;
  data(driver,owner,token);t.spent=true;let added:object|undefined;
  try {
    if(id!==null){
      const target=p1.pokemon.find((p:ShowdownPokemon)=>p.name===id);
      // Native instant switches have order 3 in the pinned adapter; this private prelude executes first.
      added={choice:'instaswitch',pokemon:p1.active[0],target,order:2.5};p1.choice.actions.push(added);
    }
    const ok=await commit();
    if(s.retired)throw new Error('replacement-source-retired');
    if(!ok)throw new Error('replacement-foe-submit-rejected');
    s.current=undefined;return true;
  } finally {
    // On a refused/throwing callback discard only our still-uncommitted transient action.
    if(added){const index=p1.choice.actions.indexOf(added);if(index>=0)p1.choice.actions.splice(index,1);}
  }
}
export function retireReplacementSource(driver:BattleDriver,owner:object):void {
  const s=SOURCES.get(driver);if(s?.owner===owner){s.retired=true;s.current=undefined;}
}
export function checkpointReplacementSource(driver:BattleDriver,token:DriverCheckpoint):void {
  const s=SOURCES.get(driver);if(s)CHECKPOINTS.set(token,{lineage:s.lineage});
}
export function restoreReplacementSource(driver:BattleDriver,token:DriverCheckpoint):void {
  const s=SOURCES.get(driver),cp=CHECKPOINTS.get(token);if(!s||!cp)throw new Error('replacement-source-restore-mismatch');s.lineage=cp.lineage;
}
