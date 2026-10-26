'use strict';
// Author regressions for the two fixed-ef8 independent M2 findings. No reference execution or review writes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {E,clone,setup,plan,count,maxHp}=require('./ef-support.cjs');
const intent=x=>({kind:'use-item',itemId:'rarecandy',quantity:1,memberId:x.game.party[0].id});
const answered=(base,slot=0)=>({...base,answers:{learning:[{kind:'replace',slot}]}});
function learning(ports={}){return setup({bag:{rarecandy:1,potion:1},world:{mapId:7},edit:(g,c)=>{c.species.Charizard.learnset={51:['Slash']};g.party[0].hp=1;},...ports});}
for(const field of ['mapId','shadowIds','hyperIds','hmMoves'])test(`M2-01/r2/P52-29/44 query-observed ${field} ABA permanently retires old learning authority`,()=>{
 const reads=[];let world;const x=learning({itemWorld:()=>{reads.push(clone(world));return world;}});world=x.world;
 const t=x.app.beginInventoryOperation(),base=intent(x),before=clone(x.state.current());assert.equal(x.app.inventoryRequest(t,'observed',base).status,'pending');
 world[field]=field==='mapId'?8:field==='hmMoves'?['flamethrower']:[base.memberId];
 x.app.queryItemUse(t,'rarecandy',1,base.memberId);assert.deepEqual(reads.at(-1),world);assert.equal(x.state.replaced.length,0);
 if(field==='mapId')world.mapId=7;else delete world[field];let feedback=0;
 for(const request of [answered(base),answered(base),base,{...base,answers:{cancelled:true}},{...base,quantity:2}]){
  const r=x.app.inventoryRequest(t,'observed',request,()=>feedback++);assert.equal(r.status,'refused');assert.equal(r.reason,'stale-item-selection');assert.deepEqual(x.state.current(),before);assert.equal(x.state.replaced.length,0);assert.equal(x.app.saveBlocked,true);
 }
 assert.deepEqual(reads.slice(0,3),[{mapId:7},{mapId:7,...{[field]:field==='mapId'?8:field==='hmMoves'?['flamethrower']:[base.memberId]}},{mapId:7}]);
 assert.equal(feedback,0);assert.equal(x.draws,0);assert.equal(x.app.inventoryRequest(t,'other',{kind:'change-money',amount:1}).reason,'item-pending');assert.equal(x.app.endInventoryOperation(t).status,'unchanged');assert.equal(x.app.saveBlocked,false);
});
test('M2-01/r2/P52-29/30 query and snapshot observations retain party and inventory ABA protection',()=>{
 for(const entry of ['query-party','snapshot-inventory','ticket-inventory']){
  const x=learning(),t=x.app.beginInventoryOperation(),base=intent(x),original=clone(x.state.current());x.app.inventoryRequest(t,'state-aba',base);const changed=clone(original);
  if(entry==='query-party')[changed.party[0].moves[0],changed.party[0].moves[1]]=[changed.party[0].moves[1],changed.party[0].moves[0]];else changed.inventory.pockets.flat().find(s=>s.itemId==='potion').quantity++;
  x.state.replace(changed);if(entry==='query-party')x.app.queryItemUse(t,'rarecandy',1,base.memberId);else if(entry==='snapshot-inventory')x.app.inventorySnapshot(t);else {const p=changed.inventory.pockets.findIndex(p=>p.length);x.app.inventoryTicket(t,p+1,0);}
  x.state.replace(original);const writes=x.state.replaced.length;for(let i=0;i<2;i++)assert.equal(x.app.inventoryRequest(t,'state-aba',answered(base)).reason,'stale-item-selection');assert.deepEqual(x.state.current(),original);assert.equal(x.state.replaced.length,writes);assert.equal(x.app.saveBlocked,true);x.app.endInventoryOperation(t);
 }
});
test('M2-01/r2/P52-30/44 unchanged queries and a fresh operation retain valid learning and atomic retry',()=>{
 const x=learning(),base=intent(x),old=x.app.beginInventoryOperation();x.app.inventoryRequest(old,'old',base);x.world.mapId=8;x.app.queryItemUse(old,'potion',1,base.memberId);x.world.mapId=7;assert.equal(x.app.inventoryRequest(old,'old',answered(base)).reason,'stale-item-selection');x.app.endInventoryOperation(old);
 const t=x.app.beginInventoryOperation();x.world.hmMoves=['flamethrower'];assert.equal(x.app.queryItemUse(t,'rarecandy',1,base.memberId).eligible,'eligible');assert.equal(x.app.inventoryRequest(t,'fresh',base).status,'pending');assert.equal(x.app.queryItemUse(t,'rarecandy',1,base.memberId).eligible,'eligible');assert.equal(x.app.inventoryRequest(old,'old',answered(base)).reason,'stale-operation');
 const protectedAnswer=x.app.inventoryRequest(t,'fresh',answered(base));assert.equal(protectedAnswer.status,'pending');assert.equal(protectedAnswer.result.selection.reason,'hm-protected');assert.equal(protectedAnswer.result.selection.answerIndex,1); // C queue retains the rejected HM answer before reselecting
 assert.equal(x.app.saveBlocked,true);assert.equal(x.state.replaced.length,0);
 const before=clone(x.state.current()),request=answered(base,1);request.answers.learning=[{kind:'replace',slot:0}];request.answers.learning[protectedAnswer.result.selection.answerIndex]={kind:'replace',slot:1};x.state.failReplace=Error('r2 atomic install failure');assert.equal(x.app.inventoryRequest(t,'fresh',request).reason,'commit-failed');assert.deepEqual(x.state.current(),before);assert.equal(x.app.saveBlocked,true);x.state.failReplace=null;
 assert.equal(x.app.inventoryRequest(t,'fresh',request).status,'committed');assert.equal(x.app.inventoryRequest(t,'fresh',request).status,'duplicate');assert.equal(x.state.replaced.length,1);assert.equal(count(x.state.current(),'rarecandy',x.content),0);assert.deepEqual(x.state.current().party[0].moves.map(m=>m.id),['flamethrower','slash','dragonpulse','roost']);assert.equal(x.draws,0);x.app.endInventoryOperation(t);
 const y=learning(),u=y.app.beginInventoryOperation(),untouched=intent(y);y.app.inventoryRequest(u,'unobserved',untouched);y.world.mapId=8;y.world.mapId=7;assert.equal(y.app.inventoryRequest(u,'unobserved',answered(untouched)).status,'committed');assert.equal(y.state.replaced.length,1);y.app.endInventoryOperation(u);
});
test('M2-01/P52-29/30/45 party edit cannot turn repeated old learning callbacks into fresh authority',()=>{
 const x=learning(),t=x.app.beginInventoryOperation(),base=intent(x);const shown=x.app.inventoryRequest(t,'retained',base);assert.deepEqual(shown.result.selection.moves.map(m=>m.id),['flamethrower','airslash','dragonpulse','roost']);
 const latest=clone(x.state.current());[latest.party[0].moves[0],latest.party[0].moves[1]]=[latest.party[0].moves[1],latest.party[0].moves[0]];x.state.replace(latest);const writes=x.state.replaced.length;
 for(let i=0;i<4;i++){const r=x.app.inventoryRequest(t,'retained',answered(base));assert.equal(r.status,'refused');assert.equal(r.reason,'stale-item-selection');assert.deepEqual(x.state.current(),latest);assert.equal(x.state.replaced.length,writes);assert.equal(x.app.saveBlocked,true);}
 assert.equal(x.app.inventoryRequest(t,'cash',{kind:'change-money',amount:1}).reason,'item-pending');assert.equal(x.draws,0);x.app.endInventoryOperation(t);
});
test('M2-01/P52-29/44 world edit and ABA keep old answers retired, including cancelled or answerless replay',()=>{
 const x=learning(),t=x.app.beginInventoryOperation(),base=intent(x);assert.equal(x.app.inventoryRequest(t,'world',base).status,'pending');const before=clone(x.state.current());x.world.mapId=8;
 for(const request of [answered(base),answered(base),base])assert.equal(x.app.inventoryRequest(t,'world',request).reason,'stale-item-selection');
 x.world.mapId=7;for(const request of [answered(base),base,{...base,answers:{cancelled:true}}])assert.equal(x.app.inventoryRequest(t,'world',request).reason,'stale-item-selection');
 assert.deepEqual(x.state.current(),before);assert.equal(x.state.replaced.length,0);assert.equal(x.app.saveBlocked,true);assert.equal(x.app.endInventoryOperation(t).status,'unchanged');assert.equal(x.app.saveBlocked,false);
 const y=learning(),u=y.app.beginInventoryOperation(),other=intent(y);y.app.inventoryRequest(u,'combined',other);y.world.mapId=8;assert.equal(y.app.inventoryRequest(u,'combined',{...other,quantity:2}).reason,'stale-item-selection');y.world.mapId=7;assert.equal(y.app.inventoryRequest(u,'combined',answered(other)).reason,'stale-item-selection');assert.equal(y.state.replaced.length,0);y.app.endInventoryOperation(u);
});
test('M2-01/P52-44/45 changed base intent cannot release learning lock; original per-move decline remains valid',()=>{
 const x=learning();x.content.species.Charizard.learnset[51]=['Slash','Outrage'];const t=x.app.beginInventoryOperation(),base=intent(x),before=clone(x.state.current());assert.equal(x.app.inventoryRequest(t,'fixed',base).status,'pending');
 for(const changed of [{...base,quantity:2},{...base,itemId:'potion'},{...base,memberId:x.game.party[1].id},{...base,quantity:2,answers:{cancelled:true}}]){
  assert.equal(x.app.inventoryRequest(t,'fixed',changed).status,'refused');assert.equal(x.app.saveBlocked,true);assert.equal(x.app.inventoryRequest(t,'other',{kind:'change-money',amount:1}).reason,'item-pending');assert.deepEqual(x.state.current(),before);
 }
 assert.equal(x.app.inventoryRequest(t,'fixed',{...base,answers:{learning:[{kind:'decline'}]}}).result.selection.kind,'give-up');assert.equal(x.app.inventoryRequest(t,'fixed',{...base,answers:{learning:[{kind:'decline',giveUp:false}]}}).result.selection.kind,'learn');
 const first={kind:'decline',giveUp:true};assert.equal(x.app.inventoryRequest(t,'fixed',{...base,answers:{learning:[first]}}).result.selection.move.id,'outrage');const request={...base,answers:{learning:[first,{kind:'decline',giveUp:true}]}};assert.equal(x.app.inventoryRequest(t,'fixed',request).status,'committed');assert.equal(x.app.inventoryRequest(t,'fixed',request).status,'duplicate');assert.deepEqual(x.state.current().party[0].moves,before.party[0].moves);assert.equal(count(x.state.current(),'rarecandy',x.content),0);assert.equal(x.state.current().party[0].level,51);assert.equal(x.state.replaced.length,1);x.app.endInventoryOperation(t);
});
test('M2-01/P52-30/44 fresh operation and fresh preview can complete, old token cannot disturb the new owner',()=>{
 const x=learning(),old=x.app.beginInventoryOperation(),base=intent(x);x.app.inventoryRequest(old,'old',base);const latest=clone(x.state.current());[latest.party[0].moves[0],latest.party[0].moves[1]]=[latest.party[0].moves[1],latest.party[0].moves[0]];x.state.replace(latest);assert.equal(x.app.inventoryRequest(old,'old',answered(base)).reason,'stale-item-selection');assert.equal(x.app.endInventoryOperation(old).status,'unchanged');
 const fresh=x.app.beginInventoryOperation();assert.notEqual(fresh,old);assert.equal(x.app.queryItemUse(fresh,'rarecandy',1,base.memberId).eligible,'eligible');const shown=x.app.inventoryRequest(fresh,'new',base);assert.deepEqual(shown.result.selection.moves.map(m=>m.id),['airslash','flamethrower','dragonpulse','roost']);assert.equal(x.app.inventoryRequest(old,'old',answered(base)).reason,'stale-operation');assert.equal(x.app.saveBlocked,true);
 const request=answered(base,1);assert.equal(x.app.inventoryRequest(fresh,'new',request).status,'committed');assert.deepEqual(x.state.current().party[0].moves.map(m=>m.id),['airslash','slash','dragonpulse','roost']);assert.equal(x.app.inventoryRequest(fresh,'new',request).status,'duplicate');assert.equal(x.draws,0);x.app.endInventoryOperation(fresh);
});
test('M2-01/P52-29/30 valid pending preserves latest unrelated money and permits install failure retry',()=>{
 const x=learning(),t=x.app.beginInventoryOperation(),base=intent(x);x.app.inventoryRequest(t,'retry',base);const request=answered(base),before=clone(x.state.current());x.state.failReplace=Error('install fails atomically');assert.equal(x.app.inventoryRequest(t,'retry',request).reason,'commit-failed');assert.deepEqual(x.state.current(),before);assert.equal(x.app.saveBlocked,true);
 x.state.failReplace=null;const latest=clone(x.state.current());latest.money=777;x.state.replace(latest);const writes=x.state.replaced.length;const r=x.app.inventoryRequest(t,'retry',request,()=>{throw Error('post-install feedback');});assert.equal(r.status,'committed');assert.equal(r.presentation,'failed');assert.equal(x.state.current().money,777);assert.equal(x.state.replaced.length,writes+1);assert.equal(x.app.inventoryRequest(t,'retry',request).status,'duplicate');assert.equal(x.state.replaced.length,writes+1);x.app.endInventoryOperation(t);
});
test('M2-02/P52-12/32 accepted fraction with rounded-zero recovery refuses before consumption or friendship',()=>{
 const input={manifest:{schema:1,id:'m2-zero-recovery',title:'Synthetic zero recovery'},sources:[{id:'local',kind:'author-placeholder',status:'placeholder',description:'synthetic M2 regression',license:'test',ref:'test',usedFor:['items']}],species:[],overlays:[],items:[{id:'fraction-herb',source:'local',fieldUse:'member',effect:{family:'hp',parameters:{fraction:1000,friendship:'powder'}}}]};const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true);let dexReads=0;const loaded=E.contentRuntime.assembleContent(compiled.data,new Proxy({},{get(){dexReads++;throw Error('Dex stays cold');}}));assert.deepEqual(loaded.errors,[]);assert.equal(dexReads,0);
 const x=setup({edit:(g,c)=>{c.items=loaded.content.items;g.inventory=E.inventory.inventoryFromBag({'fraction-herb':1},c.items);g.party[0].hp=1;}}),t=x.app.beginInventoryOperation(),id=x.game.party[0].id,before=clone(x.state.current());assert.equal(maxHp(before.party[0],x.content),153);const query=x.app.queryItemUse(t,'fraction-herb',1,id);assert.equal(query.ready,true);assert.equal(query.eligible,'ineligible');assert.equal(query.reason,'no-effect');let feedback=0;
 for(let i=0;i<3;i++){const r=x.app.inventoryRequest(t,'zero',{kind:'use-item',itemId:'fraction-herb',quantity:1,memberId:id},()=>feedback++);assert.equal(r.status,'refused');assert.equal(r.reason,'no-effect');assert.deepEqual(x.state.current(),before);}assert.equal(x.state.replaced.length,0);assert.equal(feedback,0);assert.equal(x.draws,0);x.app.endInventoryOperation(t);
});
test('M2-02/P52-12 positive custom fraction and Sitrus101/105 retain floor and actual healing',()=>{
 const x=setup({bag:{potion:1},edit:(g,c)=>{g.party[0].hp=1;c.items.potion.effect={family:'hp',parameters:{fraction:2,friendship:'powder'}};}}),r=plan(x,'potion');assert.equal(r.state.party[0].hp,77);assert.equal(r.result.actualHp,76);assert.equal(r.state.party[0].friendship,65);assert.equal(count(r.state,'potion',x.content),0);
 for(const [baseHp,hp,after]of [[26,101,26],[30,105,27]]){const y=setup({bag:{sitrusberry:1},edit:(g,c)=>{g.party[0].hp=1;c.species.Charizard.base.hp=baseHp;}});assert.equal(maxHp(y.game.party[0],y.content),hp);assert.equal(plan(y,'sitrusberry').state.party[0].hp,after);}
});
test('M2-02/P52-12 status-only Full Restore succeeds at full HP and ordinary positive heal remains valid',()=>{
 const x=setup({bag:{fullrestore:1},edit:g=>{g.party[0].status='brn';}}),r=plan(x,'fullrestore');assert.equal(r.result.actualHp,0);assert.equal(r.state.party[0].hp,x.game.party[0].hp);assert.equal(r.state.party[0].status,'');assert.equal(count(r.state,'fullrestore',x.content),0);
 const y=setup({bag:{potion:1},edit:(g,c)=>{g.party[0].hp=maxHp(g.party[0],c)-1;}});const normal=plan(y,'potion');assert.equal(normal.result.actualHp,1);assert.equal(count(normal.state,'potion',y.content),0);
});
