'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const{fixture,flush}=require('../ui-wire-travel-fixtures.cjs');
test('real Fly association preserves active travel recovery and terminal request identity',async()=>{
 const observations=[];
 const h=await fixture({beforeUpgrade(n){
  const original=n.app.fieldShortcutRecovery;
  n.app.fieldShortcutRecovery=function(...args){const value=Reflect.apply(original,this,args);observations.push({request:args[0],snapshot:value});return value;};
 }});
 await h.openPicker();h.press('ok');
 await h.pump(()=>h.G.$gameMap.mapId()===6&&!h.app.saveBlocked&&!h.G.PSManagement.fieldPresentationPending());
 for(let n=0;n<8;n++){h.tick();await flush();}
 const prepared=h.calls.find(row=>row.kind==='prepare');assert.equal(prepared.result.status,'prepared');
 // These snapshots came from the ordinary UI while its real Fly parent was active.
 // A non-travel terminal facade cannot supply the actual reserved arrival phase.
 const active=observations.find(row=>row.request===prepared.result.request&&row.snapshot.status==='pending'&&row.snapshot.phase==='awaiting-arrival');
 assert(active,JSON.stringify(observations.map(row=>row.snapshot)));assert.equal(active.snapshot.physical,'reserved');assert.equal(active.snapshot.reasonCode,'executing');
 const value=h.app.fieldShortcutRecovery(prepared.result.request);assert.equal(value.status,'completed');
 // retire() clears the owned checkpoint; completion does not retain an actionable phase.
 assert.equal(value.phase,'unavailable');assert.equal(value.reasonCode,null);assert.equal(value.retry.enabled,false);assert.equal(value.cancel.enabled,false);
 assert.equal(h.app.fieldShortcutRecovery({...prepared.result.request}).status,'unavailable');
 fs.writeFileSync(path.join(process.env.PF_E1_CASE_ROOT,'TRAVEL-RECOVERY.json'),JSON.stringify({active:active.snapshot,terminal:value,observations:observations.map(row=>row.snapshot)},null,2)+'\n',{flag:'wx'});
});
