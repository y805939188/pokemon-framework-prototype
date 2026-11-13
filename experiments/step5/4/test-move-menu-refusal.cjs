'use strict';
// Compiled production Scene, real App/Session/Gen8 and translator.
// Window/input/raster/audio are explicit controlled host ports; no NW claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs'),PLAN=require('./victory-music-native-plan.json');
let temp,plugins,entryText,fixture;
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-move-menu-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
  const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
  let code=fs.readFileSync(path.join(out,name+'.js'),'utf8');
  if(name==='PS_BattleFlow'&&process.env.PF_AUTO_STRUGGLE_TEST_PLUGIN)code=fs.readFileSync(process.env.PF_AUTO_STRUGGLE_TEST_PLUGIN,'utf8');
  if(name==='PS_BattleFlow'&&process.env.PF_MOVE_CURSOR_TEST_MUTATION){assert.equal(process.env.PF_MOVE_CURSOR_TEST_MUTATION,'forget-confirm');const marker='this._menuCursor?.remember(this._mode, this._menu.index(), this._menu._items.length);';assert.equal(code.split(marker).length,2,'one actual compiled confirm memory');code=code.replace(marker,'void 0;');}
  if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
 }
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'fixture'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 fixture=require(path.join(temp,'fixture/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open({lang='en',trainer=false,moves:chosenMoves,encore=false}={}){
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow,content=fixture.musicNativeContent(E,assert),parameters=G.PluginManager.parameters;
 G.PluginManager.parameters=function(name){const p=parameters.call(this,name);return name==='PS_BattleFlow'?{...p,language:lang}:p;};
 if(encore)Object.assign(content.trainers['music-normal'][0].party[0],{species:'snorlax',level:1,moves:['encore']}); // Explicit legal custom-game trainer fixture; slower than the level100 player.
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=true;
 const state=fixture.musicNativeState(E,content);state.party[0].moves=chosenMoves??[{id:'tackle',pp:0,maxpp:35},{id:'growl',pp:40,maxpp:40}];G.$gameSystem._psGame=state;
 const before=JSON.stringify(flow.game());await h.p.toMapId(5,8,9);
 flow.openBattle({kind:trainer?'trainer':'wild',...(trainer?{trainer:{id:'music-normal',version:1}}:{foes:[{species:'Pidgey',level:3}]}),battleId:'move-menu-'+path.basename(h.w.root),seq:1,canLose:true});
 await h.p.inMode('main');const s=h.p.battle(),lines=[],add=s._log.add;s._log.add=function(line){lines.push(line);return add.call(this,line);};
 return{...h,s,flow,before,lines,cleanup(){if(flow.running)flow.abort(Error('owned move-menu cleanup'));}};
}
function choose(h,key){
 const s=h.s,view=s.inputState();assert.equal(view.ready,true,'real semantic input readiness');const at=view.items.findIndex(item=>item.key===key);assert(at>=0,'stable command '+key);s._menu.select(at);s.onMenuOk();
}
function snapshot(h){return JSON.stringify({persistent:h.flow.game(),bag:h.s._session.bag,player:h.s._session.gw.readState('p1'),foe:h.s._session.gw.readState('p2')});}
async function moves(h){choose(h,'fight');await h.p.inMode('moves');assert.equal(h.s._menu.maxCols(),2);}

for(const lang of ['en','zh'])test(lang+' PP0 remains focusable and a real engine refusal returns to the same move cursor without consumption',async()=>{
 const h=await open({lang});try{
  await moves(h);assert.equal(h.s._menu._items.length,2);assert.equal(h.s._menu._list[0].enabled,true,'PP0 must reach the rule validator, not a disabled Window command');
  const before=snapshot(h),s=h.s,session=s._session,original=session.chooseMove;let calls=0,outcome;
  session.chooseMove=async function(...args){calls++;outcome=await original.apply(this,args);return outcome;};
  choose(h,1);await h.waitFor(()=>!s._busy,'real rejection returned');await h.waitFor(()=>s.inputState().ready,'rejection text finished');
  assert.equal(calls,1);assert.equal(outcome.ok,false);assert.equal(outcome.reason,'choice-rejected');assert.equal(s._mode,'moves','rejected move must stay in move menu');
  assert.equal(s._menu.index(),0);assert.equal(snapshot(h),before);assert.equal(JSON.stringify(h.flow.game()),h.before);
  assert(h.lines.includes(lang==='zh'?'这个招式的 PP 已经用完了。':"There's no PP left for this move!"));
  s.onMenuCancel();assert.equal(s._mode,'main');choose(h,'fight');assert.equal(s._mode,'moves');assert.equal(s._menu.index(),0);
 }finally{h.cleanup();}
});
test('after PP0 refusal a different legal move is submitted once, consumes only its PP and returns to main',async()=>{
 const h=await open();try{
  await moves(h);choose(h,1);await h.waitFor(()=>h.s.inputState().ready&&!h.s._busy,'refusal done');assert.equal(h.s._mode,'moves');
  const session=h.s._session,original=session.chooseMove;let calls=0;session.chooseMove=function(...args){calls++;return original.apply(this,args);};
  choose(h,2);await h.p.inMode('main');
  assert.equal(calls,1);const request=session.currentRequest();assert.equal(request.active[0].moves[0].pp,0);assert.equal(request.active[0].moves[1].pp,39);
  assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(session.bag.masterball,2);
 }finally{h.cleanup();}
});
test('disabled and PP-less published request entries remain navigable; view metadata never registers a choice',async()=>{
 const h=await open();try{
  const s=h.s,session=s._session,original=session.currentRequest,before=snapshot(h);
  const request=JSON.parse(JSON.stringify(original.call(session)));request.active[0].moves=[{id:'tackle',move:'Tackle',pp:1,maxpp:35,disabled:'disabled'},{id:'recharge',move:'Recharge',disabled:false}];
  // Explicit projection control only. No claim of applying Disable or Recharge to the engine.
  session.currentRequest=()=>request;
  await moves(h);assert(h.s._menu._list.every(item=>item.enabled===true));h.s._menu.cursorRight();assert.equal(h.s._menu.index(),1);
  assert.equal(h.s._menu._items[1].name,'Recharge');assert(!h.s._menu._items[1].name.includes('undefined'));assert.equal(snapshot(h),before);
  session.currentRequest=original;
 }finally{h.cleanup();}
});
test('trainer Run refusal still returns to the main menu after leaving a refused move menu',async()=>{
 const h=await open({trainer:true});try{
  await moves(h);choose(h,1);await h.waitFor(()=>h.s.inputState().ready&&!h.s._busy,'refusal done');assert.equal(h.s._mode,'moves');
  h.s.onMenuCancel();const before=snapshot(h);choose(h,'run');await h.p.inMode('main');assert.equal(snapshot(h),before);assert.equal(JSON.stringify(h.flow.game()),h.before);assert(h.flow.running);
 }finally{h.cleanup();}
});
test('closing the operation while a refused choice resolves cannot reopen its old move menu',async()=>{
 const h=await open();let release;try{
  await moves(h);const session=h.s._session,original=session.chooseMove;let rejected=false;
  session.chooseMove=async function(...args){const r=await original.apply(this,args);rejected=true;await new Promise(resolve=>{release=resolve;});return r;};
  choose(h,1);await h.waitFor(()=>rejected,'engine refused before host close');h.flow.abort(Error('normal cancelled action'));
  await h.frames(2);release();await h.frames(4);assert.notEqual(h.s._mode,'moves');assert.equal(h.s.inputState().ready,h.s._mode==='end');assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{release?.();h.cleanup();}
});
test('a real fourth-slot PP0 refusal restores that slot, including BACK and reentry, without consuming a choice twice',async()=>{
 const h=await open({moves:[{id:'growl',pp:40,maxpp:40},{id:'protect',pp:10,maxpp:10},{id:'splash',pp:40,maxpp:40},{id:'tackle',pp:0,maxpp:35}]});try{
  await moves(h);h.s._menu.cursorRight();h.s._menu.cursorDown();assert.equal(h.s._menu.index(),3);const before=snapshot(h),session=h.s._session,original=session.chooseMove,calls=[];session.chooseMove=function(...args){calls.push(args[0]);return original.apply(this,args);};
  h.s.onMenuOk();await h.waitFor(()=>h.s.inputState().ready&&!h.s._busy,'fourth-slot refusal finished');assert.equal(h.s._mode,'moves');assert.equal(h.s._menu.index(),3,'rejected non-first slot is restored');assert.deepEqual(calls,[4]);assert.equal(snapshot(h),before);assert.equal(JSON.stringify(h.flow.game()),h.before);
  h.s.onMenuCancel();choose(h,'fight');assert.equal(h.s._menu.index(),3);assert.deepEqual(calls,[4]);
 }finally{h.cleanup();}
});


// Automatic no-move entry: real Gen8 request and action, controlled message/input ports.
const noPP=[{id:'tackle',pp:0,maxpp:35},{id:'growl',pp:0,maxpp:40}];
function trackAutomatic(h){
 const session=h.s._session,original=session.chooseMove,attempts=[],doc=h.G.$gameSystem._psGame;let installs=0,state=doc;
 session.chooseMove=async function(...args){const row={slot:args[0]};attempts.push(row);row.result=await original.apply(this,args);return row.result;};
 Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>state,set:v=>{installs++;state=v;}});
 return{session,attempts,get installs(){return installs;}};
}
async function noMoveNotice(h){
 choose(h,'fight');assert.equal(h.s._mode,'messages','no selectable move must skip the manual move menu');
 await h.waitFor(()=>!!h.s.ordinaryMessageState(),'automatic no-moves notice');
 const step=h.s._ordinaryMessage;assert.equal(step.snapshot().implementation,'paused-message-v1');return step;
}
for(const lang of ['en','zh'])test(lang+' automatic Struggle shows a paused no-moves notice before exactly one real registration',async()=>{
 const h=await open({lang,moves:noPP});try{
  const t=trackAutomatic(h),req=t.session.currentRequest(),before=snapshot(h),engine=t.session.gw.snapshot();
  assert.deepEqual(req.active[0].moves.map(m=>[m.id,m.pp]),[['struggle',undefined]],'pinned Gen8, not a fake disabled-move projection');h.flow.fast=false;
  const step=await noMoveNotice(h);assert.equal(step.snapshot().phase,'typing');assert.equal(t.attempts.length,0);assert.equal(h.s.inputState().ready,false);
  h.s.onMenuOk();h.s.onMenuCancel();assert.equal(t.attempts.length,0);await h.p.press('ok');assert.equal(step.snapshot().phase,'full');assert(h.s._log.pause);assert.equal(t.attempts.length,0);
  assert.equal(h.s._log._lines.join(' '),h.flow.translator().t('ui.moves.none-left',{name:h.s._names[t.session.gw.activeId('p1')]}));
  await h.frames(50);assert.equal(step.snapshot().phase,'full');assert.equal(snapshot(h),before);assert.equal(t.installs,0);
  await h.p.press('ok');await h.waitFor(()=>t.attempts.length===1&&!h.s._busy,'one real Struggle action');assert.equal(step.snapshot().phase,'done');assert.equal(t.attempts[0].slot,1);assert.equal(t.attempts[0].result.ok,true);assert.notEqual(t.session.gw.snapshot(),engine);assert(t.session.gw.readState('p2')[0].fainted,'the actual engine resolves Struggle damage');assert.deepEqual(t.session.party[0].moves.map(m=>m.pp),[0,0]);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);
  h.s.onMenuOk();h.s.onMenuCancel();await h.frames(2);assert.equal(t.attempts.length,1);h.flow.fast=true;await h.p.inMode('end');await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(t.installs,1);h.s.onEnd();assert.equal(t.installs,1);
 }finally{h.cleanup();}
});
test('automatic Struggle submits after the ordinary nonterminal three-second pause without player input',async()=>{
 const h=await open({moves:noPP});try{const t=trackAutomatic(h);h.flow.fast=false;const step=await noMoveNotice(h);await h.waitFor(()=>step.snapshot().phase==='full','natural no-moves full text');const at=step.snapshot().fullyShownAt;while(h.G.performance.now()-at<2960)await h.frames(1);assert.equal(t.attempts.length,0);assert.equal(step.snapshot().phase,'full');await h.frames(4);await h.waitFor(()=>t.attempts.length===1&&!h.s._busy,'automatic Struggle after pause');assert.equal(t.attempts[0].result.ok,true);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
test('fast testing keeps one automatic Struggle action and never requires an extra menu selection',async()=>{
 const h=await open({moves:noPP});try{const t=trackAutomatic(h);choose(h,'fight');assert.notEqual(h.s._mode,'moves');await h.waitFor(()=>t.attempts.length===1&&!h.s._busy,'fast no-moves action');assert.equal(t.attempts[0].result.ok,true);assert.equal(t.installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('one ordinary legal move still opens the manual menu and can return without registering',async()=>{
 const h=await open({moves:[{id:'tackle',pp:35,maxpp:35}]});try{const t=trackAutomatic(h);h.flow.fast=false;await moves(h);assert.equal(h.s._menu._items.length,1);assert.equal(t.attempts.length,0);h.s.onMenuCancel();assert.equal(h.s._mode,'main');assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires a normal no-moves notice without a late automatic action',async()=>{
 const h=await open({moves:noPP});try{const t=trackAutomatic(h);h.flow.fast=false;const step=await noMoveNotice(h),engine=t.session.gw.snapshot();await h.p.press('ok');if(how==='abort')h.flow.abort(Error('owned no-moves abort'));else if(how==='replace')h.flow.stateReplaced();else h.s.terminate();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(5);assert.equal(step.snapshot().phase,'done');assert.equal(t.attempts.length,0);assert.equal(t.session.gw.snapshot(),engine);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
test('an expired published request cannot borrow a completed no-moves notice',async()=>{
 const h=await open({moves:noPP});try{const t=trackAutomatic(h);h.flow.fast=false;const step=await noMoveNotice(h),engine=t.session.gw.snapshot(),original=t.session.currentRequest,request=original.call(t.session);await h.p.press('ok');
  // Explicit request revision control, not a claim that the engine changes a request during an idle notice.
  t.session.currentRequest=()=>({...request,rqid:'controlled-successor-request'});await h.p.press('ok');await h.p.inMode('main');assert.equal(step.snapshot().phase,'done');assert.equal(t.attempts.length,0);assert.equal(t.session.gw.snapshot(),engine);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);t.session.currentRequest=original;
 }finally{h.cleanup();}
});


// Normal singles Encore uses actual engine state plus published permissions, not a one-legal-move heuristic.
async function actualEncore(h){
 const s=h.s._session;assert.deepEqual(s.gw.query('p1','automatic-encore'),{allowed:false});
 await moves(h);choose(h,2);await h.p.inMode('main');
 const legal=s.currentRequest().active[0].moves.filter(E.moveRequests.isSelectableMove);assert.deepEqual(legal.map(m=>m.id),['growl'],'real opponent Encore disabled the other published move');assert.deepEqual(s.gw.query('p1','automatic-encore'),{allowed:true,moveSlot:2});
}
for(const lang of ['en','zh'])test(lang+' actual Encore skips the move menu and submits its permitted non-first slot exactly once',async()=>{
 const h=await open({lang,trainer:true,encore:true,moves:[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40}]});try{
  const t=trackAutomatic(h);await actualEncore(h);assert.equal(t.attempts.length,1);const before=t.session.gw.snapshot();for(let i=0;i<3;i++)assert.deepEqual(t.session.gw.query('p1','automatic-encore'),{allowed:true,moveSlot:2});const hint=t.session.gw.query('p1','automatic-encore');hint.moveSlot=1;assert.equal(t.session.gw.query('p1','automatic-encore').moveSlot,2);assert.equal(t.session.gw.snapshot(),before,'readonly query consumes no request or RNG');
  const modes=[],show=h.s.show;h.s.show=function(mode,...args){modes.push(mode);return show.call(this,mode,...args);};h.flow.fast=false;choose(h,'fight');assert.notEqual(h.s._mode,'moves','valid singles Encore has no manual move selection');assert.equal(h.s.inputState().ready,false);h.s.onMenuOk();h.s.onMenuCancel();await h.waitFor(()=>t.attempts.length===2&&!h.s._busy,'one actual Encore action');await h.p.inMode('main');assert.deepEqual(t.attempts.map(a=>a.slot),[2,2]);assert.equal(t.attempts[1].result.ok,true);assert.equal(modes.includes('moves'),false);assert.equal(t.session.gw.readState('p1')[0].pp.growl,38);assert.equal(t.session.gw.readState('p1')[0].pp.tackle,35);assert(!t.session.gw.readState('p2')[0].fainted);const after=t.session.gw.snapshot();await h.frames(400);assert.equal(t.attempts.length,2);assert.equal(t.session.gw.snapshot(),after);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);
 }finally{h.cleanup();}
});
test('natural Encore expiry restores manual choice before a normal KO and a single final commit',async()=>{
 const h=await open({trainer:true,encore:true,moves:[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40}]});try{
  const t=trackAutomatic(h);await actualEncore(h);for(let i=0;i<3;i++){assert.equal(t.session.gw.query('p1','automatic-encore').moveSlot,2);choose(h,'fight');assert.notEqual(h.s._mode,'moves');await h.waitFor(()=>t.attempts.length===i+2&&!h.s._busy,'next explicit Encore Fight');await h.p.inMode('main');}
  assert.deepEqual(t.attempts.map(a=>a.slot),[2,2,2,2]);assert.equal(t.session.gw.readState('p1')[0].pp.growl,36);assert.deepEqual(t.session.gw.query('p1','automatic-encore'),{allowed:false},'actual engine Encore condition naturally expired');assert.equal(t.installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await moves(h);assert.equal(h.s._menu._items.length,2);choose(h,1);await h.p.inMode('end');assert.equal(t.installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(t.installs,1);assert.equal(h.flow.game().party[0].moves[0].pp,34);assert.equal(h.flow.game().party[0].moves[1].pp,36);h.s.onEnd();assert.equal(t.installs,1);
 }finally{h.cleanup();}
});
test('a query adapter returning allowed without a slot retains manual choice instead of guessing Encore',async()=>{
 const h=await open({trainer:true,encore:true,moves:[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40}]});try{const t=trackAutomatic(h);await actualEncore(h);const gw=t.session.gw,query=gw.query;gw.query=function(side,what,...args){return what==='automatic-encore'?{allowed:true}:query.call(this,side,what,...args);};const before=gw.snapshot();await moves(h);assert.equal(t.attempts.length,1);h.s.onMenuCancel();assert.equal(h.s._mode,'main');assert.equal(gw.snapshot(),before);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);gw.query=query;}finally{h.cleanup();}
});
test('retiring the Encore action owner before its microtask cannot submit into a later operation',async()=>{
 const h=await open({trainer:true,encore:true,moves:[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40}]});try{const t=trackAutomatic(h);await actualEncore(h);const before=t.session.gw.snapshot(),act=h.s.act;let scheduled=0;h.s.act=function(...args){const result=act.apply(this,args);scheduled++;assert.equal(this._busy,true);h.flow.stateReplaced();return result;};choose(h,'fight');await h.frames(4);h.s.onMenuOk();h.s.onMenuCancel();await h.frames(2);assert.equal(scheduled,1);assert.equal(t.attempts.length,1);assert.equal(t.session.gw.snapshot(),before);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
