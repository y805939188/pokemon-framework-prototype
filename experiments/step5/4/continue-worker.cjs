'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {E,T}=require('./trainer-ai-integration/fixtures.cjs'),{makeContent}=require('./mz-slot-worker.cjs'),{createContinueHost}=require('./continue-host.cjs'),{sha}=require('./mz-slot-host.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>sha(E.contentCompile.canonicalJson(v));
async function consumer(id,folder,hostRoot,productRoot,plan){
 folder=fs.realpathSync(folder);assert.equal(path.dirname(folder),fs.realpathSync(os.tmpdir()));assert(path.basename(folder).startsWith('pf-e-mz-slot-'));
 const c=plan.cases.find(c=>c.id===id);assert(c);const sourcePlan=require('./e-mz-slot-contracts.json'),marker=JSON.parse(fs.readFileSync(path.join(folder,'OWNED.json')));
 assert.equal(marker.caseId,c.sourceCase);assert.equal(marker.planVersion,sourcePlan.version);
 for(const[p,h]of Object.entries(plan.engine))assert.equal(sha(fs.readFileSync(path.resolve(__dirname,'../../..',p))),h);
 const content=makeContent(c.kind),h=createContinueHost(hostRoot,productRoot,folder,content,plan.host),g=h.context,slot=path.join(folder,'file1.rmmzsave'),initialSystem=g.$gameSystem,initialMap=g.$gameMap,slotBefore=sha(fs.readFileSync(slot));
 await h.readGlobal();assert.equal(h.commands().find(x=>x.symbol==='continue').enabled,true);const route=await h.continueSlot(1);
 if(c.corrupt){
  assert.equal(route.outcome,'failure');assert.equal(route.loadSuccess,false);assert.equal(route.listActive,true);assert.equal(g.$gameSystem,initialSystem);assert.equal(g.$gameMap,initialMap);assert.equal(g.PSFlow.replacements,0);assert.equal(h.io.length,0);assert.equal(sha(fs.readFileSync(slot)),slotBefore);
  assert.equal(route.trace.filter(x=>x.kind==='goto').length,0);assert.equal(route.trace.filter(x=>x.kind==='buzzer').length,1);assert.equal(route.trace.filter(x=>x.kind==='game-system-after-load').length,0);
  return{id,sourceCase:c.sourceCase,pid:process.pid,ppid:process.ppid,scope:plan.scope,route,slotBefore,slotAfter:sha(fs.readFileSync(slot)),writes:h.records(),host:h.hashes,loadRejected:true,NW:0};
 }
 assert.equal(route.outcome,'success');assert.equal(route.loadSuccess,true);assert.equal(route.listActive,false);assert.equal(g.PSFlow.replacements,1);assert.notEqual(g.$gameSystem,initialSystem);assert.equal(g.$gameSystem.constructor.name,'Game_System');assert.equal(g.$gameMap.constructor.name,'Game_Map');assert.equal(g.$gameMap._mapId,5);assert.equal(g.$gamePlayer._x,3);assert.equal(g.$gamePlayer._y,4);
 assert.equal(route.trace.filter(x=>x.kind==='goto'&&x.scene==='Scene_Map').length,1);assert.equal(route.trace.filter(x=>x.kind==='game-system-after-load').length,1);assert.equal(route.trace.find(x=>x.kind==='load-game-return').value,0);assert.equal(h.io.length,0);assert.equal(sha(fs.readFileSync(slot)),slotBefore);
 const loaded=clone(g.$gameSystem._psGame);assert.equal(loaded.party[0].item,c.kind==='consume'?'':'leftovers');assert.equal(loaded.party[0].moves[0].pp,39);assert.deepEqual(Object.keys(loaded.appliedBattles),[c.sourceCase+'/first']);
 let installs=0;const state={read:()=>g.$gameSystem._psGame,replace:value=>{installs++;g.$gameSystem._psGame=value;}};
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),content:()=>({content,dex:E.dex.createDexLookup()}),random:()=>0,clock:()=>12345},{capabilities:{allowHeldItemSources:true,allowExperimentalHeldItemBattle:true}});
 g.PSFlow._app=app;const req={battleId:id+'/after-continue',seq:2,...(c.kind==='knockoff'?{trainer:{id:'c-basic',version:1}}:{kind:'wild',foes:[{species:'pidgey',level:5}]}),canLose:true,expGain:false};
 const s=await(c.kind==='knockoff'?app.startTrainerBattle(req):app.startBattle(req));s.take();g.PSFlow.running=true;
 try{
  const first=await s.chooseMove(1);assert(first.ok);const events=first.messages.flatMap(m=>m.kind==='events'?m.events:[]);assert.equal(s.gw.readState('p1')[0].pp.splash,38);
  if(c.kind==='consume')assert(!events.some(e=>e.type==='-enditem'&&e.args[1]==='Oran Berry'));
  else assert(events.some(e=>e.type==='-enditem'&&e.args.includes('[from] move: Knock Off')));
  assert.deepEqual(state.read(),loaded);assert.equal(installs,0);const end=await(c.kind==='knockoff'?s.chooseMove(2):s.run());assert(end.ok&&s.finished);assert.deepEqual(state.read(),loaded);
  const result=s.result(),outcome=app.finishBattle(s,req);assert.equal(outcome.commit,'applied');assert.equal(installs,1);const final=clone(state.read());app.finishBattle(s,req);assert.equal(installs,1);assert.deepEqual(state.read(),final);assert.equal(final.party[0].item,c.kind==='consume'?'':'leftovers');assert.equal(final.appliedBattles[req.battleId].hash,E.state.resultHash(result));assert.equal(Object.keys(final.appliedBattles).length,2);
  g.PSFlow.running=false;assert.equal(await g.DataManager.saveGame(1),0);await h.drain();assert.equal(h.records().filter(x=>x.name==='file1').length,1);
  return{id,sourceCase:c.sourceCase,pid:process.pid,ppid:process.ppid,scope:plan.scope,route,loaded,loadedHash:hash(loaded),final,finalHash:hash(final),result,resultHash:E.state.resultHash(result),installs,slotBefore,slotAfter:sha(fs.readFileSync(slot)),slotBytesBase64:fs.readFileSync(slot).toString('base64'),globalBytesBase64:fs.readFileSync(path.join(folder,'global.rmmzsave')).toString('base64'),writes:h.records(),host:h.hashes,NW:0};
 }finally{g.PSFlow.running=false;if(!s.finished)app.abortBattle(req,Error('owned Continue worker cleanup'));await h.drain();}
}
module.exports={consumer};
if(require.main===module){const[id,folder,hostRoot,productRoot,planFile]=process.argv.slice(2);consumer(id,folder,hostRoot,productRoot,JSON.parse(fs.readFileSync(planFile))).then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{console.error(error.stack??error);process.exitCode=1;});}
