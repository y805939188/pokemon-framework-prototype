/** I integration driver. Inert except the explicit test modes in PS_BattleFlowTest.
 * Actual host scenes + programmatic actions. This is never physical-input evidence.
 */
export async function continueCloseout(p:any):Promise<void>{
 const {G,W,fs,hashFile,scenario,assert,eq,press,waitFor,scene,game,readExpected,shot}=p;
 const expected=readExpected('ps-flow-expected-closeout.json');
 assert(expected.cases.length===5,'five independent G/H producer checkpoints');
 for(const c of expected.cases)await scenario('I-CONTINUE-'+c.family+' normal Title/Continue/Scene_Load/full state',async()=>{
  const file=G.StorageManager.filePath(G.DataManager.makeSavename(c.slot));assert(fs.existsSync(file),'ordinary save file exists');eq(hashFile(file),c.slotSha256,'producer-consumer exact slot bytes');
  W.PSFlow._content=c.content;W.PSFlow._app=null;
  G.SceneManager.goto(G.Scene_Title);
  await waitFor(()=>scene() instanceof G.Scene_Title&&scene().isStarted()&&scene()._commandWindow.isOpenAndActive()&&!scene().isBusy()&&!G.SceneManager.isSceneChanging(),'normal Title');
  const title=scene(),window=title._commandWindow;window.selectSymbol('continue');assert(window.isCurrentItemEnabled(),'Continue enabled from real isolated global save info');
  await press('ok');await waitFor(()=>scene() instanceof G.Scene_Load&&scene().isStarted()&&scene()._listWindow.isOpenAndActive()&&!scene().isBusy()&&!G.SceneManager.isSceneChanging(),'normal Scene_Load');
  const load=scene();load._listWindow.selectSavefile(c.slot);assert(load._listWindow.index()>=0&&load._listWindow.index()<load._listWindow.maxItems(),'visible ordinary save row');eq(load._listWindow.savefileId(),c.slot,'actual highlighted slot');
  await shot('I-Continue-'+c.family+'-slot-'+c.slot);await press('ok');
  await waitFor(()=>scene() instanceof G.Scene_Map&&scene().isStarted()&&!G.SceneManager.isSceneChanging(),'normal loaded map');
  assert(load._loadSuccess,'Scene_Load success, not direct DataManager shortcut');eq(game(),c.state,'entire saved framework document');
  assert(!W.PSFlow.app().saveBlocked&&!W.PSFlow.operationPending(),'no transient owner reconstructed');
  const before=JSON.stringify(game());W.PSFlow.app().pokedexSnapshot();eq(JSON.stringify(game()),before,'ordinary read/render has no new dex history');
  return{slot:c.slot,input:'synthetic DOM OK, real Title command/Scene_Load selection and onLoadSuccess/terminate; no hardware or native IME evidence'};
 });
}
export async function runCloseout(p:any):Promise<void>{
 const {G,W,fs,path,OUT,api,game,clone,scenario,assert,eq,frames,press,waitFor,scene,toMap,toMapId,fresh,shot,uiReady,uiClosed,management,corpus}=p;
 // Retain each family's complete checkpoint before later suites can reuse its high test slot.
 const cases:any[]=[];
 for(const [family,run] of [['learning',p.runLearningUI],['evolution',p.runEvolutionUI],['trade',p.runTradeUI],['item-evolution',p.runItemEvolutionUI],['pokedex',p.runPokedexUI]]as const){
  await run();await scenario('I-RETAIN-'+family+' immediate full snapshot to ordinary Continue slot',async()=>{
   const doc=JSON.parse(fs.readFileSync(path.join(path.dirname(OUT),'ps-flow-expected-'+family+'-ui.json'),'utf8')),c=doc.cases.at(-1),slot=cases.length+1;
   W.PSFlow._content=c.content;W.PSFlow._app=null;await G.DataManager.loadGame(c.slot);eq(game(),c.state,'source complete state before later high-slot reuse '+family);
   G.SceneManager.goto(G.Scene_Map);await waitFor(()=>scene() instanceof G.Scene_Map&&scene().isStarted()&&!G.SceneManager.isSceneChanging(),'checkpoint normal map');
   assert(slot<G.DataManager.maxSavefiles(),'ordinary Continue slot lies inside visible list');await p.settledSave(slot);
   const file=G.StorageManager.filePath(G.DataManager.makeSavename(slot)),slotSha256=p.hashFile(file);cases.push({...c,sourceSlot:c.slot,slot,family,state:clone(game()),slotSha256});
   fs.writeFileSync(path.join(path.dirname(OUT),'ps-flow-expected-closeout.json'),JSON.stringify({cases}));return{family,sourceSlot:c.slot,ordinarySlot:slot,slotSha256};
  });
 }
 await scenario('I-CHECKPOINT five preserved G/H families keep their exact ordinary slot bytes',async()=>{
  eq(cases.length,5,'all five families retained immediately');eq(new Set(cases.map(c=>c.slot)).size,5,'distinct ordinary slots');
  for(const c of cases)eq(p.hashFile(G.StorageManager.filePath(G.DataManager.makeSavename(c.slot))),c.slotSha256,'later suites never overwrite ordinary slot '+c.slot);
  return{slots:cases.map(c=>c.slot),method:'five retained full documents, producer and consumer both bind raw save bytes; not all intermediate checkpoints or formal vectors'};
 });
 await scenario('I-H2-WARN-01 actual English/Chinese empty-result layout at 640x480 and default bitmap',async()=>{
  await toMap();fresh();await toMapId(5,8,9);const fixture=game();fixture.dex.hasDex=true;fixture.dex.seen=[...new Set(fixture.party.map((m:any)=>m.species))];fixture.dex.owned=[...fixture.dex.seen];fixture.dex.unlocked=Array(W.PSFlow.content().regionalDex.regions.length+1).fill(true);W.PSFlow.stateReplaced();
  const bounds=[];for(const locale of ['en','zh'])for(const size of [[784,592],[640,480]]){
   W.PSFlow.setLanguage(locale);const opened=W.PSPokedex.open();eq(opened.status,'opened','layout open '+String(opened.reason));await waitFor(()=>W.PSPokedex.current()?.ready,'layout dex');
   while(W.PSPokedex.current().view.kind==='regions'){const v=W.PSPokedex.current().view,target=v.rows.findIndex((r:any)=>r.region===-1);for(let k=0;W.PSPokedex.current().view.cursor!==target&&k<10;k++)await press('down');await press('ok');await waitFor(()=>W.PSPokedex.current()?.ready,'layout list');}
   await press('shift');const c=scene()._controller,b=c.window.contents;b.resize(size[0],size[1]);c.screen.editor.draft[4]=37;c.screen.editor.view.focus=8;c.screen.searchInput({triggered:{},repeated:{}});c.draw();await frames(3);await press('ok');assert(c.screen.view.notice,'real DOM Start query is empty');
   const draw=b.drawText,rects:any[]=[];b.drawText=function(...args:any[]){rects.push(args);return draw.apply(this,args);};try{c.draw();}finally{b.drawText=draw;}
   const footer=rects.at(-1),message=rects.find((r:any)=>String(r[0]).trim()===W.PSFlow.translator().t('pokedex.noMatches'));assert(message,'actual notice draw');assert(message[2]+message[4]<=footer[2],'notice above footer');assert(rects.filter((r:any)=>r!==message&&r!==footer&&r[2]>=48).every((r:any)=>r[2]+r[4]<=message[2]),'notice below controls');
   await frames(3);assert(c.screen.view.notice,'empty notice remains after rendered frames');eq([b.width,b.height],size,'actual bitmap dimensions');await shot('I-empty-layout-'+locale+'-'+size.join('x'));bounds.push({locale,contents:size,notice:message.slice(1,5),footer:footer.slice(1,5),method:'real NW bitmap canvas resized by test; physical NW viewport unchanged'});await press('cancel');await press('cancel');if(W.PSPokedex.current()?.view.kind==='regions')await press('cancel');await waitFor(()=>!W.PSPokedex.current()&&!G.SceneManager.isSceneChanging()&&scene()?._spriteset,'layout closed');
  }W.PSFlow.setLanguage(null);return{bounds};
 });
 await scenario('I-GR53 formal selector eligibility/cancel/HP boundary is zero-write',async()=>{
  await toMap();fresh();await toMapId(5,8,9);const original=clone(game());
  const select=async(qualifier:any,answer:'ok'|'cancel',expected:any)=>{let result:any='waiting',calls=0;const before=clone(game());assert(W.PSManagement.selectMember(qualifier,(r:any)=>{result=r;calls++;}),'formal selector opens');await uiReady('party');await press(answer);if(answer==='ok'&&expected===null){eq(result,'waiting','ineligible confirmation stays open');await press('cancel');}await uiClosed();eq(result,expected,'selector stable result');eq(calls,1,'one completion');eq(game(),before,'selection does not write members');};
  game().party=[clone(original.party[0])];game().party[0].egg=true;W.PSFlow.stateReplaced();await select((m:any)=>!m.egg&&m.hp>0,'ok',null);
  game().party[0].egg=false;game().party[0].hp=0;W.PSFlow.stateReplaced();await select((m:any)=>!m.egg&&m.hp>0,'ok',null);
  game().party[0].hp=1;W.PSFlow.stateReplaced();await select((m:any)=>!m.egg&&m.hp>0,'ok',{id:game().party[0].id,index:0});
  game().party[0].hp=0;W.PSFlow.stateReplaced();await select((m:any)=>!m.egg,'ok',{id:game().party[0].id,index:0});
  await select((m:any)=>!m.egg,'cancel',null);return{input:'actual generic selector returns identity/null; author decides its variable representation, no new selector command invented'};
 });
 await scenario('I-SCALE strict compiled 8/128/900 content rows, two forms/two regions, full 40x30 storage in actual NW',async()=>{
  await toMap();const B=api(),measurements=[];
  for(const fixture of corpus){
   const start=performance.now(),assembled=B.contentRuntime.assembleContent(B.contentRuntime.loadCompiled(fixture.compiled),B.dex.createDexLookup());assert(!assembled.errors.length,'strict scale assembly');const content=assembled.content;
   eq(content.meta.contentIdentity,fixture.contentIdentity,'same compiler identity as Node');assert(content.meta.showdownSourceChecked,'actual pinned source proof');eq(Object.keys(content.species).length,fixture.rows,'actual form rows');
   W.PSFlow._content=content;G.$gameSystem._psGame=B.state.newGame({party:[],content});W.PSFlow.stateReplaced();const g=game();g.dex.hasDex=true;g.dex.seen=[...content.regionalDex.national];g.dex.owned=[...g.dex.seen];g.dex.unlocked=Array(content.regionalDex.regions.length+1).fill(true);g.dex.view.region=-1;
   const member=B.speciesKey.toPersistentMember(B.memberFactory.createMember({id:'SCALE-PARTY',species:'Rotom',level:50},content,()=>0),content);g.party=[member];
   for(let i=0;i<1200;i++)g.storage.boxes[Math.floor(i/30)].slots[i%30]={...clone(member),id:'SCALE-'+i};
   W.PSFlow.stateReplaced();const t=performance.now();W.PSPokedex.open();await waitFor(()=>W.PSPokedex.current()?.ready,'scale dex ready');const c=W.PSPokedex.current();if(c.view.kind==='regions'){const target=c.view.rows.findIndex((r:any)=>r.region===-1);assert(target>=0,'national entry available');for(let k=0;W.PSPokedex.current().view.cursor!==target&&k<10;k++)await press('down');await press('ok');await waitFor(()=>W.PSPokedex.current()?.view.kind==='list'&&W.PSPokedex.current()?.ready,'scale national list');}
   eq(W.PSPokedex.current().view.rows.length,fixture.baseSpecies,'every legal base identity reaches real list');await shot('I-scale-'+fixture.rows);await press('cancel');if(W.PSPokedex.current()?.view.kind==='regions')await press('cancel');await waitFor(()=>!W.PSPokedex.current()&&!G.SceneManager.isSceneChanging()&&scene()?._spriteset,'scale closed');
   const saveStart=performance.now();await p.settledSave(121);const saveMs=performance.now()-saveStart,expected=clone(game()),loadStart=performance.now();await G.DataManager.loadGame(121);const loadMs=performance.now()-loadStart;eq(game(),expected,'all 1200 slots/full dex real JsonEx roundtrip');assert(!W.PSFlow.app().saveBlocked,'no scale owner leak');
   measurements.push({rows:fixture.rows,baseSpecies:fixture.baseSpecies,forms:fixture.forms,regions:fixture.regions,contentIdentity:fixture.contentIdentity,compiledSha256:fixture.compiledSha256,storage:{boxes:40,slotsPerBox:30,members:1200},assemblyMs:t-start,listOpenMs:saveStart-t,saveMs,loadMs,totalMs:performance.now()-start});
  }return{measurements,input:'legal pinned data via strict compiler/assembly, real MZ dex windows/save/load; author placeholder numeric values; no hard budget or no-leak claim'};
 });
}
export async function runCloseoutLifecycle(p:any):Promise<void>{
 const {G,W,fs,path,OUT,api,game,clone,scenario,assert,eq,frames,press,waitFor,scene,toMap,toMapId,fresh,uiReady,uiClosed,management}=p;
 const defaults=['learning','evolution','trade','inventory','pokedex','summary-pokedex'];const families=p.lifecycleGroups?p.lifecycleGroups.split(','):defaults,cycles=p.lifecycleCycles??100;
 assert([100,200].includes(cycles),'lifecycle cycles 100 or 200');assert(families.length>0&&new Set(families).size===families.length&&families.every((f:string)=>[...defaults,'summary-only'].includes(f)),'known distinct lifecycle families');
 await scenario('I-LIFECYCLE selected scene families real creations/closures, listener/window/resource samples',async()=>{
  await toMap();fresh();await toMapId(5,8,9);const B=api(),content=clone(W.PSFlow.content()),state=clone(game()),id=state.party[0].id;
  const source=B.speciesKey.speciesDataOf(content,state.party[0]);source.evolutions=[{method:'Event',parameter:7,target:state.party[1].species}];state.dex.hasDex=true;state.dex.seen=[...new Set([...state.dex.seen,...state.party.map((m:any)=>m.species)])];state.dex.owned=[...state.dex.seen];state.dex.unlocked=Array(content.regionalDex.regions.length+1).fill(true);
  // Test-only authored content identity is explicit, just as in the individual G suites.
  const raw=clone(content);delete raw.meta;const inputsHash=B.digest.sha256Hex(B.contentCompile.canonicalJson(raw));content.meta={...content.meta,kind:'fixture',id:'I-lifecycle',inputsHash,contentIdentity:B.digest.sha256Hex(B.contentCompile.canonicalJson({compiledSemantics:content.meta.compiledSemantics,inputsHash,showdownSha:content.meta.showdownSha}))};
  W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();
  const groups:any[]=[],prototype=EventTarget.prototype,add=prototype.addEventListener,remove=prototype.removeEventListener,live=new Map<string,Set<any>>();
  const key=(target:any,type:any,capture:any)=>(target===document?'document':target===window?'window':'other')+':'+type+':'+Boolean(typeof capture==='boolean'?capture:capture?.capture);
  prototype.addEventListener=function(type:any,listener:any,options:any){if(this===document||this===window){const k=key(this,type,options);if(!live.has(k))live.set(k,new Set());live.get(k)!.add(listener);}return add.call(this,type,listener,options);};
  prototype.removeEventListener=function(type:any,listener:any,options:any){if(this===document||this===window)live.get(key(this,type,options))?.delete(listener);return remove.call(this,type,listener,options);};
  const memory=()=>{if(typeof G.gc==='function')G.gc();return{...G.process.memoryUsage(),gcForced:typeof G.gc==='function',mapChildren:scene()?.children?.length??null,inputs:document.querySelectorAll('input').length,trackedNewDocumentWindowListeners:[...live.values()].reduce((n,s)=>n+s.size,0)};};
  const readyMap=()=>waitFor(()=>scene() instanceof G.Scene_Map&&scene().isStarted()&&!G.SceneManager.isSceneChanging(),'lifecycle map');
  const closeScene=async()=>{G.SceneManager.goto(G.Scene_Map);await readyMap();await frames(2);assert(!W.PSFlow.operationPending()&&!W.PSFlow.app().saveBlocked,'technical before-install exit releases own locks');};
  try{for(const family of families){
   const samples=[],before=memory(),openMs:number[]=[];let destroyedWindows=0,createdWindows=0;
   for(let i=0;i<cycles;i++){
    const t=performance.now();
    if(family==='learning'){W.PSProgression.learn({kind:'forget',memberId:id});await waitFor(()=>W.PSProgression.current()?.ready,'cycle learning');}
    else if(family==='evolution'){W.PSEvolution.event(7,id);await waitFor(()=>W.PSEvolution.current()?.ready,'cycle event');}
    else if(family==='trade'){const waiter=new G.Game_Interpreter();G.PluginManager.callCommand(waiter,'PS_Evolution','ScriptTrade',{requestId:'I-cycle-'+i,intent:JSON.stringify({outgoingId:id,incoming:{species:state.party[1].species},foreignOwner:{name:'Lifecycle'}})});await waitFor(()=>W.PSEvolution.current()?.ready,'cycle offer');}
    else if(family==='inventory'){W.PSInventory.showBag();await waitFor(()=>W.PSInventory.current()?.ready,'cycle inventory');}
    else if(family==='pokedex'){const opened=W.PSPokedex.open();eq(opened.status,'opened','formal Pokedex opens: '+JSON.stringify(opened.reason));await waitFor(()=>W.PSPokedex.current()?.ready,'cycle dex');}
    else{W.PSManagement.openSummary(id);await uiReady('summary');if(family==='summary-pokedex'){await press('ok');await p.uiChoose('pokedex');await waitFor(()=>W.PSPokedex.current()?.ready,'cycle attached dex');}}
    openMs.push(performance.now()-t);const windows=(scene()?._windowLayer?.children??[]).slice();createdWindows+=windows.length;
    await closeScene();destroyedWindows+=windows.filter((w:any)=>w.destroyed||w._destroyed).length;
    if(i===0||(i+1)%25===0){samples.push({cycles:i+1,...memory()});fs.writeFileSync(OUT+'.lifecycle.json',JSON.stringify({groups,current:{family,createdWindows,destroyedWindows,samples,openMs}}));}
   }
   const after=memory();eq(after.inputs,before.inputs,'no input nodes accumulate');eq(after.trackedNewDocumentWindowListeners,before.trackedNewDocumentWindowListeners,'no new live document/window listener accumulation');assert(createdWindows>0,'actual host windows created');eq(destroyedWindows,createdWindows,'all scene windows destroyed');await frames(120);const afterIdle=memory();groups.push({family,cycles,createdWindows,destroyedWindows,openMs,before,after,afterIdle,samples});fs.writeFileSync(OUT+'.lifecycle.json',JSON.stringify({groups,complete:false}));
  }}finally{prototype.addEventListener=add;prototype.removeEventListener=remove;}
  fs.writeFileSync(OUT+'.lifecycle.json',JSON.stringify({groups,complete:true}));return{groups,method:'real scene create/start/terminate, explicit test-triggered SceneManager.goto before install; normal user flows separately above; RSS raw/forced GC if available; tracked listeners added only during this measurement, no proof of absence of every engine resource leak'};
 });
}
