/** I integration driver. Inert except the explicit test modes in PS_BattleFlowTest.
 * Actual host scenes + programmatic actions. This is never physical-input evidence.
 */
export async function continueCloseout(p:any):Promise<void>{
 const {G,W,scenario,assert,eq,press,waitFor,scene,game,readExpected,shot}=p;
 const expected=readExpected('ps-flow-expected-closeout.json');
 assert(expected.cases.length===5,'five independent G/H producer checkpoints');
 for(const c of expected.cases)await scenario('I-CONTINUE-'+c.family+' normal Title/Continue/Scene_Load/full state',async()=>{
  W.PSFlow._content=c.content;W.PSFlow._app=null;
  G.SceneManager.goto(G.Scene_Title);
  await waitFor(()=>scene() instanceof G.Scene_Title&&scene().isStarted()&&scene()._commandWindow.active&&!G.SceneManager.isSceneChanging(),'normal Title');
  const title=scene(),window=title._commandWindow;window.selectSymbol('continue');assert(window.isCurrentItemEnabled(),'Continue enabled from real isolated global save info');
  await press('ok');await waitFor(()=>scene() instanceof G.Scene_Load&&scene().isStarted()&&scene()._listWindow.active&&!G.SceneManager.isSceneChanging(),'normal Scene_Load');
  const load=scene();load._listWindow.selectSavefile(c.slot);eq(load._listWindow.savefileId(),c.slot,'actual highlighted slot');
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
 // Same built product/process traverses all default new G/H workflows. Each existing suite keeps its own source-bound fixtures.
 await p.runLearningUI();await p.runEvolutionUI();await p.runTradeUI();await p.runItemEvolutionUI();await p.runPokedexUI();
 await scenario('I-CHECKPOINT five G/H families retained for a new process using ordinary Continue',async()=>{
  const cases=['learning','evolution','trade','item-evolution','pokedex'].map(family=>{const doc=JSON.parse(fs.readFileSync(path.join(path.dirname(OUT),'ps-flow-expected-'+family+'-ui.json'),'utf8')),c=doc.cases.at(-1);return{...c,family};});
  eq(new Set(cases.map(c=>c.slot)).size,5,'producer slots do not overwrite each other');
  fs.writeFileSync(path.join(path.dirname(OUT),'ps-flow-expected-closeout.json'),JSON.stringify({cases}));return{slots:cases.map(c=>c.slot),method:'five final full documents; not all intermediate checkpoints or all formal vectors'};
 });
 await scenario('I-H2-WARN-01 actual English/Chinese empty-result layout at 640x480 and default bitmap',async()=>{
  const bounds=[];for(const locale of ['en','zh'])for(const size of [[784,592],[640,480]]){
   W.PSFlow.setLanguage(locale);W.PSPokedex.open();await waitFor(()=>W.PSPokedex.current()?.ready,'layout dex');
   while(W.PSPokedex.current().view.kind==='regions'){const v=W.PSPokedex.current().view,target=v.rows.findIndex((r:any)=>r.region===-1);for(let k=0;W.PSPokedex.current().view.cursor!==target&&k<10;k++)await press('down');await press('ok');await waitFor(()=>W.PSPokedex.current()?.ready,'layout list');}
   await press('shift');const c=scene()._controller,b=c.window.contents;c.screen.editor.draft[4]=37;c.screen.editor.view.focus=8;c.screen.searchInput({triggered:{use:true},repeated:{}});assert(c.screen.view.notice,'real query is empty');b.resize(size[0],size[1]);
   const draw=b.drawText,rects:any[]=[];b.drawText=function(...args:any[]){rects.push(args);return draw.apply(this,args);};try{c.draw();}finally{b.drawText=draw;}
   const footer=rects.at(-1),message=rects.find((r:any)=>String(r[0]).trim()===W.PSFlow.translator().t('pokedex.noMatches'));assert(message,'actual notice draw');assert(message[2]+message[4]<=footer[2],'notice above footer');assert(rects.filter((r:any)=>r!==message&&r!==footer&&r[2]>=48).every((r:any)=>r[2]+r[4]<=message[2]),'notice below controls');
   await shot('I-empty-layout-'+locale+'-'+size.join('x'));bounds.push({locale,contents:size,notice:message.slice(1,5),footer:footer.slice(1,5),method:'real NW bitmap canvas resized by test; physical NW viewport unchanged'});await press('cancel');await press('cancel');if(W.PSPokedex.current()?.view.kind==='regions')await press('cancel');await waitFor(()=>!W.PSPokedex.current()&&!G.SceneManager.isSceneChanging()&&scene()?._spriteset,'layout closed');
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
 await scenario('I-LIFECYCLE each new scene family 100 real creations/closures, listener/window/resource samples',async()=>{
  await toMap();fresh();await toMapId(5,8,9);const B=api(),content=clone(W.PSFlow.content()),state=clone(game()),id=state.party[0].id;
  const source=B.speciesKey.speciesDataOf(content,state.party[0]);source.evolutions=[{method:'Event',parameter:7,target:state.party[1].species}];state.dex.hasDex=true;state.dex.unlocked=Array(content.regionalDex.regions.length+1).fill(true);
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
  try{for(const family of ['learning','evolution','trade','inventory','pokedex','summary-pokedex']){
   const samples=[],before=memory(),openMs:number[]=[];let destroyedWindows=0,createdWindows=0;
   for(let i=0;i<100;i++){
    const t=performance.now();
    if(family==='learning'){W.PSProgression.learn({kind:'forget',memberId:id});await waitFor(()=>W.PSProgression.current()?.ready,'cycle learning');}
    else if(family==='evolution'){W.PSEvolution.event(7,id);await waitFor(()=>W.PSEvolution.current()?.ready,'cycle event');}
    else if(family==='trade'){const waiter=new G.Game_Interpreter();G.PluginManager.callCommand(waiter,'PS_Evolution','ScriptTrade',{requestId:'I-cycle-'+i,intent:JSON.stringify({outgoingId:id,incoming:{species:state.party[1].species},foreignOwner:{name:'Lifecycle'}})});await waitFor(()=>W.PSEvolution.current()?.ready,'cycle offer');}
    else if(family==='inventory'){W.PSInventory.showBag();await waitFor(()=>W.PSInventory.current()?.ready,'cycle inventory');}
    else if(family==='pokedex'){W.PSPokedex.open();await waitFor(()=>W.PSPokedex.current()?.ready,'cycle dex');}
    else{W.PSManagement.openSummary(id);await uiReady('summary');await press('ok');await p.uiChoose('pokedex');await waitFor(()=>W.PSPokedex.current()?.ready,'cycle attached dex');}
    openMs.push(performance.now()-t);const windows=(scene()?._windowLayer?.children??[]).slice();createdWindows+=windows.length;
    await closeScene();destroyedWindows+=windows.filter((w:any)=>w.destroyed||w._destroyed).length;
    if([0,24,49,74,99].includes(i))samples.push({cycles:i+1,...memory()});
   }
   const after=memory();eq(after.inputs,before.inputs,'no input nodes accumulate');eq(after.trackedNewDocumentWindowListeners,before.trackedNewDocumentWindowListeners,'no new live document/window listener accumulation');assert(createdWindows>0,'actual host windows created');eq(destroyedWindows,createdWindows,'all scene windows destroyed');groups.push({family,cycles:100,createdWindows,destroyedWindows,openMs,before,after,samples});
  }}finally{prototype.addEventListener=add;prototype.removeEventListener=remove;}
  return{groups,method:'real scene create/start/terminate, explicit test-triggered SceneManager.goto before install; normal user flows separately above; RSS raw/forced GC if available; tracked listeners added only during this measurement, no proof of absence of every engine resource leak'};
 });
}
