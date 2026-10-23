/** Money-shop planning. Stock aliases and price slots are process-local; resources install atomically. */
import {clone} from './value.ts';
import {catalogOf,hasFlag,importantItem,itemOf} from './item-catalog.ts';
import {addItems,capacityFor,inventoryPolicy,itemQuantity,positiveQuantity,removeItems,safeAdd} from './inventory.ts';
import {changeMoney,moneyCap} from './economy.ts';
import {bumpStat} from './stats.ts';
import type {GameState} from './state.ts';
import type {Content} from './types.ts';
import type {Limits} from './limits.ts';
export interface PriceSlots {buy:number;sell:number}
export interface ShopContext {stock:string[];allowSell:boolean;overrides:Record<string,PriceSlots>;revision:number}
export interface ShopIntent {kind:'buy'|'sell';itemId:string;quantity:number;confirmed?:boolean;expectedPrice?:number;expectedRevision?:number}
const reject=(why:string):never=>{throw new Error(why);};
/** A script transfers an ordinary mutable session array. Catalog entries are copied before this seam. */
export function assertMutableStock(stock:unknown):asserts stock is string[] {
 if(!Array.isArray(stock)||!Object.isExtensible(stock)||!Object.getOwnPropertyDescriptor(stock,'length')?.writable||Object.keys(stock).some(k=>{const d=Object.getOwnPropertyDescriptor(stock,k);return !d?.writable||!d.configurable;}))return reject('invalid-stock');
}
export function updatePrice(previous:PriceSlots|undefined,buy:number,sell?:number):PriceSlots {
 if(!Number.isSafeInteger(buy)||sell!==undefined&&!Number.isSafeInteger(sell))return reject('invalid-price');const next={...(previous??{buy:-1,sell:-1})};if(buy>0)next.buy=buy;if(sell!==undefined&&sell>=0){if(!Number.isSafeInteger(sell*2))return reject('integer-overflow');next.sell=sell*2;}else if(buy>0)next.sell=buy;return next;
}
export function shopPrice(c:Content,shop:ShopContext,id:string,selling=false):number {const item=itemOf(catalogOf(c),id);if(!item)return reject('unknown-item');const over=Object.hasOwn(shop.overrides,id)?shop.overrides[id]:undefined;return selling?(over&&over.sell>=0?over.sell:item.sellPrice):(over&&over.buy>0?over.buy:item.price);}
/** Required alias semantics: mutate the caller-owned session array, never a catalog's stock. */
export function filterShopStock(game:GameState,c:Content,stock:string[]):void {const catalog=catalogOf(c);for(let i=stock.length-1;i>=0;i--){const item=itemOf(catalog,stock[i]!);if(!item)return reject('unknown-item');if(importantItem(item)&&itemQuantity(game.inventory,item.id,catalog)>0)stock.splice(i,1);}}
export function shopQuote(game:GameState,c:Content,shop:ShopContext,id:string,selling:boolean,limits:Limits):{price:number;maximum:number;revision:number}{
 const catalog=catalogOf(c),item=itemOf(catalog,id);if(!item)return reject('unknown-item');const price=shopPrice(c,shop,id,selling);if(selling){if(!shop.allowSell||importantItem(item)||price<=0)return reject('not-sellable');return {price,maximum:itemQuantity(game.inventory,id,catalog),revision:shop.revision};}if(!shop.stock.includes(id)||importantItem(item)&&itemQuantity(game.inventory,id,catalog)>0)return reject('not-in-stock');return {price,maximum:importantItem(item)?(game.money>=price?1:0):Math.min(inventoryPolicy(c,limits).perSlot,price===0?Number.MAX_SAFE_INTEGER:Math.floor(game.money/price)),revision:shop.revision};
}
export function planShop(game:GameState,c:Content,shop:ShopContext,intent:ShopIntent,limits:Limits):{status:'cancelled'}|{status:'pending';quote:ReturnType<typeof shopQuote>}|{status:'ready';state:GameState;result:Record<string,string|number>} {
 if(!['buy','sell'].includes(intent.kind)||intent.confirmed!==undefined&&typeof intent.confirmed!=='boolean'||intent.expectedPrice!==undefined&&(!Number.isSafeInteger(intent.expectedPrice)||intent.expectedPrice<0)||intent.expectedRevision!==undefined&&(!Number.isSafeInteger(intent.expectedRevision)||intent.expectedRevision<0))return reject('invalid-shop-request');
 if(intent.confirmed===false)return {status:'cancelled'};positiveQuantity(intent.quantity);const selling=intent.kind==='sell',quote=shopQuote(game,c,shop,intent.itemId,selling,limits);
 if(intent.expectedPrice!==undefined&&intent.expectedPrice!==quote.price||intent.expectedRevision!==undefined&&intent.expectedRevision!==quote.revision)return reject('stale-price');if(intent.quantity>quote.maximum)return reject(selling?'not-enough-items':'purchase-limit');if(intent.confirmed!==true)return {status:'pending',quote};
 const total=quote.price*intent.quantity;if(!Number.isSafeInteger(total))return reject('integer-overflow');const next=clone(game),catalog=catalogOf(c),item=itemOf(catalog,intent.itemId)!;let bonus=0;
 if(selling){next.inventory=removeItems(next.inventory,item.id,intent.quantity,catalog);next.money=changeMoney(game.money,total,moneyCap(c,limits.money));if(next.money<game.money)return reject('income-policy-decision-required');next.stats=bumpStat(next.stats,'money_earned_at_marts',next.money-game.money);}
 else{
  if(game.money<total)return reject('not-enough-money');next.inventory=addItems(next.inventory,item.id,intent.quantity,catalog,inventoryPolicy(c,limits));next.money=changeMoney(game.money,-total,moneyCap(c,limits.money));next.stats=bumpStat(next.stats,'money_spent_at_marts',total);next.stats=bumpStat(next.stats,'mart_items_bought',intent.quantity);
  const generous=(c.settings?.MORE_BONUS_PREMIER_BALLS??true)===true;const premier=Object.values(catalog).find(x=>x.id.toLowerCase()==='premierball'||hasFlag(x,'PremierBall'));const balls=hasFlag(item,'PokeBall');const ordinaryBall=item.id.toLowerCase()==='pokeball'||item.battleId==='pokeball';const count=intent.quantity>=10&&balls?(generous?Math.floor(intent.quantity/10):ordinaryBall?1:0):0;
  if(premier&&count){bonus=Math.min(count,capacityFor(next.inventory,premier.id,catalog,inventoryPolicy(c,limits)));if(bonus)next.inventory=addItems(next.inventory,premier.id,bonus,catalog,inventoryPolicy(c,limits));next.stats=bumpStat(next.stats,'premier_balls_earned',bonus);}
 }
 return {status:'ready',state:next,result:{itemId:item.id,quantity:intent.quantity,price:quote.price,total,money:next.money,actualMoney:next.money-game.money,bonus}};
}
