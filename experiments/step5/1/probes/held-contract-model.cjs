'use strict';
/** PROPOSAL ONLY. Fake vectors for a future adapter; never imported by runtime or protocol v1. */
function propose(initial,events,context={wild:false}){
 const ids=Object.keys(initial),current={...initial},restore={...initial},history=[];
 const known=new Set(ids),seen=new Set();
 for(const e of events){if(seen.has(e.eventId))throw Error('duplicate-event');seen.add(e.eventId);if(!known.has(e.id))throw Error('unknown-member');
  if(e.previous!==current[e.id])throw Error('stale-item');
  if(!['consumed','flung','knocked-off','wild-acquired','transferred'].includes(e.reason))throw Error('unknown-item-reason');
  if(e.reason==='wild-acquired'&&!context.wild)throw Error('not-wild-acquisition');
  current[e.id]=e.current;
  if(e.reason==='consumed'||e.reason==='flung'){if(e.current!=='')throw Error('invalid-loss');if(restore[e.id]===e.previous)restore[e.id]='';}
  if(e.reason==='wild-acquired')restore[e.id]=e.current;
  if(e.reason==='transferred')throw Error('transfer-permanence-unresolved'); // never guess RPG permanence from a Showdown swap
  history.push({...e});
 }
 return {initial:{...initial},current,restore,history};
}
function project(plan,placements,alreadyApplied=false){
 if(alreadyApplied)return {status:'duplicate'};
 const writes={};for(const p of placements){if(!Object.hasOwn(plan.current,p.id))throw Error('unknown-member');writes[p.id]=p.to==='box'?plan.current[p.id]:plan.restore[p.id];}
 return {status:'proposed',writes};
}
module.exports={propose,project};
