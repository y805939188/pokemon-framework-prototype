'use strict';
// Actual GameApplication/pure plans/save gates, controlled source and I/O failures; no NW or physical input claim.
const test=require('node:test'),assert=require('node:assert/strict');
const{world,E,clone}=require('./fixtures/postbattle/helpers.cjs');
function setup({full=true,port,worldPort=()=>({mapId:5}),contentPort,initial}={}){
 const w=world({initial,extraContent:c=>{c.species.Charizard.tutorMoves=['Gust','Rest','Tackle'];c.species.Charizard.learnset={1:['Flamethrower','Tackle'],99:['Rest']};
  const template=c.items.potion;for(const[id,fieldUse,consumable]of[['study-tr','tr',true],['study-tm','tm',false],['study-hm','hm',false]])c.items[id]={...template,id,name:id,namePlural:id,pocket:4,flags:[],fieldUse,battleUse:'none',battleId:undefined,legacyIds:[],consumable,move:'gust'};
  c.settings.TAUGHT_MACHINES_KEEP_OLD_PP=true;
 }});
 let game=clone(w.state.current());if(!full)game.party[0].moves=game.party[0].moves.slice(0,1);game.party[0].item='';game.party[0].ball='pokeball';game.party[0].friendship=99;
 for(const id of ['study-tr','study-tm','study-hm'])game.inventory=E.inventory.addItems(game.inventory,id,2,w.content.items,E.inventory.inventoryPolicy(w.content));
 w.state.replace(game);w.state.replaced.length=0;
 let app;app=new E.app.GameApplication({state:port?port(w.state,()=>app):w.state,content:()=>contentPort?contentPort(w.content):({content:w.content}),
 sessions:w.sessions,projection:w.projection,itemWorld:worldPort,random:()=>0,clock:()=>0});w.app=app;
 w.id=game.party[0].id;w.answer=decision=>{const p=app.pendingLearning;assert(p);return app.resolveLearning(p.token,p.revision,decision);};
 w.machine=(itemId='study-tr',entry='bag')=>{let parent;if(entry==='party'){const token=app.beginManagement();parent={token,memberId:w.id};w.management=token;}
  const token=app.beginInventoryOperation(entry==='party'?'item':'bag',parent);w.inventory=token;
  return app.beginLearning({kind:'teach',memberId:w.id,source:{kind:'machine',itemId,entry}},{kind:'inventory',token});};return w;
}
const quantity=(w,id='study-tr')=>E.inventory.itemQuantity(w.state.current().inventory,id,w.content.items);
test('bag TR atomically installs moves/PP, friendship, firstMoves, item and statistics; duplicate answer is zero write',()=>{
 const w=setup(),before=clone(w.state.current()),r=w.machine();assert.equal(r.status,'pending');assert(w.app.saveBlocked);assert.deepEqual(w.state.current(),before);
 assert.equal(w.app.endInventoryOperation(w.inventory).reason,'child-operation-active');assert.equal(w.app.inventoryRequest(w.inventory,'blocked',{kind:'change-money',amount:5}).status,'refused');
 const p=w.app.pendingLearning,answer={kind:'learn',answer:{kind:'replace',slot:0}},done=w.app.resolveLearning(p.token,p.revision,answer);assert.equal(done.status,'committed');
 const next=w.state.current();assert.equal(next.party[0].moves[0].id,'gust');assert.equal(next.party[0].moves[0].pp,Math.min(before.party[0].moves[0].pp,35));assert.equal(next.party[0].moves[0].ppUps,0);
 assert.equal(next.party[0].friendship,100);assert(next.party[0].firstMoves.includes('gust'));assert.equal(next.stats.moves_taught_by_item,1);assert.equal(quantity(w),1);assert.equal(w.state.replaced.length,1);
 assert.deepEqual(w.app.resolveLearning(p.token,p.revision,answer),done);assert.equal(w.state.replaced.length,1);assert(!w.app.saveBlocked);w.app.endInventoryOperation(w.inventory);
 assert.deepEqual(E.saveSchema.validateGameContent(next,w.content),[]);
});
test('party machine binds management child and has no bag wrapper stat or new TR record; both entries apply replacement friendship',()=>{
 const w=setup(),before=clone(w.state.current());assert.equal(w.machine('study-tr','party').status,'pending');assert.equal(w.app.endManagement(w.management).reason,'child-operation-active');
 assert.equal(w.answer({kind:'learn',answer:{kind:'replace',slot:0}}).status,'committed');const next=w.state.current();assert.equal(next.party[0].friendship,100);assert.equal(next.stats.moves_taught_by_item,0);assert.deepEqual(next.party[0].firstMoves,before.party[0].firstMoves);assert.equal(quantity(w),1);
 assert.equal(w.app.endInventoryOperation(w.inventory).status,'unchanged');assert.equal(w.app.endManagement(w.management).status,'unchanged');assert(!w.app.saveBlocked);
});
test('empty machine slot, reusable TM/HM and historical friendship256 preserve source branch semantics',()=>{
 const w=setup({full:false});const state=clone(w.state.current());state.party[0].friendship=256;w.state.replace(state);w.state.replaced.length=0;
 assert.equal(w.machine('study-tm').status,'committed');assert.equal(w.state.current().party[0].friendship,256);assert.equal(quantity(w,'study-tm'),2);assert.equal(w.state.current().party[0].moves.at(-1).pp,35);w.app.endInventoryOperation(w.inventory);
 const x=setup();assert.equal(x.machine('study-hm').status,'pending');assert.equal(x.answer({kind:'learn',answer:{kind:'replace',slot:0}}).status,'committed');assert.equal(quantity(x,'study-hm'),2);
});
test('tutor/generic wrappers, invalid compatibility and no public debug bypass; refused begin releases owner',()=>{
 const w=setup({full:false});assert.equal(w.app.beginLearning({kind:'teach',memberId:w.id,source:{kind:'tutor',moveId:'gust'}}).status,'committed');assert.equal(w.state.current().stats.moves_taught_by_tutor,1);assert.equal(w.app.saveBlocked,false);
 const before=clone(w.state.current());assert.equal(w.app.beginLearning({kind:'teach',memberId:w.id,source:{kind:'generic',moveId:'gust'}}).reason,'already-known');assert(!w.app.pendingLearning);assert.equal(w.app.saveBlocked,false);assert.deepEqual(w.state.current(),before);
 assert.equal(w.app.beginLearning({kind:'teach',memberId:w.id,source:{kind:'generic',moveId:'surgingstrikes',debug:true}}).reason,'compatibility-unavailable');assert(!w.app.pendingLearning);
});
test('decline confirmation cannot poison history; HM replacement rejected but independent forgetting allows it and rejects last move',()=>{
 const w=setup();w.machine();let p=w.app.pendingLearning;assert.equal(w.answer({kind:'learn',answer:{kind:'replace',slot:99}}).status,'refused');assert.equal(w.app.pendingLearning.revision,p.revision);
 assert.equal(w.answer({kind:'learn',answer:{kind:'decline'}}).view.selection.kind,'give-up');assert.equal(w.answer({kind:'learn',answer:{kind:'decline',giveUp:false}}).status,'pending');
 assert.equal(w.answer({kind:'learn',answer:{kind:'decline',giveUp:true}}).status,'unchanged');assert.equal(quantity(w),2);assert.equal(w.state.replaced.length,0);w.app.endInventoryOperation(w.inventory);
 const x=setup();const s=clone(x.state.current());s.party[0].moves=[{id:'gust',pp:1,maxpp:35,ppUps:0},{id:'tackle',pp:35,maxpp:35,ppUps:0}];x.state.replace(s);x.state.replaced.length=0;
 assert.equal(x.app.beginLearning({kind:'forget',memberId:x.id}).status,'pending');assert.equal(x.answer({kind:'forget',slot:0}).status,'committed');assert.equal(x.state.current().party[0].moves[0].id,'tackle');
 assert.equal(x.app.beginLearning({kind:'forget',memberId:x.id}).status,'pending');assert.equal(x.answer({kind:'forget',slot:0}).reason,'last-move');assert.equal(x.answer({kind:'forget',slot:null}).status,'cancelled');assert(!x.app.saveBlocked);
});
test('reminder candidate/confirmation/inner cancellation return to list; only successful result adds reminder statistic',()=>{
 const w=setup({full:false});assert.equal(w.app.beginLearning({kind:'relearn',memberId:w.id}).status,'pending');let p=w.app.pendingLearning;const candidate=p.selection.candidates[0];assert(candidate);
 assert.equal(w.answer({kind:'relearn',answer:{kind:'select',moveId:candidate,teach:false}}).view.selection.kind,'candidate');
 assert.equal(w.answer({kind:'relearn',answer:{kind:'exit'}}).view.selection.kind,'exit');assert.equal(w.answer({kind:'relearn',answer:{kind:'exit',confirmed:false}}).view.selection.kind,'candidate');
 assert.equal(w.answer({kind:'relearn',answer:{kind:'select',moveId:candidate,teach:true}}).status,'committed');assert.equal(w.state.current().stats.moves_taught_by_reminder,1);
});
test('zero-write retry and post-write throw retain exactly one installation and resource effect',()=>{
 let fail=true;const w=setup({port:state=>({read:()=>state.read(),replace:next=>{if(fail)throw Error('injected before write');state.replace(next);}})});w.machine();assert.equal(w.answer({kind:'learn',answer:{kind:'replace',slot:0}}).status,'pending');assert(w.app.saveBlocked);assert.equal(quantity(w),2);fail=false;assert.equal(w.answer({kind:'retry'}).status,'committed');assert.equal(quantity(w),1);assert.equal(w.state.replaced.length,1);
 const x=setup({port:state=>({read:()=>state.read(),replace:next=>{state.replace(next);throw Error('injected after write');}})});x.machine();assert.equal(x.answer({kind:'learn',answer:{kind:'replace',slot:0}}).status,'committed');assert.equal(quantity(x),1);assert.equal(x.state.replaced.length,1);
});
test('partial write refuses technical exit and blocks save until explicit host restore; before-write exit is always available',()=>{
 const w=setup({port:state=>({read:()=>state.read(),replace:next=>{const bad=clone(state.current());bad.money++;state.replace(bad);throw Error('injected partial');}})});w.machine();assert(w.answer({kind:'learn',answer:{kind:'replace',slot:0}}).view.reloadRequired);
 assert.equal(w.answer({kind:'technical-terminate'}).status,'refused');assert(w.app.saveBlocked);w.app.stateReplacedByHost();assert(!w.app.pendingLearning);assert(!w.app.saveBlocked);
 const x=setup();x.machine();const before=clone(x.state.current());assert.equal(x.answer({kind:'technical-terminate'}).status,'technically-terminated');assert.deepEqual(x.state.current(),before);assert.equal(x.state.replaced.length,0);x.app.endInventoryOperation(x.inventory);
});
test('observed content/world ABA permanently retires selection, but can terminate with no write',()=>{
 for(const kind of ['content','world']){let map=5,alternate=false;const w=setup({worldPort:()=>({mapId:map}),contentPort:c=>({content:alternate?{...c,meta:{...c.meta,contentIdentity:'b'.repeat(64)}}:c})});w.machine();if(kind==='content')alternate=true;else map=6;
  assert.equal(w.answer({kind:'learn',answer:{kind:'replace',slot:0}}).status,'pending');if(kind==='content')alternate=false;else map=5;
  assert.equal(w.answer({kind:'learn',answer:{kind:'replace',slot:0}}).status,'pending');assert.equal(w.state.replaced.length,0);assert.equal(w.answer({kind:'technical-terminate'}).status,'technically-terminated');}
});
test('first state read cannot reenter another operation; host reload/old answer cannot clear new owner',()=>{
 let hook;const w=setup({port:(state,getApp)=>({read:()=>{hook?.(getApp());return state.read();},replace:next=>state.replace(next)})});let errors=[];hook=app=>{hook=null;try{app.beginInventoryOperation();}catch(e){errors.push(e.message);}assert.equal(app.healParty().status,'refused');};
 assert.equal(w.app.beginLearning({kind:'forget',memberId:w.id}).status,'pending');assert(errors.length);const old=clone(w.app.pendingLearning);w.app.stateReplacedByHost();assert.equal(w.app.beginLearning({kind:'forget',memberId:w.id}).status,'pending');
 assert.equal(w.app.resolveLearning(old.token,old.revision,{kind:'technical-terminate'}).status,'refused');assert(w.app.pendingLearning);assert(w.app.saveBlocked);w.answer({kind:'technical-terminate'});
});
test('learning refuses HM replacement without cost; independent forgetting uses its separate HM-permitting path',()=>{
 const w=setup();w.machine('study-hm');w.answer({kind:'learn',answer:{kind:'replace',slot:0}});w.app.endInventoryOperation(w.inventory);const before=clone(w.state.current());
 assert.equal(w.app.beginLearning({kind:'teach',memberId:w.id,source:{kind:'tutor',moveId:'rest'}}).status,'pending');const kept=w.answer({kind:'learn',answer:{kind:'replace',slot:0}});assert.equal(kept.view.selection.reason,'hm-protected');assert.deepEqual(w.state.current(),before);
 assert.equal(w.answer({kind:'technical-terminate'}).status,'technically-terminated');w.app.beginLearning({kind:'forget',memberId:w.id});assert.equal(w.answer({kind:'forget',slot:0}).status,'committed');assert(!w.state.current().party[0].moves.some(m=>m.id==='gust'));
});
test('lost readback keeps proof/owner; retry confirms installed next once and never doubles the TR or stat',()=>{
 let unread=false;const w=setup({port:state=>({read:()=>{if(unread)throw Error('injected readback unavailable');return state.read();},replace:next=>{state.replace(next);unread=true;}})});w.machine();const p=w.answer({kind:'learn',answer:{kind:'replace',slot:0}});assert.equal(p.status,'pending');assert(w.app.saveBlocked);assert.equal(quantity(w),1);assert.equal(w.state.replaced.length,1);
 assert.equal(w.answer({kind:'technical-terminate'}).status,'pending');assert(w.app.saveBlocked);unread=false;assert.equal(w.answer({kind:'retry'}).status,'committed');assert.equal(w.state.replaced.length,1);assert.equal(quantity(w),1);assert.equal(w.state.current().stats.moves_taught_by_item,1);
});
test('prepared next observing a foreign state cannot revive after state ABA; no stale TR plan can be written',()=>{
 let fail=true,writes=0;const w=setup({port:state=>({read:()=>state.read(),replace:next=>{if(fail)throw Error('prewrite');writes++;state.replace(next);}})}),original=clone(w.state.current());w.machine();w.answer({kind:'learn',answer:{kind:'replace',slot:0}});fail=false;
 const changed=clone(original);changed.money++;w.state.replace(changed);assert(w.answer({kind:'retry'}).view.reloadRequired);w.state.replace(original);assert.equal(w.answer({kind:'retry'}).status,'pending');assert.equal(writes,0);assert.equal(quantity(w),2);assert(w.app.saveBlocked);assert.equal(w.answer({kind:'technical-terminate'}).status,'technically-terminated');
});
test('final state-read callback cannot hide changed world facts from the prewrite validation',()=>{
 let map=5,armed=false,reads=0,writes=0;const w=setup({worldPort:()=>({mapId:map}),port:state=>({read:()=>{if(armed&&++reads===3)map=6;return state.read();},replace:next=>{writes++;state.replace(next);}})});w.machine();armed=true;
 assert.equal(w.answer({kind:'learn',answer:{kind:'replace',slot:0}}).status,'pending');assert.equal(map,6);assert.equal(writes,0);assert.equal(quantity(w),2);assert.equal(w.state.current().party[0].friendship,99);assert.equal(w.answer({kind:'technical-terminate'}).status,'technically-terminated');
});
