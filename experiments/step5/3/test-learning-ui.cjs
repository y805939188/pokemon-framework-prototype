'use strict';
// Real application + bundled MZ adapters in a VM. Synthetic service inputs, not physical keyboard/NW evidence.
const test=require('node:test'),assert=require('node:assert/strict');
const {host,disposeBuild}=require('../2/inventory-ui-host.cjs');
const {world,E,clone}=require('./fixtures/postbattle/helpers.cjs');test.after(disposeBuild);
function setup({full=true,edit,port,worldPort,hostOptions={}}={}){
 const w=world({port,contentPort:c=>({content:c,dex:E.dex.createDexLookup()}),extraContent:c=>{c.species.Charizard.tutorMoves=['Gust','Rest','Tackle'];c.species.Charizard.learnset={1:['Flamethrower','Tackle'],99:['Rest']};
  for(const [id,fieldUse,consumable]of [['study-tr','tr',true],['study-tm','tm',false],['study-hm','hm',false]])c.items[id]={...c.items.potion,id,name:id,namePlural:id,pocket:4,flags:[],fieldUse,battleUse:'none',battleId:undefined,legacyIds:[],consumable,move:'gust'};
 }});
 const game=clone(w.state.current());game.party[0].item='';game.party[0].ball='pokeball';game.party[0].friendship=99;if(!full)game.party[0].moves=game.party[0].moves.slice(0,1);
 for(const id of ['study-tr','study-tm','study-hm'])game.inventory=E.inventory.addItems(game.inventory,id,2,w.content.items,E.inventory.inventoryPolicy(w.content));
 edit?.(game,w.content);w.state.replace(game);w.state.replaced.length=0;
 if(worldPort)w.app=new E.app.GameApplication({state:w.state,content:()=>({content:w.content}),sessions:w.sessions,projection:w.projection,itemWorld:worldPort});
 const h=host({application:w,...hostOptions}),view=()=>h.G.PSProgression.current();
 const choose=key=>{h.ready();for(let n=0;view()?.page.rows[view().page.cursor]?.key!==key&&n<60;n++)h.press('down');assert.equal(view()?.page.rows[view().page.cursor]?.key,key);h.press('ok');};
 return {...w,...h,id:game.party[0].id,p:view,chooseG:choose,learn:source=>h.G.PSProgression.learn({kind:'teach',memberId:game.party[0].id,source:source??{kind:'tutor',moveId:'gust'}})};
}
const count=w=>E.inventory.itemQuantity(w.state.current().inventory,'study-tr',w.content.items);
test('G1 tutor full moves starts Yes; refusal keeps state and statistics, event can finish',()=>{
 const w=setup(),before=clone(w.state.current()),h=w.learn();w.ready();assert.equal(w.p().page.kind,'confirm');assert.equal(w.p().page.cursor,0);assert(w.app.saveBlocked);
 w.chooseG('no');assert.equal(w.p().page.kind,'message');assert.deepEqual(w.state.current(),before);w.chooseG('close');assert(h.done);assert(!w.app.saveBlocked);
});
test('G1 slot Back asks give-up; No returns old slots; fifth move Yes declines with zero writes',()=>{
 const w=setup(),before=clone(w.state.current());w.learn();w.chooseG('yes');assert.equal(w.p().page.kind,'moves');w.press('cancel');w.ready();assert.equal(w.p().page.kind,'confirm');w.chooseG('no');assert.equal(w.p().page.kind,'moves');w.chooseG('new');w.chooseG('yes');w.chooseG('close');assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);
});
test('G1 HM-protected slot reselects; success writes once before completion, then no repeated selection',()=>{
 const w=setup();const parent=w.app.beginInventoryOperation('bag');assert.equal(w.app.beginLearning({kind:'teach',memberId:w.id,source:{kind:'machine',itemId:'study-hm',entry:'bag'}},{kind:'inventory',token:parent}).status,'pending');let p=w.app.pendingLearning;w.app.resolveLearning(p.token,p.revision,{kind:'learn',answer:{kind:'replace',slot:0}});w.app.endInventoryOperation(parent);w.state.replaced.length=0;
 w.learn({kind:'tutor',moveId:'rest'});w.chooseG('yes');w.chooseG('0');assert(w.p().page.error.includes('HM'));assert.equal(w.state.replaced.length,0);w.chooseG('1');assert.equal(w.state.current().party[0].moves[1].id,'rest');assert.equal(w.state.replaced.length,1);w.chooseG('close');assert(!w.app.saveBlocked);
});
test('G1 reminder preserves candidate/teach/inner give-up/exit three cancellation layers',()=>{
 const w=setup(),before=clone(w.state.current());w.G.PSProgression.learn({kind:'relearn',memberId:w.id});w.chooseG('tackle');w.chooseG('no');assert.equal(w.p().page.kind,'candidates');w.chooseG('tackle');w.chooseG('yes');w.chooseG('new');w.chooseG('yes');assert.equal(w.p().page.kind,'candidates');w.press('cancel');w.ready();w.chooseG('no');assert.equal(w.p().page.kind,'candidates');w.press('cancel');w.ready();w.chooseG('yes');w.chooseG('close');assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);
});
test('G1 reminder actual replacement preserves nested history and increments reminder once',()=>{
 const w=setup();w.G.PSProgression.learn({kind:'relearn',memberId:w.id});w.chooseG('tackle');w.chooseG('yes');w.press('cancel');w.ready();w.chooseG('no');w.chooseG('1');assert.equal(w.state.current().party[0].moves[1].id,'tackle');assert.equal(w.state.current().stats.moves_taught_by_reminder,1);assert.equal(w.state.replaced.length,1);w.chooseG('close');
});
test('G1 independent forget confirms, Back retains, HM permitted; last move stays blocked until cancel',()=>{
 const w=setup({edit:g=>{g.party[0].moves=g.party[0].moves.slice(0,2);}});w.G.PSProgression.learn({kind:'forget',memberId:w.id});w.chooseG('0');w.chooseG('no');assert.equal(w.state.replaced.length,0);w.chooseG('0');w.chooseG('yes');w.chooseG('close');assert.equal(w.state.current().party[0].moves.length,1);
 w.G.PSProgression.learn({kind:'forget',memberId:w.id});w.chooseG('0');w.chooseG('yes');assert.equal(w.p().page.kind,'forget');assert(w.p().page.error);assert.equal(w.state.current().party[0].moves.length,1);w.press('cancel');w.ready();w.chooseG('close');assert(!w.app.saveBlocked);
});
test('G1 empty candidate state is exit-capable; zero old moves accepts learning without slot UI',()=>{
 const w=setup({edit:(g,c)=>{g.party[0].moves=[];g.party[0].firstMoves=[];c.species.Charizard.learnset={};}});w.G.PSProgression.learn({kind:'relearn',memberId:w.id});assert.equal(w.p().page.kind,'message');w.chooseG('close');assert(!w.app.saveBlocked);w.learn();assert.equal(w.state.current().party[0].moves[0].id,'gust');w.chooseG('close');
});
test('G1 held input on entry and simultaneous Back/Use do not cross prompt boundary',()=>{
 const w=setup();w.input.pressed.add('ok');w.input.trigger.add('ok');w.learn();w.ready();w.tick();assert.equal(w.p().page.kind,'confirm');assert.equal(w.p().page.cursor,0);w.input.pressed.clear();w.tick();w.chooseG('yes');w.input.trigger.add('cancel');w.input.trigger.add('ok');w.input.pressed.add('cancel');w.input.pressed.add('ok');w.tick();assert.equal(w.p().page.kind,'confirm');assert.equal(w.state.replaced.length,0);w.tick();assert.equal(w.p().page.kind,'confirm');w.input.pressed.clear();w.tick();w.chooseG('yes');w.chooseG('close');
});
test('G1 reload invalidates old UI without touching a new transaction',()=>{
 const w=setup();w.learn();const old=clone(w.app.pendingLearning);w.app.stateReplacedByHost();w.app.beginLearning({kind:'forget',memberId:w.id});const fresh=clone(w.app.pendingLearning);w.tick();assert.equal(w.app.pendingLearning.token,fresh.token);assert.notEqual(old.token,fresh.token);assert.equal(w.p(),null);assert(w.app.saveBlocked);w.app.resolveLearning(fresh.token,fresh.revision,{kind:'technical-terminate'});
});
test('G1 before-write failure supports retry/technical exit without duplicate cost',()=>{
 let fail=true;const w=setup({port:state=>({read:()=>state.read(),replace:next=>{if(fail)throw Error('before-write');state.replace(next);}})});w.learn();w.chooseG('yes');w.chooseG('0');assert.equal(w.p().page.kind,'recovery');assert.equal(w.state.replaced.length,0);fail=false;w.chooseG('retry');assert.equal(w.state.replaced.length,1);w.chooseG('close');assert(!w.app.saveBlocked);
});
test('G1 scene interruption releases its own pending operation; stale completion callback is suppressed',()=>{
 const w=setup(),before=clone(w.state.current());let done=0;w.G.PSProgression.learn({kind:'teach',memberId:w.id,source:{kind:'tutor',moveId:'gust'}},()=>done++);w.ready();w.manager._scene.terminate();assert(!w.app.pendingLearning);assert(!w.app.saveBlocked);assert.deepEqual(w.state.current(),before);assert.equal(done,0);
});
test('G1 window/create/render failures retain zero writes and release safe operation',()=>{
 for(const options of [{windowFailures:1},{attachFailures:1}]){const w=setup({hostOptions:options}),before=clone(w.state.current());const h=w.learn();w.tick();assert(h.done);assert.deepEqual(w.state.current(),before);assert(!w.app.saveBlocked);}
 const w=setup();w.learn();w.setDrawFault(()=>true);w.ready();assert.equal(w.state.replaced.length,0);assert(!w.app.saveBlocked);w.setDrawFault(null);
});
test('G1 real Bag TR through bundled adapters holds parent, installs once and consumes once',()=>{
 const w=setup(),h=w.G.PSInventory.useItem('study-tr',w.id);w.ready();w.press('ok');w.ready();w.choose('yes');w.ready();assert(w.p());assert(w.app.saveBlocked);assert.equal(count(w),2);w.chooseG('yes');w.chooseG('1');assert.equal(count(w),1);assert.equal(w.state.current().party[0].moves[1].id,'gust');assert.equal(w.state.current().stats.moves_taught_by_item,1);assert(w.state.current().party[0].firstMoves.includes('gust'));w.chooseG('close');assert(h.done);assert.equal(h.result.status,'committed');assert(!w.app.saveBlocked);
});
test('G1 Bag TM cancel consumes nothing and normal bag target returns to a usable layer',()=>{
 const w=setup(),before=clone(w.state.current());const h=w.G.PSInventory.showBag();w.pocket(4);w.press('down');w.press('ok');w.choose('use');w.ready();w.press('ok');w.choose('yes');assert(w.view().view.items.some(row=>row.label.includes('ABLE')));w.choose(w.id);w.chooseG('no');w.chooseG('close');assert.equal(w.view().view.kind,'bag');assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'study-tm',w.content.items),2);assert.deepEqual(w.state.current().party,before.party);w.press('cancel');assert(h.done);assert(!w.app.saveBlocked);
});
test('G1 author commands wait and release; clear aborts only their own operation',()=>{
 const w=setup(),i=w.pluginCommand('PS_Progression','TeachMove',{memberId:w.id,moveId:'gust',source:'tutor'});w.ready();assert(i.updateWaitMode());w.chooseG('no');w.chooseG('close');assert.equal(i.updateWaitMode(),false);
 const j=w.pluginCommand('PS_Progression','ForgetMove',{memberId:w.id});assert(w.app.pendingLearning);j.clear();assert.equal(w.app.pendingLearning,null);assert(!w.app.saveBlocked);
});
test('G1 long Chinese/English labels retain measured PP column and fit selectable rows',()=>{
 for(const language of ['zh','en']){const w=setup();w.G.language=language;w.G.PSFlow.translator=()=>({t:(key,p)=>E.i18n.translatorFor(language).t(key,p),font:()=>'',tOr:(key,fallback)=>key.startsWith('move.name.')?(language==='zh'?'超长中文招式名称'.repeat(24):'Very long localized move name '.repeat(6)):fallback});w.learn();w.chooseG('yes');const rows=w.drawCalls.filter(c=>c.op==='drawText');assert(rows.some(c=>c.args[0].endsWith(' PP')));assert(rows.some(c=>c.args[0].includes('…')));for(const row of rows)assert(row.args[3]>0);w.press('cancel');w.ready();w.chooseG('yes');w.chooseG('close');}
});

test('G1 party Use machine preserves parent ownership and branch-specific source effects',()=>{
 const w=setup();w.G.PSManagement.openParty();w.ready();w.press('ok');w.managementChoose('item');w.managementChoose('use');w.ready();w.pocket(4);w.press('ok');w.choose('use');w.ready();w.press('ok');w.choose('yes');w.chooseG('yes');w.chooseG('1');assert.equal(count(w),1);assert.equal(w.state.current().stats.moves_taught_by_item,0);assert(!w.state.current().party[0].firstMoves.includes('gust'));w.chooseG('close');assert(w.G.PSManagement.current());assert(w.app.saveBlocked);w.press('cancel');w.ready();w.press('cancel');w.ready();w.press('cancel');assert(!w.app.saveBlocked);
});
test('G1 partial installation retains app barrier and provides explicit title/load recovery',()=>{
 const w=setup({port:state=>({read:()=>state.read(),replace:next=>{const partial=clone(state.current());partial.money++;state.replace(partial);throw Error('partial-write');}})});
 w.G.Scene_Title=function(){};w.G.Scene_Title.prototype={create(){},start(){},update(){}};w.learn();w.chooseG('yes');w.chooseG('0');assert.equal(w.p().page.kind,'recovery');assert(w.p().page.rows.some(r=>r.key==='reload'));w.chooseG('terminate');assert(w.app.saveBlocked);w.chooseG('reload');assert(w.manager._scene instanceof w.G.Scene_Title);assert(w.app.saveBlocked);assert.equal(w.p(),null);w.app.stateReplacedByHost();assert(!w.app.saveBlocked);
});

test('G1 real deferred MZ initialize→create refuses cleared and old-generation requests before app begin',()=>{
 for(const action of ['clear','reload'])for(const full of [false,true]){const w=setup({full,hostOptions:{deferredCreate:true}}),before=clone(w.state.current());const i=w.pluginCommand('PS_Progression','TeachMove',{memberId:w.id,moveId:'gust',source:'tutor'});assert(w.G.PSFlow.operationPending());if(action==='clear')i.clear();else w.app.stateReplacedByHost();w.tick();w.ready();assert.equal(w.state.replaced.length,0);assert.deepEqual(w.state.current(),before);assert.equal(w.app.pendingLearning,null);assert(!w.app.saveBlocked);assert.equal(i.updateWaitMode(),false);}
});
test('G1 annotations distinguish egg, known, compatible and incompatible with zero install; details expose real move directory',()=>{
 const w=setup(),before=clone(w.state.current());let rows=w.app.teachingCandidates({kind:'machine',itemId:'study-tr',entry:'bag'});assert.equal(rows[0].annotation,'able');assert.deepEqual(w.state.current(),before);let state=clone(before);state.party[0].moves[0]={id:'gust',pp:35,maxpp:35,ppUps:0};w.state.replace(state);assert.equal(w.app.teachingCandidates({kind:'machine',itemId:'study-tr',entry:'bag'})[0].annotation,'learned');state.party[0].isEgg=true;w.state.replace(state);assert.equal(w.app.teachingCandidates({kind:'machine',itemId:'study-tr',entry:'bag'})[0].annotation,'not-able');assert.equal(w.app.describeLearningMove('gust').pp,35);assert.equal(w.app.describeLearningMove('gust').type,'Flying');assert.equal(w.app.describeLearningMove('gust').power,40);assert(w.app.describeLearningMove('gust').description);assert.equal(w.app.describeLearningMove('not-a-move'),null);
});

test('G1 authored/localized move name is retained while details come from the pinned Dex',()=>{
 const w=setup({edit:(g,c)=>{c.moves.Gust.name='阵风'.repeat(60);}}),info=w.app.describeLearningMove('gust');assert.equal(info.name,'阵风'.repeat(60));assert.equal(info.power,40);w.learn();w.chooseG('yes');assert(w.p().text.some(t=>t.includes('…')));w.press('cancel');w.ready();w.chooseG('yes');w.chooseG('close');
});

test('G1 reservation stays continuous during window construction/attach and rechecks cancellation there',()=>{
 for(const hook of ['windowHook','attachHook'])for(const action of ['observe','clear','reload']){let interpreter,seen;const w=setup({full:false,hostOptions:{deferredCreate:true,[hook]:G=>{seen=G.PSFlow.operationPending();if(action==='clear')interpreter.clear();else if(action==='reload')G.PSFlow.app().stateReplacedByHost();}}});interpreter=w.pluginCommand('PS_Progression','TeachMove',{memberId:w.id,moveId:'gust',source:'tutor'});w.tick();assert.equal(seen,true);if(action==='observe'){assert.equal(w.state.replaced.length,1);w.chooseG('close');}else{assert.equal(w.state.replaced.length,0);assert.equal(w.app.pendingLearning,null);assert.equal(interpreter.updateWaitMode(),false);assert(!w.app.saveBlocked);}}
});

function realDeferredManager(w){const m=w.manager;m._scene=new w.G.Scene_Map();m._nextScene=null;m.goto=function(C){this._nextScene=new C();};m.push=function(C){this.goto(C);};m.isSceneChanging=function(){return !!this._nextScene;};return m;}
test('G1-SECOND-01 abandoned/replaced/terminated scenes retire handles and release only their reservation',()=>{
 for(const mode of ['same','reload','terminate']){const w=setup(),m=realDeferredManager(w),before=clone(w.state.current());const h=w.learn(),old=m._nextScene;if(mode==='reload')w.app.stateReplacedByHost();if(mode==='terminate')old.terminate();m.goto(w.G.Scene_Map);m._scene=m._nextScene;m._nextScene=null;w.tick();assert(h.done);assert.equal(w.G.PSFlow.operationPending(),false);assert.equal(w.app.pendingLearning,null);assert.deepEqual(w.state.current(),before);const next=w.learn();assert(next&&!next.done);const fresh=m._nextScene;old.create();old.terminate();assert(!next.done);assert(w.G.PSFlow.operationPending());m._scene=fresh;m._nextScene=null;fresh.create();assert(w.app.pendingLearning);fresh.terminate();assert(!w.app.saveBlocked);}
});
test('G1-SECOND-02 parent close is once across pending/installed/cancelled lesson interruption',()=>{
 for(const phase of ['pending','installed','cancelled']){const w=setup(),done=[];let ends=0;const end=w.app.endInventoryOperation.bind(w.app);w.app.endInventoryOperation=(...a)=>{ends++;return end(...a);};const h=w.G.PSInventory.useItem('study-tr',w.id,1,o=>done.push(clone(o)));w.ready();w.press('ok');w.choose('yes');if(phase==='installed'){w.chooseG('yes');w.chooseG('1');}if(phase==='cancelled')w.chooseG('no');const source=w.manager._scene;source.terminate();source.terminate();w.manager._scene=new w.G.Scene_Map();for(let n=0;n<4;n++)w.tick();assert.equal(done.length,1);assert.equal(ends,1);assert(h.done);assert(!w.app.saveBlocked);assert.equal(count(w),phase==='installed'?1:2);assert.equal(done[0].status,phase==='installed'?'committed':'cancelled');if(phase==='installed')assert.equal(done[0].presentation,'failed');}
});
test('G1 interrupted machine partial installation reports recovery and preserves app save barrier',()=>{
 const w=setup({port:state=>({read:()=>state.read(),replace:next=>{const partial=clone(state.current());partial.money++;state.replace(partial);throw Error('partial');}})}),done=[];const h=w.G.PSInventory.useItem('study-tr',w.id,1,o=>done.push(o));w.ready();w.press('ok');w.choose('yes');w.chooseG('yes');w.chooseG('0');assert(w.app.saveBlocked);w.manager._scene.terminate();w.manager._scene=new w.G.Scene_Map();w.tick();assert.equal(done.length,1);assert.equal(h.result.status,'refused');assert.equal(h.result.reason,'learning-recovery-required');assert(w.app.saveBlocked);w.app.stateReplacedByHost();assert(!w.app.saveBlocked);
});
