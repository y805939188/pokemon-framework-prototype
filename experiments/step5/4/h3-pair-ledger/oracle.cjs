"use strict";
// Independent of product semanticFingerprint, sha256, resolver, and content canonicalizer.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){assert(Number.isFinite(value));return JSON.stringify(value);}
 assert(value&&typeof value==='object','JSON data only');
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
const digest=value=>crypto.createHash('sha256').update(canonical(value),'utf8').digest('hex');
const pairHash=facts=>digest({domain:'required-battle-settlement-v1',facts});
function verifyChain(a,b){
 const id=a.result.battleId,facts=a.requiredObservation.facts,expected=pairHash(facts);
 assert.equal(facts.binding.battleId,id);assert.equal(facts.binding.rawHash,a.resultHash);assert.equal(a.resultHash,digest(a.result),'independent raw result hash');
 assert.equal(a.requiredObservation.pairHash,expected,'observer oracle');
 assert.equal(a.final.appliedBattles[id].settlement.pairHash,expected,'installed ledger');
 assert.equal(a.savedPairHash,expected,'actual decoded compressed save');
 assert.equal(b.loaded.appliedBattles[id].settlement.pairHash,expected,'fresh process loaded ledger');
 assert.equal(b.slotBefore,a.slotAfter,'same saved bytes');
 assert.deepEqual(b.loaded,a.final,'whole document fresh read');
 return expected;
}
module.exports={canonical,digest,pairHash,verifyChain};
