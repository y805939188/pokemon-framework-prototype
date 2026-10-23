'use strict';
/** PROPOSAL ONLY. Fake vectors for a future adapter; never imported by runtime or protocol v1. */
const setOwn=(map,id,value)=>Object.defineProperty(map,id,{value,writable:true,enumerable:true,configurable:true});
function propose(initial,events,context={wild:false}){
 const ids=Object.keys(initial),current={...initial},restore={...initial},history=[];
 const known=new Set(ids),seen=new Set();
 for(const e of events){if(seen.has(e.eventId))throw Error('duplicate-event');seen.add(e.eventId);if(!known.has(e.id))throw Error('unknown-member');
  if(e.previous!==current[e.id])throw Error('stale-item');
  if(!['consumed','flung','knocked-off','wild-acquired','transferred'].includes(e.reason))throw Error('unknown-item-reason');
  if(e.reason==='wild-acquired'&&!context.wild)throw Error('not-wild-acquisition');
  setOwn(current,e.id,e.current);
  if(e.reason==='consumed'||e.reason==='flung'){if(e.current!=='')throw Error('invalid-loss');if(restore[e.id]===e.previous)setOwn(restore,e.id,'');}
  if(e.reason==='wild-acquired')setOwn(restore,e.id,e.current);
  if(e.reason==='transferred')throw Error('transfer-permanence-unresolved'); // never guess RPG permanence from a Showdown swap
  history.push({...e});
 }
 return {initial:{...initial},current,restore,history};
}
function project(plan,placements,alreadyApplied=false){
 if(alreadyApplied)return {status:'duplicate'};
 const writes={};for(const p of placements){if(!Object.hasOwn(plan.current,p.id))throw Error('unknown-member');setOwn(writes,p.id,p.to==='box'?plan.current[p.id]:plan.restore[p.id]);}
 return {status:'proposed',writes};
}
module.exports={propose,project};

/** Stateful FAKE receipt owner. The injected install must atomically accept or reject its full proposal. */
function createFakeReceiver(){
 const receipts=new Map();
 return {apply(result,install){
  const fingerprint=JSON.stringify(result),old=receipts.get(result.battleId);
  if(old){if(old!==fingerprint)throw Error('result-conflict');return {status:'duplicate'};}
  const plan=propose(result.initial,result.events,result.context),eligible=new Set(Object.keys(plan.initial));
  for(const captured of result.captured??[]){
   if(!captured.id||Object.hasOwn(plan.current,captured.id)||typeof captured.current!=='string')throw Error('invalid-capture-identity');
   // Explicit terminal current item is an input to this proposal, never inferred from a missing engine request.
   setOwn(plan.current,captured.id,captured.current);setOwn(plan.restore,captured.id,captured.current);eligible.add(captured.id);
  }
  const seen=new Set(),writes={};
  for(const placement of result.placements){
   if(seen.has(placement.id)||!Object.hasOwn(plan.current,placement.id)||!['party','box'].includes(placement.to))throw Error('invalid-placement');seen.add(placement.id);
   if(placement.to==='box'){setOwn(writes,placement.id,plan.current[placement.id]);eligible.delete(placement.id);}else setOwn(writes,placement.id,plan.restore[placement.id]);
  }
  if(seen.size!==Object.keys(plan.current).length)throw Error('incomplete-placement');
  const proposal={writes,restoreEligible:[...eligible],bag:{...(result.bag??{})}};
  install(structuredClone(proposal)); // failure leaves no receipt; retry rebuilds the same proposal
  receipts.set(result.battleId,fingerprint);return {status:'applied',...proposal};
 },get receiptCount(){return receipts.size}};
}
module.exports.createFakeReceiver=createFakeReceiver;
