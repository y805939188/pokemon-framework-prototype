const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,flush}=require('./owned-repel-native-support.cjs');
async function start(options={}) {
 const h=await fixture({edit(game){game.world.repelSteps=1;},nativeSetup(n){if(options.foot)Object.assign(n.player,{_x:6,_realX:6});}}),G=h.G;
 let capture,arrivals=0,replies=0;
 const select=G.PSInventory.selectOwnedRepel;
 G.PSInventory.selectOwnedRepel=function(owner,selection,reply,hooks){
  const record={owner,selection,hooks};capture=record;
  if(options.hooks)hooks=options.hooks(hooks,h,record);
  record.handle=Reflect.apply(select,this,[owner,selection,r=>{replies++;record.reply=r;return reply(r);},hooks]);return record.handle;
 };
 const arrival=G.PSWorld.completedSteps.dispatchArrival;G.PSWorld.completedSteps.dispatchArrival=function(...args){arrivals++;return Reflect.apply(arrival,this,args);};
 if(!options.foot)assert.equal((await h.run({kind:'use',moveId:'surf',entry:'party',memberId:'d-mz-player'})).status,'completed');
 G.Input.dir4=6;h.tick();G.Input.dir4=0;
 Object.assign(h,{getCapture:()=>capture,arrivals:()=>arrivals,replies:()=>replies});
 await h.pump(()=>G.PSInventory.current()?.view?.kind==='menu');
 return h;
}
async function finish(h){await h.pump(()=>!!h.steps[0]?.outcome&&!h.G.PSWorld.pending()&&!h.app.saveBlocked&&!h.G.SceneManager.isSceneChanging()&&h.G.SceneManager._scene instanceof h.G.Scene_Map);}
function quantity(h){return h.state().inventory.pockets.flat().filter(s=>s.itemId==='repel').reduce((a,s)=>a+s.quantity,0);}
for(const foot of [false,true])test((foot?'foot':'Surf')+' actual filtered bag Yes consumes one real ticket once after exact pop/new Map return',async()=>{
 const h=await start({foot}),before=quantity(h),source=h.getCapture(),old=h.G.SceneManager._scene;
 h.choose('yes');assert.equal(h.G.PSInventory.current().view.kind,'bag');h.ready();h.press('ok');await finish(h);
 assert.notEqual(h.G.SceneManager._scene,old);assert.equal(h.arrivals(),1);assert.equal(h.replies(),1);assert.equal(quantity(h),before-1);assert.equal(h.state().world.repelSteps,100);assert.equal(h.state().stats.repel_count,1);assert(h.steps[0].outcome.prefix.repelRenewed);assert.equal(h.state().steps,1);assert.equal(h.sessions.length,0);assert.deepEqual(h.draws,[100]);
 assert.equal(source.hooks.returned(source.handle),false,'technical receipt is one-use');assert.equal(h.app.isOwnedRepelSelection(source.owner,source.selection),false);
});
test('exact capability rejects copied owner/selection/handle/Inventory scene without poisoning its genuine continuation',async()=>{
 const h=await start(),c=h.getCapture(),scene=h.G.SceneManager._scene;
 assert.equal(h.app.ownedRepelSceneHooks({...c.owner},c.selection),null);assert.equal(h.app.ownedRepelSceneHooks(c.owner,{...c.selection}),null);
 for(const wrong of [{},new Proxy(c.handle,{get(){assert.fail('handle getter');}})])assert.equal(c.hooks.beforeReturn(wrong,scene),false);
 assert.equal(c.hooks.beforeReturn(c.handle,Object.assign(Object.create(Object.getPrototypeOf(scene)),{_psInventory:true})),false);
 h.choose('no');await finish(h);assert.equal(h.arrivals(),1);assert.equal(h.replies(),1);assert.deepEqual(h.draws,[100]);
});
for(const change of ['map','player','point','manager','scene'])test('owned Inventory rejects actual '+change+' drift, keeps committed prefix and forbids arrival/RNG',async()=>{
 const h=await start(),G=h.G,c=h.getCapture();
 if(change==='map')G.$gameMap=Object.assign(Object.create(Object.getPrototypeOf(h.map)),h.map);
 if(change==='player')G.$gamePlayer=Object.assign(Object.create(Object.getPrototypeOf(h.player)),h.player);
 if(change==='point')h.player._x++;
 if(change==='manager')G.SceneManager=Object.assign(Object.create(Object.getPrototypeOf(G.SceneManager)),G.SceneManager);
 if(change==='scene')G.SceneManager._scene=Object.assign(Object.create(Object.getPrototypeOf(G.SceneManager._scene)),G.SceneManager._scene);
 assert.equal(h.app.isOwnedRepelSelection(c.owner,c.selection),false);
 for(let n=0;n<6;n++){h.tick();await flush();}
 assert.equal(h.arrivals(),0);assert.equal(h.state().steps,1);assert.equal(h.state().world.repelSteps,0);assert.equal(h.state().stats.repel_count,0);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);
});
test('same-generation cancellation retires only its actual Inventory presentation, preserves prefix and never dispatches arrival',async()=>{
 const h=await start(),c=h.getCapture();h.app.cancelCompletedWorldStep(h.steps[0].input.id);
 await h.pump(()=>h.G.SceneManager._scene instanceof h.G.Scene_Map&&!h.G.PSWorld.pending());
 assert.equal(h.app.saveBlocked,false);assert.equal(h.arrivals(),0);assert.equal(h.replies(),0);assert.equal(h.state().steps,1);assert.equal(h.state().world.repelSteps,0);assert.deepEqual(h.draws,[]);assert.equal(c.hooks.returned(c.handle),false);
});
test('new-generation inventory successor survives old callbacks, reply and scene retirement attempts',async()=>{
 const h=await start(),c=h.getCapture(),scene=h.G.SceneManager._scene;h.app.stateReplacedByHost();const token=h.app.beginInventoryOperation();
 assert.equal(c.hooks.beforeReturn(c.handle,scene),false);assert.equal(c.hooks.returnQueued(c.handle),false);assert.equal(c.hooks.returned(c.handle),false);
 for(let n=0;n<5;n++){h.tick();await flush();}
 assert(h.app.inventorySnapshot(token));assert.equal(h.arrivals(),0);assert.equal(h.replies(),0);assert.equal(h.state().steps,1);assert.equal(h.state().world.repelSteps,0);assert.deepEqual(h.draws,[]);h.app.endInventoryOperation(token);
});
for(const phase of ['opened','returnQueued','returned'])test('last Content drift during '+phase+' cannot adopt or resume a foreign scene',async()=>{
 let changed=false,instance;
 let h=await start({hooks(original,h){instance=h;return Object.freeze(Object.fromEntries(Object.entries(original).map(([key,fn])=>[key,(...args)=>{
   if(key!==phase)return fn(...args);
   const content=h.flow.content;h.flow.content=function(){const value=Reflect.apply(content,this,arguments);if(!changed){changed=true;if(phase==='returnQueued')h.G.SceneManager._nextScene=new h.G.Scene_Map();else h.player._x++;}return value;};
   try{return fn(...args);}finally{h.flow.content=content;}
 }])));}}).catch(error=>{if(phase==='opened'&&changed)return null;throw error;});
 if(!h){assert(changed);h=instance;}else h.choose('no');for(let n=0;n<8;n++){h.tick();await flush();}
 assert(changed);assert.equal(h.replies(),0);assert.equal(h.arrivals(),0);assert.equal(h.state().steps,1);assert.equal(h.state().stats.repel_count,0);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);
});
for(const kind of ['getter','proxy'])test('native optional scene hook '+kind+' is refused without executing unknown code',async()=>{
 const h=await start(),c=h.getCapture();let calls=0;
 const hooks=kind==='getter'?Object.defineProperty({},'opened',{get(){calls++;return()=>true;}}):new Proxy({},{get(){calls++;return()=>true;},getOwnPropertyDescriptor(){calls++;return undefined;}});
 assert.throws(()=>h.G.PSInventory.selectOwnedRepel(c.owner,c.selection,()=>{},hooks),/invalid-owned-repel-scene-hooks/);assert.equal(calls,0);
 h.choose('no');await finish(h);assert.equal(h.arrivals(),1);
});

test('returned receipt failure after native map readiness closes its old lease without a second notice or arrival',async()=>{
 let changed=false;
 const h=await start({hooks(original,h){return {...original,returned(handle){const content=h.flow.content;h.flow.content=function(){const value=Reflect.apply(content,this,arguments);if(!changed){changed=true;h.G.SceneManager._scene._started=false;}return value;};try{return original.returned(handle);}finally{h.flow.content=content;}}};}});
 h.choose('no');for(let n=0;n<8;n++){h.tick();await flush();}
 assert(changed);assert.equal(h.replies(),0);assert.equal(h.arrivals(),0);assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.pending(),false);assert.equal(h.state().steps,1);assert.deepEqual(h.draws,[]);
});
