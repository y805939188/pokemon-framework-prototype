'use strict';
// Headless acceptance worker: real App/Session and real SaveStore, never MZ/NW or a player save.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),PLAN=require('./e-status-disk-contracts.json');
const ROOT=path.resolve(__dirname,'../../..'),ID='DISK-P1',clone=v=>JSON.parse(JSON.stringify(v));
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),fileHash=f=>hash(fs.readFileSync(f)),stateHash=s=>hash(E.contentCompile.canonicalJson(s));
function content(){
 const input=inputs({moves:['splash']});input.species.find(m=>m.id==='gengar').learnset=[{level:1,move:'toxic'}];
 input.species.push({id:'parasect',showdownId:'parasect',nameKey:'species.parasect',growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:[{level:1,move:'spore'}],source:'author-placeholder'});
 const c=E.contentCompile.compileContent(input);assert(c.ok,JSON.stringify(c.errors));const r=E.contentRuntime.assembleContent(c.data,E.dex.createDexLookup());assert.deepEqual(r.errors,[]);return r.content;
}
function newState(c,scenario){
 const member=E.memberFactory.createMember({id:ID,species:PLAN.player.species,level:PLAN.player.level,abilityIndex:PLAN.player.abilityIndex},c,()=>0);assert.equal(member.ability,PLAN.player.ability);
 const maxpp=PLAN.player.basePP+Math.floor(PLAN.player.basePP*scenario.ppUps/5);member.moves=[{id:'splash',pp:maxpp,maxpp,ppUps:scenario.ppUps}];
 const game=E.state.newGame({content:c,party:[E.speciesKey.toPersistentMember(member,c)],money:1000});game.nextMemberOrdinal='2';assert.equal(game.schema,PLAN.schemaVersion);return game;
}
function storeFor(file,c,hooks={}){return new E.store.SaveStore(file,hooks,E.speciesKey.speciesKeyResolver(c),c);}
function application(file,c){
 const store=storeFor(file,c),info=store.loadInfo();assert.equal(info.migrated,false);assert.equal(info.from,PLAN.schemaVersion);
 let current=info.state;const installs=[];
 const state={read:()=>current,replace:next=>{const before=fileHash(file);store.save(next);const persisted=store.load();assert.deepEqual(persisted,clone(next),'complete valid App candidate survives the production store');current=persisted;installs.push({beforeSHA256:before,afterSHA256:fileHash(file),stateSHA256:stateHash(current)});}};
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>c,seed:()=>[...PLAN.seed]}),content:()=>({content:c}),random:()=>0,clock:()=>12345});
 return{app,state,store,installs,file,active:null};
}
const events=r=>r.messages.flatMap(m=>m.kind==='events'?m.events:[]),live=b=>b.s.gw.readState('p1').find(m=>m.id===ID);
async function begin(w,c,stage,foe,seq){
 const req={battleId:c.id+'/'+stage,seq,kind:'wild',foes:[{species:foe.species.toLowerCase(),level:foe.level}],canLose:true,expGain:false};
 const before=clone(w.state.read()),diskBefore=fileHash(w.file),s=await w.app.startBattle(req);s.take();const b={req,s,before,diskBefore,initial:clone(live({s})),steps:[]};w.active=b;unchanged(w,b);return b;
}
function unchanged(w,b){assert.deepEqual(w.state.read(),b.before,'open battle keeps complete prior state');assert.equal(fileHash(w.file),b.diskBefore,'open battle never writes the save');}
async function move(w,b){const r=await b.s.chooseMove(1);assert(r.ok,JSON.stringify(r));unchanged(w,b);const row={events:clone(events(r)),member:clone(live(b))};b.steps.push(row);return row;}
async function finish(w,b){
 const prior=clone(live(b)),beforeInstalls=w.installs.length,r=await b.s.run();assert(r.ok);assert(b.s.finished);assert.equal(b.s.ended.reason,'run');unchanged(w,b);
 const result=b.s.result();assert.equal(result.members[ID].hp,prior.hp);const out=w.app.finishBattle(b.s,b.req);assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.installs.length,beforeInstalls+1);
 const saved=clone(w.state.read()),m=saved.party[0],patch=result.members[ID];for(const key of ['hp','status','statusCount'])assert.equal(m[key],patch[key]);assert.deepEqual(m.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),patch.moves);
 assert.equal(saved.appliedBattles[b.req.battleId].hash,E.state.resultHash(result));assert.equal(m.moves[0].ppUps,b.before.party[0].moves[0].ppUps);
 const bytes=fileHash(w.file);w.app.finishBattle(b.s,b.req);assert.equal(w.installs.length,beforeInstalls+1);assert.equal(fileHash(w.file),bytes,'duplicate finish cannot write twice');assert.deepEqual(w.store.load(),saved);
 b.result=clone(result);b.resultHash=E.state.resultHash(result);b.outcome=clone(out);b.saved=saved;b.s=null;w.active=null;return saved;
}
async function wake(w,b,remaining){
 assert.equal(live(b).status,'slp');assert.equal(live(b).statusCount,remaining,'fresh-process opening must not re-roll sleep');const pp=live(b).pp.splash;
 for(let i=1;i<=remaining;i++){
  const row=await move(w,b),m=row.member,awake=i===remaining;assert.equal(m.status,awake?'':'slp');assert.equal(m.statusCount,awake?0:remaining-i);assert.equal(m.pp.splash,pp-Number(awake));
  assert.equal(row.events.filter(e=>e.type==='cant'&&e.args[0].startsWith('p1a:')&&e.args[1]==='slp').length,awake?0:1);
  assert.equal(row.events.some(e=>e.type==='-curestatus'&&e.args[0].startsWith('p1a:')&&e.args[1]==='slp'),awake);
 }
}
function recorded(b){return{request:b.req,initial:b.initial,steps:b.steps,result:b.result??null,resultHash:b.resultHash??null,outcome:b.outcome??null,saved:b.saved??null};}
async function run(stage,c,folder){
 folder=fs.realpathSync(folder);const tmp=fs.realpathSync(os.tmpdir());assert(path.dirname(folder)===tmp&&path.basename(folder).startsWith('pf-e-status-disk-'),'owned temporary test directory only');
 const marker=JSON.parse(fs.readFileSync(path.join(folder,'OWNED-STATUS-DISK-TEST.json')));assert.equal(marker.version,PLAN.version);assert.equal(marker.caseId,c.id);
 for(const[n,h]of Object.entries(PLAN.runtime))assert.equal(fileHash(path.join(ROOT,n)),h,'accepted runtime '+n);
 assert.equal(fs.readFileSync(path.join(ROOT,'js/engine/showdown/SOURCE_SHA'),'utf8').trim(),PLAN.showdownSHA);
 const file=path.join(folder,'game.json'),ct=content();let setupSaves=0;
 if(stage==='produce'){assert(!fs.existsSync(file),'producer cannot replace a prior save');storeFor(file,ct).save(newState(ct,c));setupSaves=1;}else assert(fs.existsSync(file),'consumer requires a real prior disk document');
 const w=application(file,ct),loaded=clone(w.state.read()),loadedRawSHA256=fileHash(file),battles=[];let ownedRetirement=false;
 try{
  if(stage==='produce'){
   assert.deepEqual(Object.keys(loaded.appliedBattles),[]);assert.equal(loaded.party[0].status,'');
   const b=await begin(w,c,'first',PLAN.firstFoes[c.first],1);battles.push(b);const row=await move(w,b),m=live(b),maxpp=loaded.party[0].moves[0].maxpp;
   assert.equal(m.status,c.first==='toxic'?'tox':'slp');assert.equal(m.pp.splash,maxpp-1);assert(row.events.some(e=>e.type==='-status'&&e.args[0].startsWith('p1a:')&&e.args[1]===m.status));
   if(c.first==='toxic'){assert.equal(m.statusCount,1);assert.equal(m.hp,m.maxhp-Math.floor(m.maxhp/16));}else assert(Number.isInteger(m.statusCount)&&m.statusCount>=2&&m.statusCount<=4);
   assert.equal(w.app.healParty().reason,'battle-active');unchanged(w,b);const saved=await finish(w,b);assert.equal(saved.party[0].status,c.first==='toxic'?'psn':'slp');assert.equal(saved.party[0].statusCount,c.first==='toxic'?0:m.statusCount);assert.equal(w.installs.length,1);
  }else{
   assert.deepEqual(Object.keys(loaded.appliedBattles),[c.id+'/first']);
   if(c.check==='heal-and-PPUps-after-read'){
    assert.equal(w.app.healParty().status,'healed');assert.equal(w.installs.length,1);const m=w.state.read().party[0];assert.equal(m.status,'');assert.equal(m.statusCount,0);assert(m.hp>loaded.party[0].hp);assert.deepEqual(m.moves[0],{id:'splash',pp:64,maxpp:64,ppUps:3});assert.equal(w.app.healParty().status,'unchanged');assert.equal(w.installs.length,1);
   }
   const b=await begin(w,c,stage==='verify-third'?'third':'second',PLAN.nextFoe,stage==='verify-third'?3:2);battles.push(b);const current=w.state.read().party[0];
   assert.equal(live(b).hp,current.hp);assert.equal(live(b).status,current.status);assert.equal(live(b).statusCount,current.statusCount);assert.equal(live(b).pp.splash,current.moves[0].pp);
   if(c.check==='ordinary-poison-after-read'){
    const hp=live(b).hp,max=live(b).maxhp,pp=live(b).pp.splash;assert.equal(live(b).status,'psn');assert.equal(live(b).statusCount,0);
    for(let i=1;i<=2;i++){const row=await move(w,b);assert.equal(row.member.hp,hp-i*Math.floor(max/8));assert.equal(row.member.pp.splash,pp-i);assert.equal(row.member.statusCount,0);assert(row.events.some(e=>e.type==='-damage'&&e.args.includes('[from] psn')));}
   }else if(c.first==='sleep')await wake(w,b,current.statusCount);
   else{await move(w,b);assert.equal(live(b).hp,live(b).maxhp);assert.equal(live(b).pp.splash,63);}
   if(c.check==='abort-consumer-preserves-saved-first'&&stage==='consume'){
    w.app.abortBattle(b.req,Error('owned disk consumer cancellation'));ownedRetirement=true;assert.equal(w.app.finishBattle(b.s,b.req).commit,'none');unchanged(w,b);assert.equal(w.installs.length,0);b.s=null;w.active=null;assert.equal(fileHash(file),loadedRawSHA256);
   }else{await finish(w,b);assert.equal(w.installs.length,c.check==='heal-and-PPUps-after-read'?2:1);}
  }
  const final=clone(w.state.read());assert.deepEqual(w.store.load(),final);assert(!fs.existsSync(file+'.tmp'));
  return{scope:'HEADLESS_APP_SAVESTORE_NEW_NODE_NOT_MZ_CONTINUE',id:c.id,stage,pid:process.pid,ppid:process.ppid,node:process.versions.node,loaded,loadedSHA256:stateHash(loaded),loadedRawSHA256,final,finalSHA256:stateHash(final),finalRawSHA256:fileHash(file),setupSaves,installs:w.installs,battles:battles.map(recorded),ownedRetirement,saveFile:file,saveFiles:fs.readdirSync(folder).filter(n=>n.startsWith('game.json')).sort(),NW:0};
 }finally{if(w.active)w.app.abortBattle(w.active.req,Error('owned disk worker failure cleanup'));}
}
module.exports={content,newState,storeFor,application,run,stateHash};
if(require.main===module){
 const[stage,id,folder]=process.argv.slice(2);assert(['produce','consume','verify-third'].includes(stage));const c=PLAN.cases.find(c=>c.id===id);assert(c&&folder);
 run(stage,c,folder).then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{console.error(error.stack??String(error));process.exitCode=1;});
}
