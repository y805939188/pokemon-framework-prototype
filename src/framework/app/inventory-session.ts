/** Process-local operation ownership, selection revisions and bounded completed receipts. No persistent journal. */
import { clone } from '../rules/value.ts';
import { semanticFingerprint } from '../rules/semantic.ts';
import { addItems, aggregateBag, inventoryPolicy, moveInventorySlot, removeItems } from '../rules/inventory.ts';
import { catalogOf, hasFlag, itemOf } from '../rules/item-catalog.ts';
import { changeMoney, moneyCap, setBadge } from '../rules/economy.ts';
import { own, setOwn } from '../rules/own.ts';
import type { GameState } from '../rules/state.ts';
import type { Content } from '../rules/types.ts';
import type { Limits } from '../rules/limits.ts';
import type { GameStatePort } from './ports.ts';
import type { ItemDefinition } from '../rules/item-catalog.ts';

export interface InventoryParent { token:string; memberId:string }
export interface InventoryTicket { token:string; generation:number; revision:string; contentRevision:string; pocket:number; index:number; itemId:string; quantity:number }
export type InventoryRequest =
  | {kind:'add-items';itemId:string;quantity:number;claimId?:string}
  | {kind:'remove-items';itemId:string;quantity:number;ticket?:InventoryTicket}
  | {kind:'change-money';amount:number}
  | {kind:'set-badge';index:number;owned:boolean}
  | {kind:'browse';pocket:number;index:number};
export interface InventoryOutcome { status:'committed'|'duplicate'|'unchanged'|'refused';requestId?:string;reason?:string;error?:string;presentation?:'ok'|'failed';result?:Record<string,unknown> }
interface Context { token:string;generation:number;contentRevision:string;kind:'bag'|'item'|'shop';parent?:InventoryParent }
interface Options { limits:Limits;generation:()=>number;enter:(parent?:InventoryParent)=>void;leave:(parent?:InventoryParent)=>void;install:(next:GameState)=>void }
const message=(error:unknown):string=>error instanceof Error?error.message:String(error);
const reason=(error:unknown):string=>typeof error==='object'&&error!==null&&'reason'in error?String(error.reason):message(error);

export class InventorySession {
  private readonly state:GameStatePort;
  private readonly content:()=>Content;
  private readonly options:Options;
  private context:Context|null=null;
  private sorting:{pocket:number;start:number;cursor:number;order:number[];revision:string}|null=null;
  private filtering=false;
  private sequence=0n;
  private revision=0n;
  private observedInventory='';
  private readonly receipts=new Map<string,{fingerprint:string;outcome:InventoryOutcome}>();
  constructor(state:GameStatePort,content:()=>Content,options:Options){this.state=state;this.content=content;this.options=options;}
  get active():boolean{return this.context!==null;}
  get saveBlocked():boolean{return this.context?.kind==='item';}
  private contentRevision(content:Content):string{return semanticFingerprint(clone(content));}
  stateChanged(next:GameState):void{const value=JSON.stringify(next.inventory.pockets);if(value!==this.observedInventory){this.revision++;this.observedInventory=value;}}
  invalidate():void{const parent=this.context?.parent;this.context=null;this.sorting=null;this.filtering=false;this.receipts.clear();this.options.leave(parent);}
  begin(kind:'bag'|'item'|'shop'='bag',parent?:InventoryParent):string{
    if(this.context)throw new Error('inventory-operation-active');
    if(!['bag','item','shop'].includes(kind)||parent&&kind!=='item')throw new Error('invalid-operation-context');
    this.options.enter(parent);
    try {
      const game=this.state.read(),content=this.content();
      if(parent&&!game.party.some(m=>m.id===parent.memberId&&!m.isEgg))throw new Error('invalid-target');
      for(const pocket of game.inventory.pockets)for(const slot of pocket)if(!itemOf(catalogOf(content),slot.itemId))throw new Error('unmapped-item');
      const revision=this.contentRevision(content);this.stateChanged(game);
      const token=`inventory:${this.options.generation()}:${++this.sequence}`;
      this.context={token,generation:this.options.generation(),contentRevision:revision,kind,...(parent?{parent:clone(parent)}:{})};this.receipts.clear();return token;
    } catch(error) {this.options.leave(parent);throw error;}
  }
  end(token:string):InventoryOutcome{
    if(this.context?.token!==token)return {status:'refused',reason:'stale-operation'};
    if(this.sorting){const cancelled=this.endSort(token,true);if(cancelled.status==='refused'){this.invalidate();return cancelled;}}
    this.invalidate();return {status:'unchanged'};
  }
  private current(token:string):{game:GameState;content:Content;context:Context}{
    const context=this.context;
    if(!context||context.token!==token||context.generation!==this.options.generation())throw new Error('stale-operation');
    const content=this.content();
    if(context.contentRevision!==this.contentRevision(content)){this.invalidate();throw new Error('stale-content');}
    const game=this.state.read();this.stateChanged(game);
    if(context.parent&&!game.party.some(member=>member.id===context.parent!.memberId&&!member.isEgg))throw new Error('stale-target');
    return {game,content,context};
  }
  snapshot(token:string,filter?:(item:ItemDefinition)=>boolean):{pockets:{item:ItemDefinition;quantity:number;index:number}[][];lastPocket:number;indices:number[];revision:string}{
    const {game,content}=this.current(token),catalog=catalogOf(content);
    this.filtering=!!filter;
    const pockets=game.inventory.pockets.map(pocket=>pocket.flatMap((slot,index)=>{
      const item=itemOf(catalog,slot.itemId);if(!item)throw new Error('unmapped-item');
      return !filter||filter(clone(item))?[{item:clone(item),quantity:slot.quantity,index}]:[];
    }));
    return clone({pockets,lastPocket:game.inventory.lastPocket,indices:game.inventory.indices,revision:String(this.revision)});
  }
  ticket(token:string,pocket:number,index:number):InventoryTicket{
    const {game,context}=this.current(token);
    if(!Number.isInteger(pocket)||pocket<1||pocket>8||!Number.isInteger(index)||index<0)throw new Error('invalid-slot');
    const slot=game.inventory.pockets[pocket-1]![index];if(!slot)throw new Error('stale-slot');
    return {token,generation:context.generation,revision:String(this.revision),contentRevision:context.contentRevision,pocket,index,itemId:slot.itemId,quantity:slot.quantity};
  }
  private checkTicket(token:string,ticket:InventoryTicket):void{
    const current=this.ticket(token,ticket.pocket,ticket.index);
    if(semanticFingerprint(current)!==semanticFingerprint(ticket))throw new Error('stale-slot');
  }
  execute(token:string,requestId:string,request:InventoryRequest,present?:(outcome:InventoryOutcome)=>void):InventoryOutcome{
    let data:ReturnType<InventorySession['current']>,fingerprint:string;
    try{
      data=this.current(token);
      if(typeof requestId!=='string'||!requestId||requestId.length>64)throw new Error('invalid-request-id');
      fingerprint=semanticFingerprint(request);
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
    const old=this.receipts.get(requestId);
    if(old){if(old.fingerprint!==fingerprint)return {status:'refused',reason:'request-conflict'};return this.present({...clone(old.outcome),status:'duplicate'},present);}
    if(this.receipts.size>=256)return {status:'refused',reason:'session-request-limit'};
    const {game,content,context}=data;let next=clone(game),result:Record<string,unknown>;
    try{
      if(this.sorting&&['add-items','remove-items','browse'].includes(request.kind))throw new Error('sorting-active');
      if(context.kind==='item')throw new Error('item-effect-not-ready'); // E installs effects after M1; never a generic write callback.
      switch(request.kind){
        case 'add-items':{
          if(request.claimId!==undefined&&(!/^[A-Za-z0-9#._:-]{1,64}$/.test(request.claimId)))throw new Error('invalid-claim-id');
          if(request.claimId&&own(game.claims,request.claimId)){next=game;result={claim:'already-claimed'};break;}
          next.inventory=addItems(game.inventory,request.itemId,request.quantity,catalogOf(content),inventoryPolicy(content,this.options.limits));
          if(request.claimId)setOwn(next.claims,request.claimId,{kind:'grant'});
          result={itemId:request.itemId,quantity:request.quantity};break;
        }
        case 'remove-items':
          if(request.ticket)this.checkTicket(token,request.ticket);
          if(request.ticket&&request.ticket.itemId!==request.itemId)throw new Error('stale-slot');
          next.inventory=removeItems(game.inventory,request.itemId,request.quantity,catalogOf(content));result={itemId:request.itemId,quantity:request.quantity};break;
        case 'change-money':next.money=changeMoney(game.money,request.amount,moneyCap(content,this.options.limits.money));result={money:next.money,actual:next.money-game.money};break;
        case 'set-badge':next=setBadge(game,request.index,request.owned);result={index:request.index,owned:request.owned};break;
        case 'browse':{
          const {pocket,index}=request;if(!Number.isInteger(pocket)||pocket<1||pocket>8||!Number.isInteger(index)||index<0||index>game.inventory.pockets[pocket-1]!.length)throw new Error('invalid-cursor');
          next.inventory.lastPocket=pocket;next.inventory.indices[pocket-1]=index;result={pocket,index};break;
        }
        default:throw new Error('unknown-inventory-request');
      }
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
    const changed=JSON.stringify(next)!==JSON.stringify(game);
    if(changed)try{this.options.install(next);}catch(error){return {status:'refused',reason:'commit-failed',error:message(error)};}
    const outcome:InventoryOutcome={status:changed?'committed':'unchanged',requestId,result};
    this.receipts.set(requestId,{fingerprint,outcome:clone(outcome)});
    return this.present(outcome,present);
  }
  private present(outcome:InventoryOutcome,present?: (outcome:InventoryOutcome)=>void):InventoryOutcome{
    try{present?.(clone(outcome));return {...clone(outcome),presentation:'ok'};}catch(error){return {...clone(outcome),presentation:'failed',error:message(error)};}
  }
  /** Runtime sorting intent contains a permutation, never a saved game snapshot. */
  beginSort(token:string,pocket:number,index:number,filtered=false):InventoryOutcome {
    try {
      const {game,content,context}=this.current(token);
      if(context.kind!=='bag'||filtered||this.filtering||this.sorting)throw new Error('sorting-disabled');
      moveInventorySlot(game.inventory,pocket,index,index,inventoryPolicy(content,this.options.limits));
      this.sorting={pocket,start:index,cursor:index,order:game.inventory.pockets[pocket-1]!.map((_,i)=>i),revision:String(this.revision)};
      return {status:'unchanged',result:{pocket,index}};
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
  }
  moveSort(token:string,to:number):InventoryOutcome {
    try {
      const {game,content}=this.current(token),sort=this.sorting;
      if(!sort||sort.revision!==String(this.revision))throw new Error('stale-sort');
      const next=clone(game);
      next.inventory=moveInventorySlot(game.inventory,sort.pocket,sort.cursor,to,inventoryPolicy(content,this.options.limits));
      next.inventory.indices[sort.pocket-1]=to;
      this.options.install(next);
      sort.order.splice(to,0,...sort.order.splice(sort.cursor,1));sort.cursor=to;sort.revision=String(this.revision);
      return {status:'committed',result:{index:to}};
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
  }
  endSort(token:string,cancel=false):InventoryOutcome {
    try {
      const {game}=this.current(token),sort=this.sorting;
      if(!sort||sort.revision!==String(this.revision)){this.sorting=null;throw new Error('stale-sort');}
      if(cancel){
        const next=clone(game),rows=next.inventory.pockets[sort.pocket-1]!;
        next.inventory.pockets[sort.pocket-1]=sort.order.map((original,current)=>({original,slot:rows[current]!})).sort((a,b)=>a.original-b.original).map(row=>row.slot);
        // Persistent browse index retains the last moved location; only the live UI cursor returns to start.
        this.options.install(next);
      }
      this.sorting=null;return {status:cancel?'committed':'unchanged',result:{index:cancel?sort.start:sort.cursor}};
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
  }
  hasBoxLink():boolean{
    const game=this.state.read(),catalog=catalogOf(this.content()),counts=aggregateBag(game.inventory);
    return Object.values(catalog).some(item=>hasFlag(item,'BoxLink')&&(own(counts,item.id)??0)>0);
  }
  queryUse(token:string,itemId:string,quantity:number,memberId?:string):{ready:false;eligible:'unknown'|'ineligible';reason:string}{
    try{
      const {game,content,context}=this.current(token),item=itemOf(catalogOf(content),itemId);
      if(!item)throw new Error('unknown-item');
      if(!Number.isSafeInteger(quantity)||quantity<1||item.effect?.family==='rare-candy'&&quantity!==1)throw new Error('invalid-quantity');
      const id=context.parent?.memberId??memberId;
      if(id!==undefined&&!game.party.some(m=>m.id===id&&!m.isEgg))throw new Error('invalid-target');
      return {ready:false,eligible:'unknown',reason:'not-ready'};
    }catch(error){return {ready:false,eligible:'ineligible',reason:reason(error)};}
  }
}
