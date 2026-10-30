/** Portable strategy port. Implementations receive only detached public values and AI random. */
import type { DecisionPlan, TrainerAiSnapshot, RandomN } from './trainer-ai';
export type StrategyValue = null | boolean | number | string | readonly StrategyValue[] | { readonly [key:string]:StrategyValue };
export type StrategyParameters = { readonly [key:string]:StrategyValue };
export interface TrainerAiStrategyReference { id:string; version?:string; parameters:StrategyParameters }
export interface TrainerAiStrategy {
  /** Batch 1 executes synchronous implementations. Promise scheduling is a later, separately gated batch. */
  decide(snapshot:TrainerAiSnapshot, parameters:StrategyParameters, random:RandomN):DecisionPlan;
}
export function freezeStrategyData<T>(value:T):T {
  if(value && typeof value==='object'){for(const v of Object.values(value))freezeStrategyData(v);Object.freeze(value);}return value;
}
/** Descriptor-only JSON copy, with finite size/depth and no getters, sparse arrays or aliases to the caller. */
export function copyStrategyData(value:unknown, maxBytes=8192, maxDepth=8):StrategyValue {
  const parents=new Set<object>();let nodes=maxBytes;
  const fail=():never=>{throw new Error('trainer-ai-invalid-data');};
  const visit=(v:unknown,depth:number):StrategyValue=>{
    if(--nodes<0||depth>maxDepth) return fail();
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='string'){if(v.length>maxBytes)return fail();return v;}
    if(typeof v==='number'){if(!Number.isFinite(v))return fail();return v;}
    if(!v||typeof v!=='object'||parents.has(v))return fail();
    const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
    if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)return fail();
    parents.add(v);const keys=Reflect.ownKeys(v);let result:StrategyValue;
    if(array){
      const length=Object.getOwnPropertyDescriptor(v,'length')?.value as unknown;
      if(typeof length!=='number'||!Number.isSafeInteger(length)||length>maxBytes||keys.length!==length+1)return fail();
      const out:StrategyValue[]=[];
      for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value'in d)||!d.enumerable)return fail();out.push(visit(d.value,depth+1));}result=out;
    }else{
      const out:Record<string,StrategyValue>={};
      for(const key of keys){if(typeof key!=='string')return fail();const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!('value'in d)||!d.enumerable)return fail();Object.defineProperty(out,key,{value:visit(d.value,depth+1),enumerable:true});}result=out;
    }
    parents.delete(v);return result;
  };
  const out=visit(value,0),json=JSON.stringify(out);let bytes=0;
  for(const ch of json){const n=ch.codePointAt(0)!;bytes+=n<128?1:n<2048?2:n<65536?3:4;if(bytes>maxBytes)return fail();}
  return out;
}
export function strategyReference(value:unknown):TrainerAiStrategyReference {
  const x=copyStrategyData(value) as Record<string,StrategyValue>;
  if(!x||Array.isArray(x)||typeof x!=='object'||Object.keys(x).some(k=>!['id','version','parameters'].includes(k))||
    typeof x.id!=='string'||!/^[a-z][a-z0-9-]{0,62}$/.test(x.id)||
    (Object.hasOwn(x,'version')&&(typeof x.version!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(x.version)))||
    !x.parameters||typeof x.parameters!=='object'||Array.isArray(x.parameters))throw new Error('trainer-ai-invalid-strategy-reference');
  return x as unknown as TrainerAiStrategyReference;
}
export function defaultStrategyReference():TrainerAiStrategyReference{return {id:'basic-gen8',version:'1',parameters:{}};}
