/* eslint-disable @typescript-eslint/no-explicit-any */
/** D1 measurement driver. Same source/manifest in the C3 bridge and controller candidate.
 * Real MZ scenes/services with disclosed programmatic menu input and fixture preconditions, not hardware input.
 */
import INPUT from '../../../experiments/step5/4/d1/f100-v1.json';
import { progressionDonorInputs } from './source-fixture';

function content(E:any,p:any):any {
 const input=progressionDonorInputs();
 input.species.find((s:any)=>s.id==='snorlax').learnset=[...['payday','splash','memento','roost'].map(move=>({level:1,move})),{level:51,move:'growl'}];
 input.species.find((s:any)=>s.id==='pidgey').learnset=[{level:1,move:'splash'}];
 input.items=Object.values(E.itemCatalog.legacyCatalog()).map((x:any)=>({...x,source:'author-placeholder'}));
 if(!input.items.some((x:any)=>x.id==='fullrestore'))input.items.push({id:'fullrestore',name:'Full Restore',namePlural:'Full Restores',pocket:2,battleId:'fullrestore',battleUse:'member',source:'author-placeholder'});
 input.items.find((x:any)=>x.id==='fullrestore').battleUse='member';input.items.find((x:any)=>x.id==='fullrestore').battleId='fullrestore';
 input.trainerTypes=[{id:'d1-type',nameKey:'trainer.d1',gender:0,source:'author-placeholder',baseMoney:0,skillLevel:100,flags:[],items:[{item:'fullrestore',count:1}]}];
 input.trainers=[{id:'d1-win',type:'d1-type',name:'D1',version:1,source:'author-placeholder',party:[0,1].map(()=>({species:'pidgey',level:1,moves:['knockoff']}))},{id:'d1-loss',type:'d1-type',name:'D3',version:1,source:'author-placeholder',party:[{species:'pidgey',level:100,moves:['knockoff']}]}];
 const out=E.contentCompile.compileContent(input);p.assert(out.ok,JSON.stringify(out.errors));
 const assembled=E.contentRuntime.assembleContent(out.data,E.dex.createDexLookup());p.assert(!assembled.errors.length,JSON.stringify(assembled.errors));return assembled.content;
}
function statistics(values:number[]):any {
 const sorted=[...values].sort((a,b)=>a-b),n=sorted.length,percent=(q:number)=>n?sorted[Math.min(n-1,Math.floor((n-1)*q))]:null;
 const over=values.filter(x=>x>33).length;
 return {count:n,p50:percent(.5),p95:percent(.95),p99:percent(.99),max:n?sorted[n-1]:null,over33:over,over33Ratio:n?over/n:null};
}
export async function runD1Benchmark(p:any):Promise<void> {
 const {G,W,api,fs,path,OUT,assert,eq,game,clone,frames,waitFor,scene}=p,E=api();
 const argv:string[]=G.nw.App.argv,arg=(key:string)=>argv.find(v=>v.startsWith('--'+key+'='))?.split('=').slice(1).join('='),limit=Number(arg('ps-d1-count')??100),detailed=arg('ps-d1-sensors')!=='off';
 assert(Number.isInteger(limit)&&limit>=1&&limit<=100,'explicit bounded count');
 assert(OUT,'D1 evidence output required');
 const hash=(v:any)=>p.nodeRequire('crypto').createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
 const clock=()=>performance.now(),rows:any[]=[],memory:any[]=[],frameSamples:any[]=[];let current:any=null,worldDraws=0,gameTick=0,rafTick=0,rafId=0,live=true;
 const result:any={version:'D1-F100-output-v1',kind:limit===100&&argv.includes('--ps-d1-formal')?'FORMAL_F100':'PILOT_NOT_P4',input:INPUT,inputHash:hash(INPUT),requestedCount:limit,instrumentation:{detailed,legacyPSFlowPerf:true,disabled:detailed?[]:['updateMain samples','rAF samples','scene/action/AI/prepare/install detailed spans','managed/memory sampling'],driver:'same semantic programmatic menu selection/fast-forward and boundary oracle in both versions; boundary clock/hash checks and existing PSFlow.perf remain in off mode; timing does not claim CPU attribution'},rows,memory,frameSamples,errors:[],fixture:'author RPG moves are explicit test data; normal Gen8 simulator, no engine patches; initial2 members/captures/ledger/stats retained',focus:[],phases:{transition:'NOT_APPLICABLE_D1_NO_D2_EFFECT'},window:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
 p.report.d1=result;
 const mark=(name:string,data:any={})=>{if(detailed&&current)current.markers.push({name,t:clock(),gameTick,rafTick,...data});};
 const originalUpdate=G.SceneManager.updateMain;let lastGame:number|null=null,lastRaf:number|null=null;
 if(detailed)G.SceneManager.updateMain=function(...args:any[]){const t=clock();gameTick++;if(lastGame!==null)frameSamples.push({kind:'updateMain',t,dt:t-lastGame,gameTick,rafTick,focus:document.hasFocus(),visibility:document.visibilityState,caseId:current?.id??null});lastGame=t;return originalUpdate.apply(this,args);};
 const raf=(t:number)=>{if(!live)return;rafTick++;if(lastRaf!==null)frameSamples.push({kind:'rAF',t,dt:t-lastRaf,gameTick,rafTick,focus:document.hasFocus(),visibility:document.visibilityState,caseId:current?.id??null});lastRaf=t;rafId=requestAnimationFrame(raf);};
 if(detailed)rafId=requestAnimationFrame(raf);
 const write=()=>{const target=OUT+'.benchmark-progress.json';fs.writeFileSync(target+'.partial',JSON.stringify(result));fs.renameSync(target+'.partial',target);};
 const managed=()=>{
  const seen=new Set<any>(),textures=new Set<any>(),bitmaps=new Set<any>();let windows=0,listeners=0;
  const walk=(n:any)=>{if(!n||seen.has(n))return;seen.add(n);if(n.texture&&!n.texture.destroyed)textures.add(n.texture);if(n.bitmap&&!n.bitmap._destroyed)bitmaps.add(n.bitmap);if(n._isWindow||typeof n.isOpenAndActive==='function')windows++;if(typeof n.eventNames==='function'&&typeof n.listenerCount==='function')for(const name of n.eventNames())listeners+=n.listenerCount(name);for(const child of n.children??[])walk(child);};walk(G.SceneManager._scene);
  return {scope:'reachable live display tree; not global allocations/leak proof',textures:textures.size,bitmaps:bitmaps.size,windows,listeners,rootOwners:W.PSFlow.running?1:0,appSaveBarrier:!!W.PSFlow._app?.saveBlocked};
 };
 async function sample(label:string):Promise<void>{
  if(!detailed)return;const gc=argv.includes('--ps-d1-gc'),available=typeof G.gc==='function';assert(gc===available,'natural must not expose GC; diagnostic must provide it');if(gc){G.gc();G.gc();}
  const m=G.process.memoryUsage(),row:any={id:label,t:clock(),gameTick,rafTick,gcRequested:gc,gcForced:gc&&available,rendererRssBytes:m.rss,nodeHeapUsedBytes:m.heapUsed,rendererJsHeapBytes:(performance as any).memory?.usedJSHeapSize??null,managed:managed(),appRssBytes:null,appRssStatus:'UNKNOWN',appRssReason:'collector-not-requested'};
  if(argv.includes('--ps-d1-rss-handshake')){
   const request=OUT+'.memory-request.json',reply=OUT+'.memory-reply.json';fs.writeFileSync(request,JSON.stringify({id:label,t:clock(),rendererPid:G.process.pid}));
   await waitFor(()=>fs.existsSync(reply)&&JSON.parse(fs.readFileSync(reply,'utf8')).id===label,'owned RSS sample '+label,600);
   Object.assign(row,JSON.parse(fs.readFileSync(reply,'utf8')));row.receivedAt=clock();
  }
  memory.push(row);write();
 }
 function view():any {
  const s=scene();if(!s?._psBattle)return null;
  if(typeof s.inputState==='function')return s.inputState();
  return {phase:s._mode,ready:s._mode!=='boot'&&!s._busy&&s._queue.length===0&&s._menu?.isOpenAndActive(),items:(s._menu?._items??[]).map((x:any)=>({key:x.ext,enabled:x.enabled!==false})),implementation:'legacy text-scene bridge'};
 }
 function advance():void {
  const s=scene();if(!s?._psBattle||s._mode!=='messages')return;
  // The same deliberate fast-forward input for both versions, without advancing game/rAF clocks manually.
  const old=G.Input.isTriggered;G.Input.isTriggered=function(key:string){return key==='ok'||old.call(this,key);};try{s.updateQueue();}finally{G.Input.isTriggered=old;}
 }
 async function ready(phases:string[]):Promise<any>{await waitFor(()=>{advance();const v=view();return v?.ready&&phases.includes(v.phase);},'semantic ready '+phases.join('/'));return view();}
 async function select(phase:string,key:any):Promise<void>{
  const v=await ready([phase]),s=scene(),index=v.items.findIndex((x:any)=>x.key===key&&x.enabled);assert(index>=0,'select valid '+phase+'/'+key);mark('input',{phase,key});s._menu.select(index);s.onMenuOk();await frames(1);
 }
 async function move(slot:number):Promise<void>{await select('main','fight');await select('moves',slot);await ready(['main','end','learn','party-forced']);}
 const P=G.SceneManager;let sessionPrototype:any=null,oldPush:any=null,oldAct:any=null;
 // Pin only the CommonJS simulator's protocol wall clock; renderer wait deadlines and monotonic clocks stay real.
 const nodeDate=p.nodeRequire('vm').runInThisContext('Date'),oldNodeNow=nodeDate.now;
 assert(nodeDate!==Date,'separate simulator/renderer clock realms');nodeDate.now=()=>INPUT.initial.clock;
 result.engineWallClock={value:INPUT.initial.clock,scope:'CommonJS Date.now for reproducible protocol timestamps; renderer Date/performance unchanged'};
 try {
  await p.toMapId(5,8,9);try{G.nw.Window.get().focus();}catch{/* actual focus still polled */}
  const c=content(E,p);W.PSFlow.stateReplaced();W.PSFlow._app=null;W.PSFlow._content=c;W.PSFlow._dex=E.dex.createDexLookup();W.PSFlow.setLanguage('en');W.PSFlow.fast=true;W.PSFlow.receiveOptions={mode:1,naming:1};W.PSFlow.developerCapabilities={allowHeldItemSources:true,allowExperimentalHeldItemBattle:true};
  const initial=E.state.newGame({content:c,party:[],money:100000,bag:{masterball:5,potion:5}});initial.badges.fill(true);
  initial.party=['P1','P2'].map(id=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id,species:'Snorlax',level:50},c,()=>0),c));initial.nextMemberOrdinal='3';
  for(const m of initial.party)m.item='oranberry';initial.party[0].hp-=20;initial.party[1].hp=1;initial.party[1].exp=E.growth.minExp('slow',51)-1;G.$gameSystem._psGame=initial;
  const app=new E.app.GameApplication({state:{read:()=>game(),replace:(next:any)=>{mark('install-start');G.$gameSystem._psGame=next;mark('install-end');}},content:()=>({content:c,dex:W.PSFlow._dex}),sessions:E.composition.createBattleSessionFactory({content:()=>c,seed:()=>W.PSFlow.seed,trainerAiTiming:{now(){const t=clock();if(detailed&&current)current.aiClock.push(t);return t;},after(fn:any,ms:number){const id=setTimeout(fn,ms);return()=>clearTimeout(id);}}}),projection:{project:(out:any)=>W.PSFlow.projectOutcome(out)},random:()=>{worldDraws++;return 0;},clock:()=>1793350000000},{capabilities:W.PSFlow.developerCapabilities,receivingProfile:{mode:1,naming:1}});W.PSFlow._app=app;
  const finish=app.finishBattle.bind(app);app.finishBattle=(...args:any[])=>{mark('prepare-commit-start');try{return finish(...args);}finally{mark('prepare-commit-end');}};
  result.contentIdentity=c.meta;result.initialStateHash=hash(game());result.initialState=clone(game());result.actualCapabilities=clone(W.PSFlow.developerCapabilities);result.clock=1793350000000;
  sessionPrototype=W.Scene_PSBattle.prototype;oldPush=sessionPrototype.pushMessages;
  sessionPrototype.pushMessages=function(messages:any[]){if(current){for(const msg of messages)if(msg.kind==='events')current.events.push(...msg.events.map((e:any)=>({type:e.type,args:e.args,raw:e.raw})));}return oldPush.call(this,messages);};
  if(detailed){oldAct=sessionPrototype.act;sessionPrototype.act=function(fn:any,kind:string){const row=current;return oldAct.call(this,()=>{const start=clock();mark('action-start',{kind});try{const value=fn();Promise.resolve(value).then(()=>{if(row===current){mark('action-resolved',{kind});row.actions.push({kind,start,end:clock(),status:'resolved'});}},error=>{if(row===current){mark('action-rejected',{kind});row.actions.push({kind,start,end:clock(),status:'rejected',error:String(error)});}});return value;}catch(error){mark('action-rejected',{kind});throw error;}},kind);};}
  await frames(4);await sample('initial-map');
  await p.scenario('D1-F100 actual formal scenes, exact workload and persistent paired results',async()=>{
   for(const input of INPUT.cases.slice(0,limit)){
    assert(!app.saveBlocked&&!W.PSFlow.running,'between battles no owner');
    if(input.ordinal>=3){const healed=app.healParty();assert(['healed','unchanged'].includes(healed.status),'normal between-battle heal succeeds or is already complete');assert(app.describeParty().members.every((m:any)=>m.hp===m.maxhp&&!m.status&&m.moves.every((x:any)=>x.pp===x.maxpp)),'actual full HP/status/PP after healing');}
    game().inventory=E.inventory.inventoryFromBag({masterball:5,potion:5},E.itemCatalog.catalogOf(c));
    if(input.kind==='trainer-loss-D3')for(const m of game().party)if(m.id!=='P1')m.hp=0;
    const beforeCount=Object.keys(game().appliedBattles).length;
    current={id:input.id,kind:input.kind,seed:input.seed,request:clone(input.request),setup:input.setup,beforeStateHash:hash(game()),markers:[],events:[],aiClock:[],actions:[],boundaryStart:clock(),focusStart:document.hasFocus(),visibleStart:document.visibilityState};rows.push(current);W.PSFlow.seed=[...input.seed];mark('event-start');
    W.PSFlow.openBattle(clone(input.request));await ready(['main']);mark('scene-controller-ready');mark('first-input-ready');
    current.presentationImplementation=view().implementation;result.presentationImplementation??=current.presentationImplementation;eq(current.presentationImplementation,result.presentationImplementation,'one presentation implementation per process');
    const s=scene()._session;
    current.resolvedSeed=s.gw.prngSeed();eq(current.resolvedSeed,input.seed.join(','),'actual locked simulator resolved seed string');
    if(input.ordinal===2){
     s.gw.seedState('p2',[{id:s.foeTeam[0].id,hp:1}]);
     await select('main','bag');await select('bag','potion');await select('party','P1');await ready(['main']);
     await select('main','party');await select('party','P2');await ready(['main','party-forced']);
     if(view().phase==='party-forced')await select('party-forced','P1');
     await select('main','bag');await select('bag','masterball');await ready(['main']);
     await select('main','party');await select('party','P1');await ready(['main']);
    }
    if(input.kind==='wild-capture'){await select('main','bag');await select('bag','masterball');}
    else{
     for(let guard=0;guard<16;guard++){
      const v=await ready(['main','end','learn','party-forced']);if(v.phase==='end')break;
      if(v.phase==='learn'){current.learning=true;await select('learn',3);continue;}
      if(v.phase==='party-forced'){await select('party-forced','P1');continue;}
      await move(input.kind==='trainer-loss-D3'?3:1);
     }
    }
    await ready(['end']);
    if(input.ordinal===2){
     const diagnostic=p.nodeRequire('./js/engine/build/testing.cjs').trainerAiDiagnostics.trainerAiDiagnostics(s);eq(diagnostic.state.resources[0].count,0,'NPC actual FullRestore once');
     assert(current.events.some((e:any)=>/enditem.*P2/.test(e.raw??'')),'actual held consumption observed');
     const live=s.gw._debugBattle().sides[0].pokemon.find((m:any)=>m.name==='P1');eq(live.item,'','actual temporary Knock Off before settlement');
     assert(current.learning,'real learning prompt reached');
    }
    await select('end','end');await p.dismissMessages();await waitFor(()=>!W.PSFlow.running&&scene() instanceof G.Scene_Map&&scene().isStarted()&&!!scene()._messageWindow&&!G.SceneManager.isSceneChanging()&&!scene().isBusy(),'back to fully started map');mark('return-map-ready');
    const out=W.PSFlow.lastOutcome;eq(out.code,input.expected.code,'expected actual outcome '+input.id);eq(out.commit,'applied','one actual commit');assert(game().appliedBattles[input.id]?.settlement?.pairHash,'paired ledger');eq(Object.keys(game().appliedBattles).length,beforeCount+1,'one new ledger entry, previous retained');
    if(input.ordinal===2){eq(game().party.find((m:any)=>m.id==='P1').item,'oranberry','temporarily removed item restored by B');eq(game().party.find((m:any)=>m.id==='P2').item,'','consumed item not restored');}
    if(input.kind==='trainer-loss-D3'){assert(out.blackout&&out.defeat?.healed,'real D3');assert(game().party.every((m:any)=>m.hp>0&&!m.status),'D3 healed whole party');eq(W.PSFlow.lastReturn.status,'requested','actual home request');}
    current.outcome=clone(out);current.afterStateHash=hash(game());current.boundaryEnd=clock();current.focusEnd=document.hasFocus();current.visibleEnd=document.visibilityState;current.status='pass';current=null;write();
    if([4,50,100].includes(rows.length))await sample('after'+rows.length);
   }
   eq(rows.length,limit,'exact nonempty workload count');eq(new Set(rows.map(r=>r.id)).size,limit,'unique case IDs');
   await frames(120);await sample('after-idle120');result.finalState=clone(game());result.finalStateHash=hash(game());result.worldDraws=worldDraws;result.frameSummary={updateMain:statistics(frameSamples.filter(x=>x.kind==='updateMain').map(x=>x.dt)),rAF:statistics(frameSamples.filter(x=>x.kind==='rAF').map(x=>x.dt))};result.status='pass';write();return {kind:result.kind,count:limit,inputHash:result.inputHash,finalStateHash:result.finalStateHash};
  });
 }catch(error:any){result.errors.push(String(error?.stack??error));result.status='fail';write();throw error;}
 finally{live=false;if(rafId)cancelAnimationFrame(rafId);if(detailed)P.updateMain=originalUpdate;if(sessionPrototype&&oldPush)sessionPrototype.pushMessages=oldPush;if(sessionPrototype&&oldAct)sessionPrototype.act=oldAct;nodeDate.now=oldNodeNow;}
}
