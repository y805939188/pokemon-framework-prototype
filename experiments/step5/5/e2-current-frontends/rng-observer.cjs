'use strict';
const vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
// Attach after the fixture's final JsExtensions install. Observers preserve this,
// arguments, actual return values and thrown objects; they supply no randomness.
function install(G,out){
 const rows={mathRandom:[],mathRandomInt:[],business:[],engine:[]},restores=[];
 function wrap(target,key,log,label){const original=target[key];assert.equal(typeof original,'function',label);const replacement=function(...args){const row={sequence:log.length+1,label,args:[...args],thisIsTarget:this===target};log.push(row);try{const value=Reflect.apply(original,this,args);row.returned=true;row.value=value;return value;}catch(error){row.returned=false;row.error=String(error);throw error;}};target[key]=replacement;assert.strictEqual(target[key],replacement);restores.push(()=>{assert.strictEqual(target[key],replacement,label+' observer unexpectedly replaced');target[key]=original;});}
 const math=vm.runInContext('Math',G);wrap(math,'random',rows.mathRandom,'actual VM Math.random');wrap(math,'randomInt',rows.mathRandomInt,'actual VM Math.randomInt');wrap(G.PSFlow,'random',rows.business,'actual PSFlow.random');
 const prng=require(path.resolve(out,'../showdown/dist/sim/prng.js'));
 for(const key of ['Gen5RNG','SodiumRNG'])wrap(prng[key].prototype,'next',rows.engine,key+'.next');
 return{rows,counts:()=>Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length])),restore(){for(const f of restores.reverse())f();}};
}
module.exports={install};
