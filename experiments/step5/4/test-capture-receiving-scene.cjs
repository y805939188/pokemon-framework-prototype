'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('./capture-receiving-scene-host.cjs'),plan=require('./capture-receiving-scene-plan.json'),{E,clone}=H;
test.before(H.prepare);test.after(H.dispose);
const bagCount=(game,id)=>game.inventory.pockets.flat().filter(row=>row.itemId===id).reduce((n,row)=>n+row.quantity,0);
for(const c of plan.cases)test(c.id+' capture terminal to nickname No and '+c.destination,async()=>{
 let h;const stages=[];try{
  h=await H.open({lang:c.lang,members:c.members,caseId:c.id});const s=h.s._session,originalIds=h.before.party.map(m=>m.id),stage=name=>{stages.push({name,frame:h.G.Graphics.frameCount,installs:h.installs(),blocked:h.app.saveBlocked,running:h.flow.running,receiving:clone(h.G.PSManagement.current()),persistent:clone(h.flow.game())});};
  assert.equal(h.flow.fast,false);assert.equal(h.app.saveBlocked,true);assert.equal(bagCount(h.before,'masterball'),2);stage('battle-main');
  await H.battlePick(h,'bag');await H.battlePick(h,'masterball');await H.battlePick(h,'use');await h.p.inMode('end');
  assert.equal(s.finished,true);assert.equal(s.ended.reason,'caught');assert.equal(s.bag.masterball,1);assert.equal(h.installs(),0);assert.deepEqual(h.flow.game(),h.before);assert.equal(h.G.PSManagement.current(),null);assert.equal(h.app.saveBlocked,true);stage('terminal-before-confirm');
  await h.frames(1);h.s.onMenuOk();await h.waitFor(()=>h.G.PSManagement.current()?.ready&&h.G.PSManagement.current().view.kind==='menu','nickname receiving menu');
  const pending=clone(h.app.pendingReceiving);assert(pending&&pending.members.length===1);const caughtId=pending.members[0].id;assert(!originalIds.includes(caughtId));assert.equal(h.M._scene._psManagement,true);assert.equal(h.flow.running,true);assert.equal(h.app.saveBlocked,true);assert.equal(h.installs(),0);assert.deepEqual(h.flow.game(),h.before);
  const nickname=h.G.PSManagement.current();assert.deepEqual(Array.from(nickname.view.items,x=>x.key),['yes','no']);assert.equal(nickname.view.items[1].label,c.lang==='zh'?'否':'No');assert(nickname.text.some(line=>c.lang==='zh'?line.includes('昵称'):line.includes('nickname')));stage('nickname-before-No');
  await H.receivingPick(h,'no');
  if(c.destination==='box'){
   await h.waitFor(()=>h.G.PSManagement.current()?.ready&&h.G.PSManagement.current().view.items?.some(x=>x.key==='box'),'full party placement menu');const menu=h.G.PSManagement.current();assert(menu.view.items.some(x=>x.key==='party'));assert.equal(menu.view.items.find(x=>x.key==='box').label,c.lang==='zh'?'送入盒子':'Send to a box');assert.equal(h.installs(),0);assert.deepEqual(h.flow.game(),h.before);assert.equal(h.app.pendingReceiving.token,pending.token);assert.equal(h.app.saveBlocked,true);stage('full-party-before-box');
   // Normal Back from the replacement picker cancels only that choice. It must
   // not install a partial capture or lose the stable pending identity/token.
   await H.receivingPick(h,'party');await h.waitFor(()=>h.G.PSManagement.current()?.ready&&h.G.PSManagement.current().view.kind==='party','replacement picker');
   const pendingBeforeBack=clone(h.app.pendingReceiving);stage('replacement-before-cancel');await h.p.press('cancel');
   await h.waitFor(()=>h.G.PSManagement.current()?.ready&&h.G.PSManagement.current().view.kind==='menu','placement after picker cancel');
   assert.deepEqual(h.app.pendingReceiving,pendingBeforeBack);assert.equal(h.app.pendingReceiving.members[0].id,caughtId);assert.equal(h.installs(),0);assert.deepEqual(h.flow.game(),h.before);assert.equal(h.app.saveBlocked,true);assert.equal(h.flow.running,true);stage('replacement-cancel-isolated');
   await H.receivingPick(h,'box');
  }
  await h.waitFor(()=>!h.flow.running&&!h.app.saveBlocked&&h.G.PSManagement.current()===null,'completed normal receiving');
  const saved=clone(h.flow.game()),result=clone(h.flow.lastResult),outcome=clone(h.flow.lastOutcome);assert.equal(h.installs(),1);assert.equal(outcome.commit,'applied');assert.equal(h.app.pendingReceiving,null);assert.equal(bagCount(saved,'masterball'),1);assert.equal(result.captured.length,1);assert.equal(result.captured[0].id,caughtId);assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));assert.deepEqual(Object.keys(saved.appliedBattles),[c.id]);assert(saved.dex.owned.includes('pidgey'));assert.equal(saved.dex.hasDex,false);
  const stored=saved.storage.boxes.flatMap(box=>box.slots).filter(Boolean),inParty=saved.party.find(m=>m.id===caughtId),inBox=stored.find(m=>m.id===caughtId);assert.equal(saved.party.length,c.destination==='party'?c.members+1:c.members);assert.equal(!!inParty,c.destination==='party');assert.equal(!!inBox,c.destination==='box');assert.equal(stored.length,c.destination==='box'?1:0);assert.deepEqual(saved.party.filter(m=>m.id!==caughtId).map(m=>m.id),originalIds);assert.equal((inParty??inBox).nickname,pending.members[0].nickname,'No keeps the original captured nickname representation');
  for(const before of h.before.party){
   const after=saved.party.find(m=>m.id===before.id),patch=result.members[before.id];assert(after&&patch);assert.equal(after.hp,before.hp);assert.equal(after.status,before.status);assert.deepEqual(after.moves,before.moves);
   for(const key of ['level','exp','evs','friendship'])if(Object.hasOwn(patch,key))assert.deepEqual(after[key],patch[key],'normal capture growth mirrors the actual result');
   for(const [key,value]of Object.entries(before))if(!['level','exp','hp','status','statusCount','moves','evs','friendship'].includes(key))assert.deepEqual(after[key],value,'unwritten original member field '+key);
  }
  stage('completed');h.s.onEnd();await h.frames(3);assert.equal(h.installs(),1);assert.deepEqual(h.flow.game(),saved);assert.equal(h.flow.running,false);assert.equal(h.app.saveBlocked,false);
  console.log('D2_CAPTURE_RECEIVING_SCENE_OBSERVATION '+JSON.stringify({id:c.id,lang:c.lang,destination:c.destination,caughtId,initial:h.before,stages,result,outcome,saved,installs:h.installs(),receivingNotices:clone(h.flow.lastReceivingNotice??null),product:h.product,defaultSelectionObservation:nickname.view.items[nickname.view.cursor]?.key??null,NW:0,APP:0,completeD2:false}));
 }catch(error){console.log('D2_CAPTURE_RECEIVING_SCENE_FAILED_OBSERVATION '+JSON.stringify({id:c.id,stages,current:h?{mode:h.M._scene?._mode,management:clone(h.G.PSManagement.current()),pending:clone(h.app.pendingReceiving),installs:h.installs(),blocked:h.app.saveBlocked,running:h.flow.running,outcome:clone(h.flow.lastOutcome),saved:clone(h.flow.game())}:null,error:{name:error.name,message:error.message},NW:0}));throw error;
 }finally{h?.cleanup();}
});
