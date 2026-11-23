/** Shared plain-data capture for the two explicit scripted wild inputs. It grants no runtime permission. */
import { captureInitialField } from '../rules/initial-field';
import type { BattleStartRequest } from './ports';
const FLAGS = ['noRun','noBall','canSwitch','expGain','canLose','moneyGain','forceParty'] as const;
const COMMON = ['battleId','seq','initialField','battleStyle',...FLAGS];
export function scriptedWildData(input: unknown, specific: readonly string[], label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error(label+'-request-data-required');
  const proto=Object.getPrototypeOf(input),ctor=proto&&Object.getOwnPropertyDescriptor(proto,'constructor');
  if(proto!==null&&proto!==Object.prototype&&!(Object.getPrototypeOf(proto)===null&&ctor&&'value'in ctor&&typeof ctor.value==='function'&&Function.prototype.toString.call(ctor.value)===Function.prototype.toString.call(Object)))throw Error(label+'-request-data-required');
  const raw:Record<string,unknown>={};
  for(const key of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,key);if(typeof key!=='string'||![...COMMON,...specific].includes(key)||!d||!d.enumerable||!('value'in d))throw Error(label+'-request-data-required');Object.defineProperty(raw,key,{value:d.value,enumerable:true});}
  return raw;
}
export function scriptedWildRequest(raw:Record<string,unknown>,species:string,level:number,label:string):BattleStartRequest{
  if(typeof raw.battleId!=='string'||!raw.battleId.length||typeof raw.seq!=='number'||!Number.isSafeInteger(raw.seq)||raw.seq<0)throw Error(label+'-request-identity-invalid');
  const initialField=captureInitialField(raw),request:BattleStartRequest={battleId:raw.battleId,seq:raw.seq,kind:'wild',foes:[{species,level}],...(initialField?{initialField}:{})};
  for(const key of FLAGS){if(raw[key]===undefined)continue;if(typeof raw[key]!=='boolean')throw Error(`${label}-${key}-invalid`);request[key]=raw[key];}
  if(raw.battleStyle!==undefined){if(raw.battleStyle!=='switch'&&raw.battleStyle!=='set')throw Error(label+'-battleStyle-invalid');request.battleStyle=raw.battleStyle;}
  return request;
}
export function scriptedWildFlags(request:BattleStartRequest):Omit<BattleStartRequest,'kind'|'foes'|'trainer'> {
  const accepted:Omit<BattleStartRequest,'kind'|'foes'|'trainer'>={battleId:request.battleId,seq:request.seq,...(request.initialField?{initialField:request.initialField}:{}),...(request.battleStyle?{battleStyle:request.battleStyle}:{})};
  for(const key of FLAGS)if(request[key]!==undefined)accepted[key]=request[key];return accepted;
}
