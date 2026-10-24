'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs'),I=E.inventory,C=E.itemCatalog;
const catalog=C.legacyCatalog(),policy=I.inventoryPolicy(),clone=x=>structuredClone(x);
test('P52-01/02 FR177: ordered eight pockets, 1500 spans slots and preflight is pure',()=>{
 const empty=I.newInventory(),before=clone(empty),a=I.addItems(empty,'potion',1500,catalog,policy);
 assert.deepEqual(empty,before);assert.equal(a.pockets.length,8);assert.deepEqual(a.pockets[1],[{itemId:'potion',quantity:999},{itemId:'potion',quantity:501}]);assert.equal(I.itemQuantity(a,'potion',catalog),1500);assert.equal(I.itemQuantity(a,'unknown',catalog),0);
});
test('P52-02/03 FR177: fill existing, forward removal, unrelated order, all-or-nothing capacity',()=>{
 let a=I.inventoryFromBag({potion:900,antidote:1},catalog,policy);a=I.addItems(a,'potion',200,catalog,policy);
 assert.deepEqual(a.pockets[1].map(x=>[x.itemId,x.quantity]),[['potion',999],['antidote',1],['potion',101]]);
 assert.deepEqual(I.removeItems(a,'potion',1000,catalog).pockets[1],[{itemId:'antidote',quantity:1},{itemId:'potion',quantity:100}]);
 const snapshot=clone(a),finite={...policy,pocketSlots:[0,3,0,0,0,0,0,0]};assert.throws(()=>I.addItems(a,'potion',899,catalog,finite),/inventory-full/);assert.deepEqual(a,snapshot);assert.throws(()=>I.removeItems(a,'potion',1101,catalog),/not-enough-items/);
});
test('P52-02/28 FR181: invalid quantities, overflow and unknown items never mutate',()=>{
 const a=I.newInventory(),before=clone(a);for(const q of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>I.addItems(a,'potion',q,catalog,policy));assert.throws(()=>I.addItems(a,'alien',1,catalog,policy));assert.deepEqual(a,before);
 assert.throws(()=>I.aggregateBag({...a,pockets:[[{itemId:'potion',quantity:Number.MAX_SAFE_INTEGER},{itemId:'potion',quantity:1}],[],[],[],[],[],[],[]]}),/integer-overflow/);
});
test('P52-01/04 FR182: sorting stable, configured finite slots, trusted over-cap quantity retained',()=>{
 const a=I.inventoryFromBag({masterball:1,pokeball:1},catalog,policy);const sorted=I.addItems(a,'greatball',1,catalog,{...policy,autoSort:[false,false,true,false,false,false,false,false]});
 assert.deepEqual(sorted.pockets[2].map(s=>s.itemId),['pokeball','greatball','masterball']);
 const old=I.inventoryFromBag({potion:1000},catalog,policy);const small={...policy,perSlot:100,pocketSlots:[0,2,0,0,0,0,0,0]};const n=I.addItems(old,'potion',99,catalog,small);assert.equal(n.pockets[1][0].quantity,999);assert.equal(I.itemQuantity(n,'potion',catalog),1099);
});
test('P52-05/29 FR193: unsafe own ids survive aggregate/JSON and battle projection is explicit',()=>{
 const odd={...catalog};Object.defineProperty(odd,'__proto__',{value:{...catalog.potion,id:'__proto__',legacyIds:['old'],battleId:'odd'},enumerable:true});
 const a=I.inventoryFromBag(JSON.parse('{"__proto__":1500}'),odd,policy),bag=I.aggregateBag(a);assert.equal(Object.hasOwn(bag,'__proto__'),true);assert.equal(bag.__proto__,1500);assert.equal(I.battleBag(a,odd).odd,1500);
 const n=I.applyBattleBag(a,{odd:-1000},odd,policy);assert.equal(I.aggregateBag(n).__proto__,500);assert.equal(I.aggregateBag(a).__proto__,1500);
 assert.equal(I.inventoryProblems(JSON.parse(JSON.stringify(n))).length,0);
});
test('P52-09/19 FR722/723: quantity and consumption are independent; TM/HM/TR identity',()=>{
 const ordinary={...catalog.potion,showQuantity:false,consumable:false};assert.equal(C.showsQuantity(ordinary),true);assert.equal(C.consumesItem(ordinary),false);
 const tm={...ordinary,fieldUse:'tm',move:'tackle'};assert.equal(C.importantItem(tm),true);assert.equal(C.showsQuantity(tm),false);assert.equal(C.consumesItem({...tm,consumable:true}),false);assert.equal(C.importantItem({...tm,fieldUse:'tr'}),false);
});
test('P52-32 FR188: handler precedence/copy and catalog queries protect the author record',()=>{
 const r=new C.ItemEffectRegistry();r.registerWhen(()=>true,'first');r.registerWhen(()=>true,'second');assert.equal(r.get(catalog.potion),'first');r.register('potion','exact');r.copy(catalog.potion,'antidote');r.register('potion','later');assert.equal(r.get(catalog.antidote),'exact');
 const q=C.itemOf(catalog,'potion');q.flags.push('KeyItem');assert.equal(C.importantItem(catalog.potion),false);
});
test('P52-03/11: replace identity preserves old pocket and slot boundaries; manual order is pure',()=>{
 const a=I.inventoryFromBag({potion:1500,antidote:1},catalog,policy),before=clone(a),b=I.replaceItemId(a,'potion','pokeball',catalog);
 assert.deepEqual(b.pockets[1].map(s=>[s.itemId,s.quantity]),[['pokeball',999],['pokeball',501],['antidote',1]]);assert.deepEqual(b.pockets[2],[]);assert.deepEqual(a,before);
 const moved=I.moveInventorySlot(a,2,0,2,policy);assert.deepEqual(moved.pockets[1].map(s=>s.quantity),[501,1,999]);assert.deepEqual(a,before);assert.throws(()=>I.moveInventorySlot(a,4,0,0,policy),/sorting-disabled/);
 const finite={...policy,pocketSlots:[-1,1,-1,-1,-1,-1,-1,-1]};assert.equal(I.capacityFor(a,'potion',catalog,finite),0);assert.throws(()=>I.addItems(a,'potion',1,catalog,finite),/inventory-full/);
});
