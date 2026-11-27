'use strict';
const vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
// Exact binary fractions: each pair is a frozen 27+26-bit word input, not a business rng override.
const units=[1/8,1/4,3/8,7/16,3/16,5/16,13/32,5/32,9/32,11/32,3/16,1/4,3/8,7/16];
const words=units.map(unit=>{const k=unit*2**53;return [Math.floor(k/2**26)*32,(k%2**26)*64];});
function install(G,out,mode='words'){
 assert(['words','throw','accessor','wrong-buffer','missing'].includes(mode));
 const rows={business:[],math:[],crypto:[],engine:[],capabilityReads:0,getters:0,wordTape:words.map((w,i)=>({words:w,unit:units[i],integer53:units[i]*2**53}))};let active=true,depth=0,index=0,mathIndex=0;
 const crypto=require('node:crypto'),fill=crypto.randomFillSync,load=G.require,random=G.PSFlow.random,math=vm.runInContext('Math',G),mathRandom=math.random;
 const controlledFill=function(...args){if(!active||depth===0)return Reflect.apply(fill,this,args);const target=args[0],row={ordinal:rows.crypto.length+1,mode,byteLength:target.byteLength};rows.crypto.push(row);if(mode==='throw'){row.error='CONTROLLED_ENTROPY_FAILURE';throw Error(row.error);}const actual=Reflect.apply(fill,this,args);row.actualNativeCalled=true;row.nativeReturnedSame=actual===target;if(mode==='wrong-buffer')return new Uint32Array(2);assert(index<words.length,'unexpected extra default entropy draw');target[0]=words[index][0];target[1]=words[index][1];row.words=words[index].slice();row.unit=units[index++];return actual;};
 crypto.randomFillSync=controlledFill;
 const requireObserved=function(...args){if(args[0]!=='node:crypto'||!active)return Reflect.apply(load,this,args);rows.capabilityReads++;if(mode==='missing')throw Error('CONTROLLED_CRYPTO_UNAVAILABLE');if(mode==='accessor'){const invalid={};Object.defineProperty(invalid,'randomFillSync',{get(){rows.getters++;throw Error('MUST_NOT_EXECUTE_ENTROPY_GETTER');}});return invalid;}return Reflect.apply(load,this,args);};G.require=requireObserved;
 const mathObserved=function(...args){if(!active)return Reflect.apply(mathRandom,this,args);const tape=[.11,.21,.31,.41,.16,.26,.36,.12,.22,.32,.42,.17,.27,.37];assert(mathIndex<tape.length,'unexpected extra renderer Math draw');const value=tape[mathIndex++];rows.math.push({ordinal:mathIndex,value});return value;};math.random=mathObserved;
 const randomObserved=function(...args){if(!active)return Reflect.apply(random,this,args);const a=rows.math.length,b=rows.crypto.length;depth++;try{const value=Reflect.apply(random,this,args);rows.business.push({n:args[0],value,mathOrdinals:rows.math.slice(a).map(x=>x.ordinal),cryptoOrdinals:rows.crypto.slice(b).map(x=>x.ordinal)});return value;}catch(error){rows.business.push({n:args[0],error:String(error.message??error),mathOrdinals:rows.math.slice(a).map(x=>x.ordinal),cryptoOrdinals:rows.crypto.slice(b).map(x=>x.ordinal)});throw error;}finally{depth--;}};G.PSFlow.random=randomObserved;
 const prng=require(path.resolve(out,'../showdown/dist/sim/prng.js')),restores=[];
 for(const key of ['Gen5RNG','SodiumRNG']){const p=prng[key].prototype,original=p.next;const observed=function(...args){const value=Reflect.apply(original,this,args);if(active)rows.engine.push({kind:key,args:args.slice(),value});return value;};p.next=observed;restores.push(()=>{if(p.next===observed)p.next=original;});}
 return{rows,restore(){active=false;if(G.require===requireObserved)G.require=load;if(G.PSFlow.random===randomObserved)G.PSFlow.random=random;if(math.random===mathObserved)math.random=mathRandom;if(crypto.randomFillSync===controlledFill)crypto.randomFillSync=fill;for(const f of restores)f();}};
}
module.exports={install};
