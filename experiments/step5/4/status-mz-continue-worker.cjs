'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {E,T}=require('./trainer-ai-integration/fixtures.cjs'),{createHost,sha}=require('./mz-slot-host.cjs'),{createContinueHost}=require('./continue-host.cjs'),{content,newState}=require('./status-disk-worker.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>sha(E.contentCompile.canonicalJson(v)),events=ms=>ms.flatMap(m=>m.kind==='events'?m.events:[]),ID='DISK-P1';
async function worker(stage,id,folder,hostRoot,productRoot,plan){
 assert(['producer','consumer','verify-third'].includes(stage));folder=fs.realpathSync(folder);assert.equal(path.dirname(folder),fs.realpathSync(os.tmpdir()));assert(path.basename(folder).startsWith('pf-e-mz-slot-'));
 const marker=JSON.parse(fs.readFileSync(path.join(folder,'OWNED.json')));assert.equal(marker.planVersion,plan.version);assert.equal(marker.caseId,id);const c=plan.cases.find(x=>x.id===id);assert(c);assert(stage!=='verify-third'||c.abortConsumer);
 for(const[n,h]of Object.entries(plan.engine))assert.equal(sha(fs.readFileSync(path.resolve(__dirname,'../../..',n))),h);
 const ct=content(),h=stage==='producer'?createHost(hostRoot,productRoot,folder,ct,plan.host):createContinueHost(hostRoot,productRoot,folder,ct,plan.host),g=h.context;
 const slot=path.join(folder,'file1.rmmzsave'),global=path.join(folder,'global.rmmzsave'),raw=()=>fs.readFileSync(slot),slotBefore=fs.existsSync(slot)?sha(raw()):null;let loaded=null,route=null;
 if(stage==='producer'){
  assert.equal(slotBefore,null);g.$gameSystem._psGame=newState(ct,{ppUps:0});assert.equal(g.$gameSystem._psGame.party[0].status,'');assert.equal(g.$gameSystem._psGame.party[0].moves[0].pp,40);
  g.$gameVariables._data=[null,'owned status continuation',544];g.$gameMap._mapId=5;g.$gamePlayer._x=3;g.$gamePlayer._y=4;
 }else{
  assert(slotBefore);await h.readGlobal();assert.equal(h.commands().find(x=>x.symbol==='continue').enabled,true);route=await h.continueSlot(1);assert.equal(route.outcome,'success');assert(route.loadSuccess);assert.equal(route.listActive,false);
  assert.equal(route.trace.find(x=>x.kind==='load-game-return').value,0);for(const[kind,scene]of[['goto','Scene_Map'],['game-system-after-load'],['base-terminate']])assert.equal(route.trace.filter(x=>x.kind===kind&&(!scene||x.scene===scene)).length,1);assert.equal(g.PSFlow.replacements,1);
  assert.equal(h.io.length,0);assert.equal(sha(raw()),slotBefore);loaded=clone(g.$gameSystem._psGame);assert.deepEqual(Object.keys(loaded.appliedBattles),[id+'/first']);assert.deepEqual(clone(g.$gameVariables._data),[null,'owned status continuation',544]);assert.equal(g.$gameMap._mapId,5);assert.equal(g.$gamePlayer._x,3);assert.equal(g.$gamePlayer._y,4);
 }
 const installs=[],state={read:()=>g.$gameSystem._psGame,replace:next=>{installs.push(clone(next));g.$gameSystem._psGame=next;}};
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>ct,seed:()=>[...plan.seed]}),content:()=>({content:ct}),random:()=>0,clock:()=>12345});g.PSFlow._app=app;
 const before=clone(state.read()),battleId=id+(stage==='producer'?'/first':stage==='consumer'?'/second':'/third'),foe=stage==='producer'?plan.firstFoes[c.first]:plan.nextFoe,request={battleId,seq:stage==='producer'?1:stage==='consumer'?2:3,kind:'wild',foes:[{species:foe.species,level:foe.level}],canLose:true,expGain:false};const s=await app.startBattle(request);s.take();g.PSFlow.running=true;
 const live=()=>({p1:clone(s.gw.readState('p1').find(m=>m.id===ID)),p2:clone(s.gw.readState('p2')[0])}),initialLive=live(),steps=[];assert.equal(initialLive.p1.hp,before.party[0].hp);assert.equal(initialLive.p1.status,before.party[0].status);assert.equal(initialLive.p1.statusCount,before.party[0].statusCount);assert.equal(initialLive.p1.pp.splash,before.party[0].moves[0].pp);assert(initialLive.p1.stats.spe>initialLive.p2.stats.spe);
 const unchanged=()=>{assert.deepEqual(state.read(),before);assert.equal(installs.length,0);assert.equal(h.io.length,0);if(slotBefore)assert.equal(sha(raw()),slotBefore);};
 async function act(){const b=live(),r=await s.chooseMove(1);assert(r.ok,JSON.stringify(r));const row={before:b,after:live(),messages:clone(r.messages)};steps.push(row);unchanged();return row;}
 try{
  await assert.rejects(g.DataManager.saveGame(1));unchanged();
  if(stage==='producer'){
   const row=await act(),m=row.after.p1,ev=events(row.messages);assert.equal(m.pp.splash,39);assert.equal(m.status,c.first==='toxic'?'tox':'slp');assert(ev.some(e=>e.type==='-status'&&e.args[0]==='p1a: '+ID&&e.args[1]===m.status));
   if(c.first==='toxic'){assert.equal(m.statusCount,1);assert.equal(m.hp,m.maxhp-Math.floor(m.maxhp/16));}else{assert(m.statusCount>=2&&m.statusCount<=4);assert.equal(m.hp,m.maxhp);}
  }else if(c.first==='toxic'){
   assert.equal(initialLive.p1.status,'psn');assert.equal(initialLive.p1.statusCount,0);const hp=initialLive.p1.hp,max=initialLive.p1.maxhp,pp=initialLive.p1.pp.splash;
   for(let i=1;i<=2;i++){const row=await act(),m=row.after.p1;assert.equal(m.hp,hp-i*Math.floor(max/8));assert.equal(m.status,'psn');assert.equal(m.statusCount,0);assert.equal(m.pp.splash,pp-i);assert(events(row.messages).some(e=>e.type==='-damage'&&e.args[0]==='p1a: '+ID&&e.args.includes('[from] psn')));}
  }else{
   const remaining=initialLive.p1.statusCount,pp=initialLive.p1.pp.splash;assert.equal(initialLive.p1.status,'slp');assert(remaining>=2&&remaining<=4);
   for(let i=1;i<=remaining;i++){const row=await act(),m=row.after.p1,awake=i===remaining,ev=events(row.messages);assert.equal(m.status,awake?'':'slp');assert.equal(m.statusCount,awake?0:remaining-i);assert.equal(m.hp,initialLive.p1.hp);assert.equal(m.pp.splash,pp-Number(awake));assert.equal(ev.filter(e=>e.type==='cant'&&e.args[0]==='p1a: '+ID&&e.args[1]==='slp').length,awake?0:1);assert.equal(ev.some(e=>e.type==='-curestatus'&&e.args[0]==='p1a: '+ID&&e.args[1]==='slp'),awake);}
  }
  const after=live();unchanged();
  if(stage==='consumer'&&c.abortConsumer){
   app.abortBattle(request,Error('owned status continuation cancellation'));const outcome=app.finishBattle(s,request);assert.equal(outcome.commit,'none');assert(outcome.aborted);unchanged();g.PSFlow.running=false;
   return{id,stage,pid:process.pid,ppid:process.ppid,scope:plan.scope,loaded,loadedHash:hash(loaded),route,before,initialLive,steps,after,outcome,final:clone(state.read()),finalHash:hash(state.read()),installs:0,slotBefore,slotAfter:sha(raw()),slotBytesBase64:raw().toString('base64'),globalBytesBase64:fs.readFileSync(global).toString('base64'),writes:h.records(),host:h.hashes,NW:0};
  }
  const r=await s.run();assert(r.ok,JSON.stringify(r));assert(s.finished);assert.equal(s.ended.reason,'run');const exit={messages:clone(r.messages),after:live(),finished:s.finished};for(const k of ['hp','status','statusCount','pp'])assert.deepEqual(exit.after.p1[k],after.p1[k]);unchanged();
  const result=s.result(),patch=result.members[ID],normalized=stage==='producer'?(c.first==='toxic'?'psn':'slp'):(c.first==='toxic'?'psn':'');assert.equal(patch.hp,after.p1.hp);assert.equal(patch.status,normalized);assert.equal(patch.statusCount,stage==='producer'&&c.first==='sleep'?after.p1.statusCount:0);assert.equal(patch.moves[0].pp,after.p1.pp.splash);
  const outcome=app.finishBattle(s,request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(installs.length,1);const final=clone(state.read()),m=final.party[0];for(const k of ['hp','status','statusCount'])assert.equal(m[k],patch[k]);assert.deepEqual(m.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),patch.moves);assert.equal(final.appliedBattles[battleId].hash,E.state.resultHash(result));app.finishBattle(s,request);assert.equal(installs.length,1);assert.deepEqual(state.read(),final);
  for(const[k,v]of Object.entries(before.party[0]))if(!['hp','status','statusCount','moves'].includes(k))assert.deepEqual(m[k],v);assert.equal(final.money,before.money);assert.deepEqual(final.inventory,before.inventory);
  g.PSFlow.running=false;assert.equal(await g.DataManager.saveGame(1),0);await h.drain();assert.equal(g.PSState.lastSaveError,null);assert.equal(g.PSState.lastSave.savefileId,1);assert.equal(h.records().filter(x=>x.name==='file1').length,1);assert.equal(h.records().filter(x=>x.name==='global').length,1);
  const decoded=await g.StorageManager.loadObject('file1');assert.equal(decoded.system._psGame.encoding,'pokemon-framework-json');assert.equal(decoded.system._psGame.version,1);assert.deepEqual(JSON.parse(decoded.system._psGame.data),final);
  return{id,stage,pid:process.pid,ppid:process.ppid,scope:plan.scope,loaded,loadedHash:loaded?hash(loaded):null,route,before,initialLive,steps,after,exit,result,resultHash:E.state.resultHash(result),outcome,final,finalHash:hash(final),installs:1,slotBefore,slotAfter:sha(raw()),slotBytesBase64:raw().toString('base64'),globalBytesBase64:fs.readFileSync(global).toString('base64'),writes:h.records(),host:h.hashes,NW:0};
 }catch(error){console.log('E_STATUS_MZ_FAILED_WORK '+JSON.stringify({id,stage,before,initialLive,steps,error:{name:error.name,message:error.message}}));throw error;}
 finally{g.PSFlow.running=false;if(!s.finished)app.abortBattle(request,Error('owned status continuation cleanup'));await h.drain();}
}
module.exports={worker};
if(require.main===module){const[stage,id,folder,hostRoot,productRoot,file]=process.argv.slice(2);worker(stage,id,folder,hostRoot,productRoot,JSON.parse(fs.readFileSync(file))).then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(e=>{console.error(e.stack??e);process.exitCode=1;});}
