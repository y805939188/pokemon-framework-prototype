/** Process-local operation ownership, selection revisions and bounded completed receipts. No persistent journal. */
import {planItemUse,itemReadiness,itemUseLimit} from '../rules/item-effects.ts';
import type {ItemAnswers,ItemIntent,ItemWorldContext} from '../rules/item-effects.ts';
import {planShop,filterShopStock,shopQuote,updatePrice,assertMutableStock} from '../rules/shop.ts';
import type {ShopContext,ShopIntent} from '../rules/shop.ts';
import { clone } from '../rules/value.ts';
import { semanticFingerprint } from '../rules/semantic.ts';
import { addItems, aggregateBag, inventoryPolicy, moveInventorySlot, positiveQuantity, removeItems, itemQuantity } from '../rules/inventory.ts';
import { catalogOf, hasFlag, importantItem, itemOf } from '../rules/item-catalog.ts';
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
  | {kind:'browse';pocket:number;index:number}
  | ({kind:'use-item';answers?:ItemAnswers;ticket?:InventoryTicket}&ItemIntent)
  | ShopIntent;
export interface InventoryOutcome { status:'committed'|'duplicate'|'unchanged'|'refused'|'pending'|'cancelled'|'selected';requestId?:string;reason?:string;error?:string;presentation?:'ok'|'failed';result?:Record<string,unknown> }
interface Context { token:string;generation:number;contentRevision:string;kind:'bag'|'item'|'shop';parent?:InventoryParent;parentPartyIndex?:number }
interface Options { world?:()=>ItemWorldContext;variables?:{count:()=>number;write:(id:number,value:string)=>void};limits:Limits;generation:()=>number;enter:(parent?:InventoryParent)=>void;leave:(parent?:InventoryParent)=>void;install:(next:GameState)=>void }
const message=(error:unknown):string=>error instanceof Error?error.message:String(error);
const reason=(error:unknown):string=>typeof error==='object'&&error!==null&&'reason'in error?String(error.reason):message(error);

export class InventorySession {
  private readonly state:GameStatePort;
  private readonly content:()=>Content;
  private readonly options:Options;
  private context:Context|null=null;
  private learningChild=false;
  private sorting:{pocket:number;start:number;cursor:number;order:number[];revision:string}|null=null;
  private filtering=false;
  private readingProjection=false;
  private shop:ShopContext|null=null;
  private pendingUse:{requestId:string;fingerprint:string;revision:string;world:string;learning:boolean;stale:boolean}|null=null;
  private effectRevision=0n;
  private starting:{generation:number}|null=null;
  private observedEffect='';
  private selectionSequence=0n;
  private selection:{id:string;filter?:((item:ItemDefinition)=>boolean);variableId?:number;lastPocket:number;indices:number[]}|null=null;
  private tossPending:{token:string;requestId:string}|null=null;
  private sequence=0n;
  private revision=0n;
  private observedInventory='';
  private readonly receipts=new Map<string,{fingerprint:string;outcome:InventoryOutcome}>();
  constructor(state:GameStatePort,content:()=>Content,options:Options){this.state=state;this.content=content;this.options=options;}
  get active():boolean{return this.context!==null||this.starting!==null;}
  get saveBlocked():boolean{return !!this.starting||this.learningChild||this.context?.kind==='item'||!!this.pendingUse||!!this.tossPending;}
  reserveLearning(token:string,memberId:string,entry:'bag'|'party'):void {
    const context=this.context;
    if(!context||context.token!==token||context.generation!==this.options.generation())throw new Error('stale-operation');
    if(this.learningChild||this.pendingUse||this.selection||this.tossPending||this.sorting||this.readingProjection||context.kind==='shop')throw new Error('inventory-operation-pending');
    if(entry!==(context.parent?'party':'bag')||context.parent&&context.parent.memberId!==memberId)throw new Error('invalid-machine-entry');
    this.learningChild=true;
  }
  releaseLearning(token:string):void {if(this.context?.token===token)this.learningChild=false;}
  owns(token:string):boolean {return this.context?.token===token&&this.context.generation===this.options.generation();}
  reserveEvolution(token:string,memberId:string):void {this.reserveLearning(token,memberId,this.context?.parent?'party':'bag');}
  private contentRevision(content:Content):string{return semanticFingerprint(clone(content));}
  private itemWorld():ItemWorldContext {
    const world=clone(this.options.world?.()??{});
    // Every actual world observation, including a read-only eligibility query, retires
    // the old authority on change. Observing the original values again cannot renew it.
    if(this.pendingUse&&this.pendingUse.world!==semanticFingerprint(world))this.pendingUse.stale=true;
    return world;
  }
  stateChanged(next:GameState):void{const effect=JSON.stringify([next.party,next.inventory.pockets]);if(effect!==this.observedEffect){this.effectRevision++;this.observedEffect=effect;}const value=JSON.stringify(next.inventory.pockets);if(value!==this.observedInventory){this.revision++;this.observedInventory=value;}}
  invalidate():void{const parent=this.context?.parent;this.context=null;this.starting=null;this.learningChild=false;this.shop=null;this.pendingUse=null;this.selection=null;this.tossPending=null;this.sorting=null;this.filtering=false;this.receipts.clear();this.options.leave(parent);}
  begin(kind:'bag'|'item'|'shop'='bag',parent?:InventoryParent):string{
    if(this.active)throw new Error('inventory-operation-active');
    if(!['bag','item','shop'].includes(kind)||parent&&kind!=='item')throw new Error('invalid-operation-context');
    parent=parent?clone(parent):undefined;
    const reservation={generation:this.options.generation()};this.starting=reservation;let entered=false;
    try {
      this.options.enter(parent);entered=true;
      const game=this.state.read(),content=this.content();
      if(this.starting!==reservation||reservation.generation!==this.options.generation())throw new Error('stale-operation');
      if(parent&&!game.party.some(m=>m.id===parent.memberId&&!m.isEgg))throw new Error('invalid-target');
      for(const pocket of game.inventory.pockets)for(const slot of pocket)if(!itemOf(catalogOf(content),slot.itemId))throw new Error('unmapped-item');
      const revision=this.contentRevision(content);this.stateChanged(game);
      const token=`inventory:${reservation.generation}:${++this.sequence}`;
      this.context={token,generation:reservation.generation,contentRevision:revision,kind,...(parent?{parent:clone(parent),parentPartyIndex:game.party.findIndex(m=>m.id===parent.memberId)}:{})};this.receipts.clear();return token;
    } catch(error) {if(entered)this.options.leave(parent);throw error;}
    finally {if(this.starting===reservation)this.starting=null;}
  }
  end(token:string):InventoryOutcome{
    if(this.readingProjection)return {status:'refused',reason:'projection-active'};
    if(this.learningChild)return {status:'refused',reason:'child-operation-active'};
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
    if(context.parent&&(game.party[context.parentPartyIndex!]?.id!==context.parent.memberId||game.party[context.parentPartyIndex!]?.isEgg))throw new Error('stale-target');
    return {game,content,context};
  }
  snapshot(token:string,filter?:(item:ItemDefinition)=>boolean):{pockets:{item:ItemDefinition;quantity:number;index:number}[][];lastPocket:number;indices:number[];revision:string}{
    if(this.readingProjection)throw new Error('projection-active');
    const {game,content}=this.current(token),catalog=catalogOf(content);
    this.filtering=!!filter;
    this.readingProjection=true;
    try{const pockets=game.inventory.pockets.map(pocket=>pocket.flatMap((slot,index)=>{
      const item=itemOf(catalog,slot.itemId);if(!item)throw new Error('unmapped-item');
      const matches=filter?filter(clone(item)):true;if(typeof matches!=='boolean')throw new Error('invalid-filter-result');
      return matches?[{item:clone(item),quantity:slot.quantity,index}]:[];
    }));
    this.current(token);
    return clone({pockets,lastPocket:game.inventory.lastPocket,indices:game.inventory.indices,revision:String(this.revision)});
    }finally{this.readingProjection=false;}
  }
  quantity(token:string,itemId:string):number { const {game,content}=this.current(token);return itemQuantity(game.inventory,itemId,catalogOf(content)); }
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
      if(this.readingProjection)throw new Error('projection-active');
      if(this.learningChild)throw new Error('child-operation-active');
      data=this.current(token);
      if(typeof requestId!=='string'||!requestId||requestId.length>64)throw new Error('invalid-request-id');
      fingerprint=semanticFingerprint(request);
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
    const old=this.receipts.get(requestId);
    if(old){if(old.fingerprint!==fingerprint)return {status:'refused',reason:'request-conflict'};return this.present({...clone(old.outcome),status:'duplicate'},present);}
    if(this.receipts.size>=256)return {status:'refused',reason:'session-request-limit'};
    const {game,content,context}=data;let next=clone(game),result:Record<string,unknown>;
    try{
      if(this.selection||this.tossPending)throw new Error('operation-pending');
      if(this.pendingUse&&(request.kind!=='use-item'||this.pendingUse.requestId!==requestId))throw new Error('item-pending');
      if(this.sorting&&['add-items','remove-items','browse','use-item','buy','sell'].includes(request.kind))throw new Error('sorting-active');
      if(context.kind==='item'&&request.kind!=='use-item')throw new Error('item-context-only');
      switch(request.kind){
        case 'use-item':{
          if(context.kind==='shop')throw new Error('wrong-operation');if(request.ticket)this.checkTicket(token,request.ticket);if(request.ticket&&request.ticket.itemId!==request.itemId)throw new Error('stale-slot');if(context.parent&&request.memberId!==undefined&&request.memberId!==context.parent.memberId)throw new Error('invalid-target');
          const {answers,...base}=request,world=this.itemWorld(),identity=semanticFingerprint(base),revision=String(this.effectRevision),worldRevision=semanticFingerprint(world);
          if(JSON.stringify(this.current(token).game)!==JSON.stringify(game))throw new Error('stale-item-selection');
          // A changed base intent cannot cancel its existing learning owner. Related edits retire
          // this selection permanently until the operation closes, even if world values later return (ABA).
          if(this.pendingUse&&(this.pendingUse.stale||this.pendingUse.revision!==revision||this.pendingUse.world!==worldRevision)){this.pendingUse.stale=true;throw new Error('stale-item-selection');}
          if(this.pendingUse&&this.pendingUse.fingerprint!==identity)throw new Error('stale-item-selection');
          if(this.pendingUse?.learning&&(answers?.cancelled===true||answers?.confirmed===false))throw new Error('learning-choice-required');
          const planned=planItemUse(game,content,{itemId:request.itemId,quantity:request.quantity,...(context.parent?.memberId??request.memberId?{memberId:context.parent?.memberId??request.memberId}:{})},answers,world);
          if(planned.status==='pending'){this.pendingUse={requestId,fingerprint:identity,revision,world:worldRevision,learning:planned.selection.kind==='learn'||planned.selection.kind==='give-up',stale:false};return {status:'pending',requestId,result:{selection:clone(planned.selection)}};}
          if(planned.status==='cancelled'){this.pendingUse=null;return {status:'cancelled',requestId};}next=planned.state;result={...planned.result};break;
        }
        case 'buy':case 'sell':{if(context.kind!=='shop'||!this.shop)throw new Error('shop-not-open');const planned=planShop(game,content,this.shop,request,this.options.limits);if(planned.status==='cancelled')return {status:'cancelled',requestId};if(planned.status==='pending')return {status:'pending',requestId,result:{quote:planned.quote}};next=planned.state;result=planned.result;break;}
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
    // Validate the caller-owned stock before installing resources. No fallible catalog work follows replace.
    let filteredStock:string[]|undefined;
    try{if(this.shop){assertMutableStock(this.shop.stock);filteredStock=[...this.shop.stock];filterShopStock(next,content,filteredStock);}}
    catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
    const changed=JSON.stringify(next)!==JSON.stringify(game);
    if(changed)try{this.options.install(next);}catch(error){return {status:'refused',reason:'commit-failed',error:message(error)};}
    this.pendingUse=null;
    const outcome:InventoryOutcome={status:changed?'committed':'unchanged',requestId,result};
    this.receipts.set(requestId,{fingerprint,outcome:clone(outcome)});
    // The session takes ownership of an ordinary mutable array; invalid/frozen arrays are rejected at entry.
    if(this.shop&&filteredStock)try{this.shop.stock.splice(0,this.shop.stock.length,...filteredStock);}catch(error){return {...outcome,presentation:'failed',error:`stock-update-failed: ${message(error)}`};}
    return this.present(outcome,present);
  }
  private present(outcome:InventoryOutcome,present?: (outcome:InventoryOutcome)=>void):InventoryOutcome{
    try{present?.(clone(outcome));return {...clone(outcome),presentation:'ok'};}catch(error){return {...clone(outcome),presentation:'failed',error:message(error)};}
  }
  configureShop(token:string,input:{shopId?:string;stock?:string[];allowSell?:boolean}):void {
    const {game,content,context}=this.current(token);if(context.kind!=='shop')throw new Error('wrong-operation');if(this.shop)throw new Error('shop-already-open');
    if(!input||typeof input!=='object'||Array.isArray(input)||input.allowSell!==undefined&&typeof input.allowSell!=='boolean'||input.shopId!==undefined&&(typeof input.shopId!=='string'||!input.shopId||input.stock!==undefined))throw new Error('invalid-shop');
    const definition=input.shopId?own(content.shops,input.shopId):undefined;if(input.shopId&&!definition)throw new Error('unknown-shop');
    const stock=definition?[...definition.stock]:input.stock;assertMutableStock(stock);if(stock.some(id=>typeof id!=='string'||!itemOf(catalogOf(content),id)))throw new Error('invalid-stock');
    const shop:ShopContext={stock,allowSell:input.allowSell??definition?.allowSell??true,overrides:clone(definition?.overrides??{}),revision:0};filterShopStock(game,content,shop.stock);this.shop=shop;
  }
  shopView(token:string):{stock:string[];allowSell:boolean;revision:number}{const {game,content}=this.current(token);if(!this.shop)throw new Error('shop-not-open');filterShopStock(game,content,this.shop.stock);return clone({stock:this.shop.stock,allowSell:this.shop.allowSell,revision:this.shop.revision});}
  quote(token:string,itemId:string,selling=false){const {game,content}=this.current(token);if(!this.shop)throw new Error('shop-not-open');return shopQuote(game,content,this.shop,itemId,selling,this.options.limits);}
  setPrices(token:string,itemId:string,buy:number,sell?:number):void {const {content}=this.current(token);if(!this.shop)throw new Error('shop-not-open');if(!itemOf(catalogOf(content),itemId))throw new Error('unknown-item');setOwn(this.shop.overrides,itemId,updatePrice(own(this.shop.overrides,itemId),buy,sell));this.shop.revision++;}
  clearPrices(token:string):void{this.current(token);if(!this.shop)throw new Error('shop-not-open');this.shop.overrides={};this.shop.revision++;}
  beginSelection(token:string,filter?:(item:ItemDefinition)=>boolean,variableId?:number):string {
    const {game,context}=this.current(token);if(context.kind!=='bag'||this.learningChild||this.selection||this.pendingUse||this.sorting||this.tossPending||this.readingProjection)throw new Error('selection-unavailable');
    if(filter!==undefined&&typeof filter!=='function')throw new Error('invalid-filter');
    if(variableId!==undefined&&(!this.options.variables||!Number.isInteger(variableId)||variableId<1||variableId>this.options.variables.count()))throw new Error('invalid-variable');
    this.snapshot(token,filter);const id=`${token}:select:${++this.selectionSequence}`;this.selection={id,filter,variableId,lastPocket:filter?1:game.inventory.lastPocket,indices:filter?Array(8).fill(0) as number[]:[...game.inventory.indices]};return id;
  }
  selectionView(token:string,selectionId:string){if(this.selection?.id!==selectionId)throw new Error('stale-selection');const view=this.snapshot(token,this.selection.filter);return {...view,lastPocket:this.selection.lastPocket,indices:[...this.selection.indices]};}
  selectionBrowse(token:string,selectionId:string,pocket:number,index:number):void {if(this.readingProjection)throw new Error('projection-active');const view=this.selectionView(token,selectionId);if(!Number.isInteger(pocket)||pocket<1||pocket>8||!Number.isInteger(index)||index<0||index>view.pockets[pocket-1]!.length)throw new Error('invalid-cursor');this.selection!.lastPocket=pocket;this.selection!.indices[pocket-1]=index;}
  finishSelection(token:string,selectionId:string,requestId:string,itemId:string|null):InventoryOutcome {
    try{if(this.readingProjection)throw new Error('projection-active');this.current(token);if(typeof requestId!=='string'||!requestId||requestId.length>64)throw new Error('invalid-request-id');const fingerprint=semanticFingerprint({kind:'select-item',selectionId,itemId}),old=this.receipts.get(requestId);if(old)return old.fingerprint===fingerprint?{...clone(old.outcome),status:'duplicate'}:{status:'refused',reason:'request-conflict'};
      if(this.receipts.size>=256)throw new Error('session-request-limit');const selection=this.selection;if(selection?.id!==selectionId)throw new Error('stale-selection');const view=this.selectionView(token,selectionId);if(itemId!==null&&!view.pockets.flat().some(row=>row.item.id===itemId&&row.quantity>0))throw new Error('invalid-selection');
      if(selection.variableId!==undefined){if(!this.options.variables||selection.variableId>this.options.variables.count())throw new Error('invalid-variable');this.options.variables.write(selection.variableId,itemId??'');this.current(token);if(this.selection!==selection)throw new Error('stale-selection');}
      const outcome:InventoryOutcome={status:itemId===null?'cancelled':'selected',result:{status:itemId===null?'cancelled':'selected',itemId:itemId??''}};this.receipts.set(requestId,{fingerprint,outcome:clone(outcome)});this.selection=null;this.filtering=false;return outcome;
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
  }
  async toss(token:string,requestId:string,itemId:string,quantity:number,ticket:InventoryTicket,confirmed:boolean,before:(details:{itemId:string;quantity:number})=>void|Promise<void>,present?:(outcome:InventoryOutcome)=>void):Promise<InventoryOutcome>{
    const request:InventoryRequest={kind:'remove-items',itemId,quantity,ticket};
    try{const {game,content,context}=this.current(token);if(context.kind!=='bag'||this.learningChild||this.selection||this.pendingUse||this.sorting||this.tossPending||this.readingProjection)throw new Error('operation-pending');if(typeof confirmed!=='boolean')throw new Error('invalid-confirmation');if(!confirmed)return {status:'cancelled'};if(typeof requestId!=='string'||!requestId||requestId.length>64)throw new Error('invalid-request-id');const old=this.receipts.get(requestId);if(old)return this.execute(token,requestId,request,present);if(this.receipts.size>=256)throw new Error('session-request-limit');const item=itemOf(catalogOf(content),itemId);if(!item||importantItem(item))throw new Error('cannot-toss');this.checkTicket(token,ticket);if(ticket.itemId!==itemId)throw new Error('stale-slot');positiveQuantity(quantity);removeItems(game.inventory,itemId,quantity,catalogOf(content));const pending={token,requestId};this.tossPending=pending;
      try{await before({itemId,quantity});}catch(error){return {status:'refused',reason:'pre-message-failed',error:message(error)};}finally{if(this.tossPending===pending)this.tossPending=null;}
      return this.execute(token,requestId,request,present);
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
  }
  /** Runtime sorting intent contains a permutation, never a saved game snapshot. */
  beginSort(token:string,pocket:number,index:number,filtered=false):InventoryOutcome {
    try {
      const {game,content,context}=this.current(token);
      if(context.kind!=='bag'||this.learningChild||filtered||this.filtering||this.sorting||this.pendingUse||this.selection||this.tossPending||this.readingProjection)throw new Error('sorting-disabled');
      moveInventorySlot(game.inventory,pocket,index,index,inventoryPolicy(content,this.options.limits));
      if(game.inventory.pockets[pocket-1]!.length<2)throw new Error('sorting-disabled');
      this.sorting={pocket,start:index,cursor:index,order:game.inventory.pockets[pocket-1]!.map((_,i)=>i),revision:String(this.revision)};
      return {status:'unchanged',result:{pocket,index}};
    }catch(error){return {status:'refused',reason:reason(error),error:message(error)};}
  }
  moveSort(token:string,to:number):InventoryOutcome {
    try {
      if(this.readingProjection)throw new Error('projection-active');
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
      if(this.readingProjection)throw new Error('projection-active');
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
  queryUse(token:string,itemId:string,quantity:number,memberId?:string):{ready:boolean;eligible:'eligible'|'unknown'|'ineligible';reason:string;maximum?:number}{
    let ready=false;
    try{
      const {game,content,context}=this.current(token);
      if(!itemReadiness(content,itemId))return {ready:false,eligible:'unknown',reason:'not-ready'};
      ready=true;positiveQuantity(quantity);
      const family=itemOf(catalogOf(content),itemId)!.effect!.family;
      if(family==='rare-candy'&&quantity!==1)throw new Error('invalid-quantity');
      if(context.parent&&memberId!==undefined&&memberId!==context.parent.memberId)throw new Error('invalid-target');
      const target=context.parent?.memberId??memberId;
      if(!target&&family!=='sacred-ash')return {ready:true,eligible:'unknown',reason:'target-required'};
      const world=this.itemWorld(),intent={itemId,quantity,...(target?{memberId:target}:{})};
      const planned=planItemUse(game,content,intent,{confirmed:true},world),maximum=itemUseLimit(game,content,intent,world);
      if(planned.status==='pending'&&planned.selection.kind==='move'){
        const moves=game.party.find(m=>m.id===target)?.moves??[];
        const canUse=moves.some((_,moveIndex)=>{try{return planItemUse(game,content,intent,{confirmed:true,moveIndex},world).status==='ready';}catch{return false;}});
        if(!canUse)return {ready:true,eligible:'ineligible',reason:'no-effect',maximum};
      }
      return {ready:true,eligible:'eligible',reason:planned.status==='pending'?'selection-required':'ready',maximum};
    }catch(error){const why=reason(error);return {ready:ready&&why!=='evolution-not-ready',eligible:ready&&why!=='evolution-not-ready'?'ineligible':'unknown',reason:why};}
  }
}
