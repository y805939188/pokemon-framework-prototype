/** Actual gateway provenance, request capabilities and detached public collection. Never a public SDK entry. */
import type { BattleDriver, DriverCheckpoint } from './driver';
import type { ShowdownBattle, ShowdownPokemon } from './showdown-types';
import type { LoadedSim } from './showdown-loader';
import type { Content } from '../rules/types';
import type { TrainerAiSnapshot, TrainerResource, PublicOpponent, OwnMember, LegalMoveCandidate, LegalItemCandidate, Ratio, PersistentStatus } from '../rules/trainer-ai';
import { assembleTrainerCatalog } from './trainer-ai-catalog';
import type { AssembledTrainerCatalog } from './trainer-ai-catalog';
import { semanticFingerprint as canonicalJson } from '../rules/semantic';
import { itemEligibility } from '../rules/rules';

type Action = {kind:'move'|'switch'; choice:string} | {kind:'item'; itemId:string; battleId:string; target:string; resourceKey:string};
export interface TrainerRequestTicket { readonly opaque?: never }
/** Automatic engine responses are private execution data, never a made-up learned move in the policy DTO. */
export interface TrainerCapture { ticket:TrainerRequestTicket; snapshot:TrainerAiSnapshot; automaticCandidateId?:string }
interface RequestIdentity { object:object|null; turn:number; seq:number; revision:number; signature:string }
interface TicketData { source:Source; owner:object; request:RequestIdentity; resourceRevision:number; actions:Map<string,Action>; spent:boolean; automaticCandidateId?:string }
type MutableOpponent = {-readonly [K in keyof PublicOpponent]:PublicOpponent[K]};
interface Source {
  driver:BattleDriver; battle:ShowdownBattle; env:LoadedSim; lineage:object; seed:number[]|string;
  public:MutableOpponent|null; appearance:number; weather:string; terrain:string; conditions:string[];
  request:RequestIdentity; ticket:TrainerRequestTicket|null; owner?:object; catalog?:AssembledTrainerCatalog;
  submit:(action:Action)=>Promise<boolean>;
}
const SOURCES = new WeakMap<BattleDriver,Source>();
const TICKETS = new WeakMap<TrainerRequestTicket,TicketData>();
interface SourceCheckpoint {lineage:object;seed:number[]|string;public:MutableOpponent|null;appearance:number;weather:string;terrain:string;conditions:string[];request:Omit<RequestIdentity,'object'>}
const CHECKPOINTS = new WeakMap<DriverCheckpoint,SourceCheckpoint>();
const copy = <T>(v:T):T => JSON.parse(JSON.stringify(v)) as T;
const id = (v:string):string => v.toLowerCase().replace(/[^a-z0-9]/g,'');
const status = (v:string,fainted=false):PersistentStatus => (v === 'fnt' && fainted ? 'none' : v || 'none') as PersistentStatus;
const stages = ():PublicOpponent['stages'] => ({atk:0,def:0,spa:0,spd:0,spe:0,accuracy:0,evasion:0});
/** Called only by the gateway constructor, before setPlayer can emit callbacks. */
export function attachTrainerSource(driver:BattleDriver,battle:ShowdownBattle,env:LoadedSim,submit:Source['submit']):void {
  SOURCES.set(driver,{driver,battle,env,submit,lineage:{},seed:copy(battle.prngSeed),public:null,appearance:0,weather:'',terrain:'',conditions:[],request:{object:null,turn:0,seq:0,revision:0,signature:''},ticket:null});
}
/** Only emitted engine requests create/advance request authority. Equal refresh retains one entitlement. */
export function trainerSourceRequest(driver:BattleDriver):void {
  const s=SOURCES.get(driver); if(!s)return;
  const req=s.battle.sides[1]?.activeRequest; if(!req)return;
  const signature=requestSignature(s);
  const old=s.request;
  if(old.turn!==s.battle.turn || !old.object) s.request={object:req,turn:s.battle.turn,seq:old.seq+1,revision:0,signature};
  else if(signature!==old.signature) s.request={object:req,turn:old.turn,seq:old.seq,revision:old.revision+1,signature};
  else old.object=req;
}
function requestSignature(s:Source):string {
  const p=s.battle.sides[1],r=p?.activeRequest;
  if(!r)return 'none';
  return canonicalJson({turn:s.battle.turn,wait:!!r.wait,force:r.forceSwitch??null,active:(r.active??[]).map((a:any)=>({moves:a.moves.map((m:any)=>({id:m.id,pp:m.pp??null,disabled:!!m.disabled,target:m.target??null})),trapped:!!a.trapped})),public:s.public,field:[s.weather,s.terrain,s.conditions],own:p.pokemon.map((m:ShowdownPokemon)=>({id:m.name,hp:m.hp,maxhp:m.maxhp,active:!!m.isActive,status:m.status,item:m.item,ability:m.ability,types:m.getTypes(),moves:m.moveSlots.map((x:any)=>({id:x.id,pp:x.pp,maxpp:x.maxpp})),confusion:m.volatiles.confusion?.time??0}))});
}
function hpBar(value:string):{parts:number;scale:100} {
  if(value.startsWith('0 fnt'))return {parts:0,scale:100};
  const m=/^(\d+)\/(\d+)/.exec(value); if(!m || Number(m[2])<=0)throw new Error('trainer-ai-invalid-public-health');
  // The RPG debug format emits exact health. Its public presentation branch is percent-only: ceil,
  // with a damaged full-looking bar capped at 99, matching Gen8's ordinary public health display.
  const hp=Number(m[1]),maxhp=Number(m[2]);
  const parts=hp<maxhp?Math.min(99,Math.ceil(100*hp/maxhp)):100;
  return {parts,scale:100};
}
/** Engine public stream only. p1 request, choice, queue and rpg.pending are never inspected. */
export function trainerSourcePublic(driver:BattleDriver,lines:readonly string[]):void {
  const s=SOURCES.get(driver);if(!s)return;
  for(const line of lines){
    const [type,a='',b='',c='']=line.slice(1).split('|');
    if(type==='-weather')s.weather=b==='[upkeep]'?s.weather:a==='none'?'':id(a);
    if(type==='-fieldstart'&&a.startsWith('move: ')&&a.endsWith('Terrain'))s.terrain=id(a.slice(6));
    if(type==='-fieldend'&&a.startsWith('move: ')&&a.endsWith('Terrain'))s.terrain='';
    if((type==='-sidestart'||type==='-sideend')&&a.startsWith('p2')){
      const key=id(b.replace(/^move: /,'')); if(['spikes','toxicspikes','stealthrock','stickyweb'].includes(key)){
        const prefix='p2:'+key; const previous=s.conditions.find(x=>x.startsWith(prefix));s.conditions=s.conditions.filter(x=>!x.startsWith(prefix));
        if(type==='-sidestart')s.conditions.push(key==='spikes'||key==='toxicspikes'?prefix+':'+Math.min(key==='spikes'?3:2,Number(previous?.split(':')[2]??0)+1):prefix);
      }
    }
    if(!a.startsWith('p1a:'))continue;
    if(type==='switch'||type==='drag'||type==='replace'){
      const speciesName=b.split(',')[0]!,species=s.env.sim.Dex.forGen(8).species.get(speciesName);
      if(!species.exists)throw new Error('trainer-ai-unknown-public-species');
      const previous=type==='replace'?s.public:null;
      const level=Number(/(?:^|, )L(\d+)/.exec(b)?.[1]??100),bar=c?hpBar(c):previous?.hpBar;
      if(!bar)throw new Error('trainer-ai-invalid-public-health');
      s.public={appearanceKey:previous?.appearanceKey??'p1a:'+ ++s.appearance,displayedSpecies:species.id,displayedForm:0,level,shownTypes:[...species.types],hpBar:bar,status:c?status(c.split(' ')[1]??'',bar.parts===0):previous!.status,stages:previous?copy(previous.stages):stages(),revealedMoves:previous?[...previous.revealedMoves]:[],lastPublicMove:previous?copy(previous.lastPublicMove):null,fainted:bar.parts===0,revealedAbility:previous?.revealedAbility??null,revealedItem:previous?.revealedItem??null};
    }
    const p=s.public;if(!p)continue;
    if(type==='-damage'||type==='-heal'){p.hpBar=hpBar(b);p.fainted=p.hpBar.parts===0;p.status=status(b.split(' ')[1]??'',p.fainted);}
    if(type==='faint'){p.hpBar={parts:0,scale:100};p.fainted=true;}
    if(type==='-status')p.status=status(b);
    if(type==='-curestatus')p.status='none';
    if(type==='move'){
      const m=s.env.sim.Dex.forGen(8).moves.get(b);if(m.exists){if(!p.revealedMoves.includes(m.id))p.revealedMoves=[...p.revealedMoves,m.id];p.lastPublicMove={moveId:m.id,moveType:m.type,basePower:m.basePower};}
    }
    if(type==='-ability')p.revealedAbility=id(b);
    if(type==='-item'||type==='-enditem')p.revealedItem=id(b);
    if((type==='-boost'||type==='-unboost'||type==='-setboost')&&Object.hasOwn(p.stages,b)){
      const key=b as keyof typeof p.stages,old=p.stages[key];p.stages={...p.stages,[key]:Math.max(-6,Math.min(6,type==='-setboost'?Number(c):old+Number(c)*(type==='-unboost'?-1:1)))};
    }
    if(type==='-clearboost')p.stages=stages();
    if(type==='-start'&&b==='typechange')p.shownTypes=c.split('/');
    if(type==='-start'&&b==='typeadd'&&!p.shownTypes.includes(c))p.shownTypes=[...p.shownTypes,c].slice(-2);
  }
}
export function bindTrainerSource(driver:BattleDriver,owner:object,content:Content,identity:string):{catalog:AssembledTrainerCatalog;seed:number[]|string;lineage:object} {
  const s=SOURCES.get(driver);if(!s||s.owner)throw new Error('trainer-ai-unknown-source');
  if(s.battle.format.id!=='gen8rpgcustomgame')throw new Error('trainer-ai-unsupported-format');
  const catalog=assembleTrainerCatalog(s.env,content,identity);s.catalog=catalog;s.owner=owner;
  return {catalog,seed:copy(s.seed),lineage:s.lineage};
}
function sourceFor(driver:BattleDriver,owner:object):Source {
  const s=SOURCES.get(driver);if(!s||s.owner!==owner||!s.catalog)throw new Error('trainer-ai-source-mismatch');return s;
}
/** Terminal growth still checkpoints trainer state, but has no executable engine request. */
export function trainerSourceFinished(driver:BattleDriver,owner:object):boolean {
  return sourceFor(driver,owner).battle.ended;
}
export function captureTrainerRequest(driver:BattleDriver,owner:object,generation:number,profile:TrainerAiSnapshot['profile'],resources:readonly TrainerResource[],resourceRevision:number):TrainerCapture {
  const s=sourceFor(driver,owner),b=s.battle,side=b.sides[1],req=side.activeRequest,r=s.request,catalog=s.catalog!.catalog;
  if(req!==r.object || b.turn!==r.turn)throw new Error('trainer-ai-original-request-mismatch');
  const signature=requestSignature(s);
  if(signature!==r.signature){s.request={...r,revision:r.revision+1,signature};s.ticket=null;}
  if(s.ticket){const t=TICKETS.get(s.ticket);if(t&&t.request===s.request&&t.resourceRevision===resourceRevision)return {ticket:s.ticket,snapshot:copy((t as TicketData & {snapshot:TrainerAiSnapshot}).snapshot),...(t.automaticCandidateId?{automaticCandidateId:t.automaticCandidateId}:{})};}
  const party:OwnMember[]=side.pokemon.map((p:ShowdownPokemon)=>({memberId:p.name,partyOrder:side.team.findIndex((set:any)=>set.name===p.name),active:!!p.isActive,hp:p.hp,maxhp:p.maxhp,status:status(p.status,p.hp===0&&p.fainted),confusionTurns:p.isActive?(p.volatiles.confusion?.time??0):0,types:[...p.getTypes()],knownAbility:p.ability,knownHeldItem:p.item,moves:p.moveSlots.map((m:any,i:number)=>({slot:i+1,moveId:m.id,pp:m.pp,maxpp:m.maxpp}))}));
  const actions=new Map<string,Action>();
  const key='p2:'+s.request.seq+':'+s.request.revision;
  let request:TrainerAiSnapshot['request'],automaticCandidateId:string|undefined;
  if(b.ended)request={kind:'finished'};
  else if(!req||req.wait||(!side.choice.forcedSwitchesLeft&&side.choice.actions.length>=side.active.length))request={kind:'wait'};
  else if(req.forceSwitch){
    const switches=b.possibleSwitches(side).filter((p:ShowdownPokemon)=>!p.fainted&&!p.isActive).sort((a:ShowdownPokemon,z:ShowdownPokemon)=>party.find(m=>m.memberId===a.name)!.partyOrder-party.find(m=>m.memberId===z.name)!.partyOrder).map((p:ShowdownPokemon)=>{const candidateId=key+':s:'+p.position;actions.set(candidateId,{kind:'switch',choice:'switch '+(p.position+1)});return {candidateId,memberId:p.name as string};});
    request={kind:'force-switch',legalSwitches:switches};
  }else{
    const actor=side.active[0];if(!actor||actor.fainted||!req.active?.[0])throw new Error('trainer-ai-invalid-move-request');
    const requested=req.active[0].moves;
    // Fixed Gen8 emits only {move,id} for hard-locked turns. Verify that actual lock on
    // this owner before responding at its request command position, with no policy/RNG.
    // Ordinary single-move and PP-less Struggle requests retain their normal DTO path.
    if(requested.length===1&&requested[0].pp===undefined&&requested[0].target===undefined){
      const locked=actor.getLockedMove();
      if(!locked||id(locked)!==requested[0].id||req.active[0].trapped!==true)throw new Error('trainer-ai-invalid-automatic-request');
      automaticCandidateId=key+':automatic:'+requested[0].id;
      actions.set(automaticCandidateId,{kind:'move',choice:'move 1'});
    }
    const legalMoves:LegalMoveCandidate[]=[];
    if(!automaticCandidateId)for(const [i,m]of requested.entries()){
      if(m.disabled || m.pp===0)continue;
      const meta=catalog.moves[m.id];if(!meta)throw new Error('trainer-ai-move-catalog-missing:'+m.id);
      const self=['self','allySide','allyTeam','all','field'].includes(m.target),opponent=s.public;
      if(!self&&(!opponent||opponent.fainted))throw new Error('trainer-ai-public-target-missing');
      const target=self?{kind:'self' as const}:{kind:'opponent' as const,appearanceKey:opponent!.appearanceKey};
      let mult:Ratio={numerator:1,denominator:1};for(const t of self?actor.getTypes():opponent!.shownTypes){if(t==='???')continue;const v=catalog.types[meta.moveType]?.[t];if(!v)throw new Error('trainer-ai-public-type-missing');mult={numerator:mult.numerator*v.numerator,denominator:mult.denominator*v.denominator};}
      while(mult.numerator%2===0&&mult.denominator%2===0&&mult.denominator>1){mult={numerator:mult.numerator/2,denominator:mult.denominator/2};}
      const candidateId=key+':m:'+i;actions.set(candidateId,{kind:'move',choice:'move '+(i+1)});
      const slot=m.id==='struggle'?i+1:actor.moveSlots.findIndex((own:any)=>own.id===m.id)+1;
      if(slot<1)throw new Error('trainer-ai-requested-move-not-owned');
      legalMoves.push({candidateId,slot,moveId:m.id,mode:m.id==='struggle'?'engine-auto-struggle':'normal',target,metadata:{...copy(meta),publicTypeMultiplier:mult,publicFailure:meta.family==='basic-damage'&&mult.numerator===0?'type-immune':'none',omittedModifiers:['other-move-effects']}});
    }
    const legalItems:LegalItemCandidate[]=[];
    if(!automaticCandidateId)for(const res of resources){const meta=catalog.items[res.itemId];if(!meta)throw new Error('trainer-ai-item-catalog-missing');if(res.count<1||meta.family==='unsupported')continue;
      const battleId=s.catalog!.battleItems[res.itemId]!;
      if(!itemEligibility(battleId,{id:actor.name,hp:actor.hp,maxhp:actor.maxhp,fainted:actor.fainted,status:actor.status,active:true,confused:!!actor.volatiles.confusion}).ok)continue;
      const candidateId=key+':i:'+res.resourceKey;actions.set(candidateId,{kind:'item',itemId:res.itemId,battleId,target:actor.name,resourceKey:res.resourceKey});
      legalItems.push({candidateId,resourceKey:res.resourceKey,itemId:res.itemId,targetMemberId:actor.name,...copy(meta),family:meta.family});
    }
    request=automaticCandidateId?{kind:'wait'}:{kind:'move',actorId:actor.name,legalMoves,legalItems};
  }
  const snapshot:TrainerAiSnapshot={schema:'trainer-ai-public-v1',gen:8,format:'gen8rpgcustomgame',binding:{requestKey:'p2:'+s.request.seq,requestRevision:String(s.request.revision),generation,turn:b.turn,ownResourceRevision:resourceRevision},profile:copy(profile),own:{side:'p2',party,resources:copy([...resources])},opponent:{active:s.public?[copy(s.public)]:[]},field:{weather:s.weather,terrain:s.terrain,publicConditions:[...s.conditions]},request};
  const ticket=Object.freeze({});TICKETS.set(ticket,{source:s,owner,request:s.request,resourceRevision,actions,spent:false,snapshot:copy(snapshot),automaticCandidateId} as TicketData);s.ticket=ticket;
  return {ticket,snapshot,...(automaticCandidateId?{automaticCandidateId}:{})};
}
export function trainerCandidate(driver:BattleDriver,owner:object,ticket:TrainerRequestTicket,candidateId:string,resourceRevision:number):Action {
  const s=sourceFor(driver,owner),t=TICKETS.get(ticket);
  if(!t||t.source!==s||t.owner!==owner)throw new Error('trainer-ai-unknown-source');
  if(t.spent)throw new Error('trainer-ai-request-already-submitted');
  if(t.resourceRevision!==resourceRevision)throw new Error('trainer-ai-resource-revision-changed');
  if(t.request!==s.request || t.request.object!==s.battle.sides[1].activeRequest || t.request.signature!==requestSignature(s)||t.request.turn!==s.battle.turn)throw new Error('trainer-ai-request-revision-changed');
  if(t.automaticCandidateId&&id(s.battle.sides[1].active[0]?.getLockedMove()||'')!==s.battle.sides[1].activeRequest?.active?.[0]?.moves?.[0]?.id)throw new Error('trainer-ai-request-revision-changed');
  const action=t.actions.get(candidateId);if(!action)throw new Error('trainer-ai-unknown-candidate');return copy(action);
}
/** Internal journal identity. Only an actual owner/ticket may query it; DTO strings cannot mint authority. */
export function trainerDecisionKey(driver:BattleDriver,owner:object,ticket:TrainerRequestTicket,resourceRevision:number):string {
  const s=sourceFor(driver,owner),t=TICKETS.get(ticket);
  if(!t||t.source!==s||t.owner!==owner)throw new Error('trainer-ai-unknown-source');
  if(t.resourceRevision!==resourceRevision)throw new Error('trainer-ai-resource-revision-changed');
  if(t.request!==s.request||t.request.object!==s.battle.sides[1].activeRequest||t.request.signature!==requestSignature(s)||t.request.turn!==s.battle.turn)throw new Error('trainer-ai-request-revision-changed');
  return s.request.seq+':'+s.request.revision+':'+resourceRevision;
}
export async function submitTrainerCandidate(driver:BattleDriver,owner:object,ticket:TrainerRequestTicket,candidateId:string,resourceRevision:number):Promise<'accepted'|'safe-rejected'> {
  const action=trainerCandidate(driver,owner,ticket,candidateId,resourceRevision),s=sourceFor(driver,owner),t=TICKETS.get(ticket)!;
  // Consume before the first async/reentrant driver callback. A refusal may re-open only after exact no-effect proof.
  t.spent=true;const before=JSON.stringify(s.battle.toJSON());
  const ok=await s.submit(action);
  if(ok)return 'accepted';
  if(JSON.stringify(s.battle.toJSON())!==before)throw new Error('trainer-ai-rejection-has-unknown-effects');
  t.spent=false;return 'safe-rejected';
}
export function checkpointTrainerSource(driver:BattleDriver,token:DriverCheckpoint):void {
  const s=SOURCES.get(driver);if(!s)return;
  const {object:_,...request}=s.request;
  CHECKPOINTS.set(token,{lineage:s.lineage,seed:copy(s.seed),public:copy(s.public),appearance:s.appearance,weather:s.weather,terrain:s.terrain,conditions:[...s.conditions],request:copy(request)});
}
export function restoreTrainerSource(driver:BattleDriver,token:DriverCheckpoint):void {
  const s=SOURCES.get(driver),cp=CHECKPOINTS.get(token);if(!s||!cp)throw new Error('trainer-ai-restore-source-mismatch');
  Object.assign(s,copy({seed:cp.seed,public:cp.public,appearance:cp.appearance,weather:cp.weather,terrain:cp.terrain,conditions:cp.conditions}));
  s.lineage=cp.lineage;s.request={...cp.request,object:s.battle.sides[1]?.activeRequest??null};s.ticket=null;
}
export function rebindTrainerSource(driver:BattleDriver,owner:object,lineage:object,catalog:AssembledTrainerCatalog):void {
  const s=SOURCES.get(driver);if(!s||s.lineage!==lineage||s.owner)throw new Error('trainer-ai-restore-source-mismatch');s.owner=owner;s.catalog=catalog;
}
