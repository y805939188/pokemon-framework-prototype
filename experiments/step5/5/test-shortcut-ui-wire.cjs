'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./ui-wire-travel-fixtures.cjs');
const prepares=h=>h.calls.filter(row=>row.kind==='prepare');
const reserves=h=>h.trace.filter(row=>row[0]==='native-reserve');
async function finish(h,id){await h.pump(()=>h.G.$gameMap.mapId()===id&&!h.app.saveBlocked&&!h.G.PSWorld.pending());assert.equal(h.G.PSManagement.fieldPresentationPending(),false);}
async function invChoose(h,key){await h.pump(()=>h.G.PSInventory.current()?.ready);for(let n=0;n<30&&h.G.PSInventory.current()?.view.items?.[h.G.PSInventory.current().view.cursor]?.key!==key;n++)h.press('down');assert.equal(h.G.PSInventory.current()?.view.items?.[h.G.PSInventory.current().view.cursor]?.key,key);h.press('ok');await h.settle(1);}
function addRod(game,content){content.items.oldrod={id:'oldrod',name:'Old Rod',pocket:8,price:0,fieldUse:'field',battleUse:'none',flags:['KeyItem'],effect:{family:'fishing',parameters:{rod:1}}};game.inventory.pockets[7].push({itemId:'oldrod',quantity:1});game.inventory.lastPocket=8;}

test('UI01 real Bag registration and deselection preserve stock and feed the actual map shortcut projection',async()=>{
 const h=await fixture({edit:addRod}),G=h.G;assert.equal(G.PSInventory.showBag()!==null,true);await h.pump(()=>G.PSInventory.current()?.ready);assert.equal(G.PSInventory.current().pocket,8);assert(G.PSInventory.current().text.some(text=>text===' ◇'));
 h.press('ok');await invChoose(h,'register');assert.deepEqual(h.state().inventory.registeredItems,['oldrod']);assert.equal(h.quantity('oldrod'),1);assert(G.PSInventory.current().text.some(text=>text===' ◆'));
 h.press('cancel');await h.pump(()=>G.SceneManager._scene instanceof G.Scene_Map&&!G.PSInventory.current());assert(G.PSManagement.openFieldShortcuts());h.tick();assert(h.overlay());assert(h.overlay().drawn.some(text=>text.includes('Fly')));assert(h.overlay().drawn.some(text=>text.includes('Old Rod')));h.press('cancel');
 assert(G.PSInventory.showBag());await h.pump(()=>G.PSInventory.current()?.ready);const world=G.PSWorld;G.PSWorld=null;h.press('ok');await invChoose(h,'unregister');assert.deepEqual(h.state().inventory.registeredItems,[]);assert.equal(h.quantity('oldrod'),1);G.PSWorld=world;h.press('cancel');await h.pump(()=>G.SceneManager._scene instanceof G.Scene_Map);assert.equal(h.app.encounterBlocked,false);assert.equal(reserves(h).length,0);
});

test('UI02 actual Menu party selection releases its owner before native pop and new genuine Map executes Fly once',async()=>{
 const h=await fixture(),G=h.G,oldMap=h.manager._scene;h.manager.push(G.Scene_Menu);h.tick();const oldMenu=h.manager._scene;oldMenu._commandWindow.handlers.psParty();h.ready();h.press('ok');h.choose('field-actions');assert(h.overlay());assert.equal(h.app.encounterBlocked,true);
 const partyScene=h.manager._scene;h.press('ok');await h.pump(()=>!!h.picker());const returned=h.manager._scene;assert(returned instanceof G.Scene_Map);for(const prior of [oldMap,oldMenu,partyScene])assert.notStrictEqual(returned,prior);assert.equal(h.app.encounterBlocked,false);assert.equal(prepares(h).length,0);
 h.press('ok');await finish(h,6);assert.equal(prepares(h).length,1);assert.strictEqual(prepares(h)[0].scene,returned);assert.equal(prepares(h)[0].pending,false);assert.equal(prepares(h)[0].blocked,false);assert(h.calls.findIndex(row=>row.kind==='end-management')<h.calls.findIndex(row=>row.kind==='prepare'));assert.equal(reserves(h).length,1);assert.equal(h.state().stats.fly_count,1);assert.equal(h.confirmations.length,0);
});

test('UI03 command357 Fly derives current-region visited first points and executes the chosen real E3 destination',async()=>{
 const h=await fixture({edit(game,content){content.world.regionMaps.regions=[{id:0,nameKey:'r0',points:[{x:1,y:1,switchId:1,healingSpot:{mapId:6,x:1,y:2}},{x:1,y:1,healingSpot:{mapId:7,x:1,y:1}},{x:2,y:2,healingSpot:{mapId:6,x:1,y:2}},{x:3,y:3,healingSpot:{mapId:8,x:1,y:1}}]},{id:1,nameKey:'r1',points:[{x:4,y:4,healingSpot:{mapId:7,x:1,y:1}}]}];}});
 const q=h.app.worldFlyDestinations();assert.equal(q.status,'ready');assert.deepEqual(q.destinations.map(d=>[d.regionId,d.pointIndex]),[[0,2]]);
 h.event([h.command('PS_Management','ShowFieldShortcuts'),{code:230,indent:0,parameters:[2]},{code:0,indent:0,parameters:[]}]);h.tick();assert.equal(h.G.PSManagement.fieldPresentationPending(),false);await h.pump(()=>!!h.overlay());h.press('ok');await h.settle(1);assert(h.picker().drawn.some(text=>text.includes('Location 2, 2')));assert(!h.picker().drawn.some(text=>/Location (1, 1|3, 3|4, 4)/.test(text)));assert.equal(prepares(h).length,0);h.press('ok');await finish(h,6);assert.equal(reserves(h).length,1);assert.equal(h.state().stats.fly_count,1);assert.equal(h.confirmations.length,0);
});

test('UI04 Dig and Teleport native No confirmations release the real operation without effects',async()=>{
 for(const move of ['dig','teleport']){const h=await fixture({move});const before=JSON.stringify(h.state());assert(h.G.PSManagement.openFieldShortcuts());h.tick();h.press('ok');await h.answer(false);await h.settle();assert.equal(h.confirmations.length,1);assert.deepEqual(h.confirmations[0][0],['Yes','No']);assert.equal(reserves(h).length,0);assert.equal(h.G.$gameMap.mapId(),5);assert.equal(JSON.stringify(h.state()),before);assert.equal(h.app.saveBlocked,false);assert(h.overlay());h.press('cancel');assert.equal(h.G.PSManagement.fieldPresentationPending(),false);}
});

test('UI05 a late Fly picker cannot clear current Management successors after Content or generation changes',async()=>{
 for(const kind of ['owner','content','generation']){const h=await fixture();await h.openPicker();if(kind==='content')h.flow._content={...h.content,world:{...h.content.world,regionMaps:{source:'replacement',regions:[]}}};if(kind==='generation')h.app.stateReplacedByHost();const successor=h.app.beginManagement();h.press('ok');await h.settle();assert.equal(reserves(h).length,0);assert.equal(h.state().stats.fly_count,0);assert.equal(h.app.encounterBlocked,true);assert.equal(h.G.PSManagement.fieldPresentationPending(),false);assert.notEqual(h.app.endManagement(successor).status,'refused');assert.equal(h.app.encounterBlocked,false);}
});

test('UI06 rejected or throwing battle presentation aborts exactly the genuine App admission and preserves successors',async()=>{
 for(const throws of [false,true]){const h=await fixture({edit(game,content){content.moves.sweetscent={id:'sweetscent',name:'Sweet Scent',pp:20};game.party[0].moves=[{id:'sweetscent',pp:20,maxpp:20,ppUps:0}];}});const G=h.G,aborts=[];let outcome,requestSettled=false,openCalls=0;
 const abort=h.app.abortAdmittedWorldBattle.bind(h.app),execute=h.app.executeFieldShortcut.bind(h.app);h.app.abortAdmittedWorldBattle=(admission,reason)=>{aborts.push(admission);return abort(admission,reason);};h.app.executeFieldShortcut=async(...args)=>{try{outcome=await execute(...args);return outcome;}finally{requestSettled=true;}};G.PSFlow.openAdmittedWorldBattle=()=>{openCalls++;if(throws)throw Error('UI06 exact presentation failure');return false;};
 assert(G.PSManagement.openFieldShortcuts());h.tick();h.press('ok');await h.pump(()=>requestSettled);console.log('UI06-OUTCOME',JSON.stringify({throws,outcome,openCalls,aborts:aborts.length,diagnostics:G.PSWorld.diagnostics}));assert.equal(outcome?.status,'accepted');assert(outcome.admission);assert.deepEqual(aborts,[outcome.admission]);assert.equal(openCalls,1);assert.equal(h.app.saveBlocked,false);assert.equal(h.app.encounterBlocked,false);assert.equal(h.sessions.length,0);assert.equal(reserves(h).length,0);
 }
});
