'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('./fixture.cjs');
const id=process.env.PF_E1_SCENARIO,scope=process.env.PF_E1_CASE_ROOT;assert(['FP-BAG-ZH','FP-BAG-EN','FP-357-ZH','FP-357-EN'].includes(id));
const lang=id.endsWith('ZH')?'zh':'en',entry=id.includes('BAG')?'bag':'357';
const texts=lang==='zh'?{refused:'不能在这里用。',bite:'哦！有咬钩！',caught:'钓上来了！',escaped:'宝可梦跑掉了……',noBite:'连咬钩都没有……'}:{refused:"Can't use that here.",bite:'Oh! A bite!',caught:'Landed a Pokémon!',escaped:'The Pokémon got away...',noBite:'Not even a nibble...'};
const results=[];
async function make(name,qualification){const dir=path.join(scope,name);fs.mkdirSync(dir);return fixture({lang,scope:dir,qualification});}
function recovery(h){return h.windows.filter(w=>!w.destroyed&&w.visible).flatMap(w=>w.drawn).some(t=>['Operation unfinished','Travel unfinished','操作尚未完成','移动尚未完成'].includes(t));}
async function enter(h){
 const {G}=h,messageCount=h.messages.length;
 if(entry==='bag'){
  assert(G.PSInventory.showBag());for(let i=0;i<3;i++)h.tick();const E=require(path.join(process.env.PF_E3_JOINT_OUT,'production.cjs'));const pocket=E.itemCatalog.itemOf(E.itemCatalog.catalogOf(h.content),'oldrod').pocket;
  for(let i=0;G.PSInventory.current()?.pocket!==pocket&&i<16;i++)h.press('right');assert.equal(G.PSInventory.current()?.pocket,pocket);h.press('ok');for(let i=0;i<3;i++)h.tick();
  for(let i=0;G.PSInventory.current()?.view.items?.[G.PSInventory.current().view.cursor]?.key!=='use'&&i<16;i++)h.press('down');assert.equal(G.PSInventory.current()?.view.items?.[G.PSInventory.current().view.cursor]?.key,'use');h.press('ok');
 }else{
  const I=new G.Game_Interpreter();I.setup([{code:357,indent:0,parameters:['PS_Management','ShowFieldShortcuts','ShowFieldShortcuts',{}]},{code:355,indent:0,parameters:['this._fishingTail=(this._fishingTail||0)+1;']},{code:0,indent:0,parameters:[]}],0);
  assert.equal(I.executeCommand(),true);assert.equal(I._index,1);I.update();assert.equal(I._fishingTail,1);h.interpreter=I;
  await h.pump(()=>h.windows.some(w=>!w.destroyed&&w.visible&&w.drawn.some(t=>['Shortcuts','快捷菜单'].includes(t))));for(let i=0;i<4;i++)h.tick();h.press('ok');
 }
 await h.pump(()=>h.messages.length>messageCount||recovery(h));
}
test(id+' actual Bag or 357 rejection plus localized host messages',{timeout:120000},async()=>{
 let h=await make('qualification',true);let pass=false;
 try{
  const {G}=h,at={business:h.business.length,math:h.math.length,engine:h.rng.rows.engine.length,effects:h.effects.length,sessions:h.observed.sessions.length};
  for(const reason of ['not-fishable','exit-blocked']){
   const start=h.messages.length;if(reason==='exit-blocked'){const d=G.$dataMap;d.data[(3*d.height+G.$gamePlayer.y)*d.width+G.$gamePlayer.x+1]=2;G.$dataTilesets[1].flags[0]=4;}
   await enter(h);const visible=h.messages.slice(start).map(row=>row.text);assert.deepEqual(visible,[texts.refused]);assert.equal(recovery(h),false,'ordinary qualification never opens travel recovery');assert(!visible.some(t=>/not-fishable|exit-blocked|facts-|request-unavailable/.test(t)));
   assert.equal(h.state().stats.fishing_count,0);assert.equal(h.state().stats.fishing_battles,0);assert.equal(h.business.length,at.business);assert.equal(h.math.length,at.math);assert.equal(h.rng.rows.engine.length,at.engine);assert.equal(h.effects.length,at.effects);assert.equal(h.observed.sessions.length,at.sessions);assert.equal(h.observed.admissions.length,0);
   if(entry==='357'){h.interpreter.update();assert.equal(h.interpreter._fishingTail,1);}
   results.push({reason,messages:visible,zeroOperationRNG:true,zeroPresentation:true,zeroSession:true,canMoveWhileReading:G.$gamePlayer.canMove()});h.ack();await h.pump(()=>!G.$gameMessage.isBusy()&&!G.PSInventory.current()&&!G.PSManagement.fieldPresentationPending());
  }
  assert.equal(h.observed.diagnostics.some(row=>row.args.includes('field-recovery:request-unavailable')),false);h.restore();h=null;
  if(entry==='bag')for(const outcome of ['no-bite','escaped','caught']){
   h=await make(outcome,false);await h.bag();
   if(outcome!=='escaped')await h.finish({cancel:outcome==='no-bite'});
   else{for(let i=0;i<240&&h.G.PSWorld.pending();i++){const effect=h.effects.at(-1);if(['open-message','dots','bite-message','result-message'].includes(effect?.kind)&&h.G.$gameMessage.isBusy())h.ack();h.tick(100);await flush();}assert.equal(h.G.PSWorld.pending(),false);}
   const presented=h.messages.map(row=>row.text);assert(presented.includes(outcome==='no-bite'?texts.noBite:outcome==='escaped'?texts.escaped:texts.caught));if(outcome!=='no-bite')assert(presented.includes(texts.bite+'\\^'));
   if(lang==='en')assert(presented.every(t=>!/[\u3400-\u9fff]/u.test(t)),'English actual host emits no Chinese default message');
   if(outcome==='caught'){await h.pump(()=>!!h.G.PSFlow._op?.session);assert.equal(h.G.PSFlow._op.session.constructor.name,'BattleSession');h.assertOrdinaryHandoff();h.G.PSFlow.abort('bounded-fishing-message-validation');}
   results.push({outcome,messages:h.messages,effects:h.effects.map(e=>e.kind),business:h.business,sessionCount:h.observed.sessions.length});h.restore();h=null;
  }
  pass=true;
 }finally{if(h){results.push({last:h.snapshot(),messages:h.messages});h.restore();}fs.writeFileSync(path.join(scope,'RESULT.json'),JSON.stringify({id,lang,entry,status:pass?'PASS':'FAIL',results},null,2)+'\n',{flag:'wx'});}
});
