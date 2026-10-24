'use strict';
// Explicit setup/read bridge for historical tests. Runtime state has no writable or persisted bag alias.
const E=require('../../../js/engine/build/engine.cjs');
function bagOf(game){if(game.inventory)return E.inventory.aggregateBag(game.inventory);if(game.bag)return game.bag;throw Error('test expected a state or v1/session bag');}
function setBag(game,bag){if(!game.inventory){game.bag=structuredClone(bag);return bag;}game.inventory=E.inventory.inventoryFromBag(bag,E.itemCatalog.catalogOf(E.fixtures.content));return bag;}
function setItemCount(game,id,quantity){if(!game.inventory){game.bag[id]=quantity;return quantity;}if(!Number.isSafeInteger(quantity)||quantity<0){const rows=game.inventory.pockets.flat(),slot=rows.find(x=>x.itemId===id);if(slot)slot.quantity=quantity;else game.inventory.pockets[0].push({itemId:id,quantity});return quantity;}const bag=bagOf(game);if(quantity===0)delete bag[id];else Object.defineProperty(bag,id,{value:quantity,enumerable:true,writable:true,configurable:true});setBag(game,bag);return quantity;}
module.exports={bagOf,setBag,setItemCount};
