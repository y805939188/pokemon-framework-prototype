'use strict';
const assert=require('node:assert/strict');
// Narrow fixture oracle: one existing Lum Berry slot, no production addItems or state planner.
function expectedTake(before){
 assert.equal(before.party[0].id,'P1');assert.equal(before.party[0].item,'lumberry');assert.equal(before.party[0].mail,null);
 const slots=before.inventory.pockets.flat().filter(s=>s.itemId==='lumberry');assert.equal(slots.length,1);assert.equal(slots[0].quantity,1);
 const expected=structuredClone(before);expected.party[0].item='';
 expected.inventory.pockets.flat().find(s=>s.itemId==='lumberry').quantity=2;
 return expected;
}
function assertTakeConserved(before,after){assert.deepEqual(after,expectedTake(before),'only held-item removal and the existing bag slot +1 may change');}
module.exports={expectedTake,assertTakeConserved};
