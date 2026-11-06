'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),{createHost,sha}=require('./mz-slot-host.cjs'),{createContinueHost}=require('./continue-host.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>sha(E.contentCompile.canonicalJson(v)),events=ms=>ms.flatMap(m=>m.kind==='events'?m.events:[]),ID='MH-CARRY-P1';
function makeContent(plan){
 const input=inputs({moves:['tackle']});
 for(const[id,moves]of[['cloyster',plan.playerMoves],['slowbro',['tackle']]]){
  assert(!input.species.some(s=>s.id===id));input.species.push({id,showdownId:id,nameKey:'species.'+id,growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:moves.map(move=>({level:1,move})),source:'author-placeholder'});
 }
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);return joined.content;
}
function verifyUse(c,turn){
 const b=turn.before,a=turn.after,ev=events(turn.messages),alias=(text,side,id)=>text===side+'a: '+id||text===side+': '+id;
 const target=e=>alias(e.args[0],'p2',b.p2.id),actor=e=>alias(e.args[0],'p1',b.p1.id);
 assert.equal(turn.move,c.move);assert.equal(ev.filter(e=>e.type==='move'&&actor(e)).length,1);assert.equal(ev.filter(e=>e.type==='move'&&target(e)&&e.args[1]==='Tackle').length,1);
 assert.equal(a.p1.pp[c.move],b.p1.pp[c.move]-1,'one PP per complete multihit use');for(const[k,v]of Object.entries(b.p1.pp))if(k!==c.move)assert.equal(a.p1.pp[k],v);
 assert.equal(a.p2.pp.tackle,b.p2.pp.tackle-1);const hits=ev.filter(e=>e.type==='-damage'&&target(e));assert.equal(hits.length,c.hits);
 const counts=ev.filter(e=>e.type==='-hitcount');assert.equal(counts.length,1);assert(target(counts[0]));assert.equal(Number(counts[0].args[1]),hits.length);
 let hp=b.p2.hp;for(const e of hits){const m=/^(\d+)(?:\/(\d+))?(?:\s|$)/.exec(e.args[1]);assert(m);if(m[2])assert.equal(Number(m[2]),b.p2.maxhp);const next=Number(m[1]);assert(next<hp&&next>0);hp=next;}assert.equal(a.p2.hp,hp);
 const incoming=ev.filter(e=>e.type==='-damage'&&actor(e));assert.equal(incoming.length,1);assert(a.p1.hp>0&&a.p1.hp<b.p1.hp,'a real opposing Tackle makes carried HP observable');assert.equal(Number(/^(\d+)/.exec(incoming[0].args[1])[1]),a.p1.hp);assert(!ev.some(e=>e.type==='faint'));
}
async function worker(stage,id,folder,hostRoot,productRoot,plan){
 assert(['producer','consumer','verify-third'].includes(stage));folder=fs.realpathSync(folder);assert.equal(path.dirname(folder),fs.realpathSync(os.tmpdir()));assert(path.basename(folder).startsWith('pf-e-mz-slot-'));
 const marker=JSON.parse(fs.readFileSync(path.join(folder,'OWNED.json')));assert.equal(marker.planVersion,plan.version);assert.equal(marker.caseId,id);const c=plan.cases.find(x=>x.id===id);assert(c);assert(stage!=='verify-third'||c.abortConsumer);
 for(const[n,h]of Object.entries(plan.engine))assert.equal(sha(fs.readFileSync(path.resolve(__dirname,'../../..',n))),h);
 const content=makeContent(plan),h=stage==='producer'?createHost(hostRoot,productRoot,folder,content,plan.host):createContinueHost(hostRoot,productRoot,folder,content,plan.host),g=h.context;
 const slot=path.join(folder,'file1.rmmzsave'),global=path.join(folder,'global.rmmzsave'),raw=()=>fs.readFileSync(slot),slotBefore=fs.existsSync(slot)?sha(raw()):null;let loaded=null,route=null;
 if(stage==='producer'){
  assert.equal(slotBefore,null);const m=E.memberFactory.createMember({id:ID,species:'Cloyster',level:50,nature:'hardy',abilityIndex:c.abilityIndex},content,()=>0);assert.equal(m.hp,plan.playerMaxHP);assert.equal(m.ability,c.ability);
  g.$gameSystem._psGame=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(m,content)],money:1000});g.$gameSystem._psGame.nextMemberOrdinal='2';g.$gameVariables._data=[null,'owned multihit continuation',544];g.$gameMap._mapId=5;g.$gamePlayer._x=3;g.$gamePlayer._y=4;
 }else{
  assert(slotBefore);await h.readGlobal();assert.equal(h.commands().find(x=>x.symbol==='continue').enabled,true);route=await h.continueSlot(1);assert.equal(route.outcome,'success');assert(route.loadSuccess);assert.equal(route.listActive,false);
  assert.equal(route.trace.find(x=>x.kind==='load-game-return').value,0);for(const[kind,scene]of[['goto','Scene_Map'],['game-system-after-load'],['base-terminate']])assert.equal(route.trace.filter(x=>x.kind===kind&&(!scene||x.scene===scene)).length,1);assert.equal(g.PSFlow.replacements,1);
  assert.equal(h.io.length,0);assert.equal(sha(raw()),slotBefore);loaded=clone(g.$gameSystem._psGame);assert.deepEqual(Object.keys(loaded.appliedBattles),[id+'/first']);
  assert.equal(g.$gameSystem.constructor.name,'Game_System');assert.equal(g.$gameMap.constructor.name,'Game_Map');assert.equal(g.$gameVariables.constructor.name,'Game_Variables');assert.deepEqual(clone(g.$gameVariables._data),[null,'owned multihit continuation',544]);assert.equal(g.$gameMap._mapId,5);assert.equal(g.$gamePlayer._x,3);assert.equal(g.$gamePlayer._y,4);
 }
 const installs=[],state={read:()=>g.$gameSystem._psGame,replace:next=>{installs.push(clone(next));g.$gameSystem._psGame=next;}};
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});g.PSFlow._app=app;
 const before=clone(state.read()),battleId=id+(stage==='producer'?'/first':stage==='consumer'?'/second':'/third'),request={battleId,seq:stage==='producer'?1:stage==='consumer'?2:3,kind:'wild',foes:[{species:plan.foe.species,level:plan.foe.level}],canLose:true,expGain:false};const s=await app.startBattle(request);s.take();g.PSFlow.running=true;
 const live=()=>({p1:clone(s.gw.readState('p1').find(m=>m.id===ID)),p2:clone(s.gw.readState('p2')[0])}),initialLive=live();assert.equal(initialLive.p1.hp,before.party[0].hp);assert.equal(before.party[0].ability,c.ability);assert.deepEqual(initialLive.p1.pp,Object.fromEntries(before.party[0].moves.map(m=>[m.id,m.pp])));assert.equal(initialLive.p2.hp,plan.foe.maxHP);assert(initialLive.p1.stats.spe>initialLive.p2.stats.spe);
 try{
  const writes=h.io.length;await assert.rejects(g.DataManager.saveGame(1));assert.equal(h.io.length,writes);assert.deepEqual(state.read(),before);if(slotBefore)assert.equal(sha(raw()),slotBefore);
  const action=await s.chooseMove(plan.playerMoves.indexOf(c.move)+1);assert(action.ok,JSON.stringify(action));const after=live(),turn={move:c.move,before:initialLive,after,messages:clone(action.messages)};
  try{verifyUse(c,turn);}catch(error){console.log('E_MULTIHIT_MZ_FAILED_TURN '+JSON.stringify({id,stage,turn}));throw error;}
  assert.deepEqual(state.read(),before);assert.equal(installs.length,0);assert.equal(h.io.length,writes);if(slotBefore)assert.equal(sha(raw()),slotBefore);
  if(stage==='consumer'&&c.abortConsumer){
   app.abortBattle(request,Error('owned multihit continuation cancellation'));const outcome=app.finishBattle(s,request);assert.equal(outcome.commit,'none');assert(outcome.aborted);assert.equal(installs.length,0);assert.deepEqual(state.read(),before);assert.equal(h.io.length,0);assert.equal(sha(raw()),slotBefore);g.PSFlow.running=false;
   return{id,stage,pid:process.pid,ppid:process.ppid,scope:plan.scope,loaded,loadedHash:hash(loaded),route,before,initialLive,turn,outcome,final:clone(state.read()),finalHash:hash(state.read()),installs:0,slotBefore,slotAfter:sha(raw()),slotBytesBase64:raw().toString('base64'),globalBytesBase64:fs.readFileSync(global).toString('base64'),writes:h.records(),host:h.hashes,NW:0};
  }
  const r=await s.run();assert(r.ok,JSON.stringify(r));assert(s.finished);assert.equal(s.ended.reason,'run');const exit={messages:clone(r.messages),after:live(),finished:s.finished};assert.equal(exit.after.p1.hp,after.p1.hp);assert.deepEqual(exit.after.p1.pp,after.p1.pp);assert.deepEqual(state.read(),before);assert.equal(installs.length,0);
  const result=s.result(),patch=result.members[ID];assert.equal(patch.hp,after.p1.hp);assert.equal(patch.status,'');assert.equal(patch.statusCount,0);for(const m of patch.moves)assert.equal(m.pp,after.p1.pp[m.id]);
  const outcome=app.finishBattle(s,request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(installs.length,1);const final=clone(state.read());assert.equal(final.party[0].hp,after.p1.hp);assert.deepEqual(final.party[0].moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),patch.moves);assert.equal(final.appliedBattles[battleId].hash,E.state.resultHash(result));app.finishBattle(s,request);assert.equal(installs.length,1);assert.deepEqual(state.read(),final);
  for(const[k,v]of Object.entries(before.party[0]))if(!['hp','moves'].includes(k))assert.deepEqual(final.party[0][k],v);assert.equal(final.money,before.money);assert.deepEqual(final.inventory,before.inventory);
  g.PSFlow.running=false;assert.equal(await g.DataManager.saveGame(1),0);await h.drain();assert.equal(g.PSState.lastSaveError,null);assert.equal(g.PSState.lastSave.savefileId,1);assert.equal(h.records().filter(x=>x.name==='file1').length,1);assert.equal(h.records().filter(x=>x.name==='global').length,1);
  const decoded=await g.StorageManager.loadObject('file1');assert.equal(decoded.system._psGame.encoding,'pokemon-framework-json');assert.equal(decoded.system._psGame.version,1);assert.deepEqual(JSON.parse(decoded.system._psGame.data),final);assert.deepEqual(state.read(),final);
  return{id,stage,pid:process.pid,ppid:process.ppid,scope:plan.scope,loaded,loadedHash:loaded?hash(loaded):null,route,before,initialLive,turn,exit,result,resultHash:E.state.resultHash(result),outcome,final,finalHash:hash(final),installs:1,slotBefore,slotAfter:sha(raw()),slotBytesBase64:raw().toString('base64'),globalBytesBase64:fs.readFileSync(global).toString('base64'),writes:h.records(),host:h.hashes,NW:0};
 }finally{g.PSFlow.running=false;if(!s.finished)app.abortBattle(request,Error('owned multihit continuation cleanup'));await h.drain();}
}
module.exports={worker,makeContent,verifyUse};
if(require.main===module){const[stage,id,folder,hostRoot,productRoot,file]=process.argv.slice(2);worker(stage,id,folder,hostRoot,productRoot,JSON.parse(fs.readFileSync(file))).then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(e=>{console.error(e.stack??e);process.exitCode=1;});}
