'use strict';
const test=require('node:test'),plan=require('./e2-status-feedback-scene.json'),H=require('./e2-status-feedback-scene-host.cjs'),{verify}=require('./e2-status-feedback-scene-oracle.cjs');
const {assert,clone}=H;test.before(H.prepare);test.after(H.cleanup);
const observed=h=>({...clone(h.calls.at(-1)),cards:H.cards(h)});
for(const c of plan.cases)test(c.id+' real '+c.kind+' Scene feedback',async()=>{
 let h;try{
  h=await H.open(c);let rows=[],retiredCards,fresh;
  if(c.kind==='toxic'||c.kind==='abort'){
   await H.move(h,1);rows.push(observed(h));
   if(c.kind==='toxic'){rows.push(await H.swap(h,'SCENE-P2'));rows.push(await H.swap(h,'SCENE-P1'));}
   else{
    h.flow.abort(Error('owned real poisoned Scene abort'));await h.frames(3);retiredCards=clone(h.s.statusCardState());H.unchanged(h);
    h.flow.fast=true;h.flow.openBattle({...h.request,battleId:c.id+'/fresh',seq:2});await h.p.inMode('main');const freshScene=h.p.battle();
    const text=[],w=freshScene._status,draw=w.drawText;w.drawText=function(value,...args){text.push({value,args});return draw.call(this,value,...args);};w.refresh();w.drawText=draw;
    fresh={views:clone(freshScene.statusCardState()),text};fresh.card=fresh.views.find(v=>v.side==='p1'&&v.visible);h.flow.abort(Error('owned fresh healthy Scene complete'));await h.frames(2);H.unchanged(h);freshScene.terminate();
    const o={id:c.id,featureIds:c.featureIds,initial:h.initial,input:h.input,rows,retiredCards,fresh,final:{installs:h.installs,outcome:clone(h.flow.lastOutcome),saved:clone(h.flow.game())},fastDuringActions:false,openingFast:true,NW:0,completeHeading:false};verify(c,o);console.log('E2_SCENE_OBSERVATION '+JSON.stringify(o));return;
   }
  }else if(c.kind==='protect'){await H.move(h,1);rows.push(observed(h));await H.move(h,2);rows.push(observed(h));}
  else{await H.move(h,1);rows.push(observed(h));}
  const preCommitInstalls=h.installs,expectedProtectMoveText=h.flow.translator().t('battle.used_move',{user:h.s._names['SCENE-P1'],move:'Protect'}),lines=[...h.lines],final=await H.finish(h,c.kind==='ko');
  const o={id:c.id,featureIds:c.featureIds,initial:h.initial,input:h.input,rows,lines,expectedProtectMoveText,preCommitInstalls,final,fastDuringActions:false,openingFast:true,execution:'COMPILED_SCENE_CONTROLLED_NODE_VM',NW:0,completeHeading:false};verify(c,o);console.log('E2_SCENE_OBSERVATION '+JSON.stringify(o));
 }catch(error){console.log('E2_SCENE_FAILED '+JSON.stringify({id:c.id,mode:h?.s?._mode,calls:h?.calls,lines:h?.lines,installs:h?.installs,error:{name:error.name,message:error.message}}));throw error;}
 finally{h?.cleanup();}
});
