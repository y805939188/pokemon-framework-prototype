'use strict';
const assert=require('node:assert/strict');const {fixture,flush}=require('./travel-mz-world-travel-fixture.cjs');
async function ropeFixture(options={}){
 const h=await fixture({...options,edit(game,content){game.inventory.pockets[0]=[{itemId:'escaperope',quantity:options.quantity??2}];game.inventory.registeredItems=['escaperope'];game.inventory.lastPocket=1;game.inventory.indices=Array(8).fill(0);if(options.keyItem)content.items.escaperope.flags=[...(content.items.escaperope.flags??[]),'KeyItem'];options.edit?.(game,content);}}),G=h.G,fieldResults=[],handoffs=[];
 const queue=G.PSWorld.queueFieldItem;G.PSWorld.queueFieldItem=function(application,handoff,done){handoffs.push(handoff);return Reflect.apply(queue,this,[application,handoff,done]);};
 const run=h.app.runFieldItemHandoff.bind(h.app);h.app.runFieldItemHandoff=token=>run(token).then(result=>{fieldResults.push({token,result});return result;});
 async function bag(){const source=G.SceneManager._scene,handle=G.PSInventory.showBag();assert(handle,'genuine native bag opens');await h.pump(()=>G.PSInventory.current()?.view?.kind==='bag');h.ready();h.press('ok');await h.pump(()=>G.PSInventory.current()?.view?.kind==='menu');h.choose('use');await h.pump(()=>handoffs.length>0&&G.SceneManager._scene instanceof G.Scene_Map&&!G.SceneManager.isSceneChanging());assert.notEqual(G.SceneManager._scene,source,'real Inventory closes to a newly constructed Map');return {handle,source,token:handoffs.at(-1).token};}
 async function board(kind='boat'){const v=G.$gameMap[kind]();G.$dataSystem[kind].bgm={name:'',volume:0,pitch:100,pan:0};v.setLocation(5,h.player.x+(kind==='airship'?0:1),h.player.y);assert.equal(h.player.getOnVehicle(),true);await h.pump(()=>h.player.isInVehicle()&&!h.player._vehicleGettingOn&&!h.player.isMoving()&&!h.app.saveBlocked&&!G.PSWorld.pending());assert.equal(v._driving,true);return v;}
 return {...h,bag,board,fieldResults,handoffs,ropeQuantity:()=>h.quantity('escaperope')};
}
module.exports={ropeFixture,flush};
