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
  const code=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
 }
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'fixture'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 fixture=require(path.join(temp,'fixture/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open({lang='en',trainer=false}={}){
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow,content=fixture.musicNativeContent(E,assert),parameters=G.PluginManager.parameters;
 G.PluginManager.parameters=function(name){const p=parameters.call(this,name);return name==='PS_BattleFlow'?{...p,language:lang}:p;};
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=true;
 const state=fixture.musicNativeState(E,content);state.party[0].moves=[{id:'tackle',pp:0,maxpp:35},{id:'growl',pp:40,maxpp:40}];G.$gameSystem._psGame=state;
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
