/** One bounded management session. Held plans contain movement intentions, never member/state snapshots. */
import type { GameStatePort } from './ports.ts';
import type { GameState } from '../rules/state.ts';
import type { Content } from '../rules/types.ts';
import type { Limits } from '../rules/limits.ts';
import { clone } from '../rules/value.ts';
import { locateMember, SPECIAL_WALLPAPERS } from '../rules/storage.ts';
import type { MemberPosition } from '../rules/storage.ts';
import { ManagementRefused, giveItem, heldDestination, moveMember, pickUp, placeHeld, referenced, releaseHeld, releaseMember, replayHeld, swapItems, takeItem } from '../rules/storage-operations.ts';
import type { HeldIntent, ItemDescriptor, MemberReference, MovementContext } from '../rules/storage-operations.ts';

export type ManagementRequest =
 | { kind:'move'; source:MemberReference; target:MemberPosition; expectedTargetId:string|null }
 | { kind:'release'; source:MemberReference; confirmed:boolean }
 | { kind:'pick-up'; source:MemberReference }
 | { kind:'place-held'; target:MemberPosition; expectedTargetId:string|null }
 | { kind:'store-held' | 'withdraw-held' | 'cancel-held' }
 | { kind:'release-held'; confirmed:boolean }
 | { kind:'nickname'; source:MemberReference; nickname:string|null }
 | { kind:'markings'; source:MemberReference; markings:number[] }
 | { kind:'sort-moves' | 'sort-ribbons'; source:MemberReference; from:number; to:number }
 | { kind:'current-box'; box:number }
 | { kind:'box-name'; box:number; name:string }
 | { kind:'wallpaper'; box:number; wallpaper:number }
 | { kind:'unlock-wallpaper'; wallpaper:number; unlocked:boolean }
 | { kind:'give-item'; source:MemberReference; item:string }
 | { kind:'take-item'; source:MemberReference }
 | { kind:'swap-items'; source:MemberReference; target:MemberReference };
export interface ManagementOutcome { status:'applied'|'unchanged'|'held'|'cancelled'|'refused'; reason?:string; error?:string; heldId?:string|null }
export interface ManagementOptions { limits:Limits; depositHeal:boolean; sourceAllowed:boolean; describeItem:(id:string)=>ItemDescriptor|null }

export class ManagementSession {
  private seq=0;
  private token:string|null=null;
  private held:HeldIntent|null=null;
  private readonly receipts=new Map<string,{fingerprint:string;outcome:ManagementOutcome}>();
  private readonly state:GameStatePort;
  private readonly content:()=>Content;
  private readonly options:ManagementOptions;
  constructor(state:GameStatePort,content:()=>Content,options:ManagementOptions) {this.state=state;this.content=content;this.options=options;}
  get active():boolean {return this.token!==null;}
  get saveBlocked():boolean {return this.held!==null;}
  invalidate():void {this.token=null;this.held=null;this.receipts.clear();}
  begin():string {if(this.token)throw new Error('management-active');this.token=`management:${++this.seq}`;this.receipts.clear();return this.token;}
  end(token:string):ManagementOutcome {if(token!==this.token)return {status:'refused',reason:'stale-operation'};if(this.held)return {status:'refused',reason:'member-held'};this.invalidate();return {status:'unchanged'};}
  private context():MovementContext {return {limits:this.options.limits,content:this.content(),depositHeal:this.options.depositHeal};}
  heldReference(token:string):MemberReference|null {
    if(token!==this.token||!this.held)return null;
    const game=this.state.read(),held=replayHeld(game,this.held,this.context()).held;
    const location=held?locateMember(game,held.id):null;
    return location?{id:location.member.id,position:clone(location.position)}:null;
  }
  execute(token:string,requestId:string,request:ManagementRequest):ManagementOutcome {
    if(token!==this.token||!token)return {status:'refused',reason:'stale-operation'};
    if(!requestId||requestId.length>64)return {status:'refused',reason:'invalid-request-id'};
    const fingerprint=JSON.stringify(request),old=this.receipts.get(requestId);
    if(old)return old.fingerprint===fingerprint?clone(old.outcome):{status:'refused',reason:'request-conflict'};
    if(this.receipts.size>=256){if(request.kind==='cancel-held'){this.held=null;return {status:'cancelled'};}return {status:'refused',reason:'session-request-limit'};}
    let outcome:ManagementOutcome;
    try {outcome=this.apply(request);}catch(error){outcome={status:'refused',reason:error instanceof ManagementRefused?error.reason:'invalid',error:String(error instanceof Error?error.message:error)};}
    this.receipts.set(requestId,{fingerprint,outcome:clone(outcome)});
    // Completed receipts are bounded; an evicted ID is never accepted again in this session.
    // At 256 requests the UI must close/reopen, so we retain every accepted ID until that boundary.
    return outcome;
  }
  private apply(request:ManagementRequest):ManagementOutcome {
    // Cancellation discards only an in-memory intention; failed world/content ports cannot prevent exit.
    if(request.kind==='cancel-held'){this.held=null;return {status:'cancelled'};}
    if((request.kind==='give-item'||request.kind==='swap-items')&&!this.options.sourceAllowed)throw new ManagementRefused('held-item-source-disabled');
    const game=this.state.read();let next:GameState=game;
    const context=this.context();
    switch(request.kind){
      case 'pick-up':if(this.held)throw new ManagementRefused('member-held');this.held=pickUp(game,request.source);return {status:'held',heldId:request.source.id};
      case 'place-held':case 'store-held':case 'withdraw-held': {
        if(!this.held)throw new ManagementRefused('nothing-held');
        const target=request.kind==='place-held'?request.target:heldDestination(game,this.held,request.kind==='store-held'?'box':'party',context);
        const expected=request.kind==='place-held'?request.expectedTargetId:null;
        const placed=placeHeld(game,this.held,target,expected,context);
        if(placed.next){this.state.replace(placed.next);this.held=null;return {status:'applied',heldId:null};}
        this.held=placed.intent;return {status:'held',heldId:placed.heldId};
      }
      case 'release-held':if(!this.held)throw new ManagementRefused('nothing-held');if(!request.confirmed)return {status:'cancelled'};next=releaseHeld(game,this.held,context);this.state.replace(next);this.held=null;return {status:'applied',heldId:null};
      case 'move':if(this.held)throw new ManagementRefused('member-held');next=moveMember(game,request.source,request.target,request.expectedTargetId,context);break;
      case 'release':if(this.held)throw new ManagementRefused('member-held');if(!request.confirmed)return {status:'cancelled'};next=releaseMember(game,request.source);break;
      case 'take-item':next=takeItem(game,request.source,this.options.limits);break;
      case 'give-item':next=giveItem(game,request.source,request.item,{limits:this.options.limits,sourceAllowed:this.options.sourceAllowed,describe:this.options.describeItem});break;
      case 'swap-items':next=swapItems(game,request.source,request.target,this.options.sourceAllowed);break;
      case 'nickname':case 'markings':case 'sort-moves':case 'sort-ribbons': {
        referenced(game,request.source);next=clone(game);const member=locateMember(next,request.source.id)!.member;
        if(request.kind==='nickname') {if(request.nickname!==null&&(typeof request.nickname!=='string'||Array.from(request.nickname).length>10))throw new ManagementRefused('invalid-name');member.nickname=request.nickname||null;}
        else if(request.kind==='markings') {if(request.markings.length>6||request.markings.some(n=>!Number.isSafeInteger(n)||n<0))throw new ManagementRefused('invalid-markings');member.markings=[...request.markings];}
        else {const list=request.kind==='sort-moves'?member.moves:member.ribbons!;if(![request.from,request.to].every(n=>Number.isInteger(n)&&n>=0&&n<list.length))throw new ManagementRefused('invalid-index');[list[request.from],list[request.to]]=[list[request.to]!,list[request.from]!];}
        break;
      }
      case 'current-box':case 'box-name':case 'wallpaper': {
        if(!Number.isInteger(request.box)||request.box<0||request.box>=40)throw new ManagementRefused('invalid-box');next=clone(game);
        if(request.kind==='current-box')next.storage.currentBox=request.box;
        else if(request.kind==='box-name'){if(typeof request.name!=='string'||Array.from(request.name).length>12)throw new ManagementRefused('invalid-name');if(!request.name)return {status:'unchanged'};next.storage.boxes[request.box]!.name=request.name;}
        else {if(!Number.isInteger(request.wallpaper)||request.wallpaper<0||request.wallpaper>=40||(request.wallpaper>=16&&!next.storage.unlockedWallpapers.includes(request.wallpaper)))throw new ManagementRefused('wallpaper-locked');next.storage.boxes[request.box]!.wallpaper=request.wallpaper;}
        break;
      }
      case 'unlock-wallpaper': {
        if(!SPECIAL_WALLPAPERS.includes(request.wallpaper))throw new ManagementRefused('invalid-wallpaper');next=clone(game);const values=new Set(next.storage.unlockedWallpapers);if(request.unlocked)values.add(request.wallpaper);else values.delete(request.wallpaper);next.storage.unlockedWallpapers=[...values].sort((a,b)=>a-b);break;
      }
      default: throw new ManagementRefused('invalid-operation');
    }
    if(next===game||JSON.stringify(next)===JSON.stringify(game))return {status:'unchanged'};
    this.state.replace(next);return {status:'applied'};
  }
}
