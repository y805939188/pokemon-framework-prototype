'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {host,disposeBuild}=require('../2/inventory-ui-host.cjs');const {world,E,clone}=require('./fixtures/postbattle/helpers.cjs');test.after(disposeBuild);
function setup({entries=[{method:'Event',parameter:7,target:'Blastoise'}],targetMoves=[],edit,port,options={}}={}){
 const w=world({entries,targetMoves,port,contentPort:c=>({content:c,dex:E.dex.createDexLookup()}),extraContent:c=>{c.items['ui-stone']={...c.items.potion,id:'ui-stone',name:'Stone',fieldUse:'member',battleUse:'none',battleId:undefined,flags:['EvolutionStone'],effect:{family:'evolution',parameters:{}},consumable:true};}}),g=clone(w.state.current());g.inventory=E.inventory.addItems(g.inventory,'ui-stone',2,w.content.items,E.inventory.inventoryPolicy(w.content));edit?.(g,w.content);w.state.replace(g);w.state.replaced.length=0;
 const h=host({application:w,...options}),F=h.G.PSFlow;F.beginEventEvolution=(...a)=>w.app.beginEventEvolution(...a);F.resolveEvolution=(...a)=>w.app.resolveEvolution(...a);F.resolvePokedex=(...a)=>w.app.resolvePokedex(...a);F.resolveTriggeredEvolution=(...a)=>w.app.resolveTriggeredEvolution(...a);
 const p=()=>h.G.PSEvolution.current(),advance=ms=>{h.G.Graphics.frameCount+=Math.ceil(ms*60/1000);h.tick();h.tick();},choose=key=>{h.ready();for(let n=0;p()?.lesson?.rows[p().lesson.cursor]?.key!==key&&n<30;n++)h.press('down');assert.equal(p()?.lesson?.rows[p().lesson.cursor]?.key,key);h.press('ok');};
 const begin=()=>h.G.PSEvolution.event(7,g.party[0].id),intro=()=>{h.ready();h.press('ok');h.ready();advance(1000);h.ready();assert.equal(p().timeline.phase,'animation');},success=()=>{intro();advance(9000);advance(400);assert.equal(p().timeline.phase,'success');advance(4000);h.press('ok');h.ready();};
 return {...w,...h,id:g.party[0].id,p,advance,chooseE:choose,begin,intro,success};
}
test('G2a normal event cancellation during animation commits only cancel and permits exit',()=>{
 const w=setup(),before=clone(w.state.current()),r=w.begin();w.ready();assert(w.app.saveBlocked);w.press('cancel');w.ready();assert.equal(w.p().timeline.phase,'intro');w.advance(1000);w.ready();w.press('cancel');w.advance(400);assert.equal(w.p().timeline.phase,'cancelled');assert.equal(w.state.current().party[0].species,'Charizard');assert.equal(w.state.current().stats.evolutions_cancelled,before.stats.evolutions_cancelled+1);w.press('ok');w.ready();assert(r.done);assert(!w.app.saveBlocked);assert.equal(w.p(),null);
});
test('G2a successful caption precedes body; post-evolution lesson uses G1 model and retains one install per effect',()=>{
 const w=setup({targetMoves:['Gust']}),r=w.begin();w.intro();w.advance(9000);w.advance(400);assert.equal(w.state.current().party[0].species,'Charizard');assert.equal(w.state.current().stats.evolution_count,0);w.advance(4000);w.press('cancel');w.ready();assert.equal(w.state.current().party[0].species,'Blastoise');assert.equal(w.p().layer,'learning');w.chooseE('yes');w.chooseE('1');assert.equal(w.state.current().party[0].moves[1].id,'gust');assert.equal(w.state.current().stats.evolution_count,1);w.chooseE('close');w.ready();assert(r.done);assert(!w.app.saveBlocked);
});
test('G2a last animation round Back cancels before completion and cannot cancel a stone (including touch return)',()=>{
 for(const stone of [false,true]){const w=setup({entries:stone?[{method:'Item',parameter:'ui-stone',target:'Blastoise'}]:undefined});let parent;
  if(stone){parent=w.app.beginInventoryOperation('bag');assert.equal(w.app.beginEvolutionItem(parent,'stone1',{itemId:'ui-stone',memberId:w.id,quantity:1}).status,'pending');w.G.PSEvolution.show();}else w.begin();
  w.intro();w.G.Graphics.frameCount+=540;w.input.trigger.add('cancel');w.input.pressed.add('cancel');w.tick();w.input.pressed.clear();w.tick();assert.equal(w.p().timeline.phase,'flash');w.advance(400);
  if(stone){assert.equal(w.p().timeline.phase,'success');w.manager._scene.popScene();w.tick();assert.equal(w.state.current().party[0].species,'Charizard');w.advance(4000);w.press('ok');w.ready();assert.equal(w.state.current().party[0].species,'Blastoise');assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'ui-stone',w.content.items),1);w.app.endInventoryOperation(parent);}else{assert.equal(w.p().timeline.phase,'cancelled');assert.equal(w.state.current().party[0].species,'Charizard');w.press('ok');w.ready();}
  assert(!w.app.saveBlocked);
 }
});
test('G2a Info message/recent precedes learning, read-only display never repeats registration/counts',()=>{
 const w=setup({targetMoves:['Gust'],edit:g=>g.dex.hasDex=true});w.begin();w.success();assert.equal(w.p().layer,'dex-message');assert(w.app.saveBlocked);const body=clone(w.state.current());w.press('ok');w.ready();assert.equal(w.p().layer,'entry');const recent=clone(w.state.current()),writes=w.state.replaced.length;w.tick();w.tick();assert.equal(w.state.replaced.length,writes);assert.deepEqual(w.state.current(),recent);assert(w.p().text.some(t=>t.includes('Blastoise')));w.press('ok');w.ready();assert.equal(w.p().layer,'learning');w.chooseE('no');w.chooseE('close');w.ready();assert.equal(w.state.current().stats.evolution_count,body.stats.evolution_count);assert(!w.app.saveBlocked);
});
test('G2a pending postbattle owner automatically opens only after map return',async()=>{
 const w=setup({entries:[{method:'Level',parameter:51,target:'Blastoise'}]});await w.finish();assert(w.app.pendingEvolution);w.manager._scene=new w.G.Scene_Map();w.tick();assert(w.p());w.success();w.ready();assert.equal(w.state.current().party[0].species,'Blastoise');assert(!w.app.saveBlocked);
});
test('G2a queued event clear/reload and window callbacks cannot start late work in a new generation',()=>{
 for(const kind of ['clear','reload','window-reload']){let i;const w=setup({options:{deferredCreate:true,...(kind==='window-reload'?{windowHook:G=>G.PSFlow.app().stateReplacedByHost()}:{})}}),before=clone(w.state.current());i=w.pluginCommand('PS_Evolution','EventEvolution',{event:'7',memberId:w.id});assert(w.G.PSFlow.operationPending());if(kind==='clear')i.clear();if(kind==='reload')w.app.stateReplacedByHost();w.tick();w.ready();assert.deepEqual(w.state.current(),before);assert(!w.app.pendingTriggeredEvolution);assert(!w.app.pendingEvolution);assert(!w.app.saveBlocked);assert(!i.updateWaitMode());}
});
test('G2a old active screen does not answer/terminate the new generation owner',()=>{
 const w=setup();w.begin();w.ready();w.app.stateReplacedByHost();assert.equal(w.app.beginEventEvolution({event:7,memberId:w.id}).status,'pending');const fresh=clone(w.app.pendingTriggeredEvolution);w.tick();assert.equal(w.app.pendingTriggeredEvolution.token,fresh.token);assert(w.app.saveBlocked);assert.equal(w.p().owner,fresh.token);assert.equal(w.p().generation,1);assert.equal(w.state.replaced.length,0);w.app.resolveTriggeredEvolution(fresh.token,fresh.revision,{kind:'technical-terminate'});
});
test('G2a zero-write installation failure permits retry without repeating animation or consumption',()=>{
 let fail=true;const w=setup({port:state=>({read:()=>state.read(),replace:next=>{if(fail)throw Error('before-body');state.replace(next);}})});w.begin();w.success();assert.equal(w.p().layer,'recovery');assert.equal(w.state.current().party[0].species,'Charizard');fail=false;w.press('ok');w.ready();assert.equal(w.state.current().party[0].species,'Blastoise');assert.equal(w.state.current().stats.evolution_count,1);assert(!w.app.saveBlocked);
});
test('G2a unsafe partial installation keeps barrier and gives explicit title/load recovery',()=>{
 const w=setup({port:state=>({read:()=>state.read(),replace:next=>{const bad=clone(state.current());bad.money++;state.replace(bad);throw Error('partial');}})});w.G.Scene_Title=function(){};w.G.Scene_Title.prototype={create(){},start(){},update(){}};w.begin();w.success();assert.equal(w.p().layer,'recovery');assert(w.app.saveBlocked);w.press('down');w.press('down');w.press('ok');assert(w.manager._scene instanceof w.G.Scene_Title);assert(w.app.saveBlocked);w.app.stateReplacedByHost();assert(!w.app.saveBlocked);
});
test('G2a scene termination before body retains original state and restores captured music once',()=>{
 const w=setup(),calls=[];w.G.AudioManager={saveBgm:()=>({name:'MapTheme',pos:12}),stopBgm:()=>calls.push('stop'),replayBgm:bgm=>calls.push(bgm.name)};const before=clone(w.state.current());w.begin();w.ready();w.manager._scene.terminate();assert.deepEqual(w.state.current(),before);assert(!w.app.saveBlocked);assert.equal(calls.filter(x=>x==='MapTheme').length,1);
});
test('G2a interrupted Info never rolls back installed acquisition and auto UI does not steal trade draft',()=>{
 const w=setup({edit:g=>g.dex.hasDex=true});assert.equal(w.app.receiveGift({kind:'normal',member:{species:'Pidgey',level:3}}).status,'applied');const installed=clone(w.state.current());w.G.PSEvolution.show();w.ready();w.manager._scene.terminate();assert.deepEqual(w.state.current(),installed);assert(!w.app.saveBlocked);
 const t=setup();assert.equal(t.app.beginTrade('owner1',{outgoingId:t.id,incoming:{species:'Pidgey'}}).status,'pending');t.manager._scene=new t.G.Scene_Map();t.tick();assert.equal(t.p(),null);assert.equal(t.G.PSEvolution.event(7,t.id),null);assert(t.app.pendingTrade);assert(!t.app.pendingTriggeredEvolution);
});
test('G2a window fault leaves pending source recoverable without endless automatic opening',()=>{
 const w=setup({options:{windowFailures:1}});w.app.beginEventEvolution({event:7,memberId:w.id});w.G.PSEvolution.show();w.ready();assert(w.app.pendingEvolution);assert.equal(w.p(),null);const before=clone(w.state.current());w.tick();w.tick();assert.deepEqual(w.state.current(),before);w.G.PSEvolution.show();w.ready();assert(w.p());w.manager._scene.terminate();assert(!w.app.saveBlocked);
});

test('G2a abandoned initialized event request retires without later action or save/entry leak',()=>{
 for(const reload of [false,true]){const w=setup(),m=w.manager;m._scene=new w.G.Scene_Map();m._nextScene=null;m.goto=function(C){this._nextScene=new C();};m.push=function(C){this.goto(C);};m.isSceneChanging=function(){return !!this._nextScene;};const before=clone(w.state.current()),h=w.begin(),old=m._nextScene;if(reload)w.app.stateReplacedByHost();m.goto(w.G.Scene_Map);m._scene=m._nextScene;m._nextScene=null;w.tick();assert(h.done);assert(!w.G.PSFlow.operationPending());assert(!w.app.pendingEvolution&&!w.app.pendingTriggeredEvolution);old.create();old.terminate();assert.deepEqual(w.state.current(),before);assert(!w.app.saveBlocked);}
});

test('G2a a stale screen cannot restore an old BGM into the new generation',()=>{
 const w=setup(),calls=[];w.G.AudioManager={saveBgm:()=>({name:'OldMap'}),stopBgm(){},replayBgm:()=>calls.push('old')};w.begin();w.ready();w.app.stateReplacedByHost();w.tick();assert.deepEqual(calls,[]);
});
test('G2a no-window failure presents independent retry/title choices on the healthy map',()=>{
 const w=setup({options:{windowFailures:1}});let callback;w.G.$gameMessage.setChoices=(rows,initial,cancel)=>{assert.equal(rows.length,2);};w.G.$gameMessage.setChoiceCallback=fn=>callback=fn;w.G.PSEvolution.event(7,w.id);w.ready();assert(callback);assert(!w.app.pendingEvolution&&!w.app.saveBlocked);callback(0);w.tick();w.ready();assert(w.p());assert(w.app.pendingEvolution);w.manager._scene.terminate();assert(!w.app.saveBlocked);
});

test('G2a repeated evolution move intents ask again after a confirmed give-up',()=>{
 const w=setup({targetMoves:['Gust','Gust']});w.begin();w.success();w.chooseE('no');assert.equal(w.p().lesson.kind,'message');w.chooseE('close');assert.equal(w.p().lesson.kind,'confirm');w.chooseE('yes');w.chooseE('1');w.chooseE('close');assert.equal(w.state.current().party[0].moves[1].id,'gust');assert(!w.app.saveBlocked);
});
test('G2a empty-slot learning has installed-then-message feedback and holds the original battle host until ACK',async()=>{
 let closes=0;const op={request:{battleId:'postbattle-1'}},w=setup({entries:[{method:'Level',parameter:51,target:'Blastoise'}],targetMoves:['Gust'],edit:g=>{g.party[0].moves=g.party[0].moves.slice(0,1);},options:{flowOverrides:{close(){closes++;this.running=false;}}}});const f=w.G.PSFlow;f.running=true;f.request={battleId:'postbattle-1'};const resolve=f.resolveEvolution;f.resolveEvolution=(...args)=>{const out=resolve(...args);if(!w.app.pendingEvolution&&!w.app.pendingPokedex)f.close(1,op);return out;};await w.finish();w.G.PSEvolution.show();w.success();assert.equal(w.p().layer,'learned');assert(w.state.current().party[0].moves.some(m=>m.id==='gust'));assert(!w.app.saveBlocked);assert(w.G.PSFlow.operationPending());assert.equal(closes,0);assert(f.running);w.press('ok');w.ready();assert.equal(closes,1);assert(!f.running);assert.equal(w.p(),null);
});

test('G2a reconstructed class with no request reports safely; stale finished update cannot replace next scene',()=>{
 const w=setup();let callback;w.G.$gameMessage.setChoices=()=>{};w.G.$gameMessage.setChoiceCallback=fn=>callback=fn;w.begin();w.ready();const old=w.manager._scene,C=old.constructor;old.terminate();w.manager._scene=new C();w.manager._scene.create();assert.equal(callback,undefined);w.tick();assert(!w.app.saveBlocked);
 const x=setup(),r=x.begin();x.ready();const prior=x.manager._scene;prior.terminate();let pops=0;const pop=prior.popScene;prior.popScene=()=>pops++;x.manager.isSceneChanging=()=>true;prior.update();assert.equal(pops,0);prior.popScene=pop;assert(r.done);
});

test('G2a automatic transfer waits for Map start before stopping its message-window lifecycle',async()=>{
 const w=setup({entries:[{method:'Level',parameter:51,target:'Blastoise'}]});await w.finish();const map=new w.G.Scene_Map();let started=false;map.isStarted=()=>started;w.manager._scene=map;w.tick();assert.equal(w.p(),null);assert(w.app.pendingEvolution&&w.app.saveBlocked);started=true;w.tick();assert(w.p());w.manager._scene.terminate();assert(!w.app.saveBlocked);
});

test('G2a queued host received message waits for Map without blocking the owned final learning ACK',async()=>{
 for(const empty of [false,true]){
  let closes=0;const op={request:{battleId:'postbattle-1'}},w=setup({entries:[{method:'Level',parameter:51,target:'Blastoise'}],targetMoves:['Gust'],edit:g=>{if(empty)g.party[0].moves=g.party[0].moves.slice(0,1);},options:{flowOverrides:{close(){closes++;this.running=false;}}}}),f=w.G.PSFlow;
  f.running=true;f.request=op.request;const resolve=f.resolveEvolution;let busy=false;w.G.$gameMessage.isBusy=()=>busy;
  f.resolveEvolution=(...args)=>{const out=resolve(...args);if(!w.app.pendingEvolution&&!w.app.pendingPokedex){f.close(2,op);busy=true;w.G.$gameMessage.add('Received: Blastoise → Party');}return out;};
  await w.finish();w.G.PSEvolution.show();w.success();if(!empty){w.chooseE('yes');w.chooseE('1');}const installed=clone(w.state.current());assert(busy);assert.equal(closes,0);w.press('ok');w.ready();assert.equal(w.p(),null);assert.equal(closes,1);assert(!f.running);assert.deepEqual(w.state.current(),installed);assert(busy,'host message retained for Map');
 }
});
