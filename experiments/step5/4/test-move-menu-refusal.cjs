'use strict';
// Compiled production Scene, real App/Session/Gen8 and translator.
// Window/input/raster/audio are explicit controlled host ports; no NW claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const vm=require('node:vm'),nodeCrypto=require('node:crypto'),{types:{isUint32Array}}=require('node:util');
const nativeFill=nodeCrypto.randomFillSync;
const {observe:observeStateInstalls}=require('../../../scripts/tests/state-install-audit.cjs');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs'),PLAN=require('./victory-music-native-plan.json');
const REACTOR=require('../../../scripts/reactor-source-manifest.json');
let temp,plugins,entryText,fixture,native;
function pinnedMethod(source,name){
 const marker='\n'+name+' = function(',start=source.indexOf(marker),end=source.indexOf('\n};',start);
 assert(start>=0&&end>start&&source.indexOf(marker,start+1)===-1,'single pinned method: '+name);
 return source.slice(start+1,end+3);
}
function pinnedSource(name){
 const bytes=fs.readFileSync(path.join(ROOT,'js',name));
 assert.equal(nodeCrypto.createHash('sha256').update(bytes).digest('hex'),REACTOR.runtime['runtime/'+name],'installed pin: '+name);
 return bytes.toString('utf8');
}
test.before(async()=>{
 const objects=pinnedSource('reactor_objects.js'),core=pinnedSource('reactor_core.js');
 const encounterStep=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')).encounterStep;
 assert(Number.isSafeInteger(encounterStep)&&encounterStep>0,'tracked Map005 encounterStep');
 native={encounterStep,methods:[
  ['Game_Map.prototype.encounterStep',pinnedMethod(objects,'Game_Map.prototype.encounterStep')],
  ['Game_Player.prototype.makeEncounterCount',pinnedMethod(objects,'Game_Player.prototype.makeEncounterCount')],
  ['Math.randomInt',pinnedMethod(core,'Math.randomInt')],
 ]};
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
function installEncounterObserver(G,entropy,returns){
 // Install only the three real bodies in this fixture's existing sandbox.
 // The legacy host still guards all other unprovided native methods.
 G.Game_Map??=function Game_Map(){};
 G.Game_Player??=function Game_Player(){};
 for(const [name,source] of native.methods)vm.runInContext(source,G,{filename:'pinned-move-menu:'+name});
 const math=vm.runInContext('Math',G),randomInt=math.randomInt,makeCount=G.Game_Player.prototype.makeEncounterCount;
 let active=null;
 math.randomInt=function(...args){
  const value=Reflect.apply(randomInt,this,args);
  if(active){
   assert.strictEqual(this,math);assert.deepEqual(args,[native.encounterStep]);
   assert(Number.isSafeInteger(value)&&value>=0&&value<args[0]);
   active.draws.push({limit:args[0],value});
  }
  return value;
 };
 G.Game_Player.prototype.makeEncounterCount=function(...args){
  assert.strictEqual(this,G.$gamePlayer);assert.deepEqual(args,[]);assert.equal(active,null);
  const flow=G.PSFlow,app=flow._app;assert(app,'return retains the actual App');const generation=app.stateGeneration;
  assert.equal(flow.lastOutcome?.commit,'applied','native budget reset follows the primary commit');
  assert.equal(flow.prebattleState().phase,'return-pending');
  const world=JSON.stringify(app.worldEncounterRuntime()),game=JSON.stringify(flow.game()),fills=entropy.fills;
  const row={scene:G.SceneManager._scene,app,generation,draws:[]};returns.push(row);active=row;
  try{const result=Reflect.apply(makeCount,this,args);row.budget=this._encounterCount;return result;}
  finally{
   active=null;
   assert.strictEqual(flow._app,app);assert.equal(app.stateGeneration,generation);
   assert.equal(JSON.stringify(app.worldEncounterRuntime()),world);assert.equal(JSON.stringify(flow.game()),game);
   assert.equal(entropy.fills,fills,'native reset consumes no business RNG');
  }
 };
}
async function open({lang='en',trainer=false,moves:chosenMoves,encore=false,terminalGrowth=false}={}){
 const entropy={imports:0,fills:0},returns=[],expectedFills=trainer?10:8;
 const assertEntropy=()=>assert.deepEqual(entropy,{imports:1,fills:expectedFills},'one lazy crypto import; wild PID+IV=8, trainer ownership PID adds 2');
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{
  productionTranslator:true,beforeProduct(G){
   // Ordinary Flow owns the draws. Exercise the true native call on the very
   // same buffer, then replace its words with the declared synthetic tape.
   const delegate=G.require,vmGlobal=vm.runInContext('globalThis',G),cryptoPort={randomFillSync(words){
    assert.strictEqual(this,cryptoPort);assert.equal(arguments.length,1);
    assert(isUint32Array(words)&&words.length===2,'original cross-realm Uint32Array(2)');
    assert.strictEqual(Reflect.apply(nativeFill,nodeCrypto,[words]),words,'original Node fill returns the same buffer');
    words.fill(0);entropy.fills++;return words;
   }};
   function requireFromThisHost(...args){
    if(args[0]!=='node:crypto')return Reflect.apply(delegate,this,args);
    assert.strictEqual(this,vmGlobal);assert.deepEqual(args,['node:crypto']);entropy.imports++;return cryptoPort;
   }
   requireFromThisHost.resolve=delegate.resolve;G.require=requireFromThisHost;
   installEncounterObserver(G,entropy,returns);
  }
 }}),G=h.G,flow=h.w.flow,content=fixture.musicNativeContent(E,assert),parameters=G.PluginManager.parameters;
 // This retains the controlled preloaded Map port and only gives it Reactor's
 // real encounter-step accessor over the checked-in Map005 data.
 G.$gameMap.encounterStep=G.Game_Map.prototype.encounterStep;G.$dataMap.encounterStep=native.encounterStep;
 G.PluginManager.parameters=function(name){const p=parameters.call(this,name);return name==='PS_BattleFlow'?{...p,language:lang}:p;};
 // Inherited synthetic assembled DTO, not author-compiled bytes or proof of its input hash.
 if(encore)Object.assign(content.trainers['music-normal'][0].party[0],{species:'snorlax',level:1,moves:['encore']});
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();
 const state=fixture.musicNativeState(E,content);
 if(terminalGrowth){
  const member=E.memberFactory.createMember({id:state.party[0].id,species:'Snorlax',level:90},content,()=>0);
  state.party[0]=E.speciesKey.toPersistentMember(member,content);
 }
 state.party[0].moves=chosenMoves??[{id:'tackle',pp:0,maxpp:35},{id:'growl',pp:40,maxpp:40}];G.$gameSystem._psGame=state;
 const before=JSON.stringify(flow.game());await h.p.toMapId(5,8,9);
 const source=h.M._scene,map=G.$gameMap,player=G.$gamePlayer,initialExp=state.party[0].exp;
 assert.deepEqual(entropy,{imports:0,fills:0},'install and Map entry are lazy');
 flow.openBattle({kind:trainer?'trainer':'wild',...(trainer?{trainer:{id:'music-normal',version:1}}:{foes:[{species:'Pidgey',level:3}]}),battleId:'move-menu-'+path.basename(h.w.root),seq:1,canLose:true});
 const op=flow._op;assert.equal(op.prebattleMode,'default-map','normal Map must own the entry');
 await h.p.inMode('main');const s=h.p.battle(),lines=[],add=s._log.add;s._log.add=function(line){lines.push(line);return add.call(this,line);};
 assert.strictEqual(op.session,s._session,'same actual operation and real Session');
 assertEntropy();assert.equal(returns.length,0,'entry must not reset encounters');
 const app=flow.app(),generation=app.stateGeneration;
 return{...h,s,flow,op,before,lines,lang,source,map,player,initialExp,app,generation,entropy,assertEntropy,returns,
  cleanup(){try{if(flow.running)flow.abort(Error('owned move-menu cleanup'));}finally{
   assertEntropy();if(!terminalGrowth)assert.equal(returns.length,0,'unsettled cases never reset native encounters');
  }}};
}
function choose(h,key){
 const s=h.s,view=s.inputState();assert.equal(view.ready,true,'real semantic input readiness');const at=view.items.findIndex(item=>item.key===key);assert(at>=0,'stable command '+key);s._menu.select(at);s.onMenuOk();
}
function snapshot(h){
 const s=h.s._session,engine=JSON.parse(s.gw.snapshot());
 assert(Object.hasOwn(engine,'prng')&&Number.isInteger(engine.turn),'pinned Showdown serializes live PRNG and turn');
 return JSON.stringify({persistent:h.flow.game(),bag:s.bag,player:s.gw.readState('p1'),foe:s.gw.readState('p2'),
  turn:engine.turn,prng:engine.prng,hostFills:h.entropy.fills});
}
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
 const session=h.s._session,original=session.chooseMove,attempts=[],growth=[];let installs=0;
 // The native slot must remain writable own data. Observe the actual install and keep its receiver/descriptor.
 const audit=observeStateInstalls(h.G,()=>{installs++;});
 const cleanup=h.cleanup;h.cleanup=()=>{try{cleanup();assert.deepEqual(audit.errors,[]);}finally{audit.dispose();}};
 session.chooseMove=async function(...args){const row={slot:args[0]};attempts.push(row);row.result=await original.apply(this,args);return row.result;};
 const push=h.s.pushMessages;
 h.s.pushMessages=function(...args){
  for(const m of args[0])if(m.kind==='growth')growth.push({member:m.member,display:E.battlePresentation.readGrowthDisplay(session,m)});
  return Reflect.apply(push,this,args);
 };
 return{session,attempts,growth,get installs(){return installs;}};
}
async function noMoveNotice(h){
 choose(h,'fight');assert.equal(h.s._mode,'messages','no selectable move must skip the manual move menu');
 await h.waitFor(()=>!!h.s.ordinaryMessageState(),'automatic no-moves notice');
 const step=h.s._ordinaryMessage;assert.equal(step.snapshot().implementation,'paused-message-v1');return step;
}

// Passive fixture only: sample the existing wait predicate, never drive an
// extra update, input, clock, random draw, queue operation or owner transition.
function observeTerminalWait(h,t,testContext,captionStart){
 const s=h.s,ids=new WeakMap(),waits=[],problems=[];let nextId=0,current=null;
 const id=handle=>{
  if(handle===null||handle===undefined)return null;
  if(typeof handle!=='object')return typeof handle==='string'?'legacy-string':typeof handle;
  if(!ids.has(handle))ids.set(handle,++nextId);
  return ids.get(handle);
 };
 const protect=read=>{try{read();}catch(error){if(!problems.length)problems.push(String(error));}};
 const sample=(point='predicate')=>protect(()=>{
  const frame=h.G.Graphics.frameCount,sceneUpdate=s._pictureUpdate,now=h.G.performance.now();
  const q=s._queue,head=q[0],step=s._ordinaryMessage,message=step?.snapshot()??null;
  const owner=s._log._battleTextOwner;
  const row={frame,elapsedFrames:frame-current.startFrame,sceneUpdate,now,mode:s._mode,queueLength:q.length,
   head:id(head),owner:id(owner),messageStep:id(step),message,pause:s._log.pause===true,
   sameScene:h.M._scene===s,sameOperation:h.flow._op===h.op,sameSession:h.op.session===t.session,
   sameApplication:h.flow._app===h.app,sameGeneration:h.app.stateGeneration===h.generation,
   running:h.flow.running===true,noOutcome:h.flow.lastOutcome===null,installs:t.installs,returns:h.returns.length};
  const shape=JSON.stringify([row.mode,row.queueLength,row.head,row.owner,row.messageStep,message?.phase,message?.implementation]);
  if(point!=='predicate'||shape!==current.previousShape||row.elapsedFrames%60===0){
   if(current.milestones.length<96)current.milestones.push({...row,point,lines:Array.from(s._log._lines)});
   else current.truncated=true;
  }
  current.previousShape=shape;current.last=row;
 });
 const begin=ordinal=>{current={ordinal,startFrame:h.G.Graphics.frameCount,limitFrames:600,milestones:[],truncated:false};waits.push(current);sample('begin');};
 const emit=(outcome,error)=>protect(()=>{
  const messages=(t.attempts[0]?.result?.messages??[]).map(m=>m.kind==='events'?
   {kind:m.kind,events:m.events.map(e=>({type:e.type,args:Array.from(e.args)}))}:{kind:m.kind});
  const {ended}=t.session;
  testContext.diagnostic('ORDINARY_WAIT_TRACE '+JSON.stringify({version:'en-struggle-owned-terminal-wait-v1',
   lang:h.lang,outcome,error:error?String(error.message):null,problems,
   registeredSlots:t.attempts.map(a=>a.slot),engineEnded:ended?{reason:ended.reason,winner:ended.winner}:null,
   messages,captions:h.lines.slice(captionStart),waits:waits.map(({previousShape,...row})=>row)}));
 });
 return{begin,sample,emit};
}

// An ended Session's ordinary paused pages do not own Continue and never time
// out. Use the existing frame/input host, never a fast flag or queue bypass.
async function acknowledgeWonBattle(h,t,testContext,traceOptions=null){
 const s=h.s,session=t.session;
 assert.equal(session.finished,true);assert.equal(session.ended?.winner,'Player');
 const member=session.party[0],applied=t.growth.filter(row=>row.member===member.id);
 assert.equal(applied.length,1,'one actual owner-bound growth projection for the player');
 const display=applied[0].display;
 assert.equal(display?.version,1);assert.equal(display.fromLevel,90);assert.equal(display.toLevel,90);
 assert.equal(display.fromExp,h.initialExp);const experience=display.toExp-display.fromExp;assert(Number.isSafeInteger(experience)&&experience>0);
 assert.equal(display.segments.length,1);assert(display.segments[0].to>display.segments[0].from);
 assert.equal(member.exp,display.toExp);assert(Object.hasOwn(s._names,member.id));
 const name=s._names[member.id],growthText=h.flow.translator().t('growth.gained',{name,exp:experience});
 assert.equal(growthText,h.lang==='zh'?name+'获得了 '+experience+' 点经验值！':name+' gained '+experience+' Exp. Points!');
 const xpPages=s._log.textPages(growthText).map(page=>JSON.stringify(s._log.textPages(page.join('\n')).flat()));
 assert(xpPages.length>0);
 const ownedBeforeCommit=()=>{
  assert.strictEqual(h.p.battle(),s);assert.strictEqual(h.flow._op,h.op);assert.strictEqual(h.op.session,session);
  assert.strictEqual(h.flow._app,h.app);assert.equal(h.app.stateGeneration,h.generation);
  assert.equal(h.flow.running,true);assert.equal(h.flow.lastOutcome,null);
  assert.equal(t.installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  assert.equal(h.returns.length,0,'native encounter budget is unchanged until Continue');h.assertEntropy();
 };
 const visiblePause=()=>s.ordinaryMessageState()?.implementation==='paused-message-v1'&&
  s.ordinaryMessageState().phase==='full';
 const trace=traceOptions&&observeTerminalWait(h,t,testContext,traceOptions.captionStart);
 let paused=0,xpSeen=0,heldMs=0;
 for(let i=0;i<8&&s._mode!=='end';i++){
  trace?.begin(i);
  try{
   await h.waitFor(()=>{trace?.sample();return s._mode==='end'||visiblePause();},'owned normal terminal page or End',600);
  }catch(error){
   trace?.sample('timeout-final');trace?.emit('ORIGINAL_WAIT_FAILED',error);throw error;
  }
  trace?.sample('predicate-satisfied');
  ownedBeforeCommit();
  if(s._mode==='end')break;
  const step=s._ordinaryMessage,at=step.snapshot().fullyShownAt;
  assert.equal(s.inputState().ready,false);assert.equal(s._log.pause,true);assert.strictEqual(s._log._battleTextOwner,step);
  if(JSON.stringify(s._log._lines)===xpPages[xpSeen])xpSeen++;
  if(xpSeen===1&&heldMs===0){
   await h.frames(184);heldMs=h.G.performance.now()-at;assert(heldMs>=3000);
   assert.strictEqual(s._ordinaryMessage,step,'terminal pause still owns its page past the normal timeout');
   assert.equal(step.snapshot().phase,'full');ownedBeforeCommit();
  }
  await h.p.press('ok');assert.equal(step.snapshot().phase,'done');paused++;ownedBeforeCommit();
 }
 assert(paused>0,'the real fixture victory presents a terminal growth pause');
 assert.equal(xpSeen,xpPages.length,'localized full EXP page(s) appeared under the original text owner');assert(heldMs>=3000);
 assert.equal(s._mode,'end','finite ordinary page acknowledgements reach End');
 trace?.emit('ORIGINAL_WAIT_REACHED_END');
 // Continue is a separate later input. Any additional real end-feedback page
 // advances without writing; only the final Continue may apply the result.
 for(let i=0;i<8&&h.flow.running;i++){
  await h.frames(1);ownedBeforeCommit();assert.equal(s._mode,'end');
  const page=s._endFeedbackPages?s._endFeedbackPage:null;
  choose(h,'end');
  if(h.flow.running){assert.notEqual(page,null);assert.equal(s._endFeedbackPage,page+1);ownedBeforeCommit();}
 }
 const outcome=h.flow.lastOutcome;
 assert.equal(h.flow.running,false);assert.equal(outcome?.commit,'applied');assert.equal(outcome.code,1);assert.equal(outcome.battleId,h.op.request.battleId);
 assert.equal(t.installs,1);assert.equal(h.flow.game().party[0].exp,display.toExp);
 const settled=JSON.stringify(h.flow.game());
 await h.waitFor(()=>h.M._scene instanceof h.G.Scene_Map,'native return Map allocation',120);
 const mapScene=h.M._scene;assert.notStrictEqual(mapScene,h.source,'a fresh Map Scene through original pop');
 assert.equal(mapScene.isStarted(),false,'allocation is not yet a visible return');
 assert.equal(h.flow.prebattleState().phase,'return-pending');assert(h.flow.operationPending());
 assert.equal(h.returns.length,0,'native reset awaits started return Map');
 await h.waitFor(()=>h.flow.prebattleState().phase==='return','native return cover start',120);
 assert.strictEqual(h.M._scene,mapScene);assert(mapScene.isStarted());assert(mapScene.isBusy());
 assert.equal(h.returns.length,1);const reset=h.returns[0];
 assert.strictEqual(reset.scene,mapScene);assert.strictEqual(reset.app,h.app);assert.equal(reset.generation,h.generation);
 assert.deepEqual(reset.draws.map(row=>row.limit),[native.encounterStep,native.encounterStep]);
 assert.equal(reset.budget,reset.draws[0].value+reset.draws[1].value+1);assert.equal(h.player._encounterCount,reset.budget);
 await h.waitFor(()=>h.flow.prebattleState().phase==='done','successful native return cover',300);
 const cover=h.flow.prebattleState(),stages=Array.from(cover.stages).slice(-3);
 assert.deepEqual(stages.map(row=>row.phase),['return-pending','return','done']);
 assert(stages[2].frame>stages[1].frame&&stages[2].at-stages[1].at>=400);
 assert.equal(cover.primaryError,null);assert.equal(cover.cleanupErrors.length,0);assert.equal(outcome.hostErrors?.length??0,0);
 assert.deepEqual(h.w.errors,[]);assert.equal(h.flow.operationPending(),false);assert.equal(h.M.isSceneChanging(),false);assert.equal(mapScene.isBusy(),false);
 assert.strictEqual(h.M._scene,mapScene);assert.strictEqual(h.G.$gameMap,h.map);assert.strictEqual(h.G.$gamePlayer,h.player);
 assert.equal(h.map.mapId(),5);assert.deepEqual([h.player._x,h.player._y],[8,9]);
 assert.strictEqual(h.flow._op,h.op);assert.strictEqual(h.flow._app,h.app);assert.equal(h.app.stateGeneration,h.generation);
 const attempts=t.attempts.length;s.onEnd();await h.frames(2);
 assert.strictEqual(h.M._scene,mapScene);assert.strictEqual(h.flow.lastOutcome,outcome);assert.equal(t.attempts.length,attempts);
 assert.equal(t.installs,1);assert.equal(h.returns.length,1);assert.equal(JSON.stringify(h.flow.game()),settled);h.assertEntropy();
 testContext.diagnostic('ORDINARY_TERMINAL '+JSON.stringify({lang:h.lang,experience,xpPages:xpSeen,heldMs,installs:t.installs,nativeReset:h.returns.length,
  nativeDraws:reset.draws.map(row=>row.limit),business:h.entropy,returnStages:stages.map(row=>row.phase),mapId:h.map.mapId(),hostErrors:outcome.hostErrors?.length??0}));
}
for(const lang of ['en','zh'])test(lang+' automatic Struggle shows a paused no-moves notice before exactly one real registration',async(testContext)=>{
 const h=await open({lang,moves:noPP,terminalGrowth:true});try{
  const t=trackAutomatic(h),req=t.session.currentRequest(),before=snapshot(h),engine=t.session.gw.snapshot();
  assert.deepEqual(req.active[0].moves.map(m=>[m.id,m.pp]),[['struggle',undefined]],'pinned Gen8, not a fake disabled-move projection');
  const step=await noMoveNotice(h);assert.equal(step.snapshot().phase,'typing');assert.equal(t.attempts.length,0);assert.equal(h.s.inputState().ready,false);
  h.s.onMenuOk();h.s.onMenuCancel();assert.equal(t.attempts.length,0);await h.p.press('ok');assert.equal(step.snapshot().phase,'full');assert(h.s._log.pause);assert.equal(t.attempts.length,0);
  assert.equal(h.s._log._lines.join(' '),h.flow.translator().t('ui.moves.none-left',{name:h.s._names[t.session.gw.activeId('p1')]}));
  await h.frames(50);assert.equal(step.snapshot().phase,'full');assert.equal(snapshot(h),before);assert.equal(t.installs,0);
  const traceOptions=lang==='en'?{captionStart:h.lines.length}:null;
  await h.p.press('ok');await h.waitFor(()=>t.attempts.length===1&&!h.s._busy,'one real Struggle action');assert.equal(step.snapshot().phase,'done');assert.equal(t.attempts[0].slot,1);assert.equal(t.attempts[0].result.ok,true);assert.notEqual(t.session.gw.snapshot(),engine);assert(t.session.gw.readState('p2')[0].fainted,'the actual engine resolves Struggle damage');assert.deepEqual(t.session.party[0].moves.map(m=>m.pp),[0,0]);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);
  h.s.onMenuOk();h.s.onMenuCancel();await h.frames(2);assert.equal(t.attempts.length,1);await acknowledgeWonBattle(h,t,testContext,traceOptions);assert.equal(t.attempts.length,1);
 }finally{h.cleanup();}
});
test('automatic Struggle submits after the ordinary nonterminal three-second pause without player input',async()=>{
 const h=await open({moves:noPP});try{const t=trackAutomatic(h);const step=await noMoveNotice(h);await h.waitFor(()=>step.snapshot().phase==='full','natural no-moves full text');const at=step.snapshot().fullyShownAt;await h.waitFor(()=>h.G.performance.now()-at>=2960,'finite pre-timeout frames',184);assert(h.G.performance.now()-at<3000);assert.equal(t.attempts.length,0);assert.equal(step.snapshot().phase,'full');await h.frames(4);await h.waitFor(()=>t.attempts.length===1&&!h.s._busy,'automatic Struggle after pause');assert.equal(t.attempts[0].result.ok,true);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
test('a forged fast field cannot bypass the ordinary no-moves notice on the default artifact',async()=>{
 const h=await open({moves:noPP});try{
  const t=trackAutomatic(h),before=snapshot(h);h.flow.fast=true;
  const step=await noMoveNotice(h);assert.equal(step.snapshot().phase,'typing');
  await h.p.press('ok');assert.equal(step.snapshot().phase,'full');assert.equal(h.s.inputState().ready,false);
  await h.frames(50);assert.equal(step.snapshot().phase,'full');assert.equal(t.attempts.length,0);assert.equal(snapshot(h),before);
  await h.p.press('ok');await h.waitFor(()=>t.attempts.length===1&&!h.s._busy,'one normal Struggle after acknowledgement');
  assert.equal(step.snapshot().phase,'done');assert.equal(t.attempts[0].slot,1);assert.equal(t.attempts[0].result.ok,true);
  assert.equal(t.installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
test('one ordinary legal move still opens the manual menu and can return without registering',async()=>{
 const h=await open({moves:[{id:'tackle',pp:35,maxpp:35}]});try{const t=trackAutomatic(h);await moves(h);assert.equal(h.s._menu._items.length,1);assert.equal(t.attempts.length,0);h.s.onMenuCancel();assert.equal(h.s._mode,'main');assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires a normal no-moves notice without a late automatic action',async()=>{
 const h=await open({moves:noPP});try{const t=trackAutomatic(h);const step=await noMoveNotice(h),engine=t.session.gw.snapshot();await h.p.press('ok');if(how==='abort')h.flow.abort(Error('owned no-moves abort'));else if(how==='replace')h.flow.stateReplaced();else h.s.terminate();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(5);assert.equal(step.snapshot().phase,'done');assert.equal(t.attempts.length,0);assert.equal(t.session.gw.snapshot(),engine);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
test('an expired published request cannot borrow a completed no-moves notice',async()=>{
 const h=await open({moves:noPP});try{const t=trackAutomatic(h);const step=await noMoveNotice(h),engine=t.session.gw.snapshot(),original=t.session.currentRequest,request=original.call(t.session);await h.p.press('ok');
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
  const modes=[],show=h.s.show;h.s.show=function(mode,...args){modes.push(mode);return show.call(this,mode,...args);};choose(h,'fight');assert.notEqual(h.s._mode,'moves','valid singles Encore has no manual move selection');assert.equal(h.s.inputState().ready,false);h.s.onMenuOk();h.s.onMenuCancel();await h.waitFor(()=>t.attempts.length===2&&!h.s._busy,'one actual Encore action');await h.p.inMode('main');assert.deepEqual(t.attempts.map(a=>a.slot),[2,2]);assert.equal(t.attempts[1].result.ok,true);assert.equal(modes.includes('moves'),false);assert.equal(t.session.gw.readState('p1')[0].pp.growl,38);assert.equal(t.session.gw.readState('p1')[0].pp.tackle,35);assert(!t.session.gw.readState('p2')[0].fainted);const after=t.session.gw.snapshot();await h.frames(400);assert.equal(t.attempts.length,2);assert.equal(t.session.gw.snapshot(),after);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);
 }finally{h.cleanup();}
});
test('natural Encore expiry restores manual choice before a normal KO and a single final commit',async(testContext)=>{
 const h=await open({trainer:true,encore:true,terminalGrowth:true,moves:[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40}]});try{
  const t=trackAutomatic(h);await actualEncore(h);for(let i=0;i<3;i++){assert.equal(t.session.gw.query('p1','automatic-encore').moveSlot,2);choose(h,'fight');assert.notEqual(h.s._mode,'moves');await h.waitFor(()=>t.attempts.length===i+2&&!h.s._busy,'next explicit Encore Fight');await h.p.inMode('main');}
  assert.deepEqual(t.attempts.map(a=>a.slot),[2,2,2,2]);assert.equal(t.session.gw.readState('p1')[0].pp.growl,36);assert.deepEqual(t.session.gw.query('p1','automatic-encore'),{allowed:false},'actual engine Encore condition naturally expired');assert.equal(t.installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await moves(h);assert.equal(h.s._menu._items.length,2);choose(h,1);await h.waitFor(()=>t.attempts.length===5&&!h.s._busy,'ordinary manual KO resolved');
  assert.deepEqual(t.attempts.map(a=>a.slot),[2,2,2,2,1]);assert.equal(t.attempts[4].result.ok,true);await acknowledgeWonBattle(h,t,testContext);
  assert.equal(h.flow.game().party[0].moves[0].pp,34);assert.equal(h.flow.game().party[0].moves[1].pp,36);
 }finally{h.cleanup();}
});
test('a query adapter returning allowed without a slot retains manual choice instead of guessing Encore',async()=>{
 const h=await open({trainer:true,encore:true,moves:[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40}]});try{const t=trackAutomatic(h);await actualEncore(h);const gw=t.session.gw,query=gw.query;gw.query=function(side,what,...args){return what==='automatic-encore'?{allowed:true}:query.call(this,side,what,...args);};const before=gw.snapshot();await moves(h);assert.equal(t.attempts.length,1);h.s.onMenuCancel();assert.equal(h.s._mode,'main');assert.equal(gw.snapshot(),before);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);gw.query=query;}finally{h.cleanup();}
});
test('retiring the Encore action owner before its microtask cannot submit into a later operation',async()=>{
 const h=await open({trainer:true,encore:true,moves:[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40}]});try{const t=trackAutomatic(h);await actualEncore(h);const before=t.session.gw.snapshot(),act=h.s.act;let scheduled=0;h.s.act=function(...args){const result=act.apply(this,args);scheduled++;assert.equal(this._busy,true);h.flow.stateReplaced();return result;};choose(h,'fight');await h.frames(4);h.s.onMenuOk();h.s.onMenuCancel();await h.frames(2);assert.equal(scheduled,1);assert.equal(t.attempts.length,1);assert.equal(t.session.gw.snapshot(),before);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(t.installs,0);}finally{h.cleanup();}
});
