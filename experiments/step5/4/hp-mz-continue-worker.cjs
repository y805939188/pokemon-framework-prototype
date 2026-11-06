'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),{createHost,sha}=require('./mz-slot-host.cjs'),{createContinueHost}=require('./continue-host.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>sha(E.contentCompile.canonicalJson(v)),events=ms=>ms.flatMap(m=>m.kind==='events'?m.events:[]),ID='HP-CARRY-P1';
function makeContent(){const input=inputs({moves:['splash']});input.species.find(s=>s.id==='snorlax').learnset=[{level:1,move:'recover'},{level:1,move:'doubleedge'}];input.species.push({id:'slowbro',showdownId:'slowbro',nameKey:'species.slowbro',growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:[{level:1,move:'splash'}],source:'author-placeholder'});const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);return joined.content;}
async function worker(stage,id,folder,hostRoot,productRoot,plan){
 assert(['producer','consumer','verify-third'].includes(stage));folder=fs.realpathSync(folder);assert.equal(path.dirname(folder),fs.realpathSync(os.tmpdir()));assert(path.basename(folder).startsWith('pf-e-mz-slot-'));
 const marker=JSON.parse(fs.readFileSync(path.join(folder,'OWNED.json')));assert.equal(marker.planVersion,plan.version);assert.equal(marker.caseId,id);const c=plan.cases.find(c=>c.id===id);assert(c);assert(stage!=='verify-third'||c.abortConsumer);
 for(const[n,h]of Object.entries(plan.engine))assert.equal(sha(fs.readFileSync(path.resolve(__dirname,'../../..',n))),h);
 const content=makeContent(),h=stage==='producer'?createHost(hostRoot,productRoot,folder,content,plan.host):createContinueHost(hostRoot,productRoot,folder,content,plan.host),g=h.context;
 const slot=path.join(folder,'file1.rmmzsave'),global=path.join(folder,'global.rmmzsave'),raw=()=>fs.readFileSync(slot),slotBefore=fs.existsSync(slot)?sha(raw()):null;let loaded=null,route=null;
 if(stage==='producer'){
  assert.equal(slotBefore,null);const m=E.memberFactory.createMember({id:ID,species:'Snorlax',level:50,nature:'hardy',abilityIndex:1},content,()=>0);assert.equal(m.hp,220);assert.equal(m.ability,'Thick Fat');if(c.effect==='recover')m.hp=55;
  g.$gameSystem._psGame=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(m,content)],money:1000});g.$gameSystem._psGame.nextMemberOrdinal='2';g.$gameVariables._data=[null,'owned HP/PP continuation',544];g.$gameMap._mapId=5;g.$gamePlayer._x=3;g.$gamePlayer._y=4;
 }else{
  assert(slotBefore);await h.readGlobal();assert.equal(h.commands().find(x=>x.symbol==='continue').enabled,true);route=await h.continueSlot(1);
  assert.equal(route.outcome,'success');assert.equal(route.loadSuccess,true);assert.equal(route.listActive,false);assert.equal(route.trace.find(x=>x.kind==='load-game-return').value,0);assert.equal(route.trace.filter(x=>x.kind==='goto'&&x.scene==='Scene_Map').length,1);assert.equal(route.trace.filter(x=>x.kind==='game-system-after-load').length,1);assert.equal(route.trace.filter(x=>x.kind==='base-terminate').length,1);assert.equal(g.PSFlow.replacements,1);
  assert.equal(h.io.length,0);assert.equal(sha(raw()),slotBefore);loaded=clone(g.$gameSystem._psGame);
  assert.equal(g.$gameSystem.constructor.name,'Game_System');assert.equal(g.$gameMap.constructor.name,'Game_Map');assert.equal(g.$gameVariables.constructor.name,'Game_Variables');assert.deepEqual(clone(g.$gameVariables._data),[null,'owned HP/PP continuation',544]);assert.equal(g.$gameMap._mapId,5);assert.equal(g.$gamePlayer._x,3);assert.equal(g.$gamePlayer._y,4);
  assert.deepEqual(Object.keys(loaded.appliedBattles),[id+'/first']);
 }
 const installs=[],state={read:()=>g.$gameSystem._psGame,replace:next=>{installs.push(clone(next));g.$gameSystem._psGame=next;}};
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});g.PSFlow._app=app;
 const before=clone(state.read()),battleId=id+(stage==='producer'?'/first':stage==='consumer'?'/second':'/third'),request={battleId,seq:stage==='producer'?1:stage==='consumer'?2:3,kind:'wild',foes:[{species:'slowbro',level:50}],canLose:true,expGain:false};const s=await app.startBattle(request);s.take();g.PSFlow.running=true;
 const live=()=>({p1:clone(s.gw.readState('p1').find(m=>m.id===ID)),p2:clone(s.gw.readState('p2')[0])}),initialLive=live();assert.equal(initialLive.p1.hp,before.party[0].hp);assert.deepEqual(initialLive.p1.pp,Object.fromEntries(before.party[0].moves.map(m=>[m.id,m.pp])));
 try{
  const writes=h.io.length;await assert.rejects(g.DataManager.saveGame(1));assert.equal(h.io.length,writes);assert.deepEqual(state.read(),before);if(slotBefore)assert.equal(sha(raw()),slotBefore);
  const move=c.effect==='recover'?'recover':'doubleedge',at=before.party[0].moves.findIndex(m=>m.id===move)+1;assert(at>0);const action=await s.chooseMove(at);assert(action.ok,JSON.stringify(action));const after=live(),ev=events(action.messages),loss=initialLive.p2.hp-after.p2.hp;
  assert.equal(after.p1.pp[move],initialLive.p1.pp[move]-1);for(const[k,v]of Object.entries(initialLive.p1.pp))if(k!==move)assert.equal(after.p1.pp[k],v);assert.equal(after.p2.pp.splash,initialLive.p2.pp.splash-1);
  if(c.effect==='recover'){assert.equal(loss,0);assert.equal(after.p1.hp,Math.min(220,initialLive.p1.hp+110));assert(ev.some(e=>e.type==='-heal'&&e.args[0]==='p1a: '+ID));}
  else{assert(loss>0&&after.p2.hp>0);assert.equal(after.p1.hp,initialLive.p1.hp-Math.max(1,Math.round(loss/3)));assert(ev.some(e=>e.type==='-damage'&&e.args[0]==='p1a: '+ID&&e.args.some(x=>/recoil/i.test(x))));}
  assert.deepEqual(state.read(),before);assert.equal(installs.length,0);assert.equal(h.io.length,writes);if(slotBefore)assert.equal(sha(raw()),slotBefore);
  const turn={move,before:initialLive,after,messages:clone(action.messages)};
  if(stage==='consumer'&&c.abortConsumer){
   app.abortBattle(request,Error('owned continuation cancellation'));const outcome=app.finishBattle(s,request);assert.equal(outcome.commit,'none');assert(outcome.aborted);assert.equal(installs.length,0);assert.deepEqual(state.read(),before);assert.equal(h.io.length,0);assert.equal(sha(raw()),slotBefore);g.PSFlow.running=false;
   return{id,stage,pid:process.pid,ppid:process.ppid,scope:plan.scope,loaded,loadedHash:hash(loaded),route,before,initialLive,turn,outcome,final:clone(state.read()),finalHash:hash(state.read()),installs:0,slotBefore,slotAfter:sha(raw()),slotBytesBase64:raw().toString('base64'),globalBytesBase64:fs.readFileSync(global).toString('base64'),writes:h.records(),host:h.hashes,NW:0};
  }
  const exits=[];
  for(let attempt=1;!s.finished&&attempt<=plan.maxEscapeAttempts;attempt++){
   const r=await s.run();assert(r.ok);const now=live();assert.equal(now.p1.hp,after.p1.hp);assert.deepEqual(now.p1.pp,after.p1.pp);assert.deepEqual(state.read(),before);assert.equal(installs.length,0);exits.push({attempt,messages:clone(r.messages),after:now,finished:s.finished});
  }
  assert(s.finished);assert.equal(s.ended.reason,'run');const result=s.result(),p=result.members[ID];assert.equal(p.hp,after.p1.hp);assert.equal(p.status,'');assert.equal(p.statusCount,0);for(const m of p.moves)assert.equal(m.pp,after.p1.pp[m.id]);assert.deepEqual(state.read(),before);
  const outcome=app.finishBattle(s,request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(installs.length,1);const final=clone(state.read());assert.equal(final.party[0].hp,after.p1.hp);assert.deepEqual(final.party[0].moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),p.moves);assert.equal(final.appliedBattles[battleId].hash,E.state.resultHash(result));app.finishBattle(s,request);assert.equal(installs.length,1);assert.deepEqual(state.read(),final);
  for(const[k,v]of Object.entries(before.party[0]))if(!['hp','moves'].includes(k))assert.deepEqual(final.party[0][k],v);assert.equal(final.money,before.money);assert.deepEqual(final.inventory,before.inventory);
  g.PSFlow.running=false;assert.equal(await g.DataManager.saveGame(1),0);await h.drain();assert.equal(g.PSState.lastSaveError,null);assert.equal(g.PSState.lastSave.savefileId,1);assert.equal(h.records().filter(x=>x.name==='file1').length,1);assert.equal(h.records().filter(x=>x.name==='global').length,1);
  const decoded=await g.StorageManager.loadObject('file1');assert.equal(decoded.system._psGame.encoding,'pokemon-framework-json');assert.equal(decoded.system._psGame.version,1);assert.deepEqual(JSON.parse(decoded.system._psGame.data),final);assert.deepEqual(state.read(),final);
  return{id,stage,pid:process.pid,ppid:process.ppid,scope:plan.scope,loaded,loadedHash:loaded?hash(loaded):null,route,before,initialLive,turn,exits,result,resultHash:E.state.resultHash(result),outcome,final,finalHash:hash(final),installs:1,slotBefore,slotAfter:sha(raw()),slotBytesBase64:raw().toString('base64'),globalBytesBase64:fs.readFileSync(global).toString('base64'),writes:h.records(),host:h.hashes,NW:0};
 }finally{g.PSFlow.running=false;if(!s.finished)app.abortBattle(request,Error('owned HP/PP continuation cleanup'));await h.drain();}
}
module.exports={worker,makeContent};
if(require.main===module){const[stage,id,folder,hostRoot,productRoot,file]=process.argv.slice(2);worker(stage,id,folder,hostRoot,productRoot,JSON.parse(fs.readFileSync(file))).then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(e=>{console.error(e.stack??e);process.exitCode=1;});}
