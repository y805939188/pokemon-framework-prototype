/* eslint-disable @typescript-eslint/no-explicit-any */
/** C3: actual NW/MZ services, formal app/Showdown sessions and an ordinary new-process Continue.
 * Programmatic choices and controlled author/HP fixtures are disclosed; no model or physical-input claim.
 */
import { progressionDonorInputs } from './source-fixture';
function content(E:any,assert:any,strategy?:any):any {
 const input=progressionDonorInputs();
 input.species.find((s:any)=>s.id==='snorlax').learnset=['splash','payday'].map(move=>({level:1,move}));
 input.species.find((s:any)=>s.id==='pidgey').learnset=['tackle','growl'].map(move=>({level:1,move}));
 input.items=Object.values(E.itemCatalog.legacyCatalog()).map((item:any)=>({...item,source:'author-placeholder'}));
 if(!input.items.some((i:any)=>i.id==='fullrestore'))input.items.push({id:'fullrestore',name:'Full Restore',namePlural:'Full Restores',pocket:2,battleId:'fullrestore',battleUse:'member',source:'author-placeholder'});
 const full=input.items.find((i:any)=>i.id==='fullrestore');full.battleId='fullrestore';full.battleUse='member';
 input.trainerTypes=[{id:'c-host-type',nameKey:'trainer.type.c',gender:0,source:'author-placeholder',baseMoney:0,skillLevel:100,flags:[],items:[{item:'fullrestore',count:1}]}];
 input.trainers=[{id:'c-host',type:'c-host-type',name:'C Native',version:1,source:'author-placeholder',party:[{species:'pidgey',level:50,moves:['tackle','growl']},{species:'pidgey',level:50,moves:['tackle','growl']}],...(strategy?{aiStrategy:strategy}:{})}];
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert(!assembled.errors.length,JSON.stringify(assembled.errors));return assembled.content;
}
function setup(p:any,c:any):any {
 const {G,W,api}=p,E=api();W.PSFlow.stateReplaced();W.PSFlow._app=null;W.PSFlow._content=c;W.PSFlow._dex=E.dex.createDexLookup();W.PSFlow.developerCapabilities={};W.PSFlow.seed=[1,2,3,4];W.PSFlow.rng=()=>0;
 const game=E.state.newGame({content:c,party:[],money:1000,bag:{potion:2}});game.badges.fill(true);game.party=[E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P1',species:'Snorlax',level:100},c,()=>0),c)];game.nextMemberOrdinal='2';G.$gameSystem._psGame=game;return W.PSFlow.app();
}
function request(id:string):any{return {battleId:id,trainer:{id:'c-host',version:1},seq:1,canLose:true};}
function actor(h:any):any{return h.gw._debugBattle().sides[1].active[0];}
function seedActor(h:any,values:any):void {
 // Use real engine status constructors: renderer-created statusState objects are not valid Showdown checkpoints.
 const a=actor(h);a.maxhp=100;a.hp=values.hp??100;
 if(values.status)a.setStatus(values.status);else a.clearStatus();
 if(values.confusion){a.addVolatile('confusion');a.volatiles.confusion.time=values.confusion;}else a.removeVolatile('confusion');
 h.gw.refreshRequests();
}
async function finish(p:any,h:any,app:any,req:any):Promise<any>{
 for(let i=0;i<12&&!h.finished;i++){p.assert(!h.pendingLearn,'level100 fixture has no learning prompt');p.assert((await h.chooseMove(2)).ok,'actual terminal Pay Day');}
 p.assert(h.finished,'actual terminal trainer battle');const raw=h.result(),out=app.finishBattle(h,req);p.eq(out.commit,'applied','actual paired settlement');const before=p.clone(p.game());p.eq(p.W.PSFlow.commit(raw),'already-applied','ordinary PSFlow exact replay');p.eq(p.game(),before,'no second install');return raw;
}
export async function runTrainerAiHost(p:any):Promise<void>{
 const {G,W,api,assert,eq,scenario,toMapId,game,clone,fs,path,OUT,settledSave,frames,hashFile}=p,E=api(),D=p.nodeRequire('./js/engine/build/testing.cjs').trainerAiDiagnostics;
 await toMapId(5,8,9);let checkpoint:any=null;
 for(const [name,values,hp]of [['hp',{hp:20},100],['status',{status:'psn'},0],['confusion',{confusion:1},0],['combined',{hp:20,status:'brn',confusion:2},100]] as const){
  await scenario('C-HOST-FR-'+name+' real FullRestore/request/owned resource',async()=>{
   const c=content(E,assert),app=setup(p,c),req=request('C-HOST-'+name),h=await app.startTrainerBattle(req),before=clone(h.bag);seedActor(h,values);
   const turn=await h.chooseMove(1);assert(turn.ok,'real Splash/AI turn');const a=actor(h),d=D.trainerAiDiagnostics(h);eq([a.hp,a.status,!!a.volatiles.confusion],[100,'',false],'actual HP/status/confusion effect');eq([d.state.resources[0].count,d.state.ledger[0].state],[0,'consumed'],'owned resource once');eq(h.bag,before,'player bag unchanged');
   const event=turn.messages.flatMap((m:any)=>m.kind==='events'?m.events:[]).find((e:any)=>e.type==='rpg'&&e.args[0]==='item'&&e.args[1]==='p2');assert(event&&event.args[4]==='ok','actual item event');eq(Number(event.args[8]),hp,'execution amount distinct from999estimate');h._onEvent(event);eq(D.trainerAiDiagnostics(h).state.resources[0].count,0,'duplicate event no consumption/refund');
   if(name==='combined'){const raw=await finish(p,h,app,req);assert(game().appliedBattles[raw.battleId].settlement?.pairHash,'real companion paired receipt');G.$gameMessage.clear();await frames(3);assert(!app.saveBlocked,'settled before save');await settledSave(15);const file=G.StorageManager.filePath(G.DataManager.makeSavename(15));checkpoint={slot:15,fileHash:hashFile(file),state:clone(game()),content:c,result:clone(raw)};fs.writeFileSync(path.join(path.dirname(OUT),'ps-flow-expected-C-ai.json'),JSON.stringify({kind:'C-ai-v1',checkpoint}));}
   else app.abortBattle(req,Error('C3 completed isolated effect control'));
   G.$gameMessage.clear();return {input:'actual NW/MZ App/Showdown; controlled author/HP precondition, programmatic service choices',requestHp:hp,ownResource:0};
  });
 }
 await scenario('C-HOST-ASYNC renderer JSON and Promise select actual preferred move',async()=>{
  const reference={id:'c-native-delay',version:'1',parameters:{slot:2}},c=content(E,assert,reference);setup(p,c);let calls=0,world=0,received:any;
  const registry=E.composition.createTrainerAiStrategyRegistry();registry.register({id:'c-native-delay',version:'1',implementationIdentity:'test/real-NW-C3/1',validateParameters(parameters:any){eq(parameters,{slot:2},'cross-context parameters');},create(){return {decide(snapshot:any,parameters:any,random:any){calls++;received=snapshot;assert(Object.isFrozen(snapshot.own.party[0].moves),'deep frozen public values');random(13);return new Promise(resolve=>setTimeout(()=>{const m=snapshot.request.legalMoves.find((v:any)=>v.slot===parameters.slot);resolve({kind:'choose',binding:snapshot.binding,candidateId:m.candidateId,retryOrder:[m.candidateId],diagnostics:[]});},10));}};}});
  const app=new E.app.GameApplication({state:{read:()=>game(),replace:(next:any)=>{G.$gameSystem._psGame=next;}},content:()=>({content:c,dex:E.dex.createDexLookup()}),sessions:E.composition.createBattleSessionFactory({content:()=>c,seed:()=>[1,2,3,4],trainerAiStrategies:registry}),random:()=>{world++;return 0;},projection:{project(){}},clock:()=>12345});W.PSFlow._app=app;
  const req=request('C-HOST-native-async'),h=await app.startTrainerBattle(req),beforeWorld=world,cp=h._checkpoint();assert((await h.chooseMove(1)).ok,'actual async strategy turn');const journal=D.trainerAiJournal(h);eq(calls,1,'one inference');eq(D.trainerAiDiagnostics(h).state.random.draws,1,'one private draw');eq(journal.entries[0].fallbackReason,null,'accepted foreign native Promise, not fallback');assert(/:m:1$/.test(journal.entries[0].plan.candidateId),'preferred Growl intent');eq(world,beforeWorld,'no added world draw');eq(Object.keys(received).sort(),['schema','gen','format','binding','profile','own','opponent','field','request'].sort(),'public whitelist only');
  await h._restoreCheckpoint(cp);eq(D.trainerAiDiagnostics(h).state.random.draws,0,'real checkpoint restores active RNG');eq(D.trainerAiJournal(h).entries.length,1,'actual inference journal survives rewind');assert((await h.chooseMove(1)).ok,'actual checkpoint replay turn');eq(calls,1,'checkpoint replay never re-infers');eq(D.trainerAiDiagnostics(h).state.random.draws,1,'one actual recorded RNG after');eq(D.trainerAiJournal(h).entries[0].plan,journal.entries[0].plan,'same actual intent');eq(world,beforeWorld,'replay adds no world draws');app.abortBattle(req,Error('C3 async control done'));return {input:'actual renderer strategy/Promise, opaque Showdown checkpoint and recorded decision replay; not a model',calls};
 });
 assert(checkpoint,'producer checkpoint created');
 await scenario('C-HOST-EVENT formal trainer command still uses default basic and paired installation',async()=>{
  const c=content(E,assert);setup(p,c);W.PSFlow.fast=true;const interpreter=new G.Game_Interpreter();G.PluginManager.callCommand(interpreter,'PS_BattleFlow','StartTrainerBattle',{trainerId:'c-host',version:'1',battleId:'C-HOST-event',canLose:'true'});await p.inMode('main');const h=p.battle()._session;eq(D.trainerAiDiagnostics(h).strategyBinding.id,'basic-gen8','formal scene default strategy');await p.fightUntilEnd(/pay day/i,12);await p.finishBattle();eq(W.PSFlow.lastOutcome.commit,'applied','real command/scene installs');assert(game().appliedBattles[W.PSFlow.lastResult.battleId].settlement?.pairHash,'real scene paired receipt');return {input:'actual MZ plugin command and scene; synthetic DOM keys, not hardware'};
 });
}
export async function continueTrainerAiHost(p:any):Promise<void>{
 const {G,W,api,scenario,assert,eq,game,clone,scene,waitFor,press,frames,readExpected,hashFile}=p,E=api(),D=p.nodeRequire('./js/engine/build/testing.cjs').trainerAiDiagnostics;
 const expected=readExpected('ps-flow-expected-C-ai.json');assert(expected.kind==='C-ai-v1','fixed versioned checkpoint');const c=expected.checkpoint;
 await scenario('C-CONTINUE actual fresh Title/Continue/load and next formal AI battle',async()=>{
  W.PSFlow.stateReplaced();W.PSFlow._app=null;W.PSFlow._content=c.content;W.PSFlow._dex=E.dex.createDexLookup();W.PSFlow.developerCapabilities={};W.PSFlow.rng=()=>0;W.PSFlow.seed=[1,2,3,4];const file=G.StorageManager.filePath(G.DataManager.makeSavename(c.slot));eq(hashFile(file),c.fileHash,'original save bytes');G.SceneManager.goto(G.Scene_Title);
  await waitFor(()=>scene() instanceof G.Scene_Title&&scene().isStarted()&&scene()._commandWindow.isOpenAndActive()&&!scene().isBusy()&&!G.SceneManager.isSceneChanging(),'C Title');scene()._commandWindow.selectSymbol('continue');assert(scene()._commandWindow.isCurrentItemEnabled(),'ordinary Continue enabled');await press('ok');
  await waitFor(()=>scene() instanceof G.Scene_Load&&scene().isStarted()&&scene()._listWindow.isOpenAndActive()&&!scene().isBusy()&&!G.SceneManager.isSceneChanging(),'C load list');const load=scene();load._listWindow.selectSavefile(c.slot);eq(load._listWindow.savefileId(),c.slot,'ordinary selected slot');await press('ok');await waitFor(()=>scene() instanceof G.Scene_Map&&scene().isStarted()&&!G.SceneManager.isSceneChanging(),'C loaded map');assert(load._loadSuccess,'actual load success');eq(game(),c.state,'whole JsonEx document');await frames(8);eq(game(),c.state,'no automatic repeated installation');const before=clone(game());eq(W.PSFlow.commit(c.result),'already-applied','new process exact query');eq(game(),before,'no repeated inventory/friendship/main writes');assert(!W.PSFlow.app().saveBlocked,'no persisted transient owner');
  eq(W.PSFlow.app().healParty().status,'healed','explicit normal healing');const app=W.PSFlow.app(),req=request('C-HOST-after-continue'),h=await app.startTrainerBattle(req);eq(D.trainerAiDiagnostics(h).state.resources[0].count,1,'new battle owns fresh NPC stock, not player save data');seedActor(h,{hp:20});assert((await h.chooseMove(1)).ok,'next actual FullRestore turn');eq(D.trainerAiDiagnostics(h).state.resources[0].count,0,'new actual owned consumption');await finish(p,h,app,req);eq(hashFile(file),c.fileHash,'next battle never overwrites producer checkpoint');G.$gameMessage.clear();return {slot:c.slot,input:'actual fresh NW/MZ Title/Continue and next battle; synthetic DOM/service choices'};
 });
}
