'use strict';
const test=require('node:test'),plan=require('./e1-choice-lock-scene.json'),H=require('./e1-choice-lock-scene-host.cjs'),{verify}=require('./e1-choice-lock-scene-oracle.cjs');
const {assert,clone}=H;test.before(H.prepare);test.after(H.cleanup);
for(const c of plan.cases)test(c.id+' real '+c.kind+' compiled Scene',async()=>{
 let h;try{
  h=await H.open(c);await H.move(h,c.setupSlot);const rows=[clone(h.calls.at(-1))];let rejected,lockedMenu;
  if(c.kind==='disable'||c.kind==='taunt'){
   await H.pick(h,'fight');await H.mode(h,'moves');const before=H.live(h.session),at=h.calls.length;
   await H.pick(h,c.rejectedSlot);await H.mode(h,'moves');assert.equal(h.calls.length,at+1);H.unchanged(h);
   rejected={before,after:H.live(h.session),result:clone(h.calls.at(-1).result),mode:h.s._mode,cursor:h.s._menu.index(),names:h.s._menu._items.map(m=>m.name),lines:[...h.lines]};
   await H.pick(h,c.legalSlot);await H.mode(h,'main');rows.push(clone(h.calls.at(-1)));H.unchanged(h);
  }else{
   await H.pick(h,'fight');await H.mode(h,'moves');lockedMenu={names:h.s._menu._items.map(m=>m.name),ready:h.s.inputState().ready,automaticEncore:clone(h.session.gw.query('p1','automatic-encore'))};
   await H.pick(h,1);await H.mode(h,'main');rows.push(clone(h.calls.at(-1)));H.unchanged(h);
   await H.move(h,3);rows.push(clone(h.calls.at(-1)));
  }
  const preCommitInstalls=h.installs,actualMoveCalls=h.calls.length,final=await H.finish(h),observation={id:c.id,featureIds:c.featureIds,initial:h.initial,input:h.input,rows,rejected,lockedMenu,actualMoveCalls,preCommitInstalls,final,fastDuringActions:false,openingFast:true,execution:'COMPILED_SCENE_CONTROLLED_NODE_VM',NW:0,completeHeading:false};
  verify(c,observation);console.log('E1_SCENE_OBSERVATION '+JSON.stringify(observation));
 }catch(error){console.log('E1_SCENE_FAILED '+JSON.stringify({id:c.id,mode:h?.s?._mode,rows:h?.calls,lines:h?.lines,installs:h?.installs,error:{name:error.name,message:error.message}}));throw error;}
 finally{h?.cleanup();}
});
