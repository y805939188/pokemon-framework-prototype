'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {expectedTake,assertTakeConserved}=require('./take-conservation-oracle.cjs');
const before={party:[{id:'P1',item:'lumberry',mail:null,hp:100,moves:[{id:'rest',pp:10}]},{id:'P2',item:'leftovers'}],inventory:{pockets:[[{itemId:'potion',quantity:3}],[],[],[],[{itemId:'lumberry',quantity:1}]],lastPocket:1,indices:[0,0,0,0,0]},money:100,stats:{battles:7},dex:{seen:['pidgey']},appliedBattles:{old:{hash:'preserved'}},storage:{boxes:[]}};
test('closed take oracle accepts exactly the two expected changes without mutating input',()=>{const original=structuredClone(before);assertTakeConserved(before,expectedTake(before));assert.deepEqual(before,original);});
for(const [name,mutate] of [
 ['missing bag credit',s=>s.inventory.pockets[4][0].quantity=1],['double bag credit',s=>s.inventory.pockets[4][0].quantity=3],['held item retained',s=>s.party[0].item='lumberry'],['unrelated member',s=>s.party[1].item=''],['HP',s=>s.party[0].hp--],['PP',s=>s.party[0].moves[0].pp--],['bag cursor',s=>s.inventory.lastPocket=5],['money',s=>s.money++],['stats',s=>s.stats.battles++],['dex',s=>s.dex.seen.push('snorlax')],['old ledger',s=>delete s.appliedBattles.old],['storage',s=>s.storage.boxes.push({})],['extra field',s=>s.extra=true]
 ])test('closed take oracle rejects '+name,()=>{const bad=expectedTake(before);mutate(bad);assert.throws(()=>assertTakeConserved(before,bad),{code:'ERR_ASSERTION'});});
