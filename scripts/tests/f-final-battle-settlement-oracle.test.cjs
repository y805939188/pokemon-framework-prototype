'use strict';
// Oracle-only mutation controls, not additional lifecycle or disk evidence.
const test=require('node:test'),assert=require('node:assert/strict');
const {assertBattleSaveSettlement}=require('./f-final-battle-fixture.cjs');
const event=(kind, frame=42, safe=true)=>({kind,frame,mapId:7,safe});
const ready=()=>({retiredFrame:42, state:{party:['healed'],pending:null}, autosaves:[event('request'),event('execute'),event('success')],saveCount:1});
test('the ordinary oracle accepts only one terminal save after retirement, or none for nontransfer',()=>{
 const t=ready();
 assert.doesNotThrow(()=>assertBattleSaveSettlement(7,1,t,structuredClone(t)));
 t.autosaves=[];t.saveCount=0;
 assert.doesNotThrow(()=>assertBattleSaveSettlement(5,0,t,structuredClone(t)));
});
test('the same ordinary oracle refuses early execution even with one later success',()=>{
 const t=ready();
 t.autosaves[1]=event('execute',41,false);
 assert.throws(()=>assertBattleSaveSettlement(7,1,t,structuredClone(t)),/before cover/);
});
test('the same ordinary oracle refuses a late duplicate or a post-settlement state edit',()=>{
 const t=ready(),duplicate=structuredClone(t),edit=structuredClone(t);
 duplicate.autosaves.push(event('execute',46));duplicate.saveCount++;
 assert.throws(()=>assertBattleSaveSettlement(7,1,t,duplicate),/repeat an autosave/);
 edit.state.party.push('late edit');
 assert.throws(()=>assertBattleSaveSettlement(7,1,t,edit),/replay settled F state/);
});
test('the same ordinary oracle refuses a failed/missing terminal or a manufactured nontransfer save',()=>{
 const t=ready();t.autosaves[2]=event('failure');
 assert.throws(()=>assertBattleSaveSettlement(7,1,t,structuredClone(t)),/one success/);
 t.autosaves.pop();
 assert.throws(()=>assertBattleSaveSettlement(7,1,t,structuredClone(t)),/one success/);
 assert.throws(()=>assertBattleSaveSettlement(5,0,ready(),ready()),/exact save facade calls/);
});
