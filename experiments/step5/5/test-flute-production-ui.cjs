'use strict';
// Actual ShowBag357/Inventory registration and Management shortcut IIFEs; rendering/input resources are headless.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./ui-wire-travel-fixtures.cjs');
const flags=['lowerEncounterRate','higherEncounterRate','lowerWildLevel','higherWildLevel'];
const target=(level,color)=>level?(color==='black'?'higherWildLevel':'lowerWildLevel'):(color==='black'?'lowerEncounterRate':'higherEncounterRate');
async function world(level,color,edit){
 const inventory=fs.readFileSync(path.join(process.env.PF_E3_JOINT_OUT,'PS_Inventory.js'),'utf8'),registrations=[],run=vm.runInContext;let h;
 // This existing fixture installs the real PluginManager after its preliminary plugin load, replacing the registry.
 // Observe the complete unmodified IIFE's public registrations, then register those exact callbacks in the native registry.
 vm.runInContext=function(code,context,options){
  if(code!==inventory)return Reflect.apply(run,this,[code,context,options]);
  const register=context.PluginManager.registerCommand;context.PluginManager.registerCommand=function(...args){registrations.push(args);return Reflect.apply(register,this,args);};
  try{return Reflect.apply(run,this,[code,context,options]);}finally{context.PluginManager.registerCommand=register;}
 };
 try{h=await fixture({edit(game,c){
 c.settings={...c.settings,FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS:level};game.party.forEach(m=>{m.moves=[];});for(const rows of game.inventory.pockets)rows.length=0;
 const id=color+'flute',item=c.items[id];item.name='Authored '+color+' flute';game.inventory.pockets[item.pocket-1].push({itemId:id,quantity:2});game.inventory.lastPocket=item.pocket;game.inventory.registeredItems=[];edit?.(game,c);
}});}finally{vm.runInContext=run;}
 assert(registrations.some(([plugin,name])=>plugin==='PS_Inventory'&&name==='ShowBag'));
 for(const [plugin,name,callback]of registrations){h.G.PluginManager.registerCommand(plugin,name,callback);assert.equal(h.G.PluginManager._commands[plugin+':'+name],callback);}
 return h;
}
async function showBag(h){h.event([h.command('PS_Inventory','ShowBag'),{code:0,indent:0,parameters:[]}]);h.tick();await h.pump(()=>h.G.PSInventory.current()?.ready);assert.equal(h.G.PSInventory.current().view.kind,'bag');h.press('ok');}
async function choose(h,key){await h.pump(()=>h.G.PSInventory.current()?.ready);for(let i=0;i<30&&h.G.PSInventory.current()?.view.items?.[h.G.PSInventory.current().view.cursor]?.key!==key;i++)h.press('down');assert.equal(h.G.PSInventory.current()?.view.items?.[h.G.PSInventory.current().view.cursor]?.key,key);h.press('ok');await h.settle(1);}
for(const level of [false,true])for(const color of ['black','white'])test('flute production ShowBag357 use '+(level?'level':'rate')+'/'+color,async()=>{
 const h=await world(level,color),G=h.G,prefix=h.draws.slice();let runs=0;const run=h.app.runFieldItemHandoff;h.app.runFieldItemHandoff=function(...args){runs++;return Reflect.apply(run,this,args);};
 await showBag(h);await choose(h,'use');await h.pump(()=>h.app.worldLocalState()[target(level,color)]&&!h.app.saveBlocked&&!G.PSInventory.current());
 const local=h.app.worldLocalState();assert.equal(local[target(level,color)],true);for(const flag of flags.filter(f=>f!==target(level,color)))assert.equal(local[flag],false,flag);assert.equal(h.quantity(color+'flute'),2);assert.equal(runs,1);assert.deepEqual(h.draws,prefix);assert.deepEqual(h.state().inventory.registeredItems,[]);assert.equal(h.sessions.length,0);assert.equal(G.PSFlow.running,false);
});
for(const level of [false,true])for(const color of ['black','white'])test('flute production actual Bag registration -> Map -> command357 shortcut '+(level?'level':'rate')+'/'+color,async()=>{
 const h=await world(level,color),G=h.G,prefix=h.draws.slice();await showBag(h);await choose(h,'register');assert.deepEqual(h.state().inventory.registeredItems,[color+'flute']);assert.equal(h.quantity(color+'flute'),2);
 h.press('cancel');await h.pump(()=>G.SceneManager._scene instanceof G.Scene_Map&&!G.PSInventory.current());
 h.event([h.command('PS_Management','ShowFieldShortcuts'),{code:0,indent:0,parameters:[]}]);h.tick();await h.pump(()=>!!h.overlay());assert(h.overlay().drawn.some(text=>text.includes('Authored '+color+' flute')));h.press('ok');await h.settle(8);
 const local=h.app.worldLocalState();assert.equal(local[target(level,color)],true);for(const flag of flags.filter(f=>f!==target(level,color)))assert.equal(local[flag],false,flag);assert.equal(h.quantity(color+'flute'),2);assert.equal(h.calls.filter(r=>r.kind==='outcome'&&r.result.status==='completed').length,1);assert.deepEqual(h.draws,prefix);assert.equal(h.app.saveBlocked,false);assert.equal(G.PSManagement.fieldPresentationPending(),false);assert.equal(h.sessions.length,0);
});
test('flute registration preserves WP27 unknown no-op and unowned registration with unavailable execution',async()=>{
 const h=await world(true,'black'),before=structuredClone(h.state().inventory.registeredItems),prefix=h.draws.slice(),token=h.app.beginInventoryOperation();
 try{const unknown=h.app.inventoryRequest(token,'unknown',{kind:'register-item',itemId:'unknown-music',registered:true});assert.equal(unknown.status,'unchanged',JSON.stringify(unknown));assert.equal(unknown.result.registered,false);assert.deepEqual(h.state().inventory.registeredItems,before);
 const unowned=h.app.inventoryRequest(token,'unowned',{kind:'register-item',itemId:'whiteflute',registered:true});assert.equal(unowned.status,'committed',JSON.stringify(unowned));assert.deepEqual(h.state().inventory.registeredItems,['whiteflute']);assert.equal(h.quantity('whiteflute'),0);
 }finally{h.app.endInventoryOperation(token);}
 assert.equal(h.app.fieldShortcutQueries().resolve({kind:'item',itemId:'whiteflute'}).status,'refused');assert.deepEqual(h.draws,prefix);assert.equal(h.app.saveBlocked,false);
});
test('flute registration requires actual World plugin capability and preserves stock',async()=>{
 const h=await world(true,'black'),G=h.G;await showBag(h);h.press('cancel');await h.pump(()=>G.PSInventory.current()?.ready&&G.PSInventory.current().view.kind==='bag');const plugin=G.PSWorld;G.PSWorld=null;h.press('ok');await h.pump(()=>G.PSInventory.current()?.ready);assert.equal(G.PSInventory.current().view.items.some(r=>r.key==='register'),false);G.PSWorld=plugin;assert.deepEqual(h.state().inventory.registeredItems,[]);assert.equal(h.quantity('blackflute'),2);
});
test('non-field potion does not gain a registration command from the flute wiring',async()=>{
 const h=await world(true,'black',(game,c)=>{for(const rows of game.inventory.pockets)rows.length=0;const item=c.items.potion;game.inventory.pockets[item.pocket-1].push({itemId:'potion',quantity:2});game.inventory.lastPocket=item.pocket;}),G=h.G;
 await showBag(h);await h.pump(()=>G.PSInventory.current()?.ready);assert.equal(G.PSInventory.current().view.items.some(r=>r.key==='register'),false);assert.deepEqual(h.state().inventory.registeredItems,[]);assert.equal(h.quantity('potion'),2);
});
test('flute already registered remains deselectable after World handler loss',async()=>{
 const h=await world(true,'black'),G=h.G;await showBag(h);await choose(h,'register');assert.deepEqual(h.state().inventory.registeredItems,['blackflute']);const plugin=G.PSWorld;G.PSWorld=null;h.press('ok');await choose(h,'unregister');G.PSWorld=plugin;assert.deepEqual(h.state().inventory.registeredItems,[]);assert.equal(h.quantity('blackflute'),2);
});
