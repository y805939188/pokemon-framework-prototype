/** WP24 money and the approved badge author-entry contract. No host time or randomness. */
import { resolveConfig } from './config.ts';
import type { Content } from './types.ts';
import { clone } from './value.ts';
import { safeAdd } from './inventory.ts';
import type { GameStats } from './stats.ts';

export const moneyCap = (content:Pick<Content,'settings'>|undefined,fallback:number):number => typeof content?.settings?.MAX_MONEY === 'number' ? resolveConfig(content.settings).MAX_MONEY : fallback;
export function writeMoney(value: number, cap: number): number {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(cap) || cap < 0) throw new Error('invalid-money');
  return Math.min(cap,Math.max(0,value));
}
export const changeMoney = (balance: number, delta: number, cap: number): number => writeMoney(safeAdd(balance,delta),cap);
export const badgeCount = (badges: readonly boolean[]): number => badges.filter(value => value === true).length;
export function hasBadge(badges: readonly boolean[], index: number): boolean {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 0xffffffff) throw new Error('invalid-badge-index');
  return badges[index] === true;
}
export function setBadge<T extends {badges:boolean[];stats:GameStats}>(state:T,index:number,owned:boolean):T {
  hasBadge(state.badges,index);
  if(typeof owned!=='boolean')throw new Error('invalid-badge-value');
  const next=clone(state),before=next.badges[index]===true;
  while(next.badges.length<=index)next.badges.push(false);
  next.badges[index]=owned;
  if(!before&&owned){
    while(next.stats.times_to_get_badges.length<=index)next.stats.times_to_get_badges.push(null);
    next.stats.times_to_get_badges[index]=next.stats.play_time;
  }
  return next;
}
