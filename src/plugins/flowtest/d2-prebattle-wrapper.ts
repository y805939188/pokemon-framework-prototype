/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only finite native recipe; only external supervision can qualify execution.
import PLAN from '../../../experiments/step5/4/prebattle-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const prebattleNativePlan = PLAN;
export async function runD2Prebattle(p:any):Promise<void>{
 const {G,W,api,fs,path,OUT,arg,argv,gameDir,assert,eq,clone,report,results,writeProgress,frames,waitFor,scene,battle,inMode,press,toMapId}=p;
 const E=api(),flow=W.PSFlow,hash=(b:any)=>p.nodeRequire('crypto').createHash('sha256').update(b).digest('hex'),stable=(v:any)=>E.contentCompile.canonicalJson(v),fileHash=(f:string)=>hash(fs.readFileSync(f));
 assert(OUT&&arg('ps-prebattle-input')&&!arg('ps-flow-only')&&argv.includes('--ps-sound'),'whole isolated prebattle mode');
 const bytes=fs.readFileSync(arg('ps-prebattle-input')),input=JSON.parse(bytes),info=JSON.parse(fs.readFileSync(path.join(gameDir,'package-info.json')));
 eq(input.version,PLAN.version,'prebattle input');eq(input.productCommit,PLAN.productCommit,'fixed prebattle product');eq(input.productRuntime,PLAN.productRuntime,'runtime identities');eq(input.planSHA256,hash(stable(PLAN)),'frozen prebattle plan');eq(info.gitHead,input.packageHead,'package head');eq(info.workingTreeChanges,0,'clean package');
 for(const[rel,h]of Object.entries(PLAN.productRuntime))eq(fileHash(path.join(gameDir,rel)),h,'actual prebattle product '+rel);
 eq(fileHash(path.join(gameDir,'js/plugins/PS_BattleFlowTest.js')),input.driverPluginSHA256,'actual prebattle driver');eq(path.resolve(arg('ps-save-dir')),path.resolve(input.saveRoot),'isolated save argument');eq(path.resolve(G.StorageManager.fileDirectoryPath()),path.resolve(input.saveRoot),'actual storage');
 const storageRel=path.relative(fs.realpathSync(gameDir),fs.realpathSync(input.saveRoot));assert(storageRel==='..'||storageRel.startsWith('..'+path.sep),'storage outside APP');eq(fs.readdirSync(input.saveRoot),[],'fresh storage');eq(input.assets.map((r:any)=>r.path).sort(),[...PLAN.requiredAssets].sort(),'qualified media set');for(const a of input.assets)eq(fileHash(path.join(gameDir,a.path)),a.sha256,'actual media');
 const ids=PLAN.cases.map(c=>c.id),d:any=report.prebattleNative={version:PLAN.version,productCommit:PLAN.productCommit,productRuntime:PLAN.productRuntime,inputSHA256:hash(bytes),driverPluginSHA256:input.driverPluginSHA256,packageHead:input.packageHead,nativeClaim:'NOT_SELF_QUALIFIED',expectedIDs:ids,notRunIDs:[...ids],cases:{},renders:[],cleanupErrors:[],physicalInput:'NOT_VERIFIED'};report.hostDriverVersion=PLAN.version;
 const original={parameters:G.PluginManager.parameters,language:flow.lang,fast:flow.fast,mapStart:G.Scene_Map.prototype.start,mapUpdate:G.Scene_Map.prototype.update,events:G.Game_Map.prototype.updateEvents,battleStart:G.Scene_PSBattle.prototype.start};
 eq(Object.keys(input.worldFiles).sort(),[...PLAN.worldFiles].sort(),'frozen world files');for(const[rel,h]of Object.entries(input.worldFiles))eq(fileHash(path.join(gameDir,rel)),h,'actual world fixture '+rel);
 const vars=G.$dataSystem.variables,switches=G.$dataSystem.switches,commonData=G.$dataCommonEvents,variableBase=vars.length,switchId=switches.length,commonId=commonData.length;
 const variableIds=[variableBase,variableBase+1];eq(input.fixtureIDs,{variableIds,switchId,commonId},'runtime metadata allocation');d.fixtureIDs={variableIds,switchId,commonId};vars.push('PF prebattle main continuation','PF prebattle parallel common counter');switches.push('PF prebattle controlled common enabled');
 const increment=(id:number)=>({code:122,indent:0,parameters:[id,id,1,0,1]}),commonRecord={id:commonId,name:'PF prebattle isolated common',trigger:2,switchId,list:[increment(variableIds[1]),{code:230,indent:0,parameters:[1]},{code:0,indent:0,parameters:[]}]};commonData.push(commonRecord);
 let active:any=null,first=true,ordinal=0,worldRng=PLAN.worldSeed;
 const named=(n:string)=>PLAN.prefix+n,mapReady=()=>captureHostReady(G,scene(),'map'),titleReady=()=>captureHostReady(G,scene(),'title');
 const parameters=function(this:any,name:string){const v=original.parameters.call(this,name);return name==='PS_BattleFlow'?{...v,language:'en',battleMusic:JSON.stringify({presets:{battle:named('battle'),victory:named('victory')}})}:v;};
 const covers=(s:any)=>s.children.filter((x:any)=>x.bitmap?.width===1&&x.bitmap?.height===1&&x.scale?.x===G.Graphics.boxWidth&&x.scale?.y===G.Graphics.boxHeight);
 const retireState=(h:any)=>{const desc=Object.getOwnPropertyDescriptor(h.system,'_psGame');if(desc?.get===h.get&&desc?.set===h.set)Object.defineProperty(h.system,'_psGame',{...h.descriptor,value:h.value});};
 const retireCommon=(h:any)=>{for(const map of new Set([h.map,G.$gameMap]))if(map?._commonEvents)map._commonEvents=map._commonEvents.filter((v:any)=>v._commonEventId!==commonId);};
 const render=(h:any,stage:string,s:any)=>{
  const id=h.c.id+'-'+stage,owned=covers(s);assert(owned.length===(stage==='return-complete'?0:1),'one owned cover until normal completion');const cover=owned[0],renderable=cover?.renderable;let shown:any,clear:any,row:any;
  try{
   shown=G.Bitmap.snap(s);if(cover)cover.renderable=false;clear=G.Bitmap.snap(s);if(cover)cover.renderable=renderable;
   eq([clear.width,clear.height],[shown.width,shown.height],'same-sized cover control');const rgba=[shown,clear].map(b=>b.context.getImageData(0,0,b.width,b.height).data);let cells=0,changed=0,black=0;
   for(let y=0;y<shown.height;y+=16)for(let x=0;x<shown.width;x+=16){const i=(y*shown.width+x)*4;cells++;if([0,1,2].some(k=>Math.abs(rgba[0][i+k]-rgba[1][i+k])>2))changed++;if(rgba[0][i]<4&&rgba[0][i+1]<4&&rgba[0][i+2]<4)black++;}
   const images=[shown,clear].map((b,index)=>{const file=id+(index?'-no-cover':'')+'.png',png=p.nodeRequire('buffer').Buffer.from(b.canvas.toDataURL('image/png').split(',')[1],'base64');fs.writeFileSync(path.join(path.dirname(OUT),file),png,{flag:'wx'});return{file,sha256:hash(png)};});
   const uniformBlack=stage==='handoff-black'||stage==='return-black',pass=stage==='return-complete'?black<cells*.95:changed>10&&(!uniformBlack||black>=cells*.99);
   row={id,stage,...images[0],comparisonPNG:images[1],pixelGate:pass?'pass':'fail',sampleCells:cells,changedCells:changed,blackCells:black,opacity:cover?.opacity??null,at:G.performance.now(),frame:G.Graphics.frameCount,phase:flow.prebattleState()?.phase,installs:h.installs.length};d.renders.push(row);h.captures[stage]=row;writeProgress();assert(pass,'actual composed default cover pixels '+stage);return row;
  }finally{if(cover)cover.renderable=renderable;shown?.destroy();clear?.destroy();if(row){row.samplingCleanup=cover?cover.renderable===renderable:true;writeProgress();}}
 };
 const observe=(s:any)=>{
  const h=active;if(!h||h.retired||!(s instanceof G.Scene_Map))return;
  if(!h.op&&String(flow._op?.request?.battleId).startsWith(PLAN.version+'/'+h.c.id+'#'))h.op=flow._op;
  const state=flow.prebattleState();if(!state||!h.op||flow._op!==h.op)return;
  const list=covers(s),cover=list[0],v=variableIds.map((id:number)=>G.$gameVariables.value(id));const sample={at:G.performance.now(),frame:G.Graphics.frameCount,phase:state.phase,coverCount:list.length,opacity:cover?.opacity??null,colour:cover?.bitmap?.getPixel(0,0)??null,variables:v,mainIndex:h.main._index,mainWait:h.main._waitMode,commonIndex:h.common._interpreter?._index,commonWait:h.common._interpreter?._waitCount,eventUpdates:h.eventUpdates,sessionPresent:!!h.op.session,saveEnabled:G.$gameSystem.isSaveEnabled()};h.updates.push(sample);
  if(['flash','transition','after','return-pending','return'].includes(state.phase)){
   assert(!sample.saveEnabled&&flow.operationPending(),'save/root barrier during every pending Map update');eq(list.length,1,'pending map has owned cover');
   eq(v,h.openVariables,'first and later pending updates do not advance world event counters');eq([state.flashColour,state.mainMs,state.flashMs,state.afterMs,state.returnMs],[h.c.flash,h.c.mainMs,800,100,400],'declared default context and targets');
   if(!h.held){h.held={variables:v,mainIndex:sample.mainIndex,mainWait:sample.mainWait,commonIndex:sample.commonIndex,commonWait:sample.commonWait,commonInterpreter:h.common._interpreter};}
   eq(v,h.held.variables,'main and parallel common events do not advance during pending');eq([sample.mainIndex,sample.mainWait,sample.commonIndex,sample.commonWait],[h.held.mainIndex,h.held.mainWait,h.held.commonIndex,h.held.commonWait],'event indices and waits preserved');assert(h.common._interpreter===h.held.commonInterpreter,'same common interpreter');
   if(state.phase==='flash'&&cover.opacity>=190&&!h.captures.flash)render(h,'flash',s);
   if(state.phase==='transition'&&cover.opacity>25&&cover.opacity<230&&!h.captures['entry-mid'])render(h,'entry-mid',s);
   if(state.phase==='after'&&!h.captures['handoff-black'])render(h,'handoff-black',s);
   if(state.phase==='return'&&cover.opacity===255&&!h.captures['return-black'])render(h,'return-black',s);
   if(state.phase==='return'&&cover.opacity>25&&cover.opacity<230&&!h.captures['return-mid'])render(h,'return-mid',s);
   if(['flash','transition','after'].includes(state.phase)){eq(h.installs.length,0,'no state install before handoff');eq(flow.game(),h.before,'whole framework state unchanged before handoff');assert(!h.op.session,'no Session before black handoff');}
  }
  if(state.phase==='done'&&!h.captures['return-complete'])render(h,'return-complete',s);
 };
 const mapStart=function(this:any,...args:any[]){const r=original.mapStart.apply(this,args);observe(this);return r;};
 const mapUpdate=function(this:any,...args:any[]){const r=original.mapUpdate.apply(this,args);observe(this);return r;};
 const events=function(this:any,...args:any[]){if(active?.map===this)active.eventUpdates++;return original.events.apply(this,args);};
 const battleStart=function(this:any,...args:any[]){const r=original.battleStart.apply(this,args);if(active&&this._psOp===active.op){active.battle=this;active.sessionStarts++;}return r;};
 const wait=(cond:()=>boolean,label:string)=>waitFor(()=>{if(active?.battle?._failure&&!active.cancelled)throw Error('actual prebattle Scene failure: '+active.battle._failure);return cond();},label);
 const command=(s:any,key:any)=>{const view=s.inputState();assert(view.ready,'actual command ready');const index=view.items.findIndex((x:any)=>x.key===key);assert(index>=0,'stable command identity '+String(key));s._menu.select(index);s.onMenuOk();};
 const run=async(c:any)=>{
  const began=G.performance.now();let h:any;
  try{
   await wait(()=>mapReady()||first&&titleReady(),'started cold Title or later Map');first=false;assert(!flow.operationPending(),'previous root released');flow.stateReplaced();flow._app=null;flow._content=musicNativeContent(E,assert,{battle:named('battle'),victory:named('trainer-victory')});flow._content.trainerTypes['music-type-normal'].introBgm='';flow._dex=E.dex.createDexLookup();flow.setLanguage(null);flow.seed=[...PLAN.seed];worldRng=PLAN.worldSeed;flow.rng=(n:number)=>{worldRng=(Math.imul(worldRng,1664525)+1013904223)>>>0;return Math.floor(worldRng/4294967296*n);};flow.fast=false;
   G.$gameSystem._psGame=musicNativeState(E,flow._content);G.$gameMessage.clear();G.$gameMap._interpreter.clear();await toMapId(PLAN.mapId,8,9);await wait(mapReady,'actual Map.start/windows/spriteset');await press('shift');
   G.AudioManager.playBgm({name:named('world'),volume:80,pitch:100,pan:0});const map=G.$gameMap;G.$gameSwitches.setValue(switchId,true);for(const id of variableIds)G.$gameVariables.setValue(id,0);const common=new G.Game_CommonEvent(commonId);map._commonEvents.push(common);await wait(()=>G.$gameVariables.value(variableIds[1])>0,'real parallel common event warm-up');
   const system=G.$gameSystem,descriptor:any=Object.getOwnPropertyDescriptor(system,'_psGame');assert(descriptor?.configurable&&descriptor.writable&&'value'in descriptor,'observable plain state');h={c,map,source:scene(),main:map._interpreter,common,system,descriptor,value:descriptor.value,before:clone(flow.game()),app:flow.app(),generation:flow.app().stateGeneration,installs:[],updates:[],captures:{},sessionStarts:0,eventUpdates:0};h.get=()=>h.value;h.set=(value:any)=>{h.installs.push({at:G.performance.now(),frame:G.Graphics.frameCount});h.value=value;};Object.defineProperty(system,'_psGame',{configurable:true,enumerable:descriptor.enumerable,get:h.get,set:h.set});
   const args={battleId:PLAN.version+'/'+c.id,trainerId:'music-normal',version:'1',kind:c.kind,foes:'Pidgey:3',canLose:'true',resultVariable:'0',battleTime:String(c.time),prebattleLocation:String(c.location)};
   h.openVariables=variableIds.map((id:number)=>G.$gameVariables.value(id));h.main.setup([{code:357,indent:0,parameters:['PS_BattleFlow',c.kind==='trainer'?'StartTrainerBattle':'StartBattle','',args]},increment(variableIds[0]),{code:0,indent:0,parameters:[]}]);
   // The command starts inside actual Map.updateInterpreter; observe only after its op exists.
   active=h;await wait(()=>!!flow._op&&flow.running,'actual event command opens root');h.op=flow._op;observe(scene());await wait(()=>!!h.captures.flash,'natural first flash capture');
   if(c.finish==='normal'){
    await wait(()=>!!battle()?._session&&battle().isStarted(),'actual post-wrapper started Session/Scene');h.battle=battle();assert(h.sessionStarts===1&&h.battle._session===h.op.session,'one original Session/Scene start');
    for(let turn=0;turn<12&&!h.battle._session.finished;turn++){await inMode('main');command(h.battle,'fight');await inMode('moves');command(h.battle,1);await wait(()=>!h.battle._busy,'actual action completes');await frames(2);}
    await wait(()=>h.battle._mode==='end'&&!h.battle._busy&&h.battle._queue.length===0,'actual result confirmation');await frames(2);eq(h.installs.length,0,'no commit before result confirmation');command(h.battle,'end');
    await wait(()=>flow.prebattleState()?.phase==='done'&&mapReady(),'normal return fade complete');await frames(2);eq(h.installs.length,1,'one actual state commit after confirmation');eq(G.$gameVariables.value(variableIds[0]),1,'main event continues once after return');assert(G.$gameVariables.value(variableIds[1])>h.held.variables[1],'same common resumes after return');
    for(const stage of ['flash','entry-mid','handoff-black','return-black','return-mid','return-complete'])assert(h.captures[stage],'actual rendered stage '+stage);
    const stages=flow.prebattleState().stages;for(const[phase,target]of [['flash',800],['transition',c.mainMs],['after',100],['return',400]]as const){const at=stages.findIndex((x:any)=>x.phase===phase);assert(at>=0&&stages[at+1]&&stages[at+1].at-stages[at].at>=target,'actual wall-clock stage minimum '+phase);}
    eq(G.AudioManager._currentBgm?.name,named('world'),'world BGM registration restored');
   }else{
    eq(h.sessionStarts,0,'no battle Scene before cancellation');eq(h.installs.length,0,'no pre-entry commit');h.cancelled=true;
    if(c.finish==='cancel')flow.abort(Error('owned prebattle native cancellation'),h.op);
    else{retireState(h);G.DataManager.setupNewGame();assert(G.$gameSystem!==h.system,'actual newgame replaces host system');assert(flow._app!==h.app||h.app.stateGeneration!==h.generation,'actual newgame changes owner');h.newGameBefore=clone(flow.game());await toMapId(PLAN.mapId,8,9);}
    await wait(()=>mapReady()&&!flow.operationPending(),'cancel/newgame returns ready Map');const retiredAt=G.performance.now();await wait(()=>G.performance.now()-retiredAt>=2400,'finite post-cancel no-late-entry window');assert(scene()instanceof G.Scene_Map&&!battle()&&h.sessionStarts===0,'no late old BattleScene');eq(h.installs.length,0,'old root never installs state');eq(h.value,h.before,'old state unchanged');eq(covers(scene()).length,0,'no owned cover remains');
    if(c.finish==='cancel'){eq(G.$gameVariables.value(variableIds[0]),1,'cancel continues main event once');assert(G.$gameVariables.value(variableIds[1])>h.held.variables[1],'cancel resumes common');}else eq(flow.game(),h.newGameBefore,'no old writes into newgame');
   }
   assert(h.eventUpdates>0,'actual map event/graphics scheduling continued');assert(!flow.operationPending()&&G.$gameSystem.isSaveEnabled(),'root/save barrier released');
   h.retired=true;retireState(h);retireCommon(h);d.cases[c.id]={kind:c.kind,finish:c.finish,updates:h.updates,installs:h.installs,beforeSHA256:hash(stable(h.before)),afterSHA256:hash(stable(h.value)),sessionStarts:h.sessionStarts,eventUpdates:h.eventUpdates,renderIDs:Object.values(h.captures).map((x:any)=>x.id),prebattle:flow.prebattleState(),oldOwnerChanged:c.finish==='newgame',returnedToMap:true};active=null;results.push({id:c.id,status:'pass',ms:G.performance.now()-began});
  }catch(error){results.push({id:c.id,status:'fail',error:String((error as any)?.stack??error)});throw error;}
  finally{d.notRunIDs=ids.filter(id=>!results.some((r:any)=>r.id===id));writeProgress();}
 };
 let failed=false,primary:unknown;
 try{G.PluginManager.parameters=parameters;G.Scene_Map.prototype.start=mapStart;G.Scene_Map.prototype.update=mapUpdate;G.Game_Map.prototype.updateEvents=events;G.Scene_PSBattle.prototype.start=battleStart;for(const c of PLAN.cases)await run(c);eq(results.map((r:any)=>[r.id,r.status]),ids.map(id=>[id,'pass']),'four frozen prebattle paths');eq(d.renders.map((r:any)=>r.id),PLAN.cases.flatMap(c=>PLAN.renderStages[c.id as keyof typeof PLAN.renderStages].map(stage=>c.id+'-'+stage)),'exact ordered key render stages');}
 catch(error){failed=true;primary=error;throw error;}
 finally{
  d.primaryError=failed?String(primary):null;const clean=(name:string,fn:()=>void)=>{try{fn();}catch(error){d.cleanupErrors.push({name,error:String(error)});}};
  if(active&&flow._op===active.op)clean('own root',()=>flow.abort(Error('prebattle qualification failure cleanup'),active.op));
  if(active){clean('state observer',()=>retireState(active));clean('common event',()=>retireCommon(active));}
  for(const[obj,key,value,ours]of [[G.PluginManager,'parameters',original.parameters,parameters],[G.Scene_Map.prototype,'start',original.mapStart,mapStart],[G.Scene_Map.prototype,'update',original.mapUpdate,mapUpdate],[G.Game_Map.prototype,'updateEvents',original.events,events],[G.Scene_PSBattle.prototype,'start',original.battleStart,battleStart]]as any[])clean(key,()=>{if(obj[key]===ours)obj[key]=value;});
  clean('fixture metadata',()=>{if(commonData[commonId]===commonRecord)commonData.splice(commonId,1);vars.splice(variableBase,2);switches.splice(switchId,1);});clean('language/fast',()=>{flow.setLanguage(original.language);flow.fast=original.fast;});
  d.remainingRootLocked=!!flow._app?.saveBlocked||flow.running;d.cleanupComplete=d.cleanupErrors.length===0;writeProgress();if(!failed&&(d.remainingRootLocked||!d.cleanupComplete))throw Error('prebattle driver cleanup failed');
 }
}
