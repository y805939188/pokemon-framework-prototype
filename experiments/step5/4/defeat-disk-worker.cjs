'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {E,inputs}=require('./trainer-ai-integration/fixtures.cjs'),{storeFor,application,stateHash}=require('./status-disk-worker.cjs');
const PLAN=require('./e-defeat-disk-contracts.json'),ROOT=path.resolve(__dirname,'../../..'),ID='DEFEAT-P1',clone=x=>JSON.parse(JSON.stringify(x));
const candidateBinding=require('../../../scripts/headless-regression-binding.cjs');
const rawHash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function supportedNode(){const[major,minor]=process.versions.node.split('.').map(Number);assert(major>22||major===22&&minor>=18,'Node >=22.18 is required; select the supported runtime explicitly');}
function content(){const data=inputs({moves:['splash'],party:1});data.trainers[0].party[0].level=100;data.trainers[0].party[0].moves=['tackle'];data.species.find(s=>s.id==='caterpie').learnset=[{level:1,move:'tackle'}];
 const compiled=E.contentCompile.compileContent(data);assert(compiled.ok,JSON.stringify(compiled.errors));const out=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(out.errors,[]);return out.content;}
function initial(c){const mon=E.memberFactory.createMember({id:ID,species:'Caterpie',level:5,abilityIndex:0},c,()=>0);assert.equal(mon.hp,PLAN.player.maxHP);mon.hp=5;mon.status='psn';mon.statusCount=0;mon.moves=[{id:'tackle',pp:7,maxpp:35,ppUps:0}];
 const game=E.state.newGame({content:c,party:[E.speciesKey.toPersistentMember(mon,c)],bag:{potion:2},money:1000});game.nextMemberOrdinal='2';return game;}
const live=s=>s.gw.readState('p1').find(m=>m.id===ID),events=r=>r.messages.flatMap(m=>m.kind==='events'?m.events:[]);
function unchanged(w,before,disk){assert.deepEqual(w.state.read(),before,'the whole persistent document stays unchanged until finish');assert.equal(rawHash(w.file),disk,'the disk slot stays unchanged during a battle');}
function assertLossSave(game,c,result){const m=game.party[0];assert.equal(m.hp,PLAN.player.maxHP);assert.equal(m.status,'');assert.equal(m.statusCount,0);assert.deepEqual(m.moves,[{id:'tackle',pp:35,maxpp:35,ppUps:0}]);assert.equal(game.money,960,'highest own level 5 x zero-badge factor 8 = 40');
 assert.equal(game.stats.trainer_battles_lost,1);assert.equal(game.stats.blacked_out_count,c.canLose?0:1);assert.equal(game.stats.battle_money_lost,40);assert.deepEqual(game.defeatedTrainers,{});assert.equal(game.appliedBattles[c.id+'/loss'].hash,E.state.resultHash(result));}
async function finish(w,s,req,before,disk){unchanged(w,before,disk);const result=clone(s.result()),count=w.installs.length,outcome=w.app.finishBattle(s,req);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.installs.length,count+1);const saved=clone(w.state.read()),bytes=rawHash(w.file);
 w.app.finishBattle(s,req);assert.equal(w.installs.length,count+1);assert.equal(rawHash(w.file),bytes,'duplicate finish does not write/deduct again');assert.deepEqual(w.store.load(),saved);return{result,resultHash:E.state.resultHash(result),outcome,saved};}
async function run(stage,id,folder){supportedNode();folder=fs.realpathSync(folder);assert.equal(path.dirname(folder),fs.realpathSync(os.tmpdir()));assert(path.basename(folder).startsWith('pf-e-defeat-disk-'));const mark=JSON.parse(fs.readFileSync(path.join(folder,'OWNED.json')));assert.equal(mark.version,PLAN.version);assert.equal(mark.id,id);
 const parentBinding=process.env.PF_HEADLESS_REGRESSION_BINDING;let candidate=null;
 if(parentBinding||mark.candidateBindingSHA256){
  assert(parentBinding&&mark.candidateBindingSHA256,'parent candidate binding is required for this owned run');
  candidate=candidateBinding.capture(ROOT,parentBinding,mark.candidateBindingSHA256);
  assert.equal(candidate.binding.showdownSHA,PLAN.showdownSHA,'fixed defeat-vector Showdown pin');
 }else{
 // Explicit historical precision mode. Neither this binding nor PLAN.runtime is rewritten.
 const binding=require('./capture-run-current-headless-runtime.json');assert.equal(binding.schema,'capture-run-current-headless-v1');assert.equal(binding.showdownSHA,PLAN.showdownSHA);assert.equal(Object.keys(binding.runtime).length,9);
 assert.equal(require('node:child_process').execFileSync('git',['rev-parse','HEAD:src'],{cwd:ROOT,encoding:'utf8'}).trim(),binding.productSrcTree,'current product source tree');
 for(const[p,h]of Object.entries(binding.runtime))assert.equal(rawHash(path.join(ROOT,p)),h,'current headless runtime '+p);
 assert.equal(fs.readFileSync(path.join(ROOT,'js/engine/showdown/SOURCE_SHA'),'utf8').trim(),binding.showdownSHA);
 assert.equal(rawHash(path.join(ROOT,'js/engine/showdown/dist/config/custom-formats.js')),binding.runtime['js/engine/build/custom-formats.cjs'],'current staged extension');
 }
 const c=PLAN.cases.find(c=>c.id===id);assert(c);const ct=content(),file=path.join(folder,'game.json');let setupSaves=0;if(stage==='producer'){assert(!fs.existsSync(file));storeFor(file,ct).save(initial(ct));setupSaves=1;}else assert(fs.existsSync(file),'consumer may only load the existing producer document');
 const w=application(file,ct),loaded=clone(w.state.read()),entrySHA=rawHash(file),before=clone(loaded);let s=null,req=null,record=null,trace=[];
 try{
  if(stage==='producer'){
   assert.deepEqual(Object.keys(before.appliedBattles),[]);req={battleId:id+'/loss',trainer:{id:'c-basic',version:1},seq:1,canLose:c.canLose,expGain:false};s=await w.app.startTrainerBattle(req);s.take();unchanged(w,before,entrySHA);
   assert.equal(live(s).hp,5);assert.equal(live(s).status,'psn');const action=await s.chooseMove(1);assert(action.ok,JSON.stringify(action));trace=clone(events(action));assert(s.finished,'real level100 foe naturally defeats the single injured level5 member');
   const result=clone(s.result());assert.equal(result.outcome.kind,'win');assert.notEqual(result.outcome.winner,'Player');assert.equal(result.members[ID].hp,0);assert.equal(result.members[ID].moves[0].pp,7,'faster foe defeats player before its selected move executes');assert.equal(live(s).hp,0);unchanged(w,before,entrySHA);
   if(c.abort){w.app.abortBattle(req,Error('owned technical cancellation after a real finished loss'));assert.equal(w.app.finishBattle(s,req).commit,'none');assert.equal(w.installs.length,0);unchanged(w,before,entrySHA);record={result,resultHash:E.state.resultHash(result),aborted:true};}
   else{record=await finish(w,s,req,before,entrySHA);assert.equal(record.outcome.code,4);assert.deepEqual(record.outcome.defeat,{moneyLost:40,healed:true});assertLossSave(w.state.read(),c,result);}
  }else{
   if(c.abort){assert.deepEqual(Object.keys(before.appliedBattles),[]);assert.equal(before.money,1000);assert.equal(before.party[0].hp,5);assert.equal(before.party[0].status,'psn');assert.equal(before.party[0].moves[0].pp,7);assert.equal(before.stats.trainer_battles_lost,0);assert.equal(before.stats.blacked_out_count,0);}
   else{assert.equal(before.money,960);assert.equal(before.party[0].hp,19);assert.equal(before.party[0].status,'');assert.equal(before.party[0].moves[0].pp,35);assert.deepEqual(Object.keys(before.appliedBattles),[id+'/loss']);}
   // The next encounter uses a separate authored weak foe. No expected state is injected between the two processes.
   req={battleId:id+'/next',kind:'wild',foes:[{species:'pidgey',level:1}],seq:2,canLose:false,expGain:false};s=await w.app.startBattle(req);s.take();assert.equal(live(s).hp,before.party[0].hp);assert.equal(live(s).pp.tackle,before.party[0].moves[0].pp);let moves=0;
   while(!s.finished){assert(moves<4,'ordinary weak encounter must finish within the frozen bound');const action=await s.chooseMove(1);assert(action.ok,JSON.stringify(action));trace.push(...clone(events(action)));moves++;unchanged(w,before,entrySHA);assert.equal(live(s).pp.tackle,before.party[0].moves[0].pp-moves);}
   assert.equal(s.ended.winner,'Player');record=await finish(w,s,req,before,entrySHA);assert.equal(record.outcome.code,1);assert.equal(w.state.read().money,before.money);assert.equal(w.state.read().stats.wild_battles_won,1);assert.equal(w.state.read().stats.trainer_battles_lost,c.abort?0:1);assert.equal(w.state.read().stats.blacked_out_count,!c.abort&&!c.canLose?1:0);record.actualMoves=moves;
  }
  assert.equal(w.app.saveBlocked,false);const final=clone(w.state.read());assert.deepEqual(final.inventory,loaded.inventory,'neither defeat nor retry consumes unrelated inventory');assert.equal(final.party[0].id,ID);assert.equal(final.party[0].moves[0].ppUps,0);assert.deepEqual(w.store.load(),final);assert(!fs.existsSync(file+'.tmp'));const raw=fs.readFileSync(file);
  if(candidate)assert.deepEqual(candidateBinding.verify(ROOT,candidate.binding),candidate.identity,'same candidate after worker');
  return{candidateIdentity:candidate?.identity??null,contentIdentity:E.contentRuntime.validatedContentIdentity(ct),id,stage,pid:process.pid,ppid:process.ppid,node:process.versions.node,setupSaves,scope:PLAN.scope,loaded,loadedSHA256:stateHash(loaded),loadedRawSHA256:entrySHA,final,finalSHA256:stateHash(final),finalRawSHA256:rawHash(file),savedBytesBase64:raw.toString('base64'),installs:w.installs,request:req,trace,record,NW:0};
 }finally{if(s&&req&&w.app.saveBlocked)w.app.abortBattle(req,Error('owned defeat-disk worker exit'));}
}
module.exports={supportedNode,content,initial,run};
if(require.main===module){const[stage,id,folder]=process.argv.slice(2);assert(['producer','consumer'].includes(stage));run(stage,id,folder).then(x=>process.stdout.write(JSON.stringify(x)+'\n')).catch(e=>{console.error(e.stack??e);process.exitCode=1;});}
